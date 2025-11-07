import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import os from 'os';
import { logger } from '../utils/logger.js';
import { ProcessManager, ProcessInfo } from './processManager.js';
import Docker from 'dockerode';
import { TaskPersistence, TaskStorageConfig } from './taskPersistence.js';
import { TaskQueueService, Task, TaskStatus as SQLiteTaskStatus } from './taskQueue.sqlite.js';
import { TaskQueueMigration } from './taskQueue.migration.js';
import { AgentPersonalityManager, AgentPersonality } from './agentPersonalities.js';
import { TaskPromptTemplateManager, TaskContext } from './taskPromptTemplates.js';
import { TaskCreationGuidelinesManager, EnhancedTaskData } from './taskCreationGuidelines.js';
import { WorkspaceSyncManager, SyncOptions, SyncResult } from './workspaceSyncManager.js';
import { DockerManager, DockerValidationResult } from './dockerManager.js';
import { RetryManager, RetryConfig } from './retryManager.js';
import { getTokenTrackingService } from './tokenTracking.js';
import { getQualityGateValidator, QualityValidationResult } from './qualityGates.js';
import { WorkspaceOrchestrator, WorkspaceContext, PushCoordinator } from './workspaceOrchestrator.js';
import {
  detectFailurePattern,
  generateFailureInsights,
  getCleanupStrategy,
  isTaskStuck,
  TIME_BASED_GUARDS
} from './taskFailureGuards.js';
import { SimpleFailureRecovery } from './failureRecovery.js';
import { config } from '../config.js';

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
// Re-export TaskStatus for compatibility
export type TaskStatus = SQLiteTaskStatus;

export interface EphemeralWorker {
  id: string;
  containerId: string;
  agent: AgentPersonality;
  task: Task;
  status: 'starting' | 'running' | 'completing' | 'destroyed';
  createdAt: string;
  workspace: WorkspaceContext;
  destroyedAt?: string;
}

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

// Scope Control System Classes
class ScopeCreepDetector {
  detectCreepPatterns(task: Task, output: string): Array<{ type: string; severity: string }> {
    const patterns = {
      fileCreation: /(?:created|new file|mkdir|touch|writeFile|fs\.write)/gi,
      overEngineering: /(?:complex|sophisticated|advanced|enterprise|scalable)/gi,
      scopeExpansion: /(?:also|additionally|furthermore|moreover|while we're at it)/gi,
      unnecessaryComplexity: /(?:design pattern|architecture|framework|library|dependency)/gi,
      featureCreep: /(?:feature|enhancement|improvement|optimization|refactoring)/gi
    };
    
    const violations: Array<{ type: string; severity: string }> = [];
    Object.entries(patterns).forEach(([type, regex]) => {
      if (regex.test(output)) {
        violations.push({ type, severity: this.getSeverity(type, output) });
      }
    });
    
    return violations;
  }
  
  private getSeverity(type: string, _output: string): string {
    const severityMap: Record<string, string> = {
      'fileCreation': 'HIGH',
      'overEngineering': 'MEDIUM', 
      'scopeExpansion': 'HIGH',
      'unnecessaryComplexity': 'MEDIUM',
      'featureCreep': 'LOW'
    };
    return severityMap[type] || 'LOW';
  }
}

interface CleanContext {
  allowedFiles: string[];
  maxComplexity: string;
  forbiddenPatterns: string[];
  scope: string;
}

class ContextIsolation {
  private cleanContexts = new Map<string, CleanContext>();
  private contaminatedContexts = new Set<string>();

  isolateContaminatedContext(taskId: string, _violations: Array<{ type: string; severity: string }>): void {
    this.contaminatedContexts.add(taskId);
    const cleanContext = this.createCleanContext(taskId);
    this.cleanContexts.set(taskId, cleanContext);
    logger.info({
      category: 'process',
      action: 'context_isolation_isolated_contaminated_context_fo',
      message: `[CONTEXT_ISOLATION] Isolated contaminated context for task ${taskId}`
    });
  }

  private createCleanContext(_taskId: string): CleanContext {
    return {
      allowedFiles: ['existing-files-only'],
      maxComplexity: 'simple',
      forbiddenPatterns: ['create', 'new', 'complex', 'sophisticated'],
      scope: 'minimal'
    };
  }

  getBaselineContext(): CleanContext {
    return {
      allowedFiles: ['existing-files-only'],
      maxComplexity: 'simple',
      forbiddenPatterns: ['create', 'new', 'complex', 'sophisticated'],
      scope: 'minimal'
    };
  }
}

interface ViolationChainEntry {
  taskId: string;
  violations: Array<{ type: string; severity: string }>;
  timestamp: number;
}

class SnowballPrevention {
  private violationChain = new Map<string, ViolationChainEntry[]>();

  detectViolationChain(taskId: string, violations: Array<{ type: string; severity: string }>): void {
    const chain = this.violationChain.get(taskId) || [];
    chain.push({
      taskId,
      violations,
      timestamp: Date.now()
    });

    this.violationChain.set(taskId, chain);

    if (chain.length >= 3) {
      this.triggerChainBreaker(taskId, chain);
    }
  }

  private triggerChainBreaker(taskId: string, chain: ViolationChainEntry[]): void {
    logger.warn({
      category: 'process',
      action: 'chain_breaker_detected_violation_chain_of_chain_le',
      message: `[CHAIN_BREAKER] Detected violation chain of ${chain.length} tasks - triggering emergency recovery`
    });
    // Emergency recovery will be handled by the main manager
  }
}

class PeriodicCleanupScheduler {
  private schedules = {
    linting: { interval: 6 * 60 * 60 * 1000, lastRun: Date.now() },
    deduplication: { interval: 12 * 60 * 60 * 1000, lastRun: Date.now() },
    documentation: { interval: 24 * 60 * 60 * 1000, lastRun: Date.now() },
    testing: { interval: 48 * 60 * 60 * 1000, lastRun: Date.now() },
    deepCleanup: { interval: 7 * 24 * 60 * 60 * 1000, lastRun: Date.now() }
  };
  
  checkSchedules(): string[] {
    const now = Date.now();
    const dueTasks: string[] = [];
    
    Object.entries(this.schedules).forEach(([type, schedule]) => {
      if (now - schedule.lastRun >= schedule.interval) {
        dueTasks.push(type);
        schedule.lastRun = now;
      }
    });
    
    return dueTasks;
  }
  
  createCleanupTask(type: string, taskIdCounter: number): Task {
    const cleanupTasks: Record<string, {
      description: string;
      scope: {
        type: string;
        boundaries: {
          maxChanges: number;
          forbiddenActions: string[];
          maxNewLines: number;
        };
        validation: {
          forbiddenPatterns: string[];
          allowedPatterns: string[];
        };
      };
    }> = {
      linting: {
        description: 'PERIODIC CLEANUP: Run linting and fix code style issues. Focus on existing files only.',
        scope: {
          type: 'cleanup',
          boundaries: { maxChanges: 5, forbiddenActions: ['create-new-files'], maxNewLines: 20 },
          validation: { forbiddenPatterns: ['create', 'new'], allowedPatterns: ['fix', 'format', 'style'] }
        }
      },
      deduplication: {
        description: 'PERIODIC CLEANUP: Remove duplicate code and consolidate similar functions.',
        scope: {
          type: 'cleanup',
          boundaries: { maxChanges: 3, forbiddenActions: ['create-new-files'], maxNewLines: 15 },
          validation: { forbiddenPatterns: ['create', 'new'], allowedPatterns: ['remove', 'consolidate', 'merge'] }
        }
      },
      documentation: {
        description: 'PERIODIC CLEANUP: Update and standardize documentation. Fix outdated comments.',
        scope: {
          type: 'cleanup',
          boundaries: { maxChanges: 8, forbiddenActions: ['create-new-files'], maxNewLines: 30 },
          validation: { forbiddenPatterns: ['create', 'new'], allowedPatterns: ['update', 'fix', 'standardize'] }
        }
      },
      testing: {
        description: 'PERIODIC CLEANUP: Run tests and fix failing tests. Improve test coverage.',
        scope: {
          type: 'cleanup',
          boundaries: { maxChanges: 10, forbiddenActions: ['create-new-files'], maxNewLines: 50 },
          validation: { forbiddenPatterns: ['create', 'new'], allowedPatterns: ['fix', 'improve', 'test'] }
        }
      },
      deepCleanup: {
        description: 'PERIODIC CLEANUP: Deep codebase cleanup. Remove unused code, optimize imports.',
        scope: {
          type: 'cleanup',
          boundaries: { maxChanges: 15, forbiddenActions: ['create-new-files'], maxNewLines: 100 },
          validation: { forbiddenPatterns: ['create', 'new'], allowedPatterns: ['remove', 'optimize', 'clean'] }
        }
      }
    };
    
    const task = cleanupTasks[type];
    return {
      id: `task-${taskIdCounter}-${Date.now()}`,
      type: 'cleanup',
      title: task.description.substring(0, 100),
      description: task.description,
      status: 'pending',
      createdAt: new Date().toISOString(),
      assignedAgent: 'backend-specialist',
      scope: task.scope
    };
  }
}

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
  private ephemeralWorkers = new Map<string, EphemeralWorker>();
  private readonly MAX_CONCURRENT_WORKERS = 2; // Maximum 2 workers as per architecture

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

  // Scope control systems
  private scopeCreepDetector = new ScopeCreepDetector();
  private contextIsolation = new ContextIsolation();
  private snowballPrevention = new SnowballPrevention();
  private cleanupScheduler = new PeriodicCleanupScheduler();

  // System state
  private startTime = Date.now();

  constructor(processManager: ProcessManager) {
    super();
    this.processManager = processManager;

    // Initialize Docker Manager with validation
    this.dockerManager = new DockerManager('/var/run/docker.sock');
    this.docker = this.dockerManager.getDocker();

    // Validate Docker environment and initialize
    this.initializeDockerEnvironment();

    // Initialize enhanced services (async, runs in background)
    void this.initializeEnhancedServices();

    // Ephemeral workers are created on-demand, no initialization needed

    // Load persisted tasks - DEPRECATED (now using SQLite migration)
    // this.loadPersistedTasks();

    // NOTE: Cleanup tasks should be created manually via the task API
    // Linting, testing, documentation are part of the development process
    // via git hooks, CI/CD, and manual code review
    // this.startCleanupScheduler(); // REMOVED - cleanup is not automatic

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

  private async initializeEnhancedServices(): Promise<void> {
    // Initialize SQLite task queue
    const dbPath = './data/tasks/queue.db';
    this.taskQueue = new TaskQueueService(dbPath);

    // Run recovery system migration
    await this.taskQueue.runRecoveryMigration();

    // Initialize legacy task persistence (for migration only)
    const storageConfig: TaskStorageConfig = {
      storagePath: './data/tasks',
      backupPath: './data/backups',
      maxBackups: 10,
      autoSave: true,
      saveInterval: 30000 // 30 seconds
    };
    this.taskPersistence = new TaskPersistence(storageConfig);

    // Run migration from JSON to SQLite
    this.migrateToSQLite();

    // Initialize agent personality manager
    this.agentManager = new AgentPersonalityManager();

    // Initialize template manager
    this.templateManager = new TaskPromptTemplateManager();

    // Initialize guidelines manager
    this.guidelinesManager = new TaskCreationGuidelinesManager();

    // Initialize workspace orchestrator for dynamic workspaces
    this.workspaceOrchestrator = new WorkspaceOrchestrator();
    if (typeof this.workspaceOrchestrator.initialize === 'function') {
      this.workspaceOrchestrator.initialize();
    }

    // Initialize workspace sync manager
    this.workspaceSyncManager = new WorkspaceSyncManager({
      baseDir: path.resolve(path.join(process.cwd(), '../../')),
      repositories: ['job-finder-BE', 'job-finder-FE', 'job-finder-shared-types', 'job-finder-worker'],
      workers: [],
      conflictStrategy: 'auto-merge'
    });

    // Initialize retry manager
    const retryConfig: Partial<RetryConfig> = {
      maxRetries: 3
    };

    // Initialize simple failure recovery
    this.recovery = new SimpleFailureRecovery(this);
    this.retryManager = new RetryManager(retryConfig);

    // Listen for retry events
    this.retryManager.on('taskReadyForRetry', (task: Task) => {
      this.handleTaskRetry(task);
    });

    // Start monitoring loops
    this.startHeartbeatMonitor();
    this.startLongRunningTaskMonitor();

    logger.info({
      category: 'process',
      action: 'enhanced_services_initialized',
      message: 'Enhanced services initialized: task persistence, agent personalities, prompt templates, creation guidelines, workspace sync, retry management, and monitoring loops'
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
            await this.cleanupStuckTaskContainers(task.id);

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

  /**
   * Cleanup Docker containers for stuck task
   */
  private async cleanupStuckTaskContainers(taskId: string): Promise<void> {
    const docker = new Docker();

    try {
      // List all containers (including stopped) with this task ID in name
      const containers = await docker.listContainers({ all: true });
      const taskContainers = containers.filter(c =>
        c.Names.some(name => name.includes(taskId))
      );

      for (const containerInfo of taskContainers) {
        try {
          const container = docker.getContainer(containerInfo.Id);

          // Force kill if running
          if (containerInfo.State === 'running') {
            logger.info({
              category: 'process',
              action: 'force_killing_stuck_container',
              message: `Force killing container ${containerInfo.Id.substring(0, 12)} for stuck task ${taskId}`
            });
            await container.kill();
          }

          // Remove container
          await container.remove({ force: true });

          logger.info({
            category: 'process',
            action: 'stuck_container_removed',
            message: `Removed container ${containerInfo.Id.substring(0, 12)} for task ${taskId}`
          });
        } catch (error) {
          logger.warn({
            category: 'process',
            action: 'container_cleanup_error',
            message: `Error cleaning up container ${containerInfo.Id.substring(0, 12)}: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'container_list_error',
        message: `Failed to list containers for cleanup: ${error instanceof Error ? error.message : String(error)}`
      });
    }
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
      const dueTasks = this.cleanupScheduler.checkSchedules();
      for (const taskType of dueTasks) {
        const cleanupTask = this.cleanupScheduler.createCleanupTask(taskType, this.taskIdCounter++);
        this.taskQueue.push(cleanupTask);
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
      ...(('architectureReferences' in taskData && taskData.architectureReferences) && { architectureReferences: taskData.architectureReferences }),
      ...(('longTermGoals' in taskData && taskData.longTermGoals) && { longTermGoals: taskData.longTermGoals }),
      ...(('estimatedEffort' in taskData && taskData.estimatedEffort) && { estimatedEffort: taskData.estimatedEffort }),
      ...(('prerequisites' in taskData && taskData.prerequisites) && { prerequisites: taskData.prerequisites }),
      ...(('contextBoundaries' in taskData && taskData.contextBoundaries) && { contextBoundaries: taskData.contextBoundaries }),
      ...(('validationSteps' in taskData && taskData.validationSteps) && { validationSteps: taskData.validationSteps }),
      ...(('rollbackPlan' in taskData && taskData.rollbackPlan) && { rollbackPlan: taskData.rollbackPlan }),
      ...(('successMetrics' in taskData && taskData.successMetrics) && { successMetrics: taskData.successMetrics }),
      ...(('testingRequirements' in taskData && taskData.testingRequirements) && { testingRequirements: taskData.testingRequirements }),
      ...(('documentationRequirements' in taskData && taskData.documentationRequirements) && { documentationRequirements: taskData.documentationRequirements }),
      ...(('requiredSkills' in taskData && taskData.requiredSkills) && { requiredSkills: taskData.requiredSkills }),
      ...(('parentInitiative' in taskData && taskData.parentInitiative) && { parentInitiative: taskData.parentInitiative }),
      ...(('relatedTasks' in taskData && taskData.relatedTasks) && { relatedTasks: taskData.relatedTasks }),
      ...(('blockers' in taskData && taskData.blockers) && { blockers: taskData.blockers }),
      ...(('assumptions' in taskData && taskData.assumptions) && { assumptions: taskData.assumptions }),
      ...(('risks' in taskData && taskData.risks) && { risks: taskData.risks }),
      ...(('alternatives' in taskData && taskData.alternatives) && { alternatives: taskData.alternatives })
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
      priority: ('priority' in taskData && taskData.priority !== undefined) ? taskData.priority : (normalizedData.estimatedEffort?.priority || 5),
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

    // Convert SQLite task to legacy Task format for return value
    const task: Task = {
      id: sqliteTask.id,
      type: sqliteTask.type,
      title: sqliteTask.title,
      description: sqliteTask.description || '',
      status: sqliteTask.status as 'pending' | 'assigned' | 'active' | 'completed' | 'failed',
      createdAt: new Date(sqliteTask.created_at).toISOString(),
      project: normalizedData.project,
      assignedAgent: sqliteTask.assigned_agent || undefined,
      files: sqliteTask.files || [],
      dependencies: normalizedData.dependencies || [],
      acceptanceCriteria: sqliteTask.acceptance_criteria || [],
      architectureReferences: sqliteTask.architecture_references,
      longTermGoals: normalizedData.longTermGoals,
      estimatedEffort: normalizedData.estimatedEffort,
      prerequisites: normalizedData.prerequisites,
      contextBoundaries: normalizedData.contextBoundaries,
      validationSteps: sqliteTask.validation_steps,
      rollbackPlan: normalizedData.rollbackPlan,
      successMetrics: sqliteTask.success_metrics,
      testingRequirements: normalizedData.testingRequirements,
      documentationRequirements: normalizedData.documentationRequirements,
      requiredSkills: normalizedData.requiredSkills,
      parentInitiative: normalizedData.parentInitiative,
      relatedTasks: normalizedData.relatedTasks,
      blockers: normalizedData.blockers,
      assumptions: normalizedData.assumptions,
      risks: normalizedData.risks,
      alternatives: normalizedData.alternatives,
      metadata: ('metadata' in taskData && taskData.metadata) ? taskData.metadata : undefined
    };

    this.emit('taskAdded', task);
    logger.info({
      category: 'process',
      action: 'task_added',
      message: `Task added: ${task.id} - ${normalizedData.title} (Agent: ${normalizedData.assignedAgent || 'auto-assign'}, fingerprint: ${fingerprint.substring(0, 8)}...)`
    });

    // Try to assign immediately
    await this.assignNextTask();

    return { task, validation };
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

  
  async assignNextTask(): Promise<void> {
    // Check active worker count against concurrency limit
    const activeWorkers = Array.from(this.ephemeralWorkers.values()).filter(
      worker => worker.status !== 'destroyed'
    );

    const queueMetrics = this.taskQueue.getQueueMetrics();
    logger.info({
      category: 'process',
      action: 'task_assignment_check',
      message: `Task assignment check: ${queueMetrics.pending} pending tasks, ${activeWorkers.length}/${this.MAX_CONCURRENT_WORKERS} active workers`,
      workflow_insights: {
        queue_depth: queueMetrics.pending,
        active_workers: activeWorkers.length,
        capacity_available: this.MAX_CONCURRENT_WORKERS - activeWorkers.length,
        queue_health: queueMetrics.pending > 10 ? 'HIGH_LOAD' : queueMetrics.pending > 5 ? 'MODERATE' : 'HEALTHY',
        infrastructure_recommendation:
          queueMetrics.pending > 10 && activeWorkers.length >= this.MAX_CONCURRENT_WORKERS
            ? 'Consider increasing MAX_CONCURRENT_WORKERS to reduce queue backlog'
            : queueMetrics.pending === 0
            ? 'Queue empty - consider adding more tasks'
            : 'Infrastructure capacity balanced'
      }
    });

    if (activeWorkers.length >= this.MAX_CONCURRENT_WORKERS) {
      logger.warn({
        category: 'process',
        action: 'max_workers_active_skipping_assignment',
        message: `Maximum concurrent workers active (${this.MAX_CONCURRENT_WORKERS}). ${queueMetrics.pending} tasks queued.`,
        actionable_insights: {
          bottleneck: 'CONCURRENCY_LIMIT',
          recommendation: queueMetrics.pending > 5
            ? 'Increase MAX_CONCURRENT_WORKERS to process queue faster'
            : 'Wait for active workers to complete',
          queue_wait_time_estimate: queueMetrics.avg_completion_time_ms
            ? `~${Math.ceil((queueMetrics.pending * queueMetrics.avg_completion_time_ms) / (this.MAX_CONCURRENT_WORKERS * 60000))} minutes`
            : 'Unknown'
        }
      });
      return;
    }

    // Atomically assign next task from SQLite queue
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const sqliteTask = this.taskQueue.assignNextTask(workerId);

    if (!sqliteTask) {
      logger.info({
        category: 'process',
        action: 'no_pending_tasks_in_queue',
        message: 'No pending tasks in queue'
      });
      return;
    }

    // Convert SQLite task to legacy Task format
    const nextTask: Task = {
      id: sqliteTask.id,
      type: sqliteTask.type,
      title: sqliteTask.title,
      description: sqliteTask.description || '',
      status: 'assigned',
      createdAt: new Date(sqliteTask.created_at).toISOString(),
      assignedAt: new Date(sqliteTask.assigned_at!).toISOString(),
      project: 'dev-monitor',
      assignedAgent: sqliteTask.assigned_agent,
      assignedWorker: workerId,
      files: sqliteTask.files || [],
      dependencies: [],
      acceptanceCriteria: sqliteTask.acceptance_criteria || [],
      architectureReferences: sqliteTask.architecture_references,
      validationSteps: sqliteTask.validation_steps,
      successMetrics: sqliteTask.success_metrics,
      estimatedEffort: sqliteTask.estimated_hours ? {
        hours: sqliteTask.estimated_hours,
        complexity: sqliteTask.complexity
      } : undefined
    };

    // Ensure mirror is up to date before provisioning workspace
    try {
      this.workspaceOrchestrator.initialize();
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'workspace_orchestrator_init_failed',
        message: `Workspace orchestrator failed before assigning task ${nextTask.id}`,
        error
      });

      // Fail task in SQLite
      this.taskQueue.failTask(
        nextTask.id,
        `Workspace initialization failed: ${error instanceof Error ? error.message : String(error)}`
      );

      return;
    }

    // Get agent personality
    const requestedAgent = this.agentManager.getPersonality(nextTask.assigned_agent);
    if (!requestedAgent) {
      logger.error({
        category: 'process',
        action: 'agent_not_found',
        message: `No agent found for ${nextTask.assigned_agent}`
      });

      // Fail task in SQLite
      this.taskQueue.failTask(
        nextTask.id,
        `Agent not found: ${nextTask.assigned_agent}. Please check agent name is correct.`
      );

      // Try next task
      this.assignNextTask();
      return;
    }

    logger.info({
      category: 'process',
      action: 'assigning_task_to_worker',
      message: `Assigning task ${nextTask.id} to worker ${workerId} with agent ${requestedAgent.id}`
    });

    const agent = requestedAgent;

    // Generate task prompt
    const taskContext: TaskContext = {
      task: nextTask,
      agent: agent,
      project: nextTask.project || 'dev-monitor',
      worktree: '[dynamic workspace provisioned per task]',
      environment: 'development'
    };

    nextTask.prompt = this.templateManager.generatePrompt(taskContext);

    try {
      // Execute task using imagineer-style ephemeral container
      await this.executeTaskWithDockerRun(nextTask, agent);

      logger.info({
        category: 'process',
        action: 'task_execution_completed',
        message: `Task execution completed: ${nextTask.id}`
      });

    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_create_ephemeral_worker',
        message: `Failed to create ephemeral worker for task ${nextTask.id}:`,
        error: error
      });

      // Fail task in SQLite
      this.taskQueue.failTask(
        nextTask.id,
        error instanceof Error ? error.message : String(error)
      );

      // Try next task
      this.assignNextTask();
    }

    this.emit('taskAssigned', nextTask);
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
    return this.ephemeralWorkers.size;
  }

  public getMaxWorkers(): number {
    return this.MAX_CONCURRENT_WORKERS;
  }



  /**
   * Choose which agent type (CLI tool) to use for the next task
   * Implements rotation strategy for agent comparison
   */
  private chooseAgentType(): 'claude' | 'codex' {
    switch (this.AGENT_ROTATION_STRATEGY) {
      case 'alternate':
        // Alternate between Claude and Codex
        this.lastAgentType = this.lastAgentType === 'claude' ? 'codex' : 'claude';
        return this.lastAgentType;

      case 'random':
        // Randomly choose between Claude and Codex
        return Math.random() < 0.5 ? 'claude' : 'codex';

      case 'claude-only':
        return 'claude';

      case 'codex-only':
        return 'codex';

      default:
        return 'claude';
    }
  }

  /**
   * Execute task using docker run with ephemeral container (imagineer pattern)
   * This replaces the old createEphemeralWorker + executeTaskInEphemeralWorker approach
   */
  private async executeTaskWithDockerRun(task: Task, agent: AgentPersonality, agentType?: 'claude' | 'codex'): Promise<void> {
    const { spawn } = await import('child_process');

    // Choose agent type if not specified
    const chosenAgentType = agentType || this.chooseAgentType();
    const workerId = `bot-${chosenAgentType}-${agent.id}-${Date.now()}`;

    // Register worker in ephemeralWorkers to enforce concurrency limit
    const ephemeralWorker: EphemeralWorker = {
      id: workerId,
      agent: agent.id,
      status: 'running',
      taskId: task.id,
      createdAt: Date.now()
    };
    this.ephemeralWorkers.set(workerId, ephemeralWorker);

    try {
    // Ensure we're on staging branch
    // Get the project root (parent of backend directory)
    const repoRoot = path.resolve(process.cwd(), '..');
    const baseBranch = 'staging';
    await this.execGitCommand(['checkout', baseBranch], repoRoot);
    await this.execGitCommand(['pull', 'origin', baseBranch], repoRoot);

    // Prepare host-side resources
    const hostLogsDir = this.getHostLogsDir();
    if (!fs.existsSync(hostLogsDir)) {
      fs.mkdirSync(hostLogsDir, { recursive: true });
    }

    const homeDir = os.homedir();

    // Escape prompt for shell (use single quotes and escape any single quotes in content)
    const promptText = (task.prompt || task.description || task.title).replace(/'/g, "'\\''");

    // Build docker run command based on agent type
    let dockerArgs: string[];
    let cliCommand: string;

    if (chosenAgentType === 'codex') {
      // Codex execution
      dockerArgs = [
        'run',
        '--rm',  // Auto-remove container after exit
        '-v', `${repoRoot}:/workspace:rw`,  // Mount workspace directly
        '-v', `${hostLogsDir}:/logs:rw`,  // Mount logs
        '--tmpfs', '/home/node/.codex:uid=1000,gid=1000',  // Writable temp for Codex CLI
        '-v', `${homeDir}/.codex:/tmp/host-codex:ro`,  // Mount Codex credentials
        // Mount git credentials for committing and pushing
        '-v', `${homeDir}/.gitconfig:/home/node/.gitconfig:ro`,  // Git config
        '-v', `${homeDir}/.ssh:/home/node/.ssh:ro`,  // SSH keys for git push
        '-v', `${homeDir}/.config/gh:/home/node/.config/gh:ro`,  // GitHub CLI auth
        this.getAgentDockerImage(agent),
        'sh', '-c',
        // Copy credentials and run Codex with JSON output
        `cp -r /tmp/host-codex/* /home/node/.codex/ 2>/dev/null || true && ` +
        `codex --output-format json '${promptText}'`
      ];
      cliCommand = 'codex';
    } else {
      // Claude execution
      const claudeCredentialsNew = path.join(homeDir, '.claude', '.credentials.json');
      const claudeCredentialsOld = path.join(homeDir, '.claude', 'credentials.json');
      const claudeCredentials = fs.existsSync(claudeCredentialsNew) ? claudeCredentialsNew : claudeCredentialsOld;

      if (!fs.existsSync(claudeCredentials)) {
        throw new Error('Claude credentials file not found. Please run "claude login" first.');
      }

      dockerArgs = [
        'run',
        '--rm',  // Auto-remove container after exit
        '-v', `${repoRoot}:/workspace:rw`,  // Mount workspace directly
        '-v', `${hostLogsDir}:/logs:rw`,  // Mount logs
        '--tmpfs', '/home/node/.claude:uid=1000,gid=1000',  // Writable temp for Claude CLI
        '-v', `${claudeCredentials}:/tmp/host-creds.json:ro`,  // Mount Claude credentials
        // Mount git credentials for committing and pushing
        '-v', `${homeDir}/.gitconfig:/home/node/.gitconfig:ro`,  // Git config
        '-v', `${homeDir}/.ssh:/home/node/.ssh:ro`,  // SSH keys for git push
        '-v', `${homeDir}/.config/gh:/home/node/.config/gh:ro`,  // GitHub CLI auth
        this.getAgentDockerImage(agent),
        'sh', '-c',
        // Copy credentials and run Claude with JSON output (bypass permissions for git access)
        `cp /tmp/host-creds.json /home/node/.claude/.credentials.json && ` +
        `claude --print --dangerously-skip-permissions --permission-mode bypassPermissions --allowedTools 'Bash(git:*)' --output-format json '${promptText}'`
      ];
      cliCommand = 'claude';
    }

    logger.info({
      category: 'process',
      action: 'executing_task_with_docker_run',
      message: `Executing task ${task.id} with ${cliCommand} (ephemeral container)`,
      details: {
        workerId,
        agent: agent.id,
        agentType: chosenAgentType,
        cliTool: cliCommand,
        taskTitle: task.title,
        taskId: task.id,
        image: this.getAgentDockerImage(agent),
        promptLength: promptText.length
      }
    });

    // Execute with spawn
    const dockerProcess = spawn('docker', dockerArgs, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    dockerProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    dockerProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Track task start time for stuck detection
    const taskStartTime = new Date(task.assigned_at || task.created_at);
    const STUCK_CHECK_INTERVAL = 60000; // Check every 60 seconds
    const ABSOLUTE_MAX_DURATION = 60 * 60 * 1000; // 60 minutes

    // Wait for completion with stuck task detection
    const exitCode = await new Promise<number>((resolve, reject) => {
      // Periodic stuck task check
      const stuckCheckInterval = setInterval(() => {
        if (isTaskStuck(taskStartTime, ABSOLUTE_MAX_DURATION)) {
          clearInterval(stuckCheckInterval);
          logger.error({
            category: 'process',
            action: 'task_stuck_timeout',
            message: `Task ${task.id} exceeded maximum duration (${ABSOLUTE_MAX_DURATION / 60000} minutes)`,
            details: {
              taskId: task.id,
              taskTitle: task.title,
              elapsedMs: Date.now() - taskStartTime.getTime(),
              maxDurationMs: ABSOLUTE_MAX_DURATION
            }
          });
          // Kill the docker process
          dockerProcess.kill('SIGKILL');
          reject(new Error(`Task exceeded maximum duration of ${ABSOLUTE_MAX_DURATION / 60000} minutes`));
        }
      }, STUCK_CHECK_INTERVAL);

      dockerProcess.on('close', (code) => {
        clearInterval(stuckCheckInterval);
        resolve(code || 0);
      });
      dockerProcess.on('error', (error) => {
        clearInterval(stuckCheckInterval);
        reject(error);
      });
    });

    // Save dev-bot execution logs to artifacts directory
    const artifactsDir = path.join(process.cwd(), 'dev-bots', 'artifacts');
    const timestamp = Date.now();
    const stdoutLogPath = path.join(artifactsDir, `${task.id}-stdout-${timestamp}.log`);
    const stderrLogPath = path.join(artifactsDir, `${task.id}-stderr-${timestamp}.log`);

    try {
      if (stdout.length > 0) {
        fs.writeFileSync(stdoutLogPath, stdout, 'utf-8');
      }
      if (stderr.length > 0) {
        fs.writeFileSync(stderrLogPath, stderr, 'utf-8');
      }
    } catch (logError) {
      logger.warn({
        category: 'process',
        action: 'failed_to_save_logs',
        message: `Failed to save dev-bot logs to disk: ${logError instanceof Error ? logError.message : String(logError)}`
      });
    }

    // Calculate task execution metrics
    const executionDuration = Date.now() - (task.assigned_at || task.created_at);
    const metrics = this.getQueueMetrics();
    const activeWorkerCount = Array.from(this.ephemeralWorkers.values()).filter(
      w => w.status !== 'destroyed'
    ).length;

    logger.info({
      category: 'process',
      action: 'docker_run_completed',
      message: `Docker run completed with exit code ${exitCode}`,
      details: {
        taskId: task.id,
        taskTitle: task.title,
        exitCode,
        executionDuration_ms: executionDuration,
        executionDuration_human: `${Math.floor(executionDuration / 60000)}m ${Math.floor((executionDuration % 60000) / 1000)}s`,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
        stdoutLog: stdout.length > 0 ? stdoutLogPath : null,
        stderrLog: stderr.length > 0 ? stderrLogPath : null
      },
      workflow_insights: {
        queue_depth: metrics.pending,
        active_workers: activeWorkerCount,
        max_concurrency: this.MAX_CONCURRENT_WORKERS,
        capacity_available: this.MAX_CONCURRENT_WORKERS - activeWorkerCount,
        avg_completion_time_ms: metrics.avg_completion_time_ms,
        task_success_rate: metrics.completed > 0
          ? `${Math.round((metrics.completed / (metrics.completed + metrics.failed)) * 100)}%`
          : 'N/A'
      }
    });

    // Handle task completion
    if (exitCode === 0) {
      try {
        // Parse JSON output from Claude/Codex
        const cliOutput = JSON.parse(stdout);

        // Complete task in SQLite with agent type for comparison tracking
        this.taskQueue.completeTask(task.id, JSON.stringify(cliOutput), chosenAgentType);

        logger.info({
          category: 'process',
          action: 'task_completed_successfully',
          message: `Task ${task.id} completed successfully in ${Math.floor(executionDuration / 60000)}m ${Math.floor((executionDuration % 60000) / 1000)}s`,
          details: {
            taskId: task.id,
            taskTitle: task.title,
            executionDuration_ms: executionDuration,
            outputSize: JSON.stringify(claudeOutput).length
          },
          actionable_insights: {
            recommendation: executionDuration > 600000
              ? 'Task took >10min - consider breaking into smaller tasks'
              : executionDuration > 300000
              ? 'Task took >5min - monitor for potential optimization'
              : 'Execution time within normal range',
            next_task_available: metrics.pending > 0,
            queue_health: metrics.pending > 10 ? 'HIGH_LOAD' : metrics.pending > 5 ? 'MODERATE' : 'HEALTHY'
          }
        });

        // Update local task object for event emission
        task.status = 'completed';
        task.output = JSON.stringify(claudeOutput);
        task.completed_at = Date.now();

        // Check if this was a cleanup task - if so, create followup task
        if (task.is_repair_bot && task.repair_stage === 'cleanup') {
          await this.recovery.createFollowupTask(task);
        }

        this.emit('taskCompleted', task);

      } catch (parseError) {
        // JSON parse failed - treat as error
        logger.error({
          category: 'process',
          action: 'failed_to_parse_claude_output',
          message: `Failed to parse Claude output for task ${task.id}`,
          details: { stdout, stderr, parseError }
        });

        // Fail task in SQLite
        this.taskQueue.failTask(
          task.id,
          `Failed to parse Claude output: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        );

        // Update local task object for event emission
        task.status = 'failed';
        task.error = `Failed to parse Claude output: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
        task.completed_at = Date.now();

        this.emit('taskFailed', task);
      }
    } else {
      // Non-zero exit code - check against failure guard patterns
      const failurePattern = detectFailurePattern(stderr, stdout, exitCode);
      const insights = failurePattern ? generateFailureInsights(failurePattern, task.id) : null;
      const cleanupStrategy = failurePattern ? getCleanupStrategy(failurePattern) : null;

      logger.error({
        category: 'process',
        action: 'docker_run_failed',
        message: `Docker run failed for task ${task.id} with exit code ${exitCode}`,
        details: {
          taskId: task.id,
          taskTitle: task.title,
          executionDuration_ms: executionDuration,
          exitCode,
          stdout,
          stderr,
          failureGuard: failurePattern ? {
            name: failurePattern.name,
            category: failurePattern.category,
            immediateFailure: failurePattern.immediateFailure
          } : null
        }
      });

      // Attempt automatic recovery if failure pattern detected and feature flag enabled
      if (failurePattern && config.recovery.enabled) {
        try {
          // Check dry run mode
          if (config.recovery.dryRun) {
            logger.info({
              category: 'recovery',
              action: 'recovery_dry_run',
              message: `Would attempt recovery for task ${task.id} (dry run mode)`,
              details: {
                taskId: task.id,
                failurePattern: failurePattern.name,
                category: failurePattern.category
              }
            });
            // Continue with normal failure handling in dry run mode
          } else {
            // Attempt simplified recovery
            const recoveryResult = await this.recovery.attemptRecovery({
              task,
              failurePattern,
              stderr,
              stdout,
              exitCode
            });

            if (recoveryResult.recovered) {
              logger.info({
                category: 'recovery',
                action: 'task_auto_recovered',
                message: `Task ${task.id} automatically recovered`,
                details: recoveryResult
              });

              // Recovery successful - task was handled by cleanup + followup bots
              // Skip normal failure handling
              this.ephemeralWorkers.delete(workerId);
              return;
            }
          }
        } catch (recoveryError) {
          logger.error({
            category: 'recovery',
            action: 'recovery_attempt_error',
            message: `Recovery attempt failed with error`,
            error: recoveryError
          });
          // Continue with normal failure handling
        }
      }

      // Fail task in SQLite (only if recovery didn't succeed)
      const errorMessage = failurePattern
        ? `${failurePattern.name}: ${failurePattern.description}. ${failurePattern.suggestedFix || ''}`
        : `Docker run failed with exit code ${exitCode}. stderr: ${stderr}`;

      this.taskQueue.failTask(task.id, errorMessage);

      logger.error({
        category: 'process',
        action: 'task_failed',
        message: `Task ${task.id} failed after ${Math.floor(executionDuration / 60000)}m ${Math.floor((executionDuration % 60000) / 1000)}s`,
        details: {
          taskId: task.id,
          taskTitle: task.title,
          exitCode,
          executionDuration_ms: executionDuration,
          stderrPreview: stderr.substring(0, 500),
          failureCategory: failurePattern?.category || 'UNKNOWN',
          cleanupStrategy: cleanupStrategy || {
            force_kill: false,
            cleanup_volumes: false,
            save_artifacts: true
          }
        },
        actionable_insights: insights || {
          should_retry: false,
          recommended_action: exitCode === 137
            ? 'Increase Docker memory limit or optimize task complexity'
            : exitCode === 1
            ? 'Review stderr for CLI errors or task configuration issues'
            : 'Review Docker logs and task prompt for issues',
          investigation_hints: [
            `Check task logs: dev-bots/artifacts/${task.id}-stderr-*.log`,
            'Review exit code and stderr for error patterns'
          ],
          category: exitCode === 137 ? 'oom' : 'system_error'
        }
      });

      // Update local task object for event emission
      task.status = 'failed';
      task.error = `Docker run failed with exit code ${exitCode}. stderr: ${stderr}`;
      task.completedAt = new Date().toISOString();

      this.emit('taskFailed', task);
    }

    // Safety mechanism: Check for uncommitted changes and capture them
    await this.captureUncommittedChanges(task);

    // Try to assign next task
    this.assignNextTask();
    } finally {
      // Always remove worker from ephemeralWorkers to allow next task assignment
      this.ephemeralWorkers.delete(workerId);
      logger.info({
        category: 'process',
        action: 'ephemeral_worker_cleaned_up',
        message: `Removed ephemeral worker ${workerId} from tracking (active workers: ${this.ephemeralWorkers.size})`
      });
    }
  }

  /**
   * Safety Mechanism: Capture uncommitted changes after task completion
   * This prevents data loss when bots complete tasks but fail to commit
   */
  private async captureUncommittedChanges(task: Task): Promise<void> {
    try {
      const repoRoot = process.cwd();

      // Check if there are uncommitted changes
      const statusOutput = await this.execGitCommand(['status', '--porcelain'], repoRoot);

      if (statusOutput.trim()) {
        // Uncommitted changes detected
        const timestamp = Date.now();
        const artifactsDir = path.join(repoRoot, 'dev-bots', 'artifacts');

        // Ensure artifacts directory exists
        if (!fs.existsSync(artifactsDir)) {
          fs.mkdirSync(artifactsDir, { recursive: true });
        }

        // Create patch file with uncommitted changes
        const patchFile = path.join(artifactsDir, `${task.id}-uncommitted-${timestamp}.patch`);
        const diffOutput = await this.execGitCommand(['diff', 'HEAD'], repoRoot);
        fs.writeFileSync(patchFile, diffOutput);

        // Create status file listing modified files
        const statusFile = path.join(artifactsDir, `${task.id}-status-${timestamp}.txt`);
        fs.writeFileSync(statusFile, statusOutput);

        // Check if bot made new commits
        const botCommitted = await this.verifyBotCommitted(task, repoRoot);

        if (!botCommitted) {
          logger.warn({
            category: 'process',
            action: 'uncommitted_changes_captured',
            message: `Task ${task.id} completed but did NOT commit. Changes saved to patch file.`,
            details: {
              taskId: task.id,
              patchFile,
              statusFile,
              linesChanged: diffOutput.split('\n').length
            }
          });

          // TODO: Store uncommitted changes warning (SQLite Task doesn't have metadata field)
          // For now, log the warning - can be added to Task.error or separate tracking table if needed
          logger.warn({
            category: 'process',
            action: 'uncommitted_changes_detected',
            message: 'Task completed with uncommitted changes',
            details: { taskId: task.id, patchFile, statusFile }
          });
        } else {
          logger.info({
            category: 'process',
            action: 'uncommitted_changes_post_commit',
            message: `Task ${task.id} has uncommitted changes AFTER committing. May be unrelated changes.`,
            details: {
              taskId: task.id,
              patchFile,
              statusFile
            }
          });
        }
      }
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'capture_uncommitted_changes_failed',
        message: 'Failed to capture uncommitted changes',
        error,
        details: { taskId: task.id }
      });
    }
  }

  /**
   * Safety Mechanism: Verify if bot created new commits
   * Checks git log to see if commits were made during task execution
   */
  private async verifyBotCommitted(task: Task, repoRoot: string): Promise<boolean> {
    try {
      // Get commits since task started (using task started_at timestamp)
      if (!task.started_at) {
        return false;
      }

      const taskStartDate = new Date(task.started_at);
      const gitLogSince = taskStartDate.toISOString();

      // Check for commits made after task started
      const logOutput = await this.execGitCommand([
        'log',
        '--oneline',
        '--since',
        gitLogSince,
        '--author',
        'Claude',  // Assuming bot commits with "Claude" as author
        'staging'
      ], repoRoot);

      return logOutput.trim().length > 0;
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'verify_bot_committed_failed',
        message: 'Failed to verify if bot committed',
        error
      });
      return false;
    }
  }

  /**
   * Create a new ephemeral Docker container for a task
   * Uses imagineer-style approach: create container, copy workspace in, then start
   */
  private async createEphemeralWorker(task: Task, agent: AgentPersonality): Promise<EphemeralWorker> {
    const activeWorkers = Array.from(this.ephemeralWorkers.values()).filter(
      worker => worker.status !== 'destroyed'
    );

    if (activeWorkers.length >= this.MAX_CONCURRENT_WORKERS) {
      throw new Error('Maximum concurrent dev-bots are already active');
    }

    // No git branch creation - work directly on staging
    const workspaceId = `${agent.id}-${task.id}-${Date.now()}`;
    const workerId = `bot-${agent.id}-${Date.now()}`;
    const containerName = `dev-bot-${workerId}`;

    try {
      // Ensure we're on staging branch (no new branch creation)
      const repoRoot = process.cwd();
      const baseBranch = 'staging';  // Always work from staging branch
      await this.execGitCommand(['checkout', baseBranch], repoRoot);
      await this.execGitCommand(['pull', 'origin', baseBranch], repoRoot);

      // Prepare host-side resources
      const hostLogsDir = this.getHostLogsDir();
      if (!fs.existsSync(hostLogsDir)) {
        fs.mkdirSync(hostLogsDir, { recursive: true });
      }

      // Setup minimal binds - only for logs and credentials
      const binds: string[] = [
        `${hostLogsDir}:/app/logs:rw`
      ];

      const homeDir = os.homedir();

      // Mount Claude credentials file to temp location (will be copied inside container)
      // Try both .credentials.json (newer) and credentials.json (older)
      const claudeCredentialsNew = path.join(homeDir, '.claude', '.credentials.json');
      const claudeCredentialsOld = path.join(homeDir, '.claude', 'credentials.json');
      const claudeCredentials = fs.existsSync(claudeCredentialsNew) ? claudeCredentialsNew : claudeCredentialsOld;

      if (fs.existsSync(claudeCredentials)) {
        // Mount to temp location - will be copied to .claude directory by shell command
        binds.push(`${claudeCredentials}:/tmp/host-creds.json:ro`);
        logger.info({
          category: 'process',
          action: 'claude_credentials_mounted',
          message: `Mounting Claude credentials from: ${claudeCredentials}`
        });
      } else {
        logger.warn({
          category: 'process',
          action: 'claude_credentials_not_found',
          message: 'Claude credentials file not found, container may not authenticate'
        });
      }

      const gitCredentials = path.join(homeDir, '.git-credentials');
      if (fs.existsSync(gitCredentials)) {
        binds.push(`${gitCredentials}:/home/worker/.git-credentials:ro`);
      }

      const sshDir = path.join(homeDir, '.ssh');
      if (fs.existsSync(sshDir)) {
        binds.push(`${sshDir}:/home/worker/.ssh:ro`);
      }

      const envVars = [
        `AGENT_ID=${agent.id}`,
        `AGENT_NAME=${agent.name}`,
        `TASK_ID=${task.id}`,
        `WORKER_ID=${workerId}`,
        `WORKSPACE_BRANCH=staging`,
        `WORKSPACE_ID=${workspaceId}`
      ];

      for (const key of this.getEnvPassthroughKeys()) {
        const value = process.env[key];
        if (value && value.length > 0) {
          envVars.push(`${key}=${value}`);
        }
      }

      // Create container (not started yet)
      const container = await this.docker.createContainer({
        Image: this.getAgentDockerImage(agent),
        name: containerName,
        Cmd: ['/bin/bash', '-c', 'tail -f /dev/null'],
        Env: envVars,
        WorkingDir: `/workspace`,
        HostConfig: {
          Memory: 512 * 1024 * 1024,
          CpuQuota: 50000,
          AutoRemove: true,
          Binds: binds,
          Tmpfs: {
            '/home/worker/.claude': 'uid=1001,gid=1001'  // Writable temp for Claude CLI
          }
        },
        Labels: {
          'claude.worker.id': workerId,
          'claude.agent.id': agent.id,
          'claude.task.id': task.id,
          'claude.workspace.id': workspaceId
        }
      });

      // Start the container FIRST so we can exec commands
      await container.start();

      // Wait for container to be fully running before exec commands
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Copy workspace INTO container using tar (container must be running for chown)
      await this.copyWorkspaceToContainer(container.id, repoRoot);

      await this.initializeWorkerLogFile(workerId);

      const workspace = {
        id: workspaceId,
        hostPath: '', // No host path - workspace is inside container only
        branchName: 'staging', // Always work on staging
        mirrorPath: '', // No mirror
        createdAt: new Date().toISOString()
      };

      const ephemeralWorker: EphemeralWorker = {
        id: workerId,
        containerId: container.id,
        agent,
        task,
        status: 'starting',
        createdAt: new Date().toISOString(),
        workspace
      };

      this.ephemeralWorkers.set(workerId, ephemeralWorker);

      logger.info({
      category: 'process',
      action: 'created_ephemeral_worker_workerid_with_container_c',
      message: `Created ephemeral worker ${workerId} with container ${container.id}`
    });
      return ephemeralWorker;

    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_create_ephemeral_worker_workerid',
        message: `Failed to create ephemeral worker ${workerId}:`,
        error: error
      });
      // No branch cleanup needed - we work directly on staging
      throw error;
    }
  }

  /**
   * Copy workspace directory into container using tar pipe
   * Mimics imagineer's approach for efficient workspace copying
   */
  private async copyWorkspaceToContainer(containerId: string, repoRoot: string): Promise<void> {
    const { spawn } = await import('child_process');
    logger.info({
      category: 'process',
      action: 'copying_workspace_to_container',
      message: `Copying workspace from ${repoRoot} into container ${containerId}`
    });

    // Create /workspace directory in container first
    try {
      logger.info({
        category: 'process',
        action: 'creating_workspace_directory',
        message: `About to create /workspace directory in container ${containerId}`
      });

      const container = this.docker.getContainer(containerId);
      const mkdirExec = await container.exec({
        Cmd: ['/bin/sh', '-c', 'mkdir -p /workspace && chown worker:worker /workspace'],
        User: 'root',
        AttachStdout: true,
        AttachStderr: true
      });

      logger.info({
        category: 'process',
        action: 'exec_created_starting',
        message: `Exec created, now starting mkdir in container ${containerId}`
      });

      await mkdirExec.start({ Detach: false, Tty: false });

      // Wait for exec to complete by polling inspect
      for (let i = 0; i < 10; i++) {
        const inspect = await mkdirExec.inspect();
        if (!inspect.Running) {
          if (inspect.ExitCode !== 0) {
            throw new Error(`mkdir command failed with exit code ${inspect.ExitCode}`);
          }
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info({
        category: 'process',
        action: 'workspace_directory_created',
        message: `Created /workspace directory in container ${containerId}`
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_create_workspace_directory',
        message: `Failed to create /workspace directory: ${error instanceof Error ? error.message : String(error)}`
      });
      throw error;
    }

    // Exclusions for tar (don't copy these into container)
    const exclusions = [
      '--exclude=node_modules',
      '--exclude=venv',
      '--exclude=.venv',
      '--exclude=logs',
      '--exclude=dev-bots',
      '--exclude=__pycache__',
      '--exclude=.mypy_cache',
      '--exclude=dist',
      '--exclude=build',
      '--exclude=.git/objects', // Copy .git but not large objects
    ];

    return new Promise((resolve, reject) => {
      // Create tar of workspace
      const tarProc = spawn('tar', [
        ...exclusions,
        '-C', repoRoot,
        '-cf', '-',
        '.'
      ]);

      // Pipe into docker cp
      const dockerCpProc = spawn('docker', [
        'cp', '-',
        `${containerId}:/workspace`
      ]);

      tarProc.stdout.pipe(dockerCpProc.stdin);

      let stderr = '';
      dockerCpProc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      dockerCpProc.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`docker cp failed with code ${code}: ${stderr}`));
        } else {
          // Fix ownership of workspace for worker user (must run as root)
          try {
            const container = this.docker.getContainer(containerId);
            const chownExec = await container.exec({
              Cmd: ['/bin/sh', '-c', 'chown -R worker:worker /workspace'],
              User: 'root',  // Run as root to be able to chown
              AttachStdout: true,
              AttachStderr: true
            });
            await chownExec.start({ Detach: false });

            logger.info({
              category: 'process',
              action: 'workspace_copied_successfully',
              message: `Workspace copied and ownership fixed for container ${containerId}`
            });
            resolve();
          } catch (chownError) {
            logger.warn({
              category: 'process',
              action: 'workspace_chown_failed',
              message: `Failed to fix workspace ownership: ${chownError instanceof Error ? chownError.message : String(chownError)}`
            });
            // Don't fail - the copy succeeded, ownership might not be critical
            resolve();
          }
        }
      });

      tarProc.on('error', (error) => {
        reject(new Error(`tar process failed: ${error.message}`));
      });

      dockerCpProc.on('error', (error) => {
        reject(new Error(`docker cp process failed: ${error.message}`));
      });
    });
  }

  /**
   * Execute git command in specified directory
   */
  private async execGitCommand(args: string[], cwd: string): Promise<string> {
    const { promisify } = await import('util');
    const { exec } = await import('child_process');
    const execAsync = promisify(exec);

    const command = `git ${args.join(' ')}`;
    const { stdout, stderr } = await execAsync(command, { cwd });

    if (stderr && !stderr.includes('Switched to') && !stderr.includes('already exists')) {
      logger.warn({
        category: 'process',
        action: 'git_command_warning',
        message: `Git command warning: ${command}`,
        details: { stderr }
      });
    }

    return stdout.trim();
  }

  /**
   * Get Docker image for agent personality
   * All agents now use the same custom dev-bot image with Claude CLI pre-installed
   */
  private getAgentDockerImage(_agent: AgentPersonality): string {
    // Use the custom dev-bot image for all agents
    // This image has Claude CLI and all required tools pre-installed
    return DockerManager.getDevBotImage();
  }

  /**
   * Resolve the host directory used for worker log files
   */
  private getHostLogsDir(): string {
    return path.resolve(process.cwd(), '../../logs');
  }

  private getEnvPassthroughKeys(): string[] {
    const defaults: string[] = [];
    const extra =
      process.env.DEV_BOT_PASSTHROUGH_ENVS?.split(',').map(entry => entry.trim()).filter(Boolean) ??
      [];
    return Array.from(new Set([...defaults, ...extra]));
  }

  /**
   * Execute task in ephemeral worker container
   */
  private async executeTaskInEphemeralWorker(worker: EphemeralWorker): Promise<void> {
    try {
      worker.status = 'running';
      
      const container = this.docker.getContainer(worker.containerId);
      
      // Determine log file path per worker
      const sanitizedId = worker.id.replace(/[^a-zA-Z0-9-_]/g, '_');
      const logFile = `/app/logs/${sanitizedId}.log`;
      
      // Generate task execution command with logging
      const executionCommand = this.generateTaskExecutionCommandWithLogging(worker.task, worker.agent, logFile);
      
      // Execute task in container
      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', executionCommand],
        AttachStdout: true,
        AttachStderr: true
      });

      const stream = await exec.start({
        Detach: false,
        Tty: false
      });

      let output = '';
      let errorOutput = '';

      stream.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (chunk.startsWith('1:')) {
          output += chunk.substring(2);
        } else if (chunk.startsWith('2:')) {
          errorOutput += chunk.substring(2);
        }
      });

      // Wait for execution to complete
      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      // Get exit code
      const inspect = await exec.inspect();
      const exitCode = inspect.ExitCode || 0;

      // Complete the task
      await this.completeEphemeralTask(worker, output, errorOutput, exitCode);
      
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'task_execution_failed_for_worker_worker_id',
      message: `Task execution failed for worker ${worker.id}:`,
      error: error
    });
      await this.failEphemeralTask(worker, error instanceof Error ? error : { message: String(error) });
    }
  }

  /**
   * Generate task execution command for container
   * Generates a proper Claude CLI command with the task prompt
   */
  private generateTaskExecutionCommand(task: Task, _agent: AgentPersonality): string {
    // Escape the prompt for shell execution
    const escapedPrompt = (task.prompt || task.description || task.title)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`');

    // Build Claude CLI command
    const command = [
      'claude',
      '-p', `"${escapedPrompt}"`,
      '--allowedTools', 'Bash,Read,Write,Edit,Grep,Glob,WebSearch,WebFetch',
      '--workingDirectory', '/workspace',
      '--dangerously-skip-permissions',  // Skip permission prompts in container
      '--print'
    ];

    // Add any task-specific files
    if (task.files && task.files.length > 0) {
      command.push('--files', task.files.join(','));
    }

    // TODO: Add project context (removed - not in SQLite Task interface)
    // Could be added back if needed by extending Task interface

    const fullCommand = command.join(' ');
    logger.info({
      category: 'process',
      action: 'generated_task_execution_command_fullcommand_subst',
      message: `Generated task execution command: ${fullCommand.substring(0, 100)}...`
    });

    return fullCommand;
  }

  /**
   * Generate task execution command with worker-specific logging
   * Uses imagineer's pattern: copy credentials from temp mount, then run Claude
   */
  private generateTaskExecutionCommandWithLogging(task: Task, agent: AgentPersonality, logFile: string): string {
    // Escape the prompt for shell execution (single quotes to preserve special chars)
    const escapedPrompt = (task.prompt || task.description || task.title)
      .replace(/'/g, "'\\''");  // Escape single quotes for shell

    // Create a wrapper command that logs to the worker-specific file
    // Following imagineer's pattern: copy credentials then run Claude
    const wrapperCommand = [
      'echo "=== Worker Task Execution Started ===" >> ' + logFile,
      'echo "Timestamp: $(date)" >> ' + logFile,
      'echo "Worker: ' + agent.name + '" >> ' + logFile,
      'echo "Task: ' + task.title + '" >> ' + logFile,
      'echo "=====================================" >> ' + logFile,
      // Copy credentials from temp mount to .claude directory (imagineer pattern)
      'cp /tmp/host-creds.json /home/worker/.claude/.credentials.json',
      'echo "Claude credentials: $(test -f ~/.claude/.credentials.json && echo found || echo missing)" >> ' + logFile,
      // Run Claude with JSON output (imagineer pattern)
      `claude --print --dangerously-skip-permissions --output-format json --workingDirectory /workspace '${escapedPrompt}' 2>&1 | tee -a ` + logFile,
      'CLAUDE_EXIT=$?',
      'echo "=== Worker Task Execution Completed ===" >> ' + logFile,
      'echo "Exit Code: $CLAUDE_EXIT" >> ' + logFile,
      'echo "=======================================" >> ' + logFile,
      'exit $CLAUDE_EXIT'
    ].join(' && ');

    logger.info({
      category: 'process',
      action: 'generated_task_execution_command_with_logging_wrap',
      message: `Generated task execution command with logging: ${wrapperCommand.substring(0, 100)}...`
    });

    return wrapperCommand;
  }

  /**
   * Initialize worker-specific log file
   */
  private async initializeWorkerLogFile(workerId: string): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // Ensure logs directory exists (use root logs directory)
      const logsDir = this.getHostLogsDir();
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
        logger.info({
      category: 'process',
      action: 'created_logs_directory_logsdir',
      message: `Created logs directory: ${logsDir}`
    });
      }
      
      // Initialize worker log file with header
      const sanitizedId = workerId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const logFile = path.join(logsDir, `${sanitizedId}.log`);
      const timestamp = new Date().toISOString();
      const header = `=== ${workerId.toUpperCase()} WORKER LOG ===\n` +
                    `Initialized: ${timestamp}\n` +
                    `Worker ID: ${workerId}\n` +
                    `=====================================\n\n`;
      
      // Append header to log file (don't overwrite existing content)
      fs.appendFileSync(logFile, header);
      logger.info({
      category: 'process',
      action: 'initialized_worker_log_file_logfile',
      message: `Initialized worker log file: ${logFile}`
    });
      
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_initialize_worker_log_file_for_workertyp',
      message: `Failed to initialize worker log file for ${workerId}:`,
      error: error
    });
    }
  }

  /**
   * Extract and record token usage from task output
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
  private async runQualityGateValidation(task: Task, workspacePath: string): Promise<QualityValidationResult> {
    try {
      const qualityGates = getQualityGateValidator();

      // Determine project name from task
      const project = task.project || 'unknown';

      logger.info({
        category: 'quality-gates',
        action: 'validation_started',
        message: `Starting quality gate validation for task ${task.id}`,
        details: { project, workspacePath }
      });

      // Run validation (this is async and takes time)
      const validationResult: QualityValidationResult = await qualityGates.validateTask(
        task.id,
        workspacePath,
        project
      );

      // Store validation results in task
      task.qualityValidation = validationResult;

      logger.info({
        category: 'quality-gates',
        action: 'validation_completed',
        message: `Quality gate validation completed for task ${task.id}`,
        details: {
          passed: validationResult.passed,
          overallScore: validationResult.overallScore,
          gatesPassed: validationResult.gates.filter(g => g.passed).length,
          gatesTotal: validationResult.gates.length
        }
      });

      // Emit event for UI updates
      this.emit('quality_validation_completed', {
        taskId: task.id,
        result: validationResult
      });

      // If quality gates failed, optionally create a healing task
      if (!validationResult.passed) {
        logger.warn({
          category: 'quality-gates',
          action: 'validation_failed',
          message: `Quality gates failed for task ${task.id}`,
          details: {
            failedGates: validationResult.gates.filter(g => !g.passed).map(g => g.gate)
          }
        });

        // TODO: Create auto-healing task
        // this.createHealingTask(task, validationResult);
      }

      return validationResult;
    } catch (error) {
      logger.error({
        category: 'quality-gates',
        action: 'validation_error',
        message: `Error running quality gate validation for task ${task.id}`,
        error
      });
      
      // Return a failed validation result instead of throwing
      // to maintain consistent return type behavior
      const failedResult: QualityValidationResult = {
        taskId: task.id,
        passed: false,
        overallScore: 0,
        gates: [],
        duration: 0,
        timestamp: new Date().toISOString()
      };
      
      // Store the failed result in the task
      task.qualityValidation = failedResult;
      
      return failedResult;
    }
  }

  /**
   * Complete task in ephemeral worker
   */
  private async completeEphemeralTask(
    worker: EphemeralWorker,
    output: string,
    errorOutput: string,
    exitCode: number
  ): Promise<void> {
    worker.status = 'completing';

    const task = worker.task;
    task.output = output;
    task.error = errorOutput;
    task.exitCode = exitCode;

    this.extractAndRecordTokenUsage(task, output);

    const workspacePath = worker.workspace.hostPath;
    let qualityValidation: QualityValidationResult | undefined;
    let shouldPush = exitCode === 0;

    if (shouldPush) {
      qualityValidation = await this.runQualityGateValidation(task, workspacePath);
      shouldPush = qualityValidation.passed;
    }

    let finalStatus: 'completed' | 'failed' = exitCode === 0 ? 'completed' : 'failed';
    let failureReason: string | undefined;

    if (shouldPush) {
      const sealResult = await this.workspaceOrchestrator.sealWorkspace(worker.workspace, {
        taskId: task.id,
        taskTitle: task.title,
        pushCoordinator: this.pushCoordinator
      });

      if (sealResult.status === 'success' || sealResult.status === 'noop') {
        finalStatus = 'completed';
        if (sealResult.commitSha) {
          const commitNote = `Pushed commit ${sealResult.commitSha} to staging from workspace ${worker.workspace.id}`;
          task.notes = task.notes ? `${task.notes}\n${commitNote}` : commitNote;
        }
      } else {
        finalStatus = 'failed';
        failureReason = sealResult.message || `Failed to push changes (${sealResult.status})`;
        if (sealResult.patchPath) {
          failureReason = `${failureReason}. Patch saved at ${sealResult.patchPath}`;
        }
      }
    } else {
      finalStatus = 'failed';
      failureReason =
        exitCode !== 0
          ? `Task exited with code ${exitCode}`
          : qualityValidation && !qualityValidation.passed
          ? 'Quality gates failed'
          : 'Task did not meet push requirements';

      const patchPath = this.workspaceOrchestrator.createPatchArtifact(worker.workspace);
      if (patchPath) {
        failureReason = `${failureReason}. Workspace patch saved at ${patchPath}`;
      }
    }

    task.status = finalStatus;
    task.completedAt = new Date().toISOString();

    if (failureReason) {
      task.error = [task.error, failureReason].filter(Boolean).join('\n');
      task.canRetry = true;
    }

    this.activeTasks.delete(task.id);
    this.completedTasks.push(task);
    this.taskPersistence.saveCompletedTasks([task]);

    await this.destroyEphemeralWorker(worker.id);

    if (finalStatus === 'completed') {
      logger.info({
        category: 'process',
        action: 'task_completed_worker_task_id',
        message: `Task completed: ${task.id}`
      });
    } else {
      logger.warn({
        category: 'process',
        action: 'task_failed_to_push',
        message: `Task ${task.id} finished with status ${finalStatus}`,
        details: { failureReason }
      });
    }

    const activeWorkers = Array.from(this.ephemeralWorkers.values()).filter(
      workerInfo => workerInfo.status !== 'destroyed'
    );
    logger.info({
      category: 'process',
      action: 'active_workers_after_completion',
      message: `Active workers after completion: ${activeWorkers.length} (${activeWorkers
        .map(w => w.id)
        .join(', ')})`
    });

    await this.assignNextTask();
  }

  /**
   * Fail task in ephemeral worker
   */
  private async failEphemeralTask(worker: EphemeralWorker, error: Error | { message: string }): Promise<void> {
    worker.status = 'completing';
    
    // Update task
    worker.task.status = 'failed';
    worker.task.completedAt = new Date().toISOString();
    const baseError = error instanceof Error ? error.message : String(error);
    let failureMessage = baseError;
    const patchPath = this.workspaceOrchestrator.createPatchArtifact(worker.workspace);
    if (patchPath) {
      failureMessage = `${baseError}\nWorkspace patch saved at ${patchPath}`;
    }
    worker.task.error = failureMessage;
    worker.task.exitCode = 1;
    worker.task.canRetry = true;
    
    // Move to completed tasks
    this.activeTasks.delete(worker.task.id);
    this.completedTasks.push(worker.task);
    
    // Save to persistence
    this.taskPersistence.saveCompletedTasks([worker.task]);
    
    // Destroy container
    await this.destroyEphemeralWorker(worker.id);
    
    logger.error({
      category: 'process',
      action: 'task_failed_worker_task_id',
      message: `Task failed: ${worker.task.id}`,
      error: error
    });
    
    // Log current worker status for debugging
    const activeWorkers = Array.from(this.ephemeralWorkers.values()).filter(
      worker => worker.status !== 'destroyed'
    );
    logger.info({
      category: 'process',
      action: 'active_workers_after_failure',
      message: `Active workers after failure: ${activeWorkers.length} (${activeWorkers.map(w => w.id).join(', ')})`
    });
    
    // Try to assign next task (now that we have a free worker slot)
    await this.assignNextTask();
  }

  /**
   * Destroy ephemeral worker container
   */
  private async destroyEphemeralWorker(workerId: string): Promise<void> {
    const worker = this.ephemeralWorkers.get(workerId);
    if (!worker) return;

    try {
      const container = this.docker.getContainer(worker.containerId);

      // Get container logs before destruction for debugging
      try {
        const logs = await this.dockerManager.getContainerLogs(worker.containerId, 50);
        if (logs) {
          logger.info({
      category: 'process',
      action: 'container_worker_containerid_logs_last_50_lines_n_',
      message: `Container ${worker.containerId} logs (last 50 lines):\n${logs}`
    });
        }
      } catch (logError) {
        logger.warn({
      category: 'process',
      action: 'could_not_retrieve_logs_for_container_worker_conta',
      message: `Could not retrieve logs for container ${worker.containerId}:`,
      details: { logError }
    });
      }

      // Stop container if running
      try {
        await container.stop({ t: 10 }); // 10 second grace period
      } catch (error) {
        // Container might already be stopped
        logger.warn({
      category: 'process',
      action: 'container_worker_containerid_already_stopped_or_er',
      message: `Container ${worker.containerId} already stopped or error stopping:`,
      details: { error }
    });
      }

      // Remove container (includes volumes with AutoRemove: true)
      await container.remove({ v: true, force: true });

      worker.status = 'destroyed';
      worker.destroyedAt = new Date().toISOString();

      // Remove from ephemeral workers map
      this.ephemeralWorkers.delete(workerId);

      logger.info({
      category: 'process',
      action: 'destroyed_ephemeral_worker_workerid_and_cleaned_up',
      message: `Destroyed ephemeral worker ${workerId} and cleaned up resources`
    });

    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_destroy_ephemeral_worker_workerid',
      message: `Failed to destroy ephemeral worker ${workerId}:`,
      error: error
    });
      // Emit error event for frontend
      this.emit('workerError', {
        workerId,
        type: 'cleanup_failed',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      this.workspaceOrchestrator.cleanupWorkspace(worker.workspace);
    } catch (cleanupError) {
      logger.warn({
        category: 'process',
        action: 'workspace_cleanup_after_destroy_failed',
        message: `Workspace cleanup failed for worker ${workerId}`,
        error: cleanupError
      });
    }
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
    this.ephemeralWorkers.clear();
    
    this.emit('systemStatusChange', 'running');
    logger.info({
      category: 'process',
      action: 'claude_workers_system_started_ephemeral_workers_wi',
      message: 'Dev-Bots system started - ephemeral workers will be created for tasks'
    });
    
    // Try to assign pending tasks
    this.assignNextTask();
  }

  public stopSystem(): void {
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
    for (const worker of this.ephemeralWorkers.values()) {
      if (worker.status !== 'destroyed') {
        // Mark task as failed and destroy container
        worker.task.status = 'failed';
        worker.task.error = 'System stopped';
        worker.task.completedAt = new Date().toISOString();
        worker.task.canRetry = true;
        this.activeTasks.delete(worker.task.id);
        this.completedTasks.push(worker.task);
        this.taskPersistence.saveCompletedTasks([worker.task]);
        
        // Destroy container
        this.destroyEphemeralWorker(worker.id);
      }
    }
    
    this.ephemeralWorkers.clear();
    this.activeTasks.clear();
    
    this.emit('systemStatusChange', 'stopped');
    logger.info({
      category: 'process',
      action: 'claude_workers_system_stopped_all_ephemeral_worker',
      message: 'Dev-Bots system stopped - all ephemeral workers terminated'
    });
  }

  public exportTasks(exportPath: string): void {
    try {
      const allTasks = [
        ...this.taskQueue,
        ...Array.from(this.activeTasks.values()),
        ...this.completedTasks
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

  public importTasks(importPath: string): void {
    try {
      const importedTasks = this.taskPersistence.importTasks(importPath);
      
      // Clear existing tasks and reload
      this.taskQueue = [];
      this.activeTasks.clear();
      this.completedTasks = [];
      
      // Separate tasks by status
      for (const task of importedTasks) {
        if (task.status === 'pending') {
          this.taskQueue.push(task);
        } else if (task.status === 'assigned' || task.status === 'active') {
          this.activeTasks.set(task.id, task);
        } else if (task.status === 'completed' || task.status === 'failed') {
          this.completedTasks.push(task);
        }
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
  
  private async executeTask(task: Task): Promise<void> {
    try {
      task.status = 'active';
      this.emit('taskStarted', task);
      
      const workerId = task.assignedWorker!;
      const containerName = `claude-${workerId}`;
      
      // Build the prompt with scope constraints
      const prompt = this.buildPromptWithScope(task);
      
      // Execute in Docker container
      const container = this.docker.getContainer(containerName);
      await container.exec({
        Cmd: [
          'su-exec', 'worker', 'claude', '-p', prompt,
          '--allowedTools', 'Bash,Read,Write,Edit,Search,Git',
          '--dangerously-skip-permissions',
          '--print'
        ],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false
      });

      // For now, simulate task execution
      const output = `Task ${task.id} executed successfully`;
      
      // Check for scope violations
      const violations = this.scopeCreepDetector.detectCreepPatterns(task, output);
      if (violations.length > 0) {
        logger.warn({
      category: 'process',
      action: 'scope_violation_task_task_id_has_violations',
      message: `[SCOPE_VIOLATION] Task ${task.id} has violations:`,
      details: { violations }
    });
        this.contextIsolation.isolateContaminatedContext(task.id, violations);
        this.snowballPrevention.detectViolationChain(task.id, violations);
      }
      
      // Complete task
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.output = output;
      task.exitCode = 0;

      // Extract and record token usage
      this.extractAndRecordTokenUsage(task, output);

      this.activeTasks.delete(task.id);
      this.completedTasks.push(task);

      // Save completed task to persistence
      this.taskPersistence.saveCompletedTasks([task]);
      
      // Update worker status
      const worker = this.workers.get(workerId);
      if (worker) {
        worker.status = 'idle';
        worker.currentTask = undefined;
        worker.lastSeen = Date.now();
      }
      
      this.emit('taskCompleted', task);
      logger.info({
      category: 'process',
      action: 'task_completed_task_id',
      message: `Task completed: ${task.id}`
    });
      
      // Try to assign next task
      await this.assignNextTask();
      
    } catch (error) {
      // Handle task failure
      task.status = 'failed';
      task.completedAt = new Date().toISOString();
      task.error = error instanceof Error ? error.message : String(error);
      task.exitCode = 1;
      task.canRetry = true; // Allow manual retry by default
      
      this.activeTasks.delete(task.id);
      
      // Add failed task to completed tasks (no automatic retry)
      this.completedTasks.push(task);
      this.taskPersistence.saveCompletedTasks([task]);
      this.emit('taskFailed', task);
      logger.error({
        category: 'process',
        action: 'task_failed',
        message: `Task ${task.id} failed`
      });
      
      // Update worker status
      const worker = this.workers.get(task.assignedWorker!);
      if (worker) {
        worker.status = 'idle';
        worker.currentTask = undefined;
        worker.lastSeen = Date.now();
      }
      
      // Try to assign next task
      await this.assignNextTask();
    }
  }
  
  private buildPromptWithScope(task: Task): string {
    let prompt = task.description || '';

    if (task.scope) {
      prompt += `\n\nSCOPE CONSTRAINTS:\n`;
      prompt += `- DO NOT create new files - only modify existing ones\n`;
      prompt += `- Maximum changes: ${task.scope.boundaries.maxChanges}\n`;
      prompt += `- Forbidden actions: ${task.scope.boundaries.forbiddenActions.join(', ')}\n`;
      prompt += `- Maximum new lines: ${task.scope.boundaries.maxNewLines}\n`;
      prompt += `- Forbidden patterns: ${task.scope.validation.forbiddenPatterns.join(', ')}\n`;
      prompt += `- Allowed patterns: ${task.scope.validation.allowedPatterns?.join(', ') || 'None'}\n`;
    }
    
    return prompt;
  }

  async getSystemStatus(): Promise<DevBotsStatus> {
    // Convert ephemeral workers to worker status format for compatibility
    const workersRecord: Record<string, WorkerStatus> = {};
    const activeEphemeralWorkers = Array.from(this.ephemeralWorkers.values()).filter(
      worker => worker.status !== 'destroyed'
    );
    for (const [workerId, ephemeralWorker] of this.ephemeralWorkers.entries()) {
      workersRecord[workerId] = {
        id: workerId,
        status: ephemeralWorker.status === 'starting' ? 'busy' : 
                ephemeralWorker.status === 'running' ? 'busy' :
                ephemeralWorker.status === 'completing' ? 'busy' : 'stopped',
        currentTask: ephemeralWorker.task.id,
        lastSeen: ephemeralWorker.created_at,
        personality: ephemeralWorker.agent,
        onboardingComplete: true
      };
    }

    return {
      systemStatus: this.isCoordinatorHealthy ? 'running' : 'stopped',
      workers: workersRecord,
      queueSize: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      uptime: Date.now() - this.startTime,
      workerCount: this.ephemeralWorkers.size,
      maxWorkers: this.MAX_CONCURRENT_WORKERS,
      activeWorkerTypes: activeEphemeralWorkers.map(w => w.id),
      availableWorkerTypes: Array.from(
        { length: Math.max(this.MAX_CONCURRENT_WORKERS - activeEphemeralWorkers.length, 0) },
        (_value, index) => `slot-${index + 1}`
      ),
      tasks: {
        pending: this.taskQueue,
        active: Array.from(this.activeTasks.values()),
        completed: this.completedTasks.slice(-50) // Keep last 50 completed tasks
      }
    };
  }

  async getTasks(): Promise<{ pending: Task[]; active: Task[]; completed: Task[] }> {
    const pendingSQLite = this.taskQueue.getTasksByStatus('pending');
    const runningSQLite = this.taskQueue.getTasksByStatus('running');
    const completedSQLite = this.taskQueue.getTasksByStatus('completed').slice(-50);

    // Convert SQLite tasks to legacy Task format
    const convertTask = (sqliteTask: SQLiteTask): Task => ({
      id: sqliteTask.id,
      type: sqliteTask.type,
      title: sqliteTask.title,
      description: sqliteTask.description || '',
      status: sqliteTask.status as 'pending' | 'assigned' | 'active' | 'completed' | 'failed',
      createdAt: new Date(sqliteTask.created_at).toISOString(),
      assignedAt: sqliteTask.assigned_at ? new Date(sqliteTask.assigned_at).toISOString() : undefined,
      completedAt: sqliteTask.completed_at ? new Date(sqliteTask.completed_at).toISOString() : undefined,
      project: 'dev-monitor',
      assignedAgent: sqliteTask.assigned_agent,
      assignedWorker: sqliteTask.assigned_worker,
      files: sqliteTask.files || [],
      dependencies: [],
      acceptanceCriteria: sqliteTask.acceptance_criteria || [],
      architectureReferences: sqliteTask.architecture_references,
      validationSteps: sqliteTask.validation_steps,
      successMetrics: sqliteTask.success_metrics,
      output: sqliteTask.output,
      error: sqliteTask.error
    });

    return {
      pending: pendingSQLite.map(convertTask),
      active: runningSQLite.map(convertTask),
      completed: completedSQLite.map(convertTask)
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
      id: `task-${this.taskIdCounter++}-${Date.now()}`,
      type: 'recovery',
      title: 'Emergency Recovery Task',
      description: 'EMERGENCY RECOVERY: Clean up scope creep and restore system to stable state. DO NOT create new files. Only remove unnecessary code.',
      status: 'pending',
      createdAt: new Date().toISOString(),
      assignedAgent: 'backend-specialist',
      scope: {
        type: 'cleanup',
        boundaries: {
          maxChanges: 1,
          forbiddenActions: ['create-new-files', 'add-dependencies', 'modify-existing-code'],
          maxNewLines: 5
        },
        validation: {
          forbiddenPatterns: ['create', 'new', 'add', 'modify', 'complex', 'sophisticated'],
          allowedPatterns: ['remove', 'delete', 'clean', 'revert', 'simplify']
        }
      },
      isEmergency: true
    };
    
    this.taskQueue.unshift(recoveryTask);
    await this.assignNextTask();
    return recoveryTask;
  }

  async getCleanupStatus(): Promise<{ schedules: string[]; recentTasks: Task[] }> {
    const recentCleanupTasks = this.completedTasks
      .filter(t => t.type === 'cleanup')
      .slice(-10);

    return {
      schedules: this.cleanupScheduler.checkSchedules(),
      recentTasks: recentCleanupTasks
    };
  }

  async triggerCleanup(type: string): Promise<Task> {
    const cleanupTask = this.cleanupScheduler.createCleanupTask(type, this.taskIdCounter++);
    this.taskQueue.push(cleanupTask);
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
      task.assignedWorker = undefined;
      task.assigned_at = undefined;
      task.error = undefined;
      task.exitCode = undefined;
      
      // Add task back to queue
      this.taskQueue.push(task);
      
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
      // Find the task in completed tasks
      const task = this.completedTasks.find(t => t.id === taskId);
      if (!task) {
        return { success: false, message: 'Task not found in completed tasks' };
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
        // Remove from completed tasks
        const taskIndex = this.completedTasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          this.completedTasks.splice(taskIndex, 1);
        }
        
        // Add retry task back to queue
        this.taskQueue.push(retryResult.task);
        
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
  public getRetryInfo(taskId: string): {
    canRetry: boolean;
    retryCount: number;
    maxRetries: number;
    retryHistory: RetryAttempt[];
    scheduledRetries: Array<{ taskId: string; retryAt: string; retryCount: number }>;
  } {
    const task = this.completedTasks.find((t: Task) => t.id === taskId);
    const retryHistory = this.retryManager.getRetryHistory(taskId);

    return {
      canRetry: task?.canRetry ?? (task?.status === 'failed'),
      retryCount: task?.retryCount || 0,
      maxRetries: task?.maxRetries || this.retryManager.getConfig().maxRetries,
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
