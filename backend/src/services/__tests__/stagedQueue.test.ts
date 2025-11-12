import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskQueueService } from '../taskQueue.sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, 'staged-queue-test.db');

function cleanupTestDb() {
  [TEST_DB_PATH, TEST_DB_PATH + '-shm', TEST_DB_PATH + '-wal'].forEach((file) => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
}

describe('TaskQueueService Staged Queue', () => {
  let taskQueue: TaskQueueService;

  beforeEach(() => {
    cleanupTestDb();
    taskQueue = new TaskQueueService(TEST_DB_PATH);
  });

  afterEach(() => {
    cleanupTestDb();
  });

  describe('createTask queue stage assignment', () => {
    it('should set queue_stage=implementation for new tasks', () => {
      const task = taskQueue.createTask({
        title: 'New feature',
        description: 'Implement feature',
      });

      expect(task.queue_stage).toBe('implementation');
      expect(task.chain_status).toBe('pending');
      expect(task.chain_id).toBe(task.id); // Implementation tasks: chain_id = id
    });

    it('should set queue_stage=followup for tasks with original_task_id', () => {
      const originalTask = taskQueue.createTask({
        title: 'Original task',
        description: 'First task',
      });

      const followupTask = taskQueue.createTask({
        title: 'Fix tests',
        description: 'Fix failing tests',
        original_task_id: originalTask.id,
      });

      expect(followupTask.queue_stage).toBe('followup');
      expect(followupTask.chain_status).toBe('pending');
      expect(followupTask.chain_id).toBe(originalTask.chain_id);
    });

    it('should set queue_stage=followup for repair bots', () => {
      const task = taskQueue.createTask({
        title: 'Repair task',
        description: 'Fix issue',
        is_repair_bot: true,
      });

      expect(task.queue_stage).toBe('followup');
      expect(task.chain_status).toBe('pending');
    });

    it('should inherit chain_id for followup tasks', () => {
      const implTask = taskQueue.createTask({
        title: 'Implementation',
        description: 'Initial implementation',
      });

      const followup1 = taskQueue.createTask({
        title: 'Followup 1',
        description: 'Fix tests',
        original_task_id: implTask.id,
      });

      const followup2 = taskQueue.createTask({
        title: 'Followup 2',
        description: 'Fix more tests',
        original_task_id: followup1.id,
      });

      expect(followup1.chain_id).toBe(implTask.chain_id);
      expect(followup2.chain_id).toBe(implTask.chain_id);
      expect(followup2.chain_id).toBe(followup1.chain_id);
    });

    it('should set chain_depth from taskData', () => {
      const task = taskQueue.createTask({
        title: 'Nested followup',
        description: 'Deep in chain',
        chain_depth: 3,
      });

      expect(task.chain_depth).toBe(3);
    });

    it('should default chain_depth to 0', () => {
      const task = taskQueue.createTask({
        title: 'New task',
        description: 'No depth specified',
      });

      expect(task.chain_depth).toBe(0);
    });
  });

  describe('assignNextTask staged queue logic', () => {
    it('should dequeue implementation task when under capacity', () => {
      // Create 2 implementation tasks
      const task1 = taskQueue.createTask({
        title: 'Feature 1',
        description: 'First feature',
      });
      taskQueue.createTask({
        title: 'Feature 2',
        description: 'Second feature',
      });

      // Should dequeue first impl task
      const assigned = taskQueue.assignNextTask();
      expect(assigned).not.toBeNull();
      expect(assigned?.id).toBe(task1.id);
      expect(assigned?.queue_stage).toBe('implementation');
    });

    it('should mark new chains as active', () => {
      const implTask = taskQueue.createTask({
        title: 'Feature',
        description: 'New feature',
      });

      const assigned = taskQueue.assignNextTask();
      expect(assigned).not.toBeNull();

      // Check chain status in database
      const task = taskQueue.getTask(implTask.id);
      expect(task?.chain_status).toBe('active');
    });

    it('should dequeue followup when at capacity', () => {
      // Create 3 implementation tasks (assuming maxWorkers=3)
      taskQueue.createTask({ title: 'Impl 1', description: 'Feature 1' });
      taskQueue.createTask({ title: 'Impl 2', description: 'Feature 2' });
      taskQueue.createTask({ title: 'Impl 3', description: 'Feature 3' });

      // Assign all 3 (fills capacity)
      taskQueue.assignNextTask(); // impl1
      taskQueue.assignNextTask(); // impl2
      taskQueue.assignNextTask(); // impl3

      // Create followup task
      const followup = taskQueue.createTask({
        title: 'Fix tests',
        description: 'Fix failing tests',
        original_task_id: impl1.id,
      });

      // Create another implementation task
      taskQueue.createTask({ title: 'Impl 4', description: 'Feature 4' });

      // Next assignment should be followup (not impl4)
      const assigned = taskQueue.assignNextTask();
      expect(assigned).not.toBeNull();
      expect(assigned?.id).toBe(followup.id);
      expect(assigned?.queue_stage).toBe('followup');
    });

    it('should skip blocked chains in followup queue', () => {
      const impl = taskQueue.createTask({ title: 'Impl', description: 'Feature' });
      taskQueue.assignNextTask(); // Start the chain

      taskQueue.createTask({
        title: 'Followup 1',
        description: 'First followup',
        original_task_id: impl.id,
      });

      taskQueue.createTask({
        title: 'Followup 2',
        description: 'Second followup',
        original_task_id: impl.id,
      });

      // Block the chain
      taskQueue.blockChain(impl.chain_id!, 'CI failed', 'system:ci');

      // Try to assign - should return null (blocked chain skipped)
      const assigned = taskQueue.assignNextTask();
      expect(assigned).toBeNull();
    });

    it('should return null when both queues empty', () => {
      const assigned = taskQueue.assignNextTask();
      expect(assigned).toBeNull();
    });

    it('should respect file conflicts', () => {
      const task1 = taskQueue.createTask({
        title: 'Task 1',
        description: 'Modify file',
        files: ['src/app.ts'],
      });

      const task2 = taskQueue.createTask({
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

      // Complete first task
      taskQueue.completeTask(task1.id, 'success', 'Done');

      // Now second task should be assignable
      const assigned3 = taskQueue.assignNextTask();
      expect(assigned3?.id).toBe(task2.id);
    });
  });

  describe('chain management API', () => {
    it('should return chain statistics', () => {
      taskQueue.createTask({ title: 'Impl 1', description: 'Feature 1' });
      taskQueue.createTask({ title: 'Impl 2', description: 'Feature 2' });

      taskQueue.assignNextTask(); // Start first chain

      const stats = taskQueue.getChainStats();
      expect(stats.activeChains).toBe(1);
      expect(stats.implementationQueueDepth).toBe(1);
      expect(stats.maxConcurrentChains).toBeGreaterThan(0);
    });

    it('should block chain', () => {
      const task = taskQueue.createTask({ title: 'Task', description: 'Feature' });
      taskQueue.assignNextTask();

      taskQueue.blockChain(task.chain_id!, 'CI failed', 'system:ci');

      const stats = taskQueue.getChainStats();
      expect(stats.blockedChains).toBe(1);
    });

    it('should unblock chain', () => {
      const task = taskQueue.createTask({ title: 'Task', description: 'Feature' });
      taskQueue.assignNextTask();

      taskQueue.blockChain(task.chain_id!, 'CI failed', 'system:ci');
      expect(taskQueue.getChainStats().blockedChains).toBe(1);

      taskQueue.unblockChain(task.chain_id!, 'user@example.com');
      expect(taskQueue.getChainStats().blockedChains).toBe(0);
    });

    it('should return blocked chains list', () => {
      const task = taskQueue.createTask({ title: 'Task', description: 'Feature' });
      taskQueue.assignNextTask();

      taskQueue.blockChain(task.chain_id!, 'CI failed', 'system:ci');

      const blocked = taskQueue.getBlockedChains();
      expect(blocked).toHaveLength(1);
      expect(blocked[0].chain_id).toBe(task.chain_id);
      expect(blocked[0].blocked_reason).toBe('CI failed');
    });
  });

  describe('integration scenarios', () => {
    it('should enforce chain concurrency limit', () => {
      // Assuming maxWorkers = 3
      // Create 5 implementation tasks
      Array.from({ length: 5 }, (_, i) =>
        taskQueue.createTask({ title: `Feature ${i + 1}`, description: `Impl ${i + 1}` })
      );

      // Assign tasks - should only assign 3
      const assigned: string[] = [];
      for (let i = 0; i < 10; i++) {
        const task = taskQueue.assignNextTask();
        if (task) assigned.push(task.id);
        else break;
      }

      // Should have assigned exactly 3 (or maxWorkers)
      expect(assigned.length).toBeLessThanOrEqual(3);
      expect(assigned.length).toBeGreaterThan(0);

      // All assigned should be implementation tasks
      assigned.forEach((id) => {
        const task = taskQueue.getTask(id);
        expect(task?.queue_stage).toBe('implementation');
      });
    });

    it('should allow followups when impl queue blocked', () => {
      // Fill capacity with implementation tasks
      const impl1 = taskQueue.createTask({ title: 'Impl 1', description: 'Feature 1' });
      taskQueue.createTask({ title: 'Impl 2', description: 'Feature 2' });
      taskQueue.createTask({ title: 'Impl 3', description: 'Feature 3' });

      taskQueue.assignNextTask();
      taskQueue.assignNextTask();
      taskQueue.assignNextTask();

      // Create followup
      const followup = taskQueue.createTask({
        title: 'Fix tests',
        description: 'Fix',
        original_task_id: impl1.id,
      });

      // Should assign followup even though impl queue is at capacity
      const assigned = taskQueue.assignNextTask();
      expect(assigned).not.toBeNull();
      expect(assigned?.id).toBe(followup.id);
    });

    it('should free slot when chain closes', () => {
      // Create and assign 3 impl tasks (fill capacity)
      const tasks = Array.from({ length: 3 }, (_, i) =>
        taskQueue.createTask({ title: `Impl ${i + 1}`, description: `Feature ${i + 1}` })
      );

      tasks.forEach(() => taskQueue.assignNextTask());

      // Complete first task
      taskQueue.completeTask(tasks[0].id, 'success', 'Done');

      // Create another impl task
      const newImpl = taskQueue.createTask({ title: 'Impl 4', description: 'Feature 4' });

      // Should be able to assign now (slot freed)
      const assigned = taskQueue.assignNextTask();
      expect(assigned?.id).toBe(newImpl.id);
    });
  });
});
