import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { ProcessManager, ProcessInfo } from './processManager.js';
import Docker from 'dockerode';
import type { TaskPersistence } from './taskPersistence.js';
import { TaskQueueService, Task, TaskStatus as SQLiteTaskStatus, TaskExecution } from './taskQueue.sqlite.js';
import { AgentPersonalityManager, AgentPersonality } from './agentPersonalities.js';
import type { DevBotsStatus, WorkerStatus } from './statusAggregation.service.js';
import { TaskPromptTemplateManager } from './taskPromptTemplates.js';
import { TaskCreationGuidelinesManager } from './taskCreationGuidelines.js';
import { EnhancedTaskData } from './taskMetadataFields.js';
import { WorkspaceSyncManager, SyncOptions, SyncResult } from './workspaceSyncManager.js';
import { DockerManager, DockerValidationResult } from './dockerManager.js';
import { RetryManager, RetryConfig } from './retryManager.js';
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

// TaskStatus and Task interface now imported from taskQueue.sqlite.ts (canonical source per Stabilization Plan)
// Re-export for compatibility with existing imports
export type TaskStatus = SQLiteTaskStatus;
export type { Task } from './taskQueue.sqlite.js';

// EphemeralWorker now managed by EphemeralWorkerService
// Re-export for backward compatibility
export type EphemeralWorker = EphemeralWorkerType;

// WorkerStatus and DevBotsStatus moved to statusAggregation.service.ts
// Re-export for backward compatibility
export type { WorkerStatus, DevBotsStatus } from './statusAggregation.service.js';

// Scope control classes moved to scopeControl.service.ts

export class DevBotsManager extends EventEmitter {
  private processManager: ProcessManager;
  private docker: Docker;
  private dockerManager: DockerManager;
  private workerHealthMonitor!: WorkerHealthMonitor;
  private isCoordinatorHealthy: boolean = false;
  private dockerValidationResult?: DockerValidationResult;

  // Services injected via dependency injection
  private taskQueue!: TaskQueueService;
  private taskCreationService!: import('./taskCreation.service.js').TaskCreationService;
  private statusAggregationService!: import('./statusAggregation.service.js').StatusAggregationService;
  private retryCoordinationService!: import('./retryCoordination.service.js').RetryCoordinationService;
  private agentManager!: AgentPersonalityManager;
  private templateManager!: TaskPromptTemplateManager;
  private guidelinesManager!: TaskCreationGuidelinesManager;
  private workspaceSyncManager!: WorkspaceSyncManager;
  private retryManager!: RetryManager;
  private recovery!: SimpleFailureRecovery;
  private scopeControl!: ScopeControlService;
  private ephemeralWorkerService!: EphemeralWorkerService;
  private taskExecutionService!: TaskExecutionService;
  private taskCompletionService!: TaskCompletionService;
  private prWorkflowOrchestrator!: PRWorkflowOrchestrator;
  private interactiveSessionService!: InteractiveSessionService;
  private interactiveSessionOrchestrator!: InteractiveSessionOrchestrator;
  private interactiveSessionStreamManager!: InteractiveSessionStreamManager;
  private taskQueueWorker?: { start: () => void; stop: () => void };
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
    this.taskCreationService = dependencies.taskCreationService;
    this.statusAggregationService = dependencies.statusAggregationService;
    this.retryCoordinationService = dependencies.retryCoordinationService;
    this.agentManager = dependencies.agentManager;
    this.templateManager = dependencies.templateManager;
    this.guidelinesManager = dependencies.guidelinesManager;
    this.workspaceSyncManager = dependencies.workspaceSyncManager;
    this.retryManager = dependencies.retryManager;
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

    // Update RetryCoordinationService with emit and assignNextTask functions
    // Note: RetryCoordinationService is injected but needs these callbacks from DevBotsManager
    (this.retryCoordinationService as any).emitEvent = this.emit.bind(this);
    (this.retryCoordinationService as any).assignNextTask = this.assignNextTask.bind(this);

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

    // Listen for retry events (delegate to RetryCoordinationService)
    this.retryManager.on('taskReadyForRetry', (task: Task) => {
      this.retryCoordinationService.handleTaskRetry(task);
    });

    // Listen for process status changes
    this.processManager.on('statusChange', (serviceName: string, status: ProcessInfo) => {
      if (serviceName === 'dev-bots') {
        this.emit('systemStatusChange', status);
      }
    });
  }

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
   */
  private async initializeAsync(): Promise<void> {
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

  // Task Management Methods
  /**
   * Add a new task to the queue (unified method with SQLite)
   * Supports both simple and comprehensive task data
   * Delegated to TaskCreationService
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
    // Delegate to TaskCreationService
    const result = await this.taskCreationService.createTask(taskData);

    // Emit event for task added
    this.emit('taskAdded', result.task);

    // Try to assign in background (fire-and-forget to prevent API blocking)
    this.assignNextTask().catch(error => {
      logger.error({
        category: 'process',
        action: 'background_assignment_failed',
        message: `Background task assignment failed for ${result.task.id}`,
        error
      });
    });

    return result;
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

  public getWorkerCount(): number {
    return this.ephemeralWorkerService.getActiveWorkers().length;
  }

  public getMaxWorkers(): number {
    return 2;
  }

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

        // Destroy container
        await this.ephemeralWorkerService.destroyWorker(worker.id);
      }
    }

    this.ephemeralWorkerService.clearAllWorkers();

    this.emit('systemStatusChange', 'stopped');
    logger.info({
      category: 'process',
      action: 'claude_workers_system_stopped_all_ephemeral_worker',
      message: 'Dev-Bots system stopped - all ephemeral workers terminated'
    });
  }

  /**
   * Get comprehensive system status
   * Delegated to StatusAggregationService
   */
  async getSystemStatus(): Promise<DevBotsStatus> {
    return await this.statusAggregationService.getSystemStatus({
      isHealthy: this.isCoordinatorHealthy,
      startTime: this.startTime,
      maxWorkers: this.maxWorkers
    });
  }

  /**
   * Get tasks grouped by status
   * Delegated to StatusAggregationService
   */
  async getTasks(): Promise<{ pending: Task[]; active: Task[]; completed: Task[] }> {
    return await this.statusAggregationService.getTasks();
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
   * Manually retry a failed task
   * Delegated to RetryCoordinationService
   */
  public async retryTask(taskId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    return await this.retryCoordinationService.retryTask(taskId, reason);
  }

  /**
   * Cancel a scheduled retry
   * Delegated to RetryCoordinationService
   */
  public cancelRetry(taskId: string): { success: boolean; message: string } {
    return this.retryCoordinationService.cancelRetry(taskId);
  }

  /**
   * Get retry information for a task
   * Delegated to RetryCoordinationService
   */
  public async getRetryInfo(taskId: string): Promise<{
    canRetry: boolean;
    retryCount: number;
    maxRetries: number;
    retryHistory: RetryAttempt[];
    scheduledRetries: Array<{ taskId: string; retryAt: string; retryCount: number }>;
  }> {
    return await this.retryCoordinationService.getRetryInfo(taskId);
  }

  /**
   * Get all retry statistics
   * Delegated to RetryCoordinationService
   */
  public getRetryStats(): {
    totalRetries: number;
    successfulRetries: number;
    failedRetries: number;
    scheduledRetries: number;
    retryConfig: RetryConfig;
  } {
    return this.retryCoordinationService.getRetryStats();
  }

  /**
   * Get retry manager instance (for state persistence)
   * Delegated to RetryCoordinationService
   */
  public getRetryManager(): RetryManager {
    return this.retryCoordinationService.getRetryManager();
  }

  /**
   * Update retry configuration
   * Delegated to RetryCoordinationService
   */
  public updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryCoordinationService.updateRetryConfig(config);
  }

  destroy(): void {
    // Stop health monitoring
    this.workerHealthMonitor.stop();

    // Clear all scheduled retries
    this.retryManager.clearAllRetries();
  }
}
