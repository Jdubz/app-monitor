/**
 * Integration tests for PR Sync Service
 * Tests the PR recovery workflow focusing on failed task detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestTaskQueue, closeTestDatabase } from '../../__tests__/testDb.js';
import type { TaskQueueService } from '../taskQueue.sqlite.js';

describe('PRSyncService Integration Tests', () => {
  let taskQueue: TaskQueueService;

  beforeEach(() => {
    taskQueue = createTestTaskQueue();
  });

  afterEach(() => {
    closeTestDatabase(taskQueue);
  });

  it('should detect PRs from failed tasks', async () => {
    const task = taskQueue.createTask({
      type: 'implementation',
      title: 'Test',
      description: 'Test description',
      assigned_agent: 'backend-specialist'
    });
    
    await taskQueue.updateTask(task.id, { pr_number: 100, status: 'failed' });
    const failed = await taskQueue.getTasksByStatus('failed');
    const foundTask = failed.find(t => t.pr_number === 100);

    expect(foundTask).toBeDefined();
    expect(foundTask?.status).toBe('failed');
    expect(foundTask?.pr_number).toBe(100);
  });

  it('should include failed tasks in PR sync query (CRITICAL)', async () => {
    const task = taskQueue.createTask({
      type: 'bugfix',
      title: 'Fix',
      description: 'Fix description',
      assigned_agent: 'backend-specialist'
    });
    
    await taskQueue.updateTask(task.id, { pr_number: 200, status: 'failed' });
    
    const pending = await taskQueue.getTasksByStatus('pending');
    const running = await taskQueue.getTasksByStatus('running');
    const failed = await taskQueue.getTasksByStatus('failed');
    
    const tasksWithPR = [...pending, ...running, ...failed].filter(t => t.pr_number);
    
    expect(tasksWithPR).toHaveLength(1);
    expect(tasksWithPR[0].pr_number).toBe(200);
    expect(tasksWithPR[0].status).toBe('failed');
  });

  it('should handle multiple failed tasks with different PR numbers', async () => {
    const prNumbers = [183, 184, 185];
    
    for (const prNumber of prNumbers) {
      const task = taskQueue.createTask({
        type: 'bugfix',
        title: `Fix CI for PR #${prNumber}`,
        description: 'Bugfix task',
        assigned_agent: 'backend-specialist'
      });
      
      await taskQueue.updateTask(task.id, {
        pr_number: prNumber,
        status: 'failed'
      });
    }

    const failed = await taskQueue.getTasksByStatus('failed');
    const failedWithPR = failed.filter(t => t.pr_number);

    expect(failedWithPR).toHaveLength(3);
    
    const foundPRs = failedWithPR.map(t => t.pr_number).sort();
    expect(foundPRs).toEqual([183, 184, 185]);
  });
});
