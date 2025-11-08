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
}

export class TaskQueueWorker {
  private running = false;
  private pollIntervalMs: number;
  private enabled: boolean;
  private maxConsecutiveFailures: number;
  private consecutiveFailures = 0;
  private taskExecutionService: TaskExecutionService;
  private pollTimeout: NodeJS.Timeout | null = null;

  constructor(
    taskExecutionService: TaskExecutionService,
    config: Partial<TaskQueueWorkerConfig> = {}
  ) {
    this.taskExecutionService = taskExecutionService;
    this.pollIntervalMs = config.pollIntervalMs ?? 5000; // 5 seconds default
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

    // Check if we've exceeded max consecutive failures
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      logger.error({
        category: 'process',
        action: 'worker_max_failures_exceeded',
        message: `Task queue worker exceeded max consecutive failures (${this.maxConsecutiveFailures}). Stopping worker.`,
        details: {
          consecutiveFailures: this.consecutiveFailures,
          maxConsecutiveFailures: this.maxConsecutiveFailures
        }
      });
      this.running = false;
      return;
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

      // Reset failure counter on success
      if (this.consecutiveFailures > 0) {
        logger.info({
          category: 'process',
          action: 'worker_recovered',
          message: `Task queue worker recovered after ${this.consecutiveFailures} failures`
        });
        this.consecutiveFailures = 0;
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
          willRetry: this.consecutiveFailures < this.maxConsecutiveFailures
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
  } {
    return {
      running: this.running,
      enabled: this.enabled,
      consecutiveFailures: this.consecutiveFailures,
      pollIntervalMs: this.pollIntervalMs
    };
  }
}
