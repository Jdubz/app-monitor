import { EventEmitter } from "events";
import { logger } from "../utils/logger.js";
import { ProcessManager, ProcessInfo } from "./processManager.js";
import * as path from "path";
import Docker from "dockerode";
import { TaskPersistence, TaskStorageConfig } from "./taskPersistence.js";
import {
  AgentPersonalityManager,
  AgentPersonality,
} from "./agentPersonalities.js";
import {
  TaskPromptTemplateManager,
  TaskContext,
} from "./taskPromptTemplates.js";
import {
  TaskCreationGuidelinesManager,
  EnhancedTaskData,
} from "./taskCreationGuidelines.js";
import {
  WorkspaceSyncManager,
  SyncOptions,
  SyncResult,
} from "./workspaceSyncManager.js";
import { DockerManager, DockerValidationResult } from "./dockerManager.js";
import { RetryManager, RetryConfig } from "./retryManager.js";
import { getTokenTrackingService } from "./tokenTracking.js";
import {
  getQualityGateValidator,
  QualityValidationResult,
} from "./qualityGates.js";
import {
  WorkspaceOrchestrator,
  WorkspaceContext,
  PushCoordinator,
} from "./workspaceOrchestrator.js";

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
  status: "idle" | "busy" | "stopped";
  lastSeen: number;
  personality: AgentPersonality;
  onboardingComplete: boolean;
  lastOnboardingCheck: number;
  currentTask?: string;
}

export interface Task {
  id: string;
  type: string;
  title: string; // Specific task title
  description?: string; // Task description
  documentation?: string; // What the worker should read before starting
  notes?: string; // Optional: additional notes or context
  status:
    | "pending"
    | "assigned"
    | "active"
    | "completed"
    | "failed"
    | "retrying";
  createdAt: string;
  assignedWorker?: string;
  assignedAgent: string; // Assigned agent personality (required)
  assignedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
  exitCode?: number;
  prompt?: string; // Generated prompt for the task
  files?: string[]; // Files to be modified
  dependencies?: string[]; // Task dependencies
  project?: string; // Target project
  qualityValidation?: QualityValidationResult; // Quality gate validation results

  // Retry system fields
  retryCount?: number; // Number of retry attempts made
  maxRetries?: number; // Maximum number of retries allowed
  retryDelay?: number; // Delay in milliseconds before retry
  retryReason?: string; // Reason for the retry
  retryHistory?: RetryAttempt[]; // History of retry attempts
  canRetry?: boolean; // Whether this task can be retried
  retryStrategy?: "immediate" | "exponential" | "linear" | "manual"; // Retry strategy

  // Enhanced task specification
  acceptanceCriteria?: string[]; // Explicit acceptance criteria (array of criteria)
  architectureReferences?: string[]; // New: architecture documentation references
  longTermGoals?: string[]; // New: connection to larger initiatives
  estimatedEffort?: {
    // New: effort estimation
    hours: number;
    complexity: "simple" | "medium" | "complex" | "expert";
    confidence: "low" | "medium" | "high";
  };
  prerequisites?: string[]; // New: required knowledge/setup
  contextBoundaries?: {
    // New: what not to change
    mustNotChange: string[];
    mustNotAffect: string[];
    integrationPoints: string[];
  };
  validationSteps?: string[]; // New: how to verify completion
  rollbackPlan?: string[]; // New: what to do if things go wrong
  successMetrics?: string[]; // New: measurable outcomes
  testingRequirements?: string[]; // New: testing requirements
  documentationRequirements?: string[]; // New: documentation requirements
  requiredSkills?: string[]; // New: required agent skills
  parentInitiative?: string; // New: parent initiative or project
  relatedTasks?: string[]; // New: related task IDs
  blockers?: string[]; // New: blocking issues
  assumptions?: string[]; // New: documented assumptions
  risks?: string[]; // New: identified risks
  alternatives?: string[]; // New: alternative approaches

  scope?: {
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
  isEmergency?: boolean;
  chainId?: string;
}

export interface EphemeralWorker {
  id: string;
  containerId: string;
  agent: AgentPersonality;
  task: Task;
  status: "starting" | "running" | "completing" | "destroyed";
  createdAt: string;
  workspace: WorkspaceContext;
  destroyedAt?: string;
}

export interface WorkerStatus {
  id: string;
  status: "idle" | "busy" | "stopped";
  currentTask?: string;
  lastSeen: number;
  personality?: AgentPersonality; // New: agent personality
  onboardingComplete?: boolean; // New: onboarding status
  lastOnboardingCheck?: number; // New: last onboarding check timestamp
}

export interface DevBotsStatus {
  systemStatus: "running" | "stopped" | "error";
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
  detectCreepPatterns(
    task: Task,
    output: string,
  ): Array<{ type: string; severity: string }> {
    const patterns = {
      fileCreation: /(?:created|new file|mkdir|touch|writeFile|fs\.write)/gi,
      overEngineering:
        /(?:complex|sophisticated|advanced|enterprise|scalable)/gi,
      scopeExpansion:
        /(?:also|additionally|furthermore|moreover|while we're at it)/gi,
      unnecessaryComplexity:
        /(?:design pattern|architecture|framework|library|dependency)/gi,
      featureCreep:
        /(?:feature|enhancement|improvement|optimization|refactoring)/gi,
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
      fileCreation: "HIGH",
      overEngineering: "MEDIUM",
      scopeExpansion: "HIGH",
      unnecessaryComplexity: "MEDIUM",
      featureCreep: "LOW",
    };
    return severityMap[type] || "LOW";
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

  isolateContaminatedContext(
    taskId: string,
    _violations: Array<{ type: string; severity: string }>,
  ): void {
    this.contaminatedContexts.add(taskId);
    const cleanContext = this.createCleanContext(taskId);
    this.cleanContexts.set(taskId, cleanContext);
    logger.info({
      category: "process",
      action: "context_isolation_isolated_contaminated_context_fo",
      message: `[CONTEXT_ISOLATION] Isolated contaminated context for task ${taskId}`,
    });
  }

  private createCleanContext(_taskId: string): CleanContext {
    return {
      allowedFiles: ["existing-files-only"],
      maxComplexity: "simple",
      forbiddenPatterns: ["create", "new", "complex", "sophisticated"],
      scope: "minimal",
    };
  }

  getBaselineContext(): CleanContext {
    return {
      allowedFiles: ["existing-files-only"],
      maxComplexity: "simple",
      forbiddenPatterns: ["create", "new", "complex", "sophisticated"],
      scope: "minimal",
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

  detectViolationChain(
    taskId: string,
    violations: Array<{ type: string; severity: string }>,
  ): void {
    const chain = this.violationChain.get(taskId) || [];
    chain.push({
      taskId,
      violations,
      timestamp: Date.now(),
    });

    this.violationChain.set(taskId, chain);

    if (chain.length >= 3) {
      this.triggerChainBreaker(taskId, chain);
    }
  }

  private triggerChainBreaker(
    taskId: string,
    chain: ViolationChainEntry[],
  ): void {
    logger.warn({
      category: "process",
      action: "chain_breaker_detected_violation_chain_of_chain_le",
      message: `[CHAIN_BREAKER] Detected violation chain of ${chain.length} tasks - triggering emergency recovery`,
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
    deepCleanup: { interval: 7 * 24 * 60 * 60 * 1000, lastRun: Date.now() },
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
    const cleanupTasks: Record<
      string,
      {
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
      }
    > = {
      linting: {
        description:
          "PERIODIC CLEANUP: Run linting and fix code style issues. Focus on existing files only.",
        scope: {
          type: "cleanup",
          boundaries: {
            maxChanges: 5,
            forbiddenActions: ["create-new-files"],
            maxNewLines: 20,
          },
          validation: {
            forbiddenPatterns: ["create", "new"],
            allowedPatterns: ["fix", "format", "style"],
          },
        },
      },
      deduplication: {
        description:
          "PERIODIC CLEANUP: Remove duplicate code and consolidate similar functions.",
        scope: {
          type: "cleanup",
          boundaries: {
            maxChanges: 3,
            forbiddenActions: ["create-new-files"],
            maxNewLines: 15,
          },
          validation: {
            forbiddenPatterns: ["create", "new"],
            allowedPatterns: ["remove", "consolidate", "merge"],
          },
        },
      },
      documentation: {
        description:
          "PERIODIC CLEANUP: Update and standardize documentation. Fix outdated comments.",
        scope: {
          type: "cleanup",
          boundaries: {
            maxChanges: 8,
            forbiddenActions: ["create-new-files"],
            maxNewLines: 30,
          },
          validation: {
            forbiddenPatterns: ["create", "new"],
            allowedPatterns: ["update", "fix", "standardize"],
          },
        },
      },
      testing: {
        description:
          "PERIODIC CLEANUP: Run tests and fix failing tests. Improve test coverage.",
        scope: {
          type: "cleanup",
          boundaries: {
            maxChanges: 10,
            forbiddenActions: ["create-new-files"],
            maxNewLines: 50,
          },
          validation: {
            forbiddenPatterns: ["create", "new"],
            allowedPatterns: ["fix", "improve", "test"],
          },
        },
      },
      deepCleanup: {
        description:
          "PERIODIC CLEANUP: Deep codebase cleanup. Remove unused code, optimize imports.",
        scope: {
          type: "cleanup",
          boundaries: {
            maxChanges: 15,
            forbiddenActions: ["create-new-files"],
            maxNewLines: 100,
          },
          validation: {
            forbiddenPatterns: ["create", "new"],
            allowedPatterns: ["remove", "optimize", "clean"],
          },
        },
      },
    };

    const task = cleanupTasks[type];
    return {
      id: `task-${taskIdCounter}-${Date.now()}`,
      type: "cleanup",
      title: task.description.substring(0, 100),
      description: task.description,
      status: "pending",
      createdAt: new Date().toISOString(),
      assignedAgent: "backend-specialist",
      scope: task.scope,
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

  // Task management
  private taskQueue: Task[] = [];
  private activeTasks = new Map<string, Task>();
  private completedTasks: Task[] = [];
  private taskIdCounter = 1;

  // Worker management
  private workers = new Map<string, WorkerInfo>();
  private ephemeralWorkers = new Map<string, EphemeralWorker>();
  private readonly MAX_CONCURRENT_WORKERS = 2; // Maximum 2 workers as per architecture

  // Enhanced services
  private taskPersistence!: TaskPersistence;
  private agentManager!: AgentPersonalityManager;
  private templateManager!: TaskPromptTemplateManager;
  private guidelinesManager!: TaskCreationGuidelinesManager;
  private workspaceSyncManager!: WorkspaceSyncManager;
  private retryManager!: RetryManager;
  private workspaceOrchestrator!: WorkspaceOrchestrator;
  private pushCoordinator: PushCoordinator = new PushCoordinator();

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
    this.dockerManager = new DockerManager("/var/run/docker.sock");
    this.docker = this.dockerManager.getDocker();

    // Validate Docker environment and initialize
    this.initializeDockerEnvironment();

    // Initialize enhanced services
    this.initializeEnhancedServices();

    // Ephemeral workers are created on-demand, no initialization needed

    // Load persisted tasks
    this.loadPersistedTasks();

    // NOTE: Cleanup tasks should be created manually via the task API
    // Linting, testing, documentation are part of the development process
    // via git hooks, CI/CD, and manual code review
    // this.startCleanupScheduler(); // REMOVED - cleanup is not automatic

    // Listen for process status changes
    this.processManager.on(
      "statusChange",
      (serviceName: string, status: ProcessInfo) => {
        if (serviceName === "dev-bots") {
          this.emit("systemStatusChange", status);
          this.updateWorkerHealth();
        }
      },
    );
  }

  /**
   * Initialize and validate Docker environment
   */
  private async initializeDockerEnvironment(): Promise<void> {
    try {
      logger.info({
        category: "process",
        action: "validating_docker_environment",
        message: "Validating Docker environment...",
      });
      this.dockerValidationResult =
        await this.dockerManager.validateDockerEnvironment();

      if (!this.dockerValidationResult.isValid) {
        logger.error({
          category: "process",
          action: "docker_validation_failed",
          message: "Docker validation failed",
          details: { errors: this.dockerValidationResult.errors },
        });
        this.emit("dockerError", {
          type: "validation_failed",
          errors: this.dockerValidationResult.errors,
          message:
            "Docker environment validation failed. Dev-Bots cannot start.",
        });
        return;
      }

      // Log warnings if any
      if (this.dockerValidationResult.warnings.length > 0) {
        logger.warn({
          category: "process",
          action: "docker_validation_warnings",
          message: "Docker validation warnings",
          details: { warnings: this.dockerValidationResult.warnings },
        });
        this.emit("dockerWarning", {
          warnings: this.dockerValidationResult.warnings,
        });
      }

      // Ensure required images are available
      logger.info({
        category: "process",
        action: "checking_required_docker_images",
        message: "Checking required Docker images...",
      });
      const imageResult = await this.dockerManager.ensureRequiredImages();

      if (!imageResult.success) {
        logger.error({
          category: "process",
          action: "required_docker_images_not_available",
          message: "Required Docker images not available",
          details: { errors: imageResult.errors },
        });
        this.emit("dockerError", {
          type: "images_missing",
          errors: imageResult.errors,
          message: "Required Docker images are not available",
        });
        return;
      }

      logger.info({
        category: "process",
        action: "docker_environment_validated_successfully",
        message: "Docker environment validated successfully",
        details: { info: this.dockerValidationResult.info },
      });
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_initialize_docker_environment",
        message: "Failed to initialize Docker environment:",
        error: error,
      });
      this.emit("dockerError", {
        type: "initialization_failed",
        error: error instanceof Error ? error.message : String(error),
        message: "Failed to initialize Docker environment",
      });
    }
  }

  private initializeEnhancedServices(): void {
    // Initialize task persistence
    const storageConfig: TaskStorageConfig = {
      storagePath: "./data/tasks",
      backupPath: "./data/backups",
      maxBackups: 10,
      autoSave: true,
      saveInterval: 30000, // 30 seconds
    };
    this.taskPersistence = new TaskPersistence(storageConfig);

    // Initialize agent personality manager
    this.agentManager = new AgentPersonalityManager();

    // Initialize template manager
    this.templateManager = new TaskPromptTemplateManager();

    // Initialize guidelines manager
    this.guidelinesManager = new TaskCreationGuidelinesManager();

    // Initialize workspace orchestrator for dynamic workspaces
    this.workspaceOrchestrator = new WorkspaceOrchestrator();
    if (typeof this.workspaceOrchestrator.initialize === "function") {
      this.workspaceOrchestrator.initialize();
    }

    // Initialize workspace sync manager
    this.workspaceSyncManager = new WorkspaceSyncManager({
      baseDir: path.resolve(path.join(process.cwd(), "../../")),
      repositories: [
        "job-finder-BE",
        "job-finder-FE",
        "job-finder-shared-types",
        "job-finder-worker",
      ],
      workers: [],
      conflictStrategy: "auto-merge",
    });

    // Initialize retry manager
    const retryConfig: Partial<RetryConfig> = {
      maxRetries: 3,
    };
    this.retryManager = new RetryManager(retryConfig);

    // Listen for retry events
    this.retryManager.on("taskReadyForRetry", (task: Task) => {
      this.handleTaskRetry(task);
    });

    logger.info({
      category: "process",
      action: "enhanced_services_initialized_task_persistence_age",
      message:
        "Enhanced services initialized: task persistence, agent personalities, prompt templates, creation guidelines, workspace sync, and retry management",
    });
  }

  private loadPersistedTasks(): void {
    try {
      const persistedTasks = this.taskPersistence.loadTasks();

      // Separate tasks by status
      for (const task of persistedTasks) {
        if (task.status === "pending") {
          this.taskQueue.push(task);
        } else if (task.status === "assigned" || task.status === "active") {
          // Reset assigned/active tasks to pending since workers are no longer running
          const oldStatus = task.status;
          task.status = "pending";
          task.assignedWorker = undefined;
          task.assignedAt = undefined;
          this.taskQueue.push(task);
          logger.info({
            category: "process",
            action: "reset_task_task_id_from_oldstatus_to_pending_worke",
            message: `Reset task ${task.id} from ${oldStatus} to pending (worker no longer running)`,
          });
        } else if (task.status === "completed" || task.status === "failed") {
          this.completedTasks.push(task);
        }
      }

      // Save updated tasks back to persistence if any were reset
      if (this.taskQueue.length > 0 || this.completedTasks.length > 0) {
        this.saveTasksToPersistence();
      }

      logger.info({
        category: "process",
        action: "loaded_persistedtasks_length_persisted_tasks_this_",
        message: `Loaded ${persistedTasks.length} persisted tasks: ${this.taskQueue.length} pending, ${this.activeTasks.size} active, ${this.completedTasks.length} completed`,
      });
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_load_persisted_tasks",
        message: "Failed to load persisted tasks:",
        error: error,
      });
    }
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
      this.workers.forEach((worker) => {
        if (worker.status !== "stopped") {
          worker.lastSeen = Date.now();
        }
      });

      // System health is now managed by startSystem/stopSystem methods
      // Don't override the isCoordinatorHealthy flag here

      if (wasHealthy !== this.isCoordinatorHealthy) {
        this.emit("coordinatorHealthChange", this.isCoordinatorHealthy);
        logger.info({
          category: "process",
          action: "worker_health_changed",
          message: `Worker health changed: ${this.isCoordinatorHealthy ? "healthy" : "unhealthy"}`,
        });
      }

      return this.isCoordinatorHealthy;
    } catch (error) {
      const wasHealthy = this.isCoordinatorHealthy;
      this.isCoordinatorHealthy = false;

      // Mark all workers as stopped on error
      this.workers.forEach((worker) => {
        worker.status = "stopped";
        worker.currentTask = undefined;
      });

      if (wasHealthy !== this.isCoordinatorHealthy) {
        this.emit("coordinatorHealthChange", this.isCoordinatorHealthy);
        logger.warn({
          category: "process",
          action: "worker_health_check_failed",
          message: "Worker health check failed:",
          details: { error },
        });
      }

      return false;
    }
  }

  private async updateWorkerHealth(): Promise<void> {
    try {
      const processInfo =
        await this.processManager.getServiceStatus("dev-bots");
      if (processInfo?.status !== "running") {
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
        const cleanupTask = this.cleanupScheduler.createCleanupTask(
          taskType,
          this.taskIdCounter++,
        );
        this.taskQueue.push(cleanupTask);
        logger.info({
          category: "process",
          action: "cleanup_scheduled_tasktype_cleanup_task_cleanuptas",
          message: `[CLEANUP] Scheduled ${taskType} cleanup task: ${cleanupTask.id}`,
        });
      }
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_check_cleanup_schedules",
        message: "Failed to check cleanup schedules:",
        error: error,
      });
    }
  }

  // Task Management Methods
  async addTask(
    type: string,
    title: string,
    documentation: string,
    acceptanceCriteria: string,
    options?: {
      files?: string[];
      dependencies?: string[];
      repository?: string;
      assignedAgent?: string;
      notes?: string;
    },
  ): Promise<Task> {
    const task: Task = {
      id: `task-${this.taskIdCounter++}-${Date.now()}`,
      type,
      title,
      documentation,
      acceptanceCriteria: [acceptanceCriteria],
      notes: options?.notes,
      status: "pending",
      createdAt: new Date().toISOString(),
      files: options?.files || [],
      dependencies: options?.dependencies || [],
      project: options?.repository || "dev-monitor",
      assignedAgent: options?.assignedAgent || "backend-specialist",
    };

    this.taskQueue.push(task);

    // Save to persistence
    this.saveTasksToPersistence();

    this.emit("taskAdded", task);
    logger.info({
      category: "process",
      action: "enhanced_task_added_agent",
      message: `Enhanced task added: ${task.id} - ${type} (Agent: ${task.assignedAgent || "auto-assign"})`,
    });

    // Try to assign immediately
    await this.assignNextTask();

    return task;
  }

  // Enhanced task creation with comprehensive guidelines
  async addEnhancedTask(taskData: EnhancedTaskData): Promise<{
    task: Task;
    validation: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
      suggestions: string[];
    };
  }> {
    // Validate task data against guidelines
    const validation = this.guidelinesManager.validateTaskData(
      taskData,
      taskData.type,
    );

    if (!validation.isValid) {
      logger.warn({
        category: "process",
        action: "task_validation_failed",
        message: `Task validation failed: ${validation.errors.join(", ")}`,
      });
      throw new Error(
        `Task validation failed: ${validation.errors.join(", ")}`,
      );
    }

    // Log warnings and suggestions
    if (validation.warnings.length > 0) {
      logger.warn({
        category: "process",
        action: "task_validation_warnings",
        message: `Task validation warnings: ${validation.warnings.join(", ")}`,
      });
    }
    if (validation.suggestions.length > 0) {
      logger.info({
        category: "process",
        action: "task_validation_suggestions",
        message: `Task validation suggestions: ${validation.suggestions.join(", ")}`,
      });
    }

    const task: Task = {
      id: `task-${this.taskIdCounter++}-${Date.now()}`,
      type: taskData.type,
      title: taskData.title,
      description: taskData.description,
      status: "pending",
      createdAt: new Date().toISOString(),
      project: taskData.project,
      assignedAgent: taskData.assignedAgent,

      // Enhanced fields
      files: taskData.files,
      dependencies: taskData.dependencies,
      acceptanceCriteria: taskData.acceptanceCriteria,
      architectureReferences: taskData.architectureReferences,
      longTermGoals: taskData.longTermGoals,
      estimatedEffort: taskData.estimatedEffort,
      prerequisites: taskData.prerequisites,
      contextBoundaries: taskData.contextBoundaries,
      validationSteps: taskData.validationSteps,
      rollbackPlan: taskData.rollbackPlan,
      successMetrics: taskData.successMetrics,
      testingRequirements: taskData.testingRequirements,
      documentationRequirements: taskData.documentationRequirements,
      requiredSkills: taskData.requiredSkills,
      parentInitiative: taskData.parentInitiative,
      relatedTasks: taskData.relatedTasks,
      blockers: taskData.blockers,
      assumptions: taskData.assumptions,
      risks: taskData.risks,
      alternatives: taskData.alternatives,
    };

    this.taskQueue.push(task);

    // Save to persistence
    this.saveTasksToPersistence();

    this.emit("taskAdded", task);
    logger.info({
      category: "process",
      action: "enhanced_task_added_with_guidelines_agent",
      message: `Enhanced task added with guidelines: ${task.id} - ${taskData.title} (Agent: ${taskData.assignedAgent || "auto-assign"})`,
    });

    // Try to assign immediately
    await this.assignNextTask();

    return { task, validation };
  }

  async assignNextTask(): Promise<void> {
    if (this.taskQueue.length === 0) {
      logger.info({
        category: "process",
        action: "no_pending_tasks_in_queue",
        message: "No pending tasks in queue",
      });
      return;
    }

    // Check active worker count against concurrency limit
    const activeWorkers = Array.from(this.ephemeralWorkers.values()).filter(
      (worker) => worker.status !== "destroyed",
    );

    logger.info({
      category: "process",
      action: "task_assignment_check_this_taskqueue_length_pendin",
      message: `Task assignment check: ${this.taskQueue.length} pending tasks, ${activeWorkers.length}/${this.MAX_CONCURRENT_WORKERS} active workers`,
    });

    if (activeWorkers.length >= this.MAX_CONCURRENT_WORKERS) {
      logger.info({
        category: "process",
        action: "max_workers_active_skipping_assignment",
        message:
          "Maximum concurrent workers are active, skipping task assignment",
      });
      return;
    }

    // Get next task (FIFO queue)
    const nextTask = this.taskQueue[0];

    // Ensure mirror is up to date before provisioning workspace
    try {
      this.workspaceOrchestrator.initialize();
    } catch (error) {
      logger.error({
        category: "process",
        action: "workspace_orchestrator_init_failed",
        message: `Workspace orchestrator failed before assigning task ${nextTask.id}`,
        error,
      });
      nextTask.status = "failed";
      nextTask.error = `Workspace initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      nextTask.completedAt = new Date().toISOString();
      nextTask.canRetry = true;
      this.taskQueue.splice(0, 1);
      this.completedTasks.push(nextTask);
      this.taskPersistence.saveCompletedTasks([nextTask]);
      return;
    }

    // Get agent personality, but check if it's compatible with available worker type
    const requestedAgent = this.agentManager.getPersonality(
      nextTask.assignedAgent,
    );
    if (!requestedAgent) {
      logger.error({
        category: "process",
        action: "agent_not_found",
        message: `No agent found for ${nextTask.assignedAgent}`,
      });
      return;
    }

    // Workers are generic instances - assign any available worker to any task
    // The worker will get the personality based on the task's assigned agent
    logger.info({
      category: "process",
      action: "assigning_task_nexttask_id_to_available_worker_wit",
      message: `Assigning task ${nextTask.id} to available worker with agent ${requestedAgent.id}`,
    });

    const agent = requestedAgent;

    // Remove from queue
    const taskIndex = this.taskQueue.indexOf(nextTask);
    this.taskQueue.splice(taskIndex, 1);

    // Generate task prompt (worktree will be determined in createEphemeralWorker)
    const taskContext: TaskContext = {
      task: nextTask,
      agent: agent,
      project: nextTask.project || "dev-monitor",
      worktree: "[dynamic workspace provisioned per task]",
      environment: "development",
    };

    nextTask.prompt = this.templateManager.generatePrompt(taskContext);
    nextTask.assignedAgent = agent.id;
    nextTask.status = "assigned";
    nextTask.assignedAt = new Date().toISOString();

    this.activeTasks.set(nextTask.id, nextTask);

    try {
      // Create ephemeral worker and execute task
      const ephemeralWorker = await this.createEphemeralWorker(nextTask, agent);
      nextTask.assignedWorker = ephemeralWorker.id;

      // Execute task in container
      this.executeTaskInEphemeralWorker(ephemeralWorker);

      logger.info({
        category: "process",
        action: "task_assigned_to_ephemeral_worker_nexttask_id_ephe",
        message: `Task assigned to ephemeral worker: ${nextTask.id} -> ${ephemeralWorker.id}`,
      });
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_create_ephemeral_worker_for_task_nexttas",
        message: `Failed to create ephemeral worker for task ${nextTask.id}:`,
        error: error,
      });

      // Mark task as failed
      nextTask.status = "failed";
      nextTask.error = error instanceof Error ? error.message : String(error);
      nextTask.completedAt = new Date().toISOString();
      nextTask.canRetry = true;
      this.activeTasks.delete(nextTask.id);
      this.completedTasks.push(nextTask);
      this.taskPersistence.saveCompletedTasks([nextTask]);

      // Try next task
      this.assignNextTask();
    }

    // Save to persistence
    this.saveTasksToPersistence();

    this.emit("taskAssigned", nextTask);
  }

  private saveTasksToPersistence(): void {
    try {
      const allTasks = [
        ...this.taskQueue,
        ...Array.from(this.activeTasks.values()),
        ...this.completedTasks,
      ];
      this.taskPersistence.saveTasks(allTasks);
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_save_tasks_to_persistence",
        message: "Failed to save tasks to persistence:",
        error: error,
      });
    }
  }

  public completeWorkerOnboarding(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.onboardingComplete = true;
      worker.lastOnboardingCheck = Date.now();
      logger.info({
        category: "process",
        action: "worker_workerid_onboarding_completed",
        message: `Worker ${workerId} onboarding completed`,
      });
    }
  }

  public getAgentPersonalities(): AgentPersonality[] {
    return this.agentManager.getAllPersonalities();
  }

  public getTaskTemplates(): Record<string, unknown>[] {
    // Return the single universal template as an array for API compatibility
    return [
      this.templateManager.getTemplate() as unknown as Record<string, unknown>,
    ];
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

  public validateTaskData(
    taskData: Record<string, unknown>,
    taskType: string,
  ): unknown {
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
   * Create a new ephemeral Docker container for a task
   */
  private async createEphemeralWorker(
    task: Task,
    agent: AgentPersonality,
  ): Promise<EphemeralWorker> {
    const activeWorkers = Array.from(this.ephemeralWorkers.values()).filter(
      (worker) => worker.status !== "destroyed",
    );

    if (activeWorkers.length >= this.MAX_CONCURRENT_WORKERS) {
      throw new Error("Maximum concurrent dev-bots are already active");
    }

    const workspace = this.workspaceOrchestrator.createWorkspace(
      task.id,
      agent.id,
    );
    const workerId = `bot-${agent.id}-${Date.now()}`;
    const containerName = `dev-bot-${workerId}`;

    try {
      const container = await this.docker.createContainer({
        Image: this.getAgentDockerImage(agent),
        name: containerName,
        Cmd: ["/bin/bash", "-c", "tail -f /dev/null"],
        Env: [
          `AGENT_ID=${agent.id}`,
          `AGENT_NAME=${agent.name}`,
          `TASK_ID=${task.id}`,
          `WORKER_ID=${workerId}`,
          `WORKSPACE_BRANCH=${workspace.branchName}`,
          `WORKSPACE_ID=${workspace.id}`,
        ],
        WorkingDir: `/workspace`,
        HostConfig: {
          Memory: 512 * 1024 * 1024,
          CpuQuota: 50000,
          AutoRemove: true,
          Binds: [
            `${process.cwd()}:/app:ro`,
            `${workspace.hostPath}:/workspace:rw`,
            `${process.cwd()}/logs:/app/logs:rw`,
          ],
        },
        Labels: {
          "claude.worker.id": workerId,
          "claude.agent.id": agent.id,
          "claude.task.id": task.id,
          "claude.workspace.id": workspace.id,
        },
      });

      await container.start();
      await this.initializeWorkerLogFile(workerId);

      const ephemeralWorker: EphemeralWorker = {
        id: workerId,
        containerId: container.id,
        agent,
        task,
        status: "starting",
        createdAt: new Date().toISOString(),
        workspace,
      };

      this.ephemeralWorkers.set(workerId, ephemeralWorker);

      logger.info({
        category: "process",
        action: "created_ephemeral_worker_workerid_with_container_c",
        message: `Created ephemeral worker ${workerId} with container ${container.id}`,
      });
      return ephemeralWorker;
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_create_ephemeral_worker_workerid",
        message: `Failed to create ephemeral worker ${workerId}:`,
        error: error,
      });
      this.workspaceOrchestrator.cleanupWorkspace(workspace);
      throw error;
    }
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
   * Execute task in ephemeral worker container
   */
  private async executeTaskInEphemeralWorker(
    worker: EphemeralWorker,
  ): Promise<void> {
    try {
      worker.status = "running";

      const container = this.docker.getContainer(worker.containerId);

      // Determine log file path per worker
      const sanitizedId = worker.id.replace(/[^a-zA-Z0-9-_]/g, "_");
      const logFile = `/app/logs/${sanitizedId}.log`;

      // Generate task execution command with logging
      const executionCommand = this.generateTaskExecutionCommandWithLogging(
        worker.task,
        worker.agent,
        logFile,
      );

      // Execute task in container
      const exec = await container.exec({
        Cmd: ["/bin/bash", "-c", executionCommand],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({
        Detach: false,
        Tty: false,
      });

      let output = "";
      let errorOutput = "";

      stream.on("data", (data: Buffer) => {
        const chunk = data.toString();
        if (chunk.startsWith("1:")) {
          output += chunk.substring(2);
        } else if (chunk.startsWith("2:")) {
          errorOutput += chunk.substring(2);
        }
      });

      // Wait for execution to complete
      await new Promise((resolve, reject) => {
        stream.on("end", resolve);
        stream.on("error", reject);
      });

      // Get exit code
      const inspect = await exec.inspect();
      const exitCode = inspect.ExitCode || 0;

      // Complete the task
      await this.completeEphemeralTask(worker, output, errorOutput, exitCode);
    } catch (error) {
      logger.error({
        category: "process",
        action: "task_execution_failed_for_worker_worker_id",
        message: `Task execution failed for worker ${worker.id}:`,
        error: error,
      });
      await this.failEphemeralTask(
        worker,
        error instanceof Error ? error : { message: String(error) },
      );
    }
  }

  /**
   * Generate task execution command for container
   * Generates a proper Claude CLI command with the task prompt
   */
  private generateTaskExecutionCommand(
    task: Task,
    _agent: AgentPersonality,
  ): string {
    // Escape the prompt for shell execution
    const escapedPrompt = (task.prompt || task.description || task.title)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`");

    // Build Claude CLI command
    const command = [
      "claude",
      "-p",
      `"${escapedPrompt}"`,
      "--allowedTools",
      "Bash,Read,Write,Edit,Grep,Glob,WebSearch,WebFetch",
      "--workingDirectory",
      "/workspace",
      "--print",
    ];

    // Add any task-specific files
    if (task.files && task.files.length > 0) {
      command.push("--files", task.files.join(","));
    }

    // Add project context
    if (task.project) {
      command.push("--context", `project:${task.project}`);
    }

    const fullCommand = command.join(" ");
    logger.info({
      category: "process",
      action: "generated_task_execution_command_fullcommand_subst",
      message: `Generated task execution command: ${fullCommand.substring(0, 100)}...`,
    });

    return fullCommand;
  }

  /**
   * Generate task execution command with worker-specific logging
   * Generates a proper Claude CLI command with the task prompt and logs to worker-specific file
   */
  private generateTaskExecutionCommandWithLogging(
    task: Task,
    agent: AgentPersonality,
    logFile: string,
  ): string {
    // Escape the prompt for shell execution
    const escapedPrompt = (task.prompt || task.description || task.title)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`");

    // Build Claude CLI command with logging
    const command = [
      "claude",
      "-p",
      `"${escapedPrompt}"`,
      "--allowedTools",
      "Bash,Read,Write,Edit,Grep,Glob,WebSearch,WebFetch",
      "--workingDirectory",
      "/workspace",
      "--print",
    ];

    // Add any task-specific files
    if (task.files && task.files.length > 0) {
      command.push("--files", task.files.join(","));
    }

    // Add project context
    if (task.project) {
      command.push("--context", `project:${task.project}`);
    }

    const claudeCommand = command.join(" ");

    // Create a wrapper command that logs to the worker-specific file
    const wrapperCommand = [
      'echo "=== Worker Task Execution Started ===" >> ' + logFile,
      'echo "Timestamp: $(date)" >> ' + logFile,
      'echo "Worker: ' + agent.name + '" >> ' + logFile,
      'echo "Task: ' + task.title + '" >> ' + logFile,
      'echo "=====================================" >> ' + logFile,
      claudeCommand + " 2>&1 | tee -a " + logFile,
      'echo "=== Worker Task Execution Completed ===" >> ' + logFile,
      'echo "Exit Code: $?" >> ' + logFile,
      'echo "=======================================" >> ' + logFile,
    ].join(" && ");

    logger.info({
      category: "process",
      action: "generated_task_execution_command_with_logging_wrap",
      message: `Generated task execution command with logging: ${wrapperCommand.substring(0, 100)}...`,
    });

    return wrapperCommand;
  }

  /**
   * Initialize worker-specific log file
   */
  private async initializeWorkerLogFile(workerId: string): Promise<void> {
    try {
      const fs = await import("fs");
      const path = await import("path");

      // Ensure logs directory exists (use root logs directory)
      const logsDir = path.join(process.cwd(), "../../logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
        logger.info({
          category: "process",
          action: "created_logs_directory_logsdir",
          message: `Created logs directory: ${logsDir}`,
        });
      }

      // Initialize worker log file with header
      const sanitizedId = workerId.replace(/[^a-zA-Z0-9-_]/g, "_");
      const logFile = path.join(logsDir, `${sanitizedId}.log`);
      const timestamp = new Date().toISOString();
      const header =
        `=== ${workerId.toUpperCase()} WORKER LOG ===\n` +
        `Initialized: ${timestamp}\n` +
        `Worker ID: ${workerId}\n` +
        `=====================================\n\n`;

      // Append header to log file (don't overwrite existing content)
      fs.appendFileSync(logFile, header);
      logger.info({
        category: "process",
        action: "initialized_worker_log_file_logfile",
        message: `Initialized worker log file: ${logFile}`,
      });
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_initialize_worker_log_file_for_workertyp",
        message: `Failed to initialize worker log file for ${workerId}:`,
        error: error,
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
        const provider = task.assignedAgent?.includes("codex")
          ? "codex"
          : "claude";

        tokenTracking.recordUsage({
          provider,
          model: task.assignedAgent || "unknown",
          taskId: task.id,
          inputTokens,
          outputTokens,
        });

        logger.info({
          category: "token-tracking",
          action: "recorded_token_usage",
          message: `Recorded token usage for task ${task.id}`,
          details: { provider, inputTokens, outputTokens },
        });
      }
    } catch (error) {
      logger.error({
        category: "token-tracking",
        action: "failed_to_extract_tokens",
        message: "Failed to extract and record token usage",
        error,
      });
    }
  }

  /**
   * Run quality gate validation on a completed task
   * This is async and runs in the background - it doesn't block task completion
   */
  private async runQualityGateValidation(
    task: Task,
    workspacePath: string,
  ): Promise<void> {
    try {
      const qualityGates = getQualityGateValidator();

      // Determine project name from task
      const project = task.project || "unknown";

      logger.info({
        category: "quality-gates",
        action: "validation_started",
        message: `Starting quality gate validation for task ${task.id}`,
        details: { project, workspacePath },
      });

      // Run validation (this is async and takes time)
      const validationResult: QualityValidationResult =
        await qualityGates.validateTask(task.id, workspacePath, project);

      // Store validation results in task
      task.qualityValidation = validationResult;

      logger.info({
        category: "quality-gates",
        action: "validation_completed",
        message: `Quality gate validation completed for task ${task.id}`,
        details: {
          passed: validationResult.passed,
          overallScore: validationResult.overallScore,
          gatesPassed: validationResult.gates.filter((g) => g.passed).length,
          gatesTotal: validationResult.gates.length,
        },
      });

      // Emit event for UI updates
      this.emit("quality_validation_completed", {
        taskId: task.id,
        result: validationResult,
      });

      // If quality gates failed, optionally create a healing task
      if (!validationResult.passed) {
        logger.warn({
          category: "quality-gates",
          action: "validation_failed",
          message: `Quality gates failed for task ${task.id}`,
          details: {
            failedGates: validationResult.gates
              .filter((g) => !g.passed)
              .map((g) => g.gate),
          },
        });

        // TODO: Create auto-healing task
        // this.createHealingTask(task, validationResult);
      }
    } catch (error) {
      logger.error({
        category: "quality-gates",
        action: "validation_error",
        message: `Error running quality gate validation for task ${task.id}`,
        error,
      });
    }
  }

  /**
   * Complete task in ephemeral worker
   */
  private async completeEphemeralTask(
    worker: EphemeralWorker,
    output: string,
    errorOutput: string,
    exitCode: number,
  ): Promise<void> {
    worker.status = "completing";

    const task = worker.task;
    task.output = output;
    task.error = errorOutput;
    task.exitCode = exitCode;

    this.extractAndRecordTokenUsage(task, output);

    const workspacePath = worker.workspace.hostPath;
    let qualityValidation: QualityValidationResult | undefined;
    let shouldPush = exitCode === 0;

    if (shouldPush) {
      try {
        qualityValidation = await this.runQualityGateValidation(
          task,
          workspacePath,
        );
        task.qualityValidation = qualityValidation;
        shouldPush = qualityValidation.passed;
      } catch (error) {
        shouldPush = false;
        logger.error({
          category: "quality-gates",
          action: "validation_error",
          message: `Error running quality gate validation for task ${task.id}`,
          error,
        });
        task.error = `${task.error || ""}\nQuality gate validation failed to execute: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }

    let finalStatus: "completed" | "failed" =
      exitCode === 0 ? "completed" : "failed";
    let failureReason: string | undefined;

    if (shouldPush) {
      const sealResult = await this.workspaceOrchestrator.sealWorkspace(
        worker.workspace,
        {
          taskId: task.id,
          taskTitle: task.title,
          pushCoordinator: this.pushCoordinator,
        },
      );

      if (sealResult.status === "success" || sealResult.status === "noop") {
        finalStatus = "completed";
        if (sealResult.commitSha) {
          const commitNote = `Pushed commit ${sealResult.commitSha} to staging from workspace ${worker.workspace.id}`;
          task.notes = task.notes ? `${task.notes}\n${commitNote}` : commitNote;
        }
      } else {
        finalStatus = "failed";
        failureReason =
          sealResult.message || `Failed to push changes (${sealResult.status})`;
        if (sealResult.patchPath) {
          failureReason = `${failureReason}. Patch saved at ${sealResult.patchPath}`;
        }
      }
    } else {
      finalStatus = "failed";
      failureReason =
        exitCode !== 0
          ? `Task exited with code ${exitCode}`
          : qualityValidation && !qualityValidation.passed
            ? "Quality gates failed"
            : "Task did not meet push requirements";

      const patchPath = this.workspaceOrchestrator.createPatchArtifact(
        worker.workspace,
      );
      if (patchPath) {
        failureReason = `${failureReason}. Workspace patch saved at ${patchPath}`;
      }
    }

    task.status = finalStatus;
    task.completedAt = new Date().toISOString();

    if (failureReason) {
      task.error = [task.error, failureReason].filter(Boolean).join("\n");
      task.canRetry = true;
    }

    this.activeTasks.delete(task.id);
    this.completedTasks.push(task);
    this.taskPersistence.saveCompletedTasks([task]);

    await this.destroyEphemeralWorker(worker.id);

    if (finalStatus === "completed") {
      logger.info({
        category: "process",
        action: "task_completed_worker_task_id",
        message: `Task completed: ${task.id}`,
      });
    } else {
      logger.warn({
        category: "process",
        action: "task_failed_to_push",
        message: `Task ${task.id} finished with status ${finalStatus}`,
        details: { failureReason },
      });
    }

    const activeWorkers = Array.from(this.ephemeralWorkers.values()).filter(
      (workerInfo) => workerInfo.status !== "destroyed",
    );
    logger.info({
      category: "process",
      action: "active_workers_after_completion",
      message: `Active workers after completion: ${activeWorkers.length} (${activeWorkers
        .map((w) => w.id)
        .join(", ")})`,
    });

    await this.assignNextTask();
  }

  /**
   * Fail task in ephemeral worker
   */
  private async failEphemeralTask(
    worker: EphemeralWorker,
    error: Error | { message: string },
  ): Promise<void> {
    worker.status = "completing";

    // Update task
    worker.task.status = "failed";
    worker.task.completedAt = new Date().toISOString();
    const baseError = error instanceof Error ? error.message : String(error);
    let failureMessage = baseError;
    const patchPath = this.workspaceOrchestrator.createPatchArtifact(
      worker.workspace,
    );
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
      category: "process",
      action: "task_failed_worker_task_id",
      message: `Task failed: ${worker.task.id}`,
      error: error,
    });

    // Log current worker status for debugging
    const activeWorkers = Array.from(this.ephemeralWorkers.values()).filter(
      (worker) => worker.status !== "destroyed",
    );
    logger.info({
      category: "process",
      action: "active_workers_after_failure",
      message: `Active workers after failure: ${activeWorkers.length} (${activeWorkers.map((w) => w.id).join(", ")})`,
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
        const logs = await this.dockerManager.getContainerLogs(
          worker.containerId,
          50,
        );
        if (logs) {
          logger.info({
            category: "process",
            action: "container_worker_containerid_logs_last_50_lines_n_",
            message: `Container ${worker.containerId} logs (last 50 lines):\n${logs}`,
          });
        }
      } catch (logError) {
        logger.warn({
          category: "process",
          action: "could_not_retrieve_logs_for_container_worker_conta",
          message: `Could not retrieve logs for container ${worker.containerId}:`,
          details: { logError },
        });
      }

      // Stop container if running
      try {
        await container.stop({ t: 10 }); // 10 second grace period
      } catch (error) {
        // Container might already be stopped
        logger.warn({
          category: "process",
          action: "container_worker_containerid_already_stopped_or_er",
          message: `Container ${worker.containerId} already stopped or error stopping:`,
          details: { error },
        });
      }

      // Remove container (includes volumes with AutoRemove: true)
      await container.remove({ v: true, force: true });

      worker.status = "destroyed";
      worker.destroyedAt = new Date().toISOString();

      // Remove from ephemeral workers map
      this.ephemeralWorkers.delete(workerId);

      logger.info({
        category: "process",
        action: "destroyed_ephemeral_worker_workerid_and_cleaned_up",
        message: `Destroyed ephemeral worker ${workerId} and cleaned up resources`,
      });
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_destroy_ephemeral_worker_workerid",
        message: `Failed to destroy ephemeral worker ${workerId}:`,
        error: error,
      });
      // Emit error event for frontend
      this.emit("workerError", {
        workerId,
        type: "cleanup_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      this.workspaceOrchestrator.cleanupWorkspace(worker.workspace);
    } catch (cleanupError) {
      logger.warn({
        category: "process",
        action: "workspace_cleanup_after_destroy_failed",
        message: `Workspace cleanup failed for worker ${workerId}`,
        error: cleanupError,
      });
    }
  }

  public startSystem(): void {
    if (this.isCoordinatorHealthy) {
      logger.info({
        category: "process",
        action: "claude_workers_system_is_already_running",
        message: "Dev-Bots system is already running",
      });
      return;
    }

    this.isCoordinatorHealthy = true;

    // Clear any existing ephemeral workers
    this.ephemeralWorkers.clear();

    this.emit("systemStatusChange", "running");
    logger.info({
      category: "process",
      action: "claude_workers_system_started_ephemeral_workers_wi",
      message:
        "Dev-Bots system started - ephemeral workers will be created for tasks",
    });

    // Try to assign pending tasks
    this.assignNextTask();
  }

  public stopSystem(): void {
    if (!this.isCoordinatorHealthy) {
      logger.info({
        category: "process",
        action: "claude_workers_system_is_already_stopped",
        message: "Dev-Bots system is already stopped",
      });
      return;
    }

    this.isCoordinatorHealthy = false;

    // Stop all active ephemeral workers
    for (const worker of this.ephemeralWorkers.values()) {
      if (worker.status !== "destroyed") {
        // Mark task as failed and destroy container
        worker.task.status = "failed";
        worker.task.error = "System stopped";
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

    this.emit("systemStatusChange", "stopped");
    logger.info({
      category: "process",
      action: "claude_workers_system_stopped_all_ephemeral_worker",
      message: "Dev-Bots system stopped - all ephemeral workers terminated",
    });
  }

  public exportTasks(exportPath: string): void {
    try {
      const allTasks = [
        ...this.taskQueue,
        ...Array.from(this.activeTasks.values()),
        ...this.completedTasks,
      ];
      this.taskPersistence.exportTasks(allTasks, exportPath);
      logger.info({
        category: "process",
        action: "tasks_exported_to_exportpath",
        message: `Tasks exported to ${exportPath}`,
      });
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_export_tasks",
        message: "Failed to export tasks:",
        error: error,
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
        if (task.status === "pending") {
          this.taskQueue.push(task);
        } else if (task.status === "assigned" || task.status === "active") {
          this.activeTasks.set(task.id, task);
        } else if (task.status === "completed" || task.status === "failed") {
          this.completedTasks.push(task);
        }
      }

      this.saveTasksToPersistence();
      logger.info({
        category: "process",
        action: "imported_importedtasks_length_tasks_from_importpat",
        message: `Imported ${importedTasks.length} tasks from ${importPath}`,
      });
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_import_tasks",
        message: "Failed to import tasks:",
        error: error,
      });
      throw error;
    }
  }

  private async executeTask(task: Task): Promise<void> {
    try {
      task.status = "active";
      this.emit("taskStarted", task);

      const workerId = task.assignedWorker!;
      const containerName = `claude-${workerId}`;

      // Build the prompt with scope constraints
      const prompt = this.buildPromptWithScope(task);

      // Execute in Docker container
      const container = this.docker.getContainer(containerName);
      await container.exec({
        Cmd: [
          "su-exec",
          "worker",
          "claude",
          "-p",
          prompt,
          "--allowedTools",
          "Bash,Read,Write,Edit,Search,Git",
          "--dangerously-skip-permissions",
          "--print",
        ],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      });

      // For now, simulate task execution
      const output = `Task ${task.id} executed successfully`;

      // Check for scope violations
      const violations = this.scopeCreepDetector.detectCreepPatterns(
        task,
        output,
      );
      if (violations.length > 0) {
        logger.warn({
          category: "process",
          action: "scope_violation_task_task_id_has_violations",
          message: `[SCOPE_VIOLATION] Task ${task.id} has violations:`,
          details: { violations },
        });
        this.contextIsolation.isolateContaminatedContext(task.id, violations);
        this.snowballPrevention.detectViolationChain(task.id, violations);
      }

      // Complete task
      task.status = "completed";
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
        worker.status = "idle";
        worker.currentTask = undefined;
        worker.lastSeen = Date.now();
      }

      this.emit("taskCompleted", task);
      logger.info({
        category: "process",
        action: "task_completed_task_id",
        message: `Task completed: ${task.id}`,
      });

      // Try to assign next task
      await this.assignNextTask();
    } catch (error) {
      // Handle task failure
      task.status = "failed";
      task.completedAt = new Date().toISOString();
      task.error = error instanceof Error ? error.message : String(error);
      task.exitCode = 1;
      task.canRetry = true; // Allow manual retry by default

      this.activeTasks.delete(task.id);

      // Add failed task to completed tasks (no automatic retry)
      this.completedTasks.push(task);
      this.taskPersistence.saveCompletedTasks([task]);
      this.emit("taskFailed", task);
      logger.error({
        category: "process",
        action: "task_failed",
        message: `Task ${task.id} failed`,
      });

      // Update worker status
      const worker = this.workers.get(task.assignedWorker!);
      if (worker) {
        worker.status = "idle";
        worker.currentTask = undefined;
        worker.lastSeen = Date.now();
      }

      // Try to assign next task
      await this.assignNextTask();
    }
  }

  private buildPromptWithScope(task: Task): string {
    let prompt = task.description || "";

    if (task.scope) {
      prompt += `\n\nSCOPE CONSTRAINTS:\n`;
      prompt += `- DO NOT create new files - only modify existing ones\n`;
      prompt += `- Maximum changes: ${task.scope.boundaries.maxChanges}\n`;
      prompt += `- Forbidden actions: ${task.scope.boundaries.forbiddenActions.join(", ")}\n`;
      prompt += `- Maximum new lines: ${task.scope.boundaries.maxNewLines}\n`;
      prompt += `- Forbidden patterns: ${task.scope.validation.forbiddenPatterns.join(", ")}\n`;
      prompt += `- Allowed patterns: ${task.scope.validation.allowedPatterns?.join(", ") || "None"}\n`;
    }

    return prompt;
  }

  async getSystemStatus(): Promise<DevBotsStatus> {
    // Convert ephemeral workers to worker status format for compatibility
    const workersRecord: Record<string, WorkerStatus> = {};
    const activeEphemeralWorkers = Array.from(
      this.ephemeralWorkers.values(),
    ).filter((worker) => worker.status !== "destroyed");
    for (const [workerId, ephemeralWorker] of this.ephemeralWorkers.entries()) {
      workersRecord[workerId] = {
        id: workerId,
        status:
          ephemeralWorker.status === "starting"
            ? "busy"
            : ephemeralWorker.status === "running"
              ? "busy"
              : ephemeralWorker.status === "completing"
                ? "busy"
                : "stopped",
        currentTask: ephemeralWorker.task.id,
        lastSeen: new Date(ephemeralWorker.createdAt).getTime(),
        personality: ephemeralWorker.agent,
        onboardingComplete: true,
      };
    }

    return {
      systemStatus: this.isCoordinatorHealthy ? "running" : "stopped",
      workers: workersRecord,
      queueSize: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      uptime: Date.now() - this.startTime,
      workerCount: this.ephemeralWorkers.size,
      maxWorkers: this.MAX_CONCURRENT_WORKERS,
      activeWorkerTypes: activeEphemeralWorkers.map((w) => w.id),
      availableWorkerTypes: Array.from(
        {
          length: Math.max(
            this.MAX_CONCURRENT_WORKERS - activeEphemeralWorkers.length,
            0,
          ),
        },
        (_value, index) => `slot-${index + 1}`,
      ),
      tasks: {
        pending: this.taskQueue,
        active: Array.from(this.activeTasks.values()),
        completed: this.completedTasks.slice(-50), // Keep last 50 completed tasks
      },
    };
  }

  async getTasks(): Promise<{
    pending: Task[];
    active: Task[];
    completed: Task[];
  }> {
    return {
      pending: this.taskQueue,
      active: Array.from(this.activeTasks.values()),
      completed: this.completedTasks.slice(-50),
    };
  }

  isHealthy(): boolean {
    return this.isCoordinatorHealthy;
  }

  // Additional API methods for scope control and cleanup
  async getScopeViolations(): Promise<
    Array<{
      taskId: string;
      violations: Array<{ type: string; severity: string }>;
    }>
  > {
    // This would track scope violations - simplified for now
    return [];
  }

  async triggerEmergencyRecovery(): Promise<Task> {
    const recoveryTask: Task = {
      id: `task-${this.taskIdCounter++}-${Date.now()}`,
      type: "recovery",
      title: "Emergency Recovery Task",
      description:
        "EMERGENCY RECOVERY: Clean up scope creep and restore system to stable state. DO NOT create new files. Only remove unnecessary code.",
      status: "pending",
      createdAt: new Date().toISOString(),
      assignedAgent: "backend-specialist",
      scope: {
        type: "cleanup",
        boundaries: {
          maxChanges: 1,
          forbiddenActions: [
            "create-new-files",
            "add-dependencies",
            "modify-existing-code",
          ],
          maxNewLines: 5,
        },
        validation: {
          forbiddenPatterns: [
            "create",
            "new",
            "add",
            "modify",
            "complex",
            "sophisticated",
          ],
          allowedPatterns: ["remove", "delete", "clean", "revert", "simplify"],
        },
      },
      isEmergency: true,
    };

    this.taskQueue.unshift(recoveryTask);
    await this.assignNextTask();
    return recoveryTask;
  }

  async getCleanupStatus(): Promise<{
    schedules: string[];
    recentTasks: Task[];
  }> {
    const recentCleanupTasks = this.completedTasks
      .filter((t) => t.type === "cleanup")
      .slice(-10);

    return {
      schedules: this.cleanupScheduler.checkSchedules(),
      recentTasks: recentCleanupTasks,
    };
  }

  async triggerCleanup(type: string): Promise<Task> {
    const cleanupTask = this.cleanupScheduler.createCleanupTask(
      type,
      this.taskIdCounter++,
    );
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
      category: "process",
      action: "manual_workspace_sync_triggered",
      message: "Manual workspace sync triggered",
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
      lastCheck: new Date(),
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
    return (
      this.dockerValidationResult || {
        isValid: false,
        errors: ["Docker validation not available"],
        warnings: [],
        info: {},
      }
    );
  }

  /**
   * Trigger orphaned resource cleanup
   */
  async cleanupOrphanedResources(): Promise<{
    volumesCleaned: number;
    networksCleaned: number;
  }> {
    logger.info({
      category: "process",
      action: "triggering_orphaned_resource_cleanup",
      message: "Triggering orphaned resource cleanup...",
    });

    const volumesCleaned = await this.dockerManager.cleanupOrphanedVolumes();
    const networksCleaned = await this.dockerManager.cleanupOrphanedNetworks();

    logger.info({
      category: "process",
      action: "cleanup_complete_volumescleaned_volumes_networkscl",
      message: `Cleanup complete: ${volumesCleaned} volumes, ${networksCleaned} networks removed`,
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
        logs: await this.dockerManager.getContainerLogs(containerId, 20),
      };
    } catch (error) {
      return {
        healthy: false,
        status: "not_found",
      };
    }
  }

  /**
   * Handle task retry when it becomes ready
   */
  private async handleTaskRetry(task: Task): Promise<void> {
    try {
      logger.info({
        category: "process",
        action: "handling_retry_for_task_task_id",
        message: `Handling retry for task ${task.id}`,
      });

      // Reset task status for retry
      task.status = "pending";
      task.assignedWorker = undefined;
      task.assignedAt = undefined;
      task.error = undefined;
      task.exitCode = undefined;

      // Add task back to queue
      this.taskQueue.push(task);

      // Emit retry event
      this.emit("taskRetrying", task);

      // Try to assign the retry task
      await this.assignNextTask();
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_handle_retry_for_task_task_id",
        message: `Failed to handle retry for task ${task.id}:`,
        error: error,
      });
      this.emit("taskRetryFailed", task, error);
    }
  }

  /**
   * Manually retry a failed task
   */
  public async retryTask(
    taskId: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Find the task in completed tasks
      const task = this.completedTasks.find((t) => t.id === taskId);
      if (!task) {
        return { success: false, message: "Task not found in completed tasks" };
      }

      if (task.status !== "failed") {
        return { success: false, message: "Task is not in failed status" };
      }

      // Check if task can be retried
      if (!this.retryManager.canRetryTask(task)) {
        return { success: false, message: "Task cannot be retried" };
      }

      // Manual retry - add task back to queue
      const retryResult = this.retryManager.retryTask(
        task,
        reason || "Manual retry",
      );

      if (retryResult.success) {
        // Remove from completed tasks
        const taskIndex = this.completedTasks.findIndex((t) => t.id === taskId);
        if (taskIndex !== -1) {
          this.completedTasks.splice(taskIndex, 1);
        }

        // Add retry task back to queue
        this.taskQueue.push(retryResult.task);

        this.emit("taskRetrying", retryResult.task);
        return { success: true, message: "Task queued for retry" };
      } else {
        return {
          success: false,
          message: retryResult.reason || "Failed to retry task",
        };
      }
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_retry_task_taskid",
        message: `Failed to retry task ${taskId}:`,
        error: error,
      });
      return { success: false, message: `Failed to retry task: ${error}` };
    }
  }

  /**
   * Cancel a scheduled retry (not needed for manual retry)
   */
  public cancelRetry(_taskId: string): { success: boolean; message: string } {
    return {
      success: false,
      message: "Manual retry cannot be cancelled once started",
    };
  }

  /**
   * Get retry information for a task
   */
  public getRetryInfo(taskId: string): {
    canRetry: boolean;
    retryCount: number;
    maxRetries: number;
    retryHistory: RetryAttempt[];
    scheduledRetries: Array<{
      taskId: string;
      retryAt: string;
      retryCount: number;
    }>;
  } {
    const task = this.completedTasks.find((t) => t.id === taskId);
    const retryHistory = this.retryManager.getRetryHistory(taskId);

    return {
      canRetry: task?.canRetry ?? task?.status === "failed",
      retryCount: task?.retryCount || 0,
      maxRetries: task?.maxRetries || this.retryManager.getConfig().maxRetries,
      retryHistory,
      scheduledRetries: [], // Manual retry system - no scheduled retries
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
      retryConfig: config,
    };
  }

  /**
   * Update retry configuration
   */
  public updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryManager.updateConfig(config);
    this.emit("retryConfigUpdated", config);
    logger.info({
      category: "process",
      action: "retry_configuration_updated",
      message: "Retry configuration updated",
      details: { config },
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
