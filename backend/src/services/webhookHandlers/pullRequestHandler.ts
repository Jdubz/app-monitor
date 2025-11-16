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
import { getPlanStatusUpdater } from '../planStatusUpdater.singleton.js';

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
    const baseRef = pull_request.base.ref;

    // Filter out PRs that don't match dev-bot branch patterns
    if (!this.isDevBotManagedBranch(branchName, baseRef)) {
      logger.debug({
        category: 'api',
        action: 'pr_non_devbot_branch',
        message: `PR #${prNumber} does not match dev-bot branch patterns, ignoring webhook`,
        details: {
          pr_number: prNumber,
          head_ref: branchName,
          base_ref: baseRef,
          action
        }
      });
      return;
    }

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
   * CRITICAL: Cleanup ALL related tasks and stop running containers
   */
  private async handlePRMerged(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_merged',
      message: `PR #${prNumber} merged - performing comprehensive cleanup`,
      details: { pr_number: prNumber, initial_task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    // CRITICAL: Find ALL tasks related to this PR, not just those with pr_number
    const allRelatedTasks = await this.taskQueue.findAllTasksForPR(prNumber);

    logger.info({
      category: 'pr-workflow',
      action: 'pr_cleanup_tasks_found',
      message: `Found ${allRelatedTasks.length} total tasks related to PR #${prNumber}`,
      details: {
        pr_number: prNumber,
        tasks_with_pr_number: tasks.length,
        total_related_tasks: allRelatedTasks.length,
        task_ids: allRelatedTasks.map(t => ({ id: t.id, status: t.status }))
      }
    });

    // Group tasks by status for targeted cleanup
    const runningTasks = allRelatedTasks.filter(t => t.status === 'running');
    const pendingTasks = allRelatedTasks.filter(t => t.status === 'pending');

    // 1. STOP running containers immediately
    if (runningTasks.length > 0) {
      await this.stopRunningContainers(runningTasks, prNumber, 'merged');
    }

    // 2. Cancel pending tasks
    if (pendingTasks.length > 0) {
      await this.cancelPendingTasks(pendingTasks, prNumber, 'merged');
    }

    // 3. Mark original tasks as completed if not already
    const db = (this.taskQueue as unknown as { db: Database.Database }).db;
    for (const task of allRelatedTasks) {
      if (task.status !== 'completed' && task.status !== 'cancelled') {
        const completeStmt = db.prepare(`
          UPDATE tasks
          SET status = 'completed',
              completed_at = ?,
              notes = CASE
                WHEN notes IS NULL THEN ?
                ELSE notes || '\n' || ?
              END
          WHERE id = ?
        `);
        const note = `Auto-completed: PR #${prNumber} merged`;
        completeStmt.run(Date.now(), note, note, task.id);
      }
    }

    // 4. Clean up PR condition state
    if (this.prConditionState) {
      await this.prConditionState.deletePRConditionState(prNumber);
    }

    logger.info({
      category: 'pr-workflow',
      action: 'pr_merged_cleanup_complete',
      message: `PR #${prNumber} merged - cleanup complete`,
      details: {
        pr_number: prNumber,
        stopped_containers: runningTasks.length,
        cancelled_pending: pendingTasks.length,
        total_tasks_cleaned: allRelatedTasks.length
      }
    });

    // Trigger plan status update for all plans linked to this PR
    const planStatusUpdater = getPlanStatusUpdater();
    if (planStatusUpdater) {
      planStatusUpdater.onPRMerged(prNumber).catch((error: unknown) => {
        logger.error({
          category: 'plan',
          action: 'plan_status_update_failed',
          message: `Failed to update plan status after PR merged: ${prNumber}`,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
    }

    // Update issue status to resolved for any issues linked to tasks
    await this.resolveLinkedIssues(allRelatedTasks, prNumber, pr.title);
  }

  /**
   * Resolve issues linked to completed tasks
   */
  private async resolveLinkedIssues(
    tasks: Task[],
    prNumber: number,
    prTitle: string
  ): Promise<void> {
    if (!this.taskQueue) return;

    try {
      // Access the shared database
      const db = (this.taskQueue as unknown as { db: Database.Database }).db;

      for (const task of tasks) {
        // Find issues linked to this task by taskId
        const stmt = db.prepare('SELECT * FROM issues WHERE taskId = ? AND status = ?');
        const issues = stmt.all(task.id, 'assigned') as Array<{ id: string; [key: string]: unknown }>;

        for (const issue of issues) {
          // Mark issue as resolved
          const updateStmt = db.prepare(`
            UPDATE issues
            SET status = ?, resolved = ?, resolution = ?, prNumber = ?
            WHERE id = ?
          `);
          updateStmt.run(
            'resolved',
            new Date().toISOString(),
            prTitle,
            prNumber,
            issue.id
          );

          logger.info({
            category: 'issue-triage',
            action: 'issue_resolved',
            message: `Issue resolved via PR #${prNumber}`,
            details: {
              issue_id: issue.id,
              task_id: task.id,
              pr_number: prNumber,
              pr_title: prTitle,
            },
          });
        }
      }
    } catch (error) {
      logger.error({
        category: 'issue-triage',
        action: 'issue_resolution_failed',
        message: 'Failed to resolve linked issues',
        error,
      });
    }
  }

  /**
   * Handle PR closed (without merge) event
   * CRITICAL: Cleanup ALL related tasks and stop running containers
   */
  private async handlePRClosed(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_closed',
      message: `PR #${prNumber} closed without merging - performing comprehensive cleanup`,
      details: { pr_number: prNumber, initial_task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    // CRITICAL: Find ALL tasks related to this PR
    const allRelatedTasks = await this.taskQueue.findAllTasksForPR(prNumber);

    logger.info({
      category: 'pr-workflow',
      action: 'pr_closed_tasks_found',
      message: `Found ${allRelatedTasks.length} total tasks related to closed PR #${prNumber}`,
      details: {
        pr_number: prNumber,
        total_related_tasks: allRelatedTasks.length,
        task_ids: allRelatedTasks.map(t => ({ id: t.id, status: t.status }))
      }
    });

    // Group tasks by status
    const runningTasks = allRelatedTasks.filter(t => t.status === 'running');
    const pendingTasks = allRelatedTasks.filter(t => t.status === 'pending');

    // 1. STOP running containers immediately
    if (runningTasks.length > 0) {
      await this.stopRunningContainers(runningTasks, prNumber, 'closed');
    }

    // 2. Cancel pending tasks
    if (pendingTasks.length > 0) {
      await this.cancelPendingTasks(pendingTasks, prNumber, 'closed');
    }

    // 3. Clean up PR condition state
    if (this.prConditionState) {
      await this.prConditionState.deletePRConditionState(prNumber);
    }

    logger.info({
      category: 'pr-workflow',
      action: 'pr_closed_cleanup_complete',
      message: `PR #${prNumber} closed - cleanup complete`,
      details: {
        pr_number: prNumber,
        stopped_containers: runningTasks.length,
        cancelled_pending: pendingTasks.length,
        total_tasks_cleaned: allRelatedTasks.length
      }
    });
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

  /**
   * Stop Docker containers for running tasks
   * EVENT-BASED: Triggered when PR is merged or closed
   */
  private async stopRunningContainers(
    runningTasks: Task[],
    prNumber: number,
    reason: 'merged' | 'closed'
  ): Promise<void> {
    if (!this.dockerManager) {
      logger.warn({
        category: 'pr-workflow',
        action: 'no_docker_manager',
        message: 'Cannot stop containers - DockerManager not available',
        details: { pr_number: prNumber, task_count: runningTasks.length }
      });
      return;
    }

    if (!this.taskQueue) return;

    const db = (this.taskQueue as unknown as { db: Database.Database }).db;

    for (const task of runningTasks) {
      if (task.assigned_worker) {
        try {
          await this.dockerManager.stopContainer(task.assigned_worker, 5); // 5 second timeout

          logger.info({
            category: 'pr-workflow',
            action: 'container_stopped_pr_event',
            message: `Stopped container for task ${task.id} (PR #${prNumber} ${reason})`,
            details: {
              task_id: task.id,
              container_id: task.assigned_worker,
              pr_number: prNumber,
              reason
            }
          });

          // Mark task as cancelled after stopping container
          const cancelStmt = db.prepare(`
            UPDATE tasks
            SET status = 'cancelled',
                completed_at = ?,
                notes = ?,
                assigned_worker = NULL
            WHERE id = ?
          `);
          cancelStmt.run(
            Date.now(),
            `Container stopped: PR #${prNumber} ${reason} while task was running`,
            task.id
          );

        } catch (error) {
          logger.error({
            category: 'pr-workflow',
            action: 'stop_container_failed',
            message: `Failed to stop container for task ${task.id}`,
            error,
            details: {
              task_id: task.id,
              container_id: task.assigned_worker,
              pr_number: prNumber
            }
          });
        }
      } else {
        // No worker assigned - just cancel the task
        const cancelStmt = db.prepare(`
          UPDATE tasks
          SET status = 'cancelled',
              completed_at = ?,
              notes = ?
          WHERE id = ?
        `);
        cancelStmt.run(
          Date.now(),
          `Auto-cancelled: PR #${prNumber} ${reason} before task could start`,
          task.id
        );
      }
    }
  }

  /**
   * Cancel pending tasks
   * EVENT-BASED: Triggered when PR is merged or closed
   */
  private async cancelPendingTasks(
    pendingTasks: Task[],
    prNumber: number,
    reason: 'merged' | 'closed'
  ): Promise<void> {
    if (!this.taskQueue) return;

    const db = (this.taskQueue as unknown as { db: Database.Database }).db;

    for (const task of pendingTasks) {
      const cancelStmt = db.prepare(`
        UPDATE tasks
        SET status = 'cancelled',
            completed_at = ?,
            notes = ?
        WHERE id = ?
      `);
      cancelStmt.run(
        Date.now(),
        `Auto-cancelled: PR #${prNumber} ${reason} before task execution`,
        task.id
      );

      logger.info({
        category: 'pr-workflow',
        action: 'task_cancelled_pr_event',
        message: `Cancelled pending task ${task.id} for ${reason} PR #${prNumber}`,
        details: {
          task_id: task.id,
          task_title: task.title,
          pr_number: prNumber,
          reason
        }
      });
    }
  }
}
