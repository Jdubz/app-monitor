/**
 * Check Run Webhook Handler
 * 
 * Handles check_run webhook events from GitHub.
 * Processes individual CI/CD check run completions.
 * Similar to CheckSuiteHandler but for individual check runs.
 */

import { logger } from '../../utils/logger.js';
import { BaseWebhookHandler } from './baseHandler.js';
import type { GitHubCheckRunPayload } from './types.js';

/**
 * Handler for GitHub check_run webhook events
 */
export class CheckRunHandler extends BaseWebhookHandler {
  /**
   * Handle check_run webhook event
   */
  async handle(payload: GitHubCheckRunPayload): Promise<void> {
    this.updateStatsTimestamp();
    
    const { action, check_run, repository } = payload;
    
    // Only process 'completed' check runs
    if (action !== 'completed') {
      logger.debug({
        category: 'api',
        action: 'check_run_ignored',
        message: `Check run action '${action}' ignored (only processing 'completed')`,
        details: { action, conclusion: check_run.conclusion }
      });
      return;
    }

    const pullRequests = check_run.pull_requests || [];
    if (pullRequests.length === 0) {
      logger.debug({
        category: 'api',
        action: 'check_run_no_prs',
        message: 'Check run not associated with any PRs'
      });
      return;
    }

    this.logEvent('check_run', 'completed', {
      name: check_run.name,
      conclusion: check_run.conclusion,
      pr_count: pullRequests.length,
      pr_numbers: pullRequests.map((pr) => pr.number),
      repository: repository.full_name
    });

    // Process each PR - reuse check suite logic since both trigger same workflow
    for (const pr of pullRequests) {
      await this.processCheckRunForPR(pr.number, check_run, repository);
    }
  }

  /**
   * Check if PR branches match dev-bot or copilot patterns
   * 
   * Valid patterns:
   * - Dev-bot PRs: task-implementation-{uuid} -> main
   * - Copilot sub-PRs: subPR-{number} -> task-implementation-{uuid}
   */
  private isDevBotManagedBranch(headRef: string, baseRef: string): boolean {
    const isTaskBranch = headRef.startsWith('task-implementation-') && baseRef === 'main';
    const isSubPR = headRef.startsWith('subPR-') && baseRef.startsWith('task-implementation-');
    return isTaskBranch || isSubPR;
  }

  /**
   * Process check run completion for a specific PR
   * Uses same logic as check suite since workflow is identical
   */
  private async processCheckRunForPR(
    prNumber: number,
    checkRun: { conclusion: string | null },
    repository: { owner: { login: string }; name: string; full_name: string }
  ): Promise<void> {
    if (!this.taskQueue || !this.prConditionState) {
      logger.debug({
        category: 'api',
        action: 'check_run_handler_not_ready',
        message: 'Task queue or PR condition state service not available'
      });
      return;
    }

    const owner = repository.owner.login;
    const repo = repository.name;
    
    // Check if the PR branches match dev-bot patterns
    try {
      const githubPR = this.prOrchestrator?.getGitHubPRService();
      if (githubPR) {
        const prStatus = await githubPR.getPRStatus(prNumber, owner, repo);
        
        if (!this.isDevBotManagedBranch(prStatus.head_ref, prStatus.base_ref)) {
          logger.debug({
            category: 'api',
            action: 'check_run_non_devbot_branch',
            message: `PR #${prNumber} does not match dev-bot branch patterns, skipping`,
            details: {
              pr_number: prNumber,
              head_ref: prStatus.head_ref,
              base_ref: prStatus.base_ref
            }
          });
          return;
        }
      }
    } catch (error) {
      logger.warn({
        category: 'api',
        action: 'check_run_pr_fetch_failed',
        message: `Failed to fetch PR #${prNumber} details, skipping to be safe`,
        error,
        details: { pr_number: prNumber }
      });
      return;
    }

    // Find associated tasks - only process if PR is tracked in our system
    const tasks = await this.taskQueue.findByPRNumber(prNumber);
    if (tasks.length === 0) {
      logger.debug({
        category: 'api',
        action: 'check_run_no_tasks',
        message: `No tasks found for PR #${prNumber} - skipping check run processing`,
        details: { pr_number: prNumber }
      });
      return;
    }

    logger.info({
      category: 'pr-workflow',
      action: 'check_run_processed',
      message: `Processing check run ${checkRun.conclusion} for PR #${prNumber}`,
      details: {
        pr_number: prNumber,
        conclusion: checkRun.conclusion,
        task_ids: tasks.map(t => t.id),
        repository: repository.full_name
      }
    });

    try {
      // Evaluate PR conditions using check_suite trigger (same workflow)
      await this.prConditionState.evaluateConditions(prNumber, 'check_suite');

      // Note: Auto-merge logic handled by check_suite events
      // Check runs are supplementary and don't trigger merge
    } catch (error) {
      this.logError('check_run', 'process', error, {
        pr_number: prNumber,
        repository: repository.full_name
      });
    }
  }
}
