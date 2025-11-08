/**
 * Tests for Manual Retry Manager Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetryManager } from './retryManager.js';
import { Task } from './taskQueue.sqlite.js';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('RetryManager', () => {
  let retryManager: RetryManager;
  let mockTask: Task;

  beforeEach(() => {
    retryManager = new RetryManager();
    mockTask = {
      id: 'test-task-1',
      type: 'test',
      title: 'Test task',
      description: 'Test task',
      status: 'failed',
      created_at: Date.now(),
      assigned_agent: 'test-agent',
      error: 'Test error',
      retry_count: 0,
      max_retries: 3,
      can_retry: true,
      priority: 5,
      timeout_ms: null
    };
  });

  describe('canRetryTask', () => {
    it('should return true for retryable failed task', () => {
      expect(retryManager.canRetryTask(mockTask)).toBe(true);
    });

    it('should return false for non-failed task', () => {
      mockTask.status = 'completed';
      expect(retryManager.canRetryTask(mockTask)).toBe(false);
    });

    it('should return false when max retries exceeded', () => {
      mockTask.retry_count = 3;
      expect(retryManager.canRetryTask(mockTask)).toBe(false);
    });

    it('should return false when canRetry is false', () => {
      mockTask.can_retry = false;
      expect(retryManager.canRetryTask(mockTask)).toBe(false);
    });
  });

  describe('retryTask', () => {
    it('should retry a task successfully', () => {
      const result = retryManager.retryTask(mockTask, 'Manual retry');

      expect(result.success).toBe(true);
      expect(result.task.status).toBe('pending');
      expect(result.task.retry_count).toBe(1);
      expect(result.retryAttempt).toBeDefined();
      expect(result.retryAttempt?.attemptNumber).toBe(1);
      expect(result.retryAttempt?.reason).toBe('Manual retry');
    });

    it('should not retry a non-retryable task', () => {
      mockTask.can_retry = false;
      const result = retryManager.retryTask(mockTask, 'Manual retry');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Task cannot be retried');
    });

    it('should not retry when max retries exceeded', () => {
      mockTask.retry_count = 3;
      const result = retryManager.retryTask(mockTask, 'Manual retry');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Task cannot be retried');
    });

    it('should reset task state for retry', () => {
      const result = retryManager.retryTask(mockTask, 'Manual retry');

      expect(result.success).toBe(true);
      expect(result.task.status).toBe('pending');
      expect(result.task.assigned_worker).toBeUndefined();
      expect(result.task.assigned_at).toBeUndefined();
      expect(result.task.error).toBeUndefined();
    });
  });

  describe('getRetryHistory', () => {
    it('should return empty array for new task', () => {
      const history = retryManager.getRetryHistory(mockTask.id);
      expect(history).toEqual([]);
    });

    it('should return retry history after retry', () => {
      retryManager.retryTask(mockTask, 'Test retry');
      const history = retryManager.getRetryHistory(mockTask.id);
      
      expect(history).toHaveLength(1);
      expect(history[0].attemptNumber).toBe(1);
      expect(history[0].reason).toBe('Test retry');
    });
  });

  describe('getRetryStats', () => {
    it('should return initial stats', () => {
      const stats = retryManager.getRetryStats();
      
      expect(stats.totalRetries).toBe(0);
      expect(stats.successfulRetries).toBe(0);
      expect(stats.failedRetries).toBe(0);
    });

    it('should update stats after retries', () => {
      retryManager.retryTask(mockTask, 'Test retry');
      const stats = retryManager.getRetryStats();
      
      expect(stats.totalRetries).toBe(1);
    });
  });

  describe('updateConfig', () => {
    it('should update retry configuration', () => {
      const newConfig = { max_retries: 5 };
      retryManager.updateConfig(newConfig);

      const config = retryManager.getConfig();
      expect(config.max_retries).toBe(5);
    });
  });

  describe('clearRetryHistory', () => {
    it('should clear retry history for specific task', () => {
      retryManager.retryTask(mockTask, 'Test retry');
      expect(retryManager.getRetryHistory(mockTask.id)).toHaveLength(1);
      
      retryManager.clearRetryHistory(mockTask.id);
      expect(retryManager.getRetryHistory(mockTask.id)).toHaveLength(0);
    });
  });

  describe('clearAllRetries', () => {
    it('should clear all retry history', () => {
      retryManager.retryTask(mockTask, 'Test retry');
      expect(retryManager.getRetryHistory(mockTask.id)).toHaveLength(1);
      
      retryManager.clearAllRetries();
      expect(retryManager.getRetryHistory(mockTask.id)).toHaveLength(0);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = retryManager.getConfig();

      expect(config.max_retries).toBe(3);
    });
  });
});