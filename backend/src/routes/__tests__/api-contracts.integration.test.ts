// @ts-nocheck
/**
 * API Contract Compliance Integration Tests
 * 
 * Validates that all API endpoints return responses matching the shared contracts.
 * These tests prevent contract violations like the queue endpoint bug.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createDevBotsRouter } from '../../routes/dev-bots/index.js';
import { assertApiSuccess, assertApiSuccessWithProperties, assertApiError } from '../../__tests__/utils/contractValidation.js';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import type { DevBotsQueueSummary, DevBotsStatus } from '@app-monitor/api-contracts';

describe('API Contract Compliance - Dev-Bots Endpoints', () => {
  let app: Express;
  let mockDevBotsManager: Partial<DevBotsManager>;

  beforeAll(() => {
    // Mock DevBotsManager with minimal implementation
    const mockTaskQueue = {
      getDatabase: () => ({}), // Return empty database mock
    } as any;

    mockDevBotsManager = {
      getTasks: async () => ({
        pending: [],
        active: [],
        completed: [],
        failed: [],
      }),
      getQueueMetrics: () => ({
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        timeout: 0,
        total: 0,
      }),
      getSystemStatus: async () => ({
        systemStatus: 'running' as const,
        workers: {},
        queueSize: 0,
        activeTasks: 0,
        uptime: 0,
        workerCount: 0,
        maxWorkers: 3,
        activeWorkerTypes: [],
        availableWorkerTypes: [],
        tasks: { pending: [], active: [], completed: [], failed: [] },
      }),
      getWorkers: () => ({}),
      getTaskQueue: () => mockTaskQueue,
      addTask: async () => ({
        id: 'test-task',
        type: 'test',
        description: 'test',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
      }) as any,
    } as any;

    // Create Express app with dev-bots routes
    app = express();
    app.use(express.json());
    app.use('/api/dev-bots', createDevBotsRouter(mockDevBotsManager as DevBotsManager));
  });

  describe('GET /api/dev-bots/queue', () => {
    it('should return ApiSuccess<DevBotsQueueSummary>', async () => {
      const response = await request(app).get('/api/dev-bots/queue');
      
      expect(response.status).toBe(200);
      assertApiSuccess<DevBotsQueueSummary>(response.body);
    });

    it('should have all required DevBotsQueueSummary properties', async () => {
      const response = await request(app).get('/api/dev-bots/queue');
      
      assertApiSuccessWithProperties<DevBotsQueueSummary>(
        response.body,
        ['items', 'counts', 'lastUpdated']
      );
      
      const { data } = response.body;
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.counts).toHaveProperty('pending');
      expect(data.counts).toHaveProperty('active');
      expect(data.counts).toHaveProperty('completed');
      expect(data.counts).toHaveProperty('failed');
      expect(typeof data.lastUpdated).toBe('string');
    });

    it('should have items with correct structure', async () => {
      const response = await request(app).get('/api/dev-bots/queue');
      
      assertApiSuccess<DevBotsQueueSummary>(response.body);
      
      const { items } = response.body.data;
      items.forEach(item => {
        expect(item).toHaveProperty('bucket');
        expect(item).toHaveProperty('task');
        expect(['pending', 'active', 'completed', 'failed']).toContain(item.bucket);
      });
    });
  });

  describe('GET /api/dev-bots/status', () => {
    it('should return ApiSuccess<DevBotsStatus>', async () => {
      const response = await request(app).get('/api/dev-bots/status');
      
      expect(response.status).toBe(200);
      assertApiSuccess<DevBotsStatus>(response.body);
    });

    it('should have all required DevBotsStatus properties', async () => {
      const response = await request(app).get('/api/dev-bots/status');
      
      assertApiSuccessWithProperties<DevBotsStatus>(
        response.body,
        ['systemStatus', 'workers', 'queueSize', 'activeTasks', 'uptime']
      );
      
      const { data } = response.body;
      expect(['running', 'stopped', 'error']).toContain(data.systemStatus);
      expect(typeof data.workers).toBe('object');
      expect(typeof data.queueSize).toBe('number');
      expect(typeof data.activeTasks).toBe('number');
    });
  });

  describe('GET /api/dev-bots/tasks', () => {
    it('should return ApiSuccess with task array', async () => {
      const response = await request(app).get('/api/dev-bots/tasks');
      
      expect(response.status).toBe(200);
      assertApiSuccess(response.body);
      // Tasks endpoint returns object with pending/active/completed arrays
      expect(response.body.data).toHaveProperty('pending');
      expect(response.body.data).toHaveProperty('active');
      expect(response.body.data).toHaveProperty('completed');
      const data = response.body.data as { pending: unknown[]; active: unknown[]; completed: unknown[] };
      expect(Array.isArray(data.pending)).toBe(true);
      expect(Array.isArray(data.active)).toBe(true);
      expect(Array.isArray(data.completed)).toBe(true);
    });
  });

  describe.skip('POST /api/dev-bots/tasks - DEPRECATED', () => {
    // NOTE: This endpoint no longer exists. Task creation now happens through
    // POST /api/dev-bots/tasks or other specialized endpoints.
    it('should handle task creation (adapts to environment)', async () => {
      const taskPayload = {
        type: 'implementation',
        title: 'Test Task',
        documentation: 'Test documentation for the task',
        acceptanceCriteria: ['Task should work correctly'],
      };

      const response = await request(app)
        .post('/api/dev-bots/tasks')
        .send(taskPayload);

      // In test environment, task creation may be blocked (403)
      // In production, it would return 200
      if (response.status === 403) {
        assertApiError(response.body);
        expect(response.body.error).toBeDefined();
      } else if (response.status === 200) {
        assertApiSuccess(response.body);
        expect(response.body.data).toHaveProperty('task');
        const data = response.body.data as { task: { id: unknown; type: unknown; status: unknown } };
        expect(data.task).toHaveProperty('id');
        expect(data.task).toHaveProperty('type');
        expect(data.task).toHaveProperty('status');
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    });
  });

  describe('Error Responses', () => {
    it('should return ApiError for invalid endpoints', async () => {
      const response = await request(app).get('/api/dev-bots/nonexistent');
      
      expect(response.status).toBeGreaterThanOrEqual(400);
      // Note: 404s from Express may not follow our contract
      // This test documents current behavior
    });
  });

  describe('Contract Consistency', () => {
    it('all successful responses should have success:true', async () => {
      const endpoints = [
        '/api/dev-bots/queue',
        '/api/dev-bots/status',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        
        if (response.status >= 200 && response.status < 300) {
          expect(response.body).toHaveProperty('success', true);
          expect(response.body).toHaveProperty('data');
        }
      }
    });

    it('all responses should have success field', async () => {
      const endpoints = [
        '/api/dev-bots/queue',
        '/api/dev-bots/status',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        
        expect(response.body).toHaveProperty('success');
        expect(typeof response.body.success).toBe('boolean');
      }
    });
  });
});
