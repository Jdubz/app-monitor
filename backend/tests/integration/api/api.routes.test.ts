import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import request, { type Response as SupertestResponse } from 'supertest';
import type { Server } from 'http';
import type {
  HealthCheckApiResponse,
  DockerInfoResponse,
  DockerActionResponse,
  TokenSummariesResponse,
  TokenSummaryResponse,
  TokenBudgetResponse,
  TokenBudgetUpdateResponse,
  TokenCanUseResponse,
  TokenRemainingResponse,
  TokenResetResponse,
  QualityGateConfigsResponse,
  QualityGateConfigResponse,
  QualityGateUpdateResponse,
  QualityGateValidationResponse,
  QualityGateResetResponse,
  QualityGateStatusResponse,
  DevBotsStatus,
} from '@app-monitor/api-contracts';
import type { MockServerDependencies } from '../../helpers/mockServerDependencies.js';

let createApiTestServer: typeof import('../../helpers/createApiTestServer.js').createApiTestServer;

vi.mock('../../src/services/tokenTracking.js', () => {
  const summaries = [
    {
      provider: 'claude',
      totalInput: 1000,
      totalOutput: 2000,
      totalTokens: 3000,
      requestCount: 2,
      estimatedCost: 0.5,
      budgetLimit: 10000,
      percentUsed: 30,
      warningTriggered: false,
      limitExceeded: false,
    },
  ];

  const budgets = new Map([
    [
      'claude',
      {
        provider: 'claude',
        dailyLimit: 10000,
        costPerMillionInput: 3,
        costPerMillionOutput: 15,
        warningThreshold: 80,
      },
    ],
  ]);

  const tokenTracking = {
    getAllSummaries: () => summaries,
    getDailySummary: (provider: string) => summaries.find((s) => s.provider === provider) ?? summaries[0],
    getBudget: (provider: string) => budgets.get(provider),
    setBudget: (budget: (typeof summaries)[number]) => budgets.set(budget.provider, budget as any),
    canUseProvider: () => true,
    getRemainingTokens: () => 7000,
    resetDailyTracking: () => {},
  };

  return {
    getTokenTrackingService: () => tokenTracking,
  };
});

const gateConfigs = new Map<string, { name: string; enabled: boolean; required: boolean; weight: number; timeout: number }>([
  [
    'linting',
    {
      name: 'linting',
      enabled: true,
      required: true,
      weight: 5,
      timeout: 1000,
    },
  ],
]);

const qualityGateValidator = {
  getAllGateConfigs: () => gateConfigs,
  getGateConfig: (gate: string) => gateConfigs.get(gate),
  updateGateConfig: (gate: string, updates: Partial<{ enabled: boolean }>) => {
    const existing = gateConfigs.get(gate);
    if (existing) {
      gateConfigs.set(gate, { ...existing, ...updates });
    }
  },
  validateTask: async () => ({
    taskId: 'task-123',
    passed: true,
    overallScore: 100,
    gates: [],
    duration: 1,
    timestamp: new Date().toISOString(),
  }),
};

vi.mock('../../src/services/qualityGates.js', () => {
  return {
    getQualityGateValidator: () => qualityGateValidator,
    resetQualityGateValidator: () => gateConfigs.clear(),
    QualityGateValidator: class {},
  };
});

vi.mock('../../src/services/taskTemplateValidator.js', () => ({
  validateTaskTemplate: () => ({ isValid: true, warnings: [] }),
  formatValidationErrors: () => [],
  shouldValidateAsV3Template: () => false,
}));

vi.mock('../../src/services/taskLogLocator.js', () => ({
  WorkerLogLocator: class {
    async getDescriptor() {
      return null;
    }
  },
}));

vi.mock('../../src/services/logStreamAccessTracker.js', () => ({
  LogStreamAccessTracker: class {
    tryAcquire() {
      return true;
    }
    release() {}
  },
}));

vi.mock('../../src/utils/portManager.js', () => ({
  getDockerContainerInfo: async () => ({
    running: true,
    name: 'job-finder-local-build',
    containerId: 'container-1',
    workerStatus: 'running',
  }),
  stopDockerContainer: async () => true,
  getPortInfo: async (port: number) => ({
    port,
    pid: 1234,
    inUse: port === 4000,
  }),
  killPortProcess: async () => true,
}));

vi.mock('child_process', async () => {
  const { EventEmitter } = await import('events');
  return {
    spawn: () => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      setImmediate(() => proc.emit('close', 0));
      return proc;
    },
    exec: (_cmd: string, _options: unknown, callback?: (error: Error | null, stdout: string, stderr: string) => void) => {
      if (typeof _options === 'function') {
        (_options as (error: Error | null, stdout: string, stderr: string) => void)(null, '', '');
      } else if (callback) {
        callback(null, '', '');
      }
      return {} as unknown;
    },
    execFile: (_file: string, _args: unknown, _options: unknown, callback?: (error: Error | null, stdout: string, stderr: string) => void) => {
      if (typeof _args === 'function') {
        (_args as (error: Error | null, stdout: string, stderr: string) => void)(null, '', '');
      } else if (typeof _options === 'function') {
        (_options as (error: Error | null, stdout: string, stderr: string) => void)(null, '', '');
      } else if (callback) {
        callback(null, '', '');
      }
      return {} as unknown;
    },
  };
});

const verificationMocks = vi.hoisted(() => {
  const MOCK_TASK_ID = 'task-123';
  const MOCK_SOCKET_ID = 'socket-test-1';

  interface _VerificationResultPayload {
    taskId: string;
    passed: boolean;
    acceptanceCriteria: {
      percentMet: number;
      criteria: Array<{ text: string; met: boolean }>;
    };
    testCoverage: {
      meetsThreshold: boolean;
      threshold: number;
      passed: boolean;
    };
    scopeBoundaries: {
      passed: boolean;
      violationCount: number;
      violations: Array<{ file: string; message?: string }>;
      gitDiff: {
        filesChanged: string[];
        filesCreated: string[];
        filesDeleted: string[];
        filesModified: string[];
        totalChanges: number;
        violations: Array<{ file: string }>;
      };
    };
    overallScore: number;
    timestamp: string;
    recommendations: string[];
  }

  const baseVerificationResult: _VerificationResultPayload = {
    taskId: MOCK_TASK_ID,
    passed: true,
    acceptanceCriteria: {
      percentMet: 80,
      criteria: [
        { text: 'Add integration tests', met: false },
        { text: 'Document edge cases', met: true },
      ],
    },
    testCoverage: {
      meetsThreshold: false,
      threshold: 90,
      passed: false,
    },
    scopeBoundaries: {
      passed: false,
      violationCount: 1,
      violations: [{ file: 'src/server.ts', message: 'Unexpected change' }],
      gitDiff: {
        filesChanged: ['src/server.ts'],
        filesCreated: [],
        filesDeleted: [],
        filesModified: ['src/server.ts'],
        totalChanges: 2,
        violations: [{ file: 'src/server.ts' }],
      },
    },
    overallScore: 82,
    timestamp: new Date('2024-01-01T00:00:00Z').toISOString(),
    recommendations: ['Tighten scope boundaries'],
  };

  const verificationResults = new Map<string, VerificationResultPayload>([
    [MOCK_TASK_ID, structuredClone(baseVerificationResult)],
  ]);

  const verificationTask = {
    id: MOCK_TASK_ID,
    title: 'Verify API suite',
    status: 'pending',
    output: 'Task completed successfully',
  };

  const tasksByStatus: Record<string, typeof verificationTask[]> = {
    pending: [verificationTask],
    running: [],
    completed: [],
    failed: [],
  };

  const mockDatabase = {
    getVerificationResult: vi.fn((taskId: string) => {
      const result = verificationResults.get(taskId);
      return result ? structuredClone(result) : null;
    }),
    storeVerificationResult: vi.fn((result: VerificationResultPayload) => {
      verificationResults.set(result.taskId, structuredClone(result));
    }),
  };

  const mockTaskQueue = {
    getTask: (taskId: string) => (taskId === verificationTask.id ? verificationTask : null),
    getTasksByStatus: (status: string) => tasksByStatus[status] ?? [],
  };

  const mockVerificationService = {
    verifyTask: vi.fn(async (task: typeof verificationTask) => {
      return {
        ...structuredClone(baseVerificationResult),
        taskId: task.id,
        passed: true,
        acceptanceCriteria: {
          percentMet: 100,
          criteria: baseVerificationResult.acceptanceCriteria.criteria.map((criterion) => ({
            ...criterion,
            met: true,
          })),
        },
        testCoverage: {
          ...baseVerificationResult.testCoverage,
          meetsThreshold: true,
          passed: true,
        },
        scopeBoundaries: {
          ...baseVerificationResult.scopeBoundaries,
          passed: true,
          violationCount: 0,
          violations: [],
        },
        overallScore: 99,
        timestamp: new Date().toISOString(),
        recommendations: ['All verification checks passed'],
      };
    }),
  };

  return {
    MOCK_TASK_ID,
    MOCK_SOCKET_ID,
    baseVerificationResult,
    verificationResults,
    mockDatabase,
    mockTaskQueue,
    mockVerificationService,
  };
});

type VerificationResultPayload = ReturnType<typeof verificationMocks>['baseVerificationResult'];

const {
  MOCK_TASK_ID,
  MOCK_SOCKET_ID,
  baseVerificationResult,
  verificationResults,
  mockDatabase,
  mockVerificationService,
} = verificationMocks;

describe('API Integration Suite', () => {
  let server: Server;
  let deps: MockServerDependencies;

  beforeAll(async () => {
    if (!createApiTestServer) {
      ({ createApiTestServer } = await import('../../helpers/createApiTestServer.js'));
    }
    const databaseModule = await import('../../../src/services/database.js');
    vi.spyOn(databaseModule, 'getDatabase').mockReturnValue(verificationMocks.mockDatabase as any);

    const taskQueueModule = await import('../../../src/services/taskQueue.factory.js');
    vi.spyOn(taskQueueModule, 'getTaskQueueService').mockReturnValue(verificationMocks.mockTaskQueue as any);
    vi.spyOn(taskQueueModule, 'setTaskQueueService').mockImplementation(() => {});
    vi.spyOn(taskQueueModule, 'resetTaskQueueService').mockImplementation(() => {});

    const verificationServiceModule = await import('../../../src/services/taskVerification.service.js');
    vi.spyOn(verificationServiceModule, 'getTaskVerificationService').mockReturnValue(
      verificationMocks.mockVerificationService as any,
    );
    vi.spyOn(verificationServiceModule, 'resetTaskVerificationService').mockImplementation(() => {});

    const context = await createApiTestServer();
    server = context.server;
    deps = context.deps;
    deps.connectionManager.register({ id: MOCK_SOCKET_ID } as { id: string });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  type HttpMethod = 'get' | 'post' | 'put' | 'delete';

  const call = async (
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
    body?: unknown,
  ) => {
    const agent = request(server);
    const req = agent[method](url);
    if (body) {
      return req.send(body);
    }
    return req;
  };

  type EndpointTest = {
    name: string;
    method: HttpMethod;
    url: string;
    body?: unknown;
    expectStatus?: number;
    assert?: (res: SupertestResponse) => void;
  };

  const runEndpointTests = (tests: EndpointTest[]) => {
    tests.forEach(({ name, method, url, body, expectStatus = 200, assert }) => {
      it(name, async () => {
        const res = await call(method, url, body);
        expect(res.status).toBe(expectStatus);
        assert?.(res);
      });
    });
  };

  describe('Core endpoints', () => {
    runEndpointTests([
      {
        name: 'GET /api/health',
        method: 'get',
        url: '/api/health',
        assert: (res) => {
          const body: HealthCheckApiResponse = res.body;
          expect(body.success).toBe(true);
          expect(body.data.status).toBe('ok');
        },
      },
    ]);
  });

  describe('Docker management', () => {
    runEndpointTests([
      {
        name: 'GET /api/docker/container-info',
        method: 'get',
        url: '/api/docker/container-info',
        assert: (res) => {
          const body: DockerInfoResponse = res.body;
          expect(body.success).toBe(true);
          expect(body.data.name).toBeDefined();
        },
      },
      {
        name: 'POST /api/docker/start',
        method: 'post',
        url: '/api/docker/start',
        assert: (res) => {
          const body: DockerActionResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'POST /api/docker/stop',
        method: 'post',
        url: '/api/docker/stop',
        assert: (res) => {
          const body: DockerActionResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'POST /api/docker/restart',
        method: 'post',
        url: '/api/docker/restart',
        assert: (res) => {
          const body: DockerActionResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
    ]);
  });

  describe('Socket diagnostics', () => {
    runEndpointTests([
      {
        name: 'GET /api/socket/stats',
        method: 'get',
        url: '/api/socket/stats',
        assert: (res) => {
          expect(res.body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/socket/connections',
        method: 'get',
        url: '/api/socket/connections',
        assert: (res) => {
          expect(res.body.success).toBe(true);
          expect(Array.isArray(res.body.connections)).toBe(true);
          expect(res.body.connections.some((conn: { socketId: string }) => conn.socketId === MOCK_SOCKET_ID)).toBe(true);
          expect(res.body.count).toBeGreaterThanOrEqual(1);
        },
      },
      {
        name: `GET /api/socket/connections/${MOCK_SOCKET_ID}`,
        method: 'get',
        url: `/api/socket/connections/${MOCK_SOCKET_ID}`,
        assert: (res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.connection?.socketId).toBe(MOCK_SOCKET_ID);
        },
      },
      {
        name: 'GET /api/socket/connections/unknown',
        method: 'get',
        url: '/api/socket/connections/unknown',
        expectStatus: 404,
      },
    ]);
  });

  describe('Token tracking', () => {
    runEndpointTests([
      {
        name: 'GET /api/token-tracking/summary',
        method: 'get',
        url: '/api/token-tracking/summary',
        assert: (res) => {
          const body: TokenSummariesResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/token-tracking/summary/claude',
        method: 'get',
        url: '/api/token-tracking/summary/claude',
        assert: (res) => {
          const body: TokenSummaryResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/token-tracking/budget/claude',
        method: 'get',
        url: '/api/token-tracking/budget/claude',
        assert: (res) => {
          const body: TokenBudgetResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'PUT /api/token-tracking/budget',
        method: 'put',
        url: '/api/token-tracking/budget',
        body: {
          provider: 'claude',
          dailyLimit: 20000,
          costPerMillionInput: 3,
          costPerMillionOutput: 15,
          warningThreshold: 80,
        },
        assert: (res) => {
          const body: TokenBudgetUpdateResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/token-tracking/can-use/claude',
        method: 'get',
        url: '/api/token-tracking/can-use/claude',
        assert: (res) => {
          const body: TokenCanUseResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/token-tracking/remaining/claude',
        method: 'get',
        url: '/api/token-tracking/remaining/claude',
        assert: (res) => {
          const body: TokenRemainingResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'POST /api/token-tracking/reset',
        method: 'post',
        url: '/api/token-tracking/reset',
        assert: (res) => {
          const body: TokenResetResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
    ]);
  });

  describe('Quality gates', () => {
    runEndpointTests([
      {
        name: 'GET /api/quality-gates/config',
        method: 'get',
        url: '/api/quality-gates/config',
        assert: (res) => {
          const body: QualityGateConfigsResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/quality-gates/config/linting',
        method: 'get',
        url: '/api/quality-gates/config/linting',
        assert: (res) => {
          const body: QualityGateConfigResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'PUT /api/quality-gates/config/linting',
        method: 'put',
        url: '/api/quality-gates/config/linting',
        body: { enabled: true },
        assert: (res) => {
          const body: QualityGateUpdateResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'POST /api/quality-gates/validate',
        method: 'post',
        url: '/api/quality-gates/validate',
        body: { taskId: 'task-1', workspacePath: '/tmp', project: 'dev-monitor' },
        assert: (res) => {
          const body: QualityGateValidationResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'POST /api/quality-gates/config/reset',
        method: 'post',
        url: '/api/quality-gates/config/reset',
        assert: (res) => {
          const body: QualityGateResetResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/quality-gates/status',
        method: 'get',
        url: '/api/quality-gates/status',
        assert: (res) => {
          const body: QualityGateStatusResponse = res.body;
          expect(body.success).toBe(true);
        },
      },
    ]);
  });

  describe('Verification API', () => {
    beforeEach(() => {
      verificationResults.clear();
      verificationResults.set(MOCK_TASK_ID, structuredClone(baseVerificationResult));
      mockVerificationService.verifyTask.mockClear();
      mockDatabase.getVerificationResult.mockClear();
      mockDatabase.storeVerificationResult.mockClear();
    });

    runEndpointTests([
      {
        name: `GET /api/verification/task/${MOCK_TASK_ID}`,
        method: 'get',
        url: `/api/verification/task/${MOCK_TASK_ID}`,
        assert: (res) => {
          expect(res.body.status).toBe('success');
          expect(res.body.data.taskId).toBe(MOCK_TASK_ID);
        },
      },
      {
        name: 'GET /api/verification/task/unknown returns 404',
        method: 'get',
        url: '/api/verification/task/unknown',
        expectStatus: 404,
      },
      {
        name: `GET /api/verification/recommendations/${MOCK_TASK_ID}`,
        method: 'get',
        url: `/api/verification/recommendations/${MOCK_TASK_ID}`,
        assert: (res) => {
          expect(res.body.status).toBe('success');
          expect(Array.isArray(res.body.data.recommendations)).toBe(true);
          expect(res.body.data.recommendations.length).toBeGreaterThan(1);
        },
      },
      {
        name: 'GET /api/verification/stats',
        method: 'get',
        url: '/api/verification/stats',
        assert: (res) => {
          expect(res.body.status).toBe('success');
          expect(res.body.data.totalTasks).toBeGreaterThan(0);
          expect(res.body.data.totalVerified).toBeGreaterThanOrEqual(0);
        },
      },
      {
        name: `POST /api/verification/verify/${MOCK_TASK_ID}`,
        method: 'post',
        url: `/api/verification/verify/${MOCK_TASK_ID}`,
        body: { workspacePath: '/tmp/workspace' },
        assert: (res) => {
          expect(res.body.status).toBe('success');
          expect(res.body.data.taskId).toBe(MOCK_TASK_ID);
          expect(res.body.data.acceptanceCriteria.percentMet).toBe(100);
          expect(mockVerificationService.verifyTask).toHaveBeenCalledOnce();
        },
      },
    ]);
  });

  describe('Dev-Bots status & lifecycle', () => {
    runEndpointTests([
      {
        name: 'GET /api/dev-bots/status',
        method: 'get',
        url: '/api/dev-bots/status',
        assert: (res) => {
          const body: DevBotsStatus | undefined = res.body?.data;
          expect(body?.systemStatus).toBe('running');
        },
      },
      {
        name: 'GET /api/dev-bots/health',
        method: 'get',
        url: '/api/dev-bots/health',
        assert: (res) => {
          expect(res.body?.data?.healthy).toBe(true);
        },
      },
      {
        name: 'POST /api/dev-bots/start',
        method: 'post',
        url: '/api/dev-bots/start',
      },
      {
        name: 'POST /api/dev-bots/stop',
        method: 'post',
        url: '/api/dev-bots/stop',
      },
    ]);
  });

  describe('Dev-Bots tasks', () => {
    runEndpointTests([
      {
        name: 'GET /api/dev-bots/tasks',
        method: 'get',
        url: '/api/dev-bots/tasks',
        assert: (res) => {
          expect(Array.isArray(res.body?.data?.pending)).toBe(true);
        },
      },
      {
        name: 'GET /api/dev-bots/queue',
        method: 'get',
        url: '/api/dev-bots/queue',
        assert: (res) => {
          expect(Array.isArray(res.body?.data?.items)).toBe(true);
        },
      },
      {
        name: `GET /api/dev-bots/tasks/${MOCK_TASK_ID}/detail`,
        method: 'get',
        url: `/api/dev-bots/tasks/${MOCK_TASK_ID}/detail`,
        assert: (res) => {
          expect(res.body?.data?.task?.id).toBe(MOCK_TASK_ID);
        },
      },
      {
        name: `GET /api/dev-bots/tasks/${MOCK_TASK_ID}/logs`,
        method: 'get',
        url: `/api/dev-bots/tasks/${MOCK_TASK_ID}/logs`,
        assert: (res) => {
          expect(res.body?.data?.taskId).toBe(MOCK_TASK_ID);
          expect(res.body?.data?.stdout).toBeNull();
          expect(res.body?.data?.stderr).toBeNull();
        },
      },
      {
        name: `GET /api/dev-bots/tasks/${MOCK_TASK_ID}/logs/stdout`,
        method: 'get',
        url: `/api/dev-bots/tasks/${MOCK_TASK_ID}/logs/stdout`,
        expectStatus: 404,
      },
      // NOTE: POST /api/dev-bots/tasks endpoint was removed - task creation now
      // happens through specialized endpoints like /tasks/minimal
      // {
      //   name: 'POST /api/dev-bots/tasks',
      //   method: 'post',
      //   url: '/api/dev-bots/tasks',
      //   body: {
      //     type: 'implementation',
      //     title: 'Add integration tests',
      //     documentation: 'Detailed plan for integration testing to stabilize server startup.',
      //     acceptanceCriteria: ['All endpoints tested'],
      //     files: ['src/server.ts'],
      //   },
      //   assert: (res) => {
      //     // In non-production environments, task creation is blocked and returns stubbed response
      //     // In production, it would return 'Task added successfully'
      //     expect(res.body?.data?.message).toMatch(/Task (added|creation stubbed)/);
      //     expect(res.body?.data?.task).toBeDefined();

      //     // If stubbed (non-production), verify stub structure
      //     if (res.body?.data?.task?.stubbed) {
      //       expect(res.body?.data?.task?.id).toMatch(/^stub-/);
      //       expect(res.body?.data?.task?.reason).toContain('non-production');
      //     }
      //   },
      // },
      {
        name: 'GET /api/dev-bots/tasks/completed',
        method: 'get',
        url: '/api/dev-bots/tasks/completed',
      },
      {
        name: 'GET /api/dev-bots/metrics',
        method: 'get',
        url: '/api/dev-bots/metrics',
        assert: (res) => {
          expect(res.body?.data?.metrics).toBeDefined();
        },
      },
      {
        name: 'GET /api/dev-bots/agent-comparison',
        method: 'get',
        url: '/api/dev-bots/agent-comparison',
        assert: (res) => {
          expect(res.body?.data?.comparison).toBeDefined();
        },
      },
      {
        name: `POST /api/dev-bots/tasks/${MOCK_TASK_ID}/timeout`,
        method: 'post',
        url: `/api/dev-bots/tasks/${MOCK_TASK_ID}/timeout`,
        body: { reason: 'Test timeout' },
        assert: (res) => {
          expect(res.body.success).toBe(true);
        },
      },
      {
        name: 'POST /api/dev-bots/validate',
        method: 'post',
        url: '/api/dev-bots/validate',
        body: {
          type: 'implementation',
          title: 'Validate request',
        },
        assert: (res) => {
          expect(res.body?.data?.valid).toBe(true);
        },
      },
    ]);
  });

  describe('Dev-Bots configuration resources', () => {
    runEndpointTests([
      {
        name: 'POST /api/dev-bots/assign',
        method: 'post',
        url: '/api/dev-bots/assign',
        assert: (res) => {
          expect(res.body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/dev-bots/agents',
        method: 'get',
        url: '/api/dev-bots/agents',
        assert: (res) => {
          expect(Array.isArray(res.body.data?.agents)).toBe(true);
        },
      },
      {
        name: 'GET /api/dev-bots/agents/valid',
        method: 'get',
        url: '/api/dev-bots/agents/valid',
        assert: (res) => {
          expect(Array.isArray(res.body.data?.validAgents)).toBe(true);
        },
      },
      {
        name: 'GET /api/dev-bots/templates',
        method: 'get',
        url: '/api/dev-bots/templates',
        assert: (res) => {
          expect(Array.isArray(res.body.data?.templates)).toBe(true);
        },
      },
      {
        name: 'GET /api/dev-bots/guidelines',
        method: 'get',
        url: '/api/dev-bots/guidelines',
        assert: (res) => {
          expect(res.body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/dev-bots/guidelines/implementation',
        method: 'get',
        url: '/api/dev-bots/guidelines/implementation',
        assert: (res) => {
          expect(res.body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/dev-bots/examples/implementation',
        method: 'get',
        url: '/api/dev-bots/examples/implementation',
        assert: (res) => {
          expect(res.body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/dev-bots/checklist/implementation',
        method: 'get',
        url: '/api/dev-bots/checklist/implementation',
        assert: (res) => {
          expect(res.body.success).toBe(true);
        },
      },
      {
        name: 'GET /api/dev-bots/projects',
        method: 'get',
        url: '/api/dev-bots/projects',
        assert: (res) => {
          expect(Array.isArray(res.body.data?.projects)).toBe(true);
        },
      },
    ]);
  });

  describe('Dev-Bots data management', () => {
    runEndpointTests([
      // NOTE: POST /api/dev-bots/export and import endpoints were removed
      // {
      //   name: 'POST /api/dev-bots/export',
      //   method: 'post',
      //   url: '/api/dev-bots/export',
      //   body: { path: '/tmp/export.json' },
      //   expectStatus: 410,
      // },
      // {
      //   name: 'POST /api/dev-bots/import',
      //   method: 'post',
      //   url: '/api/dev-bots/import',
      //   body: { path: '/tmp/export.json' },
      //   expectStatus: 410,
      // },
      // NOTE: POST /api/dev-bots/onboarding/complete endpoint was removed
      // {
      //   name: 'POST /api/dev-bots/onboarding/complete',
      //   method: 'post',
      //   url: '/api/dev-bots/onboarding/complete',
      //   body: { workerId: 'worker-1' },
      // },
      {
        name: 'GET /api/dev-bots/workspace-sync/status',
        method: 'get',
        url: '/api/dev-bots/workspace-sync/status',
      },
      {
        name: 'POST /api/dev-bots/workspace-sync/trigger',
        method: 'post',
        url: '/api/dev-bots/workspace-sync/trigger',
        body: { repositories: ['dev-monitor'] },
      },
    ]);
  });

  describe('Dev-Bots maintenance & recovery', () => {
    runEndpointTests([
      {
        name: 'GET /api/dev-bots/docker/status',
        method: 'get',
        url: '/api/dev-bots/docker/status',
      },
      {
        name: 'POST /api/dev-bots/docker/revalidate',
        method: 'post',
        url: '/api/dev-bots/docker/revalidate',
      },
      {
        name: 'POST /api/dev-bots/docker/cleanup',
        method: 'post',
        url: '/api/dev-bots/docker/cleanup',
      },
      {
        name: 'GET /api/dev-bots/containers/container-1/health',
        method: 'get',
        url: '/api/dev-bots/containers/container-1/health',
      },
      {
        name: 'GET /api/dev-bots/cleanup-status',
        method: 'get',
        url: '/api/dev-bots/cleanup-status',
      },
      {
        name: 'POST /api/dev-bots/trigger-cleanup',
        method: 'post',
        url: '/api/dev-bots/trigger-cleanup',
      },
      {
        name: 'GET /api/dev-bots/scope-violations',
        method: 'get',
        url: '/api/dev-bots/scope-violations',
      },
      {
        name: 'POST /api/dev-bots/emergency-recovery',
        method: 'post',
        url: '/api/dev-bots/emergency-recovery',
      },
    ]);
  });

  describe.skip('Dev-Bots interactive sessions', () => {
    runEndpointTests([
      {
        name: 'POST /api/dev-bots/interactive/session',
        method: 'post',
        url: '/api/dev-bots/interactive/session',
        body: { modelProvider: 'claude', modelName: '3-opus' },
        expectStatus: 201,
        assert: (res) => {
          expect(res.body.success).toBe(true);
        },
      },
      {
        name: 'POST /api/dev-bots/interactive/input',
        method: 'post',
        url: '/api/dev-bots/interactive/input',
        body: { sessionId: 'session-1', input: 'ls' },
        expectStatus: 200,
        assert: (res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toHaveProperty('accepted');
        },
      },
      {
        name: 'POST /api/dev-bots/interactive/heartbeat',
        method: 'post',
        url: '/api/dev-bots/interactive/heartbeat',
        body: { sessionId: 'session-1' },
        expectStatus: 200,
        assert: (res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toHaveProperty('acknowledged');
        },
      },
      {
        name: 'POST /api/dev-bots/interactive/interrupt',
        method: 'post',
        url: '/api/dev-bots/interactive/interrupt',
        body: { sessionId: 'session-1' },
        expectStatus: 200,
        assert: (res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toHaveProperty('interrupted');
        },
      },
      {
        name: 'DELETE /api/dev-bots/interactive/session',
        method: 'delete',
        url: '/api/dev-bots/interactive/session',
        expectStatus: 200,
      },
    ]);
  });
});
