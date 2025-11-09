/**
 * Manual Retry Manager Service for Dev-Monitor
 * 
 * Simple manual retry functionality - no automatic retries
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { Task, RetryAttempt } from './devBotsManager.js';

export interface RetryConfig {
  max_retries: number;
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
      max_retries: 3,
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
    const retryCount = task.retry_count || 0;
    const maxRetries = task.max_retries || this.config.max_retries;
    if (retryCount >= maxRetries) {
      logger.info({
      category: 'process',
      action: 'task_task_id_has_exceeded_max_retries_retrycount_m',
      message: `Task ${task.id} has exceeded max retries (${retryCount}/${maxRetries})`
    });
      return false;
    }

    // Check if task explicitly cannot be retried
    if (task.can_retry === false) {
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

    const retryCount = (task.retry_count || 0) + 1;
    
    const taskWithExtras = task as Task & { exitCode?: number; retryHistory?: RetryAttempt[] };

    const retryAttempt: RetryAttempt = {
      attemptNumber: retryCount,
      timestamp: new Date().toISOString(),
      reason,
      error: task.error,
      exitCode: taskWithExtras.exitCode,
      workerId: task.assigned_worker,
      agentId: task.assigned_agent
    };

    const retryTask: Task = {
      ...task,
      status: 'pending', // Reset to pending for retry
      retry_count: retryCount,
      assigned_worker: undefined,
      assigned_at: undefined,
      error: undefined
    };

    // Store extended retry info
    const retryTaskWithExtras = retryTask as Task & { retryReason?: string; retryHistory?: RetryAttempt[]; exitCode?: number };
    retryTaskWithExtras.retryReason = reason;
    retryTaskWithExtras.retryHistory = [...(taskWithExtras.retryHistory || []), retryAttempt];
    retryTaskWithExtras.exitCode = undefined;

    // Store retry history
    this.retryHistory.set(task.id, retryTaskWithExtras.retryHistory || []);

    logger.info({
      category: 'process',
      action: 'task_task_id_manually_retried_attempt_retrycount_r',
      message: `Task ${task.id} manually retried (attempt ${retryCount}/${retryTask.max_retries || this.config.max_retries})`
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