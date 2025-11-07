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
import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import type { TaskQueueService } from './taskQueue.sqlite.js';
import type { AgentPersonality, AgentPersonalityManager } from './agentPersonalities.js';
import type { TaskPromptTemplateManager, TaskContext } from './taskPromptTemplates.js';
import type { WorkspaceOrchestrator } from './workspaceOrchestrator.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { TaskPersistence } from './taskPersistence.js';
import { isTaskStuck, detectFailurePattern } from './taskFailureGuards.js';
import type { SimpleFailureRecovery } from './failureRecovery.js';

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

// ============================================================================
// Task Execution Service
// ============================================================================

export class TaskExecutionService {
  private readonly taskQueue: TaskQueueService;
  private readonly agentManager: AgentPersonalityManager;
  private readonly templateManager: TaskPromptTemplateManager;
  private readonly workspaceOrchestrator: WorkspaceOrchestrator;
  private readonly ephemeralWorkerService: EphemeralWorkerService;
  private readonly taskPersistence: TaskPersistence;
  private readonly config: TaskExecutionServiceConfig;
  private recovery?: SimpleFailureRecovery; // Optional: set via setRecovery()

  private lastAgentType: 'claude' | 'codex' = 'claude';
  private readonly AGENT_ROTATION_STRATEGY: 'alternate' | 'random' | 'claude-only' | 'codex-only' = 'alternate';

  constructor(
    taskQueue: TaskQueueService,
    agentManager: AgentPersonalityManager,
    templateManager: TaskPromptTemplateManager,
    workspaceOrchestrator: WorkspaceOrchestrator,
    ephemeralWorkerService: EphemeralWorkerService,
    taskPersistence: TaskPersistence,
    config: Partial<TaskExecutionServiceConfig> = {}
  ) {
    this.taskQueue = taskQueue;
    this.agentManager = agentManager;
    this.templateManager = templateManager;
    this.workspaceOrchestrator = workspaceOrchestrator;
    this.ephemeralWorkerService = ephemeralWorkerService;
    this.taskPersistence = taskPersistence;

    this.config = {
      maxConcurrentWorkers: config.maxConcurrentWorkers ?? 2,
      stuckCheckInterval: config.stuckCheckInterval ?? 60000,
      absoluteMaxDuration: config.absoluteMaxDuration ?? 60 * 60 * 1000,
      artifactsDir: config.artifactsDir ?? path.join(process.cwd(), 'dev-bots', 'artifacts'),
      recovery: {
        enabled: config.recovery?.enabled ?? true,
        dryRun: config.recovery?.dryRun ?? false
      }
    };
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
      failurePattern?: any;
    }
  ): Promise<void> {
    // Mark task as failed in database
    this.taskQueue.failTask(task.id, error);

    // Attempt recovery if enabled and recovery service is available
    if (this.config.recovery.enabled && this.recovery && context) {
      const failurePattern = context.failurePattern || {
        name: 'unknown_error',
        category: 'unknown',
        suggestedFix: 'Review error logs for details'
      };

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
            task: task as any,
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

  private chooseAgentType(): 'claude' | 'codex' {
    switch (this.AGENT_ROTATION_STRATEGY) {
      case 'alternate':
        this.lastAgentType = this.lastAgentType === 'claude' ? 'codex' : 'claude';
        return this.lastAgentType;
      case 'random':
        return Math.random() < 0.5 ? 'claude' : 'codex';
      case 'claude-only':
        return 'claude';
      case 'codex-only':
        return 'codex';
      default:
        return 'claude';
    }
  }

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

    // Update task status to running
    nextTask.status = 'running';
    nextTask.assigned_worker = workerId;

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

      // Fail task and trigger recovery
      await this.failTaskWithRecovery(
        nextTask,
        `Workspace initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1
        }
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
      project: (nextTask as any).project || 'dev-monitor',
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

    // Choose agent type if not specified
    const chosenAgentType = agentType || this.chooseAgentType();
    const workerId = `bot-${chosenAgentType}-${agent.id}-${Date.now()}`;

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
        '-v', `${homeDir}/.git-credentials:/home/node/.git-credentials:ro`,  // Git credential store
        '-v', `${homeDir}/.config/gh:/home/node/.config/gh:ro`,  // GitHub CLI auth
        this.getAgentDockerImage(agent),
        'sh', '-c',
        // Copy credentials and run Codex with full access for git operations
        // Use 'exec' subcommand for non-interactive execution
        // Note: codex exec uses --dangerously-bypass-approvals-and-sandbox instead of --ask-for-approval
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
        '-v', `${repoRoot}:/workspace:rw`,  // Mount workspace directly
        '-v', `${hostLogsDir}:/logs:rw`,  // Mount logs
        '--tmpfs', '/home/node/.claude:uid=1000,gid=1000',  // Writable temp for Claude CLI
        '-v', `${claudeCredentials}:/tmp/host-creds.json:ro`,  // Mount Claude credentials
        // Mount git credentials for committing and pushing
        '-v', `${homeDir}/.gitconfig:/home/node/.gitconfig:ro`,  // Git config
        '-v', `${homeDir}/.git-credentials:/home/node/.git-credentials:ro`,  // Git credential store
        '-v', `${homeDir}/.config/gh:/home/node/.config/gh:ro`,  // GitHub CLI auth
        this.getAgentDockerImage(agent),
        'sh', '-c',
        // Copy credentials and run Claude (bypass permissions for git access)
        `cp /tmp/host-creds.json /home/node/.claude/.credentials.json && ` +
        `claude --print --dangerously-skip-permissions --permission-mode bypassPermissions --allowedTools 'Bash(git:*)' '${promptText}'`
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
}
