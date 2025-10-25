/**
 * Tests for Manual Retry Manager Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetryManager } from './retryManager.js';
import { Task } from './claudeWorkersManager.js';

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
      createdAt: new Date().toISOString(),
      assignedAgent: 'test-agent',
      error: 'Test error',
      exitCode: 1,
      retryCount: 0,
      maxRetries: 3,
      canRetry: true
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
      mockTask.retryCount = 3;
      expect(retryManager.canRetryTask(mockTask)).toBe(false);
    });

    it('should return false when canRetry is false', () => {
      mockTask.canRetry = false;
      expect(retryManager.canRetryTask(mockTask)).toBe(false);
    });
  });

  describe('retryTask', () => {
    it('should retry a task successfully', () => {
      const result = retryManager.retryTask(mockTask, 'Manual retry');
      
      expect(result.success).toBe(true);
      expect(result.task.status).toBe('pending');
      expect(result.task.retryCount).toBe(1);
      expect(result.retryAttempt).toBeDefined();
      expect(result.retryAttempt?.attemptNumber).toBe(1);
      expect(result.retryAttempt?.reason).toBe('Manual retry');
    });

    it('should not retry a non-retryable task', () => {
      mockTask.canRetry = false;
      const result = retryManager.retryTask(mockTask, 'Manual retry');
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Task cannot be retried');
    });

    it('should not retry when max retries exceeded', () => {
      mockTask.retryCount = 3;
      const result = retryManager.retryTask(mockTask, 'Manual retry');
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Task cannot be retried');
    });

    it('should reset task state for retry', () => {
      const result = retryManager.retryTask(mockTask, 'Manual retry');
      
      expect(result.success).toBe(true);
      expect(result.task.status).toBe('pending');
      expect(result.task.assignedWorker).toBeUndefined();
      expect(result.task.assignedAt).toBeUndefined();
      expect(result.task.error).toBeUndefined();
      expect(result.task.exitCode).toBeUndefined();
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
      const newConfig = { maxRetries: 5 };
      retryManager.updateConfig(newConfig);
      
      const config = retryManager.getConfig();
      expect(config.maxRetries).toBe(5);
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
      
      expect(config.maxRetries).toBe(3);
    });
  });
});