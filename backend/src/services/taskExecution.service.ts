/**
 * Task Execution Service
 *
 * Extracted from DevBotsManager to handle task execution coordination:
 * - Task assignment from queue
 * - Docker-based task execution (docker run with ephemeral containers)
 * - Task completion handling
 * - Task failure handling
 *
 * This service orchestrates the full task execution lifecycle from assignment
 * through execution to completion/failure.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import type { TaskQueueService } from './taskQueue.sqlite.js';
import type { AgentPersonality, AgentPersonalityManager } from './agentPersonalities.js';
import type { TaskPromptTemplateManager, TaskContext } from './taskPromptTemplates.js';
// WorkspaceOrchestrator removed - we use Docker cp for file systems, not git mirrors
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
// TaskPersistence removed - using SQLite directly
import { isTaskStuck, detectFailurePattern, type FailurePattern } from './taskFailureGuards.js';
import type { SimpleFailureRecovery } from './failureRecovery.js';
import { resolveArtifactsDir } from '../utils/repoPaths.js';
import { AgentSelector, type AgentSelectionCriteria, type AgentAttempt } from './agentSelector.js';
import { TaskClassifier } from './taskClassifier.js';
import * as DockerConfig from './dockerConfig.js';

const execAsync = promisify(exec);

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface TaskExecutionServiceConfig {
  maxConcurrentWorkers: number;
  stuckCheckInterval: number;  // ms
  absoluteMaxDuration: number; // ms
  artifactsDir: string;
  recovery: {
    enabled: boolean;
    dryRun: boolean;
  };
}

type FailurePatternSummary = {
  kind: 'summary';
  name: string;
  category?: FailurePattern['category'];
  suggestedFix?: string;
};

type FailurePatternContext = FailurePattern | FailurePatternSummary;

// ============================================================================
// Task Execution Service
// ============================================================================

export class TaskExecutionService {
  private readonly taskQueue: TaskQueueService;
  private readonly agentManager: AgentPersonalityManager;
  private readonly templateManager: TaskPromptTemplateManager;
  private readonly ephemeralWorkerService: EphemeralWorkerService;
  private readonly config: TaskExecutionServiceConfig;
  private recovery?: SimpleFailureRecovery;
  private dockerCircuitBreaker?: { execute: <T>(fn: () => Promise<T>) => Promise<T> };
  private readonly agentSelector: AgentSelector; // Intelligent agent selection
  private readonly taskClassifier: TaskClassifier; // Task classification

  constructor(
    taskQueue: TaskQueueService,
    agentManager: AgentPersonalityManager,
    templateManager: TaskPromptTemplateManager,
    ephemeralWorkerService: EphemeralWorkerService,
    // TaskPersistence removed - using SQLite directly
    config: Partial<TaskExecutionServiceConfig> = {}
  ) {
    this.taskQueue = taskQueue;
    this.agentManager = agentManager;
    this.templateManager = templateManager;
    this.ephemeralWorkerService = ephemeralWorkerService;
    // TaskPersistence removed - using SQLite directly

    this.config = {
      maxConcurrentWorkers: config.maxConcurrentWorkers ?? 2,
      stuckCheckInterval: config.stuckCheckInterval ?? 60000,
      absoluteMaxDuration: config.absoluteMaxDuration ?? 60 * 60 * 1000,
      artifactsDir: config.artifactsDir ?? resolveArtifactsDir(),
      recovery: {
        enabled: config.recovery?.enabled ?? true,
        dryRun: config.recovery?.dryRun ?? false
      }
    };

    // Initialize intelligent agent selection (Phase 0.2)
    this.agentSelector = new AgentSelector();
    this.taskClassifier = new TaskClassifier();

    // Initialize circuit breaker for Docker operations
    this.initializeCircuitBreaker();
  }

  /**
   * Initialize circuit breaker for Docker operations
   */
  private async initializeCircuitBreaker(): Promise<void> {
    try {
      const { CircuitBreaker } = await import('../utils/circuitBreaker.js');
      this.dockerCircuitBreaker = new CircuitBreaker({
        name: 'docker-execution',
        failureThreshold: 5, // Open circuit after 5 consecutive failures
        resetTimeout: 60000 // Try again after 1 minute
      });
      logger.info({
        category: 'circuit-breaker',
        action: 'initialized',
        message: 'Docker execution circuit breaker initialized'
      });
    } catch (error) {
      logger.error({
        category: 'circuit-breaker',
        action: 'init_failed',
        message: 'Failed to initialize circuit breaker',
        error
      });
    }
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Set the recovery service (called by DevBotsManager after initialization)
   */
  public setRecovery(recovery: SimpleFailureRecovery): void {
    this.recovery = recovery;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Fail task and trigger recovery if appropriate
   * This ensures all task failures go through the recovery process
   */
  private async failTaskWithRecovery(
    task: Task,
    error: string,
    context?: {
      stderr?: string;
      stdout?: string;
      exitCode?: number;
      failurePattern?: FailurePatternContext | null;
    }
  ): Promise<void> {
    // Mark task as failed in database
    this.taskQueue.failTask(task.id, error);

    // Attempt recovery if enabled and recovery service is available
    if (this.config.recovery.enabled && this.recovery && context) {
      // Ensure we have a full FailurePattern for recovery
      const failurePattern = this.normalizeFailurePattern(context.failurePattern);

      try {
        if (this.config.recovery.dryRun) {
          logger.info({
            category: 'recovery',
            action: 'dry_run_would_attempt_recovery',
            message: `[DRY RUN] Would attempt automatic recovery for task ${task.id}`,
            details: {
              taskId: task.id,
              taskTitle: task.title,
              failurePattern: failurePattern.name,
              error
            }
          });
        } else {
          const recoveryResult = await this.recovery.attemptRecovery({
            task: task as Task & { metadata?: Record<string, unknown> },
            failurePattern,
            stderr: context.stderr || error,
            stdout: context.stdout || '',
            exitCode: context.exitCode || 1
          });

          if (recoveryResult.recovered) {
            logger.info({
              category: 'recovery',
              action: 'recovery_initiated',
              message: `Initiated automatic recovery for task ${task.id}`,
              details: {
                taskId: task.id,
                cleanupTaskId: recoveryResult.cleanupTaskId,
                failurePattern: failurePattern.name
              }
            });
          } else {
            logger.info({
              category: 'recovery',
              action: 'recovery_not_attempted',
              message: `Recovery was not attempted for task ${task.id}`,
              details: {
                taskId: task.id,
                reason: 'Failure not recoverable or already has active repair'
              }
            });
          }
        }
      } catch (recoveryError) {
        logger.error({
          category: 'recovery',
          action: 'recovery_attempt_failed',
          message: `Failed to attempt recovery for task ${task.id}: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`,
          details: {
            taskId: task.id,
            error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
          }
        });
      }
    }
  }

  private normalizeFailurePattern(input?: FailurePatternContext | null): FailurePattern {
    if (!input) {
      return {
        name: 'unknown_error',
        description: 'An unknown error occurred during task execution',
        patterns: [],
        immediateFailure: false,
        category: 'system_error',
        suggestedFix: 'Review error logs for details'
      };
    }

    if ('kind' in input && input.kind === 'summary') {
      return {
        name: input.name,
        description: 'Task failed with summarized failure pattern details',
        patterns: [],
        immediateFailure: false,
        category: input.category ?? 'system_error',
        suggestedFix: input.suggestedFix || 'Review error logs for details'
      };
    }

    // At this point, input is FailurePattern (not FailurePatternSummary)
    return input as FailurePattern;
  }

  // Agent selection handled by AgentSelector (intelligent, task-aware selection)

  private getAgentDockerImage(_agent: AgentPersonality): string {
    return 'dev-bot:latest';
  }

  private async execGitCommand(args: string[], cwd: string): Promise<string> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const git = spawn('git', args, { cwd });
      let stdout = '';
      let stderr = '';

      git.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      git.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      git.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Git command failed: ${args.join(' ')}\n${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      git.on('error', (error) => {
        reject(error);
      });
    });
  }

  private getHostLogsDir(): string {
    return path.resolve('./data/logs');
  }

  private getQueueMetrics() {
    return this.taskQueue.getQueueMetrics();
  }

  // ==========================================================================
  // Task Assignment
  // ==========================================================================

  /**
   * Assign next task from queue to available worker
   */
  async assignNextTask(onTaskAssigned?: () => void): Promise<void> {
    // Check active worker count against concurrency limit
    const activeWorkers = this.ephemeralWorkerService.getActiveWorkers();

    const queueMetrics = this.getQueueMetrics();
    logger.info({
      category: 'process',
      action: 'task_assignment_check',
      message: `Task assignment check: ${queueMetrics.pending} pending tasks, ${activeWorkers.length}/${this.config.maxConcurrentWorkers} active workers`,
      details: {
        queue_depth: queueMetrics.pending,
        active_workers: activeWorkers.length,
        capacity_available: this.config.maxConcurrentWorkers - activeWorkers.length,
        queue_health: queueMetrics.pending > 10 ? 'HIGH_LOAD' : queueMetrics.pending > 5 ? 'MODERATE' : 'HEALTHY',
        infrastructure_recommendation:
          queueMetrics.pending > 10 && activeWorkers.length >= this.config.maxConcurrentWorkers
            ? 'Consider increasing MAX_CONCURRENT_WORKERS to reduce queue backlog'
            : queueMetrics.pending === 0
            ? 'Queue empty - consider adding more tasks'
            : 'Infrastructure capacity balanced'
      }
    });

    if (activeWorkers.length >= this.config.maxConcurrentWorkers) {
      logger.warn({
        category: 'process',
        action: 'max_workers_active_skipping_assignment',
        message: `Maximum concurrent workers active (${this.config.maxConcurrentWorkers}). ${queueMetrics.pending} tasks queued.`,
        details: {
          bottleneck: 'CONCURRENCY_LIMIT',
          recommendation: queueMetrics.pending > 5
            ? 'Increase MAX_CONCURRENT_WORKERS to process queue faster'
            : 'Wait for active workers to complete',
          queue_wait_time_estimate: queueMetrics.avg_completion_time_ms
            ? `~${Math.ceil((queueMetrics.pending * queueMetrics.avg_completion_time_ms) / (this.config.maxConcurrentWorkers * 60000))} minutes`
            : 'Unknown'
        }
      });
      return;
    }

    // Atomically assign next task from SQLite queue
    const sqliteTask = this.taskQueue.assignNextTask();

    if (!sqliteTask) {
      logger.info({
        category: 'process',
        action: 'no_pending_tasks_in_queue',
        message: 'No pending tasks in queue'
      });
      return;
    }

    // Use SQLite task directly (no conversion needed)
    const nextTask = sqliteTask;
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // DON'T update task status to running yet - validate first to prevent stuck tasks

    // NOTE: WorkspaceOrchestrator.initialize() removed - Docker cp approach doesn't need git mirrors

    // Get agent personality
    const requestedAgent = this.agentManager.getPersonality(nextTask.assigned_agent);
    if (!requestedAgent) {
      logger.error({
        category: 'process',
        action: 'agent_not_found',
        message: `No agent found for ${nextTask.assigned_agent}`
      });

      // Fail task and trigger recovery
      await this.failTaskWithRecovery(
        nextTask,
        `Agent not found: ${nextTask.assigned_agent}. Please check agent name is correct.`,
        {
          stderr: `Agent not found: ${nextTask.assigned_agent}`,
          exitCode: 1
        }
      );

      // Try next task
      if (onTaskAssigned) onTaskAssigned();
      return;
    }

    // ALL VALIDATION PASSED - Now mark task as running
    nextTask.status = 'running';
    nextTask.assigned_worker = workerId;
    this.taskQueue.updateTask(nextTask.id, { status: 'running', assigned_worker: workerId });

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
      project: (nextTask as Task & { project?: string }).project || 'dev-monitor',
      worktree: '[dynamic workspace provisioned per task]',
      environment: 'development'
    };

    nextTask.prompt = this.templateManager.generatePrompt(taskContext);

    try {
      // Execute task using imagineer-style ephemeral container with circuit breaker protection
      if (this.dockerCircuitBreaker) {
        await this.dockerCircuitBreaker.execute(async () => {
          await this.executeTaskWithDockerRun(nextTask, agent);
        });
      } else {
        // Fallback if circuit breaker not initialized
        await this.executeTaskWithDockerRun(nextTask, agent);
      }

      logger.info({
        category: 'process',
        action: 'task_execution_completed',
        message: `Task execution completed: ${nextTask.id}`
      });

    } catch (error) {
      // Check if error is from circuit breaker being open
      const isCircuitOpen = error instanceof Error && error.message.includes('Circuit breaker');

      if (isCircuitOpen) {
        logger.error({
          category: 'circuit-breaker',
          action: 'docker_execution_blocked',
          message: `Docker execution blocked by circuit breaker for task ${nextTask.id}`,
          error: error
        });
      } else {
        logger.error({
          category: 'process',
          action: 'failed_to_create_ephemeral_worker',
          message: `Failed to create ephemeral worker for task ${nextTask.id}:`,
          error: error
        });
      }

      // Fail task and trigger recovery
      await this.failTaskWithRecovery(
        nextTask,
        error instanceof Error ? error.message : String(error),
        {
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1
        }
      );

      // Try next task
      if (onTaskAssigned) onTaskAssigned();
    }
  }

  // ==========================================================================
  // Task Execution (Docker Run)
  // ==========================================================================

  /**
   * Execute task using docker run with ephemeral container
   * This replaces the old createEphemeralWorker + executeTaskInEphemeralWorker approach
   */
  private async executeTaskWithDockerRun(task: Task, agent: AgentPersonality, agentType?: 'claude' | 'codex'): Promise<void> {
    const { spawn } = await import('child_process');

    // Use intelligent agent selection (Phase 0.3 Integration)
    let chosenAgentType: 'claude' | 'codex';
    
    if (agentType) {
      // Manual override specified
      chosenAgentType = agentType;
    } else {
      // Intelligent selection based on task classification
      let filePatterns: string[] | undefined;
      try {
        filePatterns = task.file_patterns ? JSON.parse(task.file_patterns) : undefined;
      } catch (error) {
        logger.warn({
          category: 'automation',
          action: 'json_parse_error',
          message: 'Failed to parse file_patterns, using undefined',
          details: {
            taskId: task.id,
            filePatterns: task.file_patterns,
            error: error instanceof Error ? error.message : String(error)
          }
        });
        filePatterns = undefined;
      }
      
      // Build previous attempts from retry count
      const previousAttempts: AgentAttempt[] = [];
      if (task.retry_count > 0 && task.agent_type) {
        // Previous attempt failed with this agent
        previousAttempts.push({
          agent: task.agent_type as 'claude' | 'codex',
          result: 'failure',
          timestamp: Date.now()
        });
      }

      const criteria: AgentSelectionCriteria = {
        taskCategory: task.task_category,
        filePatterns,
        complexity: task.estimated_complexity,
        preferredAgent: task.preferred_agent as 'claude' | 'codex' | 'copilot' | undefined,
        previousAttempts,
        taskTitle: task.title,
        taskDescription: task.description
      };

      const selection = this.agentSelector.selectAgent(criteria);
      
      // Copilot not supported in Docker execution yet
      if (selection.agent === 'copilot') {
        logger.warn({
          category: 'automation',
          action: 'copilot_fallback',
          message: 'Copilot selected but not yet supported, using fallback',
          details: {
            taskId: task.id,
            fallback: selection.fallbackAgent || 'claude'
          }
        });
        chosenAgentType = (selection.fallbackAgent || 'claude') as 'claude' | 'codex';
      } else {
        chosenAgentType = selection.agent as 'claude' | 'codex';
      }

      // Log the intelligent selection
      logger.info({
        category: 'automation',
        action: 'intelligent_agent_selected',
        message: `Selected ${chosenAgentType} for task: ${selection.reasoning}`,
        details: {
          taskId: task.id,
          agent: chosenAgentType,
          reasoning: selection.reasoning,
          confidence: selection.confidence,
          category: task.task_category,
          filePatterns,
          complexity: task.estimated_complexity,
          retryCount: task.retry_count
        }
      });
    }

    const workerId = `bot-${chosenAgentType}-${agent.id}-${Date.now()}`;

    try {
    // Container will clone fresh repository internally
    // Get the project root (parent of backend directory) for reference only
    const repoRoot = path.resolve(process.cwd(), '..');
    const baseBranch = 'staging';

    // Log that container will handle repository setup
    logger.info({
      category: 'process',
      action: 'container_isolation',
      message: `Container will clone fresh repo and checkout ${baseBranch} internally`,
      details: {
        workerId,
        baseBranch,
        note: 'Fixed: No longer switching branches in shared filesystem'
      }
    });

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

    // Prepare git environment variables (using centralized config)
    const gitEnvVars = DockerConfig.buildGitEnvVars();

    if (chosenAgentType === 'codex') {
      // Codex execution with isolated repository
      dockerArgs = [
        'run',
        '--rm',  // Auto-remove container after exit
        ...gitEnvVars,  // Pass git environment variables
        // NO direct workspace mount - will clone inside container
        '-v', `${hostLogsDir}:/logs:rw`,  // Mount logs
        '--tmpfs', '/home/node/.codex:uid=1000,gid=1000',  // Writable temp for Codex CLI
        '-v', `${homeDir}/.codex:/tmp/host-codex:ro`,  // Mount Codex credentials
        // Mount git credentials for committing and pushing
        '-v', `${homeDir}/.gitconfig:/home/node/.gitconfig:ro`,  // Git config
        '-v', `${homeDir}/.git-credentials:/home/node/.git-credentials:ro`,  // Git credential store
        // TODO: Security improvement - consider using GITHUB_TOKEN env var with :ro mount instead
        // Current: :rw needed for gh CLI state updates (caching, request metadata)
        // Trade-off: Allows potential credential tampering if container compromised
        '-v', `${homeDir}/.config/gh:/home/node/.config/gh:rw`,  // GitHub CLI auth
        this.getAgentDockerImage(agent),
        'sh', '-c',
        // Clone fresh repository, then copy credentials and run Codex
        `set -e && ` +
        `export HOME=/home/node && ` +  // Set HOME for gh CLI
        `mkdir -p /workspace && cd /workspace && ` +
        `git clone https://github.com/Jdubz/app-monitor.git . && ` +
        `git config --global user.name "DevBot" && ` +
        `git config --global user.email "devbot@local" && ` +
        `git fetch --all && ` +
        `git checkout ${baseBranch} && ` +
        `git pull origin ${baseBranch} || true && ` +
        `cp -r /tmp/host-codex/* /home/node/.codex/ 2>/dev/null || true && ` +
        `codex exec --dangerously-bypass-approvals-and-sandbox '${promptText}'`
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
        ...gitEnvVars,  // Pass git environment variables
        // NO direct workspace mount - will clone inside container
        '-v', `${hostLogsDir}:/logs:rw`,  // Mount logs
        '--tmpfs', '/home/node/.claude:uid=1000,gid=1000',  // Writable temp for Claude CLI
        '-v', `${claudeCredentials}:/tmp/host-creds.json:ro`,  // Mount Claude credentials
        // Mount git credentials for committing and pushing
        '-v', `${homeDir}/.gitconfig:/home/node/.gitconfig:ro`,  // Git config
        '-v', `${homeDir}/.git-credentials:/home/node/.git-credentials:ro`,  // Git credential store
        '-v', `${homeDir}/.config/gh:/home/node/.config/gh:rw`,  // GitHub CLI auth (rw for state updates)
        this.getAgentDockerImage(agent),
        'sh', '-c',
        // Clone fresh repository, then copy credentials and run Claude
        `set -e && ` +
        `export HOME=/home/node && ` +  // Set HOME for gh CLI
        `mkdir -p /workspace && cd /workspace && ` +
        `git clone https://github.com/Jdubz/app-monitor.git . && ` +
        `git config --global user.name "DevBot" && ` +
        `git config --global user.email "devbot@local" && ` +
        `git fetch --all && ` +
        `git checkout ${baseBranch} && ` +
        `git pull origin ${baseBranch} || true && ` +
        `cp /tmp/host-creds.json /home/node/.claude/.credentials.json && ` +
        `claude --dangerously-skip-permissions '${promptText}'`
      ];
      cliCommand = 'claude';
    }

    // Log sanitized docker command details for debugging without leaking secrets
    const redactedDockerArgs: string[] = [];
    for (let i = 0; i < dockerArgs.length; i++) {
      const arg = dockerArgs[i];
      if (arg === '-e' && dockerArgs[i + 1]) {
        const [key] = dockerArgs[i + 1].split('=', 1);
        redactedDockerArgs.push('-e', `${key}=<redacted>`);
        i++; // Skip the value we just redacted
        continue;
      }
      if (dockerArgs[i - 1] === '-c') {
        redactedDockerArgs.push('[shell-script-redacted]');
        continue;
      }
      redactedDockerArgs.push(arg);
    }

    logger.info({
      category: 'process',
      action: 'docker_command_debug',
      message: `Prepared docker invocation for ${cliCommand}`,
      details: {
        dockerArgsSample: redactedDockerArgs.slice(0, 12),
        dockerArgCount: dockerArgs.length
      }
    });

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

    // Wait for completion with stuck task detection
    const exitCode = await new Promise<number>((resolve, reject) => {
      // Periodic stuck task check
      const stuckCheckInterval = setInterval(() => {
        if (isTaskStuck(taskStartTime, this.config.absoluteMaxDuration)) {
          clearInterval(stuckCheckInterval);
          logger.error({
            category: 'process',
            action: 'task_stuck_timeout',
            message: `Task ${task.id} exceeded maximum duration (${this.config.absoluteMaxDuration / 60000} minutes)`,
            details: {
              taskId: task.id,
              taskTitle: task.title,
              elapsedMs: Date.now() - taskStartTime.getTime(),
              maxDurationMs: this.config.absoluteMaxDuration
            }
          });
          // Kill the docker process
          dockerProcess.kill('SIGKILL');
          reject(new Error(`Task exceeded maximum duration of ${this.config.absoluteMaxDuration / 60000} minutes`));
        }
      }, this.config.stuckCheckInterval);

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
    const artifactsDir = this.config.artifactsDir;
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
    const activeWorkerCount = this.ephemeralWorkerService.getActiveWorkers().length;

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
        stderrLog: stderr.length > 0 ? stderrLogPath : null,
        queue_depth: metrics.pending,
        active_workers: activeWorkerCount,
        max_concurrency: this.config.maxConcurrentWorkers,
        capacity_available: this.config.maxConcurrentWorkers - activeWorkerCount,
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

        // Add a small delay to ensure git operations are fully flushed to disk
        await this.waitForGitFlush();

        // SAFETY CHECK 1: Capture uncommitted changes
        await this.captureUncommittedChanges(task.id, repoRoot);

        // SAFETY CHECK 2: Verify bot committed changes
        const commitStatus = await this.verifyBotCommitted(
          task.id,
          repoRoot,
          new Date(task.assigned_at || task.created_at).toISOString()
        );

        if (!commitStatus.committed) {
          logger.warn({
            category: 'safety',
            action: 'bot_did_not_commit',
            message: `Bot completed task ${task.id} but did not commit changes`,
            details: { taskId: task.id }
          });

          // SAFETY CHECK 3: Auto-stash if uncommitted changes exist
          await this.autoStashChanges(task.id, repoRoot);
        } else {
          logger.info({
            category: 'safety',
            action: 'bot_committed_successfully',
            message: `Bot successfully committed and pushed for ${task.id}`,
            details: {
              taskId: task.id,
              commit: commitStatus.commitHash,
              pushed: commitStatus.pushed
            }
          });
        }

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
            outputSize: JSON.stringify(cliOutput).length,
            committed: commitStatus.committed,
            recommendation: executionDuration > 600000
              ? 'Task took >10min - consider breaking into smaller tasks'
              : executionDuration > 300000
              ? 'Task took >5min - monitor for potential optimization'
              : 'Execution time within normal range',
            next_task_available: metrics.pending > 0,
            queue_health: metrics.pending > 10 ? 'HIGH_LOAD' : metrics.pending > 5 ? 'MODERATE' : 'HEALTHY'
          }
        });

      } catch (parseError) {
        logger.warn({
          category: 'process',
          action: 'failed_to_parse_claude_output_marking_complete_anywa',
          message: `Failed to parse Claude output, marking complete anyway: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        });

        // Add a small delay to ensure git operations are fully flushed to disk
        await this.waitForGitFlush();

        // SAFETY CHECK: Capture uncommitted changes even on parse error
        await this.captureUncommittedChanges(task.id, repoRoot);

        // Still complete task even if output parsing fails
        this.taskQueue.completeTask(task.id, stdout, chosenAgentType);
      }

    } else {
      // Task failed - attempt automatic recovery if enabled
      const errorMsg = stderr || stdout || `Exit code ${exitCode}`;

      // Detect failure pattern
      const failurePattern = detectFailurePattern(stderr, stdout, exitCode);

      if (failurePattern) {
        logger.info({
          category: 'recovery',
          action: 'failure_pattern_detected',
          message: `Detected failure pattern: ${failurePattern.name}`,
          details: {
            taskId: task.id,
            pattern: failurePattern.name,
            category: failurePattern.category,
            immediateFailure: failurePattern.immediateFailure
          }
        });
      }

      // Fail task and trigger recovery (unified handler)
      await this.failTaskWithRecovery(task, errorMsg, {
        stderr,
        stdout,
        exitCode,
        failurePattern
      });

      logger.error({
        category: 'process',
        action: 'task_failed_with_exit_code',
        message: `Task ${task.id} failed with exit code ${exitCode}`,
        details: {
          taskId: task.id,
          taskTitle: task.title,
          exitCode,
          errorOutput: stderr.substring(0, 500),
          executionDuration_ms: executionDuration,
          recommendation: 'Review error logs and task configuration',
          failurePatternDetected: failurePattern?.name || 'none'
        }
      });
    }

    } catch (error) {
      // Execution error - fail task and trigger recovery
      logger.error({
        category: 'process',
        action: 'task_execution_error',
        message: `Task execution error for ${task.id}:`,
        error: error
      });

      await this.failTaskWithRecovery(
        task,
        error instanceof Error ? error.message : String(error),
        {
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1
        }
      );
    }
  }

  /**
   * Detect if output contains error indicators, even if exitCode is 0.
   * Some errors (like missing agents, Claude CLI usage errors) exit with code 0.
   */
  private detectErrorInOutput(stdout: string, stderr?: string): boolean {
    const output = `${stdout}\n${stderr || ''}`.toLowerCase();

    // Common error patterns that indicate task failure
    const errorPatterns = [
      /agent not found/i,
      /task was orphaned/i,
      /input must be provided/i,
      /error:/i,
      /failed to/i,
      /cannot find/i,
      /command not found/i,
      /no such file or directory/i,
      /permission denied/i,
      /connection refused/i,
      /timeout/i,
      /fatal:/i,
      /exception:/i,
      /traceback/i,
      /\[error\]/i,
      /\berror\b.*occurred/i
    ];

    return errorPatterns.some(pattern => pattern.test(output));
  }

  /**
   * Allow git operations within the container a brief moment to flush to disk.
   * Prevents race conditions where the host immediately reads from the workspace.
   */
  private async waitForGitFlush(delayMs = 2000): Promise<void> {
    if (delayMs <= 0) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  // ==========================================================================
  // Safety Mechanisms - Git Change Tracking
  // ==========================================================================

  /**
   * Capture uncommitted changes as a safety backup
   * Creates patch file if task completed but didn't commit changes
   */
  private async captureUncommittedChanges(taskId: string, repoRoot: string): Promise<void> {
    try {
      // Check for uncommitted changes
      const { stdout: status } = await execAsync('git status --porcelain', { cwd: repoRoot });

      if (status.trim()) {
        const changeCount = status.split('\n').filter(line => line.trim()).length;
        
        logger.warn({
          category: 'safety',
          action: 'uncommitted_changes_detected',
          message: `Task ${taskId} has ${changeCount} uncommitted changes`,
          details: { taskId, changeCount }
        });

        // Create patch file as backup
        const timestamp = Date.now();
        const patchFile = path.join(this.config.artifactsDir, `${taskId}-uncommitted-${timestamp}.patch`);

        // Generate diff
        const { stdout: diff } = await execAsync('git diff HEAD', { cwd: repoRoot });

        // Also get untracked files
        const { stdout: untrackedDiff } = await execAsync(
          'git ls-files --others --exclude-standard | xargs -r git diff /dev/null',
          { cwd: repoRoot }
        ).catch(() => ({ stdout: '' }));

        // Combine diffs
        const fullDiff = diff + (untrackedDiff ? '\n\n# Untracked files:\n' + untrackedDiff : '');

        // Save patch
        fs.writeFileSync(patchFile, fullDiff, 'utf-8');

        // Save git status for context
        fs.writeFileSync(
          patchFile.replace('.patch', '-status.txt'),
          status,
          'utf-8'
        );

        logger.info({
          category: 'safety',
          action: 'saved_uncommitted_changes',
          message: `Saved uncommitted changes to ${path.basename(patchFile)}`,
          details: { taskId, patchFile, diffSize: fullDiff.length }
        });
      }
    } catch (error) {
      logger.error({
        category: 'safety',
        action: 'failed_to_capture_changes',
        message: `Failed to capture uncommitted changes for ${taskId}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  /**
   * Verify that bot actually committed and pushed changes
   * Returns commit info if found, null if no commit detected
   */
  private async verifyBotCommitted(
    taskId: string,
    repoRoot: string,
    taskStartedAt: string
  ): Promise<{
    committed: boolean;
    commitHash?: string;
    commitMessage?: string;
    pushed?: boolean;
  }> {
    try {
      const sinceTime = new Date(taskStartedAt).toISOString();

      // Get commits since task started on staging branch
      const { stdout: commits } = await execAsync(
        `git log --since="${sinceTime}" --format="%H|%s" origin/staging`,
        { cwd: repoRoot }
      ).catch(() => ({ stdout: '' }));

      if (!commits) {
        return { committed: false };
      }

      const recentCommits = commits.split('\n').filter(Boolean);

      // Check if any commit mentions this task or was made by bot
      const botCommit = recentCommits.find(line =>
        line.includes(taskId) ||
        line.includes('🤖 Generated with') ||
        line.includes('Co-Authored-By: Claude') ||
        line.includes('Co-Authored-By: Codex')
      );

      if (botCommit) {
        const [hash, message] = botCommit.split('|');
        logger.info({
          category: 'safety',
          action: 'bot_commit_verified',
          message: `Verified bot committed for task ${taskId}`,
          details: { taskId, commitHash: hash, commitMessage: message }
        });
        return {
          committed: true,
          commitHash: hash,
          commitMessage: message,
          pushed: true
        };
      }

      return { committed: false };
    } catch (error) {
      logger.error({
        category: 'safety',
        action: 'failed_commit_verification',
        message: `Failed to verify commit for task ${taskId}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      return { committed: false };
    }
  }

  /**
   * Automatically stash uncommitted changes for later recovery
   * Used when bot completed task but didn't commit
   */
  private async autoStashChanges(taskId: string, repoRoot: string): Promise<void> {
    try {
      const stashMessage = `[AUTO-STASH] Task ${taskId} - Uncommitted changes at ${new Date().toISOString()}`;

      await execAsync(`git stash push -m "${stashMessage}"`, { cwd: repoRoot });

      logger.info({
        category: 'safety',
        action: 'auto_stashed_changes',
        message: `Auto-stashed uncommitted changes for task ${taskId}`,
        details: { taskId, stashMessage }
      });

      // List current stashes for recovery reference
      const { stdout: stashes } = await execAsync('git stash list', { cwd: repoRoot });

      logger.info({
        category: 'safety',
        action: 'stash_list',
        message: 'Current git stashes available for recovery',
        details: { stashes: stashes.split('\n').filter(Boolean) }
      });
    } catch (error) {
      logger.error({
        category: 'safety',
        action: 'auto_stash_failed',
        message: `Failed to auto-stash changes for task ${taskId}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }
}
