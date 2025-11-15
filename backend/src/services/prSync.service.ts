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
import type { TaskQueueService, Task } from './taskQueue.sqlite.js';
import { GitHubPRService, getGitHubPRService } from './githubPR.service.js';
import type { PullRequestHandler } from './webhookHandlers/pullRequestHandler.js';
import type { GitHubPullRequestPayload } from './webhookHandlers/types.js';
import { config } from '../config.js';

interface PRSyncDelta {
  prNumber: number;
  expectedState: 'open' | 'unknown';
  actualState: 'open' | 'closed' | 'merged' | 'deleted';
  tasksAffected: string[];
}

interface PRSyncStats {
  syncs_triggered: number;
  syncs_completed: number;
  syncs_failed: number;
  total_prs_checked: number;
  total_stale_prs_found: number;
  total_deltas_resolved: number;
  last_sync_timestamp: number;
  github_api_calls: number;
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
  private stats: PRSyncStats = {
    syncs_triggered: 0,
    syncs_completed: 0,
    syncs_failed: 0,
    total_prs_checked: 0,
    total_stale_prs_found: 0,
    total_deltas_resolved: 0,
    last_sync_timestamp: 0,
    github_api_calls: 0
  };

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
   * Get sync statistics
   */
  getStats(): PRSyncStats {
    return { ...this.stats };
  }

  /**
   * Sync all PRs tracked in pending/running tasks
   * Logs deltas and resolves differences
   */
  async syncAllTrackedPRs(): Promise<void> {
    this.stats.syncs_triggered++;
    
    try {
      // 1. Get unique PR numbers from pending/running tasks (single query)
      const prTasksMap = await this.getTrackedPRsWithTasks();

      if (prTasksMap.size === 0) {
        logger.debug({
          category: 'pr-sync',
          action: 'sync_skipped',
          message: 'No PRs to sync (no pending/running tasks with pr_number)'
        });
        this.stats.syncs_completed++;
        return;
      }

      logger.info({
        category: 'pr-sync',
        action: 'sync_started',
        message: `Checking ${prTasksMap.size} tracked PRs`,
        details: { prCount: prTasksMap.size }
      });

      // 2. Check each PR's actual state from GitHub (parallel with concurrency limit)
      const deltas = await this.checkPRDeltas(prTasksMap);
      
      this.stats.total_prs_checked += prTasksMap.size;
      this.stats.total_stale_prs_found += deltas.length;

      // 3. Log all deltas
      if (deltas.length > 0) {
        logger.warn({
          category: 'pr-sync',
          action: 'stale_prs_detected',
          message: `Found ${deltas.length} stale PRs (out of ${prTasksMap.size} checked)`,
          details: { 
            deltasCount: deltas.length,
            totalChecked: prTasksMap.size,
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
          message: `All ${prTasksMap.size} PRs in sync (no stale data detected)`
        });
      }

      this.stats.syncs_completed++;
      this.stats.last_sync_timestamp = Date.now();
    } catch (error: unknown) {
      this.stats.syncs_failed++;
      
      // Special handling for rate limits - don't log as error
      const err = error as { message?: string };
      if (err.message === 'RATE_LIMITED') {
        logger.warn({
          category: 'pr-sync',
          action: 'sync_rate_limited',
          message: 'PR sync aborted due to GitHub API rate limit, will retry on next threshold'
        });
        return;
      }
      
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
   * Get tracked PR numbers with their associated tasks (single DB query)
   * Fixes N+1 query problem
   */
  private async getTrackedPRsWithTasks(): Promise<Map<number, Task[]>> {
    const pendingTasks = await this.taskQueue.getTasksByStatus('pending');
    const runningTasks = await this.taskQueue.getTasksByStatus('running');
    const allTasks = [...pendingTasks, ...runningTasks];

    const prTasksMap = new Map<number, Task[]>();
    for (const task of allTasks) {
      if (task.pr_number) {
        if (!prTasksMap.has(task.pr_number)) {
          prTasksMap.set(task.pr_number, []);
        }
        prTasksMap.get(task.pr_number)!.push(task);
      }
    }

    return prTasksMap;
  }

  /**
   * Check PR deltas in parallel with concurrency limit
   * Improves performance vs serial processing
   */
  private async checkPRDeltas(prTasksMap: Map<number, Task[]>): Promise<PRSyncDelta[]> {
    const CONCURRENT_PR_CHECKS = 5; // Respect GitHub API rate limits
    const prNumbers = Array.from(prTasksMap.keys());
    const chunks: number[][] = [];
    
    // Split into chunks for parallel processing
    for (let i = 0; i < prNumbers.length; i += CONCURRENT_PR_CHECKS) {
      chunks.push(prNumbers.slice(i, i + CONCURRENT_PR_CHECKS));
    }

    const deltas: PRSyncDelta[] = [];
    
    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(prNumber => this.checkPRDelta(prNumber, prTasksMap.get(prNumber)!))
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const prNumber = chunk[i];
        
        if (result.status === 'fulfilled' && result.value) {
          deltas.push(result.value);
        } else if (result.status === 'rejected') {
          // Check if it's a rate limit error - if so, abort entire sync
          if (result.reason?.message === 'RATE_LIMITED') {
            throw new Error('RATE_LIMITED');
          }
          
          logger.error({
            category: 'pr-sync',
            action: 'check_pr_failed',
            message: `Failed to check PR #${prNumber}`,
            error: result.reason,
            details: { prNumber }
          });
        }
      }
    }

    return deltas;
  }

  /**
   * Check if PR state differs from expected
   * Returns delta if PR is stale, null if in sync
   */
  private async checkPRDelta(prNumber: number, tasks: Task[]): Promise<PRSyncDelta | null> {
    const hasPendingTasks = tasks.some(t => 
      t.status === 'pending' || t.status === 'running'
    );

    if (!hasPendingTasks) {
      // All tasks complete, no need to sync
      return null;
    }

    // Fetch actual PR state from GitHub
    try {
      this.stats.github_api_calls++;
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

    } catch (error: unknown) {
      // Handle rate limiting - abort entire sync
      const err = error as { status?: number; response?: { status?: number; data?: { message?: string } }; message?: string };
      if (err.status === 403 || err.response?.status === 403) {
        const errorMessage = err.message || err.response?.data?.message || '';
        if (errorMessage.toLowerCase().includes('rate limit')) {
          logger.warn({
            category: 'pr-sync',
            action: 'rate_limited',
            message: 'GitHub API rate limited, aborting PR sync',
            details: { prNumber }
          });
          throw new Error('RATE_LIMITED');
        }
      }
      
      // Handle GitHub API unavailable
      if (err.status === 502 || err.status === 503 || 
          err.response?.status === 502 || err.response?.status === 503) {
        logger.warn({
          category: 'pr-sync',
          action: 'github_unavailable',
          message: `GitHub API unavailable (${err.status || err.response?.status}), skipping PR #${prNumber}`,
          details: { prNumber, status: err.status || err.response?.status }
        });
        return null; // Skip this PR, continue with others
      }
      
      // Handle PR deleted (404)
      if (err.status === 404 || err.response?.status === 404) {
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

        // Create properly typed payload for pull request handler
        const payload = this.createSyncPayload(delta.prNumber, delta.actualState === 'merged');

        // Delegate to existing pull request handler
        await this.pullRequestHandler.handle(payload);

        this.stats.total_deltas_resolved++;
        
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

  /**
   * Create properly typed webhook payload from config
   * Uses actual repository info instead of hardcoded values
   */
  private createSyncPayload(prNumber: number, merged: boolean): GitHubPullRequestPayload {
    // Extract repo info from config
    const repoUrl = config.devBots.repositoryUrl;
    const repoFullName = repoUrl
      .replace('https://github.com/', '')
      .replace('.git', '');
    const [owner, name] = repoFullName.split('/');

    return {
      action: 'closed',
      number: prNumber,
      pull_request: {
        number: prNumber,
        state: 'closed',
        merged,
        title: `PR #${prNumber}`,
        head: { 
          ref: `pr-${prNumber}`, 
          sha: '' 
        },
        user: { 
          login: 'pr-sync-service' 
        },
        draft: false,
        body: 'PR sync service detected stale PR data'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, // Minimal fields - handler will query GitHub if needed
      repository: {
        full_name: repoFullName,
        owner: { login: owner },
        name: name
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    };
  }
}

/**
 * Singleton instance
 */
let prSyncServiceInstance: PRSyncService | null = null;

/**
 * Initialize PR sync service (should be called once from server.ts)
 */
export function initializePRSyncService(taskQueue: TaskQueueService): PRSyncService {
  if (!prSyncServiceInstance) {
    prSyncServiceInstance = new PRSyncService(taskQueue);
  }
  return prSyncServiceInstance;
}

/**
 * Get PR sync service instance
 * @throws Error if not initialized
 */
export function getPRSyncService(): PRSyncService {
  if (!prSyncServiceInstance) {
    throw new Error('PR sync service not initialized. Call initializePRSyncService() first.');
  }
  return prSyncServiceInstance;
}
