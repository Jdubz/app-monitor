/**
 * Push Webhook Handler
 * 
 * Handles push webhook events from GitHub.
 * When base branches are updated, re-evaluates branch_updated condition for all tracked PRs.
 */

import { logger } from '../../utils/logger.js';
import { BaseWebhookHandler } from './baseHandler.js';
import type { GitHubPushPayload } from './types.js';

/**
 * Handler for GitHub push webhook events
 */
export class PushHandler extends BaseWebhookHandler {
  private readonly baseBranches = ['main', 'master', 'staging', 'develop', 'production'];

  /**
   * Handle push webhook event
   */
  async handle(payload: GitHubPushPayload): Promise<void> {
    this.stats.push_events_received++;
    this.updateStatsTimestamp();

    const { ref, commits, repository, pusher } = payload;
    const branch = ref.replace('refs/heads/', '');

    this.logEvent('push', 'received', {
      branch,
      commit_count: commits.length,
      repo: repository.full_name,
      head_commit: commits[0]?.message,
      pusher: pusher.name
    });

    // Only trigger condition evaluation for base branches (most PRs target these)
    if (!this.baseBranches.includes(branch)) {
      logger.debug({
        category: 'pr-workflow',
        action: 'push_ignored_non_base_branch',
        message: `Push to ${branch} ignored - not a base branch`,
        details: { branch }
      });
      return;
    }

    if (!this.prConditionState) {
      logger.warn({
        category: 'pr-workflow',
        action: 'push_handler_skipped',
        message: 'PR condition state service not available'
      });
      return;
    }

    try {
      await this.evaluateTrackedPRs(branch);
    } catch (error) {
      this.logError('push', 'handler', error, {
        branch,
        repository: repository.full_name
      });
    }
  }

  /**
   * Evaluate all tracked PRs after push to base branch
   */
  private async evaluateTrackedPRs(branch: string): Promise<void> {
    if (!this.prConditionState) return;

    // Get all tracked PRs
    const trackedPRs = await this.prConditionState.getAllTrackedPRNumbers();

    if (trackedPRs.length === 0) {
      logger.debug({
        category: 'pr-workflow',
        action: 'push_no_tracked_prs',
        message: `No tracked PRs to evaluate after push to ${branch}`
      });
      return;
    }

    logger.info({
      category: 'pr-workflow',
      action: 'push_evaluating_prs',
      message: `Push to ${branch} - evaluating ${trackedPRs.length} tracked PRs`,
      details: {
        branch,
        pr_count: trackedPRs.length,
        pr_numbers: trackedPRs
      }
    });

    // Trigger condition evaluation for all tracked PRs
    // This will check if PRs need to merge the base branch
    for (const prNumber of trackedPRs) {
      try {
        await this.prConditionState.evaluateConditions(prNumber, 'push');
      } catch (error) {
        logger.error({
          category: 'pr-workflow',
          action: 'push_evaluation_failed',
          message: `Failed to evaluate PR #${prNumber} after push to ${branch}`,
          error,
          details: { prNumber, branch }
        });
        // Continue with other PRs
      }
    }

    logger.info({
      category: 'pr-workflow',
      action: 'push_evaluation_completed',
      message: `Completed evaluating ${trackedPRs.length} PRs after push to ${branch}`,
      details: { branch, pr_count: trackedPRs.length }
    });
  }
}
