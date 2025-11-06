/**
 * Unit Tests for API Routes Index
 *
 * Tests the main API router endpoints including the health check endpoint.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express, { Application } from 'express';
import request from 'supertest';
import { createApiRouter } from './index.js';
import { ProcessManager } from '../services/processManager.js';
import { CloudLogging } from '../services/cloudLogging.js';
import { DevBotsManager } from '../services/devBotsManager.js';

describe('API Routes Index', () => {
  let app: Application;
  let processManager: ProcessManager;
  let cloudLogging: CloudLogging;
  let devBotsManager: DevBotsManager;

  beforeEach(() => {
    // Initialize dependencies
    processManager = new ProcessManager();
    cloudLogging = new CloudLogging();
    devBotsManager = new DevBotsManager(processManager);

    // Create Express app with API router
    app = express();
    app.use(express.json());

    const apiRouter = createApiRouter({
      processManager,
      cloudLogging,
      devBotsManager,
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
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ok');
    });

    it('should return uptime field as a number', async () => {
      const response = await request(app).get('/api/health');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return timestamp field in ISO 8601 format', async () => {
      const response = await request(app).get('/api/health');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.timestamp).toBe('string');

      // Validate ISO 8601 format
      const isoTimestamp = new Date(response.body.timestamp);
      expect(isoTimestamp).toBeInstanceOf(Date);
      expect(isoTimestamp.toISOString()).toBe(response.body.timestamp);
    });

    it('should return exactly three fields: status, uptime, timestamp', async () => {
      const response = await request(app).get('/api/health');
      const keys = Object.keys(response.body);
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
      expect(response1.body.status).toBe('ok');
      expect(response2.body.status).toBe('ok');

      // Uptime should increase between calls (with small delay)
      await new Promise(resolve => setTimeout(resolve, 10));
      const response3 = await request(app).get('/api/health');
      expect(response3.body.uptime).toBeGreaterThanOrEqual(response1.body.uptime);
    });

    it('should handle timestamp timezone correctly', async () => {
      const response = await request(app).get('/api/health');

      // ISO 8601 timestamps should end with 'Z' for UTC
      expect(response.body.timestamp).toMatch(/Z$/);
    });
  });
});
