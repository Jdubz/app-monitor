import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskQueueService } from '../taskQueue.sqlite';
import { createTestTaskQueue, closeTestDatabase } from '../../__tests__/testDb.js';

describe('TaskQueueService Staged Queue API', () => {
  let taskQueue: TaskQueueService;

  beforeEach(() => {
    taskQueue = createTestTaskQueue();
  });

  afterEach(() => {
    closeTestDatabase(taskQueue);
  });

  describe('createTask', () => {
    it('should create a task successfully', () => {
      const task = taskQueue.createTask({
        title: 'New feature',
        description: 'Implement feature',
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('New feature');
      expect(task.description).toBe('Implement feature');
      expect(task.status).toBe('pending');
    });

    it('should create task with original_task_id', () => {
      const originalTask = taskQueue.createTask({
        title: 'Original task',
        description: 'First task',
      });

      const followupTask = taskQueue.createTask({
        title: 'Fix tests',
        description: 'Fix failing tests',
        original_task_id: originalTask.id,
      });

      expect(followupTask.id).toBeDefined();
      expect(followupTask.title).toBe('Fix tests');
    });
  });

  describe('assignNextTask', () => {
    it('should return null when queue empty', () => {
      const assigned = taskQueue.assignNextTask();
      expect(assigned).toBeNull();
    });

    it('should assign first pending task', () => {
      const task1 = taskQueue.createTask({
        title: 'Feature 1',
        description: 'First feature',
      });

      const assigned = taskQueue.assignNextTask();
      expect(assigned).not.toBeNull();
      expect(assigned?.id).toBe(task1.id);
      expect(assigned?.status).toBe('running');
    });

    it('should respect file conflicts', () => {
      const task1 = taskQueue.createTask({
        title: 'Task 1',
        description: 'Modify file',
        files: ['src/app.ts'],
      });

      taskQueue.createTask({
        title: 'Task 2',
        description: 'Modify same file',
        files: ['src/app.ts'],
      });

      // Assign first task
      const assigned1 = taskQueue.assignNextTask();
      expect(assigned1?.id).toBe(task1.id);

      // Try to assign second task - should be blocked by file conflict
      const assigned2 = taskQueue.assignNextTask();
      expect(assigned2).toBeNull();
    });

    it('should assign tasks in priority order', () => {
      taskQueue.createTask({
        title: 'Low priority',
        description: 'Low',
        priority: 1,
      });

      const highPriority = taskQueue.createTask({
        title: 'High priority',
        description: 'High',
        priority: 10,
      });

      // Should assign high priority first
      const firstAssigned = taskQueue.assignNextTask();
      expect(firstAssigned?.id).toBe(highPriority.id);
    });
  });

  describe('chain management API', () => {
    it('should return chain statistics', () => {
      const stats = taskQueue.getChainStats();
      expect(stats).toHaveProperty('activeChains');
      expect(stats).toHaveProperty('blockedChains');
      expect(stats).toHaveProperty('implementationQueueDepth');
      expect(stats).toHaveProperty('followupQueueDepth');
      expect(stats).toHaveProperty('maxConcurrentChains');
      expect(stats.maxConcurrentChains).toBeGreaterThan(0);
    });

    it('should get blocked chains list', () => {
      const blocked = taskQueue.getBlockedChains();
      expect(Array.isArray(blocked)).toBe(true);
    });
  });
});
