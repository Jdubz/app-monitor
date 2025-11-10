/**
 * PR Monitor Service
 *
 * Business logic for PR workflow:
 * - Analyzes Copilot feedback
 * - Determines when to auto-merge
 * - Creates followup tasks when issues found
 * 
 * Note: Polling removed - now webhook-driven via GitHubWebhookHandler
 */

import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { GitHubPRService, getGitHubPRService, type PRStatus, type CopilotReviewAnalysis } from './githubPR.service.js';
import { TaskQueueService } from './taskQueue.sqlite.js';
import type { Task } from './taskQueue.sqlite.js';

type TaskPRStatus = NonNullable<Task['pr_status']>;

export interface PRMonitorConfig {
  enableAutoMerge: boolean;
}

/**
 * Service for PR workflow business logic (webhook-driven)
 */
export class PRMonitorService {
  private readonly config: PRMonitorConfig;
  private readonly githubPR: GitHubPRService;
  private readonly taskQueue: TaskQueueService;
  private followupFingerprints: Map<number, Set<string>> = new Map();

  constructor(
    taskQueue: TaskQueueService,
    config: Partial<PRMonitorConfig> = {}
  ) {
    this.taskQueue = taskQueue;
    this.githubPR = getGitHubPRService();
    this.config = {
      enableAutoMerge: config.enableAutoMerge ?? true
    };
  }

  /**
   * Determine if a followup task should be created for PR issues
   */
  shouldCreateFollowup(prStatus: PRStatus, copilotAnalysis: CopilotReviewAnalysis): boolean {
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

    // Create followup for merge conflicts
    if (prStatus.mergeable === 'CONFLICTING') {
      return true;
    }

    return false;
  }

  /**
   * Hash issues to create fingerprint for tracking
   */
  private hashIssues(issues: string[]): string {
    return crypto.createHash('md5').update(issues.sort().join('|')).digest('hex');
  }

  /**
   * Create a followup task to address PR issues
   */
  async createFollowupTask(
    prNumber: number,
    taskId: string,
    prBranch: string,
    prStatus: PRStatus,
    copilotAnalysis: CopilotReviewAnalysis
  ): Promise<Task | null> {
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

    // Check if we've already created a followup for these exact issues
    const issueFingerprint = this.hashIssues(issues);
    const prFingerprints = this.followupFingerprints.get(prNumber);
    
    if (prFingerprints?.has(issueFingerprint)) {
      logger.info({
        category: 'pr-workflow',
        action: 'followup_already_exists',
        message: `Followup task already exists for these exact issues on PR #${prNumber}`,
        details: {
          prNumber,
          issueFingerprint,
          issuesCount: issues.length
        }
      });
      return null;
    }

    // Track fingerprint
    if (!prFingerprints) {
      this.followupFingerprints.set(prNumber, new Set([issueFingerprint]));
    } else {
      prFingerprints.add(issueFingerprint);
    }

    const taskDescription = `Fix issues found in PR #${prNumber}:\n\n${issues.join('\n')}`;

    logger.info({
      category: 'pr-workflow',
      action: 'create_followup_task',
      message: `Creating followup task for PR #${prNumber}`,
      details: {
        prNumber,
        parentTaskId: taskId,
        issuesCount: issues.length
      }
    });

    // Get original task
    const originalTask = this.taskQueue.getTask(taskId);
    if (!originalTask) {
      logger.error({
        category: 'pr-workflow',
        action: 'followup_task_error',
        message: `Original task ${taskId} not found`
      });
      return null;
    }

    // Create followup task
    const followupTask = this.taskQueue.createTask({
      title: `Fix PR #${prNumber} issues`,
      description: taskDescription,
      type: 'fix',
      priority: 8,
      acceptance_criteria: [
        `All CI checks pass`,
        `Address all Copilot blocking issues`,
        `Resolve human reviewer feedback`
      ],
      followup_for_pr: prNumber,
      pr_branch: prBranch,
      assigned_agent: originalTask.assigned_agent || 'backend-specialist'
    });

    // Update original task with followup link
    const followupTasks = originalTask.followup_tasks || [];
    followupTasks.push(followupTask.id);
    this.taskQueue.updateTask(originalTask.id, { followup_tasks: [...followupTasks] });

    // Update task PR status
    await this.updateTaskPRStatus(taskId, 'pending_review', `followup_created:${followupTask.id}`);

    return followupTask;
  }

  /**
   * Merge a PR
   */
  async mergePR(prNumber: number, taskId: string): Promise<boolean> {
    try {
      logger.info({
        category: 'pr-workflow',
        action: 'merging_pr',
        message: `Merging PR #${prNumber}`
      });

      await this.githubPR.mergePR(prNumber);

      await this.updateTaskPRStatus(taskId, 'merged');

      logger.info({
        category: 'pr-workflow',
        action: 'pr_merged',
        message: `Successfully merged PR #${prNumber}`,
        details: { prNumber, taskId }
      });

      return true;
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'merge_pr_failed',
        message: `Failed to merge PR #${prNumber}`,
        error,
        details: { prNumber }
      });
      const failureNote = error instanceof Error ? `merge_failed:${error.message}` : 'merge_failed';
      await this.updateTaskPRStatus(taskId, 'pending_review', failureNote);
      return false;
    }
  }

  /**
   * Update task PR status in database
   */
  private async updateTaskPRStatus(taskId: string, prStatus: TaskPRStatus, notes?: string): Promise<void> {
    const task = this.taskQueue.getTask(taskId);
    if (!task) {
      return;
    }

    const updates: Partial<Task> & { pr_merged_at?: number; notes?: string } = {
      pr_status: prStatus
    };

    if (prStatus === 'merged') {
      updates.pr_merged_at = Date.now();
    }

    if (notes) {
      updates.notes = task.notes ? `${task.notes}\n${notes}` : notes;
    }

    this.taskQueue.updateTask(taskId, updates);

    logger.info({
      category: 'pr-workflow',
      action: 'task_pr_status_updated',
      message: `Updated PR status for task ${taskId}`,
      details: {
        taskId,
        prStatus,
        notes
      }
    });
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      enableAutoMerge: this.config.enableAutoMerge,
      trackedPRs: this.followupFingerprints.size
    };
  }
}
