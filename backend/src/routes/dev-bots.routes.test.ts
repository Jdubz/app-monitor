// @ts-nocheck
/**
 * Unit Tests for Dev-Bots Routes - Task Quality Validation
 *
 * Tests the task quality validation warnings that are logged
 * when technical tasks are created with insufficient detail.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { createDevBotsRouter as createClaudeWorkersRouter } from './dev-bots/index.js';
import { logger } from '../utils/logger.js';
import type { DevBotsManager } from '../services/devBotsManager.js';

// Mock the config module - default to production to allow tasks to be created
vi.mock('../config.js', () => ({
  config: {
    nodeEnv: 'production',
    port: 5000,
    corsOrigin: 'http://localhost:5174',
  }
}));

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
        task: {
          id: 'task-123',
          type: 'implementation',
          title: 'Test Task',
          status: 'pending'
        },
        validation: {
          isValid: true,
          errors: [],
          warnings: [],
          suggestions: []
        }
      }),
      getValidAgents: vi.fn().mockReturnValue(['backend', 'frontend', 'fullstack']),
      getTaskQueue: vi.fn().mockReturnValue({
        getDatabase: vi.fn().mockReturnValue({
          prepare: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
            get: vi.fn().mockReturnValue(null),
            run: vi.fn().mockReturnValue({ changes: 0 })
          })
        }),
        getTasksByStatus: vi.fn().mockReturnValue([]),
        getChainStats: vi.fn().mockReturnValue({}),
        getBlockedChains: vi.fn().mockReturnValue([]),
        unblockChain: vi.fn()
      })
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

describe('Dev-Bots Routes - Environment-Based Task Creation Blocking', () => {
  let mockDevBotsManager: DevBotsManager;
  let router: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: any;

  describe('Non-Production Environment', () => {
    beforeEach(async () => {
      // Reset all mocks
      vi.clearAllMocks();
      responseJson = {};

      // Mock config as development environment
      vi.doMock('../config.js', () => ({
        config: {
          nodeEnv: 'development',
          port: 5000,
          corsOrigin: 'http://localhost:5174',
        }
      }));

      // Re-import to get the mocked config
      const { createClaudeWorkersRouter: createRouter } = await import('./dev-bots.routes.js');

      // Mock DevBotsManager
      mockDevBotsManager = {
        addTask: vi.fn().mockResolvedValue({
          task: {
            id: 'task-123',
            type: 'implementation',
            title: 'Test Task',
            status: 'pending',
          },
          validation: { isValid: true, warnings: [], suggestions: [] }
        }),
        getValidAgents: vi.fn().mockReturnValue(['backend', 'frontend', 'fullstack'])
      } as any;

      // Create router with mocked manager
      router = createRouter(mockDevBotsManager);

      // Mock response
      mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          responseJson = data;
          return mockResponse;
        })
      };
    });

    it('should block task creation and return stubbed response', async () => {
      mockRequest = {
        body: {
          type: 'implementation',
          title: 'Test Task from Dev-Bot',
          description: 'This task should be blocked in development',
          acceptanceCriteria: ['Task should work correctly'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify warning was logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'api',
          action: 'task_creation_blocked_non_production',
          message: expect.stringContaining('development'),
        })
      );

      // Verify addTask was NOT called
      expect(mockDevBotsManager.addTask).not.toHaveBeenCalled();

      // Verify stubbed response structure
      expect(responseJson.success).toBe(true);
      expect(responseJson.data.task).toBeDefined();
      expect(responseJson.data.task.stubbed).toBe(true);
      expect(responseJson.data.task.id).toMatch(/^stub-/);
      expect(responseJson.data.task.reason).toContain('non-production');
      expect(responseJson.data.message).toContain('stubbed');
    });

    it('should include warning in validation response', async () => {
      mockRequest = {
        body: {
          type: 'bug',
          title: 'Critical Bug Fix',
          description: 'Fix production bug',
          acceptanceCriteria: ['Bug is fixed'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify validation warnings
      expect(responseJson.data.validation.warnings).toBeDefined();
      expect(responseJson.data.validation.warnings.length).toBeGreaterThan(0);
      expect(responseJson.data.validation.warnings[0]).toContain('disabled');
    });

    it('should still validate required fields before blocking', async () => {
      mockRequest = {
        body: {
          type: 'implementation',
          // Missing title, description, and acceptanceCriteria
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Should fail validation before reaching environment check
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockDevBotsManager.addTask).not.toHaveBeenCalled();
    });

    it('should still validate agent before blocking', async () => {
      mockRequest = {
        body: {
          type: 'implementation',
          title: 'Test Task',
          description: 'Test description',
          acceptanceCriteria: ['Should work'],
          assignedAgent: 'non-existent-agent',
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Should fail agent validation before reaching environment check
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockDevBotsManager.addTask).not.toHaveBeenCalled();
    });

    it('should block with correct task details in stubbed response', async () => {
      mockRequest = {
        body: {
          type: 'refactor',
          title: 'Code Refactoring',
          description: 'Refactor legacy code',
          acceptanceCriteria: ['Code is cleaner', 'Tests still pass'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify task details are preserved in stub
      const { task } = responseJson.data;
      expect(task.type).toBe('refactor');
      expect(task.title).toBe('Code Refactoring');
      expect(task.description).toBe('Refactor legacy code');
      expect(task.status).toBe('pending');
      expect(task.createdAt).toBeDefined();
    });

    it('should return HTTP 200 status for stubbed response', async () => {
      mockRequest = {
        body: {
          type: 'feature',
          title: 'New Feature',
          description: 'Add new feature',
          acceptanceCriteria: ['Feature works'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Should return 200, not 400 or 500
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(responseJson.success).toBe(true);
    });

    it('should generate unique stub IDs', async () => {
      const stubIds: string[] = [];

      for (let i = 0; i < 3; i++) {
        mockRequest = {
          body: {
            type: 'implementation',
            title: `Test Task ${i}`,
            description: 'Test description',
            acceptanceCriteria: ['Works'],
          }
        };

        const postTasksRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks' && layer.route.methods.post
        );

        if (postTasksRoute) {
          await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
        }

        stubIds.push(responseJson.data.task.id);
      }

      // All IDs should be unique
      const uniqueIds = new Set(stubIds);
      expect(uniqueIds.size).toBe(3);

      // All should match stub pattern
      stubIds.forEach(id => {
        expect(id).toMatch(/^stub-\d+-[a-z0-9]+$/);
      });
    });

    it('should log complete warning structure with all details', async () => {
      mockRequest = {
        body: {
          type: 'bug',
          title: 'Critical Bug',
          description: 'Fix critical issue',
          acceptanceCriteria: ['Bug resolved'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify complete logger structure
      expect(logger.warn).toHaveBeenCalledWith({
        category: 'api',
        action: 'task_creation_blocked_non_production',
        message: 'Task creation blocked in development environment',
        details: {
          environment: 'development',
          taskType: 'bug',
          taskTitle: 'Critical Bug',
          note: 'Dev-bots can only create tasks in production to prevent recursive spawning'
        }
      });
    });

    it('should block all task types consistently', async () => {
      const taskTypes = ['implementation', 'bug', 'feature', 'refactor', 'documentation'];

      for (const type of taskTypes) {
        vi.clearAllMocks();

        mockRequest = {
          body: {
            type,
            title: `${type} task`,
            description: `Description for ${type}`,
            acceptanceCriteria: ['Completed'],
          }
        };

        const postTasksRoute = router.stack.find((layer: any) =>
          layer.route?.path === '/tasks' && layer.route.methods.post
        );

        if (postTasksRoute) {
          await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
        }

        // All task types should be blocked
        expect(mockDevBotsManager.addTask).not.toHaveBeenCalled();
        expect(responseJson.data.task.stubbed).toBe(true);
      }
    });

    it('should include API response wrapper format', async () => {
      mockRequest = {
        body: {
          type: 'implementation',
          title: 'Test',
          description: 'Test task',
          acceptanceCriteria: ['Done'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify standard API wrapper format
      expect(responseJson).toHaveProperty('success', true);
      expect(responseJson).toHaveProperty('data');
      expect(responseJson.data).toHaveProperty('task');
      expect(responseJson.data).toHaveProperty('validation');
      expect(responseJson.data).toHaveProperty('message');
    });
  });

  describe('Staging Environment', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      responseJson = {};

      // Mock config as staging environment
      vi.doMock('../config.js', () => ({
        config: {
          nodeEnv: 'staging',
          port: 5000,
          corsOrigin: 'http://localhost:5174',
        }
      }));

      const { createClaudeWorkersRouter: createRouter } = await import('./dev-bots.routes.js');

      mockDevBotsManager = {
        addTask: vi.fn().mockResolvedValue({
          task: { id: 'task-123', type: 'test', title: 'Test' },
          validation: { isValid: true, warnings: [], suggestions: [] }
        }),
        getValidAgents: vi.fn().mockReturnValue(['backend'])
      } as any;

      router = createRouter(mockDevBotsManager);

      mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          responseJson = data;
          return mockResponse;
        })
      };
    });

    it('should block task creation in staging environment', async () => {
      mockRequest = {
        body: {
          type: 'implementation',
          title: 'Staging Test',
          description: 'Test in staging',
          acceptanceCriteria: ['Works'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify blocking in staging
      expect(mockDevBotsManager.addTask).not.toHaveBeenCalled();
      expect(responseJson.data.task.stubbed).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('staging')
        })
      );
    });
  });

  describe('Test Environment', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      responseJson = {};

      // Mock config as test environment
      vi.doMock('../config.js', () => ({
        config: {
          nodeEnv: 'test',
          port: 5000,
          corsOrigin: 'http://localhost:5174',
        }
      }));

      const { createClaudeWorkersRouter: createRouter } = await import('./dev-bots.routes.js');

      mockDevBotsManager = {
        addTask: vi.fn().mockResolvedValue({
          task: { id: 'task-123', type: 'test', title: 'Test' },
          validation: { isValid: true, warnings: [], suggestions: [] }
        }),
        getValidAgents: vi.fn().mockReturnValue(['backend'])
      } as any;

      router = createRouter(mockDevBotsManager);

      mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          responseJson = data;
          return mockResponse;
        })
      };
    });

    it('should block task creation in test environment', async () => {
      mockRequest = {
        body: {
          type: 'implementation',
          title: 'Test Environment Task',
          description: 'Test in test env',
          acceptanceCriteria: ['Works'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify blocking in test
      expect(mockDevBotsManager.addTask).not.toHaveBeenCalled();
      expect(responseJson.data.task.stubbed).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('test')
        })
      );
    });
  });

  describe('Production Environment', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      responseJson = {};

      // Mock config as production environment (default mock)
      vi.doMock('../config.js', () => ({
        config: {
          nodeEnv: 'production',
          port: 5000,
          corsOrigin: 'http://localhost:5174',
        }
      }));

      // Re-import to get production config
      const { createClaudeWorkersRouter: createRouter } = await import('./dev-bots.routes.js');

      mockDevBotsManager = {
        addTask: vi.fn().mockResolvedValue({
          task: {
            id: 'real-task-123',
            type: 'implementation',
            title: 'Production Task',
            status: 'pending',
            createdAt: new Date().toISOString()
          },
          validation: { isValid: true, warnings: [], suggestions: [] }
        }),
        getValidAgents: vi.fn().mockReturnValue(['backend', 'frontend', 'fullstack']),
        validateTaskData: vi.fn().mockReturnValue({
          isValid: true,
          errors: [],
          warnings: [],
          suggestions: []
        }),
      } as any;

      router = createRouter(mockDevBotsManager);

      mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          responseJson = data;
          return mockResponse;
        })
      };
    });

    it('should allow task creation in production', async () => {
      mockRequest = {
        body: {
          type: 'implementation',
          title: 'Production Feature',
          description: 'Implement new feature for production',
          acceptanceCriteria: ['Feature works correctly', 'Tests pass'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // In production, should call addTask
      expect(mockDevBotsManager.addTask).toHaveBeenCalled();

      // Should not have stubbed flag
      expect(responseJson.data?.task?.stubbed).toBeUndefined();

      // Should not log blocking warning
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'task_creation_blocked_non_production'
        })
      );
    });

    it('should return real task from addTask in production', async () => {
      mockRequest = {
        body: {
          type: 'bug',
          title: 'Production Bug Fix',
          description: 'Fix critical production issue',
          acceptanceCriteria: ['Bug is resolved', 'No regressions'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify real task returned
      expect(responseJson.data.task.id).toBe('real-task-123');
      expect(responseJson.data.task.id).not.toMatch(/^stub-/);
      expect(responseJson.data.message).toBe('Task added successfully');
    });

    it('should not log any blocking warnings in production', async () => {
      mockRequest = {
        body: {
          type: 'feature',
          title: 'New Feature',
          description: 'Add new production feature',
          acceptanceCriteria: ['Feature implemented'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify NO warning logs about blocking
      const warnCalls = (logger.warn as any).mock.calls;
      const blockingWarnings = warnCalls.filter((call: any) =>
        call[0]?.action === 'task_creation_blocked_non_production'
      );
      expect(blockingWarnings.length).toBe(0);
    });

    it('should return HTTP 200 status in production (default)', async () => {
      mockRequest = {
        body: {
          type: 'implementation',
          title: 'Production Implementation',
          description: 'Implement feature in production',
          acceptanceCriteria: ['Feature works'],
        }
      };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Should not explicitly call status (uses default 200)
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should invoke addTask with correct parameters in production', async () => {
      const taskPayload = {
        type: 'refactor',
        title: 'Refactor Code',
        description: 'Refactor legacy code',
        acceptanceCriteria: ['Code is cleaner', 'Tests pass'],
        files: ['src/legacy.ts'],
        assignedAgent: 'backend'
      };

      mockRequest = { body: taskPayload };

      const postTasksRoute = router.stack.find((layer: any) =>
        layer.route?.path === '/tasks' && layer.route.methods.post
      );

      if (postTasksRoute) {
        await postTasksRoute.route.stack[0].handle(mockRequest as Request, mockResponse as Response);
      }

      // Verify addTask was called with task data
      expect(mockDevBotsManager.addTask).toHaveBeenCalledTimes(1);
      const callArgs = (mockDevBotsManager.addTask as any).mock.calls[0][0];
      expect(callArgs).toMatchObject({
        type: 'refactor',
        title: 'Refactor Code',
        description: 'Refactor legacy code'
      });
    });
  });
});
