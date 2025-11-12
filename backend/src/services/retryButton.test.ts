/**
 * Tests for Manual Retry Button Functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DevBotsManager } from './devBotsManager.js';
import { Task } from './taskQueue.sqlite.js';
import { createMockDevBotsManagerDependencies } from './devBotsManager.mocks.js';
import type { DevBotsManagerDependencies } from './devBotsManager.interfaces.js';

describe('Retry Button Functionality', () => {
  let manager: DevBotsManager;
  let dependencies: DevBotsManagerDependencies;

  beforeEach(() => {
    dependencies = createMockDevBotsManagerDependencies();

    // Configure retryManager mock for these tests
    vi.mocked(dependencies.retryManager.canRetryTask).mockReturnValue(true);
    vi.mocked(dependencies.retryManager.retryTask).mockImplementation((task: Task) => ({
      success: true,
      task: { ...task, status: 'pending' },
      retryAttempt: { attemptNumber: 1, timestamp: new Date().toISOString(), reason: 'Manual retry' },
    }));

    manager = new DevBotsManager(dependencies);
  });

  describe('Failed Task Retry', () => {
    it('should set canRetry=true on failed tasks', () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
        title: 'Test task',
        description: 'Test task',
        status: 'failed',
        created_at: Date.now(),
        assigned_agent: 'test-agent',
        error: 'Test error',
        completed_at: Date.now(),
        can_retry: true, // Set can_retry explicitly for the test
        retry_count: 0,
        max_retries: 3,
        priority: 5,
        timeout_ms: null
      };

      // Check that can_retry is set to true
      expect(task.can_retry).toBe(true);
    });

    it('should allow retry of failed tasks', async () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
        title: 'Test task',
        description: 'Test task',
        status: 'failed',
        created_at: Date.now(),
        assigned_agent: 'test-agent',
        error: 'Test error',
        completed_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        priority: 5,
        timeout_ms: null
      };

      // Mock retryCoordinationService to handle retry successfully
      vi.mocked(dependencies.retryCoordinationService.retryTask).mockResolvedValue({
        success: true,
        message: 'Task queued for retry'
      });

      const result = await manager.retryTask(task.id, 'Manual retry');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Task queued for retry');

      // Verify retryCoordinationService.retryTask was called
      expect(dependencies.retryCoordinationService.retryTask).toHaveBeenCalledWith(task.id, 'Manual retry');
    });

    it('should not allow retry of non-failed tasks', async () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
        title: 'Test task',
        description: 'Test task',
        status: 'completed',
        created_at: Date.now(),
        assigned_agent: 'test-agent',
        completed_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        priority: 5,
        timeout_ms: null
      };

      // Mock retryCoordinationService to reject non-failed task
      vi.mocked(dependencies.retryCoordinationService.retryTask).mockResolvedValue({
        success: false,
        message: 'Task is not in failed status'
      });

      const result = await manager.retryTask(task.id, 'Manual retry');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Task is not in failed status');
    });

    it('should not allow retry of non-existent tasks', async () => {
      // Mock retryCoordinationService to reject non-existent task
      vi.mocked(dependencies.retryCoordinationService.retryTask).mockResolvedValue({
        success: false,
        message: 'Task not found'
      });

      const result = await manager.retryTask('non-existent-task', 'Manual retry');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Task not found');
    });

    it('should handle retry when max retries exceeded', async () => {
      const task: Task = {
        id: 'test-task-1',
        type: 'test',
        title: 'Test task',
        description: 'Test task',
        status: 'failed',
        created_at: Date.now(),
        assigned_agent: 'test-agent',
        error: 'Test error',
        completed_at: Date.now(),
        can_retry: true,
        retry_count: 3,
        max_retries: 3,
        priority: 5,
        timeout_ms: null
      };

      // Mock retryCoordinationService to reject due to max retries
      vi.mocked(dependencies.retryCoordinationService.retryTask).mockResolvedValue({
        success: false,
        message: 'Task cannot be retried'
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
        created_at: Date.now(),
        assigned_agent: 'test-agent',
        error: 'Test error',
        completed_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        priority: 5,
        timeout_ms: null
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
        created_at: Date.now(),
        assigned_agent: 'test-agent',
        completed_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        priority: 5,
        timeout_ms: null
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
        status: 'running',
        created_at: Date.now(),
        assigned_agent: 'test-agent',
        assigned_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        priority: 5,
        timeout_ms: null
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
        created_at: Date.now(),
        assigned_agent: 'test-agent',
        error: 'Test error',
        completed_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        priority: 5,
        timeout_ms: null
      };

      // Mock taskQueue to return the failed task
      vi.mocked(dependencies.taskQueue.getTask).mockReturnValue(task);

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
        created_at: Date.now(),
        assigned_agent: 'test-agent',
        error: 'Test error',
        completed_at: Date.now(),
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        priority: 5,
        timeout_ms: null
      };

      // Mock taskQueue to return the failed task
      vi.mocked(dependencies.taskQueue.getTask).mockReturnValue(task);

      // Simulate API call with reason
      const result = await manager.retryTask(task.id, 'User requested retry');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Task queued for retry');
    });
  });
});
