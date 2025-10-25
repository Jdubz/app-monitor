/**
 * Manual Retry Manager Service for Dev-Monitor
 * 
 * Simple manual retry functionality - no automatic retries
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { Task, RetryAttempt } from './claudeWorkersManager.js';

export interface RetryConfig {
  maxRetries: number;
}

export interface RetryResult {
  success: boolean;
  task: Task;
  retryAttempt?: RetryAttempt;
  reason?: string;
}

export class RetryManager extends EventEmitter {
  private config: RetryConfig;
  private retryHistory: Map<string, RetryAttempt[]> = new Map();

  constructor(config: Partial<RetryConfig> = {}) {
    super();
    this.config = {
      maxRetries: 3,
      ...config,
    };
    logger.info({
      category: 'process',
      action: 'manual_retrymanager_initialized',
      message: 'Manual RetryManager initialized'
    });
  }

  /**
   * Check if a task can be manually retried
   */
  public canRetryTask(task: Task): boolean {
    // Only failed tasks can be retried
    if (task.status !== 'failed') {
      return false;
    }

    // Check if max retries exceeded
    const retryCount = task.retryCount || 0;
    const maxRetries = task.maxRetries || this.config.maxRetries;
    if (retryCount >= maxRetries) {
      logger.info({
      category: 'process',
      action: 'task_task_id_has_exceeded_max_retries_retrycount_m',
      message: `Task ${task.id} has exceeded max retries (${retryCount}/${maxRetries})`
    });
      return false;
    }

    // Check if task explicitly cannot be retried
    if (task.canRetry === false) {
      logger.info({
      category: 'process',
      action: 'task_task_id_has_canretry_set_to_false',
      message: `Task ${task.id} has canRetry set to false`
    });
      return false;
    }

    // If canRetry is explicitly true or undefined, allow retry
    return true;
  }

  /**
   * Manually retry a task (immediate retry)
   */
  public retryTask(task: Task, reason: string = 'Manual retry'): RetryResult {
    if (!this.canRetryTask(task)) {
      return {
        success: false,
        task,
        reason: 'Task cannot be retried'
      };
    }

    const retryCount = (task.retryCount || 0) + 1;
    
    const retryAttempt: RetryAttempt = {
      attemptNumber: retryCount,
      timestamp: new Date().toISOString(),
      reason,
      error: task.error,
      exitCode: task.exitCode,
      workerId: task.assignedWorker,
      agentId: task.assignedAgent
    };

    const retryTask: Task = {
      ...task,
      status: 'pending', // Reset to pending for retry
      retryCount,
      retryReason: reason,
      retryHistory: [...(task.retryHistory || []), retryAttempt],
      assignedWorker: undefined,
      assignedAt: undefined,
      error: undefined,
      exitCode: undefined
    };

    // Store retry history
    this.retryHistory.set(task.id, retryTask.retryHistory || []);

    logger.info({
      category: 'process',
      action: 'task_task_id_manually_retried_attempt_retrycount_r',
      message: `Task ${task.id} manually retried (attempt ${retryCount}/${retryTask.maxRetries || this.config.maxRetries})`
    });
    
    return {
      success: true,
      task: retryTask,
      retryAttempt,
      reason: `Manual retry scheduled`
    };
  }

  /**
   * Get retry history for a task
   */
  public getRetryHistory(taskId: string): RetryAttempt[] {
    return this.retryHistory.get(taskId) || [];
  }

  /**
   * Get retry statistics
   */
  public getRetryStats(): {
    totalRetries: number;
    successfulRetries: number;
    failedRetries: number;
  } {
    let totalRetries = 0;
    const successfulRetries = 0;
    const failedRetries = 0;

    for (const history of this.retryHistory.values()) {
      totalRetries += history.length;
      // Note: We can't determine success/failure from history alone
      // This would need to be tracked separately if needed
    }

    return {
      totalRetries,
      successfulRetries,
      failedRetries
    };
  }

  /**
   * Update retry configuration
   */
  public updateConfig(newConfig: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info({
      category: 'process',
      action: 'retry_config_updated',
      message: 'Retry configuration updated',
      details: { config: this.config }
    });
  }

  /**
   * Get current configuration
   */
  public getConfig(): RetryConfig {
    return this.config;
  }

  /**
   * Clear retry history for a specific task
   */
  public clearRetryHistory(taskId: string): void {
    this.retryHistory.delete(taskId);
    logger.info({
      category: 'process',
      action: 'retry_history_cleared_for_task_taskid',
      message: `Retry history cleared for task ${taskId}`
    });
  }

  /**
   * Clear all retry history
   */
  public clearAllRetries(): void {
    this.retryHistory.clear();
    logger.info({
      category: 'process',
      action: 'all_retry_history_cleared',
      message: 'All retry history cleared'
    });
  }
}