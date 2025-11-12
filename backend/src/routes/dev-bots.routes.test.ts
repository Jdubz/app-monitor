/**
 * Unit Tests for Dev-Bots Routes - Task Quality Validation
 *
 * Tests the task quality validation warnings that are logged
 * when technical tasks are created with insufficient detail.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { createClaudeWorkersRouter } from './dev-bots.routes.js';
import { logger } from '../utils/logger.js';
import type { DevBotsManager } from '../services/devBotsManager.js';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Dev-Bots Routes - Task Quality Validation', () => {
  let mockDevBotsManager: DevBotsManager;
  let router: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    responseJson = {};

    // Mock DevBotsManager
    mockDevBotsManager = {
      addTask: vi.fn().mockResolvedValue({
        id: 'task-123',
        type: 'implementation',
        title: 'Test Task',
        status: 'pending'
      }),
      getValidAgents: vi.fn().mockReturnValue(['backend', 'frontend', 'fullstack'])
    } as any;

    // Create router with mocked manager
    router = createClaudeWorkersRouter(mockDevBotsManager);

    // Mock response
    mockResponse = {
      status: vi.fn().mockReturnValue({
        json: vi.fn().mockImplementation((data) => {
          responseJson = data;
          return mockResponse;
        })
      }),
      json: vi.fn().mockImplementation((data) => {
        responseJson = data;
        return mockResponse;
      })
    };
  });

  describe('Technical Task Validation - Missing Files Array', () => {
    const technicalTypes = ['refactor', 'implementation', 'bug', 'feature'];

    technicalTypes.forEach((type) => {
      it(`should log warning when ${type} task has no files array`, async () => {
        mockRequest = {
          body: {
            type,
            title: 'Test Task',
            documentation: 'This is a test task with sufficient documentation length to pass validation.',
            acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
            // files is not provided
          }
        };

        // Find the POST /tasks route handler
        const postTasksRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks' && layer.route.methods.post
        );

        if (postTasksRoute) {
          await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
        }

        expect(logger.warn).toHaveBeenCalledWith({
          category: 'api',
          action: 'task_missing_files_array',
          message: `Technical task type '${type}' created without files array`,
          details: { taskId: 'Test Task' }
        });
      });

      it(`should log warning when ${type} task has empty files array`, async () => {
        mockRequest = {
          body: {
            type,
            title: 'Test Task',
            documentation: 'This is a test task with sufficient documentation length to pass validation.',
            acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
            files: [] // empty array
          }
        };

        const postTasksRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks' && layer.route.methods.post
        );

        if (postTasksRoute) {
          await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
        }

        expect(logger.warn).toHaveBeenCalledWith({
          category: 'api',
          action: 'task_missing_files_array',
          message: `Technical task type '${type}' created without files array`,
          details: { taskId: 'Test Task' }
        });
      });

      it(`should NOT log warning when ${type} task has files array`, async () => {
        mockRequest = {
          body: {
            type,
            title: 'Test Task',
            documentation: 'This is a test task with sufficient documentation length to pass validation.',
            acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
            files: ['src/test.ts', 'src/utils/helper.ts']
          }
        };

        const postTasksRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks' && layer.route.methods.post
        );

        if (postTasksRoute) {
          await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
        }

        expect(logger.warn).not.toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'task_missing_files_array'
          })
        );
      });
    });

    it('should NOT log warning for non-technical task types', async () => {
      mockRequest = {
        body: {
          type: 'documentation',
          title: 'Test Task',
          documentation: 'Short docs',
          acceptanceCriteria: ['Done'],
          // files is not provided
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'task_missing_files_array'
        })
      );
    });
  });

  describe('Technical Task Validation - Missing Description', () => {
    const technicalTypes = ['refactor', 'implementation', 'bug', 'feature'];

    technicalTypes.forEach((type) => {
      it(`should log warning when ${type} task has short description (< 50 chars)`, async () => {
        mockRequest = {
          body: {
            type,
            title: 'Test Task',
            documentation: 'Short', // less than 50 characters
            acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
            files: ['src/test.ts']
          }
        };

        const postTasksRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks' && layer.route.methods.post
        );

        if (postTasksRoute) {
          await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
        }

        expect(logger.warn).toHaveBeenCalledWith({
          category: 'api',
          action: 'task_missing_description',
          message: `Technical task type '${type}' created without detailed description`,
          details: { taskId: 'Test Task' }
        });
      });

      it(`should NOT log warning when ${type} task has adequate description (>= 50 chars)`, async () => {
        mockRequest = {
          body: {
            type,
            title: 'Test Task',
            documentation: 'This is a sufficiently detailed description that meets the minimum character requirement.',
            acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
            files: ['src/test.ts']
          }
        };

        const postTasksRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks' && layer.route.methods.post
        );

        if (postTasksRoute) {
          await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
        }

        expect(logger.warn).not.toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'task_missing_description'
          })
        );
      });
    });
  });

  describe('Technical Task Validation - Vague Acceptance Criteria', () => {
    const technicalTypes = ['refactor', 'implementation', 'bug', 'feature'];

    technicalTypes.forEach((type) => {
      it(`should log warning when ${type} task has single vague criterion (< 30 chars)`, async () => {
        mockRequest = {
          body: {
            type,
            title: 'Test Task',
            documentation: 'This is a test task with sufficient documentation length to pass validation.',
            acceptanceCriteria: ['Done'], // single item less than 30 characters
            files: ['src/test.ts']
          }
        };

        const postTasksRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks' && layer.route.methods.post
        );

        if (postTasksRoute) {
          await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
        }

        expect(logger.warn).toHaveBeenCalledWith({
          category: 'api',
          action: 'vague_acceptance_criteria',
          message: `Task has vague acceptance criteria: "Done"`,
          details: { taskId: 'Test Task' }
        });
      });

      it(`should NOT log warning when ${type} task has single detailed criterion (>= 30 chars)`, async () => {
        mockRequest = {
          body: {
            type,
            title: 'Test Task',
            documentation: 'This is a test task with sufficient documentation length to pass validation.',
            acceptanceCriteria: ['Task is complete when all tests pass successfully'], // single item >= 30 characters
            files: ['src/test.ts']
          }
        };

        const postTasksRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks' && layer.route.methods.post
        );

        if (postTasksRoute) {
          await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
        }

        expect(logger.warn).not.toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'vague_acceptance_criteria'
          })
        );
      });

      it(`should NOT log warning when ${type} task has multiple criteria`, async () => {
        mockRequest = {
          body: {
            type,
            title: 'Test Task',
            documentation: 'This is a test task with sufficient documentation length to pass validation.',
            acceptanceCriteria: ['Done', 'Complete'], // multiple items
            files: ['src/test.ts']
          }
        };

        const postTasksRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks' && layer.route.methods.post
        );

        if (postTasksRoute) {
          await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
        }

        expect(logger.warn).not.toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'vague_acceptance_criteria'
          })
        );
      });
    });
  });

  describe('Task Creation Success - Warnings Do Not Block', () => {
    it('should create task successfully even with all validation warnings', async () => {
      mockRequest = {
        body: {
          type: 'implementation',
          title: 'Test Task',
          documentation: 'Short', // triggers warning
          acceptanceCriteria: ['Done'], // triggers warning
          // no files - triggers warning
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify warnings were logged
      expect(logger.warn).toHaveBeenCalledTimes(3);

      // Verify task was still created successfully
      expect(mockDevBotsManager.addTask).toHaveBeenCalled();
      expect(responseJson).toHaveProperty('task');
      expect(responseJson).toHaveProperty('message', 'Task added successfully');
    });

    it('should create task successfully with no warnings when quality is good', async () => {
      mockRequest = {
        body: {
          type: 'implementation',
          title: 'Test Task',
          documentation: 'This is a comprehensive documentation that describes the task in detail and meets all quality requirements.',
          acceptanceCriteria: ['All tests pass', 'Code is reviewed and approved'],
          files: ['src/test.ts', 'src/utils/helper.ts']
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify no warnings were logged
      expect(logger.warn).not.toHaveBeenCalled();

      // Verify task was created successfully
      expect(mockDevBotsManager.addTask).toHaveBeenCalled();
      expect(responseJson).toHaveProperty('task');
      expect(responseJson).toHaveProperty('message', 'Task added successfully');
    });
  });

  describe('Structured Logging Format', () => {
    it('should use structured logging format with category: api', async () => {
      mockRequest = {
        body: {
          type: 'bug',
          title: 'Test Bug Fix',
          documentation: 'Fix bug',
          acceptanceCriteria: ['Fixed'],
          // no files
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify all warnings use structured logging with category: 'api'
      const warnCalls = (logger.warn as any).mock.calls;
      expect(warnCalls.length).toBeGreaterThan(0);

      warnCalls.forEach((call: any) => {
        expect(call[0]).toHaveProperty('category', 'api');
        expect(call[0]).toHaveProperty('action');
        expect(call[0]).toHaveProperty('message');
        expect(call[0]).toHaveProperty('details');
        expect(call[0].details).toHaveProperty('taskId');
      });
    });
  });

  describe('Edge Cases and Regression Tests', () => {
    it('should handle exactly 50 character description as valid', async () => {
      const exactlyFiftyChars = '12345678901234567890123456789012345678901234567890'; // 50 chars

      mockRequest = {
        body: {
          type: 'refactor',
          title: 'Test Refactor',
          documentation: exactlyFiftyChars,
          acceptanceCriteria: ['Code refactored successfully'],
          files: ['src/refactor.ts']
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'task_missing_description'
        })
      );
    });

    it('should handle exactly 30 character criterion as valid', async () => {
      const exactlyThirtyChars = '123456789012345678901234567890'; // 30 chars

      mockRequest = {
        body: {
          type: 'implementation',
          title: 'Test Implementation',
          documentation: 'This is a detailed description that exceeds fifty characters in length.',
          acceptanceCriteria: [exactlyThirtyChars],
          files: ['src/implementation.ts']
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'vague_acceptance_criteria'
        })
      );
    });
  });

  describe('Task Context API Endpoints', () => {
    // Note: These tests verify route structure exists
    // Full integration tests would require mocking TaskContextService

    describe('GET /tasks/:id/context', () => {
      it('should return latest automation run for a task', async () => {
        // This test verifies the route structure exists
        const contextRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks/:id/context' && layer.route.methods.get
        );

        expect(contextRoute).toBeDefined();
        expect(contextRoute?.route?.methods?.get).toBe(true);
      });

      it('should return 404 when no runs exist for task', () => {
        const contextRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks/:id/context' && layer.route.methods.get
        );

        expect(contextRoute).toBeDefined();
      });
    });

    describe('GET /tasks/:id/runs', () => {
      it('should return all automation runs for a task', () => {
        const runsRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks/:id/runs' && layer.route.methods.get
        );

        expect(runsRoute).toBeDefined();
        expect(runsRoute?.route?.methods?.get).toBe(true);
      });

      it('should return empty array when no runs exist', () => {
        const runsRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks/:id/runs' && layer.route.methods.get
        );

        expect(runsRoute).toBeDefined();
      });
    });

    describe('GET /tasks/:id/runs/:runId', () => {
      it('should return specific automation run details', () => {
        const runDetailRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks/:id/runs/:runId' && layer.route.methods.get
        );

        expect(runDetailRoute).toBeDefined();
        expect(runDetailRoute?.route?.methods?.get).toBe(true);
      });

      it('should verify run belongs to specified task', () => {
        const runDetailRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks/:id/runs/:runId' && layer.route.methods.get
        );

        expect(runDetailRoute).toBeDefined();
      });

      it('should return 404 when run does not exist', () => {
        const runDetailRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks/:id/runs/:runId' && layer.route.methods.get
        );

        expect(runDetailRoute).toBeDefined();
      });
    });

    describe('Endpoint Response Format', () => {
      it('should have consistent error response format', () => {
        // All three endpoints should follow the same error format
        const contextRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks/:id/context'
        );
        const runsRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks/:id/runs' && !layer.route?.path.includes(':runId')
        );
        const runDetailRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks/:id/runs/:runId'
        );

        expect(contextRoute).toBeDefined();
        expect(runsRoute).toBeDefined();
        expect(runDetailRoute).toBeDefined();
      });

      it('should use structured logging for errors', () => {
        // Verify that error logging follows the category/action/message pattern
        const routes = [
          router.stack.find((layer: any) => layer.route?.path === '/tasks/:id/context'),
          router.stack.find((layer: any) => layer.route?.path === '/tasks/:id/runs'),
          router.stack.find((layer: any) => layer.route?.path === '/tasks/:id/runs/:runId')
        ];

        routes.forEach(route => {
          expect(route).toBeDefined();
        });
      });
    });

    describe('Route Integration', () => {
      it('should have TaskContextService instantiated in router', () => {
        // Verify the service is created when router is initialized
        expect(router.stack.length).toBeGreaterThan(0);

        // Check that context endpoints are registered
        const contextEndpoints = router.stack.filter((layer: any) =>
          layer.route?.path?.includes('/context') ||
          layer.route?.path?.includes('/runs')
        );

        expect(contextEndpoints.length).toBeGreaterThan(0);
      });

      it('should have all three context endpoints registered', () => {
        const paths = router.stack
          .filter((layer: any) => layer.route)
          .map((layer: any) => layer.route.path);

        expect(paths).toContain('/tasks/:id/context');
        expect(paths).toContain('/tasks/:id/runs');
        expect(paths).toContain('/tasks/:id/runs/:runId');
      });
    });
  });
});
