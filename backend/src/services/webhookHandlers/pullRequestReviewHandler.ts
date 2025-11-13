/**
 * Pull Request Review Webhook Handler
 * 
 * Handles pull_request_review webhook events from GitHub.
 * Processes Copilot and human reviews, tracks comments, and triggers auto-merge.
 */

import { logger } from '../../utils/logger.js';
import { BaseWebhookHandler } from './baseHandler.js';
import type { GitHubPullRequestReviewPayload } from './types.js';
import type { Task } from '../taskQueue.sqlite.js';
import type { CopilotReviewAnalysis, PRStatus } from '../githubPR.service.js';
import type { PRMonitorService } from '../prMonitor.service.js';
import type { GitHubPRService } from '../githubPR.service.js';

/**
 * Handler for GitHub pull_request_review webhook events
 */
export class PullRequestReviewHandler extends BaseWebhookHandler {
  /**
   * Handle pull_request_review webhook event
   */
  async handle(payload: GitHubPullRequestReviewPayload): Promise<void> {
    this.stats.pr_review_events_received++;
    this.updateStatsTimestamp();
    
    const { action, review, pull_request, repository } = payload;
    
    // Only process 'submitted' reviews
    if (action !== 'submitted') {
      logger.debug({
        category: 'api',
        action: 'review_ignored',
        message: `Review action '${action}' ignored (only processing 'submitted')`,
        details: { action, pr_number: pull_request.number }
      });
      return;
    }

    const prNumber = pull_request.number;
    const reviewer = review.user.login;
    const isCopilot = this.isBotPR(reviewer, review.user.type);

    if (isCopilot) {
      this.stats.copilot_reviews_detected++;
    }

    this.logEvent('review', 'submitted', {
      pr_number: prNumber,
      reviewer,
      review_state: review.state,
      is_copilot: isCopilot,
      repository: repository.full_name
    });

    if (!this.taskQueue || !this.prOrchestrator) {
      logger.warn({
        category: 'api',
        action: 'review_handler_not_ready',
        message: 'Task queue or PR orchestrator not available'
      });
      return;
    }

    // Find associated tasks
    const tasks = await this.taskQueue.findByPRNumber(prNumber);
    if (tasks.length === 0) {
      logger.debug({
        category: 'api',
        action: 'review_no_tasks',
        message: `No tasks found for PR #${prNumber}`,
        details: { pr_number: prNumber }
      });
      return;
    }

    try {
      await this.processReview(prNumber, review, pull_request, repository, tasks, isCopilot);
    } catch (error) {
      this.logError('review', 'processing', error, {
        pr_number: prNumber,
        repository: repository.full_name
      });
    }
  }

  /**
   * Process the review event
   */
  private async processReview(
    prNumber: number,
    review: GitHubPullRequestReviewPayload['review'],
    pull_request: GitHubPullRequestReviewPayload['pull_request'],
    repository: GitHubPullRequestReviewPayload['repository'],
    tasks: Task[],
    isCopilot: boolean
  ): Promise<void> {
    if (!this.prOrchestrator) return;

    const prMonitor = this.prOrchestrator.getPRMonitor();
    const githubPR = this.prOrchestrator.getGitHubPRService();
    
    // Get current PR status and analysis
    const prStatus = await githubPR.getPRStatus(
      prNumber, 
      repository.owner.login, 
      repository.name
    );
    const copilotAnalysis = await githubPR.getCopilotReviewAnalysis(
      prNumber,
      repository.owner.login,
      repository.name
    );

    // Auto-update branch if behind
    await this.autoUpdateBranchIfNeeded(prNumber, prStatus, repository, githubPR);

    // Evaluate PR conditions
    await this.evaluateConditions(prNumber);

    // Store Copilot comments
    if (isCopilot) {
      await this.storeCopilotComments(prNumber, prStatus);
    }

    // Process Copilot review for auto-merge or followup
    if (isCopilot) {
      await this.processCopilotReview(
        prNumber,
        review,
        pull_request,
        prStatus,
        copilotAnalysis,
        tasks,
        prMonitor,
        githubPR
      );
    }
  }

  /**
   * Auto-update branch if behind base
   */
  private async autoUpdateBranchIfNeeded(
    prNumber: number,
    prStatus: PRStatus,
    repository: GitHubPullRequestReviewPayload['repository'],
    githubPR: GitHubPRService
  ): Promise<void> {
    if (prStatus.mergeable_state === 'behind' && prStatus.state === 'OPEN') {
      try {
        logger.info({
          category: 'pr-workflow',
          action: 'auto_update_branch_behind',
          message: `PR #${prNumber} is behind base, attempting automatic branch update`,
          details: { pr_number: prNumber, mergeable_state: prStatus.mergeable_state }
        });
        
        await githubPR.updateBranch(prNumber, repository.owner.login, repository.name);
        
        logger.info({
          category: 'pr-workflow',
          action: 'auto_update_branch_success',
          message: `Successfully updated PR #${prNumber} branch with latest base`,
          details: { pr_number: prNumber }
        });
      } catch (error) {
        logger.warn({
          category: 'pr-workflow',
          action: 'auto_update_branch_failed',
          message: `Failed to auto-update PR #${prNumber} branch`,
          error,
          details: { pr_number: prNumber }
        });
      }
    }
  }

  /**
   * Evaluate PR conditions
   */
  private async evaluateConditions(prNumber: number): Promise<void> {
    if (!this.prConditionState) return;

    try {
      await this.prConditionState.evaluateConditions(prNumber, 'pull_request_review');
    } catch (error) {
      logger.warn({
        category: 'pr-workflow',
        action: 'condition_evaluation_failed',
        message: `Failed to evaluate PR conditions for PR #${prNumber}`,
        error,
        details: { pr_number: prNumber }
      });
    }
  }

  /**
   * Store Copilot review comments for tracking
   */
  private async storeCopilotComments(prNumber: number, prStatus: PRStatus): Promise<void> {
    if (prStatus.comments.length === 0) return;

    const copilotComments = prStatus.comments.filter((c) =>
      c.author.toLowerCase().includes('copilot') || c.author.toLowerCase().includes('bot')
    );

    let storedCount = 0;
    for (const comment of copilotComments) {
      const stored = this.reviewCommentTracker.storeComment({
        pr_number: prNumber,
        comment_id: comment.id,
        file_path: comment.path || undefined,
        line_number: comment.line || undefined,
        body: comment.body,
        created_at: new Date(comment.createdAt).getTime(),
        reviewer: comment.author,
        is_copilot: true
      });
      if (stored) {
        storedCount++;
        this.stats.review_comments_tracked++;
      }
    }

    logger.info({
      category: 'pr-workflow',
      action: 'comments_stored',
      message: `Stored ${storedCount}/${copilotComments.length} Copilot comments for PR #${prNumber}`,
      details: { pr_number: prNumber, stored: storedCount, total: copilotComments.length }
    });
  }

  /**
   * Process Copilot review for followup or auto-merge
   */
  private async processCopilotReview(
    prNumber: number,
    review: GitHubPullRequestReviewPayload['review'],
    pull_request: GitHubPullRequestReviewPayload['pull_request'],
    prStatus: PRStatus,
    copilotAnalysis: CopilotReviewAnalysis,
    tasks: Task[],
    prMonitor: PRMonitorService,
    githubPR: GitHubPRService
  ): Promise<void> {
    logger.info({
      category: 'pr-workflow',
      action: 'copilot_review_completed',
      message: `Copilot review completed for PR #${prNumber}`,
      details: {
        pr_number: prNumber,
        review_state: review.state,
        severity: copilotAnalysis.severity,
        blocking_issues: copilotAnalysis.blockingIssues.length
      }
    });

    const task = tasks[0];

    // Check if we need followup task
    if (prMonitor.shouldCreateFollowup(prNumber, prStatus, copilotAnalysis, task)) {
      await this.createFollowupTask(prNumber, pull_request, prStatus, copilotAnalysis, task, prMonitor);
    } else {
      // Check if can auto-merge
      await this.attemptAutoMerge(prNumber, prStatus, copilotAnalysis, task, prMonitor, githubPR);
    }
  }

  /**
   * Create followup task for Copilot findings
   */
  private async createFollowupTask(
    prNumber: number,
    pull_request: GitHubPullRequestReviewPayload['pull_request'],
    prStatus: PRStatus,
    copilotAnalysis: CopilotReviewAnalysis,
    task: Task,
    prMonitor: PRMonitorService
  ): Promise<void> {
    const prBranch = pull_request.head.ref;

    const followupTask = await prMonitor.createFollowupTask(
      prNumber,
      task.id,
      prBranch,
      prStatus,
      copilotAnalysis
    );

    if (followupTask) {
      this.stats.followup_tasks_created++;
      logger.info({
        category: 'pr-workflow',
        action: 'followup_created_from_copilot_review',
        message: `Created followup task ${followupTask.id} for Copilot findings`,
        details: {
          pr_number: prNumber,
          followup_id: followupTask.id,
          parent_task: task.id,
          severity: copilotAnalysis.severity
        }
      });
    }
  }

  /**
   * Attempt to auto-merge PR after Copilot review
   */
  private async attemptAutoMerge(
    prNumber: number,
    prStatus: PRStatus,
    copilotAnalysis: CopilotReviewAnalysis,
    task: Task,
    prMonitor: PRMonitorService,
    githubPR: GitHubPRService
  ): Promise<void> {
    const canMerge = githubPR.canAutoMerge(prStatus, copilotAnalysis);
    
    if (canMerge.canMerge) {
      this.stats.auto_merge_attempts++;
      const merged = await prMonitor.mergePR(prNumber, task.id);
      
      if (merged) {
        this.stats.auto_merge_successes++;
        logger.info({
          category: 'pr-workflow',
          action: 'pr_auto_merged_after_copilot_review',
          message: `Auto-merged PR #${prNumber} after Copilot approval`,
          details: { pr_number: prNumber, task_id: task.id }
        });
      } else {
        this.stats.auto_merge_failures++;
      }
    } else {
      logger.info({
        category: 'pr-workflow',
        action: 'merge_blocked_after_copilot_review',
        message: `Cannot auto-merge PR #${prNumber}: ${canMerge.reason}`,
        details: { pr_number: prNumber, reason: canMerge.reason }
      });

      // Track block reason
      this.trackMergeBlockReason(canMerge.reason);
    }
  }

  /**
   * Track merge block reasons for metrics
   */
  private trackMergeBlockReason(reason: string): void {
    const existingBlock = this.stats.auto_merge_blocks.find(b => b.reason === reason);
    if (existingBlock) {
      existingBlock.count++;
    } else {
      this.stats.auto_merge_blocks.push({ reason, count: 1 });
    }
  }
}
