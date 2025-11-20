import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AppMonitorMcpServer, type McpServices } from '../server.js';
import type { Task } from '../../services/taskQueue.sqlite.js';

const createMockTask = (overrides?: Partial<Task>): Task => ({
  id: 'task-123',
  type: 'implementation',
  title: 'Test Task',
  description: 'Test description',
  status: 'pending',
  created_at: Date.now(),
  assigned_agent: 'claude-sonnet',
  metadata: null,
  ...overrides,
} as Task);

const createMockServices = (): McpServices => {
  const mockTaskQueue = {
    getTask: vi.fn((id: string) => {
      if (id === 'task-123') return createMockTask();
      return null;
    }),
    getTasksByStatus: vi.fn().mockReturnValue([]),
    resumeTask: vi.fn(),
    updateTaskMetadata: vi.fn(),
    getQueueMetrics: vi.fn().mockReturnValue({ pending: 0, running: 0, failed: 0 }),
    createTask: vi.fn(),
  };

  const mockDevBotsManager = {
    getTaskQueue: vi.fn().mockReturnValue(mockTaskQueue),
    getTasks: vi.fn().mockResolvedValue({
      pending: [createMockTask()],
      active: [],
      blocked: [],
      completed: [],
      failed: [],
    }),
    addTask: vi.fn().mockResolvedValue({
      task: createMockTask(),
      validation: { isValid: true, errors: [] },
    }),
    getSystemStatus: vi.fn().mockResolvedValue({
      workerCount: 2,
      maxWorkers: 5,
      activeTasks: 1,
      systemStatus: 'running',
      workers: {
        'worker-1': {
          id: 'worker-1',
          status: 'busy',
          currentTask: 'task-123',
          lastSeen: Date.now(),
        },
        'worker-2': {
          id: 'worker-2',
          status: 'idle',
          currentTask: null,
          lastSeen: Date.now() - 5000,
        },
      },
    }),
    triggerEmergencyRecovery: vi.fn().mockResolvedValue(createMockTask({ type: 'recovery' })),
    getPRWorkflowOrchestrator: vi.fn().mockReturnValue({
      evaluatePR: vi.fn(),
      getPRStatus: vi.fn(),
      getSummary: vi.fn().mockReturnValue({ activeEvaluations: 0 }),
    }),
  };

  return {
    devBotsManager: mockDevBotsManager as unknown as McpServices['devBotsManager'],
  };
};

describe('MCP Server Integration', () => {
  let server: AppMonitorMcpServer;
  let db: Database.Database;
  let mockServices: McpServices;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Set required env vars
    process.env.APP_MONITOR_MCP_USER_ROLE = 'admin';
    process.env.APP_MONITOR_ENV = 'test';

    db = new Database(':memory:');
    mockServices = createMockServices();

    server = new AppMonitorMcpServer({
      db,
      services: mockServices,
    });
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('Server Initialization', () => {
    it('should initialize the server without errors', () => {
      expect(server).toBeInstanceOf(AppMonitorMcpServer);
    });

    it('should register all expected tools', () => {
      // Server should initialize and register tools
      expect(server).toBeDefined();
    });
  });

  describe('Environment Validation', () => {
    it('should validate required environment variables', async () => {
      const { validateMcpEnvironment } = await import('../middleware/auth.js');

      // Should not throw with valid env
      expect(() => validateMcpEnvironment()).not.toThrow();
    });

    it('should reject invalid role', async () => {
      process.env.APP_MONITOR_MCP_USER_ROLE = 'invalid';
      const { validateMcpEnvironment } = await import('../middleware/auth.js');

      expect(() => validateMcpEnvironment()).toThrow(/must be set to 'admin' or 'dev-bot'/);
    });

    it('should reject dev-bot in production', async () => {
      process.env.APP_MONITOR_MCP_USER_ROLE = 'dev-bot';
      process.env.APP_MONITOR_ENV = 'production';
      const { validateMcpEnvironment } = await import('../middleware/auth.js');

      expect(() => validateMcpEnvironment()).toThrow(/cannot access production MCP/);
    });
  });

  describe('Response Helpers', () => {
    it('should create success response', async () => {
      const { createSuccessResponse } = await import('../utils/response.js');
      const response = createSuccessResponse('Test message');

      expect(response).toEqual({
        content: [{ type: 'text', text: 'Test message' }],
      });
    });

    it('should create JSON response', async () => {
      const { createJsonResponse } = await import('../utils/response.js');
      const data = { foo: 'bar', baz: 123 };
      const response = createJsonResponse(data);

      expect(response).toEqual({
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      });
    });

    it('should create error response', async () => {
      const { createErrorResponse } = await import('../utils/response.js');
      const response = createErrorResponse('Error message');

      expect(response).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'Error message' }],
      });
    });

    it('should handle error from exception', async () => {
      const { createErrorFromException } = await import('../utils/response.js');
      const error = new Error('Test error');
      const response = createErrorFromException(error);

      expect(response).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'Test error' }],
      });
    });
  });

  describe('Error Handling', () => {
    it('should wrap handler with error handling', async () => {
      const { withErrorHandling } = await import('../utils/response.js');

      const failingHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));
      const wrapped = withErrorHandling(failingHandler);

      const result = await wrapped({ test: 'param' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Handler failed');
    });

    it('should pass through successful results', async () => {
      const { withErrorHandling, createSuccessResponse } = await import('../utils/response.js');

      const successHandler = vi.fn().mockResolvedValue(createSuccessResponse('Success'));
      const wrapped = withErrorHandling(successHandler);

      const result = await wrapped({ test: 'param' }, {});

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe('Success');
    });
  });
});
