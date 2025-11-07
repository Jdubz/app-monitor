/**
 * DevBotsManager Mock Implementations
 *
 * Mock implementations of all DevBotsManager dependencies for testing.
 * Use these to create testable DevBotsManager instances.
 */

import { vi } from 'vitest';
import type Docker from 'dockerode';
import type { ProcessManager } from './processManager.js';
import type { TaskQueueService, Task } from './taskQueue.sqlite.js';
import type { AgentPersonalityManager, AgentPersonality } from './agentPersonalities.js';
import type { TaskPromptTemplateManager } from './taskPromptTemplates.js';
import type { TaskCreationGuidelinesManager } from './taskCreationGuidelines.js';
import type { WorkspaceSyncManager } from './workspaceSyncManager.js';
import type { DockerManager } from './dockerManager.js';
import type { RetryManager } from './retryManager.js';
import type { TaskPersistence } from './taskPersistence.js';
import type { WorkspaceOrchestrator, WorkspaceContext } from './workspaceOrchestrator.js';
import type { DevBotsManagerDependencies } from './devBotsManager.interfaces.js';
import type { ScopeControlService } from './scopeControl.service.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { TaskExecutionService } from './taskExecution.service.js';
import type { TaskCompletionService } from './taskCompletion.service.js';
import { EventEmitter } from 'events';

/**
 * Create mock ProcessManager
 */
export function createMockProcessManager(): ProcessManager {
  const mock = new EventEmitter() as any;
  mock.on = vi.fn().mockReturnThis();
  mock.emit = vi.fn();
  mock.getStatus = vi.fn().mockResolvedValue({ status: 'running' });
  mock.getAllStatuses = vi.fn().mockResolvedValue({});
  mock.startService = vi.fn().mockResolvedValue({ success: true });
  mock.stopService = vi.fn().mockResolvedValue({ success: true });
  return mock as ProcessManager;
}

/**
 * Create mock Docker
 */
export function createMockDocker(): Docker {
  const mockContainer = {
    inspect: vi.fn().mockResolvedValue({ State: { Running: true } }),
    start: vi.fn().mockResolvedValue({}),
    stop: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue({}),
    exec: vi.fn().mockResolvedValue({
      start: vi.fn().mockResolvedValue({}),
    }),
    attach: vi.fn().mockResolvedValue({
      on: vi.fn(),
      destroy: vi.fn(),
    }),
    wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
  };

  return {
    ping: vi.fn().mockResolvedValue({}),
    version: vi.fn().mockResolvedValue({ Version: '24.0.0' }),
    info: vi.fn().mockResolvedValue({}),
    listContainers: vi.fn().mockResolvedValue([]),
    createContainer: vi.fn().mockResolvedValue(mockContainer),
    getContainer: vi.fn().mockReturnValue(mockContainer),
  } as any;
}

/**
 * Create mock DockerManager
 */
export function createMockDockerManager(): DockerManager {
  return {
    getDocker: vi.fn().mockReturnValue(createMockDocker()),
    isDockerAvailable: vi.fn().mockResolvedValue(true),
    validateDockerEnvironment: vi.fn().mockResolvedValue({
      isAvailable: true,
      isConnected: true,
      hasRequiredImages: true,
      version: '24.0.0',
      warnings: [],
      errors: [],
    }),
    createContainer: vi.fn().mockResolvedValue({ id: 'test-container' }),
    startContainer: vi.fn().mockResolvedValue({ success: true }),
    stopContainer: vi.fn().mockResolvedValue({ success: true }),
    removeContainer: vi.fn().mockResolvedValue({ success: true }),
    inspectContainer: vi.fn().mockResolvedValue({}),
  } as any;
}

/**
 * Create mock TaskQueueService
 */
export function createMockTaskQueue(): TaskQueueService {
  const mockTasks = new Map<string, Task>();

  return {
    addTask: vi.fn((task: Partial<Task>) => {
      const newTask = {
        id: task.id || 'test-task-1',
        type: task.type || 'feature',
        title: task.title || 'Test Task',
        description: task.description || 'Test Description',
        status: 'pending',
        priority: task.priority || 5,
        created_at: Date.now(),
        assigned_agent: task.assigned_agent || 'general',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
      } as Task;
      mockTasks.set(newTask.id, newTask);
      return newTask;
    }),
    getTask: vi.fn((id: string) => mockTasks.get(id) || null),
    updateTask: vi.fn((id: string, updates: Partial<Task>) => {
      const task = mockTasks.get(id);
      if (task) {
        Object.assign(task, updates);
      }
    }),
    deleteTask: vi.fn((id: string) => {
      mockTasks.delete(id);
    }),
    getAllTasks: vi.fn(() => Array.from(mockTasks.values())),
    getPendingTasks: vi.fn(() =>
      Array.from(mockTasks.values()).filter(t => t.status === 'pending')
    ),
    getRunningTasks: vi.fn(() =>
      Array.from(mockTasks.values()).filter(t => t.status === 'running')
    ),
    getCompletedTasks: vi.fn(() =>
      Array.from(mockTasks.values()).filter(t => t.status === 'completed')
    ),
    getFailedTasks: vi.fn(() =>
      Array.from(mockTasks.values()).filter(t => t.status === 'failed')
    ),
    getRepairBotsForTask: vi.fn(() => []),
    detectStalledWorkers: vi.fn(() => []),
    runRecoveryMigration: vi.fn().mockResolvedValue(undefined),
    checkDuplicateTask: vi.fn().mockResolvedValue(null),
  } as any;
}

/**
 * Create mock AgentPersonalityManager
 */
export function createMockAgentManager(): AgentPersonalityManager {
  const testAgent: AgentPersonality = {
    id: 'test-agent',
    name: 'Test Agent',
    role: 'Backend Engineer',
    description: 'Test agent for testing',
    specialties: ['Testing', 'TypeScript'],
    expertise: {
      primary: ['Testing'],
      secondary: ['TypeScript'],
      tools: ['vitest', 'typescript']
    },
    personality: {
      communicationStyle: 'technical',
      approach: 'methodical',
      focus: 'quality'
    },
    onboarding: {
      requiredReading: [],
      setupSteps: [],
      validationChecks: []
    },
    taskPreferences: {
      preferredTypes: ['testing', 'implementation'],
      avoidedTypes: ['deployment'],
      complexityRange: 'any'
    }
  };

  return {
    getPersonality: vi.fn().mockReturnValue(testAgent),
    getAllPersonalities: vi.fn().mockReturnValue([testAgent]),
    getPersonalityByType: vi.fn().mockReturnValue(testAgent),
    selectAgentForTask: vi.fn().mockReturnValue(testAgent),
  } as any;
}

/**
 * Create mock TaskPromptTemplateManager
 */
export function createMockTemplateManager(): TaskPromptTemplateManager {
  return {
    buildTaskPrompt: vi.fn().mockReturnValue('Test prompt for task'),
    buildOnboardingPrompt: vi.fn().mockReturnValue('Test onboarding prompt'),
  } as any;
}

/**
 * Create mock TaskCreationGuidelinesManager
 */
export function createMockGuidelinesManager(): TaskCreationGuidelinesManager {
  return {
    validateTaskData: vi.fn().mockReturnValue({
      isValid: true,
      warnings: [],
      suggestions: [],
      errors: [],
    }),
    getGuidelinesForType: vi.fn().mockReturnValue({ type: 'feature', guidelines: [] }),
  } as any;
}

/**
 * Create mock WorkspaceSyncManager
 */
export function createMockWorkspaceSyncManager(): WorkspaceSyncManager {
  return {
    syncWorkspace: vi.fn().mockResolvedValue({ success: true }),
    getSyncStatus: vi.fn().mockReturnValue({ status: 'synced' }),
  } as any;
}

/**
 * Create mock RetryManager
 */
export function createMockRetryManager(): RetryManager {
  const mock = new EventEmitter() as any;
  mock.on = vi.fn().mockReturnThis();
  mock.emit = vi.fn();
  mock.canRetryTask = vi.fn().mockReturnValue(true);
  mock.retryTask = vi.fn().mockImplementation((task: any) => ({
    success: true,
    task: { ...task, status: 'pending' },
    retryAttempt: { attemptNumber: 1, timestamp: new Date().toISOString(), reason: 'Manual retry' }
  }));
  mock.getRetryHistory = vi.fn().mockReturnValue([]);
  mock.getRetryStats = vi.fn().mockReturnValue({ totalRetries: 0, successfulRetries: 0, failedRetries: 0 });
  mock.updateConfig = vi.fn();
  mock.clearRetryHistory = vi.fn();
  mock.clearAllRetries = vi.fn();
  mock.getConfig = vi.fn().mockReturnValue({ max_retries: 3 });
  return mock as RetryManager;
}

/**
 * Create mock TaskPersistence
 */
export function createMockTaskPersistence(): TaskPersistence {
  return {
    loadTasks: vi.fn().mockReturnValue([]),
    saveCompletedTasks: vi.fn().mockResolvedValue(undefined),
    saveTask: vi.fn().mockResolvedValue(undefined),
    loadTask: vi.fn().mockReturnValue(null),
  } as any;
}

/**
 * Create mock WorkspaceOrchestrator
 */
export function createMockWorkspaceOrchestrator(): WorkspaceOrchestrator {
  const mockWorkspace: WorkspaceContext = {
    id: 'workspace-test',
    hostPath: '/tmp/workspace',
    branchName: 'bots/task-core',
    mirrorPath: '/tmp/mirror',
    createdAt: new Date().toISOString(),
  };

  return {
    initialize: vi.fn(),
    createWorkspace: vi.fn().mockResolvedValue(mockWorkspace),
    sealWorkspace: vi.fn().mockResolvedValue({
      status: 'success',
      branchName: 'bots/task-core',
      commitSha: 'abc123',
    }),
    cleanupWorkspace: vi.fn().mockResolvedValue(undefined),
    createPatchArtifact: vi.fn().mockReturnValue('/tmp/workspace.patch'),
  } as any;
}

/**
 * Create mock ScopeControlService
 */
export function createMockScopeControl(): ScopeControlService {
  return {
    checkScopeViolations: vi.fn().mockReturnValue([]),
    isolateContext: vi.fn(),
    getBaselineContext: vi.fn().mockReturnValue({
      allowedFiles: ['existing-files-only'],
      maxComplexity: 'simple',
      forbiddenPatterns: ['create', 'new'],
      scope: 'minimal'
    }),
    trackViolationChain: vi.fn(),
    checkCleanupSchedules: vi.fn().mockReturnValue([]),
    createCleanupTask: vi.fn().mockReturnValue({
      id: 'cleanup-task-1',
      type: 'cleanup',
      title: 'Test Cleanup Task',
      description: 'Test cleanup',
      status: 'pending',
      created_at: Date.now(),
      assigned_agent: 'backend-specialist',
      priority: 5,
      can_retry: true,
      retry_count: 0,
      max_retries: 3,
      timeout_ms: null
    }),
  } as any;
}

/**
 * Create mock EphemeralWorkerService
 */
export function createMockEphemeralWorkerService(): EphemeralWorkerService {
  const mockWorker = {
    id: 'test-worker-1',
    containerId: 'container-123',
    agent: {
      id: 'test-agent',
      name: 'Test Agent',
    },
    task: {
      id: 'test-task-1',
      title: 'Test Task',
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    workspace: {
      id: 'workspace-1',
      hostPath: '/tmp/workspace',
      branchName: 'staging',
      mirrorPath: '',
      createdAt: new Date().toISOString(),
    }
  };

  return {
    getActiveWorkers: vi.fn().mockReturnValue([mockWorker]),
    getWorker: vi.fn().mockReturnValue(mockWorker),
    getAllWorkers: vi.fn().mockReturnValue(new Map([['test-worker-1', mockWorker]])),
    clearAllWorkers: vi.fn(),
    canCreateWorker: vi.fn().mockReturnValue(true),
    createWorker: vi.fn().mockResolvedValue(mockWorker),
    executeTask: vi.fn().mockResolvedValue({
      success: true,
      output: 'Test output',
      errorOutput: '',
      exitCode: 0,
    }),
    destroyWorker: vi.fn().mockResolvedValue(undefined),
    destroyAllWorkers: vi.fn().mockResolvedValue(undefined),
    cleanupStuckTaskContainers: vi.fn().mockResolvedValue(undefined),
  } as any;
}

/**
 * Create mock TaskExecutionService
 */
export function createMockTaskExecutionService(): TaskExecutionService {
  return {
    assignNextTask: vi.fn().mockResolvedValue(undefined),
    setRecovery: vi.fn(),
  } as any;
}

/**
 * Create mock TaskCompletionService
 */
export function createMockTaskCompletionService(): TaskCompletionService {
  return {
    completeEphemeralTask: vi.fn().mockResolvedValue(undefined),
    failEphemeralTask: vi.fn().mockResolvedValue(undefined),
  } as any;
}

/**
 * Create complete mock dependencies for DevBotsManager
 */
export function createMockDevBotsManagerDependencies(): DevBotsManagerDependencies {
  const processManager = createMockProcessManager();
  const dockerManager = createMockDockerManager();
  const docker = createMockDocker();
  const taskQueue = createMockTaskQueue();
  const agentManager = createMockAgentManager();
  const templateManager = createMockTemplateManager();
  const guidelinesManager = createMockGuidelinesManager();
  const workspaceSyncManager = createMockWorkspaceSyncManager();
  const retryManager = createMockRetryManager();
  const workspaceOrchestrator = createMockWorkspaceOrchestrator();
  const taskPersistence = createMockTaskPersistence();
  const scopeControl = createMockScopeControl();
  const ephemeralWorkerService = createMockEphemeralWorkerService();
  const taskExecutionService = createMockTaskExecutionService();
  const taskCompletionService = createMockTaskCompletionService();

  return {
    processManager,
    dockerManager,
    docker,
    taskQueue,
    agentManager,
    templateManager,
    guidelinesManager,
    workspaceSyncManager,
    retryManager,
    workspaceOrchestrator,
    taskPersistence,
    scopeControl,
    ephemeralWorkerService,
    taskExecutionService,
    taskCompletionService,
    recovery: null as any, // Will be created by DevBotsManager
  };
}
