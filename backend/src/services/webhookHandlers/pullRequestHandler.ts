/**
 * Pull Request Webhook Handler
 * 
 * Handles pull_request webhook events from GitHub.
 * Processes PR lifecycle events: opened, synchronize, closed, merged, reopened, ready_for_review.
 */

import { logger } from '../../utils/logger.js';
import { BaseWebhookHandler } from './baseHandler.js';
import type { GitHubPullRequestPayload } from './types.js';
import type { Task } from '../taskQueue.sqlite.js';
import type Database from 'better-sqlite3';

/**
 * Handler for GitHub pull_request webhook events
 */
export class PullRequestHandler extends BaseWebhookHandler {
  /**
   * Handle pull_request webhook event
   */
  async handle(payload: GitHubPullRequestPayload): Promise<void> {
    this.stats.pr_events_received++;
    this.updateStatsTimestamp();

    const { action, pull_request, repository } = payload;
    const prNumber = pull_request.number;
    const branchName = pull_request.head.ref;

    // Extract task ID from branch or title
    const taskId = this.extractTaskIdFromBranchOrTitle(branchName, pull_request.title);

    this.logEvent('pull_request', action, {
      pr_number: prNumber,
      task_id: taskId,
      action,
      title: pull_request.title,
      branch: branchName,
      user: pull_request.user.login,
      repo: repository.full_name,
      draft: pull_request.draft,
      merged: pull_request.merged
    });

    // Find associated task(s)
    const tasks = await this.findOrAdoptTasks(prNumber, taskId, pull_request, branchName);
    
    if (tasks.length === 0) {
      return; // Already logged in findOrAdoptTasks
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
      await this.routeToHandler(action, prNumber, pull_request, tasks);
    } catch (error) {
      this.logError('pull_request', action, error, {
        pr_number: prNumber,
        action
      });
      throw error;
    }
  }

  /**
   * Find tasks by PR number or adopt orphaned system PRs
   */
  private async findOrAdoptTasks(
    prNumber: number,
    taskId: string | null,
    pull_request: GitHubPullRequestPayload['pull_request'],
    branchName: string
  ): Promise<Task[]> {
    if (!this.taskQueue) return [];

    // Try to find by PR number first
    let tasks = await this.taskQueue.findByPRNumber(prNumber);
    
    // If not found and we have a task ID from title, try that
    if (tasks.length === 0 && taskId) {
      const task = await this.taskQueue.findByTaskId(taskId);
      if (task) {
        tasks = [task];
      }
    }

    // If still no tasks, check if it's an orphaned system PR
    if (tasks.length === 0 && this.prOrchestrator) {
      return await this.adoptOrphanedSystemPR(prNumber, pull_request, branchName, taskId);
    }

    return tasks;
  }

  /**
   * Adopt orphaned system PR if applicable
   */
  private async adoptOrphanedSystemPR(
    prNumber: number,
    pull_request: GitHubPullRequestPayload['pull_request'],
    branchName: string,
    extractedTaskId: string | null
  ): Promise<Task[]> {
    if (!this.prOrchestrator) return [];

    const prMonitor = this.prOrchestrator.getPRMonitor();
    const detection = prMonitor.detectSystemCreatedPR(
      branchName,
      pull_request.user.login,
      pull_request.title
    );

    if (detection.isSystemPR) {
      // System PR is orphaned - auto-adopt it
      logger.warn({
        category: 'api',
        action: 'system_pr_orphaned',
        message: `System PR #${prNumber} is orphaned - auto-adopting`,
        details: {
          pr_number: prNumber,
          reason: detection.reason,
          extracted_task_id: detection.extractedTaskId
        }
      });

      const adoptedTask = await prMonitor.adoptOrphanedSystemPR(
        prNumber,
        {
          title: pull_request.title,
          branch: branchName,
          author: pull_request.user.login,
          description: (pull_request as { body?: string }).body
        },
        detection.extractedTaskId
      );

      if (adoptedTask) {
        this.stats.orphaned_prs_adopted++;
        logger.info({
          category: 'api',
          action: 'system_pr_adopted',
          message: `Successfully adopted system PR #${prNumber} as task ${adoptedTask.id}`,
          details: {
            pr_number: prNumber,
            task_id: adoptedTask.id
          }
        });
        return [adoptedTask];
      } else {
        logger.error({
          category: 'api',
          action: 'pr_adoption_failed',
          message: `Failed to adopt orphaned system PR #${prNumber}`,
          details: { pr_number: prNumber }
        });
      }
    } else {
      // User-created PR - log but don't auto-adopt
      logger.info({
        category: 'api',
        action: 'user_pr_no_task',
        message: `User PR #${prNumber} has no task (manual tracking available via /api/dev-bots/pr/track)`,
        details: {
          pr_number: prNumber,
          task_id: extractedTaskId,
          detection_reason: detection.reason
        }
      });
    }

    return [];
  }

  /**
   * Route to appropriate sub-handler based on action
   */
  private async routeToHandler(
    action: string,
    prNumber: number,
    pull_request: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
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
  }

  /**
   * Handle PR opened event
   */
  private async handlePROpened(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_opened',
      message: `PR #${prNumber} opened - updating ${tasks.length} task(s)`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    // Set pr_number on tasks if not already set (foreign key reference only)
    for (const task of tasks) {
      if (!task.pr_number) {
        await this.taskQueue.updatePRNumber(task.id, prNumber);
      }
    }
  }

  /**
   * Handle PR synchronize event (new commits pushed)
   */
  private async handlePRSynchronize(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_synchronized',
      message: `PR #${prNumber} updated with new commits`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    // Detect resolved comments (comments that no longer exist after sync)
    await this.detectResolvedComments(prNumber);

    // Evaluate PR conditions after code changes (continuous self-healing)
    await this.evaluateConditions(prNumber, 'pull_request_synchronize');
  }

  /**
   * Detect and track resolved review comments
   */
  private async detectResolvedComments(prNumber: number): Promise<void> {
    if (!this.prOrchestrator) return;

    try {
      const githubPR = this.prOrchestrator.getGitHubPRService();
      const prStatus = await githubPR.getPRStatus(prNumber);

      const currentCommentIds = prStatus.comments.map((c) => c.id);
      const resolvedFingerprints = this.reviewCommentTracker.detectResolvedComments(
        prNumber,
        currentCommentIds
      );

      if (resolvedFingerprints.length > 0) {
        this.stats.review_comments_resolved += resolvedFingerprints.length;

        logger.info({
          category: 'pr-workflow',
          action: 'comments_resolved_detected',
          message: `Detected ${resolvedFingerprints.length} resolved comments for PR #${prNumber}`,
          details: { pr_number: prNumber, resolved_count: resolvedFingerprints.length }
        });

        // Get updated resolution summary
        const summary = this.reviewCommentTracker.getResolutionSummary(prNumber);
        logger.info({
          category: 'pr-workflow',
          action: 'comment_resolution_summary',
          message: `PR #${prNumber} comment status: ${summary.unresolved} unresolved (${summary.unresolvedBlocking} blocking)`,
          details: { pr_number: prNumber, ...summary }
        });
      }
    } catch (error) {
      logger.warn({
        category: 'pr-workflow',
        action: 'comment_resolution_detection_failed',
        message: `Failed to detect resolved comments for PR #${prNumber}`,
        error
      });
    }
  }

  /**
   * Handle PR merged event
   */
  private async handlePRMerged(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_merged',
      message: `PR #${prNumber} merged - marking ${tasks.length} task(s) complete`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      // Mark task as completed if not already
      if (task.status !== 'completed') {
        const completeStmt = (this.taskQueue as unknown as { db: Database.Database }).db.prepare(`
          UPDATE tasks
          SET status = 'completed',
              completed_at = ?
          WHERE id = ?
        `);
        completeStmt.run(Date.now(), task.id);
      }
    }

    // Clean up PR condition state
    if (this.prConditionState) {
      await this.prConditionState.deletePRConditionState(prNumber);
    }
  }

  /**
   * Handle PR closed (without merge) event
   */
  private async handlePRClosed(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_closed',
      message: `PR #${prNumber} closed without merging - cleaning up ${tasks.length} task(s)`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      // Cancel task if it's still pending or running
      if (task.status === 'pending' || task.status === 'running') {
        const completeStmt = (this.taskQueue as unknown as { db: Database.Database }).db.prepare(`
          UPDATE tasks
          SET status = 'cancelled',
              completed_at = ?,
              result = ?
          WHERE id = ?
        `);
        completeStmt.run(
          Date.now(),
          JSON.stringify({ reason: 'PR closed without merging' }),
          task.id
        );
        
        logger.info({
          category: 'pr-workflow',
          action: 'task_cancelled_pr_closed',
          message: `Cancelled task ${task.id} because PR #${prNumber} was closed`,
          details: { task_id: task.id, pr_number: prNumber }
        });
      }
    }

    // Clean up PR condition state
    if (this.prConditionState) {
      await this.prConditionState.deletePRConditionState(prNumber);
    }
  }

  /**
   * Handle PR reopened event
   */
  private async handlePRReopened(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_reopened',
      message: `PR #${prNumber} reopened`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    // Re-evaluate PR conditions when PR is reopened
    await this.evaluateConditions(prNumber, 'pull_request_reopened');
  }

  /**
   * Handle PR ready for review event
   */
  private async handlePRReadyForReview(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_ready_for_review',
      message: `PR #${prNumber} marked ready for review`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    // Re-evaluate PR conditions when PR is marked ready for review
    await this.evaluateConditions(prNumber, 'pull_request_ready_for_review');
  }

  /**
   * Evaluate PR conditions with error handling
   */
  private async evaluateConditions(prNumber: number, trigger: string): Promise<void> {
    if (!this.prConditionState) return;

    const validTriggers = [
      'check_suite',
      'pull_request_review',
      'pull_request_synchronize',
      'push',
      'task_completion',
      'manual_restart',
      'pull_request_reopened',
      'pull_request_ready_for_review'
    ] as const;

    type ValidTrigger = typeof validTriggers[number];
    const isValidTrigger = (t: string): t is ValidTrigger => validTriggers.includes(t as ValidTrigger);

    try {
      if (isValidTrigger(trigger)) {
        await this.prConditionState.evaluateConditions(prNumber, trigger);
      } else {
        logger.warn({
          category: 'pr-workflow',
          action: 'invalid_trigger',
          message: `Invalid trigger type: ${trigger}`,
          details: { pr_number: prNumber, trigger }
        });
      }
    } catch (error) {
      logger.warn({
        category: 'pr-workflow',
        action: 'condition_evaluation_failed',
        message: `Failed to evaluate PR conditions for PR #${prNumber}`,
        error,
        details: { pr_number: prNumber, trigger }
      });
    }
  }
}
