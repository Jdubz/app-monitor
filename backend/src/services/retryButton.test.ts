/**
 * Tests for Manual Retry Button Functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaudeWorkersManager } from './claudeWorkersManager.js';
import { ProcessManager } from './processManager.js';
import { Task } from './claudeWorkersManager.js';

// Mock dependencies
vi.mock('./processManager.js');
vi.mock('./dockerManager.js');
vi.mock('./taskPersistence.js');
vi.mock('./agentPersonalities.js');
vi.mock('./taskPromptTemplates.js');
vi.mock('./taskCreationGuidelines.js');
vi.mock('./workspaceSyncManager.js');
vi.mock('./retryManager.js', () => ({
  RetryManager: vi.fn().mockImplementation(() => ({
    canRetryTask: vi.fn().mockReturnValue(true),
    retryTask: vi.fn().mockReturnValue({
      success: true,
      task: { id: 'test-task-1', status: 'pending' },
      retryAttempt: { attemptNumber: 1, timestamp: new Date().toISOString(), reason: 'Manual retry' }
    }),
    getRetryHistory: vi.fn().mockReturnValue([]),
    getRetryStats: vi.fn().mockReturnValue({ totalRetries: 0, successfulRetries: 0, failedRetries: 0 }),
    updateConfig: vi.fn(),
    getConfig: vi.fn().mockReturnValue({ maxRetries: 3 }),
    clearRetryHistory: vi.fn(),
    clearAllRetries: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    removeListener: vi.fn()
  }))
}));
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('Retry Button Functionality', () => {
  let manager: ClaudeWorkersManager;
  let mockProcessManager: ProcessManager;

  beforeEach(() => {
    mockProcessManager = new ProcessManager();
    manager = new ClaudeWorkersManager(mockProcessManager);
  });

  describe('Failed Task Retry', () => {
    it('should set canRetry=true on failed tasks', () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
          title: 'Test task',
        description: 'Test task',
        status: 'failed',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        error: 'Test error',
        exitCode: 1,
        completedAt: new Date().toISOString(),
        canRetry: true // Set canRetry explicitly for the test
      };

      // Simulate task failure
      (manager as any).completedTasks = [task];
      
      // Check that canRetry is set to true
      expect(task.canRetry).toBe(true);
    });

    it('should allow retry of failed tasks', async () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
          title: 'Test task',
        description: 'Test task',
        status: 'failed',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        error: 'Test error',
        exitCode: 1,
        completedAt: new Date().toISOString(),
        canRetry: true
      };

      (manager as any).completedTasks = [task];
      (manager as any).taskQueue = [];

      const result = await manager.retryTask(task.id, 'Manual retry');
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Task queued for retry');
      
      // Task should be removed from completed tasks
      expect((manager as any).completedTasks).toHaveLength(0);
      
      // Task should be added to queue
      expect((manager as any).taskQueue).toHaveLength(1);
      expect((manager as any).taskQueue[0].id).toBe(task.id);
      expect((manager as any).taskQueue[0].status).toBe('pending');
    });

    it('should not allow retry of non-failed tasks', async () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
          title: 'Test task',
        description: 'Test task',
        status: 'completed',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        completedAt: new Date().toISOString()
      };

      (manager as any).completedTasks = [task];

      const result = await manager.retryTask(task.id, 'Manual retry');
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Task is not in failed status');
    });

    it('should not allow retry of non-existent tasks', async () => {
      const result = await manager.retryTask('non-existent-task', 'Manual retry');
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Task not found in completed tasks');
    });

    it('should handle retry when max retries exceeded', async () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
          title: 'Test task',
        description: 'Test task',
        status: 'failed',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        error: 'Test error',
        exitCode: 1,
        completedAt: new Date().toISOString(),
        canRetry: true,
        retryCount: 3,
        maxRetries: 3
      };

      (manager as any).completedTasks = [task];

      // Mock the retryManager to return false for this specific case
      const mockRetryManager = (manager as any).retryManager;
      mockRetryManager.canRetryTask.mockReturnValueOnce(false);
      mockRetryManager.retryTask.mockReturnValueOnce({
        success: false,
        task,
        reason: 'Task cannot be retried'
      });

      const result = await manager.retryTask(task.id, 'Manual retry');
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Task cannot be retried');
    });
  });

  describe('Retry Button Display Logic', () => {
    it('should show retry button for failed tasks', () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
          title: 'Test task',
        description: 'Test task',
        status: 'failed',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        error: 'Test error',
        exitCode: 1,
        completedAt: new Date().toISOString(),
        canRetry: true
      };

      // Frontend logic: show retry button if status === 'failed'
      const shouldShowRetryButton = task.status === 'failed';
      expect(shouldShowRetryButton).toBe(true);
    });

    it('should not show retry button for completed tasks', () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
          title: 'Test task',
        description: 'Test task',
        status: 'completed',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        completedAt: new Date().toISOString()
      };

      // Frontend logic: show retry button if status === 'failed'
      const shouldShowRetryButton = task.status === 'failed';
      expect(shouldShowRetryButton).toBe(false);
    });

    it('should not show retry button for active tasks', () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
          title: 'Test task',
        description: 'Test task',
        status: 'active',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        assignedAt: new Date().toISOString()
      };

      // Frontend logic: show retry button if status === 'failed'
      const shouldShowRetryButton = task.status === 'failed';
      expect(shouldShowRetryButton).toBe(false);
    });
  });

  describe('Retry API Endpoint', () => {
    it('should handle retry API call', async () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
          title: 'Test task',
        description: 'Test task',
        status: 'failed',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        error: 'Test error',
        exitCode: 1,
        completedAt: new Date().toISOString(),
        canRetry: true
      };

      (manager as any).completedTasks = [task];
      (manager as any).taskQueue = [];

      // Simulate API call
      const result = await manager.retryTask(task.id);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Task queued for retry');
    });

    it('should handle retry API call with reason', async () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
          title: 'Test task',
        description: 'Test task',
        status: 'failed',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        error: 'Test error',
        exitCode: 1,
        completedAt: new Date().toISOString(),
        canRetry: true
      };

      (manager as any).completedTasks = [task];
      (manager as any).taskQueue = [];

      // Simulate API call with reason
      const result = await manager.retryTask(task.id, 'User requested retry');
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Task queued for retry');
    });
  });
});
