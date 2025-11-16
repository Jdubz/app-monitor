/**
 * Tests for IssueStorageService
 *
 * Coverage:
 * - Issue storage and retrieval
 * - Status updates
 * - Diagnosis information
 * - Duplicate detection
 * - Occurrence tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { IssueStorageService } from './issueStorageService.js';
import type { IssueReport } from './issueStorageService.js';

describe('IssueStorageService', () => {
  let db: Database.Database;
  let service: IssueStorageService;

  beforeEach(() => {
    // Create in-memory database for testing
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
    `);

    service = new IssueStorageService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('storeIssue', () => {
    it('should store issue with all fields', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123-abc',
        traceId: 'trace-456-def',
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
        description: 'Button not working',
      };

      const issue = service.storeIssue(report);

      expect(issue.id).toBeDefined();
      expect(issue.id).toMatch(/^issue-\d+-[a-f0-9]+$/);
      expect(issue.timestamp).toBe(report.timestamp);
      expect(issue.sessionId).toBe(report.sessionId);
      expect(issue.traceId).toBe(report.traceId);
      expect(issue.route).toBe(report.route);
      expect(issue.userAgent).toBe(report.userAgent);
      expect(issue.description).toBe(report.description);
      expect(issue.status).toBe('pending');
      expect(issue.created).toBeDefined();

      // Verify it was actually stored in database
      const stored = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
      expect(stored).toBeDefined();
      expect(stored.route).toBe('/dashboard');
    });

    it('should store issue without optional fields', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123-abc',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);

      expect(issue.id).toBeDefined();
      expect(issue.traceId).toBeUndefined();
      expect(issue.description).toBeUndefined();
      expect(issue.status).toBe('pending');
    });

    it('should generate unique issue IDs', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123-abc',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue1 = service.storeIssue(report);
      const issue2 = service.storeIssue(report);

      expect(issue1.id).not.toBe(issue2.id);
    });
  });

  describe('updateIssueStatus', () => {
    it('should update issue status to triaged', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123-abc',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.updateIssueStatus(issue.id, 'triaged');

      const updated = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
      expect(updated.status).toBe('triaged');
    });

    it('should update issue status to assigned with taskId', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123-abc',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.updateIssueStatus(issue.id, 'assigned', 'task-789-xyz');

      const updated = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
      expect(updated.status).toBe('assigned');
      expect(updated.taskId).toBe('task-789-xyz');
    });

    it('should update issue status to resolved with resolution', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123-abc',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.updateIssueStatus(issue.id, 'resolved', undefined, 'Fixed in PR #123');

      const updated = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
      expect(updated.status).toBe('resolved');
      expect(updated.resolution).toBe('Fixed in PR #123');
      expect(updated.resolved).toBeDefined();
    });

    it('should update issue status to wont_fix', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123-abc',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.updateIssueStatus(issue.id, 'wont_fix', undefined, 'Duplicate of issue-111');

      const updated = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
      expect(updated.status).toBe('wont_fix');
      expect(updated.resolution).toBe('Duplicate of issue-111');
    });
  });

  describe('addDiagnosis', () => {
    it('should add complete diagnosis information', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123-abc',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.addDiagnosis(issue.id, {
        errorMessage: 'TypeError: Cannot read property',
        component: 'UserProfile',
        severity: 'high',
        fingerprint: 'abc123def456',
      });

      const updated = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
      expect(updated.errorMessage).toBe('TypeError: Cannot read property');
      expect(updated.component).toBe('UserProfile');
      expect(updated.severity).toBe('high');
      expect(updated.fingerprint).toBe('abc123def456');
    });

    it('should add partial diagnosis information', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123-abc',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.addDiagnosis(issue.id, {
        component: 'HomePage',
        severity: 'medium',
      });

      const updated = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
      expect(updated.component).toBe('HomePage');
      expect(updated.severity).toBe('medium');
      expect(updated.errorMessage).toBeNull();
      expect(updated.fingerprint).toBeNull();
    });
  });

  describe('getPendingIssues', () => {
    it('should return all pending issues', () => {
      // Create some issues with different statuses
      const report1: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-1',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };
      const issue1 = service.storeIssue(report1);

      const report2: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-2',
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
      };
      const issue2 = service.storeIssue(report2);

      const report3: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-3',
        route: '/profile',
        userAgent: 'Mozilla/5.0',
      };
      const issue3 = service.storeIssue(report3);

      // Update one to triaged
      service.updateIssueStatus(issue2.id, 'triaged');

      // Get pending issues
      const pending = service.getPendingIssues();

      expect(pending).toHaveLength(2);
      expect(pending.map((i) => i.id)).toContain(issue1.id);
      expect(pending.map((i) => i.id)).toContain(issue3.id);
      expect(pending.map((i) => i.id)).not.toContain(issue2.id);
    });

    it('should return issues in creation order', () => {
      const report1: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-1',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };
      const issue1 = service.storeIssue(report1);

      // Small delay to ensure different created timestamps
      const report2: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-2',
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
      };
      const issue2 = service.storeIssue(report2);

      const pending = service.getPendingIssues();

      expect(pending[0].id).toBe(issue1.id);
      expect(pending[1].id).toBe(issue2.id);
    });

    it('should return empty array when no pending issues', () => {
      const pending = service.getPendingIssues();
      expect(pending).toEqual([]);
    });
  });

  describe('findDuplicate', () => {
    it('should find duplicate by fingerprint within 24 hours', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.addDiagnosis(issue.id, {
        fingerprint: 'duplicate-fingerprint-123',
        severity: 'high',
      });

      const duplicate = service.findDuplicate('duplicate-fingerprint-123');

      expect(duplicate).toBeDefined();
      expect(duplicate!.id).toBe(issue.id);
      expect(duplicate!.status).toBe('pending');
    });

    it('should not find duplicate with different fingerprint', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.addDiagnosis(issue.id, {
        fingerprint: 'fingerprint-abc',
        severity: 'high',
      });

      const duplicate = service.findDuplicate('fingerprint-xyz');

      expect(duplicate).toBeUndefined();
    });

    it('should not find duplicate with resolved status', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.addDiagnosis(issue.id, {
        fingerprint: 'fingerprint-resolved',
        severity: 'high',
      });
      service.updateIssueStatus(issue.id, 'resolved');

      const duplicate = service.findDuplicate('fingerprint-resolved');

      expect(duplicate).toBeUndefined();
    });

    it('should not find duplicate older than 24 hours', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.addDiagnosis(issue.id, {
        fingerprint: 'old-fingerprint',
        severity: 'high',
      });

      // Manually update created timestamp to be 25 hours ago
      const oldTimestamp = new Date();
      oldTimestamp.setHours(oldTimestamp.getHours() - 25);
      db.prepare('UPDATE issues SET created = ? WHERE id = ?').run(
        oldTimestamp.toISOString(),
        issue.id
      );

      const duplicate = service.findDuplicate('old-fingerprint');

      expect(duplicate).toBeUndefined();
    });
  });

  describe('addOccurrence', () => {
    it('should add occurrence to existing issue', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.addOccurrence(issue.id, new Date().toISOString(), 'session-456');

      const occurrences = db.prepare('SELECT * FROM issue_occurrences WHERE issueId = ?').all(issue.id);
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].issueId).toBe(issue.id);
      expect(occurrences[0].sessionId).toBe('session-456');
    });

    it('should add multiple occurrences to same issue', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const issue = service.storeIssue(report);
      service.addOccurrence(issue.id, new Date().toISOString(), 'session-456');
      service.addOccurrence(issue.id, new Date().toISOString(), 'session-789');

      const occurrences = db.prepare('SELECT * FROM issue_occurrences WHERE issueId = ?').all(issue.id);
      expect(occurrences).toHaveLength(2);
      expect(occurrences[0].sessionId).toBe('session-456');
      expect(occurrences[1].sessionId).toBe('session-789');
    });
  });

  describe('getIssueById', () => {
    it('should retrieve issue by ID', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
        description: 'Test issue',
      };

      const stored = service.storeIssue(report);
      const retrieved = service.getIssueById(stored.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(stored.id);
      expect(retrieved!.description).toBe('Test issue');
      expect(retrieved!.route).toBe('/home');
    });

    it('should return undefined for non-existent ID', () => {
      const retrieved = service.getIssueById('non-existent-id');
      expect(retrieved).toBeUndefined();
    });

    it('should retrieve issue with all diagnosis fields', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const stored = service.storeIssue(report);
      service.addDiagnosis(stored.id, {
        errorMessage: 'Test error',
        component: 'TestComponent',
        severity: 'critical',
        fingerprint: 'abc123',
      });

      const retrieved = service.getIssueById(stored.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.errorMessage).toBe('Test error');
      expect(retrieved!.component).toBe('TestComponent');
      expect(retrieved!.severity).toBe('critical');
      expect(retrieved!.fingerprint).toBe('abc123');
    });
  });

  describe('Screenshot and Meta Storage', () => {
    it('should store issue with screenshot (base64 data URL)', () => {
      const screenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
        screenshot,
      };

      const issue = service.storeIssue(report);

      expect(issue.screenshot).toBe(screenshot);

      // Verify stored in database
      const stored = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
      expect(stored.screenshot).toBe(screenshot);
    });

    it('should store issue with screenshot error message', () => {
      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
        screenshotError: 'Failed to capture: Permission denied',
      };

      const issue = service.storeIssue(report);

      expect(issue.screenshotError).toBe('Failed to capture: Permission denied');

      const stored = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
      expect(stored.screenshot_error).toBe('Failed to capture: Permission denied');
    });

    it('should store issue with flexible metadata (JSON)', () => {
      const meta = {
        browserInfo: { name: 'Chrome', version: '120.0' },
        screenSize: { width: 1920, height: 1080 },
        customField: 'custom value',
      };

      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
        meta,
      };

      const issue = service.storeIssue(report);

      expect(issue.meta).toEqual(meta);

      // Verify stored as JSON string
      const stored = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
      expect(JSON.parse(stored.meta)).toEqual(meta);
    });

    it('should store issue with all enhanced fields', () => {
      const screenshot = 'data:image/png;base64,ABC123';
      const meta = { viewport: '1920x1080', theme: 'dark' };

      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/dashboard',
        userAgent: 'Mozilla/5.0',
        description: 'Button not working',
        screenshot,
        meta,
      };

      const issue = service.storeIssue(report);

      expect(issue.screenshot).toBe(screenshot);
      expect(issue.meta).toEqual(meta);
      expect(issue.description).toBe('Button not working');

      // Verify retrieval includes all fields
      const retrieved = service.getIssueById(issue.id);
      expect(retrieved!.screenshot).toBe(screenshot);
    });

    it('should handle large screenshots (size validation)', () => {
      // Create a large base64 screenshot (simulate 1MB)
      const largeScreenshot = 'data:image/png;base64,' + 'A'.repeat(1000000);

      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
        screenshot: largeScreenshot,
      };

      const issue = service.storeIssue(report);

      expect(issue.screenshot).toBe(largeScreenshot);
      expect(issue.screenshot!.length).toBeGreaterThan(1000000);
    });

    it('should retrieve issue with screenshot via getIssueById', () => {
      const screenshot = 'data:image/png;base64,TESTDATA123';

      const report: IssueReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
        screenshot,
      };

      const stored = service.storeIssue(report);
      const retrieved = service.getIssueById(stored.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.screenshot).toBe(screenshot);
    });
  });
});
