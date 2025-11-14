/**
 * Unit Tests for API Routes Index
 *
 * Tests the main API router endpoints including the health check endpoint.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Application } from 'express';
import request from 'supertest';
import { logger } from '../utils/logger.js';
import { createApiRouter } from './index.js';
import type { ProcessManager } from '../services/processManager.js';
import type { CloudLogging } from '../services/cloudLogging.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('API Routes Index', () => {
  let app: Application;
  let processManager: ProcessManager;
  let cloudLogging: CloudLogging;

  const createProcessManagerStub = (): ProcessManager =>
    ({
      getAllStatuses: vi.fn().mockResolvedValue([]),
      getServiceStatus: vi.fn().mockResolvedValue({ status: 'stopped' }),
      startService: vi.fn().mockResolvedValue({ status: 'running' }),
      stopService: vi.fn().mockResolvedValue({ status: 'stopped' }),
      killService: vi.fn().mockResolvedValue({ status: 'killed' }),
      restartService: vi.fn().mockResolvedValue({ status: 'running' }),
    } as unknown as ProcessManager);

  const createCloudLoggingStub = (): CloudLogging =>
    ({
      getEnvironments: vi.fn().mockReturnValue(['development', 'staging', 'production']),
      getServicesForEnvironment: vi.fn().mockReturnValue([]),
    } as unknown as CloudLogging);

  beforeEach(() => {
    processManager = createProcessManagerStub();
    cloudLogging = createCloudLoggingStub();
    vi.mocked(logger.debug).mockClear();

    // Create Express app with API router
    app = express();
    app.use(express.json());

    const apiRouter = createApiRouter({
      processManager,
      cloudLogging,
      // Dev-Bots routes are heavy and not required for health endpoint tests
      devBotsManager: undefined,
    });

    app.use('/api', apiRouter);
  });

  describe('GET /api/health', () => {
    it('should return 200 status code', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
    });

    it('should return JSON content type', async () => {
      const response = await request(app).get('/api/health');
      expect(response.type).toBe('application/json');
    });

    it('should return status field with value "ok"', async () => {
      const response = await request(app).get('/api/health');
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data.status).toBe('ok');
    });

    it('should return uptime field as a number', async () => {
      const response = await request(app).get('/api/health');
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('uptime');
      expect(typeof response.body.data.uptime).toBe('number');
      expect(response.body.data.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return timestamp field in ISO 8601 format', async () => {
      const response = await request(app).get('/api/health');
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('timestamp');
      expect(typeof response.body.data.timestamp).toBe('string');

      // Validate ISO 8601 format
      const isoTimestamp = new Date(response.body.data.timestamp);
      expect(isoTimestamp).toBeInstanceOf(Date);
      expect(isoTimestamp.toISOString()).toBe(response.body.data.timestamp);
    });

    it('should return exactly three fields: status, uptime, timestamp', async () => {
      const response = await request(app).get('/api/health');
      expect(response.body.success).toBe(true);
      const keys = Object.keys(response.body.data);
      expect(keys).toHaveLength(3);
      expect(keys).toContain('status');
      expect(keys).toContain('uptime');
      expect(keys).toContain('timestamp');
    });

    it('should return consistent data structure on multiple calls', async () => {
      const response1 = await request(app).get('/api/health');
      const response2 = await request(app).get('/api/health');

      // Both responses should have the same structure
      expect(Object.keys(response1.body).sort()).toEqual(Object.keys(response2.body).sort());

      // Status should always be "ok"
      expect(response1.body.data.status).toBe('ok');
      expect(response2.body.data.status).toBe('ok');

      // Uptime should increase between calls (with small delay)
      await new Promise(resolve => setTimeout(resolve, 10));
      const response3 = await request(app).get('/api/health');
      expect(response3.body.data.uptime).toBeGreaterThanOrEqual(response1.body.data.uptime);
    });

    it('should handle timestamp timezone correctly', async () => {
      const response = await request(app).get('/api/health');

      // ISO 8601 timestamps should end with 'Z' for UTC
      expect(response.body.data.timestamp).toMatch(/Z$/);
    });

    it('should log debug details when health endpoint is called', async () => {
      await request(app).get('/api/health');

      expect(logger.debug).toHaveBeenCalledTimes(1);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'api',
          action: 'health_check',
          details: expect.objectContaining({
            uptime: expect.any(Number),
            timestamp: expect.any(String),
            shuttingDown: false,
          }),
        })
      );
    });
  });
});
