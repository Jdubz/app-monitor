/**
 * PR Condition State Service
 *
 * Core service for continuous PR self-healing workflow.
 * Evaluates 8 merge conditions and spawns tasks for unmet conditions.
 *
 * Design Philosophy:
 * - NEVER merge unless ALL conditions are met
 * - Each condition spawns specific fix tasks
 * - Duplicate prevention via fingerprinting
 * - Partial fix detection
 * - Event-driven re-evaluation
 *
 * See: docs/plans/CONTINUOUS_PR_SELF_HEALING.md
 */

import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { getDatabase, type DevBotsDatabase } from './database.js';
import { GitHubPRService, getGitHubPRService, type PRStatus } from './githubPR.service.js';
import { ReviewCommentTracker } from './reviewCommentTracker.service.js';
import { TaskQueueService } from './taskQueue.sqlite.js';
import type { Task } from './taskQueue.sqlite.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type ConditionStatus = 'met' | 'unmet' | 'not_ready';

export interface ConditionState {
  status: ConditionStatus;
  issue_fingerprint: string;
  blocking_issues: BlockingIssue[];
  last_checked: number;
}

export interface BlockingIssue {
  type: string;
  description: string;
  file?: string;
  line?: number;
  url?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export interface ActiveFixTask {
  task_id: string;
  created_at: number;
  issue_fingerprint: string;
}

export interface PRConditionState {
  pr_number: number;
  last_evaluated: number;
  last_updated: number;
  merge_eligible: boolean;

  // 8 conditions
  conditions: {
    ci_checks_passing: ConditionState;
    comments_resolved: ConditionState;
    no_merge_conflicts: ConditionState;
    branch_updated: ConditionState;
    no_change_requests: ConditionState;
    task_verification: ConditionState;
    copilot_review_completed: ConditionState;
    final_validation_passed: ConditionState;
  };

  // Active fix tasks indexed by condition_id
  active_fix_tasks: {
    [condition_id: string]: ActiveFixTask[];
  };

  // Final validation state
  final_validation_state: {
    validation_attempts: number;
    last_validation_score: number; // 0-100
    validation_history: ValidationAttempt[];
    human_escalation_triggered: boolean;
  };

  // Audit trail
  condition_history: ConditionChange[];
}

export interface ValidationAttempt {
  attempt_number: number;
  timestamp: number;
  score: number;
  issues_found: ValidationIssue[];
  task_id?: string;
}

export interface ValidationIssue {
  category: 'accuracy' | 'entropy' | 'redundancy' | 'scope_creep' | 'requirements' | 'code_quality';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface ConditionChange {
  condition_id: string;
  timestamp: number;
  old_status: ConditionStatus;
  new_status: ConditionStatus;
  old_fingerprint: string;
  new_fingerprint: string;
  reason: string;
}

export interface ConditionEvaluation {
  condition_id: string;
  status: ConditionStatus;
  fingerprint: string;
  blocking_issues: BlockingIssue[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// PR Condition State Service
// ============================================================================

export class PRConditionStateService {
  private readonly db: DevBotsDatabase;
  private readonly github: GitHubPRService;
  private readonly reviewTracker: ReviewCommentTracker;
  private readonly taskQueue: TaskQueueService;

  // Evaluation locking to prevent race conditions
  private readonly evaluationLocks: Map<number, Promise<void>> = new Map();

  constructor(taskQueue: TaskQueueService) {
    this.db = getDatabase();
    this.github = getGitHubPRService();
    this.reviewTracker = new ReviewCommentTracker(this.db);
    this.taskQueue = taskQueue;

    logger.info({
      category: 'pr-workflow',
      action: 'condition_state_service_initialized',
      message: 'PR Condition State Service initialized'
    });
  }

  // ==========================================================================
  // Core Public Methods
  // ==========================================================================

  /**
   * Evaluate all relevant conditions for a PR based on event type
   * This is the main entry point called from webhook handlers
   *
   * Uses locking to prevent concurrent evaluations from corrupting state
   */
  async evaluateConditions(
    prNumber: number,
    eventType: 'check_suite' | 'pull_request_review' | 'pull_request_synchronize' | 'push' | 'task_completion' | 'manual_restart'
  ): Promise<void> {
    // Check for existing evaluation in progress
    const existingLock = this.evaluationLocks.get(prNumber);
    if (existingLock) {
      logger.info({
        category: 'pr-workflow',
        action: 'evaluation_queued',
        message: `Evaluation for PR #${prNumber} already in progress - waiting for completion`,
        details: { prNumber, eventType }
      });

      // Wait for existing evaluation to complete
      await existingLock;

      logger.info({
        category: 'pr-workflow',
        action: 'evaluation_skipped',
        message: `Previous evaluation completed for PR #${prNumber} - skipping duplicate`,
        details: { prNumber, eventType }
      });
      return;
    }

    // Create lock promise
    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.evaluationLocks.set(prNumber, lockPromise);

    try {
      await this._evaluateConditionsInternal(prNumber, eventType);
    } finally {
      // Always release lock
      this.evaluationLocks.delete(prNumber);
      resolveLock!();
    }
  }

  /**
   * Internal method that performs the actual condition evaluation
   * Should only be called from evaluateConditions (which handles locking)
   */
  private async _evaluateConditionsInternal(
    prNumber: number,
    eventType: 'check_suite' | 'pull_request_review' | 'pull_request_synchronize' | 'push' | 'task_completion' | 'manual_restart'
  ): Promise<void> {
    logger.info({
      category: 'pr-workflow',
      action: 'evaluate_conditions_started',
      message: `Evaluating conditions for PR #${prNumber}`,
      details: { prNumber, eventType }
    });

    // Load or initialize state
    let state = await this.loadPRConditionState(prNumber);
    if (!state) {
      state = await this.initializePRConditionState(prNumber);
    }

    // Update timestamp
    state.last_evaluated = Date.now();

    // Evaluate conditions based on event type (intelligent event-to-condition mapping)
    switch (eventType) {
      case 'check_suite':
        // ONLY evaluate CI checks
        await this.evaluateAndHandleCIChecks(prNumber, state);
        break;

      case 'pull_request_review':
        // ONLY evaluate comments and change requests
        await this.evaluateAndHandleReview(prNumber, state);
        break;

      case 'pull_request_synchronize':
        // Evaluate code-change-related conditions
        await this.evaluateAndHandleSynchronize(prNumber, state);
        break;

      case 'push':
        // ONLY evaluate branch update
        await this.evaluateAndHandleBranchUpdate(prNumber, state);
        break;

      case 'task_completion':
        // Re-evaluate the condition that task was fixing
        await this.evaluateAndHandleTaskCompletion(prNumber, state);
        break;

      case 'manual_restart':
        // FULL RESTART: Evaluate ALL conditions (used when manually restarting hung PRs)
        logger.info({
          category: 'pr-workflow',
          action: 'manual_restart_all_conditions',
          message: `Full condition restart for PR #${prNumber} - evaluating all 8 conditions`
        });
        await this.evaluateAndHandleCIChecks(prNumber, state);
        await this.evaluateAndHandleReview(prNumber, state);
        await this.evaluateAndHandleSynchronize(prNumber, state);
        await this.evaluateAndHandleBranchUpdate(prNumber, state);
        // Task verification and Copilot review will be checked in checkMergeReadiness
        break;
    }

    // Check if ALL conditions are now met (for final validation/merge)
    await this.checkMergeReadiness(prNumber, state);

    // Save updated state
    await this.savePRConditionState(state);

    logger.info({
      category: 'pr-workflow',
      action: 'evaluate_conditions_completed',
      message: `Completed condition evaluation for PR #${prNumber}`,
      details: {
        prNumber,
        merge_eligible: state.merge_eligible,
        conditions_met: this.countMetConditions(state)
      }
    });
  }

  /**
   * Handle task completion event
   * Re-evaluates the condition that the task was fixing
   */
  async handleTaskCompletion(task: Task): Promise<void> {
    if (!task.followup_for_pr) {
      return; // Not a PR fix task
    }

    const prNumber = task.followup_for_pr;

    logger.info({
      category: 'pr-workflow',
      action: 'task_completion_handling',
      message: `Handling task completion for PR #${prNumber}`,
      details: { taskId: task.id, prNumber, task_type: task.type }
    });

    // Evaluate conditions to see if issue was fixed
    await this.evaluateConditions(prNumber, 'task_completion');
  }

  /**
   * Get all tracked PR numbers
   * Used for push events to trigger re-evaluation of all tracked PRs
   */
  async getAllTrackedPRNumbers(): Promise<number[]> {
    try {
      const rows = this.db.getConnection().prepare(
        'SELECT pr_number FROM pr_condition_states ORDER BY pr_number'
      ).all() as Array<{ pr_number: number }>;

      return rows.map(row => row.pr_number);
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'get_tracked_prs_failed',
        message: 'Failed to get tracked PR numbers',
        error
      });
      return [];
    }
  }

  /**
   * Delete PR condition state from database
   * Called when PR is closed or merged
   */
  async deletePRConditionState(prNumber: number): Promise<void> {
    try {
      this.db.getConnection().prepare(
        'DELETE FROM pr_condition_states WHERE pr_number = ?'
      ).run(prNumber);

      logger.info({
        category: 'pr-workflow',
        action: 'pr_state_deleted',
        message: `Deleted condition state for PR #${prNumber}`,
        details: { prNumber }
      });
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'delete_state_failed',
        message: `Failed to delete condition state for PR #${prNumber}`,
        error,
        details: { prNumber }
      });
    }
  }

  // ==========================================================================
  // Event-Specific Handlers
  // ==========================================================================

  /**
   * Handle check_suite event - ONLY evaluate CI checks
   */
  private async evaluateAndHandleCIChecks(prNumber: number, state: PRConditionState): Promise<void> {
    const evaluation = await this.evaluateCIChecksCondition(prNumber);

    await this.handleConditionChange(prNumber, state, 'ci_checks_passing', evaluation);
  }

  /**
   * Handle pull_request_review event - ONLY evaluate comments and change requests
   */
  private async evaluateAndHandleReview(prNumber: number, state: PRConditionState): Promise<void> {
    // Evaluate comments
    const commentsEval = await this.evaluateCommentsCondition(prNumber);
    await this.handleConditionChange(prNumber, state, 'comments_resolved', commentsEval);

    // Evaluate change requests
    const changeRequestsEval = await this.evaluateChangeRequestsCondition(prNumber);
    await this.handleConditionChange(prNumber, state, 'no_change_requests', changeRequestsEval);
  }

  /**
   * Handle pull_request.synchronize event - Evaluate code-change-related conditions
   */
  private async evaluateAndHandleSynchronize(prNumber: number, state: PRConditionState): Promise<void> {
    state.last_updated = Date.now();

    // Evaluate conditions that code changes might affect
    const commentsEval = await this.evaluateCommentsCondition(prNumber);
    await this.handleConditionChange(prNumber, state, 'comments_resolved', commentsEval);

    const conflictsEval = await this.evaluateMergeConflictsCondition(prNumber);
    await this.handleConditionChange(prNumber, state, 'no_merge_conflicts', conflictsEval);

    const branchEval = await this.evaluateBranchUpdateCondition(prNumber);
    await this.handleConditionChange(prNumber, state, 'branch_updated', branchEval);

    // NOTE: Do NOT evaluate CI checks here - wait for check_suite.completed event
  }

  /**
   * Handle push to base branch - ONLY evaluate branch update
   */
  private async evaluateAndHandleBranchUpdate(prNumber: number, state: PRConditionState): Promise<void> {
    const evaluation = await this.evaluateBranchUpdateCondition(prNumber);
    await this.handleConditionChange(prNumber, state, 'branch_updated', evaluation);
  }

  /**
   * Handle task completion - Re-evaluate all conditions to detect partial fixes
   */
  private async evaluateAndHandleTaskCompletion(prNumber: number, state: PRConditionState): Promise<void> {
    // Re-evaluate ALL conditions to see what changed
    const evaluations = await Promise.all([
      this.evaluateCIChecksCondition(prNumber),
      this.evaluateCommentsCondition(prNumber),
      this.evaluateMergeConflictsCondition(prNumber),
      this.evaluateBranchUpdateCondition(prNumber),
      this.evaluateChangeRequestsCondition(prNumber),
      this.evaluateTaskVerificationCondition(prNumber),
      this.evaluateCopilotReviewCondition(prNumber)
    ]);

    const conditionIds = [
      'ci_checks_passing',
      'comments_resolved',
      'no_merge_conflicts',
      'branch_updated',
      'no_change_requests',
      'task_verification',
      'copilot_review_completed'
    ];

    for (let i = 0; i < evaluations.length; i++) {
      await this.handleConditionChange(prNumber, state, conditionIds[i] as keyof PRConditionState['conditions'], evaluations[i]);
    }
  }

  // ==========================================================================
  // Condition Evaluators
  // ==========================================================================

  /**
   * Evaluate Condition 1: CI Checks Passing
   */
  private async evaluateCIChecksCondition(prNumber: number): Promise<ConditionEvaluation> {
    try {
      const prStatus = await this.github.getPRStatus(prNumber);
      const checks = prStatus.checks;

      // Find failing checks
      const failingChecks = checks.filter(check =>
        check.status === 'failure' || check.status === 'error'
      );

      if (failingChecks.length === 0) {
        // All checks passing
        return {
          condition_id: 'ci_checks_passing',
          status: 'met',
          fingerprint: 'all-checks-passing',
          blocking_issues: []
        };
      }

      // Build blocking issues
      const blocking_issues: BlockingIssue[] = failingChecks.map(check => ({
        type: 'failing_check',
        description: `CI check failed: ${check.name}`,
        url: check.detailsUrl || undefined,
        severity: 'high' as const
      }));

      // Generate fingerprint from failing check names
      const fingerprint = this.generateFingerprintFromList(
        failingChecks.map(c => c.name).sort()
      );

      return {
        condition_id: 'ci_checks_passing',
        status: 'unmet',
        fingerprint,
        blocking_issues,
        metadata: { failing_checks: failingChecks }
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_ci_checks_failed',
        message: `Failed to evaluate CI checks for PR #${prNumber}`,
        error
      });

      return {
        condition_id: 'ci_checks_passing',
        status: 'not_ready',
        fingerprint: 'evaluation-error',
        blocking_issues: [{
          type: 'evaluation_error',
          description: 'Failed to fetch CI check status',
          severity: 'high'
        }]
      };
    }
  }

  /**
   * Evaluate Condition 2: Comments Resolved
   */
  private async evaluateCommentsCondition(prNumber: number): Promise<ConditionEvaluation> {
    try {
      // Get unresolved comments from tracker
      const comments = this.reviewTracker.getCommentsForPR(prNumber, false); // false = unresolved only
      const blockingComments = comments.filter(c => c.severity === 'blocking');

      if (blockingComments.length === 0) {
        return {
          condition_id: 'comments_resolved',
          status: 'met',
          fingerprint: 'no-blocking-comments',
          blocking_issues: []
        };
      }

      // Build blocking issues
      const blocking_issues: BlockingIssue[] = blockingComments.map(comment => ({
        type: 'unresolved_comment',
        description: comment.body.substring(0, 150) + (comment.body.length > 150 ? '...' : ''),
        file: comment.file_path || undefined,
        line: comment.line_number || undefined,
        severity: 'high' as const
      }));

      // Generate fingerprint from comment fingerprints
      const fingerprint = this.generateFingerprintFromList(
        blockingComments.map(c => c.fingerprint).sort()
      );

      return {
        condition_id: 'comments_resolved',
        status: 'unmet',
        fingerprint,
        blocking_issues,
        metadata: { comment_count: blockingComments.length }
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_comments_failed',
        message: `Failed to evaluate comments for PR #${prNumber}`,
        error
      });

      return {
        condition_id: 'comments_resolved',
        status: 'not_ready',
        fingerprint: 'evaluation-error',
        blocking_issues: []
      };
    }
  }

  /**
   * Evaluate Condition 3: No Merge Conflicts
   */
  private async evaluateMergeConflictsCondition(prNumber: number): Promise<ConditionEvaluation> {
    try {
      const prStatus = await this.github.getPRStatus(prNumber);

      if (prStatus.mergeable === 'MERGEABLE') {
        return {
          condition_id: 'no_merge_conflicts',
          status: 'met',
          fingerprint: 'mergeable',
          blocking_issues: []
        };
      }

      if (prStatus.mergeable === 'CONFLICTING') {
        return {
          condition_id: 'no_merge_conflicts',
          status: 'unmet',
          fingerprint: 'has-conflicts',
          blocking_issues: [{
            type: 'merge_conflicts',
            description: 'PR has merge conflicts that must be resolved',
            severity: 'high'
          }]
        };
      }

      // UNKNOWN state
      return {
        condition_id: 'no_merge_conflicts',
        status: 'not_ready',
        fingerprint: 'unknown-mergeable-state',
        blocking_issues: []
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_conflicts_failed',
        message: `Failed to evaluate merge conflicts for PR #${prNumber}`,
        error
      });

      return {
        condition_id: 'no_merge_conflicts',
        status: 'not_ready',
        fingerprint: 'evaluation-error',
        blocking_issues: []
      };
    }
  }

  /**
   * Evaluate Condition 4: Branch Updated
   */
  private async evaluateBranchUpdateCondition(prNumber: number): Promise<ConditionEvaluation> {
    try {
      const prStatus = await this.github.getPRStatus(prNumber);

      // Check mergeable_state for "behind" indicator
      if (prStatus.mergeable_state === 'behind') {
        return {
          condition_id: 'branch_updated',
          status: 'unmet',
          fingerprint: 'behind-base',
          blocking_issues: [{
            type: 'branch_behind',
            description: 'PR branch is behind base branch and needs to be updated',
            severity: 'medium'
          }]
        };
      }

      // Check for clean/unstable states (up-to-date)
      if (prStatus.mergeable_state === 'clean' || prStatus.mergeable_state === 'unstable') {
        return {
          condition_id: 'branch_updated',
          status: 'met',
          fingerprint: 'up-to-date',
          blocking_issues: []
        };
      }

      // Unknown or blocked state
      return {
        condition_id: 'branch_updated',
        status: 'not_ready',
        fingerprint: `state-${prStatus.mergeable_state || 'unknown'}`,
        blocking_issues: []
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_branch_update_failed',
        message: `Failed to evaluate branch update for PR #${prNumber}`,
        error
      });

      return {
        condition_id: 'branch_updated',
        status: 'not_ready',
        fingerprint: 'evaluation-error',
        blocking_issues: []
      };
    }
  }

  /**
   * Evaluate Condition 5: No Change Requests
   */
  private async evaluateChangeRequestsCondition(prNumber: number): Promise<ConditionEvaluation> {
    try {
      const prStatus = await this.github.getPRStatus(prNumber);
      const reviews = prStatus.reviews;

      // Find latest review from each reviewer
      const latestReviews = new Map<string, typeof reviews[0]>();
      reviews.forEach(review => {
        const existing = latestReviews.get(review.author);
        if (!existing || new Date(review.submittedAt) > new Date(existing.submittedAt)) {
          latestReviews.set(review.author, review);
        }
      });

      // Check for change requests
      const changeRequests = Array.from(latestReviews.values()).filter(
        r => r.state === 'CHANGES_REQUESTED'
      );

      if (changeRequests.length === 0) {
        return {
          condition_id: 'no_change_requests',
          status: 'met',
          fingerprint: 'no-change-requests',
          blocking_issues: []
        };
      }

      // Build blocking issues
      const blocking_issues: BlockingIssue[] = changeRequests.map(review => ({
        type: 'change_requested',
        description: `${review.author} requested changes: ${review.body.substring(0, 150)}`,
        severity: 'high' as const
      }));

      const fingerprint = this.generateFingerprintFromList(
        changeRequests.map(r => `${r.author}:${r.submittedAt}`).sort()
      );

      return {
        condition_id: 'no_change_requests',
        status: 'unmet',
        fingerprint,
        blocking_issues
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_change_requests_failed',
        message: `Failed to evaluate change requests for PR #${prNumber}`,
        error
      });

      return {
        condition_id: 'no_change_requests',
        status: 'not_ready',
        fingerprint: 'evaluation-error',
        blocking_issues: []
      };
    }
  }

  /**
   * Evaluate Condition 6: Task Verification
   */
  private async evaluateTaskVerificationCondition(prNumber: number): Promise<ConditionEvaluation> {
    try {
      // Find the task associated with this PR
      const tasks = await this.taskQueue.findByPRNumber(prNumber);
      const task = tasks[0] || null;

      if (!task) {
        // No task found - this might be a manual PR
        return {
          condition_id: 'task_verification',
          status: 'met',
          fingerprint: 'no-task-manual-pr',
          blocking_issues: []
        };
      }

      // Check if task has verification results
      if (task.verification_passed === true) {
        return {
          condition_id: 'task_verification',
          status: 'met',
          fingerprint: 'verification-passed',
          blocking_issues: []
        };
      }

      if (task.verification_passed === false) {
        // Parse verification results if available
        let verificationDetails = 'Task verification failed';
        if (task.verification_results) {
          try {
            const results = JSON.parse(task.verification_results);
            verificationDetails = results.recommendations?.join('; ') || verificationDetails;
          } catch {
            // Ignore parse error
          }
        }

        return {
          condition_id: 'task_verification',
          status: 'unmet',
          fingerprint: 'verification-failed',
          blocking_issues: [{
            type: 'verification_failed',
            description: verificationDetails,
            severity: 'high'
          }]
        };
      }

      // Verification not yet run or pending
      return {
        condition_id: 'task_verification',
        status: 'not_ready',
        fingerprint: 'verification-pending',
        blocking_issues: []
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_task_verification_failed',
        message: `Failed to evaluate task verification for PR #${prNumber}`,
        error
      });

      return {
        condition_id: 'task_verification',
        status: 'not_ready',
        fingerprint: 'evaluation-error',
        blocking_issues: []
      };
    }
  }

  /**
   * Evaluate Condition 7: Copilot Review Completed
   */
  private async evaluateCopilotReviewCondition(prNumber: number): Promise<ConditionEvaluation> {
    try {
      const prStatus = await this.github.getPRStatus(prNumber);
      const reviews = prStatus.reviews;

      // Check for Copilot reviews
      const copilotReviews = reviews.filter(review =>
        review.author.toLowerCase().includes('copilot') ||
        review.author.toLowerCase().includes('github-advanced-security')
      );

      if (copilotReviews.length > 0) {
        return {
          condition_id: 'copilot_review_completed',
          status: 'met',
          fingerprint: 'copilot-reviewed',
          blocking_issues: []
        };
      }

      // No Copilot review yet
      return {
        condition_id: 'copilot_review_completed',
        status: 'unmet',
        fingerprint: 'awaiting-copilot',
        blocking_issues: [{
          type: 'copilot_review_pending',
          description: 'Awaiting Copilot review',
          severity: 'medium'
        }]
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_copilot_review_failed',
        message: `Failed to evaluate Copilot review for PR #${prNumber}`,
        error
      });

      return {
        condition_id: 'copilot_review_completed',
        status: 'not_ready',
        fingerprint: 'evaluation-error',
        blocking_issues: []
      };
    }
  }

  /**
   * Evaluate Condition 8: Final Validation Passed
   * Only evaluated when ALL other conditions are met
   */
  private async evaluateFinalValidationCondition(prNumber: number, state: PRConditionState): Promise<ConditionEvaluation> {
    // Check if all OTHER conditions are met
    const otherConditions = [
      'ci_checks_passing',
      'comments_resolved',
      'no_merge_conflicts',
      'branch_updated',
      'no_change_requests',
      'task_verification',
      'copilot_review_completed'
    ] as const;

    const allOtherMet = otherConditions.every(
      conditionId => state.conditions[conditionId].status === 'met'
    );

    if (!allOtherMet) {
      return {
        condition_id: 'final_validation_passed',
        status: 'not_ready',
        fingerprint: 'waiting-for-other-conditions',
        blocking_issues: []
      };
    }

    // Check if validation already passed
    if (state.final_validation_state.human_escalation_triggered) {
      return {
        condition_id: 'final_validation_passed',
        status: 'unmet',
        fingerprint: 'escalated-to-human',
        blocking_issues: [{
          type: 'human_review_required',
          description: 'Failed validation twice - manual review required',
          severity: 'critical'
        }]
      };
    }

    // Check if validation task exists and passed
    const prTasks = await this.taskQueue.findByPRNumber(prNumber);
    const validationTasks = prTasks.filter(t => t.type === 'pr-validation');
    const latestValidation = validationTasks.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];

    if (latestValidation?.status === 'completed' && latestValidation.verification_passed) {
      // Validation passed
      try {
        const results = JSON.parse(latestValidation.verification_results || '{}');
        const score = results.score || 0;

        return {
          condition_id: 'final_validation_passed',
          status: score >= 80 ? 'met' : 'unmet',
          fingerprint: score >= 80 ? 'validation-passed' : `validation-failed-score-${score}`,
          blocking_issues: score >= 80 ? [] : [{
            type: 'validation_failed',
            description: `Validation score ${score}/100 (threshold: 80)`,
            severity: 'high'
          }],
          metadata: { score, validation_task_id: latestValidation.id }
        };
      } catch {
        // Parse error
      }
    }

    // Need validation
    return {
      condition_id: 'final_validation_passed',
      status: 'unmet',
      fingerprint: `validation-needed-attempt-${state.final_validation_state.validation_attempts}`,
      blocking_issues: [{
        type: 'needs_comprehensive_review',
        description: 'All conditions met - needs final validation review',
        severity: 'medium'
      }]
    };
  }

  // ==========================================================================
  // Condition Change Handling & Task Spawning
  // ==========================================================================

  /**
   * Handle condition state change and spawn tasks if needed
   */
  private async handleConditionChange(
    prNumber: number,
    state: PRConditionState,
    conditionId: keyof PRConditionState['conditions'],
    evaluation: ConditionEvaluation
  ): Promise<void> {
    const previousState = state.conditions[conditionId];
    const previousFingerprint = previousState?.issue_fingerprint || '';
    const currentFingerprint = evaluation.fingerprint;

    // Check if condition state changed
    if (previousState && previousState.status === evaluation.status && previousFingerprint === currentFingerprint) {
      // No change - skip
      return;
    }

    // Log condition change
    logger.info({
      category: 'pr-workflow',
      action: 'condition_changed',
      message: `Condition ${conditionId} changed for PR #${prNumber}`,
      details: {
        prNumber,
        conditionId,
        old_status: previousState?.status || 'none',
        new_status: evaluation.status,
        old_fingerprint: previousFingerprint,
        new_fingerprint: currentFingerprint
      }
    });

    // Record change in history
    if (previousState) {
      state.condition_history.push({
        condition_id: conditionId,
        timestamp: Date.now(),
        old_status: previousState.status,
        new_status: evaluation.status,
        old_fingerprint: previousFingerprint,
        new_fingerprint: currentFingerprint,
        reason: evaluation.blocking_issues[0]?.description || 'Condition re-evaluated'
      });
    }

    // Update condition state
    state.conditions[conditionId] = {
      status: evaluation.status,
      issue_fingerprint: currentFingerprint,
      blocking_issues: evaluation.blocking_issues,
      last_checked: Date.now()
    };

    // Handle task spawning/completion based on new status
    if (evaluation.status === 'met') {
      // Condition now met - mark active tasks as complete
      await this.markActiveTasksComplete(state, conditionId);
    } else if (evaluation.status === 'unmet') {
      // Condition unmet - check if we need to spawn a task
      await this.spawnTaskIfNeeded(prNumber, state, conditionId, evaluation);
    }
  }

  /**
   * Spawn task if needed (checks for duplicates and partial fixes)
   */
  private async spawnTaskIfNeeded(
    prNumber: number,
    state: PRConditionState,
    conditionId: keyof PRConditionState['conditions'],
    evaluation: ConditionEvaluation
  ): Promise<void> {
    const currentFingerprint = evaluation.fingerprint;
    const activeTasks = state.active_fix_tasks[conditionId] || [];

    // Check if we already have an active task for this exact fingerprint
    const existingTask = activeTasks.find(t => t.issue_fingerprint === currentFingerprint);
    if (existingTask) {
      logger.debug({
        category: 'pr-workflow',
        action: 'task_already_exists',
        message: `Task already exists for ${conditionId} with fingerprint ${currentFingerprint}`,
        details: { prNumber, conditionId, task_id: existingTask.task_id }
      });
      return; // Duplicate prevention
    }

    // Check for partial fix (had a task for different fingerprint, now different issues)
    const hadActiveTask = activeTasks.length > 0;
    const fingerprintChanged = hadActiveTask && activeTasks[0].issue_fingerprint !== currentFingerprint;

    if (fingerprintChanged) {
      logger.info({
        category: 'pr-workflow',
        action: 'partial_fix_detected',
        message: `Partial fix detected for ${conditionId} in PR #${prNumber}`,
        details: {
          prNumber,
          conditionId,
          old_fingerprint: activeTasks[0].issue_fingerprint,
          new_fingerprint: currentFingerprint
        }
      });
    }

    // Spawn task based on condition type
    await this.spawnFixTask(prNumber, state, conditionId, evaluation);
  }

  /**
   * Spawn fix task for a specific condition
   */
  private async spawnFixTask(
    prNumber: number,
    state: PRConditionState,
    conditionId: keyof PRConditionState['conditions'],
    evaluation: ConditionEvaluation
  ): Promise<void> {
    // Get PR data for context
    const prStatus = await this.github.getPRStatus(prNumber);
    const parentTasks = await this.taskQueue.findByPRNumber(prNumber);
    const parentTask = parentTasks[0] || null;

    // Build task description based on condition type
    const taskConfig = this.buildFixTaskConfig(prNumber, conditionId, evaluation, prStatus, parentTask);

    // Create task via existing task queue
    const task = await this.taskQueue.createTask(taskConfig);

    logger.info({
      category: 'pr-workflow',
      action: 'fix_task_spawned',
      message: `Spawned fix task for ${conditionId} in PR #${prNumber}`,
      details: {
        prNumber,
        conditionId,
        task_id: task.id,
        fingerprint: evaluation.fingerprint
      }
    });

    // Track active task
    if (!state.active_fix_tasks[conditionId]) {
      state.active_fix_tasks[conditionId] = [];
    }

    state.active_fix_tasks[conditionId].push({
      task_id: task.id,
      created_at: Date.now(),
      issue_fingerprint: evaluation.fingerprint
    });
  }

  /**
   * Build task configuration for fix task
   */
  private buildFixTaskConfig(
    prNumber: number,
    conditionId: string,
    evaluation: ConditionEvaluation,
    prStatus: PRStatus,
    parentTask: Task | null
  ): Partial<Task> {
    const baseConfig = {
      followup_for_pr: prNumber,
      pr_branch: parentTask?.pr_branch || `pr-${prNumber}`,
      priority: 9,
      parent_initiative: parentTask?.id
    };

    switch (conditionId) {
      case 'ci_checks_passing':
        return {
          ...baseConfig,
          type: 'bugfix',
          task_category: 'implementation',
          title: `Fix failing CI checks in PR #${prNumber}`,
          description: this.buildCICheckFixDescription(prNumber, evaluation, prStatus),
          acceptance_criteria: [
            'All CI checks pass',
            ...evaluation.blocking_issues.map(issue => `Fix: ${issue.description}`)
          ]
        };

      case 'comments_resolved':
        return {
          ...baseConfig,
          type: 'review-feedback',
          task_category: 'implementation',
          title: `Address review comments in PR #${prNumber}`,
          description: this.buildCommentFixDescription(prNumber, evaluation),
          acceptance_criteria: [
            `All ${evaluation.blocking_issues.length} blocking comment(s) addressed`,
            'Code changes pushed to existing PR branch'
          ]
        };

      case 'no_merge_conflicts':
        return {
          ...baseConfig,
          type: 'maintenance',
          task_category: 'implementation',
          title: `Resolve merge conflicts in PR #${prNumber}`,
          description: this.buildConflictFixDescription(prNumber, prStatus),
          acceptance_criteria: [
            'All merge conflicts resolved',
            'PR mergeable state is MERGEABLE'
          ]
        };

      case 'branch_updated':
        return {
          ...baseConfig,
          type: 'maintenance',
          task_category: 'implementation',
          title: `Update PR #${prNumber} with latest main`,
          description: this.buildBranchUpdateDescription(prNumber, prStatus),
          acceptance_criteria: [
            'Branch merged with latest main (do NOT rebase)',
            'No new merge conflicts introduced',
            'All tests still pass after update'
          ]
        };

      case 'no_change_requests':
        return {
          ...baseConfig,
          type: 'review-feedback',
          task_category: 'implementation',
          title: `Address change requests in PR #${prNumber}`,
          description: this.buildChangeRequestDescription(prNumber, evaluation),
          acceptance_criteria: [
            'All requested changes implemented',
            'Reviewers re-approve PR'
          ]
        };

      case 'task_verification':
        return {
          ...baseConfig,
          type: 'refactoring',
          task_category: 'implementation',
          title: `Fix task verification failures in PR #${prNumber}`,
          description: this.buildVerificationFixDescription(prNumber, evaluation),
          acceptance_criteria: [
            'Task verification passes (≥80% criteria met)',
            'All acceptance criteria satisfied'
          ]
        };

      case 'copilot_review_completed':
        // This is a waiting condition - don't spawn task, just notify
        return {
          ...baseConfig,
          type: 'manual-intervention',
          task_category: 'analysis',
          title: `Copilot review pending for PR #${prNumber}`,
          assigned_agent: 'human',
          description: `Copilot has not reviewed PR #${prNumber} yet.\n\nCheck if Copilot review is enabled and request review if needed.`,
          acceptance_criteria: ['Copilot has reviewed PR']
        };

      case 'final_validation_passed':
        return {
          ...baseConfig,
          type: 'pr-validation',
          task_category: 'review',
          title: `Comprehensive validation review for PR #${prNumber}`,
          description: this.buildValidationTaskDescription(prNumber, parentTask),
          acceptance_criteria: [
            'Validation score ≥80/100',
            'All critical issues resolved'
          ],
          priority: 10 // Highest priority
        };

      default:
        return baseConfig as Partial<Task>;
    }
  }

  // ==========================================================================
  // Task Description Builders
  // ==========================================================================

  private buildCICheckFixDescription(prNumber: number, evaluation: ConditionEvaluation, prStatus: PRStatus): string {
    const failingChecks = evaluation.blocking_issues;

    return `
Fix failing CI checks in PR #${prNumber}

**Failing Checks**:
${failingChecks.map(check => `- ${check.description}${check.url ? `\n  Log: ${check.url}` : ''}`).join('\n')}

**Actions**:
1. Review failure logs at URLs above
2. Fix identified issues
3. Push changes to PR branch
4. Wait for CI checks to re-run

**Important**: Work from existing PR branch ${prStatus.number}
- Do NOT create a new PR
- Push changes will automatically update this PR
    `.trim();
  }

  private buildCommentFixDescription(prNumber: number, evaluation: ConditionEvaluation): string {
    const comments = evaluation.blocking_issues;

    return `
Address review comments in PR #${prNumber}

**Unresolved Comments** (${comments.length}):
${comments.map((comment, i) =>
  `${i + 1}. ${comment.file ? `[${comment.file}:${comment.line || '?'}]` : '[General]'} ${comment.description}`
).join('\n')}

**Actions**:
1. Review each comment above
2. Make necessary code changes
3. Reply to comments explaining changes
4. Push updates to PR branch

**Important**: Work from existing PR branch, do NOT create new PR
    `.trim();
  }

  private buildConflictFixDescription(prNumber: number, _prStatus: PRStatus): string {
    return `
Resolve merge conflicts in PR #${prNumber}

**Status**: PR has merge conflicts with base branch

**Actions**:
1. Checkout PR branch
2. Merge latest main: \`git merge origin/main\`
3. Resolve all conflicts in affected files
4. Test that code still works
5. Commit resolved conflicts
6. Push to PR branch

**Important**:
- Use merge, NOT rebase (preserve commit history)
- Work from existing PR branch
- Do NOT force push
    `.trim();
  }

  private buildBranchUpdateDescription(prNumber: number, _prStatus: PRStatus): string {
    return `
Update PR #${prNumber} with latest main branch

**Status**: PR branch is behind main and needs update

**Actions**:
1. Checkout PR branch
2. Fetch latest main: \`git fetch origin main\`
3. Merge main: \`git merge origin/main\`
4. Resolve any conflicts if they occur
5. Run tests to ensure nothing broke
6. Push update to PR branch

**Important**:
- Use MERGE, not rebase (do NOT force push!)
- Work from existing PR branch
- This update may trigger new CI checks
    `.trim();
  }

  private buildChangeRequestDescription(prNumber: number, evaluation: ConditionEvaluation): string {
    const requests = evaluation.blocking_issues;

    return `
Address change requests in PR #${prNumber}

**Change Requests**:
${requests.map(req => `- ${req.description}`).join('\n')}

**Actions**:
1. Review each requested change
2. Implement requested modifications
3. Update tests if needed
4. Push changes to PR branch
5. Request re-review from reviewers

**Important**: Work from existing PR branch, do NOT create new PR
    `.trim();
  }

  private buildVerificationFixDescription(prNumber: number, evaluation: ConditionEvaluation): string {
    return `
Fix task verification failures in PR #${prNumber}

**Verification Status**: Failed

**Issues**:
${evaluation.blocking_issues.map(issue => `- ${issue.description}`).join('\n')}

**Actions**:
1. Review verification failures above
2. Ensure all acceptance criteria are met
3. Fix any scope violations or missing requirements
4. Update tests/documentation as needed
5. Push changes to PR branch

**Important**: Work from existing PR branch, do NOT create new PR
    `.trim();
  }

  private buildValidationTaskDescription(prNumber: number, parentTask: Task | null): string {
    if (!parentTask) {
      return `Perform comprehensive validation review for PR #${prNumber}`;
    }

    return `
# Comprehensive Validation Review for PR #${prNumber}

**PR Title**: ${parentTask.title || `PR #${prNumber}`}
**Task**: ${parentTask.title}

## Acceptance Criteria
${(parentTask.acceptance_criteria || []).map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Validation Dimensions

Evaluate the PR across 6 dimensions and provide a score (0-100) for each:

### 1. Accuracy (0-100)
- Does implementation match requirements?
- Are all acceptance criteria satisfied?
- Are edge cases handled?

### 2. Entropy (0-100)
- Is code clean and well-structured?
- Appropriate abstraction levels?
- Low complexity?

### 3. Redundancy (0-100)
- Any duplicate code or logic?
- DRY principle followed?

### 4. Scope Creep (0-100)
- Changes within task scope?
- No unrelated features added?

### 5. Requirements (0-100)
- All acceptance criteria truly met?
- Quality standards maintained?

### 6. Code Quality (0-100)
- Follows best practices?
- Security considerations?
- Performance optimized?

## Output Format

**Overall Score**: X/100 (average of dimensions)
**Passed**: YES/NO (≥80 required)

**Dimension Scores**:
- Accuracy: X/100
- Entropy: X/100
- Redundancy: X/100
- Scope Creep: X/100
- Requirements: X/100
- Code Quality: X/100

**Issues Found** (if score < 80):
- [Category] [Severity]: Description

**Recommendation**: PASS / FIX_REQUIRED / ESCALATE

Store validation results in task verification data with score and issues.
    `.trim();
  }

  // ==========================================================================
  // Merge Readiness Check
  // ==========================================================================

  /**
   * Check if PR is ready for final validation or merge
   */
  private async checkMergeReadiness(prNumber: number, state: PRConditionState): Promise<void> {
    // First, check if we need to evaluate and spawn validation task
    const preValidationConditions = [
      'ci_checks_passing',
      'comments_resolved',
      'no_merge_conflicts',
      'branch_updated',
      'no_change_requests',
      'task_verification',
      'copilot_review_completed'
    ] as const;

    const preValidationMet = preValidationConditions.every(
      conditionId => state.conditions[conditionId]?.status === 'met'
    );

    // If 7 conditions met but validation not evaluated, evaluate it now
    if (preValidationMet && state.conditions.final_validation_passed.status !== 'met') {
      logger.info({
        category: 'pr-workflow',
        action: 'pre_validation_conditions_met',
        message: `All 7 pre-validation conditions met for PR #${prNumber} - evaluating validation`,
        details: { prNumber }
      });

      const validationEval = await this.evaluateFinalValidationCondition(prNumber, state);

      // Use handleConditionChange to update state and spawn task if needed
      await this.handleConditionChange(prNumber, state, 'final_validation_passed', validationEval);
    }

    const allConditionsMet = this.areAllConditionsMet(state);

    state.merge_eligible = allConditionsMet;

    if (allConditionsMet) {
      logger.info({
        category: 'pr-workflow',
        action: 'merge_ready',
        message: `PR #${prNumber} is ready for merge - all conditions met!`,
        details: { prNumber }
      });

      // Trigger automatic merge
      try {
        const tasks = await this.taskQueue.findByPRNumber(prNumber);

        if (tasks.length === 0) {
          logger.warn({
            category: 'pr-workflow',
            action: 'merge_skipped_no_task',
            message: `Cannot merge PR #${prNumber} - no associated task found`,
            details: { prNumber }
          });
          return;
        }

        await this.github.mergePR(prNumber, 'squash');

        logger.info({
          category: 'pr-workflow',
          action: 'pr_auto_merged',
          message: `Successfully auto-merged PR #${prNumber}`,
          details: { prNumber, taskId: tasks[0].id }
        });
      } catch (error) {
        logger.error({
          category: 'pr-workflow',
          action: 'auto_merge_failed',
          message: `Failed to auto-merge PR #${prNumber}: ${error}`,
          error,
          details: { prNumber }
        });
      }
    }
  }

  private areAllConditionsMet(state: PRConditionState): boolean {
    const conditions = Object.values(state.conditions);
    return conditions.every(c => c.status === 'met');
  }

  private countMetConditions(state: PRConditionState): number {
    return Object.values(state.conditions).filter(c => c.status === 'met').length;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Mark all active tasks for a condition as complete
   */
  private async markActiveTasksComplete(state: PRConditionState, conditionId: string): Promise<void> {
    const activeTasks = state.active_fix_tasks[conditionId] || [];

    for (const activeTask of activeTasks) {
      logger.info({
        category: 'pr-workflow',
        action: 'auto_complete_task',
        message: `Marking task ${activeTask.task_id} as complete (condition ${conditionId} now met)`,
        details: { task_id: activeTask.task_id, conditionId }
      });

      // Note: We don't actually mark the task as complete here
      // We just remove it from active tracking
      // The task will complete normally through task execution
    }

    // Clear active tasks for this condition
    state.active_fix_tasks[conditionId] = [];
  }

  /**
   * Generate fingerprint from list of items
   */
  private generateFingerprintFromList(items: string[]): string {
    if (items.length === 0) {
      return 'empty';
    }

    const content = items.join('|');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Load PR condition state from database
   */
  private async loadPRConditionState(prNumber: number): Promise<PRConditionState | null> {
    try {
      const row = this.db.getConnection().prepare(
        'SELECT * FROM pr_condition_states WHERE pr_number = ?'
      ).get(prNumber) as { state_json: string } | undefined;

      if (!row) {
        return null;
      }

      const state: PRConditionState = JSON.parse(row.state_json);
      return state;
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'load_state_failed',
        message: `Failed to load condition state for PR #${prNumber}`,
        error
      });
      return null;
    }
  }

  /**
   * Initialize PR condition state
   */
  private async initializePRConditionState(prNumber: number): Promise<PRConditionState> {
    const now = Date.now();

    const state: PRConditionState = {
      pr_number: prNumber,
      last_evaluated: now,
      last_updated: now,
      merge_eligible: false,
      conditions: {
        ci_checks_passing: { status: 'not_ready', issue_fingerprint: '', blocking_issues: [], last_checked: now },
        comments_resolved: { status: 'not_ready', issue_fingerprint: '', blocking_issues: [], last_checked: now },
        no_merge_conflicts: { status: 'not_ready', issue_fingerprint: '', blocking_issues: [], last_checked: now },
        branch_updated: { status: 'not_ready', issue_fingerprint: '', blocking_issues: [], last_checked: now },
        no_change_requests: { status: 'not_ready', issue_fingerprint: '', blocking_issues: [], last_checked: now },
        task_verification: { status: 'not_ready', issue_fingerprint: '', blocking_issues: [], last_checked: now },
        copilot_review_completed: { status: 'not_ready', issue_fingerprint: '', blocking_issues: [], last_checked: now },
        final_validation_passed: { status: 'not_ready', issue_fingerprint: '', blocking_issues: [], last_checked: now }
      },
      active_fix_tasks: {},
      final_validation_state: {
        validation_attempts: 0,
        last_validation_score: 0,
        validation_history: [],
        human_escalation_triggered: false
      },
      condition_history: []
    };

    logger.info({
      category: 'pr-workflow',
      action: 'state_initialized',
      message: `Initialized condition state for PR #${prNumber}`,
      details: { prNumber }
    });

    return state;
  }

  /**
   * Save PR condition state to database
   * Uses transaction for atomicity
   */
  private async savePRConditionState(state: PRConditionState): Promise<void> {
    const db = this.db.getConnection();

    try {
      const stateJson = JSON.stringify(state);
      const now = Date.now();

      // Count active tasks
      const activeTaskCount = Object.values(state.active_fix_tasks)
        .reduce((sum, tasks) => sum + tasks.length, 0);

      // Begin transaction for atomic state update
      db.prepare('BEGIN IMMEDIATE').run();

      try {
        db.prepare(`
          INSERT OR REPLACE INTO pr_condition_states (
            pr_number,
            state_json,
            last_evaluated,
            last_updated,
            created_at,
            updated_at,
            merge_eligible,
            ci_checks_passing,
            comments_resolved,
            no_merge_conflicts,
            branch_updated,
            no_change_requests,
            task_verification,
            copilot_review_completed,
            final_validation_passed,
            has_active_tasks,
            active_task_count,
            validation_attempts,
            last_validation_score,
            human_escalation_triggered
          ) VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM pr_condition_states WHERE pr_number = ?), ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          state.pr_number,
          stateJson,
          state.last_evaluated,
          state.last_updated,
          state.pr_number,
          now,
          now,
          state.merge_eligible ? 1 : 0,
          state.conditions.ci_checks_passing.status === 'met' ? 1 : 0,
          state.conditions.comments_resolved.status === 'met' ? 1 : 0,
          state.conditions.no_merge_conflicts.status === 'met' ? 1 : 0,
          state.conditions.branch_updated.status === 'met' ? 1 : 0,
          state.conditions.no_change_requests.status === 'met' ? 1 : 0,
          state.conditions.task_verification.status === 'met' ? 1 : 0,
          state.conditions.copilot_review_completed.status === 'met' ? 1 : 0,
          state.conditions.final_validation_passed.status === 'met' ? 1 : 0,
          activeTaskCount > 0 ? 1 : 0,
          activeTaskCount,
          state.final_validation_state.validation_attempts,
          state.final_validation_state.last_validation_score || null,
          state.final_validation_state.human_escalation_triggered ? 1 : 0
        );

        // Commit transaction
        db.prepare('COMMIT').run();

        logger.debug({
          category: 'pr-workflow',
          action: 'state_saved',
          message: `Saved condition state for PR #${state.pr_number}`,
          details: {
            pr_number: state.pr_number,
            merge_eligible: state.merge_eligible,
            active_tasks: activeTaskCount
          }
        });
      } catch (innerError) {
        // Rollback on error
        db.prepare('ROLLBACK').run();
        throw innerError;
      }
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'save_state_failed',
        message: `Failed to save condition state for PR #${state.pr_number}`,
        error
      });
      throw error;
    }
  }
}

/**
 * Singleton instance
 */
let instance: PRConditionStateService | null = null;

export function getPRConditionStateService(taskQueue: TaskQueueService): PRConditionStateService {
  if (!instance) {
    instance = new PRConditionStateService(taskQueue);
  }
  return instance;
}
