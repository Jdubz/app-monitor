import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { ProcessManager, ProcessInfo } from './processManager.js';
import Docker from 'dockerode';
import type { TaskPersistence } from './taskPersistence.js';
import { TaskQueueService, Task, TaskStatus as SQLiteTaskStatus, TaskExecution } from './taskQueue.sqlite.js';
// Migration completed - SQLite is the only implementation now
import { AgentPersonalityManager, AgentPersonality } from './agentPersonalities.js';
import { TaskPromptTemplateManager } from './taskPromptTemplates.js';
import { TaskCreationGuidelinesManager } from './taskCreationGuidelines.js';
import { EnhancedTaskData } from './taskMetadataFields.js';
import { WorkspaceSyncManager, SyncOptions, SyncResult } from './workspaceSyncManager.js';
import { DockerManager, DockerValidationResult } from './dockerManager.js';
import { RetryManager, RetryConfig } from './retryManager.js';
import { getTokenTrackingService } from './tokenTracking.js';
// WorkspaceOrchestrator removed - using container isolation instead
import { MetricsEmitter } from './metricsEmitter.js';
import { TIME_BASED_GUARDS } from './taskFailureGuards.js';
import { SimpleFailureRecovery } from './failureRecovery.js';
import type { DevBotsManagerDependencies } from './devBotsManager.interfaces.js';
import type { ScopeControlService } from './scopeControl.service.js';
import type { EphemeralWorkerService, EphemeralWorker as EphemeralWorkerType } from './ephemeralWorker.service.js';
import type { TaskExecutionService } from './taskExecution.service.js';
import { TaskCompletionService } from './taskCompletion.service.js';
import type { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';
import {
  InteractiveSessionService,
  StartInteractiveSessionOptions,
  ActivityKind,
  type AllowedInteractiveModel,
} from './interactiveSession.service.js';
import { InteractiveSessionOrchestrator } from './interactiveSessionOrchestrator.js';
import { InteractiveSessionStreamManager, InteractiveStreamMessage } from './interactiveSessionStreamManager.js';
import type { InteractiveSessionRecord } from './database.js';
import type { WorkerHealthMonitor } from './workerHealthMonitor.service.js';

export interface RetryAttempt {
  attemptNumber: number;
  timestamp: string;
  reason: string;
  error?: string;
  exitCode?: number;
  duration?: number; // milliseconds
  workerId?: string;
  agentId?: string;
}

/**
 * @deprecated WorkerInfo is no longer used with ephemeral workers
 * Ephemeral workers are tracked by EphemeralWorkerService
 */
export interface WorkerInfo {
  id: string;
  status: 'idle' | 'busy' | 'stopped';
  lastSeen: number;
  personality: AgentPersonality;
  onboardingComplete: boolean;
  lastOnboardingCheck: number;
  currentTask?: string;
}

// TaskStatus and Task interface now imported from taskQueue.sqlite.ts (canonical source per Stabilization Plan)
// Re-export for compatibility with existing imports
export type TaskStatus = SQLiteTaskStatus;
export type { Task } from './taskQueue.sqlite.js';

// EphemeralWorker now managed by EphemeralWorkerService
// Re-export for backward compatibility
export type EphemeralWorker = EphemeralWorkerType;

export interface WorkerStatus {
  id: string;
  status: 'idle' | 'busy' | 'stopped';
  currentTask?: string;
  lastSeen: number;
  personality?: AgentPersonality; // New: agent personality
  onboardingComplete?: boolean; // New: onboarding status
  lastOnboardingCheck?: number; // New: last onboarding check timestamp
}

export interface DevBotsStatus {
  systemStatus: 'running' | 'stopped' | 'error';
  workers: Record<string, WorkerStatus>;
  queueSize: number;
  activeTasks: number;
  uptime: number;
  workerCount: number;
  maxWorkers: number;
  activeWorkerTypes: string[];
  availableWorkerTypes: string[];
  tasks: {
    pending: Task[];
    active: Task[];
    completed: Task[];
  };
}

// Scope control classes moved to scopeControl.service.ts

export class DevBotsManager extends EventEmitter {
  private processManager: ProcessManager;
  private docker: Docker;
  private dockerManager: DockerManager;
  private workerHealthMonitor!: WorkerHealthMonitor;
  private isCoordinatorHealthy: boolean = false;
  private dockerValidationResult?: DockerValidationResult;

  // Task management - DEPRECATED (now using SQLite)
  // private taskQueue: Task[] = [];
  // private activeTasks = new Map<string, Task>();
  // private completedTasks: Task[] = [];
  // private taskIdCounter = 1;
  // private taskFingerprints = new Map<string, string>();
  // private fileModificationLocks = new Map<string, string>();

  // Worker management - ephemeralWorkers managed by ephemeralWorkerService
  // Agent selection handled by AgentSelector (intelligent, task-aware selection)

  // Enhanced services
  // TaskPersistence removed - using SQLite directly
  private taskQueue!: TaskQueueService; // SQLite-based queue (replaces in-memory arrays)
  private agentManager!: AgentPersonalityManager;
  private templateManager!: TaskPromptTemplateManager;
  private guidelinesManager!: TaskCreationGuidelinesManager;
  private workspaceSyncManager!: WorkspaceSyncManager;
  private retryManager!: RetryManager;
  // WorkspaceOrchestrator and PushCoordinator removed - using container isolation
  private recovery!: SimpleFailureRecovery;
  private scopeControl!: ScopeControlService;
  private ephemeralWorkerService!: EphemeralWorkerService;
  private taskExecutionService!: TaskExecutionService;
  private taskCompletionService!: TaskCompletionService;
  private prWorkflowOrchestrator!: PRWorkflowOrchestrator;
  private interactiveSessionService!: InteractiveSessionService;
  private interactiveSessionOrchestrator!: InteractiveSessionOrchestrator;
  private interactiveSessionStreamManager!: InteractiveSessionStreamManager;
  private taskQueueWorker?: { start: () => void; stop: () => void }; // TaskQueueWorker (imported lazily to avoid circular deps)
  private metricsEmitter?: MetricsEmitter;

  // System state
  private startTime = Date.now();
  private maxWorkers: number;

  constructor(dependencies: DevBotsManagerDependencies) {
    super();

    // Inject all dependencies
    this.processManager = dependencies.processManager;
    this.dockerManager = dependencies.dockerManager;
    this.docker = dependencies.docker;
    this.taskQueue = dependencies.taskQueue;
    this.agentManager = dependencies.agentManager;
    this.templateManager = dependencies.templateManager;
    this.guidelinesManager = dependencies.guidelinesManager;
    this.workspaceSyncManager = dependencies.workspaceSyncManager;
    this.retryManager = dependencies.retryManager;
    // WorkspaceOrchestrator removed - using container isolation
    // TaskPersistence removed - using SQLite directly
    this.scopeControl = dependencies.scopeControl;
    this.ephemeralWorkerService = dependencies.ephemeralWorkerService;
    this.taskExecutionService = dependencies.taskExecutionService;
    this.prWorkflowOrchestrator = dependencies.prWorkflowOrchestrator;
    this.interactiveSessionService = dependencies.interactiveSessionService;
    this.interactiveSessionOrchestrator = dependencies.interactiveSessionOrchestrator;
    this.interactiveSessionStreamManager = dependencies.interactiveSessionStreamManager;
    this.workerHealthMonitor = dependencies.workerHealthMonitor;

    // Initialize maxWorkers from config
    this.maxWorkers = config.devBots.maxWorkers;

    // Initialize SimpleFailureRecovery
    this.recovery = new SimpleFailureRecovery(this);

    // Update WorkerHealthMonitor with recovery and emit function
    // Note: WorkerHealthMonitor is injected but needs recovery instance from DevBotsManager
    (this.workerHealthMonitor as any).recovery = this.recovery;
    (this.workerHealthMonitor as any).emit = this.emit.bind(this);

    // Initialize TaskCompletionService with PR workflow orchestrator callback
    // Create no-op implementations for removed dependencies
    const noopTaskPersistence = {
      saveCompletedTasks: () => {}, // No-op - SQLite is source of truth
      loadCompletedTasks: () => [],
      saveTask: () => {},
      saveTasks: () => {},
      loadTask: () => null,
      loadTasks: () => [],
      markDirty: () => {},
      needsSaving: () => false,
      exportTasks: () => {},
      importTasks: () => [],
      cleanupCompletedTasks: (tasks: Task[]) => tasks,
      destroy: () => {},
      shutdown: () => {},
      stopAutoSave: () => {}
    } as unknown as TaskPersistence;
    const noopPushCoordinator = {
      enqueue: async <T>(operation: () => Promise<T>) => await operation()
    };

    this.taskCompletionService = new TaskCompletionService(
      this.ephemeralWorkerService,
      noopTaskPersistence,
      noopPushCoordinator,
      this.emit.bind(this),
      {
        enableQualityGates: true,
        enableTaskVerification: true,  // Enable comprehensive task verification
        onPRCreated: (task: Task) => {
          // Handle PR workflow after task completion
          this.prWorkflowOrchestrator.handleTaskCompletion(task, task.output || '').catch(error => {
            logger.error({
              category: 'pr-workflow',
              action: 'handle_task_completion_error',
              message: `Error handling PR workflow for task ${task.id}`,
              error
            });
          });
        }
      }
    );

    // Wire recovery into task execution service
    this.taskExecutionService.setRecovery(this.recovery);

    // Validate Docker environment and initialize
    this.initializeDockerEnvironment();

    // Run async initialization (orphaned task recovery)
    void this.initializeAsync();

    // Listen for retry events
    this.retryManager.on('taskReadyForRetry', (task: Task) => {
      this.handleTaskRetry(task);
    });

    // Start monitoring loops (delegated to WorkerHealthMonitor)
    // this.workerHealthMonitor.start() is called in startSystem()

    // Listen for process status changes
    this.processManager.on('statusChange', (serviceName: string, status: ProcessInfo) => {
      if (serviceName === 'dev-bots') {
        this.emit('systemStatusChange', status);
        // Worker health is monitored by WorkerHealthMonitor
      }
    });
  }

  // Migration to SQLite completed - method removed

  /**
   * Initialize and validate Docker environment
   */
  private async initializeDockerEnvironment(): Promise<void> {
    try {
      logger.info({
      category: 'process',
      action: 'validating_docker_environment',
      message: 'Validating Docker environment...'
    });
      this.dockerValidationResult = await this.dockerManager.validateDockerEnvironment();

      if (!this.dockerValidationResult.isValid) {
        logger.error({
          category: 'process',
          action: 'docker_validation_failed',
          message: 'Docker validation failed',
          details: { errors: this.dockerValidationResult.errors }
        });
        this.emit('dockerError', {
          type: 'validation_failed',
          errors: this.dockerValidationResult.errors,
          message: 'Docker environment validation failed. Dev-Bots cannot start.'
        });
        return;
      }

      // Log warnings if any
      if (this.dockerValidationResult.warnings.length > 0) {
        logger.warn({
          category: 'process',
          action: 'docker_validation_warnings',
          message: 'Docker validation warnings',
          details: { warnings: this.dockerValidationResult.warnings }
        });
        this.emit('dockerWarning', {
          warnings: this.dockerValidationResult.warnings
        });
      }

      // Ensure required images are available
      logger.info({
      category: 'process',
      action: 'checking_required_docker_images',
      message: 'Checking required Docker images...'
    });
      const imageResult = await this.dockerManager.ensureRequiredImages();

      if (!imageResult.success) {
        logger.error({
          category: 'process',
          action: 'required_docker_images_not_available',
          message: 'Required Docker images not available',
          details: { errors: imageResult.errors }
        });
        this.emit('dockerError', {
          type: 'images_missing',
          errors: imageResult.errors,
          message: 'Required Docker images are not available'
        });
        return;
      }

      logger.info({
        category: 'process',
        action: 'docker_environment_validated_successfully',
        message: 'Docker environment validated successfully',
        details: { info: this.dockerValidationResult.info }
      });
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_initialize_docker_environment',
      message: 'Failed to initialize Docker environment:',
      error: error
    });
      this.emit('dockerError', {
        type: 'initialization_failed',
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to initialize Docker environment'
      });
    }
  }

  /**
   * Initialize async components (orphaned task recovery)
   * Dependencies are now injected, so this only runs startup recovery
   */
  private async initializeAsync(): Promise<void> {
    // Migration to SQLite completed - going straight to recovery

    // Recover orphaned tasks from previous server crash/restart
    const orphanedTaskIds = this.taskQueue.recoverOrphanedTasks();

    if (orphanedTaskIds.length > 0) {
      logger.warn({
        category: 'recovery',
        action: 'orphaned_tasks_recovered_on_startup',
        message: `Recovered ${orphanedTaskIds.length} orphaned tasks on startup`,
        details: {
          taskIds: orphanedTaskIds,
          willAttemptRecovery: true
        }
      });

      // Attempt recovery for each orphaned task
      for (const taskId of orphanedTaskIds) {
        const task = this.taskQueue.getTask(taskId);
        if (task && task.status === 'failed' && this.recovery) {
          try {
            const recoveryResult = await this.recovery.attemptRecovery({
              task: task as Task & { metadata?: Record<string, unknown> },
              failurePattern: {
                name: 'server_restart',
                description: 'Task was orphaned when server restarted or crashed',
                patterns: [],
                immediateFailure: false,
                category: 'system_error',
                suggestedFix: 'Task was orphaned due to server restart. Cleanup and retry.'
              },
              stderr: task.error || 'Task orphaned due to server restart',
              stdout: '',
              exitCode: -1
            });

            if (recoveryResult.recovered) {
              logger.info({
                category: 'recovery',
                action: 'orphaned_task_recovery_initiated',
                message: `Initiated recovery for orphaned task ${taskId}`,
                details: {
                  taskId,
                  cleanupTaskId: recoveryResult.cleanupTaskId
                }
              });
            }
          } catch (error) {
            logger.error({
              category: 'recovery',
              action: 'orphaned_task_recovery_failed',
              message: `Failed to attempt recovery for orphaned task ${taskId}`,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
    }

    logger.info({
      category: 'process',
      action: 'async_initialization_complete',
      message: 'Async initialization complete: orphaned task recovery finished'
    });

    // Start background task queue worker
    await this.startTaskQueueWorker();

    // Start metrics emitter
    this.startMetricsEmitter();

    // Start interactive session idle watchdog
    this.startInteractiveIdleWatchdog();
  }

  /**
   * Start background task queue worker
   */
  private async startTaskQueueWorker(): Promise<void> {
    try {
      // Dynamically import to avoid circular dependency
      const { TaskQueueWorker } = await import('./taskQueueWorker.js');

      this.taskQueueWorker = new TaskQueueWorker(this.taskExecutionService, {
        pollIntervalMs: 5000, // Poll every 5 seconds
        enabled: true,
        maxConsecutiveFailures: 10
      });

      await this.taskQueueWorker.start();

      logger.info({
        category: 'process',
        action: 'task_queue_worker_started',
        message: 'Background task queue worker started successfully'
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'task_queue_worker_start_failed',
        message: 'Failed to start background task queue worker',
        error
      });
    }
  }

  private startMetricsEmitter(): void {
    try {
      this.metricsEmitter = new MetricsEmitter(
        this.taskQueue,
        this.ephemeralWorkerService,
        60000
      );
      this.metricsEmitter.start();
      logger.info({
        category: 'process',
        action: 'metrics_emitter_started',
        message: 'Background metrics emitter started successfully'
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'metrics_emitter_start_failed',
        message: 'Failed to start metrics emitter',
        error
      });
    }
  }

  /**
   * Start heartbeat monitoring to detect stalled workers
   *
   * NOTE: Disabled for ephemeral containers (docker run --rm)
   * Ephemeral containers are monitored via Docker process exit codes instead.
   * This avoids false positives from containers that don't send heartbeats.
   *
   * If persistent workers are added in the future, re-enable this monitor.
   */
  // Health monitoring methods removed - now handled by WorkerHealthMonitor service

  private wireInteractiveStreamEvents(): void {
    this.interactiveSessionStreamManager.on('message', (message: InteractiveStreamMessage) => {
      if (message.kind === 'stdout' || message.kind === 'stderr') {
        try {
          this.interactiveSessionService.recordActivity(message.sessionId, 'agent');
        } catch (error) {
          logger.warn({
            category: 'system',
            action: 'activity_record_failed',
            message: `Failed to record agent activity for session ${message.sessionId}`,
            error,
          });
        }
      }
    });

    this.interactiveSessionStreamManager.on('error', ({ sessionId, error }) => {
      logger.error({
        category: 'system',
        action: 'stream_error',
        message: `Interactive stream error for session ${sessionId}`,
        error,
      });
      const session = this.interactiveSessionService.getSessionById(sessionId);
      if (session && session.status !== 'ended') {
        this.interactiveSessionService.endSession(sessionId, error.message, 'error');
      }
    });

    this.interactiveSessionStreamManager.on('closed', ({ sessionId, reason }) => {
      const session = this.interactiveSessionService.getSessionById(sessionId);
      if (session && session.status !== 'ended') {
        this.interactiveSessionService.setStatus(sessionId, 'disconnecting', {
          terminationReason: reason,
        });
      }
    });
  }

  /**
   * Start interactive session idle timeout watchdog
   * Delegated to InteractiveSessionService
   */
  private startInteractiveIdleWatchdog(): void {
    this.interactiveSessionService.startIdleWatchdog((sessionId, idleDuration) => {
      const idleTimeout = this.interactiveSessionService.getIdleTimeoutMs();
      logger.warn({
        category: 'system',
        action: 'idle_timeout',
        message: 'Interactive session exceeded idle timeout',
        details: {
          sessionId,
          idleDurationMs: idleDuration,
          idleTimeoutMs: idleTimeout,
        },
      });

      void this.endInteractiveSession(sessionId, 'Idle timeout (no activity)').catch((error) => {
        logger.error({
          category: 'system',
          action: 'idle_timeout_cleanup_failed',
          message: `Failed to stop idle interactive session ${sessionId}`,
          error,
        });
      });
    });
  }

  // cleanupStuckTaskContainers moved to EphemeralWorkerService

  /**
   * Get queue metrics for monitoring
   */
  public getQueueMetrics() {
    return this.taskQueue.getQueueMetrics();
  }

  /**
   * Get the task queue (for recovery orchestrator)
   */
  public getTaskQueue(): TaskQueueService {
    return this.taskQueue;
  }

  /**
   * Get task duration statistics
   */
  public getTaskDurationStats(daysBack: number = 30) {
    return this.taskQueue.getTaskDurationStats(daysBack);
  }

  /**
   * Get agent comparison metrics (Claude vs Codex)
   */
  public getAgentComparisonMetrics() {
    return this.taskQueue.getAgentComparisonMetrics();
  }

  // ============================================================================
  // Interactive Sessions
  // ============================================================================

  public getActiveInteractiveSession(): InteractiveSessionRecord | null {
    return this.interactiveSessionService.getActiveSession();
  }

  public getInteractiveSession(sessionId: string): InteractiveSessionRecord | null {
    return this.interactiveSessionService.getSessionById(sessionId);
  }

  public listInteractiveSessions(limit = 20): InteractiveSessionRecord[] {
    return this.interactiveSessionService.listRecentSessions(limit);
  }

  public async launchInteractiveSession(
    options: StartInteractiveSessionOptions,
  ): Promise<InteractiveSessionRecord> {
    const session = this.interactiveSessionService.startSession(options);
    try {
      const containerId = await this.interactiveSessionOrchestrator.start(session);
      this.interactiveSessionService.setStatus(session.id, 'running', { containerId });
      await this.interactiveSessionStreamManager.attach(session.id, containerId);
      const updated = this.interactiveSessionService.getSessionById(session.id);
      if (!updated) {
        throw new Error('Interactive session missing after launch');
      }
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Interactive session launch failed';
      this.interactiveSessionService.endSession(session.id, message, 'error');
      await this.interactiveSessionStreamManager.detach(session.id).catch(() => {
        /* noop */
      });
      throw error;
    }
  }

  public async endInteractiveSession(sessionId: string, reason?: string): Promise<void> {
    const session = this.interactiveSessionService.getSessionById(sessionId);
    if (session?.containerId) {
      await this.interactiveSessionOrchestrator.stop(session.containerId);
    }
    await this.interactiveSessionStreamManager.detach(sessionId);
    this.interactiveSessionService.endSession(sessionId, reason);
  }

  public sendInteractiveInput(sessionId: string, payload: string): void {
    this.interactiveSessionStreamManager.sendInput(sessionId, payload);
    this.interactiveSessionService.recordActivity(sessionId, 'user');
  }

  public sendInteractiveSignal(
    sessionId: string,
    signal: 'interrupt' | 'terminate' = 'interrupt',
  ): void {
    this.interactiveSessionStreamManager.sendSignal(sessionId, signal);
    this.interactiveSessionService.recordActivity(sessionId, 'user');
  }

  public recordInteractiveActivity(sessionId: string, kind: ActivityKind): void {
    this.interactiveSessionService.recordActivity(sessionId, kind);
  }

  public updateInteractiveContext(
    sessionId: string,
    contextSnapshot?: unknown,
    metadata?: Record<string, unknown>,
  ): void {
    this.interactiveSessionService.updateContext(sessionId, contextSnapshot, metadata);
  }

  public getInteractiveIdleTimeoutMs(): number {
    return this.interactiveSessionService.getIdleTimeoutMs();
  }

  public getAllowedInteractiveModels(): AllowedInteractiveModel[] {
    return this.interactiveSessionService.getAllowedModels();
  }

  /**
   * Manually timeout a task after verification
   */
  public manuallyTimeoutTask(taskId: string, reason: string) {
    this.taskQueue.manuallyTimeoutTask(taskId, reason);
    logger.info({
      category: 'process',
      action: 'task_manually_timed_out',
      message: `Task ${taskId} manually timed out`,
      details: { reason }
    });
  }

  // Health check methods removed - now handled by WorkerHealthMonitor service

  // Task Management Methods
  /**
   * Add a new task to the queue (unified method with SQLite)
   * Supports both simple and comprehensive task data
   */
  async addTask(taskData: EnhancedTaskData | {
    type: string;
    title: string;
    description?: string;
    documentation?: string;
    acceptanceCriteria?: string | string[];
    files?: string[];
    dependencies?: string[];
    project?: string;
    assignedAgent?: string;
    notes?: string;
    priority?: number;
    metadata?: {
      isRepairBot?: boolean;
      repairStage?: 'cleanup' | 'followup';
      originalTaskId?: string;
      cleanupTaskId?: string;
      originalFailurePattern?: string;
      countsTowardsConcurrencyLimit?: boolean;
      [key: string]: unknown;
    };
  }): Promise<{
    task: Task;
    validation: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
      suggestions: string[];
    };
  }> {
    // Normalize task data to EnhancedTaskData format
    const normalizedData: EnhancedTaskData = {
      type: taskData.type,
      title: taskData.title,
      description: ('description' in taskData && taskData.description) || '',
      documentation: ('documentation' in taskData && taskData.documentation) || '',
      notes: ('notes' in taskData && taskData.notes) || '',
      project: ('project' in taskData && taskData.project) || 'dev-monitor',
      assignedAgent: ('assignedAgent' in taskData && taskData.assignedAgent) || 'backend-specialist',
      files: ('files' in taskData && taskData.files) || [],
      dependencies: ('dependencies' in taskData && taskData.dependencies) || [],
      acceptanceCriteria: (() => {
        if ('acceptanceCriteria' in taskData) {
          if (Array.isArray(taskData.acceptanceCriteria)) {
            return taskData.acceptanceCriteria;
          }
          if (typeof taskData.acceptanceCriteria === 'string') {
            return [taskData.acceptanceCriteria];
          }
        }
        return [];
      })(),
      architectureReferences: ('architectureReferences' in taskData && taskData.architectureReferences) || [],
      longTermGoals: ('longTermGoals' in taskData && taskData.longTermGoals) || [],
      estimatedEffort: ('estimatedEffort' in taskData && taskData.estimatedEffort) || { hours: 1, complexity: 'simple' as const, confidence: 'medium' as const },
      prerequisites: ('prerequisites' in taskData && taskData.prerequisites) || [],
      contextBoundaries: ('contextBoundaries' in taskData && taskData.contextBoundaries) || { mustNotChange: [], mustNotAffect: [], integrationPoints: [] },
      validationSteps: ('validationSteps' in taskData && taskData.validationSteps) || [],
      rollbackPlan: ('rollbackPlan' in taskData && taskData.rollbackPlan) || [],
      successMetrics: ('successMetrics' in taskData && taskData.successMetrics) || [],
      testingRequirements: ('testingRequirements' in taskData && taskData.testingRequirements) || [],
      documentationRequirements: ('documentationRequirements' in taskData && taskData.documentationRequirements) || [],
      requiredSkills: ('requiredSkills' in taskData && taskData.requiredSkills) || [],
      relatedTasks: ('relatedTasks' in taskData && taskData.relatedTasks) || [],
      blockers: ('blockers' in taskData && taskData.blockers) || [],
      assumptions: ('assumptions' in taskData && taskData.assumptions) || [],
      risks: ('risks' in taskData && taskData.risks) || [],
      alternatives: ('alternatives' in taskData && taskData.alternatives) || [],
      ...(('parentInitiative' in taskData && taskData.parentInitiative) && { parentInitiative: taskData.parentInitiative })
    };

    // Check for duplicate task submission
    const fingerprint = this.calculateTaskFingerprint(normalizedData);
    const duplicateTask = await this.taskQueue.checkDuplicateTask(fingerprint);
    if (duplicateTask) {
      logger.warn({
        category: 'process',
        action: 'duplicate_task_detected',
        message: `Duplicate task detected: "${normalizedData.title}" matches existing task ${duplicateTask.id} (${duplicateTask.status})`
      });
      throw new Error(`Duplicate task detected. Task "${duplicateTask.title}" (${duplicateTask.id}) is already ${duplicateTask.status}. Wait for it to complete or modify your task to be unique.`);
    }

    // Validate task data against guidelines
    const validation = this.guidelinesManager.validateTaskData(normalizedData, normalizedData.type);

    if (!validation.isValid) {
      logger.warn({
        category: 'process',
        action: 'task_validation_failed',
        message: `Task validation failed: ${validation.errors.join(', ')}`
      });
      throw new Error(`Task validation failed: ${validation.errors.join(', ')}`);
    }

    // Log warnings and suggestions
    if (validation.warnings.length > 0) {
      logger.warn({
        category: 'process',
        action: 'task_validation_warnings',
        message: `Task validation warnings: ${validation.warnings.join(', ')}`
      });
    }
    if (validation.suggestions.length > 0) {
      logger.info({
        category: 'process',
        action: 'task_validation_suggestions',
        message: `Task validation suggestions: ${validation.suggestions.join(', ')}`
      });
    }

    // Create task in SQLite queue
    const sqliteTask = this.taskQueue.createTask({
      type: normalizedData.type,
      title: normalizedData.title,
      description: normalizedData.description,
      documentation: normalizedData.documentation,
      notes: normalizedData.notes,
      assigned_agent: normalizedData.assignedAgent,
      priority: ('priority' in taskData && taskData.priority !== undefined) ? taskData.priority : 5,
      estimated_hours: normalizedData.estimatedEffort?.hours,
      complexity: normalizedData.estimatedEffort?.complexity,
      files: normalizedData.files,
      acceptance_criteria: normalizedData.acceptanceCriteria,
      architecture_references: normalizedData.architectureReferences,
      validation_steps: normalizedData.validationSteps,
      success_metrics: normalizedData.successMetrics,
      fingerprint,
      // Recovery metadata fields
      is_repair_bot: ('metadata' in taskData && taskData.metadata?.isRepairBot) || false,
      original_task_id: ('metadata' in taskData && taskData.metadata?.originalTaskId) || undefined,
      repair_stage: ('metadata' in taskData && taskData.metadata?.repairStage) || undefined
    });

    // Return SQLite task directly (no conversion needed)
    this.emit('taskAdded', sqliteTask);
    logger.info({
      category: 'process',
      action: 'task_added',
      message: `Task added: ${sqliteTask.id} - ${normalizedData.title} (Agent: ${normalizedData.assignedAgent || 'auto-assign'}, fingerprint: ${fingerprint.substring(0, 8)}...)`
    });

    // Try to assign in background (fire-and-forget to prevent API blocking)
    this.assignNextTask().catch(error => {
      logger.error({
        category: 'process',
        action: 'background_assignment_failed',
        message: `Background task assignment failed for ${sqliteTask.id}`,
        error
      });
    });

    return { task: sqliteTask, validation };
  }

  /**
   * Calculate task fingerprint for deduplication
   * Uses title, files, and acceptance criteria to detect duplicate tasks
   */
  private calculateTaskFingerprint(taskData: EnhancedTaskData): string {
    const fingerprintData = {
      title: taskData.title.toLowerCase().trim(),
      files: taskData.files?.sort() || [],
      acceptanceCriteria: taskData.acceptanceCriteria?.slice(0, 3) || [] // First 3 criteria
    };
    const fingerprintString = JSON.stringify(fingerprintData);
    return crypto.createHash('md5').update(fingerprintString).digest('hex');
  }

  /**
   * Assign next task from queue to available worker
   * Delegated to TaskExecutionService
   */
  async assignNextTask(): Promise<void> {
    await this.taskExecutionService.assignNextTask(() => this.assignNextTask());
  }

  /**
   * Complete worker onboarding (no-op for ephemeral workers)
   * Ephemeral workers are created fresh for each task and don't require onboarding
   * @deprecated Kept for API compatibility but not used with ephemeral workers
   */
  public completeWorkerOnboarding(workerId: string): void {
    logger.info({
      category: 'process',
      action: 'worker_onboarding_noop',
      message: `Worker onboarding called for ${workerId} (no-op for ephemeral workers)`
    });
  }

  public getAgentPersonalities(): AgentPersonality[] {
    return this.agentManager.getAllPersonalities();
  }

  public getTaskTemplates(): Record<string, unknown>[] {
    // Return the single universal template as an array for API compatibility
    return [this.templateManager.getTemplate() as unknown as Record<string, unknown>];
  }

  public getTaskGuidelines(taskType?: string): unknown {
    if (taskType) {
      return this.guidelinesManager.getGuidelines(taskType);
    }
    return this.guidelinesManager.getAllGuidelines();
  }

  public getTaskExample(taskType: string): unknown {
    return this.guidelinesManager.getExampleTask(taskType);
  }

  public getTaskChecklist(taskType: string): string[] {
    return this.guidelinesManager.generateTaskChecklist(taskType);
  }

  public validateTaskData(taskData: Record<string, unknown>, taskType: string): unknown {
    return this.guidelinesManager.validateTaskData(taskData, taskType);
  }

  public getValidProjects(): string[] {
    return this.guidelinesManager.getValidProjects();
  }

  public getValidAgents(): string[] {
    return this.guidelinesManager.getValidAgents();
  }

  // DEPRECATED: getCompletedTasks() - use TaskQueueService.getTasksByStatus('completed') instead
  // public getCompletedTasks(): Task[] {
  //   return this.taskPersistence.loadCompletedTasks();
  // }

  public getWorkerCount(): number {
    return this.ephemeralWorkerService.getActiveWorkers().length;
  }

  public getMaxWorkers(): number {
    return 2;
  }



  // Token extraction moved to TaskCompletionService (already implemented there)
  public startSystem(): void {
    if (this.isCoordinatorHealthy) {
      logger.info({
      category: 'process',
      action: 'claude_workers_system_is_already_running',
      message: 'Dev-Bots system is already running'
    });
      return;
    }

    this.isCoordinatorHealthy = true;

    // Clear any existing ephemeral workers
    this.ephemeralWorkerService.clearAllWorkers();

    // Start health monitoring
    this.workerHealthMonitor.start();

    this.emit('systemStatusChange', 'running');
    logger.info({
      category: 'process',
      action: 'claude_workers_system_started_ephemeral_workers_wi',
      message: 'Dev-Bots system started - ephemeral workers will be created for tasks'
    });

    // Try to assign pending tasks
    this.assignNextTask();
  }

  public async stopSystem(): Promise<void> {
    if (!this.isCoordinatorHealthy) {
      logger.info({
      category: 'process',
      action: 'claude_workers_system_is_already_stopped',
      message: 'Dev-Bots system is already stopped'
    });
      return;
    }

    this.isCoordinatorHealthy = false;

    // Stop health monitoring
    this.workerHealthMonitor.stop();

    // Stop interactive session idle watchdog
    this.interactiveSessionService.stopIdleWatchdog();

    // Stop background task queue worker
    if (this.taskQueueWorker) {
      try {
        await this.taskQueueWorker.stop();
        logger.info({
          category: 'process',
          action: 'task_queue_worker_stopped',
          message: 'Background task queue worker stopped'
        });
      } catch (error) {
        logger.error({
          category: 'process',
          action: 'task_queue_worker_stop_failed',
          message: 'Failed to stop background task queue worker',
          error
        });
      }
    }

    // Stop metrics emitter
    if (this.metricsEmitter) {
      try {
        this.metricsEmitter.stop();
        logger.info({
          category: 'process',
          action: 'metrics_emitter_stopped',
          message: 'Metrics emitter stopped'
        });
      } catch (error) {
        logger.error({
          category: 'process',
          action: 'metrics_emitter_stop_failed',
          message: 'Failed to stop metrics emitter',
          error
        });
      }
    }

    // Stop all active ephemeral workers
    for (const worker of this.ephemeralWorkerService.getAllWorkers().values()) {
      if (worker.status !== 'destroyed') {
        // Mark task as failed and destroy container
        worker.task.status = 'failed';
        worker.task.error = 'System stopped';
        worker.task.completed_at = Date.now();
        worker.task.can_retry = true;
        // Task status already updated in SQLite (no in-memory storage needed)
        // this.taskPersistence.saveCompletedTasks([worker.task]); // DEPRECATED - SQLite is source of truth

        // Destroy container
        await this.ephemeralWorkerService.destroyWorker(worker.id);
      }
    }

    this.ephemeralWorkerService.clearAllWorkers();
    // activeTasks removed - SQLite is source of truth

    this.emit('systemStatusChange', 'stopped');
    logger.info({
      category: 'process',
      action: 'claude_workers_system_stopped_all_ephemeral_worker',
      message: 'Dev-Bots system stopped - all ephemeral workers terminated'
    });
  }

  public exportTasks(_exportPath: string): void {
    // DEPRECATED: Export tasks functionality removed with persistence layer
    throw new Error('exportTasks() is deprecated - persistence layer removed');
  }

  public async importTasks(_importPath: string): Promise<void> {
    // DEPRECATED: Import tasks functionality removed with persistence layer
    throw new Error('importTasks() is deprecated - persistence layer removed');
  }
  

  async getSystemStatus(): Promise<DevBotsStatus> {
    // Convert ephemeral workers to worker status format for compatibility
    const workersRecord: Record<string, WorkerStatus> = {};
    const activeEphemeralWorkers = Array.from(this.ephemeralWorkerService.getAllWorkers().values()).filter(
      worker => worker.status !== 'destroyed'
    );
    for (const [workerId, ephemeralWorker] of this.ephemeralWorkerService.getAllWorkers().entries()) {
      workersRecord[workerId] = {
        id: workerId,
        status: ephemeralWorker.status === 'starting' ? 'busy' :
                ephemeralWorker.status === 'running' ? 'busy' :
                ephemeralWorker.status === 'completing' ? 'busy' : 'stopped',
        currentTask: ephemeralWorker.task.id,
        lastSeen: new Date(ephemeralWorker.createdAt).getTime(),
        personality: ephemeralWorker.agent,
        onboardingComplete: true
      };
    }

    return {
      systemStatus: this.isCoordinatorHealthy ? 'running' : 'stopped',
      workers: workersRecord,
      queueSize: this.taskQueue.getTasksByStatus('pending').length,
      activeTasks: this.taskQueue.getTasksByStatus('running').length,
      uptime: Date.now() - this.startTime,
      workerCount: this.ephemeralWorkerService.getActiveWorkers().length,
      maxWorkers: this.maxWorkers,
      activeWorkerTypes: activeEphemeralWorkers.map(w => w.id),
      availableWorkerTypes: Array.from(
        { length: Math.max(this.maxWorkers - activeEphemeralWorkers.length, 0) },
        (_value, index) => `slot-${index + 1}`
      ),
      tasks: {
        pending: this.taskQueue.getTasksByStatus('pending'),
        active: this.taskQueue.getTasksByStatus('running'),
        completed: this.taskQueue.getTasksByStatus('completed').slice(-50) // Keep last 50 completed tasks
      }
    };
  }

  async getTasks(): Promise<{ pending: Task[]; active: Task[]; completed: Task[] }> {
    return {
      pending: this.taskQueue.getTasksByStatus('pending'),
      active: this.taskQueue.getTasksByStatus('running'),
      completed: this.taskQueue.getTasksByStatus('completed').slice(-50)
    };
  }

  getTask(taskId: string): Task | undefined {
    return this.taskQueue.getTask(taskId);
  }

  getTaskExecutions(taskId: string): TaskExecution[] {
    return this.taskQueue.getTaskExecutions(taskId);
  }

  isHealthy(): boolean {
    return this.isCoordinatorHealthy;
  }

  // Additional API methods for scope control and cleanup
  async getScopeViolations(): Promise<Array<{ taskId: string; violations: Array<{ type: string; severity: string }> }>> {
    // This would track scope violations - simplified for now
    return [];
  }

  async triggerEmergencyRecovery(): Promise<Task> {
    const recoveryTask: Task = {
      id: `task-recovery-${Date.now()}`,
      type: 'recovery',
      title: 'Emergency Recovery Task',
      description: 'EMERGENCY RECOVERY: Clean up scope creep and restore system to stable state. DO NOT create new files. Only remove unnecessary code.',
      status: 'pending',
      created_at: Date.now(),
      assigned_agent: 'backend-specialist'
      // scope and isEmergency removed from Task interface
    } as unknown as Task;

    // TaskQueueService doesn't have unshift(), use createTask instead
    await this.taskQueue.createTask(recoveryTask);
    await this.assignNextTask();
    return recoveryTask;
  }

  /**
   * Get PR workflow orchestrator instance
   * @returns PR workflow orchestrator or undefined if not initialized
   */
  getPRWorkflowOrchestrator(): PRWorkflowOrchestrator | undefined {
    return this.prWorkflowOrchestrator;
  }

  async getCleanupStatus(): Promise<{ schedules: string[]; recentTasks: Task[] }> {
    const completedTasks = this.taskQueue.getTasksByStatus('completed');
    const recentCleanupTasks = completedTasks
      .filter(t => t.type === 'cleanup')
      .slice(-10);

    return {
      schedules: this.scopeControl.checkCleanupSchedules(),
      recentTasks: recentCleanupTasks
    };
  }

  async triggerCleanup(type: string): Promise<Task> {
    const cleanupTask = this.scopeControl.createCleanupTask(type, Date.now());
    await this.taskQueue.createTask(cleanupTask);
    await this.assignNextTask();
    return cleanupTask;
  }

  /**
   * Get workspace sync status
   */
  async getWorkspaceSyncStatus(): Promise<unknown> {
    return this.workspaceSyncManager.getSyncStatus();
  }

  /**
   * Trigger manual workspace sync
   */
  async triggerWorkspaceSync(options: SyncOptions = {}): Promise<SyncResult> {
    logger.info({
      category: 'process',
      action: 'manual_workspace_sync_triggered',
      message: 'Manual workspace sync triggered'
    });
    return await this.workspaceSyncManager.syncAllWorkspaces(options);
  }

  /**
   * Update workspace sync configuration
   */
  updateWorkspaceSyncConfig(options: Partial<SyncOptions>): void {
    this.workspaceSyncManager.updateConfig(options);
  }

  /**
   * Get Docker validation status
   */
  getDockerStatus(): {
    isValid: boolean;
    validation?: DockerValidationResult;
    lastCheck: Date;
  } {
    return {
      isValid: this.dockerValidationResult?.isValid || false,
      validation: this.dockerValidationResult,
      lastCheck: new Date()
    };
  }

  /**
   * Get Docker manager instance
   */
  getDockerManager(): DockerManager {
    return this.dockerManager;
  }

  /**
   * Trigger Docker environment re-validation
   */
  async revalidateDockerEnvironment(): Promise<DockerValidationResult> {
    await this.initializeDockerEnvironment();
    return this.dockerValidationResult || {
      isValid: false,
      errors: ['Docker validation not available'],
      warnings: [],
      info: {}
    };
  }

  /**
   * Trigger orphaned resource cleanup
   */
  async cleanupOrphanedResources(): Promise<{
    volumesCleaned: number;
    networksCleaned: number;
  }> {
    logger.info({
      category: 'process',
      action: 'triggering_orphaned_resource_cleanup',
      message: 'Triggering orphaned resource cleanup...'
    });

    const volumesCleaned = await this.dockerManager.cleanupOrphanedVolumes();
    const networksCleaned = await this.dockerManager.cleanupOrphanedNetworks();

    logger.info({
      category: 'process',
      action: 'cleanup_complete_volumescleaned_volumes_networkscl',
      message: `Cleanup complete: ${volumesCleaned} volumes, ${networksCleaned} networks removed`
    });

    return { volumesCleaned, networksCleaned };
  }

  /**
   * Get container health status
   */
  async getContainerHealth(containerId: string): Promise<{
    healthy: boolean;
    status?: string;
    logs?: string;
  }> {
    try {
      const container = this.docker.getContainer(containerId);
      const inspect = await container.inspect();

      return {
        healthy: inspect.State.Running,
        status: inspect.State.Status,
        logs: await this.dockerManager.getContainerLogs(containerId, 20)
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'not_found'
      };
    }
  }

  /**
   * Handle task retry when it becomes ready
   */
  private async handleTaskRetry(task: Task): Promise<void> {
    try {
      logger.info({
      category: 'process',
      action: 'handling_retry_for_task_task_id',
      message: `Handling retry for task ${task.id}`
    });
      
      // Reset task status for retry
      task.status = 'pending';
      task.assigned_worker = undefined;
      task.assigned_at = undefined;
      task.error = undefined;
      // task.exitCode removed from interface

      // Add task back to queue (update in SQLite)
      await this.taskQueue.updateTask(task.id, task);
      
      // Emit retry event
      this.emit('taskRetrying', task);
      
      // Try to assign the retry task
      await this.assignNextTask();
      
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_handle_retry_for_task_task_id',
      message: `Failed to handle retry for task ${task.id}:`,
      error: error
    });
      this.emit('taskRetryFailed', task, error);
    }
  }

  /**
   * Manually retry a failed task
   */
  public async retryTask(taskId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    try {
      // Find the task in SQLite
      const task = await this.taskQueue.getTask(taskId);
      if (!task) {
        return { success: false, message: 'Task not found' };
      }

      if (task.status !== 'failed') {
        return { success: false, message: 'Task is not in failed status' };
      }

      // Check if task can be retried
      if (!this.retryManager.canRetryTask(task)) {
        return { success: false, message: 'Task cannot be retried' };
      }

      // Manual retry - add task back to queue
      const retryResult = this.retryManager.retryTask(task, reason || 'Manual retry');
      
      if (retryResult.success) {
        // Task already updated in SQLite (no in-memory storage needed)

        // Update retry task in SQLite
        await this.taskQueue.updateTask(retryResult.task.id, retryResult.task);

        this.emit('taskRetrying', retryResult.task);
        return { success: true, message: 'Task queued for retry' };
      } else {
        return { success: false, message: retryResult.reason || 'Failed to retry task' };
      }
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_retry_task_taskid',
      message: `Failed to retry task ${taskId}:`,
      error: error
    });
      return { success: false, message: `Failed to retry task: ${error}` };
    }
  }

  /**
   * Cancel a scheduled retry (not needed for manual retry)
   */
  public cancelRetry(_taskId: string): { success: boolean; message: string } {
    return { success: false, message: 'Manual retry cannot be cancelled once started' };
  }

  /**
   * Get retry information for a task
   */
  public async getRetryInfo(taskId: string): Promise<{
    canRetry: boolean;
    retryCount: number;
    maxRetries: number;
    retryHistory: RetryAttempt[];
    scheduledRetries: Array<{ taskId: string; retryAt: string; retryCount: number }>;
  }> {
    const task = await this.taskQueue.getTask(taskId);
    const retryHistory = this.retryManager.getRetryHistory(taskId);

    return {
      canRetry: task?.can_retry ?? (task?.status === 'failed'),
      retryCount: task?.retry_count || 0,
      maxRetries: task?.max_retries || this.retryManager.getConfig().max_retries,
      retryHistory,
      scheduledRetries: [] // Manual retry system - no scheduled retries
    };
  }

  /**
   * Get all retry statistics
   */
  public getRetryStats(): {
    totalRetries: number;
    successfulRetries: number;
    failedRetries: number;
    scheduledRetries: number;
    retryConfig: RetryConfig;
  } {
    const stats = this.retryManager.getRetryStats();
    const config = this.retryManager.getConfig();

    return {
      ...stats,
      scheduledRetries: 0, // Manual retry system - no scheduled retries
      retryConfig: config
    };
  }

  /**
   * Get retry manager instance (for state persistence)
   */
  public getRetryManager(): RetryManager {
    return this.retryManager;
  }

  /**
   * Update retry configuration
   */
  public updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryManager.updateConfig(config);
    this.emit('retryConfigUpdated', config);
    logger.info({
      category: 'process',
      action: 'retry_configuration_updated',
      message: 'Retry configuration updated',
      details: { config }
    });
  }

  destroy(): void {
    // Stop health monitoring
    this.workerHealthMonitor.stop();

    // Clear all scheduled retries
    this.retryManager.clearAllRetries();
  }
}
