/**
 * Chain Lifecycle Management Service
 * 
 * Responsibilities:
 * - Count active chains (non-blocked)
 * - Detect chain completion (PR merged + all tasks done)
 * - Mark chains as closed
 * - Handle blocked/unblocked transitions
 * - Provide chain statistics for UI
 * 
 * See: docs/technicalDesigns/staged-task-queue-implementation-plan.md
 */

import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { getPlanStatusUpdater } from './planStatusUpdater.singleton.js';

export interface ChainStats {
  activeChains: number;
  blockedChains: number;
  implementationQueueDepth: number;
  followupQueueDepth: number;
  maxConcurrentChains: number;
}

export interface BlockedChain {
  chain_id: string;
  blocked_reason: string;
  blocked_at: number;
  blocked_by: string;
  task_count: number;
}

export class ChainTrackerService {
  constructor(private db: Database.Database) {}

  /**
   * Count active chains (non-blocked)
   * 
   * A chain is active if:
   * 1. chain_status = 'active'
   * 2. Has at least one task with status IN ('pending', 'assigned', 'active', 'retrying')
   * 3. Excludes Copilot tasks (per master intent - Copilot delegation doesn't count toward concurrency)
   */
  countActiveChains(): number {
    const result = this.db.prepare(`
      SELECT COUNT(DISTINCT chain_id) as count
      FROM tasks
      WHERE chain_status = 'active'
      AND chain_id IS NOT NULL
      AND status IN ('pending', 'assigned', 'active', 'retrying')
      AND (assigned_agent IS NULL OR assigned_agent != 'copilot')
    `).get() as { count: number };
    
    return result.count;
  }

  /**
   * Count blocked chains (excludes Copilot per master intent)
   */
  countBlockedChains(): number {
    const result = this.db.prepare(`
      SELECT COUNT(DISTINCT chain_id) as count
      FROM tasks
      WHERE chain_status = 'blocked'
      AND chain_id IS NOT NULL
      AND (assigned_agent IS NULL OR assigned_agent != 'copilot')
    `).get() as { count: number };
    
    return result.count;
  }

  /**
   * Get queue depths
   */
  getQueueDepths(): { implementation: number; followup: number } {
    const implResult = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM tasks
      WHERE queue_stage = 'implementation'
      AND status = 'pending'
    `).get() as { count: number };

    const followupResult = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM tasks
      WHERE queue_stage = 'followup'
      AND status = 'pending'
      AND chain_status != 'blocked'
    `).get() as { count: number };

    return {
      implementation: implResult.count,
      followup: followupResult.count
    };
  }

  /**
   * Check if chains are complete and mark them closed
   * 
   * Complete means:
   * 1. PR is merged (pr_status = 'merged')
   * 2. No pending/active tasks in the chain
   * 
   * Returns number of chains closed
   */
  closeCompletedChains(): number {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET chain_status = 'closed'
      WHERE chain_id IN (
        SELECT DISTINCT t1.chain_id
        FROM tasks t1
        WHERE t1.chain_id IS NOT NULL
        AND t1.pr_status = 'merged'
        AND NOT EXISTS (
          SELECT 1 FROM tasks t2
          WHERE t2.chain_id = t1.chain_id
          AND t2.status IN ('pending', 'assigned', 'active', 'retrying')
        )
        AND t1.chain_status != 'closed'
      )
    `);

    const result = stmt.run();
    const closedCount = result.changes;

    if (closedCount > 0) {
      logger.info({
        category: 'process',
        action: 'chains_closed',
        message: `Closed ${closedCount} completed chain(s)`,
        details: { closedCount }
      });
    }

    return closedCount;
  }

  /**
   * Mark a chain as blocked
   */
  blockChain(chainId: string, reason: string, blockedBy: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET chain_status = 'blocked',
          blocked_reason = ?,
          blocked_at = ?,
          blocked_by = ?
      WHERE chain_id = ?
      AND chain_status != 'closed'
    `);

    stmt.run(reason, now, blockedBy, chainId);

    logger.warn({
      category: 'process',
      action: 'chain_blocked',
      message: `Chain ${chainId} blocked: ${reason}`,
      details: { chainId, reason, blockedBy, blockedAt: now }
    });

    // Trigger plan status update for all tasks in this chain
    const planStatusUpdater = getPlanStatusUpdater();
    if (planStatusUpdater) {
      planStatusUpdater.onChainBlocked(chainId).catch((error: unknown) => {
        logger.error({
          category: 'plan',
          action: 'plan_status_update_failed',
          message: `Failed to update plan status after chain blocked: ${chainId}`,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
    }
  }

  /**
   * Unblock a chain
   */
  unblockChain(chainId: string, unblockedBy: string): void {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET chain_status = 'active',
          blocked_reason = NULL,
          blocked_at = NULL
      WHERE chain_id = ?
      AND chain_status = 'blocked'
    `);

    stmt.run(chainId);

    logger.info({
      category: 'process',
      action: 'chain_unblocked',
      message: `Chain ${chainId} unblocked by ${unblockedBy}`,
      details: { chainId, unblockedBy }
    });

    // Trigger plan status update for all tasks in this chain
    const planStatusUpdater = getPlanStatusUpdater();
    if (planStatusUpdater) {
      planStatusUpdater.onChainUnblocked(chainId).catch((error: unknown) => {
        logger.error({
          category: 'plan',
          action: 'plan_status_update_failed',
          message: `Failed to update plan status after chain unblocked: ${chainId}`,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
    }
  }

  /**
   * Get all blocked chains with details (excludes Copilot per master intent)
   */
  getBlockedChains(): BlockedChain[] {
    const stmt = this.db.prepare(`
      SELECT 
        chain_id,
        blocked_reason,
        blocked_at,
        blocked_by,
        COUNT(*) as task_count
      FROM tasks
      WHERE chain_status = 'blocked'
      AND chain_id IS NOT NULL
      AND (assigned_agent IS NULL OR assigned_agent != 'copilot')
      GROUP BY chain_id, blocked_reason, blocked_at, blocked_by
      ORDER BY blocked_at DESC
    `);

    return stmt.all() as BlockedChain[];
  }

  /**
   * Get comprehensive chain statistics
   */
  getChainStats(maxConcurrentChains: number): ChainStats {
    const activeChains = this.countActiveChains();
    const blockedChains = this.countBlockedChains();
    const depths = this.getQueueDepths();

    return {
      activeChains,
      blockedChains,
      implementationQueueDepth: depths.implementation,
      followupQueueDepth: depths.followup,
      maxConcurrentChains
    };
  }
}
