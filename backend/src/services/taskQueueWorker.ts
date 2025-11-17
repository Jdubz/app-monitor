/**
 * Task Queue Worker
 *
 * Background worker that continuously polls the task queue and assigns tasks
 * to available workers. Runs independently of the API to prevent blocking.
 */

import { logger } from '../utils/logger.js';
import type { TaskExecutionService } from './taskExecution.service.js';

export interface TaskQueueWorkerConfig {
  pollIntervalMs: number;
  enabled: boolean;
  maxConsecutiveFailures: number;
  maxPollIntervalMs?: number; // Maximum poll interval for exponential backoff
}

export class TaskQueueWorker {
  private running = false;
  private pollIntervalMs: number;
  private basePollIntervalMs: number; // Store original interval
  private maxPollIntervalMs: number; // Maximum interval for backoff
  private enabled: boolean;
  private maxConsecutiveFailures: number;
  private consecutiveFailures = 0;
  private taskExecutionService: TaskExecutionService;
  private pollTimeout: NodeJS.Timeout | null = null;
  private isHealthDegraded = false; // Track health status

  constructor(
    taskExecutionService: TaskExecutionService,
    config: Partial<TaskQueueWorkerConfig> = {}
  ) {
    this.taskExecutionService = taskExecutionService;
    this.basePollIntervalMs = config.pollIntervalMs ?? 5000; // 5 seconds default
    this.pollIntervalMs = this.basePollIntervalMs;
    this.maxPollIntervalMs = config.maxPollIntervalMs ?? 60000; // 60 seconds max backoff
    this.enabled = config.enabled ?? true;
    this.maxConsecutiveFailures = config.maxConsecutiveFailures ?? 10;
  }

  /**
   * Start the background worker loop
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      logger.info({
        category: 'process',
        action: 'worker_disabled',
        message: 'Task queue worker is disabled'
      });
      return;
    }

    if (this.running) {
      logger.warn({
        category: 'process',
        action: 'worker_already_running',
        message: 'Task queue worker is already running'
      });
      return;
    }

    this.running = true;
    this.consecutiveFailures = 0;

    logger.info({
      category: 'process',
      action: 'worker_started',
      message: `Task queue worker started (poll interval: ${this.pollIntervalMs}ms)`,
      details: {
        pollIntervalMs: this.pollIntervalMs,
        maxConsecutiveFailures: this.maxConsecutiveFailures
      }
    });

    // Start the worker loop
    this.scheduleNextPoll();
  }

  /**
   * Stop the background worker loop
   */
  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn({
        category: 'process',
        action: 'worker_not_running',
        message: 'Task queue worker is not running'
      });
      return;
    }

    this.running = false;

    // Clear any pending timeout
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    logger.info({
      category: 'process',
      action: 'worker_stopped',
      message: 'Task queue worker stopped',
      details: {
        consecutiveFailures: this.consecutiveFailures
      }
    });
  }

  /**
   * Schedule the next poll cycle
   */
  private scheduleNextPoll(): void {
    if (!this.running) {
      return;
    }

    // Log warning if we have excessive consecutive failures, but DO NOT stop the worker
    // Implement exponential backoff to reduce system load during sustained failures
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      // Mark worker as degraded for health monitoring
      if (!this.isHealthDegraded) {
        this.isHealthDegraded = true;
        logger.error({
          category: 'process',
          action: 'worker_health_degraded',
          message: `Task queue worker health degraded after ${this.consecutiveFailures} consecutive failures. Implementing exponential backoff.`,
          details: {
            consecutiveFailures: this.consecutiveFailures,
            maxConsecutiveFailures: this.maxConsecutiveFailures,
            currentPollInterval_ms: this.pollIntervalMs,
            maxPollInterval_ms: this.maxPollIntervalMs,
            alert: 'CRITICAL - Worker experiencing sustained polling failures. Check database, Docker, and system resources.'
          }
        });
      }

      // Apply exponential backoff (double interval, up to max)
      const newInterval = Math.min(this.pollIntervalMs * 2, this.maxPollIntervalMs);
      if (newInterval > this.pollIntervalMs) {
        logger.warn({
          category: 'process',
          action: 'worker_backoff_increased',
          message: `Increasing poll interval from ${this.pollIntervalMs}ms to ${newInterval}ms due to sustained failures`,
          details: {
            previousInterval_ms: this.pollIntervalMs,
            newInterval_ms: newInterval,
            consecutiveFailures: this.consecutiveFailures
          }
        });
        this.pollIntervalMs = newInterval;
      }

      // DO NOT reset counter - it will only reset on successful poll
      // This ensures the failure rate is accurately tracked
    }

    this.pollTimeout = setTimeout(() => {
      this.pollQueue().finally(() => {
        this.scheduleNextPoll();
      });
    }, this.pollIntervalMs);
  }

  /**
   * Poll the queue and try to assign a task
   */
  private async pollQueue(): Promise<void> {
    try {
      logger.debug({
        category: 'process',
        action: 'worker_poll_start',
        message: 'Polling task queue for pending tasks'
      });

      // Try to assign next task (non-blocking)
      await this.taskExecutionService.assignNextTask(() => {
        // Callback invoked after task assignment
        logger.debug({
          category: 'process',
          action: 'worker_task_assigned',
          message: 'Task assigned by worker'
        });
      });

      // Reset failure counter and restore normal polling on success
      if (this.consecutiveFailures > 0) {
        logger.info({
          category: 'process',
          action: 'worker_recovered',
          message: `Task queue worker recovered after ${this.consecutiveFailures} failures`,
          details: {
            previousFailures: this.consecutiveFailures,
            healthRestored: this.isHealthDegraded
          }
        });
        this.consecutiveFailures = 0;

        // Restore health status and normal poll interval
        if (this.isHealthDegraded) {
          this.isHealthDegraded = false;
          this.pollIntervalMs = this.basePollIntervalMs;
          logger.info({
            category: 'process',
            action: 'worker_health_restored',
            message: 'Task queue worker health fully restored',
            details: {
              pollInterval_ms: this.pollIntervalMs
            }
          });
        }
      }

    } catch (error) {
      this.consecutiveFailures++;

      logger.error({
        category: 'process',
        action: 'worker_poll_failed',
        message: `Task queue worker poll failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures})`,
        error,
        details: {
          consecutiveFailures: this.consecutiveFailures,
          maxConsecutiveFailures: this.maxConsecutiveFailures,
          willRetry: true, // Always true - worker never stops
          currentPollInterval_ms: this.pollIntervalMs,
          healthDegraded: this.isHealthDegraded
        }
      });
    }
  }

  /**
   * Get worker status
   */
  getStatus(): {
    running: boolean;
    enabled: boolean;
    consecutiveFailures: number;
    pollIntervalMs: number;
    healthStatus: 'healthy' | 'degraded';
  } {
    return {
      running: this.running,
      enabled: this.enabled,
      consecutiveFailures: this.consecutiveFailures,
      pollIntervalMs: this.pollIntervalMs,
      healthStatus: this.isHealthDegraded ? 'degraded' : 'healthy'
    };
  }
}
