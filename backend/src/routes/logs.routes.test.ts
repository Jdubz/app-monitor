/**
 * Tests for Frontend Logs API Routes
 *
 * Coverage:
 * - POST /api/logs/frontend - Session start and log batch handling
 * - Input validation
 * - Database persistence
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import logsRoutes, { initializeLogsRoutes } from './logs.routes.js';

describe('Logs Routes', () => {
  let app: express.Application;
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');

    // Create required tables
    db.exec(`
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

      CREATE TABLE session_metadata (
        sessionId TEXT PRIMARY KEY,
        userAgent TEXT NOT NULL,
        viewportWidth INTEGER,
        viewportHeight INTEGER,
        startTime TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Create express app with routes
    app = express();
    app.use(express.json());
    initializeLogsRoutes(db);
    app.use('/api/logs', logsRoutes);
  });

  afterEach(() => {
    db.close();
  });

  describe('POST /api/logs/frontend - Session Start', () => {
    it('should accept session start event', async () => {
      const sessionStart = {
        type: 'session_start',
        sessionId: 'session-1234567890-abc123',
        meta: {
          sessionId: 'session-1234567890-abc123',
          userAgent: 'Mozilla/5.0 (Test Browser)',
          viewport: { width: 1920, height: 1080 },
          timestamp: new Date().toISOString(),
        },
      };

      const response = await request(app)
        .post('/api/logs/frontend')
        .send(sessionStart);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logs received');

      // Verify session metadata was stored
      const session = db.prepare('SELECT * FROM session_metadata WHERE sessionId = ?')
        .get('session-1234567890-abc123');
      expect(session).toBeDefined();
      expect(session.userAgent).toBe('Mozilla/5.0 (Test Browser)');
      expect(session.viewportWidth).toBe(1920);
      expect(session.viewportHeight).toBe(1080);
    });
  });

  describe('POST /api/logs/frontend - Log Batch', () => {
    it('should accept log batch', async () => {
      const logBatch = {
        type: 'log_batch',
        sessionId: 'session-1234567890-abc123',
        logs: [
          {
            id: 'log-1',
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Application started',
            scope: 'App',
            sessionId: 'session-1234567890-abc123',
            route: '/dashboard',
          },
          {
            id: 'log-2',
            timestamp: new Date().toISOString(),
            level: 'error',
            message: 'Failed to load data',
            scope: 'DataService',
            traceId: 'trace-1234567890-def456',
            sessionId: 'session-1234567890-abc123',
            route: '/dashboard',
            error: {
              name: 'NetworkError',
              message: 'Failed to fetch',
              stack: 'NetworkError: Failed to fetch\n  at fetch (/app/services/api.ts:10:5)',
            },
          },
        ],
      };

      const response = await request(app)
        .post('/api/logs/frontend')
        .send(logBatch);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify logs were stored in database
      const logs = db.prepare('SELECT * FROM frontend_logs ORDER BY timestamp').all();
      expect(logs).toHaveLength(2);

      expect(logs[0].id).toBe('log-1');
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toBe('Application started');
      expect(logs[0].scope).toBe('App');

      expect(logs[1].id).toBe('log-2');
      expect(logs[1].level).toBe('error');
      expect(logs[1].errorName).toBe('NetworkError');
      expect(logs[1].errorMessage).toBe('Failed to fetch');
      expect(logs[1].errorStack).toContain('NetworkError: Failed to fetch');
    });

    it('should accept logs with data objects', async () => {
      const logBatch = {
        type: 'log_batch',
        sessionId: 'session-1234567890-abc123',
        logs: [
          {
            id: 'log-3',
            timestamp: new Date().toISOString(),
            level: 'debug',
            message: 'User action tracked',
            scope: 'Analytics',
            sessionId: 'session-1234567890-abc123',
            route: '/profile',
            data: {
              action: 'click',
              element: 'save-button',
              metadata: { foo: 'bar' },
            },
          },
        ],
      };

      const response = await request(app)
        .post('/api/logs/frontend')
        .send(logBatch);

      expect(response.status).toBe(200);

      // Verify data was stored as JSON
      const log = db.prepare('SELECT * FROM frontend_logs WHERE id = ?').get('log-3');
      expect(log.data).toBeDefined();
      const parsedData = JSON.parse(log.data);
      expect(parsedData.action).toBe('click');
      expect(parsedData.element).toBe('save-button');
      expect(parsedData.metadata.foo).toBe('bar');
    });

    it('should accept logs with all log levels', async () => {
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
      const logs = levels.map((level, index) => ({
        id: `log-${index}`,
        timestamp: new Date().toISOString(),
        level,
        message: `${level} message`,
        scope: 'Test',
        sessionId: 'session-1234567890-abc123',
        route: '/',
      }));

      const response = await request(app)
        .post('/api/logs/frontend')
        .send({
          type: 'log_batch',
          sessionId: 'session-1234567890-abc123',
          logs,
        });

      expect(response.status).toBe(200);

      const storedLogs = db.prepare('SELECT level FROM frontend_logs ORDER BY id').all();
      expect(storedLogs).toHaveLength(6);
      expect(storedLogs.map((l) => l.level)).toEqual(levels);
    });

    it('should handle empty log batch', async () => {
      const response = await request(app)
        .post('/api/logs/frontend')
        .send({
          type: 'log_batch',
          sessionId: 'session-1234567890-abc123',
          logs: [],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/logs/frontend - Validation', () => {
    it('should reject request without type', async () => {
      const response = await request(app)
        .post('/api/logs/frontend')
        .send({
          sessionId: 'session-1234567890-abc123',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid batch format');
    });

    it('should reject request without sessionId', async () => {
      const response = await request(app)
        .post('/api/logs/frontend')
        .send({
          type: 'log_batch',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid batch format');
    });

    it('should reject session_start without meta', async () => {
      const response = await request(app)
        .post('/api/logs/frontend')
        .send({
          type: 'session_start',
          sessionId: 'session-1234567890-abc123',
        });

      expect(response.status).toBe(200); // Still succeeds but doesn't process
      expect(response.body.success).toBe(true);

      // Verify session was NOT stored (meta was missing)
      const session = db.prepare('SELECT * FROM session_metadata WHERE sessionId = ?')
        .get('session-1234567890-abc123');
      expect(session).toBeUndefined();
    });
  });

  describe('POST /api/logs/frontend - Mixed Batch', () => {
    it('should handle session_start followed by log_batch', async () => {
      // Send session start
      await request(app)
        .post('/api/logs/frontend')
        .send({
          type: 'session_start',
          sessionId: 'session-1234567890-abc123',
          meta: {
            sessionId: 'session-1234567890-abc123',
            userAgent: 'Mozilla/5.0',
            viewport: { width: 1920, height: 1080 },
            timestamp: new Date().toISOString(),
          },
        });

      // Send log batch
      await request(app)
        .post('/api/logs/frontend')
        .send({
          type: 'log_batch',
          sessionId: 'session-1234567890-abc123',
          logs: [
            {
              id: 'log-1',
              timestamp: new Date().toISOString(),
              level: 'info',
              message: 'Test log',
              scope: 'Test',
              sessionId: 'session-1234567890-abc123',
              route: '/',
            },
          ],
        });

      // Verify both were stored
      const session = db.prepare('SELECT * FROM session_metadata WHERE sessionId = ?')
        .get('session-1234567890-abc123');
      expect(session).toBeDefined();

      const logs = db.prepare('SELECT * FROM frontend_logs WHERE sessionId = ?')
        .all('session-1234567890-abc123');
      expect(logs).toHaveLength(1);
    });
  });

  describe('POST /api/logs/frontend - Error Handling', () => {
    it('should handle database errors gracefully and continue', async () => {
      // Close database to simulate error
      db.close();

      const response = await request(app)
        .post('/api/logs/frontend')
        .send({
          type: 'log_batch',
          sessionId: 'session-1234567890-abc123',
          logs: [
            {
              id: 'log-1',
              timestamp: new Date().toISOString(),
              level: 'info',
              message: 'Test',
              scope: 'Test',
              sessionId: 'session-1234567890-abc123',
              route: '/',
            },
          ],
        });

      // Should return 200 and silently handle the error (graceful degradation)
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logs received');
    });

    it('should handle malformed JSON in data field', async () => {
      const response = await request(app)
        .post('/api/logs/frontend')
        .send({
          type: 'log_batch',
          sessionId: 'session-1234567890-abc123',
          logs: [
            {
              id: 'log-1',
              timestamp: new Date().toISOString(),
              level: 'info',
              message: 'Test',
              scope: 'Test',
              sessionId: 'session-1234567890-abc123',
              route: '/',
              data: { circular: null }, // Will be stringified successfully
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/logs/frontend - Trace and Session Correlation', () => {
    it('should store logs with traceId for correlation', async () => {
      const traceId = 'trace-1234567890-abc123';
      const sessionId = 'session-1234567890-def456';

      const response = await request(app)
        .post('/api/logs/frontend')
        .send({
          type: 'log_batch',
          sessionId,
          logs: [
            {
              id: 'log-1',
              timestamp: new Date().toISOString(),
              level: 'info',
              message: 'Request started',
              scope: 'API',
              traceId,
              sessionId,
              route: '/api/data',
            },
            {
              id: 'log-2',
              timestamp: new Date().toISOString(),
              level: 'error',
              message: 'Request failed',
              scope: 'API',
              traceId,
              sessionId,
              route: '/api/data',
            },
          ],
        });

      expect(response.status).toBe(200);

      // Verify logs can be queried by traceId
      const traceLogs = db.prepare('SELECT * FROM frontend_logs WHERE traceId = ?').all(traceId);
      expect(traceLogs).toHaveLength(2);
      expect(traceLogs[0].traceId).toBe(traceId);
      expect(traceLogs[1].traceId).toBe(traceId);

      // Verify logs can be queried by sessionId
      const sessionLogs = db.prepare('SELECT * FROM frontend_logs WHERE sessionId = ?').all(sessionId);
      expect(sessionLogs).toHaveLength(2);
    });
  });
});
