/**
 * Shared test utilities for DevBotsManager tests
 * Consolidates common mocks and setup code
 */

import { vi } from 'vitest';

/**
 * Setup all mocks for DevBotsManager tests
 * Call this in your test file setup
 */
export function setupDevBotsMocks() {
  // Mock ProcessManager
  vi.mock('../processManager.js', () => ({
    ProcessManager: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      emit: vi.fn(),
      getStatus: vi.fn().mockResolvedValue({ status: 'running' }),
      getAllStatuses: vi.fn().mockResolvedValue({})
    }))
  }));

  // Mock AgentPersonalityManager
  vi.mock('../agentPersonalities.js', () => ({
    AgentPersonalityManager: vi.fn().mockImplementation(() => ({
      getPersonality: vi.fn().mockReturnValue({
        id: 'test-agent',
        name: 'Test Agent'
      })
    }))
  }));

  // Mock TaskPromptTemplateManager
  vi.mock('../taskPromptTemplates.js', () => ({
    TaskPromptTemplateManager: vi.fn().mockImplementation(() => ({
      getTemplate: vi.fn().mockReturnValue('Test template'),
      getAllTemplates: vi.fn().mockReturnValue([])
    }))
  }));

  // Mock TaskCreationGuidelinesManager
  vi.mock('../taskCreationGuidelines.js', () => ({
    TaskCreationGuidelinesManager: vi.fn().mockImplementation(() => ({
      getGuidelines: vi.fn().mockReturnValue('Test guidelines')
    }))
  }));

  // Mock WorkspaceSyncManager
  vi.mock('../workspaceSyncManager.js', () => ({
    WorkspaceSyncManager: vi.fn().mockImplementation(() => ({
      sync: vi.fn().mockResolvedValue(undefined)
    }))
  }));

  // Mock RetryManager
  vi.mock('../retryManager.js', () => ({
    RetryManager: vi.fn().mockImplementation(() => ({
      shouldRetry: vi.fn().mockReturnValue(true),
      recordAttempt: vi.fn(),
      reset: vi.fn()
    }))
  }));

  // Mock DockerManager
  vi.mock('../dockerManager.js', () => ({
    DockerManager: vi.fn().mockImplementation(() => ({
      createContainer: vi.fn().mockResolvedValue('container-123'),
      startContainer: vi.fn().mockResolvedValue(undefined),
      stopContainer: vi.fn().mockResolvedValue(undefined),
      removeContainer: vi.fn().mockResolvedValue(undefined),
      inspectContainer: vi.fn().mockResolvedValue({
        State: { Status: 'running' }
      })
    }))
  }));

  // Mock logger
  vi.mock('../../utils/logger.js', () => ({
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }
  }));
}

/**
 * Create a mock task for testing
 */
export function createMockTask(overrides: Partial<any> = {}) {
  return {
    id: 'task-123',
    description: 'Test task',
    title: 'Test Task',
    status: 'pending',
    priority: 'medium',
    createdAt: new Date().toISOString(),
    assignedWorkerId: null,
    agentType: 'claude',
    baseBranch: 'main',
    ...overrides
  };
}

/**
 * Create a mock worker for testing
 */
export function createMockWorker(overrides: Partial<any> = {}) {
  return {
    id: 'worker-123',
    containerId: 'container-123',
    status: 'idle',
    assignedTaskId: null,
    agentType: 'claude',
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Wait for async operations to complete
 */
export function waitForAsync(ms: number = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
