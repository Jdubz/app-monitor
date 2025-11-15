/**
 * PR Sync Service
 * 
 * Event-driven PR synchronization triggered by task completions.
 * Checks all tracked PRs against GitHub API to detect stale data
 * and resolves differences by calling existing webhook handlers.
 * 
 * Design: Event-driven, not timer-based. Aligns with master design intent.
 */

import { logger } from '../utils/logger.js';
import { TaskQueueService } from './taskQueue.sqlite.js';
import { GitHubPRService, getGitHubPRService } from './githubPR.service.js';
import { PullRequestHandler } from './webhookHandlers/pullRequestHandler.js';
import type { GitHubPullRequestPayload } from './webhookHandlers/types.js';

interface PRSyncDelta {
  prNumber: number;
  expectedState: 'open' | 'unknown';
  actualState: 'open' | 'closed' | 'merged' | 'deleted';
  tasksAffected: string[];
}

/**
 * PR Sync Service
 * 
 * Syncs PR state from GitHub to detect stale task data.
 * Triggered every N task completions (event-driven, not timer-based).
 */
export class PRSyncService {
  private readonly taskQueue: TaskQueueService;
  private readonly githubPR: GitHubPRService;
  private pullRequestHandler: PullRequestHandler | null = null;

  constructor(taskQueue: TaskQueueService) {
    this.taskQueue = taskQueue;
    this.githubPR = getGitHubPRService();
  }

  /**
   * Set pull request handler for delta resolution
   */
  setPullRequestHandler(handler: PullRequestHandler): void {
    this.pullRequestHandler = handler;
  }

  /**
   * Sync all PRs tracked in open/active tasks
   * Logs deltas and resolves differences
   */
  async syncAllTrackedPRs(): Promise<void> {
    try {
      // 1. Get unique PR numbers from open/active tasks
      const prNumbers = await this.getTrackedPRNumbers();

      if (prNumbers.length === 0) {
        logger.debug({
          category: 'pr-sync',
          action: 'sync_skipped',
          message: 'No PRs to sync (no open/active tasks with pr_number)'
        });
        return;
      }

      logger.info({
        category: 'pr-sync',
        action: 'sync_started',
        message: `Checking ${prNumbers.length} tracked PRs`,
        details: { prCount: prNumbers.length }
      });

      // 2. Check each PR's actual state from GitHub
      const deltas: PRSyncDelta[] = [];

      for (const prNumber of prNumbers) {
        try {
          const delta = await this.checkPRDelta(prNumber);
          if (delta) {
            deltas.push(delta);
          }
        } catch (error) {
          logger.error({
            category: 'pr-sync',
            action: 'check_pr_failed',
            message: `Failed to check PR #${prNumber}`,
            error,
            details: { prNumber }
          });
          // Continue checking other PRs
        }
      }

      // 3. Log all deltas
      if (deltas.length > 0) {
        logger.warn({
          category: 'pr-sync',
          action: 'stale_prs_detected',
          message: `Found ${deltas.length} stale PRs (out of ${prNumbers.length} checked)`,
          details: { 
            deltasCount: deltas.length,
            totalChecked: prNumbers.length,
            deltas: deltas.map(d => ({
              prNumber: d.prNumber,
              actualState: d.actualState,
              taskCount: d.tasksAffected.length
            }))
          }
        });

        // 4. Resolve differences by calling existing webhook handlers
        await this.resolveDeltas(deltas);
      } else {
        logger.info({
          category: 'pr-sync',
          action: 'pr_sync_complete',
          message: `All ${prNumbers.length} PRs in sync (no stale data detected)`
        });
      }
    } catch (error) {
      logger.error({
        category: 'pr-sync',
        action: 'sync_failed',
        message: 'PR sync failed',
        error
      });
      // Don't throw - this is fire-and-forget
    }
  }

  /**
   * Get unique PR numbers from open/active tasks
   */
  private async getTrackedPRNumbers(): Promise<number[]> {
    const pendingTasks = await this.taskQueue.getTasksByStatus('pending');
    const runningTasks = await this.taskQueue.getTasksByStatus('running');
    const allTasks = [...pendingTasks, ...runningTasks];

    const prNumbers = new Set<number>();
    for (const task of allTasks) {
      if (task.pr_number) {
        prNumbers.add(task.pr_number);
      }
    }

    return Array.from(prNumbers).sort((a, b) => a - b);
  }

  /**
   * Check if PR state differs from expected
   * Returns delta if PR is stale, null if in sync
   */
  private async checkPRDelta(prNumber: number): Promise<PRSyncDelta | null> {
    const tasks = await this.taskQueue.findByPRNumber(prNumber);
    const hasPendingTasks = tasks.some(t => 
      t.status === 'pending' || t.status === 'running'
    );

    if (!hasPendingTasks) {
      // All tasks complete, no need to sync
      return null;
    }

    // Fetch actual PR state from GitHub
    try {
      const prStatus = await this.githubPR.getPRStatus(prNumber);

      if (prStatus.state === 'CLOSED' || prStatus.state === 'MERGED') {
        return {
          prNumber,
          expectedState: 'open',
          actualState: prStatus.state === 'MERGED' ? 'merged' : 'closed',
          tasksAffected: tasks.map(t => t.id)
        };
      }

      // PR is still open, no delta
      return null;

    } catch (error: any) {
      if (error.status === 404 || error.response?.status === 404) {
        // PR was deleted
        return {
          prNumber,
          expectedState: 'open',
          actualState: 'deleted',
          tasksAffected: tasks.map(t => t.id)
        };
      }
      throw error;
    }
  }

  /**
   * Resolve deltas by calling existing webhook handlers
   */
  private async resolveDeltas(deltas: PRSyncDelta[]): Promise<void> {
    if (!this.pullRequestHandler) {
      logger.warn({
        category: 'pr-sync',
        action: 'resolve_skipped',
        message: 'Cannot resolve deltas: pull request handler not set',
        details: { deltaCount: deltas.length }
      });
      return;
    }

    for (const delta of deltas) {
      try {
        logger.info({
          category: 'pr-sync',
          action: 'resolving_delta',
          message: `PR #${delta.prNumber} is ${delta.actualState}, cleaning up ${delta.tasksAffected.length} tasks`,
          details: {
            prNumber: delta.prNumber,
            actualState: delta.actualState,
            tasksAffected: delta.tasksAffected
          }
        });

        // Create minimal payload for pull request handler
        const payload: GitHubPullRequestPayload = {
          action: 'closed',
          number: delta.prNumber,
          pull_request: {
            number: delta.prNumber,
            state: 'closed',
            merged: delta.actualState === 'merged',
            title: `PR #${delta.prNumber}`,
            head: { ref: '', sha: '' },
            user: { login: 'pr-sync-service' }
          } as any,
          repository: {
            full_name: 'pr-sync/auto',
            owner: { login: 'pr-sync' },
            name: 'auto'
          } as any
        };

        // Delegate to existing pull request handler
        await this.pullRequestHandler.handle(payload);

        logger.info({
          category: 'pr-sync',
          action: 'delta_resolved',
          message: `PR #${delta.prNumber} delta resolved successfully`,
          details: { prNumber: delta.prNumber }
        });

      } catch (error) {
        logger.error({
          category: 'pr-sync',
          action: 'resolve_delta_failed',
          message: `Failed to resolve delta for PR #${delta.prNumber}`,
          error,
          details: { delta }
        });
        // Continue resolving other deltas
      }
    }
  }
}

/**
 * Get singleton instance of PR sync service
 */
let prSyncServiceInstance: PRSyncService | null = null;

export function getPRSyncService(taskQueue?: TaskQueueService): PRSyncService {
  if (!prSyncServiceInstance && taskQueue) {
    prSyncServiceInstance = new PRSyncService(taskQueue);
  }
  if (!prSyncServiceInstance) {
    throw new Error('PR sync service not initialized');
  }
  return prSyncServiceInstance;
}
