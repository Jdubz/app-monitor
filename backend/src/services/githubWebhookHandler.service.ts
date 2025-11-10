/**
 * GitHub Webhook Handler Service
 * 
 * Processes incoming webhooks from GitHub
 * Phase 1: Basic event logging, task ID extraction from PR titles
 * Phase 2: Integration with task queue and PR status updates
 */

import { logger } from '../utils/logger.js';
import type { TaskQueueService } from './taskQueue.sqlite.js';
import type { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';

export interface GitHubPullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: {
      login: string;
      type: string;
    };
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
    };
    draft: boolean;
    merged: boolean;
    merged_at: string | null;
  };
  repository: {
    full_name: string;
  };
}

export interface GitHubPushPayload {
  ref: string;
  before: string;
  after: string;
  commits: Array<{
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
  }>;
  repository: {
    full_name: string;
  };
  pusher: {
    name: string;
  };
}

export interface WebhookHandlerStats {
  pr_events_received: number;
  push_events_received: number;
  task_ids_extracted: number;
  errors: number;
  last_event_time: number;
}

/**
 * Service for handling GitHub webhook events
 * Phase 2: Integrated with task queue
 */
export class GitHubWebhookHandler {
  private stats: WebhookHandlerStats = {
    pr_events_received: 0,
    push_events_received: 0,
    task_ids_extracted: 0,
    errors: 0,
    last_event_time: 0
  };

  constructor(
    private readonly taskQueue?: TaskQueueService,
    private readonly prOrchestrator?: PRWorkflowOrchestrator
  ) {}
  /**
   * Extract task ID from PR title
   * Looks for patterns like:
   * - "Task: task-abc123"
   * - "[task-abc123]"
   * - "task-abc123:"
   * - "(task-abc123)"
   */
  private extractTaskIdFromTitle(title: string): string | null {
    // Pattern 1: "Task: task-xyz" or "Task task-xyz"
    let match = title.match(/Task[:\s]+([a-f0-9-]{8,})/i);
    if (match) return match[1];

    // Pattern 2: "[task-xyz]"
    match = title.match(/\[([a-f0-9-]{8,})\]/);
    if (match) return match[1];

    // Pattern 3: "task-xyz:" at start
    match = title.match(/^([a-f0-9-]{8,}):/);
    if (match) return match[1];

    // Pattern 4: "(task-xyz)"
    match = title.match(/\(([a-f0-9-]{8,})\)/);
    if (match) return match[1];

    // Pattern 5: Just "task-xyz" as a word
    match = title.match(/\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/);
    if (match) return match[1];

    return null;
  }

  /**
   * Handle pull request webhook events
   */
  async handlePullRequest(payload: GitHubPullRequestPayload): Promise<void> {
    this.stats.pr_events_received++;
    this.stats.last_event_time = Date.now();

    const { action, pull_request, repository } = payload;
    const prNumber = pull_request.number;
    const taskId = this.extractTaskIdFromTitle(pull_request.title);

    if (taskId) {
      this.stats.task_ids_extracted++;
    }

    logger.info({
      category: 'api',
      action: 'pr_event_received',
      message: `PR #${prNumber} ${action}${taskId ? ` (Task: ${taskId})` : ''}`,
      details: {
        pr_number: prNumber,
        task_id: taskId,
        action,
        title: pull_request.title,
        user: pull_request.user.login,
        branch: pull_request.head.ref,
        repo: repository.full_name,
        draft: pull_request.draft,
        merged: pull_request.merged
      }
    });

    // Find associated task(s)
    let tasks: any[] = [];
    
    if (this.taskQueue) {
      // Try to find by PR number first
      tasks = await this.taskQueue.findByPRNumber(prNumber);
      
      // If not found and we have a task ID from title, try that
      if (tasks.length === 0 && taskId) {
        const task = await this.taskQueue.findByTaskId(taskId);
        if (task) {
          tasks = [task];
        }
      }
    }

    if (tasks.length === 0) {
      logger.info({
        category: 'api',
        action: 'pr_no_task_found',
        message: `No task found for PR #${prNumber}${taskId ? ` (Task ID: ${taskId})` : ''}`,
        details: { pr_number: prNumber, task_id: taskId }
      });
      return;
    }

    logger.info({
      category: 'api',
      action: 'pr_tasks_found',
      message: `Found ${tasks.length} task(s) for PR #${prNumber}`,
      details: { 
        pr_number: prNumber, 
        task_count: tasks.length,
        task_ids: tasks.map(t => t.id)
      }
    });

    // Handle the PR event
    try {
      switch (action) {
        case 'opened':
          await this.handlePROpened(prNumber, pull_request, tasks);
          break;

        case 'synchronize':
          await this.handlePRSynchronize(prNumber, pull_request, tasks);
          break;

        case 'closed':
          if (pull_request.merged) {
            await this.handlePRMerged(prNumber, pull_request, tasks);
          } else {
            await this.handlePRClosed(prNumber, pull_request, tasks);
          }
          break;

        case 'reopened':
          await this.handlePRReopened(prNumber, pull_request, tasks);
          break;

        case 'ready_for_review':
          await this.handlePRReadyForReview(prNumber, pull_request, tasks);
          break;

        default:
          logger.info({
            category: 'api',
            action: 'pr_event_ignored',
            message: `Ignoring PR action: ${action}`,
            details: { pr_number: prNumber, action }
          });
      }
    } catch (error) {
      this.stats.errors++;
      logger.error({
        category: 'api',
        action: 'pr_event_error',
        message: `Error handling PR #${prNumber} ${action}`,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Handle push webhook events
   */
  async handlePush(payload: GitHubPushPayload): Promise<void> {
    this.stats.push_events_received++;
    this.stats.last_event_time = Date.now();

    const { ref, commits, repository, pusher } = payload;
    const branch = ref.replace('refs/heads/', '');

    logger.info({
      category: 'api',
      action: 'push_event_received',
      message: `Push to ${branch} by ${pusher.name}`,
      details: {
        branch,
        commit_count: commits.length,
        repo: repository.full_name,
        head_commit: commits[0]?.message
      }
    });

    // TODO Phase 2: Implement push event handling
    // - Update task status if commits reference task IDs
    // - Trigger CI/CD for certain branches
    // - Monitor for conflicts with open PRs
  }

  /**
   * Handle check_suite webhook events
   * Triggers followup task creation and auto-merge when checks complete
   */
  async handleCheckSuite(payload: any): Promise<void> {
    this.stats.last_event_time = Date.now();
    
    const { action, check_suite, repository } = payload;
    
    // Only process 'completed' check suites
    if (action !== 'completed') {
      logger.debug({
        category: 'api',
        action: 'check_suite_ignored',
        message: `Check suite action '${action}' ignored (only processing 'completed')`,
        details: { action, conclusion: check_suite?.conclusion }
      });
      return;
    }

    const pullRequests = check_suite?.pull_requests || [];
    if (pullRequests.length === 0) {
      logger.debug({
        category: 'api',
        action: 'check_suite_no_prs',
        message: 'Check suite not associated with any PRs'
      });
      return;
    }

    logger.info({
      category: 'api',
      action: 'check_suite_completed',
      message: `Check suite completed with ${check_suite?.conclusion}`,
      details: {
        conclusion: check_suite?.conclusion,
        pr_count: pullRequests.length,
        pr_numbers: pullRequests.map((pr: any) => pr.number),
        repository: repository?.full_name
      }
    });

    // Process each PR
    for (const pr of pullRequests) {
      await this.processCheckSuiteForPR(pr.number, check_suite, repository);
    }
  }

  /**
   * Handle check_run webhook events
   * Similar to check_suite but for individual check runs
   */
  async handleCheckRun(payload: any): Promise<void> {
    this.stats.last_event_time = Date.now();
    
    const { action, check_run, repository } = payload;
    
    // Only process 'completed' check runs
    if (action !== 'completed') {
      logger.debug({
        category: 'api',
        action: 'check_run_ignored',
        message: `Check run action '${action}' ignored (only processing 'completed')`,
        details: { action, conclusion: check_run?.conclusion }
      });
      return;
    }

    const pullRequests = check_run?.pull_requests || [];
    if (pullRequests.length === 0) {
      logger.debug({
        category: 'api',
        action: 'check_run_no_prs',
        message: 'Check run not associated with any PRs'
      });
      return;
    }

    logger.info({
      category: 'api',
      action: 'check_run_completed',
      message: `Check run '${check_run?.name}' completed with ${check_run?.conclusion}`,
      details: {
        name: check_run?.name,
        conclusion: check_run?.conclusion,
        pr_count: pullRequests.length,
        pr_numbers: pullRequests.map((pr: any) => pr.number),
        repository: repository?.full_name
      }
    });

    // Process each PR - reuse check suite logic since both trigger same workflow
    for (const pr of pullRequests) {
      await this.processCheckSuiteForPR(pr.number, check_run, repository);
    }
  }

  /**
   * Process check suite completion for a specific PR
   */
  private async processCheckSuiteForPR(
    prNumber: number,
    checkSuite: any,
    repository: any
  ): Promise<void> {
    if (!this.taskQueue || !this.prOrchestrator) {
      logger.warn({
        category: 'api',
        action: 'check_suite_handler_not_ready',
        message: 'Task queue or PR orchestrator not available'
      });
      return;
    }

    // Find associated tasks
    const tasks = await this.taskQueue.findByPRNumber(prNumber);
    if (tasks.length === 0) {
      logger.debug({
        category: 'api',
        action: 'check_suite_no_tasks',
        message: `No tasks found for PR #${prNumber}`,
        details: { pr_number: prNumber }
      });
      return;
    }

    const conclusion = checkSuite.conclusion;
    const owner = repository.owner.login;
    const repo = repository.name;
    
    logger.info({
      category: 'pr-workflow',
      action: 'check_suite_processed',
      message: `Processing check suite ${conclusion} for PR #${prNumber}`,
      details: {
        pr_number: prNumber,
        conclusion,
        task_ids: tasks.map(t => t.id),
        repository: repository?.full_name
      }
    });

    try {
      const prMonitor = this.prOrchestrator.getPRMonitor();
      const githubPR = this.prOrchestrator.getGitHubPRService();
      
      // Get PR status and Copilot analysis
      const prStatus = await githubPR.getPRStatus(prNumber, owner, repo);
      const copilotAnalysis = await githubPR.getCopilotReviewAnalysis(prNumber, owner, repo);

      // Check if we should create a followup task
      if (prMonitor.shouldCreateFollowup(prStatus, copilotAnalysis)) {
        const task = tasks[0]; // Use first matching task
        
        // Get PR branch from status
        const prBranch = task.pr_branch || `pr-${prNumber}`;

        const followupTask = await prMonitor.createFollowupTask(
          prNumber,
          task.id,
          prBranch,
          prStatus,
          copilotAnalysis
        );

        if (followupTask) {
          logger.info({
            category: 'pr-workflow',
            action: 'followup_task_created_from_check_suite',
            message: `Created followup task ${followupTask.id} for PR #${prNumber}`,
            details: {
              pr_number: prNumber,
              task_id: followupTask.id,
              parent_task: task.id
            }
          });
        }
      } else if (conclusion === 'success') {
        // All checks passed - try auto-merge if enabled
        const task = tasks[0];
        const merged = await prMonitor.mergePR(prNumber, task.id);
        
        if (merged) {
          logger.info({
            category: 'pr-workflow',
            action: 'pr_auto_merged_from_check_suite',
            message: `Auto-merged PR #${prNumber} after checks passed`,
            details: { pr_number: prNumber, task_id: task.id }
          });
        }
      }
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'check_suite_processing_error',
        message: `Error processing check suite for PR #${prNumber}`,
        error,
        details: { pr_number: prNumber, repository: repository?.full_name }
      });
    }
  }

  /**
   * Get webhook handler statistics
   */
  getStats(): WebhookHandlerStats {
    return { ...this.stats };
  }

  // ==========================================================================
  // PR Event Handlers
  // ==========================================================================

  private async handlePROpened(prNumber: number, pr: any, tasks: any[]): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_opened',
      message: `PR #${prNumber} opened - updating ${tasks.length} task(s)`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_number: prNumber,
        pr_url: pr.html_url,
        pr_branch: pr.head.ref,
        pr_status: pr.draft ? 'creating' : 'pending_checks',
        pr_created_at: Date.now()
      });
    }
  }

  private async handlePRSynchronize(prNumber: number, pr: any, tasks: any[]): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_synchronized',
      message: `PR #${prNumber} updated with new commits`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_status: 'pending_checks',
        pr_checks_status: 'pending'
      });
    }
  }

  private async handlePRMerged(prNumber: number, pr: any, tasks: any[]): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_merged',
      message: `PR #${prNumber} merged - marking ${tasks.length} task(s) complete`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_status: 'merged',
        pr_merged_at: Date.now()
      });

      // Mark task as completed if not already
      if (task.status !== 'completed') {
        const completeStmt = (this.taskQueue as any).db.prepare(`
          UPDATE tasks 
          SET status = 'completed', 
              completed_at = ?
          WHERE id = ?
        `);
        completeStmt.run(Date.now(), task.id);
      }
    }
  }

  private async handlePRClosed(prNumber: number, pr: any, tasks: any[]): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_closed',
      message: `PR #${prNumber} closed without merging`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_status: 'closed'
      });
    }
  }

  private async handlePRReopened(prNumber: number, pr: any, tasks: any[]): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_reopened',
      message: `PR #${prNumber} reopened`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_status: 'pending_checks'
      });
    }
  }

  private async handlePRReadyForReview(prNumber: number, pr: any, tasks: any[]): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_ready_for_review',
      message: `PR #${prNumber} marked ready for review`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_status: 'pending_review'
      });
    }
  }
}
