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
import { TaskQueueService, AUTO_ASSIGNED_AGENT } from './taskQueue.sqlite.js';
import { MS_PER_HOUR } from '../constants/timeouts.js';
import type { AgentPersonalityManager, AgentPersonality } from './agentPersonalities.js';
import type { TaskPromptTemplateManager, TaskContext } from './taskPromptTemplates.js';
// WorkspaceOrchestrator removed - we use Docker cp for file systems, not git mirrors
import type { EphemeralWorkerService, EphemeralWorker, TaskExecutionResult, PhaseCompletionResult } from './ephemeralWorker.service.js';
// TaskPersistence removed - using SQLite directly
import type { FailurePattern } from './taskFailureGuards.js';
import { resolveArtifactsDir, resolveLogsDir } from '../utils/repoPaths.js';
import { AgentSelector } from './agentSelector.js';
import { selectAgentCliTypeForTask } from './agentCliSelection.js';
import { TaskClassifier } from './taskClassifier.js';
import { TaskArtifactService } from './taskArtifact.service.js';
import { SessionSummaryService } from './sessionSummary.service.js';
import { MAX_REVIEW_FIX_LOOPS, MAX_PHASE_ATTEMPTS } from './phaseConstants.js';

const execAsync = promisify(exec);

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface TaskExecutionServiceConfig {
  maxConcurrentWorkers: number;
  stuckCheckInterval: number;  // ms
  absoluteMaxDuration: number; // ms
  artifactsDir: string;
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
      absoluteMaxDuration: config.absoluteMaxDuration ?? MS_PER_HOUR,
      artifactsDir: config.artifactsDir ?? resolveArtifactsDir(),
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

  /**
   * Format validation errors into a user-friendly error message.
   * Extracts error details from various error formats and creates a consistent message.
   *
   * @param errors - Array of error strings or undefined
   * @param defaultMessage - Fallback message if no errors provided
   * @returns Formatted error message
   */
  private formatValidationErrors(errors: string[] | undefined, defaultMessage: string = 'Unknown error'): string {
    if (!errors || errors.length === 0) {
      return defaultMessage;
    }
    return errors.join(', ');
  }

  /**
   * Format task execution error message.
   * Extracts error message from various error sources in a consistent way.
   *
   * @param result - Task execution result
   * @param defaultMessage - Fallback message if no error found
   * @returns Formatted error message
   */
  private formatExecutionError(result: TaskExecutionResult, defaultMessage: string = 'Task execution failed'): string {
    return result.error?.message || result.errorOutput || defaultMessage;
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
  // Recovery is now handled within phase execution service

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
    _context?: {
      stderr?: string;
      stdout?: string;
      exitCode?: number;
      failurePattern?: FailurePatternContext | null;
    }
  ): Promise<void> {
    // Mark task as failed in database
    this.taskQueue.failTask(task.id, error);

    // Recovery is now handled by phase execution service
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
    return resolveLogsDir();
  }

  private getQueueMetrics() {
    return this.taskQueue.getQueueMetrics();
  }

  /**
   * Intelligent agent CLI type selection using AgentSelector
   * Determines whether to use claude, codex, or gemini based on task characteristics
   */
  private async ensureAgentAssignment(task: Task): Promise<{ personalityId: string; cliType: 'claude' | 'codex' | 'gemini' }> {
    if (task.assigned_agent && task.assigned_agent !== AUTO_ASSIGNED_AGENT && task.agent_type) {
      return { personalityId: task.assigned_agent, cliType: task.agent_type };
    }

    const selection = await selectAgentCliTypeForTask(this.agentSelector, task, { context: 'assignment' });
    this.taskQueue.updateAgentForTask(task.id, selection.personalityId, selection.cliType);
    task.assigned_agent = selection.personalityId;
    task.agent_type = selection.cliType;
    return selection;
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
        status: 'blocked',
        phase_status: 'blocked',
        chain_status: 'blocked',
        blocked_reason: 'Escalated to human - automation paused',
        blocked_at: Date.now(),
        blocked_by: 'manual_intervention',
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
    const agentAssignment = await this.ensureAgentAssignment(nextTask);
    const requestedAgent = this.agentManager.getPersonality(agentAssignment.personalityId);
    if (!requestedAgent) {
      logger.error({
        category: 'process',
        action: 'agent_not_found',
        message: `No agent found for ${agentAssignment.personalityId}`
      });

      // Fail task and trigger recovery
      await this.failTaskWithRecovery(
        nextTask,
        `Agent not found: ${agentAssignment.personalityId}. Please check agent name is correct.`,
        {
          stderr: `Agent not found: ${agentAssignment.personalityId}`,
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
    const agentCliType = agentAssignment.cliType;

    // Track worker for cleanup
    let worker: EphemeralWorker | undefined;
    let keepContainer = false;
    const executionStartTime = Date.now();

    try {
      // Execute task using ephemeral worker service
      logger.info({
        category: 'process',
        action: 'creating_ephemeral_worker',
        message: `Creating ephemeral worker for task ${nextTask.id} with ${agentCliType} CLI`
      });

      if (this.dockerCircuitBreaker) {
        await this.dockerCircuitBreaker.execute(async () => {
          worker = await this.ephemeralWorkerService.getOrCreateWorker(nextTask, agent, agentCliType);
        });
      } else {
        // Fallback if circuit breaker not initialized
        worker = await this.ephemeralWorkerService.getOrCreateWorker(nextTask, agent, agentCliType);
      }

      if (!worker) {
        throw new Error('Worker not initialized - cannot execute task phases');
      }

      const phaseRunOutcome = await this.runPhasesInWorker({
        task: nextTask,
        worker,
        agent,
        agentCliType,
        executionStartTime
      });

      // Decide whether to keep the container after phase run
      keepContainer = phaseRunOutcome.keepContainer;

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
      keepContainer = false;

      // Try next task
      if (onTaskAssigned) onTaskAssigned();
    } finally {
      // CRITICAL: Always cleanup worker to prevent container leaks
      if (worker && !keepContainer) {
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
   * Execute all remaining phases for a task inside the same container/worker.
   * Keeps task.status=running, only marks complete at Phase 7 when gates pass.
   */
  private async runPhasesInWorker(params: {
    task: Task;
    worker: EphemeralWorker;
    agent: AgentPersonality;
    agentCliType: 'claude' | 'codex' | 'gemini';
    executionStartTime: number;
  }): Promise<{ keepContainer: boolean }> {
    let task = this.taskQueue.getTask(params.task.id) ?? params.task;
    let keepContainer = true;

    for (let safety = 0; safety < 30; safety++) {
      // Refresh prompt for current phase context
      const taskContext: TaskContext = {
        task,
        agent: params.agent,
        project: (task as Task & { project?: string }).project || 'dev-monitor',
        worktree: '[dynamic workspace provisioned per task]',
        environment: 'development'
      };
      task.prompt = this.templateManager.generatePrompt(taskContext);
      params.worker.task = task;

      const result = await this.ephemeralWorkerService.executeTask(params.worker);
      if (!result || !result.success) {
        const errorMsg = this.formatExecutionError(result);
        throw new Error(errorMsg);
      }

      const output = result.output || '';
      const stderr = result.errorOutput || '';

      logger.info({
        category: 'process',
        action: 'task_phase_complete',
        message: `Task ${task.id} phase ${task.phase_index} execution complete, validating`,
        details: {
          taskId: task.id,
          phaseIndex: task.phase_index,
          phaseName: task.phase_name,
          exitCode: result.exitCode
        }
      });

      const phaseValidation = await this.ephemeralWorkerService.completePhaseExecution(
        params.worker,
        output,
        stderr,
        result.exitCode || 0
      );

      // Persist phase execution context for resume capability
      this.taskQueue.updatePhasePayload(task.id, {
        gitBranch: phaseValidation.gitBranch,
        lastExecutionAt: Date.now(),
        artifacts: {
          validationPassed: phaseValidation.passed,
          validationErrors: phaseValidation.errors,
          phaseIndex: task.phase_index,
          phaseName: task.phase_name
        }
      });

      // Review/Fix loop guard to prevent endless churn
      const loopBlocked = await this.handleReviewFixLoop(task, phaseValidation, params.worker);
      if (loopBlocked) {
        return { keepContainer: true };
      }

      if (!phaseValidation.passed) {
        const recovery = phaseValidation.recovery;

        if (recovery?.category === 'retry' || recovery?.category === 'context_update') {
          if (recovery.category === 'context_update' && recovery.diagnosis) {
            this.taskQueue.updateTaskContext(task.id, recovery.diagnosis);
          }
          this.taskQueue.incrementPhaseAttempt(task.id);
          const updated = this.taskQueue.getTask(task.id) ?? task;

          if ((updated.phase_attempts ?? 1) >= MAX_PHASE_ATTEMPTS) {
            this.taskQueue.updateTask(task.id, {
              status: 'blocked',
              phase_status: 'blocked',
              chain_status: 'blocked',
              blocked_reason: `Exceeded max attempts (${MAX_PHASE_ATTEMPTS}) for phase ${task.phase_index}`,
              blocked_at: Date.now(),
              blocked_by: 'attempt_limit'
            });
            params.worker.status = 'blocked';
            await this.ephemeralWorkerService.snapshotWorkspaceForBlocked(params.worker);
            return { keepContainer: true };
          }

          task = updated;
          continue; // immediate retry in same container
        }

        if (recovery?.category === 'chain_blocked') {
          this.taskQueue.updateTask(task.id, {
            status: 'blocked',
            phase_status: 'blocked',
            chain_status: 'blocked',
            blocked_reason: recovery.diagnosis || 'Recovery failed - manual intervention required',
            blocked_at: Date.now(),
            blocked_by: 'recovery_agent'
          });

          if (task.chain_id) {
            this.taskQueue.blockChain(task.chain_id, recovery.diagnosis || 'Unrecoverable failure', 'recovery_agent');
          }

          params.worker.status = 'blocked';
          await this.ephemeralWorkerService.snapshotWorkspaceForBlocked(params.worker);
          return { keepContainer: true };
        }

        if (recovery?.category === 'system_blocked') {
          logger.error({
            category: 'phase',
            action: 'system_blocked',
            message: 'Recovery agent detected system-wide issue',
            details: { taskId: task.id, diagnosis: recovery.diagnosis }
          });
          params.worker.status = 'blocked';
          await this.ephemeralWorkerService.snapshotWorkspaceForBlocked(params.worker);
          return { keepContainer: true };
        }

        // No (or failed) recovery - mark task failed
        const errorDetails = this.formatValidationErrors(phaseValidation.errors);
        this.taskQueue.failTask(task.id, `Phase ${task.phase_index} validation failed: ${errorDetails}`);
        return { keepContainer: false };
      }

      // Phase passed. If PR Shepherding gates are all green, finish.
      if (task.phase_index === 7 && (phaseValidation.allGatesPassing === true || phaseValidation.passed)) {
        this.taskQueue.completeTask(task.id, output, params.agentCliType);
        keepContainer = false;

        await this.generateSessionSummary(task, result.exitCode || 0, output, stderr, Date.now());

        logger.info({
          category: 'process',
          action: 'task_completed_successfully',
          message: `Task ${task.id} completed through Phase 7`,
          details: {
            taskId: task.id,
            agent: params.agent.id,
            durationMs: Date.now() - params.executionStartTime,
            exitCode: result.exitCode,
            phaseValidation: phaseValidation.passed
          }
        });
        return { keepContainer };
      }

      // Move to next phase (DB already advanced inside completePhaseExecution)
      const updatedTask = this.taskQueue.getTask(task.id);
      if (!updatedTask) {
        throw new Error(`Task ${task.id} missing after phase advance`);
      }
      if (updatedTask.status !== 'running') {
        // Task was cancelled/blocked during advance
        return { keepContainer: false };
      }
      task = updatedTask;
    }

    // Safety net to prevent infinite loops
    this.taskQueue.updateTask(task.id, {
      status: 'blocked',
      phase_status: 'blocked',
      blocked_reason: 'Safety stop: exceeded max in-process phase iterations',
      blocked_at: Date.now(),
      blocked_by: 'taskExecutionService'
    });
    params.worker.status = 'blocked';
    await this.ephemeralWorkerService.snapshotWorkspaceForBlocked(params.worker);
    return { keepContainer: true };
  }

  /**
   * Detect and block excessive Review↔Fix loops. Resets when issue count drops.
   * Returns true if the task was blocked.
   */
  private async handleReviewFixLoop(
    task: Task,
    validation: PhaseCompletionResult,
    worker: EphemeralWorker
  ): Promise<boolean> {
    if (task.phase_index !== 3) {
      // Reset loop tracking when leaving the loop
      if (task.phase_payload) {
        this.taskQueue.updatePhasePayload(task.id, { reviewFixLoop: { loopCount: 0, lastIssueCount: 0 } });
      }
      return false;
    }

    const issuesFound = validation.issuesFound === true || validation.passed === false;
    if (!issuesFound) {
      this.taskQueue.updatePhasePayload(task.id, { reviewFixLoop: { loopCount: 0, lastIssueCount: 0 } });
      return false;
    }

    const payload = this.taskQueue.getPhasePayload(task.id);
    const loopState = payload.reviewFixLoop ?? { loopCount: 0, lastIssueCount: Number.MAX_SAFE_INTEGER };
    const hasTotalIssues = (input: unknown): input is { total_issues: number } =>
      typeof input === 'object' &&
      input !== null &&
      'total_issues' in input &&
      typeof (input as { total_issues: unknown }).total_issues === 'number';

    const issueCount =
      (hasTotalIssues(validation.details) && validation.details.total_issues) ??
      (hasTotalIssues(validation.artifacts) && validation.artifacts.total_issues) ??
      (hasTotalIssues(validation) && validation.total_issues) ??
      loopState.lastIssueCount;

    // Reset on progress (fewer issues); otherwise increment
    const progressed = typeof issueCount === 'number' && issueCount < (loopState.lastIssueCount ?? Number.MAX_SAFE_INTEGER);
    const loopCount = progressed ? 0 : (loopState.loopCount ?? 0) + 1;

    this.taskQueue.updatePhasePayload(task.id, {
      reviewFixLoop: {
        loopCount,
        lastIssueCount: typeof issueCount === 'number' ? issueCount : loopState.lastIssueCount
      }
    });

    if (loopCount >= MAX_REVIEW_FIX_LOOPS) {
      this.taskQueue.updateTask(task.id, {
        status: 'blocked',
        phase_status: 'blocked',
        chain_status: 'blocked',
        blocked_reason: `Exceeded Review/Fix loop limit (${MAX_REVIEW_FIX_LOOPS}) without measurable progress`,
        blocked_at: Date.now(),
        blocked_by: 'loop_guard'
      });

      if (task.chain_id) {
        this.taskQueue.blockChain(task.chain_id, 'Exceeded review/fix loop limit', 'loop_guard');
      }

      worker.status = 'blocked';
      await this.ephemeralWorkerService.snapshotWorkspaceForBlocked(worker);

      logger.warn({
        category: 'phase',
        action: 'review_fix_loop_blocked',
        message: `Task ${task.id} blocked after ${loopCount} review/fix iterations`,
        details: { taskId: task.id, loopCount, issueCount }
      });

      return true;
    }

    return false;
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
