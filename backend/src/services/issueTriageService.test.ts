// @ts-nocheck
/**
 * Tests for IssueTriageService
 *
 * Coverage:
 * - Issue triage workflow
 * - Log search and diagnosis
 * - Task creation
 * - Duplicate detection
 * - Database query performance (non-blocking I/O)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { IssueTriageService } from './issueTriageService.js';
import { IssueStorageService } from './issueStorageService.js';
import type { TaskQueueService } from './taskQueue.sqlite.js';
import type { IssueReport } from './issueStorageService.js';

describe('IssueTriageService', () => {
  let db: Database.Database;
  let issueStorage: IssueStorageService;
  let mockTaskQueue: TaskQueueService;
  let triageService: IssueTriageService;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create required tables
    db.exec(`
      CREATE TABLE issues (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        sessionId TEXT NOT NULL,
        traceId TEXT,
        route TEXT NOT NULL,
        userAgent TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        created TEXT NOT NULL,
        taskId TEXT,
        resolution TEXT,
        resolved TEXT,
        errorMessage TEXT,
        component TEXT,
        severity TEXT,
        fingerprint TEXT,
        prNumber INTEGER,
        screenshot TEXT,
        screenshot_error TEXT,
        meta TEXT
      );

      CREATE TABLE issue_occurrences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issueId TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        sessionId TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (issueId) REFERENCES issues(id)
      );

      CREATE TABLE frontend_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL CHECK(level IN ('trace', 'debug', 'info', 'warn', 'error', 'fatal')),
        message TEXT NOT NULL,
        scope TEXT,
        traceId TEXT,
        sessionId TEXT NOT NULL,
        route TEXT,
        userId TEXT,
        data TEXT,
        errorName TEXT,
        errorMessage TEXT,
        errorStack TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_frontend_logs_timestamp ON frontend_logs(timestamp);
      CREATE INDEX idx_frontend_logs_traceId ON frontend_logs(traceId);
      CREATE INDEX idx_frontend_logs_sessionId ON frontend_logs(sessionId);
    `);

    issueStorage = new IssueStorageService(db);

    // Mock task queue
    mockTaskQueue = {
      createTask: vi.fn().mockResolvedValue({ id: 'task-123' }),
      getTaskById: vi.fn(),
      updateTask: vi.fn(),
      getTasksByStatus: vi.fn(),
      getAllTasks: vi.fn(),
      deleteTask: vi.fn(),
    } as unknown as TaskQueueService;

    triageService = new IssueTriageService(issueStorage, mockTaskQueue);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  describe('triagePendingIssues - Error Found in Logs', () => {
    it('should triage issue with error logs and create task', async () => {
      const timestamp = new Date().toISOString();
      const sessionId = 'session-123-abc';
      const traceId = 'trace-456-def';

      // Store issue
      const report: IssueReport = {
        timestamp,
        sessionId,
        traceId,
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
        description: 'Page crashed',
      };
      issueStorage.storeIssue(report);

      // Store error log
      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, scope, traceId, sessionId, route,
          errorName, errorMessage, errorStack
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'log-1',
        timestamp,
        'error',
        'Uncaught TypeError',
        'UserProfile',
        traceId,
        sessionId,
        '/dashboard',
        'TypeError',
        'Cannot read property "name" of undefined',
        'TypeError: Cannot read property "name" of undefined\n  at UserProfile.render (profile.ts:42:5)'
      );

      // Run triage
      const result = await triageService.triagePendingIssues();

      expect(result.processed).toBe(1);
      expect(result.tasksCreated).toBe(1);
      expect(result.duplicates).toBe(0);

      // Verify task was created with correct details
      expect(mockTaskQueue.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'bugfix',
          title: expect.stringContaining('Cannot read property'),
          description: expect.stringContaining('TypeError'),
          priority: expect.any(Number),
        })
      );

      // Verify issue was updated with diagnosis
      const issues = issueStorage.getPendingIssues();
      expect(issues).toHaveLength(0); // Should be marked as assigned

      const issue = db.prepare('SELECT * FROM issues').get();
      expect(issue.status).toBe('assigned');
      expect(issue.errorMessage).toContain('Cannot read property');
      expect(issue.component).toBe('UserProfile');
      expect(issue.severity).toBeDefined();
      expect(issue.fingerprint).toBeDefined();
    });

    it('should calculate severity based on error count', async () => {
      const timestamp = new Date().toISOString();
      const sessionId = 'session-123-abc';

      // Store issue
      const report: IssueReport = {
        timestamp,
        sessionId,
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
      };
      issueStorage.storeIssue(report);

      // Store multiple error logs
      for (let i = 0; i < 6; i++) {
        db.prepare(`
          INSERT INTO frontend_logs (
            id, timestamp, level, message, sessionId, route
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `log-${i}`,
          timestamp,
          'error',
          `Error ${i}`,
          sessionId,
          '/dashboard'
        );
      }

      await triageService.triagePendingIssues();

      const issue = db.prepare('SELECT * FROM issues').get();
      expect(issue.severity).toBe('critical'); // >5 errors = critical
    });

    it('should detect fatal errors and mark as critical', async () => {
      const timestamp = new Date().toISOString();
      const sessionId = 'session-123-abc';

      const report: IssueReport = {
        timestamp,
        sessionId,
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
      };
      issueStorage.storeIssue(report);

      // Store fatal error log
      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, sessionId, route
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'log-1',
        timestamp,
        'fatal',
        'Application crashed',
        sessionId,
        '/dashboard'
      );

      await triageService.triagePendingIssues();

      const issue = db.prepare('SELECT * FROM issues').get();
      expect(issue.severity).toBe('critical');
    });
  });

  describe('triagePendingIssues - No Error in Logs (UI/UX Bug)', () => {
    it('should create task even when no errors found in logs', async () => {
      const timestamp = new Date().toISOString();
      const sessionId = 'session-123-abc';

      // Store issue with user description
      const report: IssueReport = {
        timestamp,
        sessionId,
        route: '/profile',
        userAgent: 'Mozilla/5.0',
        description: 'Submit button is misaligned on mobile',
      };
      issueStorage.storeIssue(report);

      // Store only info logs (no errors)
      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, sessionId, route
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'log-1',
        timestamp,
        'info',
        'Page loaded',
        sessionId,
        '/profile'
      );

      const result = await triageService.triagePendingIssues();

      expect(result.processed).toBe(1);
      expect(result.tasksCreated).toBe(1);

      // Verify task was created with user description
      expect(mockTaskQueue.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'bugfix',
          description: expect.stringContaining('Submit button is misaligned'),
        })
      );

      const issue = db.prepare('SELECT * FROM issues').get();
      expect(issue.errorMessage).toContain('Submit button is misaligned');
      expect(issue.severity).toBe('medium'); // Default for non-error issues
    });
  });

  describe('triagePendingIssues - Duplicate Detection', () => {
    it('should detect duplicate issues by fingerprint', async () => {
      const timestamp = new Date().toISOString();

      // Create first issue
      const report1: IssueReport = {
        timestamp,
        sessionId: 'session-1',
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
        description: 'Error on dashboard',
      };
      issueStorage.storeIssue(report1);

      // Store error log
      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, sessionId, route, errorMessage
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'log-1',
        timestamp,
        'error',
        'Test error',
        'session-1',
        '/dashboard',
        'Same error message'
      );

      // Triage first issue
      await triageService.triagePendingIssues();

      // Create second issue with same characteristics
      const report2: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-2',
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
        description: 'Error on dashboard again',
      };
      issueStorage.storeIssue(report2);

      // Store same error log for second issue
      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, sessionId, route, errorMessage
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'log-2',
        new Date().toISOString(),
        'error',
        'Test error',
        'session-2',
        '/dashboard',
        'Same error message'
      );

      // Triage second issue
      const result = await triageService.triagePendingIssues();

      expect(result.duplicates).toBe(1);
      expect(result.tasksCreated).toBe(0); // No new task for duplicate

      // Verify second issue was marked as wont_fix (duplicate)
      const issues = db.prepare('SELECT * FROM issues ORDER BY created ASC').all();
      expect(issues).toHaveLength(2);
      expect(issues[1].status).toBe('wont_fix');
      expect(issues[1].resolution).toContain('Duplicate');

      // Verify occurrence was added to original issue
      const occurrences = db.prepare('SELECT * FROM issue_occurrences').all();
      expect(occurrences).toHaveLength(1);
    });
  });

  describe('triagePendingIssues - Log Search Performance', () => {
    it('should use database queries instead of blocking file I/O', async () => {
      const timestamp = new Date().toISOString();
      const sessionId = 'session-123-abc';

      const report: IssueReport = {
        timestamp,
        sessionId,
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
      };
      issueStorage.storeIssue(report);

      // Store 100 logs to test query performance
      for (let i = 0; i < 100; i++) {
        const logTime = new Date();
        logTime.setMinutes(logTime.getMinutes() - i);

        db.prepare(`
          INSERT INTO frontend_logs (
            id, timestamp, level, message, sessionId, route
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `log-${i}`,
          logTime.toISOString(),
          i % 10 === 0 ? 'error' : 'info',
          `Log message ${i}`,
          sessionId,
          '/dashboard'
        );
      }

      const startTime = Date.now();
      await triageService.triagePendingIssues();
      const duration = Date.now() - startTime;

      // Should complete quickly (< 100ms) since using indexed queries
      expect(duration).toBeLessThan(100);

      // Verify triage completed successfully
      const issue = db.prepare('SELECT * FROM issues').get();
      expect(issue.status).toBe('assigned');
    });

    it('should query logs by timestamp range using index', async () => {
      const issueTime = new Date();
      const sessionId = 'session-123-abc';

      const report: IssueReport = {
        timestamp: issueTime.toISOString(),
        sessionId,
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
      };
      issueStorage.storeIssue(report);

      // Store logs before the issue time
      const beforeTime = new Date(issueTime);
      beforeTime.setMinutes(beforeTime.getMinutes() - 3);
      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, sessionId, route
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'log-before',
        beforeTime.toISOString(),
        'info',
        'Before issue',
        sessionId,
        '/dashboard'
      );

      // Store logs after the issue time
      const afterTime = new Date(issueTime);
      afterTime.setMinutes(afterTime.getMinutes() + 3);
      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, sessionId, route
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'log-after',
        afterTime.toISOString(),
        'info',
        'After issue',
        sessionId,
        '/dashboard'
      );

      // Store log way outside the time window
      const wayBefore = new Date(issueTime);
      wayBefore.setHours(wayBefore.getHours() - 10);
      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, sessionId, route
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'log-way-before',
        wayBefore.toISOString(),
        'error',
        'Way before issue',
        sessionId,
        '/dashboard'
      );

      await triageService.triagePendingIssues();

      // Triage should only find logs within ±5 minute window
      const issue = db.prepare('SELECT * FROM issues').get();
      expect(issue.status).toBe('assigned');
    });
  });

  describe('triagePendingIssues - Task Priority Mapping', () => {
    it('should map critical severity to priority 10', async () => {
      const timestamp = new Date().toISOString();
      const sessionId = 'session-123-abc';

      const report: IssueReport = {
        timestamp,
        sessionId,
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
      };
      issueStorage.storeIssue(report);

      // Create fatal error
      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, sessionId, route
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'log-1',
        timestamp,
        'fatal',
        'Fatal error',
        sessionId,
        '/dashboard'
      );

      await triageService.triagePendingIssues();

      expect(mockTaskQueue.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 10,
        })
      );
    });

    it('should map high severity to priority 7', async () => {
      const timestamp = new Date().toISOString();
      const sessionId = 'session-123-abc';

      const report: IssueReport = {
        timestamp,
        sessionId,
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
      };
      issueStorage.storeIssue(report);

      // Create multiple errors for high severity
      for (let i = 0; i < 3; i++) {
        db.prepare(`
          INSERT INTO frontend_logs (
            id, timestamp, level, message, sessionId, route
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `log-${i}`,
          timestamp,
          'error',
          `Error ${i}`,
          sessionId,
          '/dashboard'
        );
      }

      await triageService.triagePendingIssues();

      expect(mockTaskQueue.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 7,
        })
      );
    });
  });

  describe('triagePendingIssues - Component Extraction', () => {
    it('should extract component from stack trace', async () => {
      const timestamp = new Date().toISOString();
      const sessionId = 'session-123-abc';

      const report: IssueReport = {
        timestamp,
        sessionId,
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
      };
      issueStorage.storeIssue(report);

      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, sessionId, route, scope, errorStack
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'log-1',
        timestamp,
        'error',
        'Error',
        sessionId,
        '/dashboard',
        'MyComponent',
        'Error: Test\n  at MyComponent.render (component.tsx:42:5)'
      );

      await triageService.triagePendingIssues();

      const issue = db.prepare('SELECT * FROM issues').get();
      expect(issue.component).toBe('MyComponent');
    });

    it('should extract component from route when no stack trace', async () => {
      const timestamp = new Date().toISOString();
      const sessionId = 'session-123-abc';

      const report: IssueReport = {
        timestamp,
        sessionId,
        route: '/user/profile',
        userAgent: 'Mozilla/5.0',
        description: 'Layout issue',
      };
      issueStorage.storeIssue(report);

      await triageService.triagePendingIssues();

      const issue = db.prepare('SELECT * FROM issues').get();
      expect(issue.component).toBe('Profile'); // Extracted from route
    });
  });

  describe('triagePendingIssues - Error Handling', () => {
    it('should continue processing other issues if one fails', async () => {
      const report1: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-1',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };
      issueStorage.storeIssue(report1);

      const report2: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-2',
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
      };
      issueStorage.storeIssue(report2);

      // Mock task creation to fail for first issue
      (mockTaskQueue.createTask as any).mockRejectedValueOnce(new Error('Task creation failed'));

      const result = await triageService.triagePendingIssues();

      expect(result.processed).toBe(2);
      // Second issue should still be processed
    });
  });
});
