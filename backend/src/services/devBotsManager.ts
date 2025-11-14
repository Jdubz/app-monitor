import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { ProcessManager, ProcessInfo } from './processManager.js';
import Docker from 'dockerode';
import type { TaskPersistence } from './taskPersistence.js';
import { TaskQueueService, Task, TaskStatus as SQLiteTaskStatus, TaskExecution } from './taskQueue.sqlite.js';
import { AgentPersonalityManager, AgentPersonality } from './agentPersonalities.js';
import type { DevBotsStatus } from './statusAggregation.service.js';
import { TaskPromptTemplateManager } from './taskPromptTemplates.js';
import { TaskCreationGuidelinesManager } from './taskCreationGuidelines.js';
import { EnhancedTaskData } from './taskMetadataFields.js';
import { WorkspaceSyncManager, SyncOptions, SyncResult } from './workspaceSyncManager.js';
import { DockerManager, DockerValidationResult } from './dockerManager.js';
import { RetryManager, RetryConfig } from './retryManager.js';
import { MetricsEmitter } from './metricsEmitter.js';

import { SimpleFailureRecovery } from './failureRecovery.js';
import type { DevBotsManagerDependencies } from './devBotsManager.interfaces.js';
import type { ScopeControlService } from './scopeControl.service.js';
import type { EphemeralWorkerService, EphemeralWorker as EphemeralWorkerType } from './ephemeralWorker.service.js';
import { TaskExecutionService } from './taskExecution.service.js';
import { TaskCompletionService } from './taskCompletion.service.js';
import type { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';
import { AgentEligibilityServiceImpl } from './agentEligibility.service.js';
import { AgentSelector } from './agentSelector.js';
import {
  InteractiveSessionService,
  StartInteractiveSessionOptions,
  ActivityKind,
  type AllowedInteractiveModel,
} from './interactiveSession.service.js';
import { InteractiveSessionOrchestrator } from './interactiveSessionOrchestrator.js';
import { InteractiveSessionStreamManager } from './interactiveSessionStreamManager.js';
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
  private systemLifecycleService!: import('./systemLifecycle.service.js').SystemLifecycleService;
  private systemInitializationService!: import('./systemInitialization.service.js').SystemInitializationService;
  private interactiveSessionCoordinator!: import('./interactiveSessionCoordinator.service.js').InteractiveSessionCoordinator;
  private cleanupCoordinator!: import('./cleanupCoordinator.service.js').CleanupCoordinator;
  private infoQueryService!: import('./infoQuery.service.js').InfoQueryService;
  private taskQueueWorker?: { start: () => Promise<void>; stop: () => Promise<void> };
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
    // taskExecutionService is initialized later with agent selector (line 242-248)
    this.prWorkflowOrchestrator = dependencies.prWorkflowOrchestrator;
    this.interactiveSessionService = dependencies.interactiveSessionService;
    this.interactiveSessionOrchestrator = dependencies.interactiveSessionOrchestrator;
    this.interactiveSessionStreamManager = dependencies.interactiveSessionStreamManager;
    this.workerHealthMonitor = dependencies.workerHealthMonitor;
    this.systemLifecycleService = dependencies.systemLifecycleService;
    this.systemInitializationService = dependencies.systemInitializationService;
    this.interactiveSessionCoordinator = dependencies.interactiveSessionCoordinator;
    this.cleanupCoordinator = dependencies.cleanupCoordinator;
    this.infoQueryService = dependencies.infoQueryService;

    // Initialize maxWorkers from config
    this.maxWorkers = config.devBots.maxWorkers;

    // Initialize SimpleFailureRecovery
    this.recovery = new SimpleFailureRecovery(this);

    // Type helper for dependency injection
    interface WorkerHealthMonitorDeps {
      recovery: SimpleFailureRecovery;
      emit: (event: string, data: unknown) => void;
    }

    // Update WorkerHealthMonitor with recovery and emit function
    // Note: WorkerHealthMonitor is injected but needs recovery instance from DevBotsManager
    (this.workerHealthMonitor as unknown as WorkerHealthMonitorDeps).recovery = this.recovery;
    (this.workerHealthMonitor as unknown as WorkerHealthMonitorDeps).emit = this.emit.bind(this);

    // Type helper for dependency injection
    interface SystemInitDeps {
      components: { recovery: SimpleFailureRecovery };
    }

    // Update SystemInitializationService with recovery instance
    (this.systemInitializationService as unknown as SystemInitDeps).components.recovery = this.recovery;

    // Type helper for dependency injection
    interface RetryCoordinationDeps {
      emitEvent: (event: string, data: unknown) => void;
      assignNextTask: () => Promise<void>;
    }

    // Update RetryCoordinationService with emit and assignNextTask functions
    // Note: RetryCoordinationService is injected but needs these callbacks from DevBotsManager
    (this.retryCoordinationService as unknown as RetryCoordinationDeps).emitEvent = this.emit.bind(this);
    (this.retryCoordinationService as unknown as RetryCoordinationDeps).assignNextTask = this.assignNextTask.bind(this);

    // Type helper for dependency injection
    interface SystemLifecycleDeps {
      emitEvent: (event: string, data: unknown) => void;
      assignNextTask: () => Promise<void>;
    }

    // Update SystemLifecycleService with emit and assignNextTask functions
    // Note: SystemLifecycleService is injected but needs these callbacks from DevBotsManager
    (this.systemLifecycleService as unknown as SystemLifecycleDeps).emitEvent = this.emit.bind(this);
    (this.systemLifecycleService as unknown as SystemLifecycleDeps).assignNextTask = this.assignNextTask.bind(this);

    // Type helper for dependency injection
    interface SystemInitCallbackDeps {
      emitEvent: (event: string, data: unknown) => void;
      endInteractiveSession: (sessionId: string, reason: string) => Promise<void>;
    }

    // Update SystemInitializationService with emit and endInteractiveSession callbacks
    // Note: SystemInitializationService is injected but needs these callbacks from DevBotsManager
    (this.systemInitializationService as unknown as SystemInitCallbackDeps).emitEvent = this.emit.bind(this);
    (this.systemInitializationService as unknown as SystemInitCallbackDeps).endInteractiveSession = this.endInteractiveSession.bind(this);

    // Update CleanupCoordinator with assignNextTask callback
    // Note: CleanupCoordinator is injected but needs this callback from DevBotsManager
    (this.cleanupCoordinator as unknown as { assignNextTask: () => Promise<void> }).assignNextTask = this.assignNextTask.bind(this);

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

    // Initialize services
    const eligibilityService = new AgentEligibilityServiceImpl();
    const agentSelector = new AgentSelector(undefined, eligibilityService);

    this.taskExecutionService = new TaskExecutionService(
      this.taskQueue,
      this.agentManager,
      this.templateManager,
      this.ephemeralWorkerService,
      agentSelector
    );

    // Wire recovery into task execution service
    this.taskExecutionService.setRecovery(this.recovery);

    // Wire interactive stream events (delegated to SystemInitializationService)
    this.systemInitializationService.wireInteractiveStreamEvents();

    // Validate Docker environment and initialize (delegated to SystemInitializationService)
    void this.systemInitializationService.initializeDockerEnvironment();

    // Run async initialization (orphaned task recovery) (delegated to SystemInitializationService)
    void this.systemInitializationService.initializeAsync();

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

  /**
   * Interactive session methods - all delegated to InteractiveSessionCoordinator
   */
  public getActiveInteractiveSession(): InteractiveSessionRecord | null {
    return this.interactiveSessionCoordinator.getActiveSession();
  }

  public getInteractiveSession(sessionId: string): InteractiveSessionRecord | null {
    return this.interactiveSessionCoordinator.getSession(sessionId);
  }

  public listInteractiveSessions(limit = 20): InteractiveSessionRecord[] {
    return this.interactiveSessionCoordinator.listSessions(limit);
  }

  public async launchInteractiveSession(
    options: StartInteractiveSessionOptions,
  ): Promise<InteractiveSessionRecord> {
    return await this.interactiveSessionCoordinator.launchSession(options);
  }

  public async endInteractiveSession(sessionId: string, reason?: string): Promise<void> {
    await this.interactiveSessionCoordinator.endSession(sessionId, reason);
  }

  public sendInteractiveInput(sessionId: string, payload: string): void {
    this.interactiveSessionCoordinator.sendInput(sessionId, payload);
  }

  public sendInteractiveSignal(
    sessionId: string,
    signal: 'interrupt' | 'terminate' = 'interrupt',
  ): void {
    this.interactiveSessionCoordinator.sendSignal(sessionId, signal);
  }

  public recordInteractiveActivity(sessionId: string, kind: ActivityKind): void {
    this.interactiveSessionCoordinator.recordActivity(sessionId, kind);
  }

  public updateInteractiveContext(
    sessionId: string,
    contextSnapshot?: unknown,
    metadata?: Record<string, unknown>,
  ): void {
    this.interactiveSessionCoordinator.updateContext(sessionId, contextSnapshot, metadata);
  }

  public getInteractiveIdleTimeoutMs(): number {
    return this.interactiveSessionCoordinator.getIdleTimeoutMs();
  }

  public getAllowedInteractiveModels(): AllowedInteractiveModel[] {
    return this.interactiveSessionCoordinator.getAllowedModels();
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

  /**
   * Info/query methods - delegated to InfoQueryService
   */
  public getAgentPersonalities(): AgentPersonality[] {
    return this.infoQueryService.getAgentPersonalities();
  }

  public getTaskTemplates(): Record<string, unknown>[] {
    return this.infoQueryService.getTaskTemplates();
  }

  public getTaskGuidelines(taskType?: string): unknown {
    return this.infoQueryService.getTaskGuidelines(taskType);
  }

  public getTaskExample(taskType: string): unknown {
    return this.infoQueryService.getTaskExample(taskType);
  }

  public getTaskChecklist(taskType: string): string[] {
    return this.infoQueryService.getTaskChecklist(taskType);
  }

  public validateTaskData(taskData: Record<string, unknown>, taskType: string): unknown {
    return this.infoQueryService.validateTaskData(taskData, taskType);
  }

  public getValidProjects(): string[] {
    return this.infoQueryService.getValidProjects();
  }

  public getValidAgents(): string[] {
    return this.infoQueryService.getValidAgents();
  }

  public getWorkerCount(): number {
    return this.infoQueryService.getWorkerCount();
  }

  public getMaxWorkers(): number {
    return this.infoQueryService.getMaxWorkers();
  }

  /**
   * Start the Dev-Bots system
   * Delegated to SystemLifecycleService
   */
  public startSystem(): void {
    this.systemLifecycleService.startSystem();
    this.isCoordinatorHealthy = this.systemLifecycleService.isSystemHealthy();
  }

  /**
   * Stop the Dev-Bots system
   * Delegated to SystemLifecycleService
   */
  public async stopSystem(): Promise<void> {
    await this.systemLifecycleService.stopSystem();
    this.isCoordinatorHealthy = this.systemLifecycleService.isSystemHealthy();
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

  /**
   * Scope and cleanup methods - delegated to CleanupCoordinator
   */
  async getScopeViolations(): Promise<Array<{ taskId: string; violations: Array<{ type: string; severity: string }> }>> {
    return await this.cleanupCoordinator.getScopeViolations();
  }

  async triggerEmergencyRecovery(): Promise<Task> {
    return await this.cleanupCoordinator.triggerEmergencyRecovery();
  }

  /**
   * Get PR workflow orchestrator instance
   * @returns PR workflow orchestrator or undefined if not initialized
   */
  getPRWorkflowOrchestrator(): PRWorkflowOrchestrator | undefined {
    return this.prWorkflowOrchestrator;
  }

  async getCleanupStatus(): Promise<{ schedules: string[]; recentTasks: Task[] }> {
    return await this.cleanupCoordinator.getCleanupStatus();
  }

  async triggerCleanup(type: string): Promise<Task> {
    return await this.cleanupCoordinator.triggerCleanup(type);
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
   * Delegated to SystemInitializationService
   */
  getDockerStatus(): {
    isValid: boolean;
    validation?: DockerValidationResult;
    lastCheck: Date;
  } {
    const dockerValidation = this.systemInitializationService.getDockerValidationResult();
    return {
      isValid: dockerValidation?.isValid || false,
      validation: dockerValidation,
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
   * Delegated to SystemInitializationService
   */
  async revalidateDockerEnvironment(): Promise<DockerValidationResult> {
    await this.systemInitializationService.initializeDockerEnvironment();
    return this.systemInitializationService.getDockerValidationResult() || {
      isValid: false,
      errors: ['Docker validation not available'],
      warnings: [],
      info: {}
    };
  }

  /**
   * Trigger orphaned resource cleanup
   * Delegated to DockerManager
   */
  async cleanupOrphanedResources(): Promise<{
    volumesCleaned: number;
    networksCleaned: number;
  }> {
    return await this.dockerManager.cleanupOrphanedResources();
  }

  /**
   * Get container health status
   * Delegated to DockerManager
   */
  async getContainerHealth(containerId: string): Promise<{
    healthy: boolean;
    status?: string;
    logs?: string;
  }> {
    return await this.dockerManager.getContainerHealth(containerId);
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
