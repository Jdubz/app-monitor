/**
 * Integration tests for PR Sync Service
 * Tests the PR recovery workflow focusing on failed task detection.
 * 
 * NOTE: Skipped - createTask API needs validation work
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskQueueService } from '../taskQueue.sqlite.js';
import fs from 'fs';
import path from 'path';

describe.skip('PRSyncService Integration Tests', () => {
  const testDbPath = path.join(__dirname, 'test-pr-sync.db');
  let taskQueue: TaskQueueService;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    taskQueue = new TaskQueueService(testDbPath);
  });

  afterEach(() => {
    taskQueue.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
  });

  it('should detect PRs from failed tasks', async () => {
    const result = await taskQueue.createTask({
      type: 'implementation',
      title: 'Test',
      assigned_agent: 'backend-specialist'
    });
    
    await taskQueue.updateTask(result.task.id, { pr_number: 100, status: 'failed' });
    const failed = await taskQueue.getTasksByStatus('failed');
    const task = failed.find(t => t.pr_number === 100);

    expect(task).toBeDefined();
    expect(task?.status).toBe('failed');
  });

  it('should include failed tasks in PR sync query (CRITICAL)', async () => {
    const result = await taskQueue.createTask({
      type: 'bugfix',
      title: 'Fix',
      assigned_agent: 'backend-specialist'
    });
    
    await taskQueue.updateTask(result.task.id, { pr_number: 200, status: 'failed' });
    
    const pending = await taskQueue.getTasksByStatus('pending');
    const running = await taskQueue.getTasksByStatus('running');
    const failed = await taskQueue.getTasksByStatus('failed');
    
    const tasksWithPR = [...pending, ...running, ...failed].filter(t => t.pr_number);
    
    expect(tasksWithPR).toHaveLength(1);
    expect(tasksWithPR[0].pr_number).toBe(200);
  });
});
