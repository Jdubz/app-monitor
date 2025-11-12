/**
 * GitHub Webhook Handler Service
 * 
 * Processes incoming webhooks from GitHub for PR lifecycle management.
 * Handles PR events, check suites, and check runs to update task status,
 * create followup tasks, and trigger auto-merge when appropriate.
 * 
 * Architecture: Modular handler pattern (refactoring in progress)
 * - Types extracted to webhookHandlers/types.ts
 * - Handlers being extracted to dedicated files
 */

import { logger } from '../utils/logger.js';
import type { TaskQueueService, Task } from './taskQueue.sqlite.js';
import type { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';
import type { PRStatus, CopilotReviewAnalysis } from './githubPR.service.js';
import { ReviewCommentTracker } from './reviewCommentTracker.service.js';
import { TaskVerificationService } from './taskVerification.service.js';
import { PRConditionStateService } from './prConditionState.service.js';
import { getDatabase } from './database.js';

// Import types and handlers from modular structure
import type {
  GitHubPullRequestPayload,
  GitHubPushPayload,
  GitHubCheckSuitePR,
  GitHubCheckSuitePayload,
  GitHubCheckRunPayload,
  GitHubPullRequestReviewPayload,
  AutoMergeBlockReason,
  WebhookHandlerStats
} from './webhookHandlers/types.js';
import {
  CheckSuiteHandler,
  CheckRunHandler,
  PushHandler,
  PullRequestHandler,
  PullRequestReviewHandler
} from './webhookHandlers/index.js';

// Re-export for backward compatibility
export type {
  GitHubPullRequestPayload,
  GitHubPushPayload,
  GitHubCheckSuitePR,
  GitHubCheckSuitePayload,
  GitHubCheckRunPayload,
  GitHubPullRequestReviewPayload,
  AutoMergeBlockReason,
  WebhookHandlerStats
};

/**
 * Service for handling GitHub webhook events
 * Phase 2: Integrated with task queue
 * Phase 3: Modularized handlers (in progress)
 */
export class GitHubWebhookHandler {
  private stats: WebhookHandlerStats = {
    pr_events_received: 0,
    pr_review_events_received: 0,
    push_events_received: 0,
    task_ids_extracted: 0,
    copilot_reviews_detected: 0,
    errors: 0,
    last_event_time: 0,

    // PR Workflow Quality Gate Metrics
    auto_merge_attempts: 0,
    auto_merge_successes: 0,
    auto_merge_failures: 0,
    auto_merge_blocks: [],
    followup_tasks_created: 0,
    task_verifications_run: 0,
    task_verifications_passed: 0,
    task_verifications_failed: 0,
    review_comments_tracked: 0,
    review_comments_resolved: 0,
    orphaned_prs_adopted: 0,

    // Time-to-merge tracking
    merge_times: [],
    avg_time_to_merge_ms: undefined
  };

  private reviewCommentTracker: ReviewCommentTracker;
  private taskVerification: TaskVerificationService;
  private prConditionState: PRConditionStateService;

  // Modular webhook handlers
  private checkSuiteHandler: CheckSuiteHandler;
  private checkRunHandler: CheckRunHandler;
  private pushHandler: PushHandler;
  private pullRequestHandler: PullRequestHandler;
  private pullRequestReviewHandler: PullRequestReviewHandler;

  constructor(
    private readonly taskQueue?: TaskQueueService,
    private readonly prOrchestrator?: PRWorkflowOrchestrator
  ) {
    this.reviewCommentTracker = new ReviewCommentTracker(getDatabase());
    this.taskVerification = new TaskVerificationService();
    this.prConditionState = taskQueue ? new PRConditionStateService(taskQueue) : null!;

    // Initialize modular handlers with shared dependencies
    this.checkSuiteHandler = new CheckSuiteHandler(
      this.taskQueue,
      this.prOrchestrator,
      this.prConditionState,
      this.reviewCommentTracker,
      this.taskVerification,
      this.stats
    );
    this.checkRunHandler = new CheckRunHandler(
      this.taskQueue,
      this.prOrchestrator,
      this.prConditionState,
      this.reviewCommentTracker,
      this.taskVerification,
      this.stats
    );
    this.pushHandler = new PushHandler(
      this.taskQueue,
      this.prOrchestrator,
      this.prConditionState,
      this.reviewCommentTracker,
      this.taskVerification,
      this.stats
    );
    this.pullRequestHandler = new PullRequestHandler(
      this.taskQueue,
      this.prOrchestrator,
      this.prConditionState,
      this.reviewCommentTracker,
      this.taskVerification,
      this.stats
    );
    this.pullRequestReviewHandler = new PullRequestReviewHandler(
      this.taskQueue,
      this.prOrchestrator,
      this.prConditionState,
      this.reviewCommentTracker,
      this.taskVerification,
      this.stats
    );
  }
  /**
   * Handle pull request webhook events
   * Delegates to modular PullRequestHandler
   */
  async handlePullRequest(payload: GitHubPullRequestPayload): Promise<void> {
    return this.pullRequestHandler.handle(payload);
  }

  /**
   * Handle push webhook events
   * Delegates to modular PushHandler
   */
  async handlePush(payload: GitHubPushPayload): Promise<void> {
    return this.pushHandler.handle(payload);
  }

  /**
   * Handle check_suite webhook events
   * Delegates to modular CheckSuiteHandler
   */
  async handleCheckSuite(payload: GitHubCheckSuitePayload): Promise<void> {
    return this.checkSuiteHandler.handle(payload);
  }

  /**
   * Handle check_run webhook events
   * Delegates to modular CheckRunHandler
   */
  async handleCheckRun(payload: GitHubCheckRunPayload): Promise<void> {
    return this.checkRunHandler.handle(payload);
  }

  /**
   * Handle pull_request_review webhook events
   * Delegates to modular PullRequestReviewHandler
   */
  async handlePullRequestReview(payload: GitHubPullRequestReviewPayload): Promise<void> {
    return this.pullRequestReviewHandler.handle(payload);
  }

  /**
   * Process check suite completion for a specific PR
   */
  private async processCheckSuiteForPR(
    prNumber: number,
    checkSuite: { conclusion: string | null },
    repository: { owner: { login: string }; name: string; full_name: string }
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
        repository: repository.full_name
      }
    });

    try {
      const prMonitor = this.prOrchestrator.getPRMonitor();
      const githubPR = this.prOrchestrator.getGitHubPRService();
      
      // Get PR status and Copilot analysis
      const prStatus = await githubPR.getPRStatus(prNumber, owner, repo);
      const copilotAnalysis = await githubPR.getCopilotReviewAnalysis(prNumber, owner, repo);

      // Auto-update branch if PR is behind base (before evaluating conditions)
      if (prStatus.mergeable_state === 'behind' && prStatus.state === 'OPEN') {
        try {
          logger.info({
            category: 'pr-workflow',
            action: 'auto_update_branch_behind',
            message: `PR #${prNumber} is behind base, attempting automatic branch update`,
            details: { pr_number: prNumber, mergeable_state: prStatus.mergeable_state }
          });
          
          await githubPR.updateBranch(prNumber, owner, repo);
          
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
          // Continue with normal flow - condition evaluation will create followup task if needed
        }
      }

      // Evaluate PR conditions and spawn fix tasks if needed (continuous self-healing)
      try {
        await this.prConditionState.evaluateConditions(prNumber, 'check_suite');
      } catch (error) {
        logger.warn({
          category: 'pr-workflow',
          action: 'condition_evaluation_failed',
          message: `Failed to evaluate PR conditions for PR #${prNumber}`,
          error,
          details: { pr_number: prNumber }
        });
      }

      // Run task verification when checks pass successfully
      if (conclusion === 'success' && tasks.length > 0) {
        const task = tasks[0];
        try {
          logger.info({
            category: 'pr-workflow',
            action: 'verification_started',
            message: `Running task verification for PR #${prNumber}`,
            details: { pr_number: prNumber, task_id: task.id }
          });

          const verificationResult = await this.taskVerification.verifyTask(
            task,
            '/home/jdubz/Development/app-monitor', // workspace path
            task.output || ''
          );

          // Store verification results in task
          await this.taskQueue.updateTask(task.id, {
            verification_passed: verificationResult.passed,
            verification_results: JSON.stringify(verificationResult),
            verification_timestamp: Date.now()
          });

          // Track verification metrics
          this.stats.task_verifications_run++;
          if (verificationResult.passed) {
            this.stats.task_verifications_passed++;
          } else {
            this.stats.task_verifications_failed++;
          }

          logger.info({
            category: 'pr-workflow',
            action: 'verification_completed',
            message: `Task verification ${verificationResult.passed ? 'PASSED' : 'FAILED'} for PR #${prNumber}`,
            details: {
              pr_number: prNumber,
              task_id: task.id,
              passed: verificationResult.passed,
              overall_score: verificationResult.overallScore,
              acceptance_criteria_met: verificationResult.acceptanceCriteria.percentMet
            }
          });
        } catch (error) {
          logger.warn({
            category: 'pr-workflow',
            action: 'verification_failed',
            message: `Task verification failed for PR #${prNumber}`,
            error,
            details: { pr_number: prNumber, task_id: task.id }
          });
        }
      }

      // Check if we should create a followup task
      const task = tasks[0]; // Use first matching task
      if (prMonitor.shouldCreateFollowup(prNumber, prStatus, copilotAnalysis, task)) {
        // Determine and track specific block reasons
        const blockReasons = this.determineBlockReasons(prNumber, prStatus, copilotAnalysis, task);
        blockReasons.forEach(reason => this.trackAutoMergeBlock(reason));

        // Get PR branch from GitHub API (on-demand)
        const prBranch = prStatus.head_ref || `pr-${prNumber}`;

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
            action: 'followup_task_created_from_check_suite',
            message: `Created followup task ${followupTask.id} for PR #${prNumber}`,
            details: {
              pr_number: prNumber,
              task_id: followupTask.id,
              parent_task: task.id,
              block_reasons: blockReasons
            }
          });
        }
      } else if (conclusion === 'success') {
        // All checks passed - try auto-merge if enabled
        const task = tasks[0];
        this.stats.auto_merge_attempts++;
        const merged = await prMonitor.mergePR(prNumber, task.id);

        if (merged) {
          // Track merge success with time-to-merge
          const prCreatedAt = task.created_at || Date.now();
          this.trackMergeSuccess(prCreatedAt);

          logger.info({
            category: 'pr-workflow',
            action: 'pr_auto_merged_from_check_suite',
            message: `Auto-merged PR #${prNumber} after checks passed`,
            details: { pr_number: prNumber, task_id: task.id }
          });
        } else {
          this.stats.auto_merge_failures++;
          logger.info({
            category: 'pr-workflow',
            action: 'pr_auto_merge_failed',
            message: `Auto-merge failed for PR #${prNumber}`,
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
   * Track auto-merge block reason
   */
  private trackAutoMergeBlock(reason: string): void {
    const existing = this.stats.auto_merge_blocks.find(b => b.reason === reason);
    if (existing) {
      existing.count++;
    } else {
      this.stats.auto_merge_blocks.push({ reason, count: 1 });
    }
  }

  /**
   * Determine and log the specific reason(s) why auto-merge was blocked
   */
  private determineBlockReasons(
    prNumber: number,
    prStatus: PRStatus,
    copilotAnalysis: CopilotReviewAnalysis,
    task?: Task
  ): string[] {
    const reasons: string[] = [];

    // Check for failed checks
    const hasFailedChecks = prStatus.checks.some(c =>
      c.status === 'failure' || c.status === 'error'
    );
    if (hasFailedChecks) {
      reasons.push('Failed CI checks');
    }

    // Check for blocking Copilot issues
    if (copilotAnalysis.severity === 'high' || copilotAnalysis.severity === 'medium') {
      reasons.push(`Copilot ${copilotAnalysis.severity} severity issues`);
    }

    // Check for human change requests
    const hasChangeRequests = prStatus.reviews.some(r =>
      r.state === 'CHANGES_REQUESTED' && !r.author.toLowerCase().includes('copilot')
    );
    if (hasChangeRequests) {
      reasons.push('Human change requests');
    }

    // Check for merge conflicts
    if (prStatus.mergeable === 'CONFLICTING') {
      reasons.push('Merge conflicts');
    }

    // Check for unresolved blocking comments
    const resolutionSummary = this.reviewCommentTracker.getResolutionSummary(prNumber);
    if (resolutionSummary.unresolvedBlocking > 0) {
      reasons.push(`${resolutionSummary.unresolvedBlocking} unresolved blocking comments`);
    }

    // Check for failed task verification
    if (task && task.verification_passed === false) {
      reasons.push('Failed task verification');
    }

    return reasons;
  }

  /**
   * Track successful merge with time-to-merge
   */
  private trackMergeSuccess(prCreatedAt: number): void {
    this.stats.auto_merge_successes++;
    const timeToMerge = Date.now() - prCreatedAt;
    this.stats.merge_times.push(timeToMerge);

    // Keep only last 100 merge times for performance
    if (this.stats.merge_times.length > 100) {
      this.stats.merge_times.shift();
    }
  }

  /**
   * Get webhook handler statistics with calculated metrics
   */
  getStats(): WebhookHandlerStats {
    const stats = { ...this.stats };

    // Calculate average time-to-merge
    if (stats.merge_times.length > 0) {
      const sum = stats.merge_times.reduce((acc, time) => acc + time, 0);
      stats.avg_time_to_merge_ms = Math.round(sum / stats.merge_times.length);
    }

    return stats;
  }

  // ==========================================================================
  // PR Event Handlers
  // ==========================================================================

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
    // NOTE: We don't store pr_url, pr_branch, pr_status - these are fetched from GitHub on-demand
    for (const task of tasks) {
      if (!task.pr_number) {
        await this.taskQueue.updatePRNumber(task.id, prNumber);
      }
    }
  }

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
    if (this.prOrchestrator) {
      try {
        const githubPR = this.prOrchestrator.getGitHubPRService();
        const prStatus = await githubPR.getPRStatus(prNumber);

        const currentCommentIds = prStatus.comments.map(c => c.id);
        const resolvedFingerprints = this.reviewCommentTracker.detectResolvedComments(
          prNumber,
          currentCommentIds
        );

        if (resolvedFingerprints.length > 0) {
          // Track resolved comments
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

    // NOTE: PR status (pending_checks, checks_status) is now tracked via prConditionState, not task table
    // This follows the design principle: "Any information available from GitHub should NOT be stored in our DB"

    // Evaluate PR conditions after code changes (continuous self-healing)
    try {
      await this.prConditionState.evaluateConditions(prNumber, 'pull_request_synchronize');
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

    // NOTE: PR status (merged) and pr_merged_at are available from GitHub, not stored in task table
    // This follows the design principle: "Any information available from GitHub should NOT be stored in our DB"

    for (const task of tasks) {
      // Mark task as completed if not already
      if (task.status !== 'completed') {
        const completeStmt = (this.taskQueue as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db.prepare(`
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

    // NOTE: PR status (closed) is available from GitHub, not stored in task table
    // This follows the design principle: "Any information available from GitHub should NOT be stored in our DB"

    for (const task of tasks) {
      // Cancel/complete task if it's still pending or running
      if (task.status === 'pending' || task.status === 'running') {
        const completeStmt = (this.taskQueue as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db.prepare(`
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

    if (!this.taskQueue) return;

    // NOTE: PR status (pending_checks) is available from GitHub, not stored in task table
    // Re-evaluate PR conditions when PR is reopened
    try {
      await this.prConditionState.evaluateConditions(prNumber, 'pull_request_reopened');
    } catch (error) {
      logger.warn({
        category: 'pr-workflow',
        action: 'condition_evaluation_failed',
        message: `Failed to evaluate PR conditions for reopened PR #${prNumber}`,
        error,
        details: { pr_number: prNumber }
      });
    }
  }

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

    if (!this.taskQueue) return;

    // NOTE: PR status (pending_review) is available from GitHub, not stored in task table
    // Re-evaluate PR conditions when PR is marked ready for review
    try {
      await this.prConditionState.evaluateConditions(prNumber, 'pull_request_ready_for_review');
    } catch (error) {
      logger.warn({
        category: 'pr-workflow',
        action: 'condition_evaluation_failed',
        message: `Failed to evaluate PR conditions for ready-for-review PR #${prNumber}`,
        error,
        details: { pr_number: prNumber }
      });
    }
  }
}
