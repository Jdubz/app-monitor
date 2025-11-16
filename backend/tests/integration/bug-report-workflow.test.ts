/**
 * Integration Tests for Bug Report Workflow
 *
 * Coverage:
 * - End-to-end issue reporting flow
 * - Screenshot storage and retrieval
 * - Issue triage with screenshots
 * - Task creation from bug reports
 * - Database persistence validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { IssueStorageService } from '../../src/services/issueStorageService.js';
import { IssueTriageService } from '../../src/services/issueTriageService.js';
import type { IssueReport } from '../../src/services/issueStorageService.js';
import type { TaskQueueService } from '../../src/services/taskQueue.sqlite.js';

describe('Bug Report Workflow Integration', () => {
  let db: Database.Database;
  let issueStorage: IssueStorageService;
  let triageService: IssueTriageService;
  let mockTaskQueue: TaskQueueService;
  let createdTasks: any[];

  beforeEach(() => {
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
        level TEXT NOT NULL,
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
    createdTasks = [];
    mockTaskQueue = {
      createTask: async (task: any) => {
        const newTask = { id: `task-${Date.now()}`, ...task };
        createdTasks.push(newTask);
        return newTask;
      },
      getTaskById: async () => null,
      updateTask: async () => {},
      getTasksByStatus: async () => [],
      getAllTasks: async () => [],
      deleteTask: async () => {},
    } as unknown as TaskQueueService;

    triageService = new IssueTriageService(issueStorage, mockTaskQueue);
  });

  afterEach(() => {
    db.close();
    createdTasks = [];
  });

  describe('Complete Bug Report Flow with Screenshot', () => {
    it('should store issue, triage it, and create task with screenshot reference', async () => {
      const screenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const meta = {
        viewport: { width: 1920, height: 1080 },
        browser: 'Chrome 120.0',
      };

      // Step 1: Store bug report with screenshot
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-test-123',
        traceId: 'trace-test-456',
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
        description: 'Button is not clickable on the dashboard',
        screenshot,
        meta,
      };

      const storedIssue = issueStorage.storeIssue(report);

      expect(storedIssue.id).toBeDefined();
      expect(storedIssue.screenshot).toBe(screenshot);
      expect(storedIssue.meta).toEqual(meta);
      expect(storedIssue.status).toBe('pending');

      // Step 2: Triage the issue
      const triageResult = await triageService.triagePendingIssues();

      expect(triageResult.processed).toBe(1);
      expect(triageResult.tasksCreated).toBe(1);
      expect(triageResult.duplicates).toBe(0);

      // Step 3: Verify task was created
      expect(createdTasks).toHaveLength(1);
      const task = createdTasks[0];

      expect(task.type).toBe('bugfix');
      expect(task.description).toContain('Button is not clickable');
      expect(task.description).toContain('SELECT id, description, screenshot');
      expect(task.description).toContain('Screenshot: Attached');

      // Step 4: Verify issue was updated
      const updatedIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(storedIssue.id);

      expect(updatedIssue.status).toBe('assigned');
      expect(updatedIssue.taskId).toBe(task.id);
      expect(updatedIssue.screenshot).toBe(screenshot);
      expect(JSON.parse(updatedIssue.meta)).toEqual(meta);
    });

    it('should handle issue with screenshot error gracefully', async () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-test-789',
        route: '/settings',
        userAgent: 'Mozilla/5.0',
        description: 'Settings page crashes',
        screenshotError: 'Permission denied: Cannot access canvas',
      };

      const storedIssue = issueStorage.storeIssue(report);

      expect(storedIssue.screenshotError).toBe('Permission denied: Cannot access canvas');
      expect(storedIssue.screenshot).toBeUndefined();

      // Triage should still work
      const triageResult = await triageService.triagePendingIssues();

      expect(triageResult.processed).toBe(1);
      expect(triageResult.tasksCreated).toBe(1);

      // Task should mention screenshot error
      expect(createdTasks).toHaveLength(1);
      expect(createdTasks[0].description).toContain('Settings page crashes');
    });
  });

  describe('Screenshot Size and Format Validation', () => {
    it('should handle large screenshots (1MB+)', async () => {
      const largeScreenshot = 'data:image/png;base64,' + 'A'.repeat(1500000); // 1.5MB

      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-large-screenshot',
        route: '/home',
        userAgent: 'Mozilla/5.0',
        screenshot: largeScreenshot,
      };

      const storedIssue = issueStorage.storeIssue(report);

      expect(storedIssue.screenshot).toBe(largeScreenshot);
      expect(storedIssue.screenshot!.length).toBeGreaterThan(1500000);

      // Retrieve from database
      const retrieved = issueStorage.getIssueById(storedIssue.id);

      expect(retrieved!.screenshot).toBe(largeScreenshot);
      expect(retrieved!.screenshot!.length).toBeGreaterThan(1500000);
    });

    it('should store different image formats', async () => {
      const jpegScreenshot = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA/9k=';

      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-jpeg',
        route: '/profile',
        userAgent: 'Mozilla/5.0',
        screenshot: jpegScreenshot,
      };

      const storedIssue = issueStorage.storeIssue(report);

      expect(storedIssue.screenshot).toBe(jpegScreenshot);
      expect(storedIssue.screenshot).toContain('data:image/jpeg');
    });
  });

  describe('Metadata Flexibility', () => {
    it('should store complex nested metadata', async () => {
      const complexMeta = {
        userInfo: {
          id: 'user-123',
          role: 'admin',
          preferences: {
            theme: 'dark',
            language: 'en-US',
          },
        },
        deviceInfo: {
          platform: 'Windows',
          screenSize: { width: 3840, height: 2160 },
          touchEnabled: false,
        },
        performanceMetrics: {
          loadTime: 1234,
          renderTime: 456,
        },
        customFields: ['field1', 'field2', 'field3'],
      };

      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-complex-meta',
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
        meta: complexMeta,
      };

      const storedIssue = issueStorage.storeIssue(report);

      expect(storedIssue.meta).toEqual(complexMeta);

      // Verify stored in database as JSON
      const dbIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(storedIssue.id);

      expect(JSON.parse(dbIssue.meta)).toEqual(complexMeta);

      // Verify retrieval
      const retrieved = issueStorage.getIssueById(storedIssue.id);

      expect(retrieved!.meta).toEqual(complexMeta);
    });
  });

  describe('Duplicate Detection with Screenshots', () => {
    it('should detect duplicates even with different screenshots', async () => {
      const timestamp = new Date().toISOString();

      // First issue with screenshot A
      const report1: IssueReport = {
        timestamp,
        sessionId: 'session-1',
        route: '/home',
        userAgent: 'Mozilla/5.0',
        description: 'Button error',
        screenshot: 'data:image/png;base64,ABC123',
      };

      // Store error log for fingerprint matching
      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, sessionId, route, errorMessage
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('log-1', timestamp, 'error', 'Test error', 'session-1', '/home', 'Same error');

      issueStorage.storeIssue(report1);
      await triageService.triagePendingIssues();

      // Second issue with different screenshot B
      const report2: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-2',
        route: '/home',
        userAgent: 'Mozilla/5.0',
        description: 'Button error again',
        screenshot: 'data:image/png;base64,XYZ789', // Different screenshot
      };

      db.prepare(`
        INSERT INTO frontend_logs (
          id, timestamp, level, message, sessionId, route, errorMessage
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('log-2', new Date().toISOString(), 'error', 'Test error', 'session-2', '/home', 'Same error');

      issueStorage.storeIssue(report2);
      const result = await triageService.triagePendingIssues();

      // Should detect as duplicate despite different screenshots
      expect(result.duplicates).toBe(1);

      // Only one task should exist
      expect(createdTasks).toHaveLength(1);
    });
  });

  describe('Task Description Generation', () => {
    it('should include screenshot query in task description', async () => {
      const screenshot = 'data:image/png;base64,TEST123';

      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-query-test',
        route: '/profile',
        userAgent: 'Mozilla/5.0',
        description: 'Profile page issue',
        screenshot,
      };

      const issue = issueStorage.storeIssue(report);
      await triageService.triagePendingIssues();

      expect(createdTasks).toHaveLength(1);

      const taskDescription = createdTasks[0].description;

      // Should contain SQL query for screenshot
      expect(taskDescription).toContain('SELECT id, description, screenshot, screenshot_error, meta');
      expect(taskDescription).toContain(`FROM issues WHERE id = '${issue.id}'`);

      // Should mention screenshot availability
      expect(taskDescription).toContain('Screenshot: Attached (see database)');
    });
  });
});
