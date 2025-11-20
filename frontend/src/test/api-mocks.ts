/**
 * API Contract Mock Factory
 *
 * Provides comprehensive mocking utilities for all API endpoints using api-contracts.
 * This ensures mocks stay in sync with actual API types and contracts.
 */

import { vi } from 'vitest';
import type {
  ApiSuccess,
  ApiError,
  HealthCheckResponse,
  PortStatusMap,
  PortKillResponse,
  DevBotsStatus,
  DevBotsTask,
  DevBotsTaskCollections,
  DevBotsWorkerStatus,
  DevBotsAgentComparison,
  DevBotsAgentMetrics,
  DevBotsInteractiveSessionState,
  DevBotsInteractiveSession,
} from '@app-monitor/api-contracts';
import type { DevBotsQueueSummary, DevBotsSettings } from '../types/dev-bots';
import { setApiClientInstance, type ApiClientAdapter } from '../services/api';

type MockedApiMethod = ReturnType<typeof vi.fn>;
export type MockApiClient = ApiClientAdapter & {
  get: MockedApiMethod;
  post: MockedApiMethod;
  put: MockedApiMethod;
  delete: MockedApiMethod;
  patch: MockedApiMethod;
};

// Type-safe success response helper
export const apiSuccess = <T>(data: T): ApiSuccess<T> => ({
  success: true,
  data,
});

// Type-safe error response helper
export const apiError = (
  error: string,
  message?: string,
  code?: string,
  details?: Record<string, unknown>
): ApiError => ({
  success: false,
  error,
  ...(message ? { message } : {}),
  ...(code ? { code } : {}),
  ...(details ? { details } : {}),
});

// Mock data generators using api-contracts types
export const mockGenerators = {
  healthCheck: (overrides?: Partial<HealthCheckResponse>): HealthCheckResponse => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: 3600,
    ...overrides,
  }),

  portInfo: (port: number = 3000, inUse: boolean = true) => ({
    port,
    pid: inUse ? 12345 : null,
    inUse,
  }),

  portStatusMap: (services: string[] = ['test-service']): PortStatusMap => {
    const map: PortStatusMap = {};
    services.forEach((service, index) => {
      map[service] = [mockGenerators.portInfo(3000 + index, true)];
    });
    return map;
  },

  portKillResponse: (port: number = 3000, success: boolean = true): PortKillResponse => ({
    success,
    message: success ? `Port ${port} killed successfully` : `Failed to kill port ${port}`,
    port,
    pid: success ? 12345 : null,
    wasInUse: true,
  }),

  devBotsWorkerStatus: (
    id: string = 'worker-1',
    overrides?: Partial<DevBotsWorkerStatus>
  ): DevBotsWorkerStatus => ({
    id,
    status: 'idle',
    lastSeen: Date.now(),
    onboardingComplete: true,
    lastOnboardingCheck: Date.now() - 3600000,
    ...overrides,
  }),

  devBotsTask: (overrides?: Partial<DevBotsTask>): DevBotsTask => ({
    id: 'task-1',
    type: 'implementation',
    description: 'Test task description',
    status: 'pending',
    createdAt: new Date().toISOString(),
    assignedAgent: 'claude',
    ...overrides,
  }),

  devBotsTaskCollections: (): DevBotsTaskCollections => ({
    pending: [
      mockGenerators.devBotsTask({ id: 'task-1', status: 'pending' }),
      mockGenerators.devBotsTask({ id: 'task-2', status: 'pending' }),
    ],
    active: [
      mockGenerators.devBotsTask({
        id: 'task-3',
        status: 'active',
        assignedWorker: 'worker-1',
      }),
    ],
    completed: [
      mockGenerators.devBotsTask({
        id: 'task-4',
        status: 'completed',
        completedAt: new Date().toISOString(),
      }),
    ],
  }),

  devBotsStatus: (overrides?: Partial<DevBotsStatus>): DevBotsStatus => ({
    systemStatus: 'running',
    workers: {
      'worker-1': mockGenerators.devBotsWorkerStatus('worker-1', { status: 'idle' }),
      'worker-2': mockGenerators.devBotsWorkerStatus('worker-2', { status: 'busy' }),
    },
    queueSize: 2,
    activeTasks: 1,
    uptime: 3600,
    workerCount: 2,
    maxWorkers: 5,
    activeWorkerTypes: ['automation'],
    availableWorkerTypes: ['automation', 'interactive'],
    tasks: mockGenerators.devBotsTaskCollections(),
    ...overrides,
  }),

  devBotsAgentMetrics: (overrides?: Partial<DevBotsAgentMetrics>): DevBotsAgentMetrics => ({
    total: 100,
    completed: 85,
    failed: 15,
    success_rate: 85.0,
    avg_duration_ms: 120000,
    ...overrides,
  }),

  devBotsAgentComparison: (): DevBotsAgentComparison => ({
    claude: mockGenerators.devBotsAgentMetrics({
      total: 100,
      completed: 90,
      failed: 10,
      success_rate: 90.0,
    }),
    codex: mockGenerators.devBotsAgentMetrics({
      total: 80,
      completed: 65,
      failed: 15,
      success_rate: 81.25,
    }),
    task_type_breakdown: {
      claude: {
        implementation: mockGenerators.devBotsAgentMetrics({ total: 50, completed: 48 }),
        testing: mockGenerators.devBotsAgentMetrics({ total: 30, completed: 28 }),
        documentation: mockGenerators.devBotsAgentMetrics({ total: 20, completed: 19 }),
      },
      codex: {
        implementation: mockGenerators.devBotsAgentMetrics({ total: 40, completed: 35 }),
        testing: mockGenerators.devBotsAgentMetrics({ total: 25, completed: 20 }),
        documentation: mockGenerators.devBotsAgentMetrics({ total: 15, completed: 10 }),
      },
    },
  }),

  devBotsInteractiveSession: (
    overrides?: Partial<DevBotsInteractiveSession>
  ): DevBotsInteractiveSession => ({
    id: 'session-1',
    ownerEmail: 'test@example.com',
    modelProvider: 'anthropic',
    modelName: 'claude-sonnet-4',
    status: 'running',
    containerId: 'container-1',
    startedAt: new Date().toISOString(),
    lastUserActivityAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    idleTimeoutSeconds: 1800,
    ...overrides,
  }),

  devBotsInteractiveSessionState: (
    hasSession: boolean = true
  ): DevBotsInteractiveSessionState => ({
    session: hasSession ? mockGenerators.devBotsInteractiveSession() : null,
    availableModels: [
      {
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        displayName: 'Claude Sonnet 4',
        description: 'Most capable model',
        default: true,
      },
      {
        provider: 'anthropic',
        model: 'claude-haiku-4',
        displayName: 'Claude Haiku 4',
        description: 'Fast and efficient',
      },
    ],
    heartbeatIntervalSeconds: 60,
    idleTimeoutSeconds: 1800,
    ...(hasSession
      ? {
          stream: {
            sessionId: 'session-1',
            url: 'ws://localhost:5000/api/dev-bots/interactive/session/session-1/stream',
          },
        }
      : {}),
  }),

  devBotsQueueSummary: (): DevBotsQueueSummary => {
    const tasks = mockGenerators.devBotsTaskCollections();
    return {
      items: [
        ...tasks.pending.map((task) => ({ task, bucket: 'pending' as const })),
        ...tasks.active.map((task) => ({ task, bucket: 'active' as const })),
        ...tasks.completed.map((task) => ({ task, bucket: 'completed' as const })),
      ],
      counts: {
        pending: tasks.pending.length,
        active: tasks.active.length,
        completed: tasks.completed.length,
        failed: 0,
      },
      lastUpdated: new Date().toISOString(),
    };
  },

  devBotsSettings: (overrides?: Partial<DevBotsSettings>): DevBotsSettings => ({
    maxWorkers: 5,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),
};

/**
 * Creates a complete mock API client that uses api-contracts types
 */
export const createMockApiClient = (): MockApiClient => {
  const mockApiClient: MockApiClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  };

  return mockApiClient;
};

/**
 * Creates a mock API client with predefined responses for common endpoints
 */
export const createConfiguredMockApiClient = (): MockApiClient => {
  const mockApiClient = createMockApiClient();

  // Configure common endpoint responses
  mockApiClient.get.mockImplementation((url: string) => {
    if (url === '/health') {
      return Promise.resolve(apiSuccess(mockGenerators.healthCheck()));
    }
    if (url === '/services/status') {
      return Promise.resolve(
        apiSuccess([
          mockGenerators.processInfo({ name: 'service-1', status: 'running' }),
          mockGenerators.processInfo({ name: 'service-2', status: 'stopped' }),
        ])
      );
    }
    if (url.startsWith('/services/') && url.endsWith('/status')) {
      const serviceName = url.split('/')[2];
      return Promise.resolve(apiSuccess(mockGenerators.processInfo({ name: serviceName })));
    }
    if (url === '/environments') {
      return Promise.resolve(apiSuccess(mockGenerators.environmentsResponse()));
    }
    if (url === '/ports/status') {
      return Promise.resolve(apiSuccess(mockGenerators.portStatusMap()));
    }
    if (url === '/logs/sources') {
      return Promise.resolve(
        apiSuccess([
          mockGenerators.logSource({ id: 'source-1', name: 'app' }),
          mockGenerators.logSource({ id: 'source-2', name: 'worker' }),
        ])
      );
    }
    if (url === '/logs/cloud/status') {
      return Promise.resolve(apiSuccess(mockGenerators.cloudLoggingStatus()));
    }
    if (url === '/dev-bots/status') {
      return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
    }
    if (url === '/dev-bots/agent-comparison') {
      return Promise.resolve(
        apiSuccess({ comparison: mockGenerators.devBotsAgentComparison() })
      );
    }
    if (url === '/dev-bots/interactive/session') {
      return Promise.resolve(apiSuccess(mockGenerators.devBotsInteractiveSessionState(false)));
    }

    // Default response
    return Promise.resolve(apiSuccess({}));
  });

  mockApiClient.post.mockImplementation((url: string) => {
    if (url.includes('/start')) {
      const serviceName = url.split('/')[2];
      return Promise.resolve(
        apiSuccess(mockGenerators.processInfo({ name: serviceName, status: 'starting' }))
      );
    }
    if (url.includes('/stop')) {
      const serviceName = url.split('/')[2];
      return Promise.resolve(
        apiSuccess(mockGenerators.processInfo({ name: serviceName, status: 'stopping' }))
      );
    }
    if (url.includes('/restart')) {
      const serviceName = url.split('/')[2];
      return Promise.resolve(
        apiSuccess(mockGenerators.processInfo({ name: serviceName, status: 'starting' }))
      );
    }
    if (url.includes('/ports/') && url.endsWith('/kill')) {
      const port = parseInt(url.split('/')[2], 10);
      return Promise.resolve(apiSuccess(mockGenerators.portKillResponse(port)));
    }

    return Promise.resolve(apiSuccess({}));
  });

  return mockApiClient;
};

export const installMockApiClient = (client: MockApiClient = createConfiguredMockApiClient()) => {
  setApiClientInstance(client);
  return client;
};

/**
 * Mock Socket.IO client for testing real-time features
 */
export const createMockSocketClient = () => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const mockSocket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)?.push(handler);
      return mockSocket;
    }),
    off: vi.fn((event: string, handler?: (...args: unknown[]) => void) => {
      if (handler) {
        const handlers = listeners.get(event) || [];
        listeners.set(
          event,
          handlers.filter((h) => h !== handler)
        );
      } else {
        listeners.delete(event);
      }
      return mockSocket;
    }),
    emit: vi.fn((_event: string, ..._args: unknown[]) => {
      return mockSocket;
    }),
    connect: vi.fn(() => {
      mockSocket.connected = true;
      const connectHandlers = listeners.get('connect') || [];
      connectHandlers.forEach((handler) => handler());
      return mockSocket;
    }),
    disconnect: vi.fn(() => {
      mockSocket.connected = false;
      const disconnectHandlers = listeners.get('disconnect') || [];
      disconnectHandlers.forEach((handler) => handler());
      return mockSocket;
    }),
    close: vi.fn(),
    connected: false,
    id: 'mock-socket-id',

    // Test utilities
    _trigger: (event: string, ...args: unknown[]) => {
      const handlers = listeners.get(event) || [];
      handlers.forEach((handler) => handler(...args));
    },
    _listeners: listeners,
  };

  return mockSocket;
};

/**
 * Creates a full mock environment with API client and Socket.IO
 */
export const createMockEnvironment = () => {
  const apiClient = createConfiguredMockApiClient();
  const socket = createMockSocketClient();

  return {
    apiClient,
    socket,
    applyApiMocks: () => installMockApiClient(apiClient),
    // Helper to simulate API success
    respondWith: <T>(data: T) => apiSuccess(data),
    // Helper to simulate API error
    respondWithError: (error: string, message?: string) => apiError(error, message),
    // Helper to trigger socket events
    triggerSocketEvent: (event: string, ...args: unknown[]) => {
      socket._trigger(event, ...args);
    },
  };
};
