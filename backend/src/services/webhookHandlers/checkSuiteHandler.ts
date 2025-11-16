/**
 * Check Suite Webhook Handler
 * 
 * Handles check_suite webhook events from GitHub.
 * Processes CI/CD check suite completions and triggers follow-up actions.
 */

import { logger } from '../../utils/logger.js';
import { BaseWebhookHandler } from './baseHandler.js';
import type { GitHubCheckSuitePayload } from './types.js';
import type { Task } from '../taskQueue.sqlite.js';
import type { GitHubPRService } from '../githubPR.service.js';

/**
 * Handler for GitHub check_suite webhook events
 */
export class CheckSuiteHandler extends BaseWebhookHandler {
  /**
   * Handle check_suite webhook event
   */
  async handle(payload: GitHubCheckSuitePayload): Promise<void> {
    this.updateStatsTimestamp();
    
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

    this.logEvent('check_suite', 'completed', {
      conclusion: check_suite.conclusion,
      pr_count: pullRequests.length,
      pr_numbers: pullRequests.map((pr) => pr.number),
      repository: repository.full_name
    });

    // Process each PR
    for (const pr of pullRequests) {
      await this.processCheckSuiteForPR(pr.number, check_suite, repository);
    }
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

    const conclusion = checkSuite.conclusion;
    const owner = repository.owner.login;
    const repo = repository.name;
    
    let tasks: Task[] = [];
    
    // First, check if the PR branches match dev-bot patterns and attempt data recovery
    try {
      const githubPR = this.prOrchestrator.getGitHubPRService();
      const prStatus = await githubPR.getPRStatus(prNumber, owner, repo);
      
      if (!this.isDevBotManagedBranch(prStatus.head_ref, prStatus.base_ref)) {
        logger.debug({
          category: 'api',
          action: 'check_suite_non_devbot_branch',
          message: `PR #${prNumber} does not match dev-bot branch patterns, skipping`,
          details: {
            pr_number: prNumber,
            head_ref: prStatus.head_ref,
            base_ref: prStatus.base_ref
          }
        });
        return;
      }

      // Extract task ID from branch name for data recovery
      const taskIdFromBranch = this.extractTaskIdFromBranchOrTitle(prStatus.head_ref, '');
      
      // Find associated tasks
      tasks = await this.taskQueue.findByPRNumber(prNumber);
      
      // Self-healing: If no tasks found but we have a task ID from the branch,
      // try to find the task by ID (data recovery for orphaned PRs)
      if (tasks.length === 0 && taskIdFromBranch) {
        logger.info({
          category: 'api',
          action: 'check_suite_data_recovery_attempt',
          message: `No tasks found for PR #${prNumber}, attempting data recovery using task ID from branch`,
          details: {
            pr_number: prNumber,
            task_id_from_branch: taskIdFromBranch,
            head_ref: prStatus.head_ref
          }
        });

        const taskById = await this.taskQueue.findByTaskId(taskIdFromBranch);
        if (taskById) {
          logger.info({
            category: 'api',
            action: 'check_suite_data_recovered',
            message: `Found task ${taskIdFromBranch} via data recovery, associating with PR #${prNumber}`,
            details: {
              pr_number: prNumber,
              task_id: taskIdFromBranch
            }
          });
          tasks.push(taskById);
          
          // Update task with PR number to prevent future mismatches
          if (!taskById.pr_number) {
            await this.taskQueue.updateTask(taskIdFromBranch, { pr_number: prNumber });
          }
        }
      }
      
      // If still no tasks, skip processing
      if (tasks.length === 0) {
        logger.debug({
          category: 'api',
          action: 'check_suite_no_tasks',
          message: `No tasks found for PR #${prNumber}, not a dev-bot managed PR`,
          details: { 
            pr_number: prNumber,
            task_id_from_branch: taskIdFromBranch || 'none'
          }
        });
        return;
      }
    } catch (error) {
      logger.warn({
        category: 'api',
        action: 'check_suite_pr_fetch_failed',
        message: `Failed to fetch PR #${prNumber} details, skipping to be safe`,
        error,
        details: { pr_number: prNumber }
      });
      return;
    }
    
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
      
      // Get PR status
      const prStatus = await githubPR.getPRStatus(prNumber, owner, repo);

      // Auto-update branch if PR is behind base (before evaluating conditions)
      if (prStatus.mergeable_state === 'behind' && prStatus.state === 'OPEN') {
        await this.autoUpdateBranch(prNumber, owner, repo, githubPR);
      }

      // Evaluate PR conditions and spawn fix tasks if needed (continuous self-healing)
      await this.evaluateConditions(prNumber);

      // Run task verification when checks pass successfully
      if (conclusion === 'success' && tasks.length > 0) {
        await this.runTaskVerification(prNumber, tasks[0]);
      }

      // Check if we should attempt auto-merge
      if (tasks.length > 0) {
        const task = tasks[0];
        await prMonitor.mergePR(prNumber, task.id);
      }

    } catch (error) {
      this.logError('check_suite', 'process', error, {
        pr_number: prNumber,
        repository: repository.full_name
      });
    }
  }

  /**
   * Auto-update branch if behind base
   */
  private async autoUpdateBranch(
    prNumber: number,
    owner: string,
    repo: string,
    githubPR: GitHubPRService
  ): Promise<void> {
    try {
      logger.info({
        category: 'pr-workflow',
        action: 'auto_update_branch_behind',
        message: `PR #${prNumber} is behind base, attempting automatic branch update`,
        details: { pr_number: prNumber }
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
    }
  }

  /**
   * Evaluate PR conditions
   */
  private async evaluateConditions(prNumber: number): Promise<void> {
    if (!this.prConditionState) return;

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
  }

  /**
   * Run task verification
   */
  private async runTaskVerification(prNumber: number, task: Task): Promise<void> {
    if (!this.taskQueue) return;

    try {
      logger.info({
        category: 'pr-workflow',
        action: 'verification_started',
        message: `Running task verification for PR #${prNumber}`,
        details: { pr_number: prNumber, task_id: task.id }
      });

      const verificationResult = await this.taskVerification.verifyTask(
        task,
        '/home/jdubz/Development/app-monitor',
        task.output || ''
      );

      // Store verification results
      await this.taskQueue.updateTask(task.id, {
        verification_passed: verificationResult.passed,
        verification_results: JSON.stringify(verificationResult),
        verification_timestamp: Date.now()
      });

      // Track metrics
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
}
