/**
 * PR Workflow Orchestrator Service
 *
 * Orchestrates the complete PR-based workflow for dev-bot tasks:
 * 1. Extract PR info from bot output
 * 2. Register PR for monitoring
 * 3. Monitor checks and reviews
 * 4. Auto-merge when ready OR create followup tasks
 *
 * This is the entry point for PR workflow after task execution completes.
 */

import { logger } from '../utils/logger.js';
import { PRMonitorService } from './prMonitor.service.js';
import { TaskQueueService } from './taskQueue.sqlite.js';
import type { Task } from './taskQueue.sqlite.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface PRInfo {
  number: number;
  url: string;
  branch: string;
}

export interface PRWorkflowConfig {
  enableAutoMerge: boolean;
  checkTimeoutMs: number;
  monitorPollIntervalMs: number;
}

// ============================================================================
// PR Workflow Orchestrator
// ============================================================================

export class PRWorkflowOrchestrator {
  private readonly taskQueue: TaskQueueService;
  private readonly prMonitor: PRMonitorService;
  private readonly config: PRWorkflowConfig;

  constructor(
    taskQueue: TaskQueueService,
    config: Partial<PRWorkflowConfig> = {}
  ) {
    this.taskQueue = taskQueue;
    this.prMonitor = new PRMonitorService(taskQueue, {
      pollIntervalMs: config.monitorPollIntervalMs ?? 60000,
      maxPollAttempts: (config.checkTimeoutMs ?? 600000) / (config.monitorPollIntervalMs ?? 60000),
      enableAutoMerge: config.enableAutoMerge ?? true
    });

    this.config = {
      enableAutoMerge: config.enableAutoMerge ?? true,
      checkTimeoutMs: config.checkTimeoutMs ?? 600000,  // 10 minutes
      monitorPollIntervalMs: config.monitorPollIntervalMs ?? 60000  // 1 minute
    };
  }

  // ==========================================================================
  // Main Entry Point
  // ==========================================================================

  /**
   * Handle task completion with PR workflow
   * Called from taskCompletion.service.ts when bot completes a task
   */
  async handleTaskCompletion(task: Task, output: string): Promise<void> {
    logger.info({
      category: 'pr-workflow',
      action: 'handle_task_completion',
      message: `Handling PR workflow for completed task ${task.id}`,
      details: { taskId: task.id, taskTitle: task.title }
    });

    try {
      // 1. Extract PR info from bot output
      const prInfo = this.extractPRInfo(output);

      if (!prInfo) {
        logger.warn({
          category: 'pr-workflow',
          action: 'no_pr_info',
          message: `Bot did not create PR or provide PR number for task ${task.id}`,
          details: {
            taskId: task.id,
            outputSample: output.substring(0, 500)
          }
        });
        return;
      }

      logger.info({
        category: 'pr-workflow',
        action: 'pr_info_extracted',
        message: `Extracted PR info for task ${task.id}`,
        details: {
          taskId: task.id,
          prNumber: prInfo.number,
          prUrl: prInfo.url,
          prBranch: prInfo.branch
        }
      });

      // 2. Update task with PR metadata
      this.taskQueue.updateTask(task.id, {
        pr_number: prInfo.number,
        pr_url: prInfo.url,
        pr_branch: prInfo.branch,
        pr_status: 'pending_checks',
        pr_created_at: Date.now()
      });

      // 3. Register PR for monitoring (async - non-blocking)
      const updatedTask = this.taskQueue.getTask(task.id);
      if (updatedTask) {
        this.prMonitor.registerPR(updatedTask);

        logger.info({
          category: 'pr-workflow',
          action: 'pr_monitoring_started',
          message: `Started monitoring PR #${prInfo.number} for task ${task.id}`,
          details: {
            taskId: task.id,
            prNumber: prInfo.number,
            prUrl: prInfo.url
          }
        });
      }

    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'handle_task_completion_failed',
        message: `Failed to handle PR workflow for task ${task.id}`,
        error,
        details: { taskId: task.id }
      });
    }
  }

  // ==========================================================================
  // PR Info Extraction
  // ==========================================================================

  /**
   * Extract PR number and URL from bot output
   * Looks for patterns like:
   * - "PR_NUMBER: 42"
   * - "PR_URL: https://github.com/Jdubz/app-monitor/pull/42"
   * - "Pull request #42"
   * - GitHub PR URLs in output
   */
  private extractPRInfo(output: string): PRInfo | null {
    let prNumber: number | null = null;
    let prUrl: string | null = null;
    let prBranch: string | null = null;

    // Try to extract PR_NUMBER: {number}
    const prNumberMatch = output.match(/PR_NUMBER:\s*(\d+)/i);
    if (prNumberMatch) {
      prNumber = parseInt(prNumberMatch[1], 10);
    }

    // Try to extract PR_URL: {url}
    const prUrlMatch = output.match(/PR_URL:\s*(https:\/\/github\.com\/[^\s]+)/i);
    if (prUrlMatch) {
      prUrl = prUrlMatch[1];
    }

    // Try to extract from GitHub PR URL in output
    if (!prNumber || !prUrl) {
      const githubUrlMatch = output.match(/https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
      if (githubUrlMatch) {
        prUrl = githubUrlMatch[0];
        prNumber = parseInt(githubUrlMatch[3], 10);
      }
    }

    // Try to extract PR branch (optional)
    const branchMatch = output.match(/PR_BRANCH:\s*([^\s]+)/i);
    if (branchMatch) {
      prBranch = branchMatch[1];
    }

    // If we found at least PR number, we can work with that
    if (prNumber) {
      return {
        number: prNumber,
        url: prUrl || `https://github.com/Jdubz/app-monitor/pull/${prNumber}`,
        branch: prBranch || `task-${prNumber}`
      };
    }

    return null;
  }

  // ==========================================================================
  // Status & Control
  // ==========================================================================

  /**
   * Get all monitored PRs
   */
  getMonitoredPRs() {
    return this.prMonitor.getMonitoredPRs();
  }

  /**
   * Get orchestrator status
   */
  getStatus() {
    return {
      ...this.prMonitor.getStatus(),
      config: this.config
    };
  }

  /**
   * Stop monitoring (cleanup)
   */
  stop() {
    this.prMonitor.stopPolling();
  }
}
