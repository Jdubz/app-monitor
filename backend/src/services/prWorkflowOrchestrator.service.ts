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
import { PRArtifactRecoveryService } from './prArtifactRecovery.service.js';
import type { RecoveryStats } from './prArtifactRecovery.service.js';
import { getGitHubPRService } from './githubPR.service.js';

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
  private artifactRecovery: PRArtifactRecoveryService;
  private lastArtifactScan: number = 0;
  private readonly ARTIFACT_SCAN_INTERVAL = 300000; // 5 minutes

  constructor(
    taskQueue: TaskQueueService,
    config: Partial<PRWorkflowConfig> = {}
  ) {
    this.taskQueue = taskQueue;
    this.prMonitor = new PRMonitorService(taskQueue, {
      enableAutoMerge: config.enableAutoMerge ?? true
    });

    this.config = {
      enableAutoMerge: config.enableAutoMerge ?? true,
      checkTimeoutMs: config.checkTimeoutMs ?? 600000,  // 10 minutes
      monitorPollIntervalMs: config.monitorPollIntervalMs ?? 60000  // 1 minute
    };

    // Initialize artifact recovery service
    this.artifactRecovery = new PRArtifactRecoveryService(taskQueue, this);
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize PR monitoring by scanning for existing unmerged PRs
   * Should be called on startup to resume monitoring PRs that were created
   * before the last shutdown
   */
  async initialize(): Promise<void> {
    logger.info({
      category: 'pr-workflow',
      action: 'initialize_start',
      message: 'Initializing PR workflow orchestrator, scanning for existing PRs'
    });

    // Step 1: Recover from artifacts on startup
    try {
      const recoveryStats = await this.artifactRecovery.recoverOrphanedPRs();

      if (recoveryStats.prInfoRecovered > 0) {
        logger.info({
          category: 'pr-workflow',
          action: 'startup_recovery_completed',
          message: `Recovered ${recoveryStats.prInfoRecovered} PRs from artifacts on startup`,
          details: { ...recoveryStats } as Record<string, unknown>
        });
      }
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'startup_recovery_failed',
        message: 'Failed to recover PRs from artifacts on startup',
        error
      });
    }

    try {
      // Get all tasks with PR information that are not yet merged
      const tasksWithPRs = await this.taskQueue.getTasksWithUnmergedPRs();

      if (tasksWithPRs.length === 0) {
        logger.info({
          category: 'pr-workflow',
          action: 'initialize_no_prs',
          message: 'No unmerged PRs found during initialization'
        });
        return;
      }

      logger.info({
        category: 'pr-workflow',
        action: 'initialize_found_prs',
        message: `Found ${tasksWithPRs.length} tasks with unmerged PRs`,
        details: {
          prCount: tasksWithPRs.length,
          prNumbers: tasksWithPRs.map(t => t.pr_number)
        }
      });

      // Note: PR monitoring now webhook-driven via GitHubWebhookHandler
      // No need to register PRs - webhooks will handle status updates

      logger.info({
        category: 'pr-workflow',
        action: 'initialize_complete',
        message: `PR workflow orchestrator initialized, monitoring ${tasksWithPRs.length} PRs`
      });
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'initialize_error',
        message: 'Failed to initialize PR workflow orchestrator',
        error
      });
    }
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
      await this.taskQueue.updateTask(task.id, {
        pr_number: prInfo.number,
        pr_url: prInfo.url,
        pr_branch: prInfo.branch,
        pr_status: 'pending_checks',
        pr_created_at: Date.now()
      });

      // Note: PR monitoring now webhook-driven via GitHubWebhookHandler
      logger.info({
        category: 'pr-workflow',
        action: 'pr_created_awaiting_webhook',
        message: `PR #${prInfo.number} created, webhook will handle status updates`,
        details: {
          taskId: task.id,
          prNumber: prInfo.number,
          prUrl: prInfo.url
        }
      });

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

    // Validate extracted PR number
    if (prNumber) {
      if (prNumber <= 0 || !Number.isInteger(prNumber)) {
        logger.warn({
          category: 'pr-workflow',
          action: 'invalid_pr_number',
          message: `Extracted invalid PR number: ${prNumber}`,
          details: { extractedValue: prNumber }
        });
        return null;
      }
    }

    // Validate extracted PR URL
    if (prUrl && !prUrl.startsWith('https://github.com/')) {
      logger.warn({
        category: 'pr-workflow',
        action: 'invalid_pr_url',
        message: `Extracted invalid PR URL: ${prUrl}`,
        details: { extractedUrl: prUrl }
      });
      prUrl = null; // Reset invalid URL, will use default
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
   * Get orchestrator status
   */
  getStatus() {
    return {
      ...this.prMonitor.getStatus(),
      config: this.config
    };
  }

  /**
   * Check if it's time to scan artifacts for orphaned PRs
   * Called periodically by the PR monitor
   */
  async checkForArtifactRecovery(): Promise<void> {
    // Throttle artifact scanning to avoid excessive disk I/O
    if (Date.now() - this.lastArtifactScan < this.ARTIFACT_SCAN_INTERVAL) {
      return;
    }

    this.lastArtifactScan = Date.now();

    try {
      const stats = await this.artifactRecovery.recoverOrphanedPRs();

      if (stats.prInfoRecovered > 0) {
        logger.info({
          category: 'pr-workflow',
          action: 'periodic_artifact_recovery',
          message: `Recovered ${stats.prInfoRecovered} PRs from artifacts during periodic scan`,
          details: { ...stats } as Record<string, unknown>
        });
      }
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'periodic_artifact_recovery_failed',
        message: 'Periodic artifact recovery failed',
        error
      });
    }
  }

  /**
   * Manual trigger for artifact recovery (useful for debugging and API endpoint)
   */
  async recoverFromArtifacts(): Promise<RecoveryStats> {
    logger.info({
      category: 'pr-workflow',
      action: 'manual_recovery_triggered',
      message: 'Manual artifact recovery triggered'
    });

    return await this.artifactRecovery.recoverOrphanedPRs();
  }

  /**
   * Get PR monitor service instance
   */
  getPRMonitor(): PRMonitorService {
    return this.prMonitor;
  }

  /**
   * Get GitHub PR service instance
   */
  getGitHubPRService() {
    return getGitHubPRService();
  }

}
