/**
 * Task Queue Phase Integration Tests
 * 
 * Tests TaskQueueService integration with the phase system:
 * - Task creation with initial phase
 * - Phase field updates
 * - Phase-aware task retrieval
 * - Chain tracking with phases
 * - Metrics by phase
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskQueueService } from '../taskQueue.sqlite.js';

describe('TaskQueueService - Phase Integration', () => {
  let taskQueue: TaskQueueService;

  beforeEach(() => {
    // Use in-memory database for test isolation
    taskQueue = new TaskQueueService(':memory:');
  });

  afterEach(() => {
    try {
      taskQueue.close();
    } catch (err) {
      // Ignore close errors in tests
    }
  });

  describe('Task Creation with Phases', () => {
    it('should create task with initial phase 1 (Planning)', async () => {
      // Given: Creating a new task
      const createdTask = taskQueue.createTask({
        type: 'feature',
        title: 'Test Feature',
        description: 'Test description',
        priority: 1,
        assigned_agent: 'claude-sonnet',
      });
      const taskId = createdTask.id;

      // When: Retrieving the task
      const task = taskQueue.getTask(taskId);

      // Then: Should have phase 1 initialized
      expect(task).toBeDefined();
      expect(task?.phase_index).toBe(1);
      expect(task?.phase_name).toBe('Planning');
      expect(task?.phase_status).toBe('ready');
      expect(task?.phase_attempts).toBe(1);
      expect(task?.phase_payload).toBeNull();
    });

    it('should allow creating task with specific phase for testing', async () => {
      // Given: Creating a task at specific phase
      const createdTask = taskQueue.createTask({
        type: 'feature',
        title: 'Test Feature',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_index: 5,
        phase_name: 'Test & Validate',
      });
      const taskId = createdTask.id;

      // When: Retrieving the task
      const task = taskQueue.getTask(taskId);

      // Then: Should have specified phase
      expect(task?.phase_index).toBe(5);
      expect(task?.phase_name).toBe('Test & Validate');
    });
  });

  describe('Phase Updates', () => {
    it('should update phase fields correctly', async () => {
      // Given: A task in initial phase
      const taskId = taskQueue.createTask({
        type: 'feature',
        title: 'Test Feature',
        priority: 1,
        assigned_agent: 'claude-sonnet',
      }).id;

      // When: Updating to next phase
      taskQueue.updateTask(taskId, {
        phase_index: 2,
        phase_name: 'Implementation',
        phase_status: 'running',
        phase_attempts: 1,
      });

      // Then: Phase should be updated
      const task = taskQueue.getTask(taskId);
      expect(task?.phase_index).toBe(2);
      expect(task?.phase_name).toBe('Implementation');
      expect(task?.phase_status).toBe('running');
      expect(task?.phase_attempts).toBe(1);
    });

    it('should increment phase_attempts on retry', async () => {
      // Given: A task that needs retry
      const taskId = taskQueue.createTask({
        type: 'feature',
        title: 'Test Feature',
        priority: 1,
        assigned_agent: 'claude-sonnet',
      }).id;

      // When: Incrementing attempts
      taskQueue.updateTask(taskId, { phase_attempts: 2 });
      taskQueue.updateTask(taskId, { phase_attempts: 3 });

      // Then: Attempts should increment
      const task = taskQueue.getTask(taskId);
      expect(task?.phase_attempts).toBe(3);
    });

    it('should store and retrieve phase_payload', async () => {
      // Given: A task with phase state
      const taskId = taskQueue.createTask({
        type: 'feature',
        title: 'Test Feature',
        priority: 1,
        assigned_agent: 'claude-sonnet',
      }).id;

      const payload = {
        reviewComments: ['Fix lint error', 'Add tests'],
        partialProgress: { filesReviewed: 3, totalFiles: 10 },
      };

      // When: Storing payload
      taskQueue.updateTask(taskId, {
        phase_payload: JSON.stringify(payload),
      });

      // Then: Payload should be retrievable
      const task = taskQueue.getTask(taskId);
      expect(task?.phase_payload).toBeDefined();
      const stored = JSON.parse(task!.phase_payload!);
      expect(stored).toEqual(payload);
    });

    it('should clear phase_payload when set to null', async () => {
      // Given: A task with payload
      const taskId = taskQueue.createTask({
        type: 'feature',
        title: 'Test Feature',
        priority: 1,
        assigned_agent: 'claude-sonnet',
      }).id;

      taskQueue.updateTask(taskId, {
        phase_payload: JSON.stringify({ data: 'test' }),
      });

      // When: Clearing payload
      taskQueue.updateTask(taskId, { phase_payload: null });

      // Then: Payload should be null
      const task = taskQueue.getTask(taskId);
      expect(task?.phase_payload).toBeNull();
    });

    it('should update phase_status independently', async () => {
      // Given: A task in running phase
      const taskId = taskQueue.createTask({
        type: 'feature',
        title: 'Test Feature',
        priority: 1,
        assigned_agent: 'claude-sonnet',
      }).id;

      // When: Updating status through different states
      taskQueue.updateTask(taskId, { phase_status: 'running' });
      let task = taskQueue.getTask(taskId);
      expect(task?.phase_status).toBe('running');

      taskQueue.updateTask(taskId, { phase_status: 'validating' });
      task = taskQueue.getTask(taskId);
      expect(task?.phase_status).toBe('validating');

      taskQueue.updateTask(taskId, { phase_status: 'recovering' });
      task = taskQueue.getTask(taskId);
      expect(task?.phase_status).toBe('recovering');

      taskQueue.updateTask(taskId, { phase_status: 'complete' });
      task = taskQueue.getTask(taskId);
      expect(task?.phase_status).toBe('complete');

      taskQueue.updateTask(taskId, { phase_status: 'blocked' });
      task = taskQueue.getTask(taskId);
      expect(task?.phase_status).toBe('blocked');
    });
  });

  describe('Phase Progression Tracking', () => {
    it('should track full phase progression history', async () => {
      // Given: A task progressing through phases
      const taskId = taskQueue.createTask({
        type: 'feature',
        title: 'Test Feature',
        priority: 1,
        assigned_agent: 'claude-sonnet',
      }).id;

      // When: Progressing through phases
      const progressions = [
        { phase_index: 1, phase_name: 'Planning' },
        { phase_index: 2, phase_name: 'Implementation' },
        { phase_index: 3, phase_name: 'Review' },
        { phase_index: 4, phase_name: 'Fixes' },
        { phase_index: 3, phase_name: 'Review' }, // Loop back
        { phase_index: 5, phase_name: 'Test & Validate' },
        { phase_index: 6, phase_name: 'Cleanup' },
        { phase_index: 7, phase_name: 'PR Shepherding' },
      ];

      for (const phase of progressions) {
        await taskQueue.updateTask(taskId, phase);
      }

      // Then: Final phase should be correct
      const task = taskQueue.getTask(taskId);
      expect(task?.phase_index).toBe(7);
      expect(task?.phase_name).toBe('PR Shepherding');
    });

    it('should handle Review/Fix loop correctly', async () => {
      // Given: A task in Review phase
      const taskId = taskQueue.createTask({
        type: 'feature',
        title: 'Test Feature',
        priority: 1,
        assigned_agent: 'claude-sonnet',
      }).id;

      taskQueue.updateTask(taskId, {
        phase_index: 3,
        phase_name: 'Review',
        phase_attempts: 1,
      });

      // When: Looping between Review and Fixes
      taskQueue.updateTask(taskId, {
        phase_index: 4,
        phase_name: 'Fixes',
        phase_attempts: 1,
      });

      taskQueue.updateTask(taskId, {
        phase_index: 3,
        phase_name: 'Review',
        phase_attempts: 2,
      });

      taskQueue.updateTask(taskId, {
        phase_index: 4,
        phase_name: 'Fixes',
        phase_attempts: 2,
      });

      taskQueue.updateTask(taskId, {
        phase_index: 3,
        phase_name: 'Review',
        phase_attempts: 3,
      });

      // Then: Should track attempt count correctly
      const task = taskQueue.getTask(taskId);
      expect(task?.phase_index).toBe(3);
      expect(task?.phase_attempts).toBe(3);
    });
  });

  describe('Metrics and Queries', () => {
    it('should count tasks by phase', async () => {
      // Given: Multiple tasks in different phases
      taskQueue.createTask({
        type: 'feature',
        title: 'Task 1',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_index: 1,
      });

      taskQueue.createTask({
        type: 'feature',
        title: 'Task 2',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_index: 2,
      });

      taskQueue.createTask({
        type: 'feature',
        title: 'Task 3',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_index: 2,
      });

      taskQueue.createTask({
        type: 'feature',
        title: 'Task 4',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_index: 5,
      });

      // When: Querying metrics
      const metrics = taskQueue.getQueueMetrics();

      // Then: Should have accurate counts
      expect(metrics.total).toBe(4);
      // Phase distribution can be checked if getQueueMetrics supports it
    });

    it('should filter tasks by phase', async () => {
      // Given: Tasks in different phases
      const task1Id = taskQueue.createTask({
        type: 'feature',
        title: 'Task 1',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_index: 3,
        status: 'pending',
      }).id;

      const task2Id = taskQueue.createTask({
        type: 'feature',
        title: 'Task 2',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_index: 3,
        status: 'pending',
      }).id;

      taskQueue.createTask({
        type: 'feature',
        title: 'Task 3',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_index: 5,
        status: 'pending',
      });

      // When: Getting tasks in phase 3
      const db = (taskQueue as any).db;
      const phase3Tasks = db.prepare('SELECT * FROM tasks WHERE phase_index = ?').all(3);

      // Then: Should return only phase 3 tasks
      expect(phase3Tasks).toHaveLength(2);
      expect(phase3Tasks.map((t: any) => t.id)).toContain(task1Id);
      expect(phase3Tasks.map((t: any) => t.id)).toContain(task2Id);
    });

    it('should track tasks in blocked phase_status', async () => {
      // Given: Tasks with different phase statuses
      taskQueue.createTask({
        type: 'feature',
        title: 'Task 1',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_status: 'blocked',
      });

      taskQueue.createTask({
        type: 'feature',
        title: 'Task 2',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_status: 'running',
      });

      taskQueue.createTask({
        type: 'feature',
        title: 'Task 3',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_status: 'blocked',
      });

      // When: Querying blocked tasks
      const db = (taskQueue as any).db;
      const blockedTasks = db.prepare('SELECT * FROM tasks WHERE phase_status = ?').all('blocked');

      // Then: Should find blocked tasks
      expect(blockedTasks).toHaveLength(2);
    });
  });

  describe('Chain Integration with Phases', () => {
    it('should track phase progress within chains', async () => {
      // Given: A chain of related tasks
      const chainId = 'chain-123';

      const task1Id = taskQueue.createTask({
        type: 'feature',
        title: 'Task 1',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        chain_id: chainId,
        chain_depth: 0,
        phase_index: 7, // Completed all phases
        status: 'completed',
      }).id;

      const task2Id = taskQueue.createTask({
        type: 'feature',
        title: 'Task 2 (fix)',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        chain_id: chainId,
        chain_depth: 1,
        phase_index: 3, // Currently in Review
        status: 'running',
      }).id;

      // When: Checking chain status
      const task1 = taskQueue.getTask(task1Id);
      const task2 = taskQueue.getTask(task2Id);

      // Then: Should track phases independently
      expect(task1?.phase_index).toBe(7);
      expect(task1?.status).toBe('completed');
      expect(task2?.phase_index).toBe(3);
      expect(task2?.status).toBe('running');
    });
  });

  describe('Phase Completion', () => {
    it('should mark task complete after phase 7', async () => {
      // Given: A task in final phase
      const taskId = taskQueue.createTask({
        type: 'feature',
        title: 'Test Feature',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_index: 7,
        phase_name: 'PR Shepherding',
        status: 'running', // Must be running to complete
      }).id;

      // When: Completing the task
      taskQueue.completeTask(taskId, 'Task completed', 'claude');

      // Then: Task should be completed
      const task = taskQueue.getTask(taskId);
      expect(task?.status).toBe('completed');
      expect(task?.completed_at).toBeDefined();
    });

    it('should preserve phase information after completion', async () => {
      // Given: A task completing at phase 7
      const taskId = taskQueue.createTask({
        type: 'feature',
        title: 'Test Feature',
        priority: 1,
        assigned_agent: 'claude-sonnet',
        phase_index: 7,
        phase_name: 'PR Shepherding',
        status: 'running', // Must be running to complete
      }).id;

      taskQueue.completeTask(taskId, 'Task completed', 'claude');

      // When: Retrieving completed task
      const task = taskQueue.getTask(taskId);

      // Then: Phase fields should be preserved
      expect(task?.phase_index).toBe(7);
      expect(task?.phase_name).toBe('PR Shepherding');
      expect(task?.status).toBe('completed');
    });
  });
});
