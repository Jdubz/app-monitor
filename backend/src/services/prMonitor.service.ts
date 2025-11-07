/**
 * PR Monitor Service
 *
 * Monitors pull requests created by dev-bots:
 * - Polls PR status (checks, reviews, comments)
 * - Analyzes Copilot feedback
 * - Auto-merges when safe
 * - Creates followup tasks when issues found
 */

import { logger } from '../utils/logger.js';
import { GitHubPRService, getGitHubPRService, type PRStatus, type CopilotReviewAnalysis } from './githubPR.service.js';
import { TaskQueueService } from './taskQueue.sqlite.js';
import type { Task } from './taskQueue.sqlite.js';

export interface MonitoredPR {
  taskId: string;
  prNumber: number;
  prUrl: string;
  prBranch: string;
  status: 'monitoring' | 'ready_to_merge' | 'merged' | 'needs_followup' | 'failed';
  lastChecked: number;
  checkCount: number;
  issuesFound: string[];
}

export interface PRMonitorConfig {
  pollIntervalMs: number;
  maxPollAttempts: number;
  enableAutoMerge: boolean;
}

/**
 * Service for monitoring PRs and orchestrating auto-merge
 */
export class PRMonitorService {
  private monitoredPRs: Map<number, MonitoredPR> = new Map();
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly config: PRMonitorConfig;
  private readonly githubPR: GitHubPRService;
  private readonly taskQueue: TaskQueueService;

  constructor(
    taskQueue: TaskQueueService,
    config: Partial<PRMonitorConfig> = {}
  ) {
    this.taskQueue = taskQueue;
    this.githubPR = getGitHubPRService();
    this.config = {
      pollIntervalMs: config.pollIntervalMs ?? 60000, // 1 minute default
      maxPollAttempts: config.maxPollAttempts ?? 60,  // 1 hour max
      enableAutoMerge: config.enableAutoMerge ?? true
    };
  }

  /**
   * Start monitoring a PR
   */
  registerPR(task: Task): void {
    if (!task.pr_number || !task.pr_url || !task.pr_branch) {
      logger.warn({
        category: 'pr-workflow',
        action: 'register_pr_skipped',
        message: `Task ${task.id} does not have PR information`,
        details: { taskId: task.id }
      });
      return;
    }

    const monitored: MonitoredPR = {
      taskId: task.id,
      prNumber: task.pr_number,
      prUrl: task.pr_url,
      prBranch: task.pr_branch,
      status: 'monitoring',
      lastChecked: Date.now(),
      checkCount: 0,
      issuesFound: []
    };

    this.monitoredPRs.set(task.pr_number, monitored);

    logger.info({
      category: 'pr-workflow',
      action: 'pr_registered',
      message: `Registered PR #${task.pr_number} for monitoring`,
      details: {
        taskId: task.id,
        prNumber: task.pr_number,
        prUrl: task.pr_url
      }
    });

    // Start polling if not already running
    if (!this.pollTimer) {
      this.startPolling();
    }
  }

  /**
   * Start the polling loop
   */
  private startPolling(): void {
    if (this.pollTimer) {
      return;
    }

    logger.info({
      category: 'pr-workflow',
      action: 'polling_started',
      message: `Started PR monitoring with ${this.config.pollIntervalMs}ms interval`
    });

    this.pollTimer = setInterval(() => {
      this.pollAllPRs().catch(error => {
        logger.error({
          category: 'pr-workflow',
          action: 'polling_error',
          message: 'Error during PR polling',
          error
        });
      });
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop the polling loop
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;

      logger.info({
        category: 'pr-workflow',
        action: 'polling_stopped',
        message: 'Stopped PR monitoring'
      });
    }
  }

  /**
   * Poll all monitored PRs
   */
  private async pollAllPRs(): Promise<void> {
    const prsToMonitor = Array.from(this.monitoredPRs.values()).filter(
      pr => pr.status === 'monitoring'
    );

    if (prsToMonitor.length === 0) {
      this.stopPolling();
      return;
    }

    logger.debug({
      category: 'pr-workflow',
      action: 'poll_cycle',
      message: `Polling ${prsToMonitor.length} PR(s)`,
      details: { prNumbers: prsToMonitor.map(pr => pr.prNumber) }
    });

    for (const monitoredPR of prsToMonitor) {
      try {
        await this.checkPR(monitoredPR);
      } catch (error) {
        logger.error({
          category: 'pr-workflow',
          action: 'check_pr_error',
          message: `Error checking PR #${monitoredPR.prNumber}`,
          error,
          details: { prNumber: monitoredPR.prNumber }
        });
      }
    }
  }

  /**
   * Check a single PR and take appropriate action
   */
  private async checkPR(monitoredPR: MonitoredPR): Promise<void> {
    monitoredPR.checkCount++;
    monitoredPR.lastChecked = Date.now();

    // Check if we've exceeded max attempts
    if (monitoredPR.checkCount > this.config.maxPollAttempts) {
      logger.warn({
        category: 'pr-workflow',
        action: 'pr_timeout',
        message: `PR #${monitoredPR.prNumber} exceeded max polling attempts`,
        details: { prNumber: monitoredPR.prNumber, checkCount: monitoredPR.checkCount }
      });
      monitoredPR.status = 'failed';
      await this.updateTaskPRStatus(monitoredPR.taskId, 'pending_checks', 'timeout');
      return;
    }

    // Fetch PR status
    const prStatus = await this.githubPR.getPRStatus(monitoredPR.prNumber);

    // Check if PR was already merged (e.g., manually)
    if (prStatus.state === 'MERGED') {
      logger.info({
        category: 'pr-workflow',
        action: 'pr_already_merged',
        message: `PR #${monitoredPR.prNumber} was already merged`
      });
      monitoredPR.status = 'merged';
      await this.updateTaskPRStatus(monitoredPR.taskId, 'merged');
      return;
    }

    // Check if PR was closed without merging
    if (prStatus.state === 'CLOSED') {
      logger.info({
        category: 'pr-workflow',
        action: 'pr_closed',
        message: `PR #${monitoredPR.prNumber} was closed without merging`
      });
      monitoredPR.status = 'failed';
      await this.updateTaskPRStatus(monitoredPR.taskId, 'closed');
      return;
    }

    // Analyze Copilot feedback
    const copilotAnalysis = this.githubPR.analyzeCopilotReview(prStatus.comments);

    // Log Copilot analysis
    if (copilotAnalysis.hasComments) {
      logger.info({
        category: 'pr-workflow',
        action: 'copilot_analysis',
        message: `Copilot analysis for PR #${monitoredPR.prNumber}`,
        details: {
          prNumber: monitoredPR.prNumber,
          totalComments: copilotAnalysis.totalComments,
          blockingIssues: copilotAnalysis.blockingIssues.length,
          suggestions: copilotAnalysis.suggestions.length,
          severity: copilotAnalysis.severity
        }
      });
    }

    // Check if PR can be auto-merged
    const mergeDecision = this.githubPR.canAutoMerge(prStatus, copilotAnalysis);

    if (!mergeDecision.canMerge) {
      logger.info({
        category: 'pr-workflow',
        action: 'pr_not_ready',
        message: `PR #${monitoredPR.prNumber} not ready to merge: ${mergeDecision.reason}`,
        details: { prNumber: monitoredPR.prNumber, reason: mergeDecision.reason }
      });

      // Check if we need to create followup tasks
      if (this.shouldCreateFollowup(prStatus, copilotAnalysis)) {
        await this.createFollowupTask(monitoredPR, prStatus, copilotAnalysis);
      }

      return;
    }

    // PR is ready to merge
    monitoredPR.status = 'ready_to_merge';
    await this.updateTaskPRStatus(monitoredPR.taskId, 'ready_to_merge');

    if (this.config.enableAutoMerge) {
      await this.mergePR(monitoredPR);
    } else {
      logger.info({
        category: 'pr-workflow',
        action: 'auto_merge_disabled',
        message: `PR #${monitoredPR.prNumber} ready but auto-merge is disabled`
      });
    }
  }

  /**
   * Determine if a followup task should be created
   */
  private shouldCreateFollowup(prStatus: PRStatus, copilotAnalysis: CopilotReviewAnalysis): boolean {
    // Create followup for failed checks
    const hasFailedChecks = prStatus.checks.some(c =>
      c.status === 'failure' || c.status === 'error'
    );
    if (hasFailedChecks) {
      return true;
    }

    // Create followup for blocking Copilot issues
    if (copilotAnalysis.severity === 'high' || copilotAnalysis.severity === 'medium') {
      return true;
    }

    // Create followup for human change requests
    const hasChangeRequests = prStatus.reviews.some(r =>
      r.state === 'CHANGES_REQUESTED' && !r.author.toLowerCase().includes('copilot')
    );
    if (hasChangeRequests) {
      return true;
    }

    return false;
  }

  /**
   * Create a followup task to address PR issues
   */
  private async createFollowupTask(
    monitoredPR: MonitoredPR,
    prStatus: PRStatus,
    copilotAnalysis: CopilotReviewAnalysis
  ): Promise<void> {
    // Only create one followup task per PR
    if (monitoredPR.status === 'needs_followup') {
      return;
    }

    monitoredPR.status = 'needs_followup';

    // Build task description
    const issues: string[] = [];

    // Failed checks
    const failedChecks = prStatus.checks.filter(c =>
      c.status === 'failure' || c.status === 'error'
    );
    if (failedChecks.length > 0) {
      issues.push(`Failed CI checks: ${failedChecks.map(c => c.name).join(', ')}`);
    }

    // Copilot blocking issues
    if (copilotAnalysis.blockingIssues.length > 0) {
      issues.push(`Copilot found ${copilotAnalysis.blockingIssues.length} blocking issue(s)`);
      copilotAnalysis.blockingIssues.forEach(issue => {
        issues.push(`  - ${issue.substring(0, 200)}`);
      });
    }

    // Human change requests
    const changeRequests = prStatus.reviews.filter(r =>
      r.state === 'CHANGES_REQUESTED' && !r.author.toLowerCase().includes('copilot')
    );
    if (changeRequests.length > 0) {
      issues.push(`Human reviewer(s) requested changes: ${changeRequests.map(r => r.author).join(', ')}`);
    }

    monitoredPR.issuesFound = issues;

    const taskDescription = `Fix issues found in PR #${monitoredPR.prNumber}:\n\n${issues.join('\n')}`;

    logger.info({
      category: 'pr-workflow',
      action: 'create_followup_task',
      message: `Creating followup task for PR #${monitoredPR.prNumber}`,
      details: {
        prNumber: monitoredPR.prNumber,
        parentTaskId: monitoredPR.taskId,
        issuesCount: issues.length
      }
    });

    // Get original task
    const originalTask = this.taskQueue.getTask(monitoredPR.taskId);
    if (!originalTask) {
      logger.error({
        category: 'pr-workflow',
        action: 'followup_task_error',
        message: `Original task ${monitoredPR.taskId} not found`
      });
      return;
    }

    // Create followup task
    const followupTask = this.taskQueue.createTask({
      title: `Fix PR #${monitoredPR.prNumber} issues`,
      description: taskDescription,
      type: 'fix',
      priority: 8, // High priority (scale is 1-10)
      acceptance_criteria: [`All CI checks pass`, `Address all Copilot blocking issues`, `Resolve human reviewer feedback`],
      followup_for_pr: monitoredPR.prNumber
    });

    // Update original task with followup link
    const followupTasks = originalTask.followup_tasks || [];
    followupTasks.push(followupTask.id);
    this.taskQueue.updateTask(originalTask.id, { followup_tasks: [...followupTasks] });

    await this.updateTaskPRStatus(monitoredPR.taskId, 'pending_review', `followup_created:${followupTask.id}`);
  }

  /**
   * Merge a PR
   */
  private async mergePR(monitoredPR: MonitoredPR): Promise<void> {
    try {
      logger.info({
        category: 'pr-workflow',
        action: 'merging_pr',
        message: `Merging PR #${monitoredPR.prNumber}`
      });

      await this.githubPR.mergePR(monitoredPR.prNumber);

      monitoredPR.status = 'merged';
      await this.updateTaskPRStatus(monitoredPR.taskId, 'merged');

      logger.info({
        category: 'pr-workflow',
        action: 'pr_merged',
        message: `Successfully merged PR #${monitoredPR.prNumber}`,
        details: { prNumber: monitoredPR.prNumber, taskId: monitoredPR.taskId }
      });
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'merge_pr_failed',
        message: `Failed to merge PR #${monitoredPR.prNumber}`,
        error,
        details: { prNumber: monitoredPR.prNumber }
      });
      monitoredPR.status = 'failed';
    }
  }

  /**
   * Update task PR status in database
   */
  private async updateTaskPRStatus(taskId: string, prStatus: string, notes?: string): Promise<void> {
    const task = this.taskQueue.getTask(taskId);
    if (!task) {
      return;
    }

    const updates: any = { pr_status: prStatus };

    if (prStatus === 'merged') {
      updates.pr_merged_at = Date.now();
    }

    if (notes) {
      updates.notes = task.notes ? `${task.notes}\n${notes}` : notes;
    }

    this.taskQueue.updateTask(taskId, updates);
  }

  /**
   * Get all monitored PRs
   */
  getMonitoredPRs(): MonitoredPR[] {
    return Array.from(this.monitoredPRs.values());
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isPolling: boolean;
    monitoredCount: number;
    config: PRMonitorConfig;
  } {
    return {
      isPolling: this.pollTimer !== null,
      monitoredCount: this.monitoredPRs.size,
      config: this.config
    };
  }
}
