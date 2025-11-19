import { AppMonitorMcpServer } from '../server';
import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MCP Server Integration', () => {
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
            }),
            getActiveBots: vi.fn(),
            getBotStatus: vi.fn(),
            recoverBot: vi.fn(),
            getHeartbeatStatus: vi.fn(),
            getPRWorkflowOrchestrator: vi.fn().mockReturnValue({
                evaluatePR: vi.fn(),
                getPRStatus: vi.fn(),
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
