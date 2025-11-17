/**
 * DevBotsManager Mock Implementations
 *
 * Mock implementations of all DevBotsManager dependencies for testing.
 * Use these to create testable DevBotsManager instances.
 */

import { vi } from 'vitest';
import type Docker from 'dockerode';
import type { TaskQueueService, Task } from './taskQueue.sqlite.js';
import type { AgentPersonalityManager, AgentPersonality } from './agentPersonalities.js';
import type { TaskPromptTemplateManager } from './taskPromptTemplates.js';
import type { TaskCreationGuidelinesManager } from './taskCreationGuidelines.js';
import type { WorkspaceSyncManager } from './workspaceSyncManager.js';
import type { DockerManager } from './dockerManager.js';
import type { RetryManager } from './retryManager.js';
import type { TaskPersistence } from './taskPersistence.js';
// WorkspaceOrchestrator removed - using container isolation instead
import type { DevBotsManagerDependencies } from './devBotsManager.interfaces.js';
import type { ScopeControlService } from './scopeControl.service.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { TaskExecutionService } from './taskExecution.service.js';
import type { TaskCompletionService } from './taskCompletion.service.js';
import type { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';
import type { InteractiveSessionService } from './interactiveSession.service.js';
import type { InteractiveSessionOrchestrator } from './interactiveSessionOrchestrator.js';
import type { InteractiveSessionStreamManager } from './interactiveSessionStreamManager.js';
import type { TaskCreationService } from './taskCreation.service.js';
import type { StatusAggregationService } from './statusAggregation.service.js';
import type { RetryCoordinationService } from './retryCoordination.service.js';
import type { SystemLifecycleService } from './systemLifecycle.service.js';
import type { SystemInitializationService } from './systemInitialization.service.js';
import type { InteractiveSessionCoordinator } from './interactiveSessionCoordinator.service.js';
import type { InfoQueryService } from './infoQuery.service.js';
import { EventEmitter } from 'events';

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
  } as unknown as Docker;
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
  } as unknown as DockerManager;
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
    recoverOrphanedTasks: vi.fn(() => []),
    checkDuplicateTask: vi.fn().mockResolvedValue(null),
    getQueueMetrics: vi.fn().mockReturnValue({
      pending: 0,
      active: 0,
      completed: 0,
      failed: 0,
      totalTasks: 0,
      avgWaitTime: 0,
      avgExecutionTime: 0
    }),
    getDatabase: vi.fn().mockReturnValue({
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([]),
        get: vi.fn().mockReturnValue(null),
        run: vi.fn().mockReturnValue({ changes: 0 })
      })
    }),
  } as unknown as TaskQueueService;
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
  } as unknown as AgentPersonalityManager;
}

/**
 * Create mock TaskPromptTemplateManager
 */
export function createMockTemplateManager(): TaskPromptTemplateManager {
  return {
    buildTaskPrompt: vi.fn().mockReturnValue('Test prompt for task'),
    buildOnboardingPrompt: vi.fn().mockReturnValue('Test onboarding prompt'),
  } as unknown as TaskPromptTemplateManager;
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
  } as unknown as TaskCreationGuidelinesManager;
}

/**
 * Create mock TaskCreationService
 */
export function createMockTaskCreationService(): TaskCreationService {
  return {
    createTask: vi.fn().mockImplementation(async (taskData: Record<string, unknown>) => {
      return {
        task: {
          id: taskData.id || `task-${Date.now()}`,
          type: taskData.type || 'feature',
          title: taskData.title || 'Test Task',
          description: taskData.description || 'Test Description',
          status: 'pending',
          created_at: Date.now(),
          assignedAgent: taskData.assignedAgent || taskData.assigned_agent || 'general'
        },
        validation: {
          isValid: true,
          warnings: [],
          suggestions: [],
          errors: []
        }
      };
    }),
    calculateTaskFingerprint: vi.fn().mockReturnValue('abc123def456')
  } as unknown as TaskCreationService;
}

/**
 * Create mock StatusAggregationService
 */
export function createMockStatusAggregationService(): StatusAggregationService {
  return {
    getSystemStatus: vi.fn().mockResolvedValue({
      systemStatus: 'running',
      workers: {},
      queueSize: 0,
      activeTasks: 0,
      uptime: 1000,
      workerCount: 0,
      maxWorkers: 2,
      activeWorkerTypes: [],
      availableWorkerTypes: ['slot-1', 'slot-2'],
      tasks: { pending: [], active: [], completed: [] }
    }),
    getTasks: vi.fn().mockResolvedValue({
      pending: [],
      active: [],
      completed: []
    })
  } as unknown as StatusAggregationService;
}

/**
 * Create mock RetryCoordinationService
 */
export function createMockRetryCoordinationService(): RetryCoordinationService {
  return {
    handleTaskRetry: vi.fn().mockResolvedValue(undefined),
    retryTask: vi.fn().mockResolvedValue({
      success: true,
      message: 'Task queued for retry'
    }),
    cancelRetry: vi.fn().mockReturnValue({
      success: false,
      message: 'Manual retry cannot be cancelled once started'
    }),
    getRetryInfo: vi.fn().mockResolvedValue({
      canRetry: true,
      retryCount: 0,
      maxRetries: 3,
      retryHistory: [],
      scheduledRetries: []
    }),
    getRetryStats: vi.fn().mockReturnValue({
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      scheduledRetries: 0,
      retryConfig: { max_retries: 3 }
    }),
    getRetryManager: vi.fn().mockReturnValue(createMockRetryManager()),
    updateRetryConfig: vi.fn()
  } as unknown as RetryCoordinationService;
}

/**
 * Create mock SystemLifecycleService
 */
export function createMockSystemLifecycleService(): SystemLifecycleService {
  return {
    startSystem: vi.fn(),
    stopSystem: vi.fn().mockResolvedValue(undefined),
    isSystemHealthy: vi.fn().mockReturnValue(false),
    setSystemHealth: vi.fn(),
    updateComponents: vi.fn()
  } as unknown as SystemLifecycleService;
}

/**
 * Create mock SystemInitializationService
 */
export function createMockSystemInitializationService(): SystemInitializationService {
  return {
    components: {},
    initializeDockerEnvironment: vi.fn().mockResolvedValue(undefined),
    initializeAsync: vi.fn().mockResolvedValue(undefined),
    wireInteractiveStreamEvents: vi.fn(),
    getDockerValidationResult: vi.fn().mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
      info: {}
    }),
    getTaskQueueWorker: vi.fn().mockReturnValue(undefined),
    getMetricsEmitter: vi.fn().mockReturnValue(undefined)
  } as unknown as SystemInitializationService;
}

/**
 * Create mock InteractiveSessionCoordinator
 */
export function createMockInteractiveSessionCoordinator(): InteractiveSessionCoordinator {
  return {
    getActiveSession: vi.fn().mockReturnValue(null),
    getSession: vi.fn().mockReturnValue(null),
    listSessions: vi.fn().mockReturnValue([]),
    launchSession: vi.fn().mockResolvedValue({
      id: 'session-1',
      status: 'active',
      startedAt: new Date().toISOString()
    }),
    endSession: vi.fn().mockResolvedValue(undefined),
    sendInput: vi.fn(),
    sendSignal: vi.fn(),
    recordActivity: vi.fn(),
    updateContext: vi.fn(),
    getIdleTimeoutMs: vi.fn().mockReturnValue(300000),
    getAllowedModels: vi.fn().mockReturnValue([])
  } as unknown as InteractiveSessionCoordinator;
}

/**
 * Create mock CleanupCoordinator
 */
export function createMockCleanupCoordinator(): import('./cleanupCoordinator.service.js').CleanupCoordinator {
  return {
    getScopeViolations: vi.fn().mockResolvedValue([]),
    triggerEmergencyRecovery: vi.fn().mockResolvedValue({
      id: 'task-recovery-123',
      type: 'recovery',
      title: 'Emergency Recovery Task',
      description: 'Test recovery',
      status: 'pending',
      created_at: Date.now(),
      assigned_agent: 'backend-specialist'
    }),
    getCleanupStatus: vi.fn().mockResolvedValue({
      schedules: [],
      recentTasks: []
    }),
    triggerCleanup: vi.fn().mockResolvedValue({
      id: 'cleanup-task-123',
      type: 'cleanup',
      title: 'Test Cleanup Task',
      description: 'Test cleanup',
      status: 'pending',
      created_at: Date.now(),
      assigned_agent: 'backend-specialist'
    })
  } as unknown as import('./cleanupCoordinator.service.js').CleanupCoordinator;
}

/**
 * Create mock InfoQueryService
 */
export function createMockInfoQueryService(): InfoQueryService {
  return {
    getAgentPersonalities: vi.fn().mockReturnValue([]),
    getTaskTemplates: vi.fn().mockReturnValue([]),
    getTaskGuidelines: vi.fn().mockReturnValue({}),
    getTaskExample: vi.fn().mockReturnValue({}),
    getTaskChecklist: vi.fn().mockReturnValue([]),
    validateTaskData: vi.fn().mockReturnValue({ isValid: true, errors: [] }),
    getValidProjects: vi.fn().mockReturnValue([]),
    getValidAgents: vi.fn().mockReturnValue([]),
    getWorkerCount: vi.fn().mockReturnValue(0),
    getMaxWorkers: vi.fn().mockReturnValue(2)
  } as unknown as InfoQueryService;
}

/**
 * Create mock WorkspaceSyncManager
 */
export function createMockWorkspaceSyncManager(): WorkspaceSyncManager {
  return {
    syncWorkspace: vi.fn().mockResolvedValue({ success: true }),
    getSyncStatus: vi.fn().mockReturnValue({ status: 'synced' }),
  } as unknown as WorkspaceSyncManager;
}

/**
 * Create mock RetryManager
 */
export function createMockRetryManager(): RetryManager {
  const mock = new EventEmitter() as RetryManager & EventEmitter;
  mock.on = vi.fn().mockReturnThis();
  mock.emit = vi.fn();
  mock.canRetryTask = vi.fn().mockReturnValue(true);
  mock.retryTask = vi.fn().mockImplementation((task: Task) => ({
    success: true,
    task: { ...task, status: 'pending' as const },
    retryAttempt: { attemptNumber: 1, timestamp: new Date().toISOString(), reason: 'Manual retry' }
  }));
  mock.getRetryHistory = vi.fn().mockReturnValue([]);
  mock.getRetryStats = vi.fn().mockReturnValue({ totalRetries: 0, successfulRetries: 0, failedRetries: 0 });
  mock.updateConfig = vi.fn();
  mock.clearRetryHistory = vi.fn();
  mock.clearAllRetries = vi.fn();
  mock.getConfig = vi.fn().mockReturnValue({ max_retries: 3 });
  return mock;
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
  } as unknown as TaskPersistence;
}

/**
 * Create mock WorkspaceOrchestrator (REMOVED - keeping stub for tests)
 */
export function createMockWorkspaceOrchestrator(): Record<string, unknown> {
  const mockWorkspace: Record<string, unknown> = {
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
  };
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
  } as unknown as ScopeControlService;
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
  } as unknown as EphemeralWorkerService;
}

/**
 * Create mock TaskExecutionService
 */
export function createMockTaskExecutionService(): TaskExecutionService {
  return {
    assignNextTask: vi.fn().mockResolvedValue(undefined),
    setRecovery: vi.fn(),
  } as unknown as TaskExecutionService;
}

/**
 * Create mock TaskCompletionService
 */
export function createMockTaskCompletionService(): TaskCompletionService {
  return {
    completeEphemeralTask: vi.fn().mockResolvedValue(undefined),
    failEphemeralTask: vi.fn().mockResolvedValue(undefined),
  } as unknown as TaskCompletionService;
}

/**
 * Create complete mock dependencies for DevBotsManager
 */
export function createMockDevBotsManagerDependencies(): DevBotsManagerDependencies {
  const dockerManager = createMockDockerManager();
  const docker = createMockDocker();
  const taskQueue = createMockTaskQueue();
  const taskCreationService = createMockTaskCreationService();
  const statusAggregationService = createMockStatusAggregationService();
  const retryCoordinationService = createMockRetryCoordinationService();
  const systemLifecycleService = createMockSystemLifecycleService();
  const systemInitializationService = createMockSystemInitializationService();
  const interactiveSessionCoordinator = createMockInteractiveSessionCoordinator();
  const cleanupCoordinator = createMockCleanupCoordinator();
  const agentManager = createMockAgentManager();
  const templateManager = createMockTemplateManager();
  const guidelinesManager = createMockGuidelinesManager();
  const workspaceSyncManager = createMockWorkspaceSyncManager();
  const retryManager = createMockRetryManager();
  // workspaceOrchestrator removed
  // taskPersistence removed - using SQLite directly
  const scopeControl = createMockScopeControl();
  const ephemeralWorkerService = createMockEphemeralWorkerService();
  const taskExecutionService = createMockTaskExecutionService();
  const taskCompletionService = createMockTaskCompletionService();
  
  const infoQueryService = {
    getAgentPersonalities: vi.fn().mockReturnValue([]),
    getTaskTemplates: vi.fn().mockReturnValue({ universal: {} }),
    getTaskCreationGuidelines: vi.fn().mockReturnValue({ guidelines: {} }),
    getMaxWorkers: vi.fn().mockReturnValue(3),
    getActiveWorkers: vi.fn().mockReturnValue(0)
  } as unknown as InfoQueryService;

  return {
    dockerManager,
    docker,
    taskQueue,
    taskCreationService,
    statusAggregationService,
    retryCoordinationService,
    systemLifecycleService,
    systemInitializationService,
    interactiveSessionCoordinator,
    cleanupCoordinator,
    infoQueryService,
    agentManager,
    templateManager,
    guidelinesManager,
    workspaceSyncManager,
    retryManager,
    scopeControl,
    ephemeralWorkerService,
    taskExecutionService,
    taskCompletionService,
    prWorkflowOrchestrator: {
      handleTaskCompletion: vi.fn().mockResolvedValue(undefined),
      getMonitoredPRs: vi.fn().mockReturnValue([]),
      getStatus: vi.fn().mockReturnValue({
        monitoredPRs: 0,
        config: { enableAutoMerge: true }
      }),
      stop: vi.fn()
    } as unknown as PRWorkflowOrchestrator,
    interactiveSessionService: {
      createSession: vi.fn().mockReturnValue({
        id: 'session-1',
        status: 'active',
        startedAt: new Date().toISOString()
      }),
      getSessionById: vi.fn().mockReturnValue(null),
      endSession: vi.fn(),
      recordActivity: vi.fn(),
      getIdleTimeoutMs: vi.fn().mockReturnValue(300000),
      listActiveSessions: vi.fn().mockReturnValue([]),
      startIdleWatchdog: vi.fn()
    } as unknown as InteractiveSessionService,
    interactiveSessionOrchestrator: {
      start: vi.fn().mockResolvedValue('container-id'),
      stop: vi.fn().mockResolvedValue(undefined)
    } as unknown as InteractiveSessionOrchestrator,
    interactiveSessionStreamManager: {
      attach: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
      sendInput: vi.fn(),
      sendSignal: vi.fn(),
      resizePty: vi.fn().mockResolvedValue(undefined),
      getBacklog: vi.fn().mockReturnValue([]),
      on: vi.fn(),
      removeAllListeners: vi.fn()
    } as unknown as InteractiveSessionStreamManager,
    workerHealthMonitor: {
      start: vi.fn(),
      stop: vi.fn(),
      checkWorkerHealth: vi.fn().mockResolvedValue(true),
      isMonitorHealthy: vi.fn().mockReturnValue(true)
    } as unknown as import('./workerHealthMonitor.service.js').WorkerHealthMonitor,
  };
}
