// @ts-nocheck
/**
 * Tests for Issue Reporting API Routes
 *
 * Coverage:
 * - POST /api/issues - Issue report submission with validation and rate limiting
 * - Input validation (9 validation checks)
 * - Rate limiting behavior
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import issuesRoutes, { initializeIssuesRoutes } from './issues.routes.js';
import type { TaskQueueService } from '../services/taskQueue.sqlite.js';

describe('Issues Routes', () => {
  let app: express.Application;
  let db: Database.Database;
  let mockTaskQueue: TaskQueueService;

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
    `);

    // Mock task queue
    mockTaskQueue = {
      createTask: vi.fn().mockResolvedValue({ id: 'task-123' }),
      getTaskById: vi.fn(),
      updateTask: vi.fn(),
      getTasksByStatus: vi.fn(),
      getAllTasks: vi.fn(),
      deleteTask: vi.fn(),
    } as unknown as TaskQueueService;

    // Create express app with routes
    app = express();
    app.use(express.json());
    initializeIssuesRoutes(db, mockTaskQueue);
    app.use('/api/issues', issuesRoutes);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  describe('POST /api/issues - Success Cases', () => {
    it('should accept valid issue report', async () => {
      const validReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-1234567890-abc123',
        route: '/dashboard',
        userAgent: 'Mozilla/5.0 (Test Browser)',
        description: 'Button not working',
        traceId: 'trace-1234567890-def456',
      };

      const response = await request(app)
        .post('/api/issues')
        .send(validReport);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.issueId).toBeDefined();
      expect(response.body.data.message).toContain('triage');

      // Wait for async triage to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify issue was stored and triaged in database
      const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(response.body.data.issueId) as any;
      expect(issue).toBeDefined();
      expect(issue.route).toBe('/dashboard');
      // Issue should be triaged and assigned (since triage runs immediately)
      expect(issue.status).toBe('assigned');
      expect(issue.taskId).toBeDefined();
    });

    it('should accept issue without optional fields', async () => {
      const minimalReport = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-1234567890-abc123',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      const response = await request(app)
        .post('/api/issues')
        .send(minimalReport);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should accept issue with special characters in description', async () => {
      const reportWithSpecialChars = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-1234567890-abc123',
        route: '/profile',
        userAgent: 'Mozilla/5.0',
        description: 'Error: <script>alert("test")</script> & special chars éàü',
      };

      const response = await request(app)
        .post('/api/issues')
        .send(reportWithSpecialChars);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/issues - Validation: Required Fields', () => {
    it('should reject missing timestamp', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          sessionId: 'session-1234567890-abc123',
          route: '/home',
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required fields');
    });

    it('should reject missing sessionId', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          route: '/home',
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required fields');
    });

    it('should reject missing route', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required fields');
    });

    it('should reject missing userAgent', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/home',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required fields');
    });
  });

  describe('POST /api/issues - Validation: Timestamp', () => {
    it('should reject invalid timestamp format', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: 'not-a-valid-date',
          sessionId: 'session-1234567890-abc123',
          route: '/home',
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('timestamp format');
    });

    it('should reject future timestamp', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 10); // 10 minutes in future

      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: futureDate.toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/home',
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('future');
    });

    it('should accept timestamp with allowed clock skew (5 minutes)', async () => {
      const slightlyFuture = new Date();
      slightlyFuture.setMinutes(slightlyFuture.getMinutes() + 3); // 3 minutes in future

      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: slightlyFuture.toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/home',
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/issues - Validation: SessionId Format', () => {
    it('should reject invalid sessionId format', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'invalid-session-id',
          route: '/home',
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('sessionId format');
    });

    it('should accept valid sessionId format', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/home',
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/issues - Validation: Route Format', () => {
    it('should reject route not starting with /', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: 'home',
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('route format');
    });

    it('should reject route with path traversal', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/../../etc/passwd',
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('route format');
    });

    it('should reject route exceeding max length (500 chars)', async () => {
      const longRoute = '/' + 'a'.repeat(500);

      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: longRoute,
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Route too long');
    });
  });

  describe('POST /api/issues - Validation: TraceId Format', () => {
    it('should reject invalid traceId format', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/home',
          userAgent: 'Mozilla/5.0',
          traceId: 'invalid-trace',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('traceId format');
    });

    it('should accept valid traceId format', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/home',
          userAgent: 'Mozilla/5.0',
          traceId: 'trace-1234567890-abc123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/issues - Validation: Length Limits', () => {
    it('should reject description exceeding max length (5000 chars)', async () => {
      const longDescription = 'a'.repeat(5001);

      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/home',
          userAgent: 'Mozilla/5.0',
          description: longDescription,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Description too long');
    });

    it('should reject userAgent exceeding max length (1000 chars)', async () => {
      const longUserAgent = 'Mozilla/5.0 ' + 'a'.repeat(1000);

      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/home',
          userAgent: longUserAgent,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('User agent too long');
    });
  });

  describe('POST /api/issues - Rate Limiting', () => {
    it('should rate limit after 10 requests from same session', async () => {
      const report = {
        timestamp: new Date().toISOString(),
        sessionId: 'session-1234567890-ratelimit',
        route: '/home',
        userAgent: 'Mozilla/5.0',
      };

      // Send 10 requests (should all succeed)
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/api/issues')
          .send({ ...report, timestamp: new Date().toISOString() });
        expect(response.status).toBe(200);
      }

      // 11th request should be rate limited
      const response = await request(app)
        .post('/api/issues')
        .send({ ...report, timestamp: new Date().toISOString() });

      expect(response.status).toBe(429);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Too many issue reports');
    });
  });

  describe('POST /api/issues - Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      db.close();

      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/home',
          userAgent: 'Mozilla/5.0',
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to process issue report');
    });
  });

  describe('POST /api/issues - Screenshot and Meta Support', () => {
    it('should accept issue with screenshot (base64 data URL)', async () => {
      const screenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/dashboard',
          userAgent: 'Mozilla/5.0',
          description: 'UI issue with screenshot',
          screenshot,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify screenshot was stored in database
      await new Promise(resolve => setTimeout(resolve, 50));
      const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(response.body.data.issueId) as any;
      expect(issue.screenshot).toBe(screenshot);
    });

    it('should accept issue with screenshot error', async () => {
      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/home',
          userAgent: 'Mozilla/5.0',
          screenshotError: 'Permission denied: Cannot capture screen',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify screenshot error was stored
      await new Promise(resolve => setTimeout(resolve, 50));
      const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(response.body.data.issueId) as any;
      expect(issue.screenshot_error).toBe('Permission denied: Cannot capture screen');
    });

    it('should accept issue with flexible metadata (JSON)', async () => {
      const meta = {
        browserInfo: { name: 'Chrome', version: '120.0' },
        viewport: { width: 1920, height: 1080 },
        customField: 'test value',
      };

      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/profile',
          userAgent: 'Mozilla/5.0',
          meta,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify meta was stored as JSON
      await new Promise(resolve => setTimeout(resolve, 50));
      const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(response.body.data.issueId) as any;
      expect(JSON.parse(issue.meta)).toEqual(meta);
    });

    it('should accept issue with all enhanced fields', async () => {
      const screenshot = 'data:image/png;base64,ABC123DEF456';
      const meta = { theme: 'dark', language: 'en-US' };

      const response = await request(app)
        .post('/api/issues')
        .send({
          timestamp: new Date().toISOString(),
          sessionId: 'session-1234567890-abc123',
          route: '/settings',
          userAgent: 'Mozilla/5.0',
          description: 'Full feature test',
          screenshot,
          meta,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify all fields stored
      await new Promise(resolve => setTimeout(resolve, 50));
      const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(response.body.data.issueId) as any;
      expect(issue.screenshot).toBe(screenshot);
      expect(JSON.parse(issue.meta)).toEqual(meta);
      expect(issue.description).toBe('Full feature test');
    });
  });
});
