/**
 * Integration Tests for Bot Self-Reporting Endpoint
 *
 * Tests the POST /api/dev-bots/tasks/:taskId/report-completion endpoint
 * that allows bots to explicitly report task success/failure status.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { createTasksRoutes } from '../tasks.routes.js';
import { logger } from '../../../utils/logger.js';
import type { DevBotsManager } from '../../../services/devBotsManager.js';
import type { Task } from '../../../services/taskQueue.sqlite.js';

// Mock the logger
vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Bot Self-Reporting Endpoint', () => {
  let mockDevBotsManager: Partial<DevBotsManager>;
  let router: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: any;
  let responseStatus: number;
  let mockTask: Task;
  let mockTaskQueue: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    responseJson = {};
    responseStatus = 200;

    // Mock task
    mockTask = {
      id: 'test-task-123',
      title: 'Test Task',
      type: 'implementation',
      status: 'running',
      assigned_agent: 'backend-specialist',
      metadata: JSON.stringify({}),
      priority: 5,
      created_at: Date.now()
    } as Task;

    // Mock TaskQueue
    mockTaskQueue = {
      getTask: vi.fn().mockReturnValue(mockTask),
      updateTask: vi.fn(),
      updateTaskMetadata: vi.fn()
    };

    // Mock DevBotsManager
    mockDevBotsManager = {
      getTaskQueue: vi.fn().mockReturnValue(mockTaskQueue)
    } as Partial<DevBotsManager>;

    // Create router with mocked manager
    router = createTasksRoutes(mockDevBotsManager as DevBotsManager);

    // Mock response
    mockResponse = {
      status: vi.fn().mockImplementation((code: number) => {
        responseStatus = code;
        return {
          json: vi.fn().mockImplementation((data) => {
            responseJson = data;
            return mockResponse;
          })
        };
      }),
      json: vi.fn().mockImplementation((data) => {
        responseJson = data;
        return mockResponse;
      })
    };
  });

  describe('POST /:taskId/report-completion', () => {
    it('should accept bot success report from localhost', async () => {
      mockRequest = {
        params: { taskId: 'test-task-123' },
        body: {
          success: true,
          summary: 'Task completed successfully with all tests passing'
        },
        ip: '::1' // localhost IPv6
      } as Partial<Request>;

      // Find the route handler
      const route = router.stack.find((layer: any) =>
        layer.route?.path === '/:taskId/report-completion' && layer.route.methods.post
      );

      if (route) {
        await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      expect(responseStatus).toBe(200);
      expect(responseJson).toMatchObject({
        success: true,
        message: 'Task completion status recorded: SUCCESS',
        taskId: 'test-task-123'
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'process',
          action: 'bot_reported_completion',
          message: expect.stringContaining('SUCCESS')
        })
      );

      // Verify metadata update was called
      expect(mockTaskQueue.updateTaskMetadata).toHaveBeenCalledWith(
        'test-task-123',
        expect.objectContaining({
          bot_reported_success: true,
          bot_reported_summary: 'Task completed successfully with all tests passing',
          bot_reported_at: expect.any(Number)
        })
      );
    });

    it('should accept bot failure report from localhost', async () => {
      mockRequest = {
        params: { taskId: 'test-task-123' },
        body: {
          success: false,
          summary: 'Failed to pass linter checks'
        },
        ip: '127.0.0.1' // localhost IPv4
      } as Partial<Request>;

      const route = router.stack.find((layer: any) =>
        layer.route?.path === '/:taskId/report-completion' && layer.route.methods.post
      );

      if (route) {
        await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      expect(responseStatus).toBe(200);
      expect(responseJson).toMatchObject({
        success: true,
        message: 'Task completion status recorded: FAILURE',
        taskId: 'test-task-123'
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'process',
          action: 'bot_reported_completion',
          message: expect.stringContaining('FAILURE')
        })
      );
    });

    it('should accept report without summary', async () => {
      mockRequest = {
        params: { taskId: 'test-task-123' },
        body: {
          success: true
        },
        ip: '::ffff:127.0.0.1' // localhost IPv4-mapped IPv6
      } as Partial<Request>;

      const route = router.stack.find((layer: any) =>
        layer.route?.path === '/:taskId/report-completion' && layer.route.methods.post
      );

      if (route) {
        await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      expect(responseStatus).toBe(200);
      expect(responseJson.success).toBe(true);
    });

    it('should reject requests from external IPs', async () => {
      mockRequest = {
        params: { taskId: 'test-task-123' },
        body: {
          success: true,
          summary: 'Malicious attempt'
        },
        ip: '192.168.1.100' // External IP
      } as Partial<Request>;

      const route = router.stack.find((layer: any) =>
        layer.route?.path === '/:taskId/report-completion' && layer.route.methods.post
      );

      if (route) {
        await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      expect(responseStatus).toBe(403);
      expect(responseJson).toMatchObject({
        error: 'Forbidden',
        message: 'This endpoint is only accessible from localhost'
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'api',
          action: 'blocked_external_completion_report'
        })
      );
    });

    it('should return 400 for invalid taskId', async () => {
      mockRequest = {
        params: { taskId: '' },
        body: {
          success: true
        },
        ip: '::1'
      } as Partial<Request>;

      const route = router.stack.find((layer: any) =>
        layer.route?.path === '/:taskId/report-completion' && layer.route.methods.post
      );

      if (route) {
        await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      expect(responseStatus).toBe(400);
      expect(responseJson).toMatchObject({
        error: 'Invalid task ID',
        message: 'taskId must be a non-empty string'
      });
    });

    it('should return 400 for missing success field', async () => {
      mockRequest = {
        params: { taskId: 'test-task-123' },
        body: {
          summary: 'Missing success field'
        },
        ip: '::1'
      } as Partial<Request>;

      const route = router.stack.find((layer: any) =>
        layer.route?.path === '/:taskId/report-completion' && layer.route.methods.post
      );

      if (route) {
        await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      expect(responseStatus).toBe(400);
      expect(responseJson).toMatchObject({
        error: 'Invalid success field',
        message: 'success must be a boolean value'
      });
    });

    it('should return 400 for non-boolean success field', async () => {
      mockRequest = {
        params: { taskId: 'test-task-123' },
        body: {
          success: 'yes' // Should be boolean
        },
        ip: '::1'
      } as Partial<Request>;

      const route = router.stack.find((layer: any) =>
        layer.route?.path === '/:taskId/report-completion' && layer.route.methods.post
      );

      if (route) {
        await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      expect(responseStatus).toBe(400);
      expect(responseJson).toMatchObject({
        error: 'Invalid success field',
        message: 'success must be a boolean value'
      });
    });

    it('should return 404 for non-existent task', async () => {
      // Mock task not found
      const taskQueue = mockDevBotsManager.getTaskQueue!();
      (taskQueue.getTask as any).mockReturnValue(null);

      mockRequest = {
        params: { taskId: 'non-existent-task' },
        body: {
          success: true
        },
        ip: '::1'
      } as Partial<Request>;

      const route = router.stack.find((layer: any) =>
        layer.route?.path === '/:taskId/report-completion' && layer.route.methods.post
      );

      if (route) {
        await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      expect(responseStatus).toBe(404);
      expect(responseJson).toMatchObject({
        error: 'Task not found',
        message: 'Task non-existent-task does not exist'
      });
    });

    it('should store metadata with correct structure', async () => {
      mockRequest = {
        params: { taskId: 'test-task-123' },
        body: {
          success: true,
          summary: 'All tests passed successfully'
        },
        ip: '::1'
      } as Partial<Request>;

      const route = router.stack.find((layer: any) =>
        layer.route?.path === '/:taskId/report-completion' && layer.route.methods.post
      );

      if (route) {
        await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify the metadata structure
      expect(mockTaskQueue.updateTaskMetadata).toHaveBeenCalledWith(
        'test-task-123',
        expect.objectContaining({
          bot_reported_success: true,
          bot_reported_summary: 'All tests passed successfully',
          bot_reported_at: expect.any(Number)
        })
      );
    });

    it('should merge with existing metadata', async () => {
      // Task already has some metadata
      mockTask.metadata = JSON.stringify({
        existing_field: 'existing_value',
        other_data: 123
      });

      mockRequest = {
        params: { taskId: 'test-task-123' },
        body: {
          success: false,
          summary: 'Build failed'
        },
        ip: '::1'
      } as Partial<Request>;

      const route = router.stack.find((layer: any) =>
        layer.route?.path === '/:taskId/report-completion' && layer.route.methods.post
      );

      if (route) {
        await route.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify metadata was merged correctly
      expect(mockTaskQueue.updateTaskMetadata).toHaveBeenCalledWith(
        'test-task-123',
        expect.objectContaining({
          existing_field: 'existing_value',
          other_data: 123,
          bot_reported_success: false,
          bot_reported_summary: 'Build failed',
          bot_reported_at: expect.any(Number)
        })
      );
    });
  });
});
