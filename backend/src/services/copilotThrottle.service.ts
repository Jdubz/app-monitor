/**
 * Copilot Throttle Manager
 *
 * Manages GitHub Copilot API usage to prevent rate limiting.
 * Tracks active Copilot tasks and enforces concurrency limits.
 *
 * Design Philosophy:
 * - Start conservative (3 concurrent tasks)
 * - Monitor for 429 errors and adjust limits
 * - Track active tasks in database (no in-memory state)
 * - Provide clear fallback to bot agents when throttled
 *
 * See: docs/investigations/PR_SELF_HEALING_EVENT_DRIVEN_DESIGN.md
 */

import { logger } from '../utils/logger.js';
import { TaskQueueService } from './taskQueue.sqlite.js';

export interface CopilotThrottleConfig {
  maxActiveTasks: number;  // Maximum concurrent Copilot tasks
  cooldownMs?: number;      // Optional cooldown after throttle errors
}

export class CopilotThrottleManager {
  private readonly MAX_ACTIVE_COPILOT_TASKS: number;
  private lastThrottleTime: number = 0;
  private cooldownMs: number;

  constructor(
    private readonly taskQueue: TaskQueueService,
    config?: Partial<CopilotThrottleConfig>
  ) {
    // Start conservative - can increase based on observation
    this.MAX_ACTIVE_COPILOT_TASKS = config?.maxActiveTasks ?? 3;
    this.cooldownMs = config?.cooldownMs ?? 0; // No cooldown by default
  }

  /**
   * Check if Copilot is available for a new task
   * Returns true if under concurrency limit and not in cooldown
   */
  async canUseCopilot(): Promise<boolean> {
    // Check cooldown period
    if (this.cooldownMs > 0) {
      const timeSinceThrottle = Date.now() - this.lastThrottleTime;
      if (timeSinceThrottle < this.cooldownMs) {
        logger.debug({
          category: 'copilot-throttle',
          action: 'cooldown_active',
          message: `Copilot in cooldown for ${this.cooldownMs - timeSinceThrottle}ms`,
          details: {
            cooldownRemaining: this.cooldownMs - timeSinceThrottle,
            lastThrottle: this.lastThrottleTime
          }
        });
        return false;
      }
    }

    // Check active task count
    const activeCount = await this.getActiveCopilotTaskCount();
    const available = activeCount < this.MAX_ACTIVE_COPILOT_TASKS;

    logger.debug({
      category: 'copilot-throttle',
      action: 'availability_check',
      message: `Copilot ${available ? 'available' : 'throttled'}`,
      details: {
        activeCount,
        maxActive: this.MAX_ACTIVE_COPILOT_TASKS,
        available
      }
    });

    return available;
  }

  /**
   * Get count of currently active Copilot tasks
   */
  private async getActiveCopilotTaskCount(): Promise<number> {
    try {
      const activeTasks = this.taskQueue.getActiveCopilotTasks();
      return activeTasks.length;
    } catch (error) {
      logger.error({
        category: 'copilot-throttle',
        action: 'count_failed',
        message: 'Failed to get active Copilot task count',
        error
      });
      // On error, assume max capacity to be safe
      return this.MAX_ACTIVE_COPILOT_TASKS;
    }
  }

  /**
   * Record a throttle error (429 response)
   * Triggers cooldown period if configured
   */
  recordThrottleError(error: Error): void {
    this.lastThrottleTime = Date.now();

    logger.warn({
      category: 'copilot-throttle',
      action: 'throttle_error_recorded',
      message: 'Copilot API throttle error detected',
      error,
      details: {
        cooldownMs: this.cooldownMs,
        maxActive: this.MAX_ACTIVE_COPILOT_TASKS,
        timestamp: this.lastThrottleTime
      }
    });
  }

  /**
   * Get current throttle statistics
   */
  async getStats(): Promise<{
    activeCount: number;
    maxActive: number;
    available: boolean;
    inCooldown: boolean;
    cooldownRemaining: number;
  }> {
    const activeCount = await this.getActiveCopilotTaskCount();
    const available = await this.canUseCopilot();
    const timeSinceThrottle = Date.now() - this.lastThrottleTime;
    const inCooldown = timeSinceThrottle < this.cooldownMs;
    const cooldownRemaining = inCooldown ? this.cooldownMs - timeSinceThrottle : 0;

    return {
      activeCount,
      maxActive: this.MAX_ACTIVE_COPILOT_TASKS,
      available,
      inCooldown,
      cooldownRemaining
    };
  }
}

// Singleton instance
let copilotThrottleManager: CopilotThrottleManager | null = null;

/**
 * Get or create the global Copilot throttle manager instance
 */
export function getCopilotThrottleManager(taskQueue?: TaskQueueService): CopilotThrottleManager {
  if (!copilotThrottleManager) {
    if (!taskQueue) {
      throw new Error('TaskQueueService required to initialize CopilotThrottleManager');
    }
    copilotThrottleManager = new CopilotThrottleManager(taskQueue);
  }
  return copilotThrottleManager;
}
