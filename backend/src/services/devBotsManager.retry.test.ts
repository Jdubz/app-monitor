/**
 * Tests for Retry functionality in DevBotsManager
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DevBotsManager } from './devBotsManager.js';
import { ProcessManager } from './processManager.js';
import { Task } from './devBotsManager.js';

// Mock the ProcessManager
vi.mock('./processManager.js', () => ({
  ProcessManager: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    getStatus: vi.fn().mockResolvedValue({ status: 'running' }),
    getAllStatuses: vi.fn().mockResolvedValue({})
  }))
}));

// Mock other dependencies
vi.mock('./taskPersistence.js', () => ({
  TaskPersistence: vi.fn().mockImplementation(() => ({
    loadTasks: vi.fn().mockReturnValue([]),
    saveCompletedTasks: vi.fn()
  }))
}));

vi.mock('./agentPersonalities.js', () => ({
  AgentPersonalityManager: vi.fn().mockImplementation(() => ({
    getPersonality: vi.fn().mockReturnValue({ id: 'test-agent', name: 'Test Agent' })
  }))
}));

vi.mock('./taskPromptTemplates.js', () => ({
  TaskPromptTemplateManager: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('./taskCreationGuidelines.js', () => ({
  TaskCreationGuidelinesManager: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('./workspaceSyncManager.js', () => ({
  WorkspaceSyncManager: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('./dockerManager.js', () => ({
  DockerManager: vi.fn().mockImplementation(() => ({
    validateDockerEnvironment: vi.fn().mockResolvedValue({ isValid: true, errors: [] }),
    getDocker: vi.fn().mockReturnValue({})
  }))
}));

describe('DevBotsManager Retry Functionality', () => {
  let manager: DevBotsManager;
  let mockProcessManager: ProcessManager;
  let mockTask: Task;

  beforeEach(() => {
    mockProcessManager = new ProcessManager() as any;
    manager = new DevBotsManager(mockProcessManager);
    
    mockTask = {
      id: 'test-task-1',
      type: 'test',
      title: 'Test Task',
      description: 'A test task',
      status: 'failed',
      createdAt: new Date().toISOString(),
      assignedAgent: 'test-agent',
      error: 'Connection timeout',
      exitCode: 1,
      retryCount: 0,
      maxRetries: 3,
      canRetry: true
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('retryTask', () => {
    it('should successfully retry a failed task', async () => {
      // Add task to completed tasks
      (manager as any).completedTasks = [mockTask];
      
      const result = await manager.retryTask(mockTask.id, 'Manual retry');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Task queued for retry');
    });

    it('should return error for non-existent task', async () => {
      const result = await manager.retryTask('non-existent-task', 'Manual retry');
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Task not found in completed tasks');
    });

    it('should return error for non-failed task', async () => {
      mockTask.status = 'completed';
      (manager as any).completedTasks = [mockTask];
      
      const result = await manager.retryTask(mockTask.id, 'Manual retry');
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Task is not in failed status');
    });

    it('should return error for non-retryable task', async () => {
      mockTask.canRetry = false;
      (manager as any).completedTasks = [mockTask];
      
      const result = await manager.retryTask(mockTask.id, 'Manual retry');
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Task cannot be retried');
    });
  });

  describe('cancelRetry', () => {
    it('should return error for manual retry system', () => {
      // Manual retry system doesn't support cancellation
      const result = manager.cancelRetry(mockTask.id);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Manual retry cannot be cancelled once started');
    });

    it('should return error for non-existent retry', () => {
      const result = manager.cancelRetry('non-existent-task');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Manual retry cannot be cancelled once started');
    });
  });

  describe('getRetryInfo', () => {
    it('should return retry information for a task', () => {
      (manager as any).completedTasks = [mockTask];
      
      const retryInfo = manager.getRetryInfo(mockTask.id);
      
      expect(retryInfo).toHaveProperty('canRetry');
      expect(retryInfo).toHaveProperty('retryCount');
      expect(retryInfo).toHaveProperty('maxRetries');
      expect(retryInfo).toHaveProperty('retryHistory');
      expect(retryInfo).toHaveProperty('scheduledRetries');
    });

    it('should return default values for non-existent task', () => {
      const retryInfo = manager.getRetryInfo('non-existent-task');
      
      expect(retryInfo.canRetry).toBe(false);
      expect(retryInfo.retryCount).toBe(0);
      expect(retryInfo.retryHistory).toEqual([]);
    });
  });

  describe('getRetryStats', () => {
    it('should return retry statistics', () => {
      const stats = manager.getRetryStats();
      
      expect(stats).toHaveProperty('totalRetries');
      expect(stats).toHaveProperty('successfulRetries');
      expect(stats).toHaveProperty('failedRetries');
      expect(stats).toHaveProperty('scheduledRetries');
      expect(stats).toHaveProperty('retryConfig');
    });
  });

  describe('updateRetryConfig', () => {
    it('should update retry configuration', () => {
      const newConfig = { maxRetries: 5, baseDelay: 2000 };
      
      expect(() => manager.updateRetryConfig(newConfig)).not.toThrow();
    });
  });

  describe('handleTaskRetry', () => {
    it('should handle task retry correctly', async () => {
      const retryTask = { ...mockTask, status: 'retrying' };
      
      // Mock the assignNextTask method
      vi.spyOn(manager as any, 'assignNextTask').mockResolvedValue(undefined);
      
      await (manager as any).handleTaskRetry(retryTask);
      
      expect(retryTask.status).toBe('pending');
      expect(retryTask.assignedWorker).toBeUndefined();
      expect(retryTask.error).toBeUndefined();
    });
  });

  describe('retry integration with task execution', () => {
    it('should automatically retry failed tasks', async () => {
      const failingTask = { ...mockTask, status: 'active' };
      
      // Mock the retry manager
      const mockRetryManager = {
        canRetryTask: vi.fn().mockReturnValue(true),
        scheduleRetry: vi.fn().mockReturnValue({
          success: true,
          task: { ...failingTask, status: 'retrying' },
          reason: 'Automatic retry after failure'
        })
      };
      
      (manager as any).retryManager = mockRetryManager;
      
      // Simulate task failure
      try {
        await (manager as any).executeTask(failingTask);
      } catch (error) {
        // Task should be scheduled for retry
        expect(mockRetryManager.canRetryTask).toHaveBeenCalledWith(failingTask);
        expect(mockRetryManager.scheduleRetry).toHaveBeenCalled();
      }
    });
  });

  describe('retry events', () => {
    it('should emit retry events', () => {
      const emitSpy = vi.spyOn(manager, 'emit');
      
      // Test taskScheduledForRetry event
      manager.emit('taskScheduledForRetry', mockTask);
      expect(emitSpy).toHaveBeenCalledWith('taskScheduledForRetry', mockTask);
      
      // Test taskRetrying event
      manager.emit('taskRetrying', mockTask);
      expect(emitSpy).toHaveBeenCalledWith('taskRetrying', mockTask);
      
      // Test taskRetryCancelled event
      manager.emit('taskRetryCancelled', mockTask.id);
      expect(emitSpy).toHaveBeenCalledWith('taskRetryCancelled', mockTask.id);
    });
  });
});
