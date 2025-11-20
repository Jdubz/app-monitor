import { AppMonitorMcpServer } from '../server';
import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// MCP tooling is still under development; skip until SDK is bundled in the build process.
describe.skip('MCP Server Integration', () => {
  let server: AppMonitorMcpServer;
  let db: Database.Database;
  let mockServices: any;

  beforeEach(() => {
    db = new Database(':memory:');

    // Mock services
    mockServices = {
        devBotsManager: {
            getTaskQueue: vi.fn().mockReturnValue({
                createTask: vi.fn(),
                getTask: vi.fn(),
                listTasks: vi.fn(),
                unblockTask: vi.fn(),
                cancelTask: vi.fn(),
                completeTask: vi.fn(),
                failTask: vi.fn(),
                getQueueMetrics: vi.fn().mockReturnValue({ pending: 0, running: 0, failed: 0 }),
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
        }
    };

    server = new AppMonitorMcpServer({
        databasePath: ':memory:',
        services: mockServices
    });
  });

  it('should initialize the server without errors', async () => {
    expect(server).toBeInstanceOf(AppMonitorMcpServer);
  });
});
