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
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import type { TaskQueueService } from './taskQueue.sqlite.js';
import type { AgentPersonalityManager } from './agentPersonalities.js';
import type { TaskPromptTemplateManager, TaskContext } from './taskPromptTemplates.js';
// WorkspaceOrchestrator removed - we use Docker cp for file systems, not git mirrors
import type { EphemeralWorkerService, EphemeralWorker, TaskExecutionResult } from './ephemeralWorker.service.js';
// TaskPersistence removed - using SQLite directly
import type { FailurePattern } from './taskFailureGuards.js';
import type { SimpleFailureRecovery } from './failureRecovery.js';
import { resolveArtifactsDir } from '../utils/repoPaths.js';
import { AgentSelector } from './agentSelector.js';
import { TaskClassifier } from './taskClassifier.js';
import { TaskArtifactService } from './taskArtifact.service.js';
import { SessionSummaryService } from './sessionSummary.service.js';

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
  private readonly artifactService: TaskArtifactService; // Artifact tracking
  private readonly sessionSummaryService: SessionSummaryService; // Session summaries

  constructor(
    taskQueue: TaskQueueService,
    agentManager: AgentPersonalityManager,
    templateManager: TaskPromptTemplateManager,
    ephemeralWorkerService: EphemeralWorkerService,
    agentSelector: AgentSelector,
    // TaskPersistence removed - using SQLite directly
    config: Partial<TaskExecutionServiceConfig> = {}
  ) {
    this.taskQueue = taskQueue;
    this.agentManager = agentManager;
    this.templateManager = templateManager;
    this.ephemeralWorkerService = ephemeralWorkerService;
    this.agentSelector = agentSelector;
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
    this.taskClassifier = new TaskClassifier();

    // Initialize artifact service
    this.artifactService = new TaskArtifactService();
    
    // Initialize session summary service
    this.sessionSummaryService = new SessionSummaryService();

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
   * Validate PR status before task execution
   * Cancels task if PR is already merged or closed
   */
  private async validatePRStatusBeforeExecution(task: Task): Promise<void> {
    const prNumber = task.pr_number || task.followup_for_pr;

    if (!prNumber) {
      // Not a PR-related task, no validation needed
      return;
    }

    try {
      const { getGitHubPRService } = await import('./githubPR.service.js');
      const ghService = getGitHubPRService();
      const prStatus = await ghService.getPRStatus(prNumber);

      if (prStatus.state === 'CLOSED' || prStatus.state === 'MERGED') {
        logger.warn({
          category: 'automation',
          action: 'stale_pr_task_cancelled',
          message: `Cancelling task ${task.id} - PR #${prNumber} is ${prStatus.state}`,
          details: {
            taskId: task.id,
            prNumber,
            prState: prStatus.state,
            taskTitle: task.title
          }
        });

        await this.taskQueue.updateTask(task.id, {
          status: 'cancelled',
          completed_at: Date.now(),
          notes: `Auto-cancelled: PR #${prNumber} ${prStatus.state === 'MERGED' ? 'merged' : 'closed'} before task execution`
        });

        // Throw error to stop execution
        throw new Error(`Task cancelled: PR #${prNumber} ${prStatus.state === 'MERGED' ? 'merged' : 'closed'}`);
      }

      logger.debug({
        category: 'automation',
        action: 'pr_status_validated',
        message: `PR #${prNumber} is ${prStatus.state} - task ${task.id} can proceed`,
        details: { taskId: task.id, prNumber, prState: prStatus.state }
      });

    } catch (error) {
      // If we threw the cancellation error, re-throw it
      if (error instanceof Error && error.message.includes('Task cancelled')) {
        throw error;
      }

      // If GitHub API failed, log warning but allow execution to proceed
      logger.warn({
        category: 'automation',
        action: 'pr_validation_failed',
        message: `Failed to validate PR status for task ${task.id}, allowing execution`,
        error,
        details: { taskId: task.id, prNumber }
      });
    }
  }

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

  /**
   * Intelligent agent CLI type selection using AgentSelector
   * Determines whether to use claude, codex, or gemini based on task characteristics
   */
  private async selectAgentCliType(task: Task): Promise<'claude' | 'codex' | 'gemini'> {
    // Parse file patterns if available
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

    // Build previous attempts from retry count and agent type
    const previousAttempts: AgentAttempt[] = [];
    if (task.retry_count > 0 && task.agent_type) {
      previousAttempts.push({
        agent: task.agent_type as 'claude' | 'codex' | 'gemini',
        result: 'failure',
        timestamp: Date.now()
      });
    }

    // Build selection criteria
    const criteria: AgentSelectionCriteria = {
      taskCategory: task.task_category,
      filePatterns,
      complexity: task.estimated_complexity,
      preferredAgent: task.preferred_agent as 'claude' | 'codex' | 'copilot' | 'gemini' | undefined,
      previousAttempts,
      taskTitle: task.title,
      taskDescription: task.description
    };

    // Use AgentSelector for intelligent selection
    const selection = await this.agentSelector.selectAgent(criteria, task);

    // Handle copilot fallback (not yet supported in Docker execution)
    let chosenAgent: 'claude' | 'codex' | 'gemini';
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
      chosenAgent = (selection.fallbackAgent || 'claude') as 'claude' | 'codex' | 'gemini';
    } else {
      chosenAgent = selection.agent as 'claude' | 'codex' | 'gemini';
    }

    // Log the intelligent selection
    logger.info({
      category: 'automation',
      action: 'intelligent_agent_cli_selected',
      message: `Selected ${chosenAgent} CLI for task: ${selection.reasoning}`,
      details: {
        taskId: task.id,
        agentCli: chosenAgent,
        reasoning: selection.reasoning,
        confidence: selection.confidence,
        category: task.task_category,
        filePatterns,
        complexity: task.estimated_complexity,
        retryCount: task.retry_count
      }
    });

    return chosenAgent;
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

    // Check for manual intervention / escalation tasks
    if (nextTask.assigned_agent === 'human') {
      logger.warn({
        category: 'escalation',
        action: 'manual_intervention_required',
        message: `Task ${nextTask.id} requires manual intervention - skipping automated execution`,
        details: {
          taskId: nextTask.id,
          taskType: nextTask.type,
          title: nextTask.title,
          description: nextTask.description?.substring(0, 200)
        }
      });

      // Mark task as awaiting manual intervention (not failed, not running)
      this.taskQueue.updateTask(nextTask.id, {
        status: 'pending',
        notes: (nextTask.notes || '') + `\n[${new Date().toISOString()}] Escalated to human - awaiting manual intervention`
      });

      // TODO: Send alert/notification when alerting system is implemented
      // For now, log as high-priority warning that monitoring should catch
      logger.warn({
        category: 'alerts',
        action: 'escalation_awaiting_human',
        message: `ALERT: Task ${nextTask.id} requires manual intervention`,
        details: {
          taskId: nextTask.id,
          title: nextTask.title,
          priority: nextTask.priority,
          type: nextTask.type
        }
      });

      // Try next task
      if (onTaskAssigned) onTaskAssigned();
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

    // Validate PR status before execution (prevents work on merged/closed PRs)
    await this.validatePRStatusBeforeExecution(nextTask);

    // Generate task prompt
    const taskContext: TaskContext = {
      task: nextTask,
      agent: agent,
      project: (nextTask as Task & { project?: string }).project || 'dev-monitor',
      worktree: '[dynamic workspace provisioned per task]',
      environment: 'development'
    };

    nextTask.prompt = this.templateManager.generatePrompt(taskContext);

    // Perform intelligent agent CLI type selection (claude/codex/gemini)
    const agentCliType = await this.selectAgentCliType(nextTask);

    // Track worker for cleanup
    let worker: EphemeralWorker | undefined;
    let result: TaskExecutionResult | undefined;
    const executionStartTime = Date.now();

    try {
      // Execute task using ephemeral worker service (replaces legacy docker run)
      logger.info({
        category: 'process',
        action: 'creating_ephemeral_worker',
        message: `Creating ephemeral worker for task ${nextTask.id} with ${agentCliType} CLI`
      });

      if (this.dockerCircuitBreaker) {
        await this.dockerCircuitBreaker.execute(async () => {
          worker = await this.ephemeralWorkerService.createWorker(nextTask, agent, agentCliType);
          result = await this.ephemeralWorkerService.executeTask(worker);
        });
      } else {
        // Fallback if circuit breaker not initialized
        worker = await this.ephemeralWorkerService.createWorker(nextTask, agent, agentCliType);
        result = await this.ephemeralWorkerService.executeTask(worker);
      }

      if (!result) {
        throw new Error('No execution result returned from ephemeral worker');
      }

      const executionDuration = Date.now() - executionStartTime;

      if (result.success) {
        // Task succeeded - mark as complete
        const output = result.output || '';
        const stderr = result.errorOutput || '';

        // Complete task in SQLite with agent CLI type for tracking
        this.taskQueue.completeTask(nextTask.id, output, agentCliType);

        // Generate session summary for documentation
        await this.generateSessionSummary(nextTask, result.exitCode || 0, output, stderr, Date.now());

        logger.info({
          category: 'process',
          action: 'task_completed_successfully',
          message: `Task ${nextTask.id} completed successfully in ${Math.floor(executionDuration / 60000)}m ${Math.floor((executionDuration % 60000) / 1000)}s`,
          details: {
            taskId: nextTask.id,
            agent: agent.id,
            durationMs: executionDuration,
            exitCode: result.exitCode
          }
        });
      } else {
        // Task failed - throw error to trigger recovery
        const errorMsg = result.error?.message || result.errorOutput || 'Task execution failed';
        throw new Error(errorMsg);
      }

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
          action: 'task_execution_failed',
          message: `Task execution failed for ${nextTask.id}:`,
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
    } finally {
      // CRITICAL: Always cleanup worker to prevent container leaks
      if (worker) {
        try {
          await this.ephemeralWorkerService.destroyWorker(worker.id);
          logger.debug({
            category: 'process',
            action: 'worker_cleanup_success',
            message: `Cleaned up worker ${worker.id}`,
            details: { workerId: worker.id, taskId: nextTask.id }
          });
        } catch (cleanupError) {
          logger.error({
            category: 'process',
            action: 'worker_cleanup_failed',
            message: `Failed to cleanup worker ${worker.id}`,
            error: cleanupError,
            details: { workerId: worker.id, taskId: nextTask.id }
          });
        }
      }
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

  /**
   * Generate session summary artifact
   */
  private async generateSessionSummary(
    task: Task,
    exitCode: number,
    stdout: string,
    stderr: string,
    timestamp: number
  ): Promise<void> {
    try {
      // Get artifacts for this task
      const artifacts = this.artifactService.getTaskArtifacts(task.id);
      
      // Generate summary
      const summary = this.sessionSummaryService.generateSummary(
        task,
        exitCode,
        stdout,
        stderr,
        artifacts
      );
      
      // Write to file
      const summaryPath = await this.sessionSummaryService.writeSummary(
        summary,
        this.config.artifactsDir
      );
      
      // Insert into artifacts table
      const runId = `run-${task.id}-${timestamp}`;
      this.artifactService.insertSessionSummary(task.id, runId, summaryPath);
      
      logger.debug({
        category: 'artifact',
        action: 'session_summary_complete',
        message: `Session summary generated for task ${task.id}`,
        details: {
          task_id: task.id,
          summary_path: summaryPath,
        },
      });
    } catch (error) {
      logger.error({
        category: 'artifact',
        action: 'session_summary_generation_failed',
        message: `Failed to generate session summary for task ${task.id}`,
        error,
      });
      // Don't throw - session summary is non-critical
    }
  }
}