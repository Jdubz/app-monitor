/**
 * TaskQueueService.getAgentComparisonMetrics() Unit Tests
 *
 * Comprehensive tests for agent comparison metrics aggregation.
 * Tests cover:
 * - Normal operation with valid data
 * - Edge cases (no data, missing agents)
 * - Success rate calculation
 * - Average duration calculation
 * - Null value handling
 * - Division by zero scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskQueueService } from './taskQueue.sqlite.js';
import * as path from 'path';
import * as fs from 'fs';

describe('TaskQueueService - getAgentComparisonMetrics', () => {
  let taskQueue: TaskQueueService;
  let dbPath: string;

  beforeEach(() => {
    // Create a temporary test database
    dbPath = path.join(__dirname, '../../data/test-queue-comparison.db');
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Remove existing test database if it exists
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    if (fs.existsSync(`${dbPath}-shm`)) {
      fs.unlinkSync(`${dbPath}-shm`);
    }
    if (fs.existsSync(`${dbPath}-wal`)) {
      fs.unlinkSync(`${dbPath}-wal`);
    }

    taskQueue = new TaskQueueService(dbPath);
  });

  afterEach(() => {
    taskQueue.close();

    // Clean up test database files
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    if (fs.existsSync(`${dbPath}-shm`)) {
      fs.unlinkSync(`${dbPath}-shm`);
    }
    if (fs.existsSync(`${dbPath}-wal`)) {
      fs.unlinkSync(`${dbPath}-wal`);
    }
  });

  describe('Empty Database', () => {
    it('should return zero metrics when no tasks exist', () => {
      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(0);
      expect(metrics.claude.completed).toBe(0);
      expect(metrics.claude.failed).toBe(0);
      expect(metrics.claude.avg_duration_ms).toBeUndefined();
      expect(metrics.claude.success_rate).toBe(0);

      expect(metrics.codex.total).toBe(0);
      expect(metrics.codex.completed).toBe(0);
      expect(metrics.codex.failed).toBe(0);
      expect(metrics.codex.avg_duration_ms).toBeUndefined();
      expect(metrics.codex.success_rate).toBe(0);
    });
  });

  describe('Tasks Without agent_type', () => {
    it('should ignore tasks without agent_type field', () => {
      // Create tasks without agent_type
      taskQueue.createTask({
        type: 'implementation',
        title: 'Task without agent type',
        assigned_agent: 'backend-specialist'
      });

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(0);
      expect(metrics.codex.total).toBe(0);
    });
  });

  describe('Claude Agent Only', () => {
    it('should calculate metrics for claude agent with completed tasks', () => {
      // Create a task and complete it with Claude
      const task = taskQueue.createTask({
        type: 'implementation',
        title: 'Claude task 1',
        assigned_agent: 'backend-specialist'
      });

      // Assign and start the task
      const assignedTask = taskQueue.assignNextTask();
      expect(assignedTask).toBeDefined();

      // Complete with Claude agent
      taskQueue.completeTask(task.id, 'Task completed successfully', 'claude');

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(1);
      expect(metrics.claude.completed).toBe(1);
      expect(metrics.claude.failed).toBe(0);
      expect(metrics.claude.success_rate).toBe(100);
      expect(metrics.claude.avg_duration_ms).toBeGreaterThan(0);

      expect(metrics.codex.total).toBe(0);
    });

    it('should calculate metrics for claude agent with failed tasks', () => {
      const task = taskQueue.createTask({
        type: 'implementation',
        title: 'Claude task that fails',
        assigned_agent: 'backend-specialist',
        can_retry: false
      });

      // Assign and start
      taskQueue.assignNextTask();

      // Fail the task
      taskQueue.failTask(task.id, 'Test error');

      // Since agent_type is only set on completion, failed tasks won't have it
      // So we need to manually update the agent_type for testing
      const db = (taskQueue as any).db;
      db.prepare('UPDATE tasks SET agent_type = ? WHERE id = ?').run('claude', task.id);

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(1);
      expect(metrics.claude.completed).toBe(0);
      expect(metrics.claude.failed).toBe(1);
      expect(metrics.claude.success_rate).toBe(0);
      expect(metrics.claude.avg_duration_ms).toBeUndefined();
    });

    it('should calculate correct success rate with mixed results', () => {
      const db = (taskQueue as any).db;

      // Create 7 completed and 3 failed tasks
      for (let i = 0; i < 7; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Claude completed task ${i}`,
          assigned_agent: 'backend-specialist'
        });
        taskQueue.assignNextTask();
        taskQueue.completeTask(task.id, 'Success', 'claude');
      }

      for (let i = 0; i < 3; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Claude failed task ${i}`,
          assigned_agent: 'backend-specialist',
          can_retry: false
        });
        taskQueue.assignNextTask();
        taskQueue.failTask(task.id, 'Failed');
        db.prepare('UPDATE tasks SET agent_type = ? WHERE id = ?').run('claude', task.id);
      }

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(10);
      expect(metrics.claude.completed).toBe(7);
      expect(metrics.claude.failed).toBe(3);
      expect(metrics.claude.success_rate).toBe(70); // 7/(7+3) * 100
    });
  });

  describe('Codex Agent Only', () => {
    it('should calculate metrics for codex agent with completed tasks', () => {
      const task = taskQueue.createTask({
        type: 'implementation',
        title: 'Codex task 1',
        assigned_agent: 'backend-specialist'
      });

      taskQueue.assignNextTask();
      taskQueue.completeTask(task.id, 'Task completed successfully', 'codex');

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.codex.total).toBe(1);
      expect(metrics.codex.completed).toBe(1);
      expect(metrics.codex.failed).toBe(0);
      expect(metrics.codex.success_rate).toBe(100);
      expect(metrics.codex.avg_duration_ms).toBeGreaterThan(0);

      expect(metrics.claude.total).toBe(0);
    });

    it('should calculate correct success rate for codex', () => {
      const db = (taskQueue as any).db;

      // Create 6 completed and 4 failed tasks
      for (let i = 0; i < 6; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Codex completed task ${i}`,
          assigned_agent: 'backend-specialist'
        });
        taskQueue.assignNextTask();
        taskQueue.completeTask(task.id, 'Success', 'codex');
      }

      for (let i = 0; i < 4; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Codex failed task ${i}`,
          assigned_agent: 'backend-specialist',
          can_retry: false
        });
        taskQueue.assignNextTask();
        taskQueue.failTask(task.id, 'Failed');
        db.prepare('UPDATE tasks SET agent_type = ? WHERE id = ?').run('codex', task.id);
      }

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.codex.total).toBe(10);
      expect(metrics.codex.completed).toBe(6);
      expect(metrics.codex.failed).toBe(4);
      expect(metrics.codex.success_rate).toBe(60); // 6/(6+4) * 100
    });
  });

  describe('Both Agents', () => {
    it('should calculate metrics for both agents independently', () => {
      // Claude tasks
      for (let i = 0; i < 3; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Claude task ${i}`,
          assigned_agent: 'backend-specialist'
        });
        taskQueue.assignNextTask();
        taskQueue.completeTask(task.id, 'Success', 'claude');
      }

      // Codex tasks
      for (let i = 0; i < 5; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Codex task ${i}`,
          assigned_agent: 'frontend-specialist'
        });
        taskQueue.assignNextTask();
        taskQueue.completeTask(task.id, 'Success', 'codex');
      }

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(3);
      expect(metrics.claude.completed).toBe(3);
      expect(metrics.claude.failed).toBe(0);
      expect(metrics.claude.success_rate).toBe(100);

      expect(metrics.codex.total).toBe(5);
      expect(metrics.codex.completed).toBe(5);
      expect(metrics.codex.failed).toBe(0);
      expect(metrics.codex.success_rate).toBe(100);
    });

    it('should calculate different success rates for each agent', () => {
      const db = (taskQueue as any).db;

      // Claude: 8 completed, 2 failed (80% success)
      for (let i = 0; i < 8; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Claude completed ${i}`,
          assigned_agent: 'backend-specialist'
        });
        taskQueue.assignNextTask();
        taskQueue.completeTask(task.id, 'Success', 'claude');
      }

      for (let i = 0; i < 2; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Claude failed ${i}`,
          assigned_agent: 'backend-specialist',
          can_retry: false
        });
        taskQueue.assignNextTask();
        taskQueue.failTask(task.id, 'Failed');
        db.prepare('UPDATE tasks SET agent_type = ? WHERE id = ?').run('claude', task.id);
      }

      // Codex: 5 completed, 5 failed (50% success)
      for (let i = 0; i < 5; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Codex completed ${i}`,
          assigned_agent: 'frontend-specialist'
        });
        taskQueue.assignNextTask();
        taskQueue.completeTask(task.id, 'Success', 'codex');
      }

      for (let i = 0; i < 5; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Codex failed ${i}`,
          assigned_agent: 'frontend-specialist',
          can_retry: false
        });
        taskQueue.assignNextTask();
        taskQueue.failTask(task.id, 'Failed');
        db.prepare('UPDATE tasks SET agent_type = ? WHERE id = ?').run('codex', task.id);
      }

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(10);
      expect(metrics.claude.completed).toBe(8);
      expect(metrics.claude.failed).toBe(2);
      expect(metrics.claude.success_rate).toBe(80);

      expect(metrics.codex.total).toBe(10);
      expect(metrics.codex.completed).toBe(5);
      expect(metrics.codex.failed).toBe(5);
      expect(metrics.codex.success_rate).toBe(50);
    });
  });

  describe('Average Duration Calculation', () => {
    it('should calculate average duration for completed tasks only', () => {
      const db = (taskQueue as any).db;
      const now = Date.now();

      // Create a completed task with known duration (1000ms)
      const task1 = taskQueue.createTask({
        type: 'implementation',
        title: 'Task 1',
        assigned_agent: 'backend-specialist'
      });
      taskQueue.assignNextTask();

      // Manually set the timestamps for testing
      db.prepare('UPDATE tasks SET started_at = ?, completed_at = ? WHERE id = ?')
        .run(now, now + 1000, task1.id);
      db.prepare('UPDATE tasks SET status = ?, agent_type = ? WHERE id = ?')
        .run('completed', 'claude', task1.id);

      // Create another completed task with different duration (2000ms)
      const task2 = taskQueue.createTask({
        type: 'implementation',
        title: 'Task 2',
        assigned_agent: 'backend-specialist'
      });
      taskQueue.assignNextTask();

      db.prepare('UPDATE tasks SET started_at = ?, completed_at = ? WHERE id = ?')
        .run(now, now + 2000, task2.id);
      db.prepare('UPDATE tasks SET status = ?, agent_type = ? WHERE id = ?')
        .run('completed', 'claude', task2.id);

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(2);
      expect(metrics.claude.completed).toBe(2);
      expect(metrics.claude.avg_duration_ms).toBe(1500); // (1000 + 2000) / 2
    });

    it('should exclude failed tasks from average duration', () => {
      const db = (taskQueue as any).db;
      const now = Date.now();

      // Completed task
      const task1 = taskQueue.createTask({
        type: 'implementation',
        title: 'Task 1',
        assigned_agent: 'backend-specialist'
      });
      taskQueue.assignNextTask();

      db.prepare('UPDATE tasks SET started_at = ?, completed_at = ? WHERE id = ?')
        .run(now, now + 1000, task1.id);
      db.prepare('UPDATE tasks SET status = ?, agent_type = ? WHERE id = ?')
        .run('completed', 'claude', task1.id);

      // Failed task (should not affect average)
      const task2 = taskQueue.createTask({
        type: 'implementation',
        title: 'Task 2',
        assigned_agent: 'backend-specialist',
        can_retry: false
      });
      taskQueue.assignNextTask();
      taskQueue.failTask(task2.id, 'Error');
      db.prepare('UPDATE tasks SET agent_type = ? WHERE id = ?').run('claude', task2.id);

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(2);
      expect(metrics.claude.completed).toBe(1);
      expect(metrics.claude.failed).toBe(1);
      expect(metrics.claude.avg_duration_ms).toBe(1000); // Only completed task
    });

    it('should return undefined for avg_duration when no completed tasks', () => {
      const db = (taskQueue as any).db;

      // Create only failed tasks
      const task = taskQueue.createTask({
        type: 'implementation',
        title: 'Failed task',
        assigned_agent: 'backend-specialist',
        can_retry: false
      });
      taskQueue.assignNextTask();
      taskQueue.failTask(task.id, 'Error');
      db.prepare('UPDATE tasks SET agent_type = ? WHERE id = ?').run('claude', task.id);

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(1);
      expect(metrics.claude.completed).toBe(0);
      expect(metrics.claude.failed).toBe(1);
      expect(metrics.claude.avg_duration_ms).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle division by zero when calculating success rate', () => {
      const db = (taskQueue as any).db;

      // Create a task with agent_type but neither completed nor failed
      // This is an edge case that shouldn't happen in practice
      const task = taskQueue.createTask({
        type: 'implementation',
        title: 'Pending task',
        assigned_agent: 'backend-specialist'
      });

      // Manually set agent_type without completing or failing
      db.prepare('UPDATE tasks SET agent_type = ? WHERE id = ?').run('claude', task.id);

      const metrics = taskQueue.getAgentComparisonMetrics();

      // When completed + failed = 0, success_rate should be 0 (not NaN)
      expect(metrics.claude.total).toBe(1);
      expect(metrics.claude.completed).toBe(0);
      expect(metrics.claude.failed).toBe(0);
      expect(metrics.claude.success_rate).toBe(0);
      expect(isNaN(metrics.claude.success_rate)).toBe(false);
    });

    it('should handle null avg_duration_ms correctly', () => {
      const db = (taskQueue as any).db;

      // Create completed task without proper timestamps
      const task = taskQueue.createTask({
        type: 'implementation',
        title: 'Task without timestamps',
        assigned_agent: 'backend-specialist'
      });

      db.prepare('UPDATE tasks SET status = ?, agent_type = ? WHERE id = ?')
        .run('completed', 'claude', task.id);

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.completed).toBe(1);
      // avg_duration_ms should be undefined when timestamps are missing
      expect(metrics.claude.avg_duration_ms).toBeUndefined();
    });

    it('should handle tasks with other statuses (cancelled, timeout)', () => {
      const db = (taskQueue as any).db;

      // Create completed task
      const task1 = taskQueue.createTask({
        type: 'implementation',
        title: 'Completed task',
        assigned_agent: 'backend-specialist'
      });
      taskQueue.assignNextTask();
      taskQueue.completeTask(task1.id, 'Success', 'claude');

      // Create cancelled task
      const task2 = taskQueue.createTask({
        type: 'implementation',
        title: 'Cancelled task',
        assigned_agent: 'backend-specialist'
      });
      db.prepare('UPDATE tasks SET status = ?, agent_type = ? WHERE id = ?')
        .run('cancelled', 'claude', task2.id);

      // Create timeout task
      const task3 = taskQueue.createTask({
        type: 'implementation',
        title: 'Timeout task',
        assigned_agent: 'backend-specialist'
      });
      db.prepare('UPDATE tasks SET status = ?, agent_type = ? WHERE id = ?')
        .run('timeout', 'claude', task3.id);

      const metrics = taskQueue.getAgentComparisonMetrics();

      // Total should include all tasks with agent_type
      expect(metrics.claude.total).toBe(3);
      // Only completed status should be counted
      expect(metrics.claude.completed).toBe(1);
      // Only failed status should be counted (not cancelled or timeout)
      expect(metrics.claude.failed).toBe(0);
    });

    it('should handle very large numbers correctly', () => {
      const db = (taskQueue as any).db;
      const now = Date.now();

      // Create task with very large duration
      const task = taskQueue.createTask({
        type: 'implementation',
        title: 'Long running task',
        assigned_agent: 'backend-specialist'
      });
      taskQueue.assignNextTask();

      // 24 hours duration
      const largeDuration = 24 * 60 * 60 * 1000;
      db.prepare('UPDATE tasks SET started_at = ?, completed_at = ? WHERE id = ?')
        .run(now, now + largeDuration, task.id);
      db.prepare('UPDATE tasks SET status = ?, agent_type = ? WHERE id = ?')
        .run('completed', 'claude', task.id);

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.avg_duration_ms).toBe(largeDuration);
    });
  });

  describe('Data Consistency', () => {
    it('should count all tasks with agent_type in total', () => {
      const db = (taskQueue as any).db;

      // Create tasks with different statuses
      const statuses = ['completed', 'failed', 'pending', 'running', 'cancelled'];

      statuses.forEach((status) => {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Task ${status}`,
          assigned_agent: 'backend-specialist'
        });
        db.prepare('UPDATE tasks SET status = ?, agent_type = ? WHERE id = ?')
          .run(status, 'claude', task.id);
      });

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(5);
    });

    it('should maintain independent metrics for each agent', () => {
      // Mix of Claude and Codex tasks
      const claudeTask1 = taskQueue.createTask({
        type: 'implementation',
        title: 'Claude 1',
        assigned_agent: 'backend-specialist'
      });
      taskQueue.assignNextTask();
      taskQueue.completeTask(claudeTask1.id, 'Success', 'claude');

      const codexTask1 = taskQueue.createTask({
        type: 'implementation',
        title: 'Codex 1',
        assigned_agent: 'frontend-specialist'
      });
      taskQueue.assignNextTask();
      taskQueue.completeTask(codexTask1.id, 'Success', 'codex');

      const claudeTask2 = taskQueue.createTask({
        type: 'implementation',
        title: 'Claude 2',
        assigned_agent: 'backend-specialist'
      });
      taskQueue.assignNextTask();
      taskQueue.completeTask(claudeTask2.id, 'Success', 'claude');

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.total).toBe(2);
      expect(metrics.codex.total).toBe(1);

      // Verify they don't interfere with each other
      expect(metrics.claude.total + metrics.codex.total).toBe(3);
    });
  });

  describe('Success Rate Precision', () => {
    it('should calculate success rate with decimal precision', () => {
      const db = (taskQueue as any).db;

      // Create 3 completed and 2 failed (60% success)
      for (let i = 0; i < 3; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Completed ${i}`,
          assigned_agent: 'backend-specialist'
        });
        taskQueue.assignNextTask();
        taskQueue.completeTask(task.id, 'Success', 'claude');
      }

      for (let i = 0; i < 2; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Failed ${i}`,
          assigned_agent: 'backend-specialist',
          can_retry: false
        });
        taskQueue.assignNextTask();
        taskQueue.failTask(task.id, 'Failed');
        db.prepare('UPDATE tasks SET agent_type = ? WHERE id = ?').run('claude', task.id);
      }

      const metrics = taskQueue.getAgentComparisonMetrics();

      expect(metrics.claude.success_rate).toBe(60); // 3/5 * 100
    });

    it('should handle fractional success rates', () => {
      const db = (taskQueue as any).db;

      // Create 1 completed and 2 failed (33.33...% success)
      const task1 = taskQueue.createTask({
        type: 'implementation',
        title: 'Completed',
        assigned_agent: 'backend-specialist'
      });
      taskQueue.assignNextTask();
      taskQueue.completeTask(task1.id, 'Success', 'claude');

      for (let i = 0; i < 2; i++) {
        const task = taskQueue.createTask({
          type: 'implementation',
          title: `Failed ${i}`,
          assigned_agent: 'backend-specialist',
          can_retry: false
        });
        taskQueue.assignNextTask();
        taskQueue.failTask(task.id, 'Failed');
        db.prepare('UPDATE tasks SET agent_type = ? WHERE id = ?').run('claude', task.id);
      }

      const metrics = taskQueue.getAgentComparisonMetrics();

      // Should be approximately 33.33
      expect(metrics.claude.success_rate).toBeCloseTo(33.33, 1);
    });
  });
});
