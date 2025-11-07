import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { ProcessManager, ProcessInfo } from './processManager.js';
import Docker from 'dockerode';
import { TaskPersistence } from './taskPersistence.js';
import { TaskQueueService, Task, TaskStatus as SQLiteTaskStatus } from './taskQueue.sqlite.js';
import { TaskQueueMigration } from './taskQueue.migration.js';
import { AgentPersonalityManager, AgentPersonality } from './agentPersonalities.js';
import { TaskPromptTemplateManager } from './taskPromptTemplates.js';
import { TaskCreationGuidelinesManager, EnhancedTaskData } from './taskCreationGuidelines.js';
import { WorkspaceSyncManager, SyncOptions, SyncResult } from './workspaceSyncManager.js';
import { DockerManager, DockerValidationResult } from './dockerManager.js';
import { RetryManager, RetryConfig } from './retryManager.js';
import { getTokenTrackingService } from './tokenTracking.js';
import { WorkspaceOrchestrator, PushCoordinator } from './workspaceOrchestrator.js';
import { TIME_BASED_GUARDS } from './taskFailureGuards.js';
import { SimpleFailureRecovery } from './failureRecovery.js';
import type { DevBotsManagerDependencies } from './devBotsManager.interfaces.js';
import type { ScopeControlService } from './scopeControl.service.js';
import type { EphemeralWorkerService, EphemeralWorker as EphemeralWorkerType } from './ephemeralWorker.service.js';
import type { TaskExecutionService } from './taskExecution.service.js';
import { TaskCompletionService } from './taskCompletion.service.js';

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
  private isCoordinatorHealthy: boolean = false;
  private dockerValidationResult?: DockerValidationResult;
  private healthCheckInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  // Task management - DEPRECATED (now using SQLite)
  // private taskQueue: Task[] = [];
  // private activeTasks = new Map<string, Task>();
  // private completedTasks: Task[] = [];
  // private taskIdCounter = 1;
  // private taskFingerprints = new Map<string, string>();
  // private fileModificationLocks = new Map<string, string>();

  // Worker management
  private workers = new Map<string, WorkerInfo>();
  // ephemeralWorkers now managed by ephemeralWorkerService

  // Agent type rotation configuration
  private readonly AGENT_ROTATION_STRATEGY: 'alternate' | 'random' | 'claude-only' | 'codex-only' = 'alternate';
  private lastAgentType: 'claude' | 'codex' = 'claude';

  // Enhanced services
  private taskPersistence!: TaskPersistence; // Deprecated - keeping for migration only
  private taskQueue!: TaskQueueService; // SQLite-based queue (replaces in-memory arrays)
  private agentManager!: AgentPersonalityManager;
  private templateManager!: TaskPromptTemplateManager;
  private guidelinesManager!: TaskCreationGuidelinesManager;
  private workspaceSyncManager!: WorkspaceSyncManager;
  private retryManager!: RetryManager;
  private workspaceOrchestrator!: WorkspaceOrchestrator;
  private pushCoordinator: PushCoordinator = new PushCoordinator();
  private recovery!: SimpleFailureRecovery;
  private scopeControl!: ScopeControlService;
  private ephemeralWorkerService!: EphemeralWorkerService;
  private taskExecutionService!: TaskExecutionService;
  private taskCompletionService!: TaskCompletionService;

  // System state
  private startTime = Date.now();

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
    this.workspaceOrchestrator = dependencies.workspaceOrchestrator;
    this.taskPersistence = dependencies.taskPersistence;
    this.scopeControl = dependencies.scopeControl;
    this.ephemeralWorkerService = dependencies.ephemeralWorkerService;
    this.taskExecutionService = dependencies.taskExecutionService;

    // Initialize SimpleFailureRecovery and TaskCompletionService with this instance
    this.recovery = new SimpleFailureRecovery(this);
    this.taskCompletionService = new TaskCompletionService(
      this.workspaceOrchestrator,
      this.ephemeralWorkerService,
      this.taskPersistence,
      this.pushCoordinator,
      this.emit.bind(this),
      { enableQualityGates: true }
    );

    // Validate Docker environment and initialize
    this.initializeDockerEnvironment();

    // Run async initialization (SQLite migration)
    void this.initializeAsync();

    // Listen for retry events
    this.retryManager.on('taskReadyForRetry', (task: Task) => {
      this.handleTaskRetry(task);
    });

    // Start monitoring loops
    this.startHeartbeatMonitor();
    this.startLongRunningTaskMonitor();

    // Listen for process status changes
    this.processManager.on('statusChange', (serviceName: string, status: ProcessInfo) => {
      if (serviceName === 'dev-bots') {
        this.emit('systemStatusChange', status);
        this.updateWorkerHealth();
      }
    });
  }

  /**
   * Migrate existing JSON tasks to SQLite
   */
  private migrateToSQLite(): void {
    try {
      // Check if migration marker exists
      const migrationMarker = './data/tasks/.migrated-to-sqlite';
      if (fs.existsSync(migrationMarker)) {
        logger.info({
          category: 'process',
          action: 'migration_already_completed',
          message: 'SQLite migration already completed, skipping'
        });
        return;
      }

      // Backup legacy files
      TaskQueueMigration.backupLegacyFiles('./data/tasks', './data/backups');

      // Run migration
      const migration = new TaskQueueMigration(this.taskQueue, './data/tasks');
      const result = migration.migrate();

      if (result.success) {
        logger.info({
          category: 'process',
          action: 'migration_successful',
          message: `Successfully migrated ${result.tasksImported} tasks and ${result.executionsCreated} executions to SQLite`
        });

        // Create migration marker to prevent re-running
        fs.writeFileSync(migrationMarker, JSON.stringify({
          migratedAt: new Date().toISOString(),
          tasksImported: result.tasksImported,
          executionsCreated: result.executionsCreated
        }));
      } else {
        logger.error({
          category: 'process',
          action: 'migration_failed',
          message: `Migration completed with ${result.errors.length} errors`,
          details: { errors: result.errors }
        });
      }
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'migration_exception',
        message: 'Migration failed with exception',
        error
      });
    }
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
   * Initialize async components (SQLite migration)
   * Dependencies are now injected, so this only runs migrations
   */
  private async initializeAsync(): Promise<void> {
    // Run migration from JSON to SQLite
    this.migrateToSQLite();

    logger.info({
      category: 'process',
      action: 'async_initialization_complete',
      message: 'Async initialization complete: SQLite migration finished'
    });
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
  private startHeartbeatMonitor(): void {
    // DISABLED: Ephemeral containers don't send heartbeats
    // They auto-cleanup on exit (--rm flag) and are monitored via process.on('close')

    logger.info({
      category: 'process',
      action: 'heartbeat_monitor_disabled',
      message: 'Worker heartbeat monitor disabled (using Docker process monitoring for ephemeral containers)'
    });

    // Uncomment below to enable heartbeat monitoring for persistent workers:
    /*
    setInterval(() => {
      const stalledWorkers = this.taskQueue.detectStalledWorkers();
      if (stalledWorkers.length > 0) {
        logger.warn({
          category: 'process',
          action: 'stalled_workers_detected',
          message: `Detected ${stalledWorkers.length} stalled workers (heartbeat timeout)`,
          details: stalledWorkers
        });

        for (let i = 0; i < stalledWorkers.length; i++) {
          this.assignNextTask();
        }
      }
    }, 60000);
    */
  }

  /**
   * Start long-running task monitoring with automatic cleanup for stuck tasks
   */
  private startLongRunningTaskMonitor(): void {
    setInterval(async () => {
      // Soft timeout warning (30 minutes)
      const longRunning = this.taskQueue.detectLongRunningTasks(TIME_BASED_GUARDS.SOFT_TIMEOUT_MS);
      if (longRunning.length > 0) {
        logger.warn({
          category: 'process',
          action: 'long_running_tasks_detected',
          message: `Found ${longRunning.length} tasks running longer than ${TIME_BASED_GUARDS.SOFT_TIMEOUT_MS / 60000} minutes`,
          details: longRunning.map(task => ({
            id: task.id,
            title: task.title,
            duration: task.duration_ms,
            durationMinutes: Math.round(task.duration_ms / 60000)
          })) as unknown as Record<string, unknown>
        });
      }

      // Hard timeout - force cleanup (1 hour)
      const stuck = this.taskQueue.detectLongRunningTasks(TIME_BASED_GUARDS.ABSOLUTE_MAX_DURATION_MS);
      if (stuck.length > 0) {
        logger.error({
          category: 'process',
          action: 'stuck_tasks_detected_auto_cleanup',
          message: `Found ${stuck.length} tasks stuck for >${TIME_BASED_GUARDS.ABSOLUTE_MAX_DURATION_MS / 60000} minutes. Auto-failing and cleaning up.`,
          details: stuck.map(task => ({
            id: task.id,
            title: task.title,
            duration: task.duration_ms,
            durationHours: Math.round(task.duration_ms / 3600000)
          })) as unknown as Record<string, unknown>
        });

        // Cleanup each stuck task
        for (const task of stuck) {
          try {
            // Force kill any Docker containers for this task
            await this.ephemeralWorkerService.cleanupStuckTaskContainers(task.id);

            // Mark task as failed in database
            this.taskQueue.failTask(
              task.id,
              `Task stuck for ${Math.round(task.duration_ms / 60000)} minutes (exceeded ${TIME_BASED_GUARDS.ABSOLUTE_MAX_DURATION_MS / 60000}min timeout). Auto-failed by failure guard.`
            );

            logger.info({
              category: 'process',
              action: 'stuck_task_cleaned_up',
              message: `Successfully cleaned up stuck task ${task.id}`,
              details: {
                taskId: task.id,
                duration_minutes: Math.round(task.duration_ms / 60000),
                cleanup_reason: 'ABSOLUTE_MAX_DURATION_EXCEEDED'
              }
            });
          } catch (error) {
            logger.error({
              category: 'process',
              action: 'stuck_task_cleanup_failed',
              message: `Failed to cleanup stuck task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
              details: {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error)
              }
            });
          }
        }
      }
    }, 300000); // Check every 5 minutes

    logger.info({
      category: 'process',
      action: 'long_running_task_monitor_started',
      message: `Task monitor started - Soft warn: ${TIME_BASED_GUARDS.SOFT_TIMEOUT_MS / 60000}min, Hard fail: ${TIME_BASED_GUARDS.ABSOLUTE_MAX_DURATION_MS / 60000}min`,
      details: {
        checkInterval_ms: 300000,
        softTimeout_minutes: TIME_BASED_GUARDS.SOFT_TIMEOUT_MS / 60000,
        hardTimeout_minutes: TIME_BASED_GUARDS.ABSOLUTE_MAX_DURATION_MS / 60000
      }
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

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkWorkerHealth();
    }, 5000); // Check every 5 seconds
  }
  
  private startCleanupScheduler(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.checkCleanupSchedules();
    }, 60000); // Check every minute
  }

  private async checkWorkerHealth(): Promise<boolean> {
    try {
      // Since we're not using Docker, just check if workers are idle or busy
      // and update their lastSeen timestamp
      const wasHealthy = this.isCoordinatorHealthy;
      
      // Update lastSeen for all workers that are not stopped
      this.workers.forEach(worker => {
        if (worker.status !== 'stopped') {
          worker.lastSeen = Date.now();
        }
      });
      
      // System health is now managed by startSystem/stopSystem methods
      // Don't override the isCoordinatorHealthy flag here
      
      if (wasHealthy !== this.isCoordinatorHealthy) {
        this.emit('coordinatorHealthChange', this.isCoordinatorHealthy);
        logger.info({
      category: 'process',
      action: 'worker_health_changed',
      message: `Worker health changed: ${this.isCoordinatorHealthy ? 'healthy' : 'unhealthy'}`
    });
      }
      
      return this.isCoordinatorHealthy;
    } catch (error) {
      const wasHealthy = this.isCoordinatorHealthy;
      this.isCoordinatorHealthy = false;
      
      // Mark all workers as stopped on error
      this.workers.forEach(worker => {
        worker.status = 'stopped';
        worker.currentTask = undefined;
      });
      
      if (wasHealthy !== this.isCoordinatorHealthy) {
        this.emit('coordinatorHealthChange', this.isCoordinatorHealthy);
        logger.warn({
      category: 'process',
      action: 'worker_health_check_failed',
      message: 'Worker health check failed:',
      details: { error }
    });
      }
      
      return false;
    }
  }

  private async updateWorkerHealth(): Promise<void> {
    try {
      const processInfo = await this.processManager.getServiceStatus('dev-bots');
      if (processInfo?.status !== 'running') {
        this.isCoordinatorHealthy = false;
      }
    } catch (error) {
      this.isCoordinatorHealthy = false;
    }
  }
  
  private async checkCleanupSchedules(): Promise<void> {
    try {
      const dueTasks = this.scopeControl.checkCleanupSchedules();
      for (const taskType of dueTasks) {
        const cleanupTask = this.scopeControl.createCleanupTask(taskType, Date.now());
        await this.taskQueue.createTask(cleanupTask);
        logger.info({
      category: 'process',
      action: 'cleanup_scheduled_tasktype_cleanup_task_cleanuptas',
      message: `[CLEANUP] Scheduled ${taskType} cleanup task: ${cleanupTask.id}`
    });
      }
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_check_cleanup_schedules',
      message: 'Failed to check cleanup schedules:',
      error: error
    });
    }
  }

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

    // Try to assign immediately
    await this.assignNextTask();

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

  public completeWorkerOnboarding(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.onboardingComplete = true;
      worker.lastOnboardingCheck = Date.now();
      logger.info({
      category: 'process',
      action: 'worker_workerid_onboarding_completed',
      message: `Worker ${workerId} onboarding completed`
    });
    }
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

  public getCompletedTasks(): Task[] {
    return this.taskPersistence.loadCompletedTasks();
  }

  public getWorkerCount(): number {
    return this.ephemeralWorkerService.getActiveWorkers().length;
  }

  public getMaxWorkers(): number {
    return 2;
  }



  /**
   * Choose which agent type (CLI tool) to use for the next task
   * Implements rotation strategy for agent comparison
   */

  /**
   * Initialize worker-specific log file
   */
  private extractAndRecordTokenUsage(task: Task, output: string): void {
    try {
      const tokenTracking = getTokenTrackingService();

      // Try to extract token usage from output
      // Format: "Input tokens: 1234, Output tokens: 567"
      const inputMatch = output.match(/Input tokens?:\s*(\d+)/i);
      const outputMatch = output.match(/Output tokens?:\s*(\d+)/i);

      if (inputMatch && outputMatch) {
        const inputTokens = parseInt(inputMatch[1], 10);
        const outputTokens = parseInt(outputMatch[1], 10);

        // Determine provider from task or default to 'claude'
        const provider = task.assigned_agent?.includes('codex') ? 'codex' : 'claude';

        tokenTracking.recordUsage({
          provider,
          model: task.assigned_agent || 'unknown',
          taskId: task.id,
          inputTokens,
          outputTokens
        });

        logger.info({
          category: 'token-tracking',
          action: 'recorded_token_usage',
          message: `Recorded token usage for task ${task.id}`,
          details: { provider, inputTokens, outputTokens }
        });
      }
    } catch (error) {
      logger.error({
        category: 'token-tracking',
        action: 'failed_to_extract_tokens',
        message: 'Failed to extract and record token usage',
        error
      });
    }
  }

  /**
   * Run quality gate validation on a completed task
   * This is async and runs in the background - it doesn't block task completion
   */

  /**
   * Complete task in ephemeral worker
   */

  /**
   * Destroy ephemeral worker container
   */
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

    // Stop all active ephemeral workers
    for (const worker of this.ephemeralWorkerService.getAllWorkers().values()) {
      if (worker.status !== 'destroyed') {
        // Mark task as failed and destroy container
        worker.task.status = 'failed';
        worker.task.error = 'System stopped';
        worker.task.completed_at = Date.now();
        worker.task.can_retry = true;
        // Task status already updated in SQLite (no in-memory storage needed)
        this.taskPersistence.saveCompletedTasks([worker.task]);

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

  public exportTasks(exportPath: string): void {
    try {
      // Get all tasks from SQLite
      const allTasks = [
        ...this.taskQueue.getTasksByStatus('pending'),
        ...this.taskQueue.getTasksByStatus('running'),
        ...this.taskQueue.getTasksByStatus('completed'),
        ...this.taskQueue.getTasksByStatus('failed')
      ];
      this.taskPersistence.exportTasks(allTasks, exportPath);
      logger.info({
      category: 'process',
      action: 'tasks_exported_to_exportpath',
      message: `Tasks exported to ${exportPath}`
    });
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_export_tasks',
      message: 'Failed to export tasks:',
      error: error
    });
      throw error;
    }
  }

  public async importTasks(importPath: string): Promise<void> {
    try {
      const importedTasks = this.taskPersistence.importTasks(importPath);
      
      // Import tasks directly into SQLite
      for (const task of importedTasks) {
        await this.taskQueue.createTask(task);
      }

      // this.saveTasksToPersistence(); // DEPRECATED
      logger.info({
      category: 'process',
      action: 'imported_importedtasks_length_tasks_from_importpat',
      message: `Imported ${importedTasks.length} tasks from ${importPath}`
    });
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_import_tasks',
      message: 'Failed to import tasks:',
      error: error
    });
      throw error;
    }
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
      maxWorkers: 2,
      activeWorkerTypes: activeEphemeralWorkers.map(w => w.id),
      availableWorkerTypes: Array.from(
        { length: Math.max(2 - activeEphemeralWorkers.length, 0) },
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
    } as any;

    // TaskQueueService doesn't have unshift(), use createTask instead
    await this.taskQueue.createTask(recoveryTask);
    await this.assignNextTask();
    return recoveryTask;
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
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Clear all scheduled retries
    this.retryManager.clearAllRetries();
  }
}
