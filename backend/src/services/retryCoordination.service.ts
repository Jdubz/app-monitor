import { logger } from '../utils/logger.js';
import { TaskQueueService, Task } from './taskQueue.sqlite.js';
import { RetryManager, RetryConfig } from './retryManager.js';

export interface RetryAttempt {
  attemptNumber: number;
  timestamp: string;
  reason: string;
  error?: string;
  exitCode?: number;
  duration?: number;
  workerId?: string;
  agentId?: string;
}

/**
 * Service responsible for coordinating task retry operations
 * Extracted from DevBotsManager to reduce complexity
 */
export class RetryCoordinationService {
  constructor(
    private taskQueue: TaskQueueService,
    private retryManager: RetryManager,
    private emitEvent: (event: string, ...args: any[]) => void,
    private assignNextTask: () => Promise<void>
  ) {}

  /**
   * Handle task retry when it becomes ready
   */
  async handleTaskRetry(task: Task): Promise<void> {
    try {
      logger.info({
        category: 'process',
        action: 'handling_retry_for_task_task_id',
        message: `Handling retry for task ${task.id}`
      });

      // Reset task status for retry
      task.status = 'pending';
      task.assigned_worker = undefined;
      task.assigned_at = undefined;
      task.error = undefined;

      // Add task back to queue
      await this.taskQueue.updateTask(task.id, task);

      // Emit retry event
      this.emitEvent('taskRetrying', task);

      // Try to assign the retry task
      await this.assignNextTask();
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_handle_retry_for_task_task_id',
        message: `Failed to handle retry for task ${task.id}:`,
        error: error
      });
      this.emitEvent('taskRetryFailed', task, error);
    }
  }

  /**
   * Manually retry a failed task
   */
  async retryTask(taskId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    try {
      // Find the task in SQLite
      const task = await this.taskQueue.getTask(taskId);
      if (!task) {
        return { success: false, message: 'Task not found' };
      }

      if (task.status !== 'failed') {
        return { success: false, message: 'Task is not in failed status' };
      }

      // Check if task can be retried
      if (!this.retryManager.canRetryTask(task)) {
        return { success: false, message: 'Task cannot be retried' };
      }

      // Manual retry - add task back to queue
      const retryResult = this.retryManager.retryTask(task, reason || 'Manual retry');

      if (retryResult.success) {
        // Update retry task in queue
        await this.taskQueue.updateTask(retryResult.task.id, retryResult.task);

        this.emitEvent('taskRetrying', retryResult.task);
        return { success: true, message: 'Task queued for retry' };
      } else {
        return { success: false, message: retryResult.reason || 'Failed to retry task' };
      }
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_retry_task_taskid',
        message: `Failed to retry task ${taskId}:`,
        error: error
      });
      return { success: false, message: `Failed to retry task: ${error}` };
    }
  }

  /**
   * Cancel a scheduled retry (not needed for manual retry)
   */
  cancelRetry(_taskId: string): { success: boolean; message: string } {
    return { success: false, message: 'Manual retry cannot be cancelled once started' };
  }

  /**
   * Get retry information for a task
   */
  async getRetryInfo(taskId: string): Promise<{
    canRetry: boolean;
    retryCount: number;
    maxRetries: number;
    retryHistory: RetryAttempt[];
    scheduledRetries: Array<{ taskId: string; retryAt: string; retryCount: number }>;
  }> {
    const task = await this.taskQueue.getTask(taskId);
    const retryHistory = this.retryManager.getRetryHistory(taskId);

    return {
      canRetry: task?.can_retry ?? (task?.status === 'failed'),
      retryCount: task?.retry_count || 0,
      maxRetries: task?.max_retries || this.retryManager.getConfig().max_retries,
      retryHistory,
      scheduledRetries: [] // Manual retry system - no scheduled retries
    };
  }

  /**
   * Get all retry statistics
   */
  getRetryStats(): {
    totalRetries: number;
    successfulRetries: number;
    failedRetries: number;
    scheduledRetries: number;
    retryConfig: RetryConfig;
  } {
    const stats = this.retryManager.getRetryStats();
    const config = this.retryManager.getConfig();

    return {
      ...stats,
      scheduledRetries: 0, // Manual retry system - no scheduled retries
      retryConfig: config
    };
  }

  /**
   * Get retry manager instance (for state persistence)
   */
  getRetryManager(): RetryManager {
    return this.retryManager;
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryManager.updateConfig(config);
    this.emitEvent('retryConfigUpdated', config);
    logger.info({
      category: 'process',
      action: 'retry_configuration_updated',
      message: 'Retry configuration updated',
      details: { config }
    });
  }
}
