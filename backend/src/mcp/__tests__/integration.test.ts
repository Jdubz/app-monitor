import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { AppMonitorMcpServer, type McpServices } from '../server.js';

const createMockServices = (): McpServices => {
  const mockDevBotsManager = {
    getTaskQueue: vi.fn().mockReturnValue({
      getTask: vi.fn(),
      getTasksByStatus: vi.fn().mockReturnValue([]),
      resumeTask: vi.fn(),
      updateTaskMetadata: vi.fn(),
      getQueueMetrics: vi.fn().mockReturnValue({ pending: 0, running: 0, failed: 0 }),
    }),
    getTasks: vi.fn().mockResolvedValue({
      pending: [],
      active: [],
      blocked: [],
      completed: [],
      failed: [],
    }),
    getSystemStatus: vi.fn().mockResolvedValue({
      workerCount: 0,
      maxWorkers: 0,
      activeTasks: 0,
      systemStatus: 'stopped',
      workers: {},
    }),
    triggerEmergencyRecovery: vi.fn(),
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

  beforeEach(() => {
    db = new Database(':memory:');
    mockServices = createMockServices();

    server = new AppMonitorMcpServer({
      db,
      services: mockServices,
    });
  });

  it('should initialize the server without errors', () => {
    expect(server).toBeInstanceOf(AppMonitorMcpServer);
  });
});
