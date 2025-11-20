/**
 * Task Queue Blocking & Resume Tests
 *
 * Tests the blocking, resume, and phase payload functionality
 * for the task queue system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskQueueService, type PhasePayload, AUTO_ASSIGNED_AGENT } from '../taskQueue.sqlite.js';

describe('TaskQueueService - Blocking & Resume', () => {
  let taskQueue: TaskQueueService;

  beforeEach(() => {
    // Use in-memory database for test isolation
    taskQueue = new TaskQueueService(':memory:');
  });

  afterEach(() => {
    try {
      taskQueue.close();
    } catch (_err) {
      // Ignore close errors in tests
    }
  });

  it('marks tasks for automatic agent selection when none is provided', () => {
    const createdTask = taskQueue.createTask({
      type: 'documentation',
      title: 'Update README',
      description: 'Refresh docs'
    });

    expect(createdTask.assigned_agent).toBe(AUTO_ASSIGNED_AGENT);
  });

  describe('resumeTask', () => {
    it('should successfully resume a blocked task', () => {
      // Create a task and manually block it
      const createdTask = taskQueue.createTask({
        type: 'feature',
        title: 'Test Task',
        priority: 1,
        assigned_agent: 'agent-1'
      });
      const taskId = createdTask.id;

      // Block it manually using direct database access
      const db = taskQueue.getDb();
      db.prepare(`
        UPDATE tasks
        SET status = 'blocked',
            phase_index = 2,
            phase_name = 'Implementation',
            phase_status = 'blocked',
            phase_attempts = 3,
            blocked_reason = 'Manual intervention required',
            blocked_at = ?,
            blocked_by = 'recovery_agent'
        WHERE id = ?
      `).run(Date.now(), taskId);

      // Resume the task
      taskQueue.resumeTask(taskId, 'admin-user');

      // Verify task state
      const task = taskQueue.getTask(taskId);
      expect(task).toBeDefined();
      expect(task!.status).toBe('pending');
      expect(task!.phase_status).toBe('ready');
      expect(task!.phase_attempts).toBe(1); // Reset to 1
      expect(task!.blocked_reason).toBeNull();
      expect(task!.blocked_at).toBeNull();
      expect(task!.blocked_by).toBeNull();
      expect(task!.resumed_by).toBe('admin-user');
      expect(task!.resumed_at).toBeGreaterThan(0);
      expect(task!.notes).toContain('Task resumed by admin-user');
    });

    it('should preserve phase progress when resuming', () => {
      const createdTask = taskQueue.createTask({
        type: 'feature',
        title: 'Test Task',
        priority: 1,
        assigned_agent: 'agent-1'
      });
      const taskId = createdTask.id;

      // Block it at phase 4 with 2 attempts
      const db = taskQueue.getDb();
      db.prepare(`
        UPDATE tasks
        SET status = 'blocked',
            phase_index = 4,
            phase_name = 'Fixes',
            phase_status = 'blocked',
            phase_attempts = 2,
            blocked_reason = 'Build failed',
            blocked_at = ?,
            blocked_by = 'recovery_agent'
        WHERE id = ?
      `).run(Date.now(), taskId);

      // Resume the task
      taskQueue.resumeTask(taskId, 'developer-1');

      // Verify phase progress preserved
      const task = taskQueue.getTask(taskId);
      expect(task!.phase_index).toBe(4);
      expect(task!.phase_name).toBe('Fixes');
      expect(task!.phase_attempts).toBe(1); // Reset but phase preserved
    });

    it('should throw error if task not found', () => {
      expect(() => {
        taskQueue.resumeTask('nonexistent-task', 'admin');
      }).toThrow('Task nonexistent-task not found');
    });

    it('should throw error if task is not blocked', () => {
      const createdTask = taskQueue.createTask({
        type: 'feature',
        title: 'Test Task',
        priority: 1,
        assigned_agent: 'agent-1'
      });

      expect(() => {
        taskQueue.resumeTask(createdTask.id, 'admin');
      }).toThrow('is not blocked');
    });

    it('should include previous block reason in notes', () => {
      const createdTask = taskQueue.createTask({
        type: 'feature',
        title: 'Test Task',
        priority: 1,
        assigned_agent: 'agent-1'
      });
      const taskId = createdTask.id;

      const blockReason = 'Tests failed with 5 errors';
      const db = taskQueue.getDb();
      db.prepare(`
        UPDATE tasks
        SET status = 'blocked',
            blocked_reason = ?,
            blocked_at = ?,
            blocked_by = 'recovery_agent'
        WHERE id = ?
      `).run(blockReason, Date.now(), taskId);

      taskQueue.resumeTask(taskId, 'qa-engineer');

      const task = taskQueue.getTask(taskId);
      expect(task!.notes).toContain('Previous block reason: Tests failed with 5 errors');
    });

    it('should append to existing notes if present', () => {
      const createdTask = taskQueue.createTask({
        type: 'feature',
        title: 'Test Task',
        priority: 1,
        assigned_agent: 'agent-1',
        description: 'Original task notes'
      });
      const taskId = createdTask.id;

      const db = taskQueue.getDb();
      db.prepare(`
        UPDATE tasks
        SET status = 'blocked',
            blocked_reason = 'Some error',
            blocked_at = ?,
            blocked_by = 'recovery_agent',
            notes = 'Original task notes'
        WHERE id = ?
      `).run(Date.now(), taskId);

      taskQueue.resumeTask(taskId, 'admin');

      const task = taskQueue.getTask(taskId);
      expect(task!.notes).toContain('Original task notes');
      expect(task!.notes).toContain('Task resumed by admin');
    });
  });

  describe('Phase Payload', () => {
    describe('getPhasePayload', () => {
      it('should return empty object for task with no payload', () => {
        const createdTask = taskQueue.createTask({
          type: 'feature',
          title: 'Test Task',
          priority: 1,
          assigned_agent: 'agent-1'
        });

        const payload = taskQueue.getPhasePayload(createdTask.id);
        expect(payload).toEqual({});
      });

      it('should parse and return existing payload', () => {
        const createdTask = taskQueue.createTask({
          type: 'feature',
          title: 'Test Task',
          priority: 1,
          assigned_agent: 'agent-1'
        });
        const taskId = createdTask.id;

        const payloadData: PhasePayload = {
          gitBranch: 'feature/test-123',
          lastExecutionAt: Date.now(),
          artifacts: {
            validationPassed: true,
            phaseIndex: 2
          }
        };

        // Set the payload
        taskQueue.updatePhasePayload(taskId, payloadData);

        // Retrieve and verify
        const payload = taskQueue.getPhasePayload(taskId);
        expect(payload).toEqual(payloadData);
        expect(payload.gitBranch).toBe('feature/test-123');
        expect(payload.artifacts).toBeDefined();
        expect(payload.artifacts!.validationPassed).toBe(true);
      });

      it('should return empty object for nonexistent task', () => {
        const payload = taskQueue.getPhasePayload('nonexistent-task');
        expect(payload).toEqual({});
      });

      it('should handle invalid JSON gracefully', () => {
        const createdTask = taskQueue.createTask({
          type: 'feature',
          title: 'Test Task',
          priority: 1,
          assigned_agent: 'agent-1'
        });

        // Corrupt the JSON directly in the database
        const db = taskQueue.getDb();
        db.prepare(`
          UPDATE tasks
          SET phase_payload = 'invalid json {'
          WHERE id = ?
        `).run(createdTask.id);

        const payload = taskQueue.getPhasePayload(createdTask.id);
        expect(payload).toEqual({});
      });
    });

    describe('updatePhasePayload', () => {
      it('should create new payload for task with none', () => {
        const createdTask = taskQueue.createTask({
          type: 'feature',
          title: 'Test Task',
          priority: 1,
          assigned_agent: 'agent-1'
        });

        taskQueue.updatePhasePayload(createdTask.id, {
          gitBranch: 'feature/new-feature',
          lastExecutionAt: Date.now()
        });

        const payload = taskQueue.getPhasePayload(createdTask.id);
        expect(payload.gitBranch).toBe('feature/new-feature');
        expect(payload.lastExecutionAt).toBeGreaterThan(0);
      });

      it('should merge partial updates with existing payload', () => {
        const createdTask = taskQueue.createTask({
          type: 'feature',
          title: 'Test Task',
          priority: 1,
          assigned_agent: 'agent-1'
        });
        const taskId = createdTask.id;

        const initialPayload: PhasePayload = {
          gitBranch: 'feature/test',
          lastExecutionAt: 1000000,
          artifacts: { initial: true }
        };

        taskQueue.updatePhasePayload(taskId, initialPayload);

        // Update with partial payload
        taskQueue.updatePhasePayload(taskId, {
          lastExecutionAt: 2000000,
          recoveryAttempts: 1
        });

        const payload = taskQueue.getPhasePayload(taskId);
        expect(payload.gitBranch).toBe('feature/test'); // Preserved
        expect(payload.lastExecutionAt).toBe(2000000); // Updated
        expect(payload.recoveryAttempts).toBe(1); // Added
        expect(payload.artifacts).toEqual({ initial: true }); // Preserved
      });

      it('should deep merge nested artifacts', () => {
        const createdTask = taskQueue.createTask({
          type: 'feature',
          title: 'Test Task',
          priority: 1,
          assigned_agent: 'agent-1'
        });
        const taskId = createdTask.id;

        const initialPayload: PhasePayload = {
          artifacts: {
            phaseIndex: 1,
            validationPassed: true
          }
        };

        taskQueue.updatePhasePayload(taskId, initialPayload);

        // Update artifacts
        taskQueue.updatePhasePayload(taskId, {
          artifacts: {
            phaseIndex: 2,
            newField: 'value'
          }
        });

        const payload = taskQueue.getPhasePayload(taskId);
        expect(payload.artifacts).toEqual({
          phaseIndex: 2, // Updated
          validationPassed: true, // Preserved
          newField: 'value' // Added
        });
      });

      it('should handle all PhasePayload fields', () => {
        const createdTask = taskQueue.createTask({
          type: 'feature',
          title: 'Test Task',
          priority: 1,
          assigned_agent: 'agent-1'
        });

        const fullPayload: PhasePayload = {
          gitBranch: 'feature/complete',
          lastCommitSha: 'abc123def456',
          artifacts: { test: 'data' },
          recoveryAttempts: 2,
          lastExecutionAt: Date.now(),
          environmentVars: { NODE_ENV: 'test' },
          metadata: { custom: 'field' }
        };

        taskQueue.updatePhasePayload(createdTask.id, fullPayload);

        const payload = taskQueue.getPhasePayload(createdTask.id);
        expect(payload).toEqual(fullPayload);
      });

      it('should not throw for nonexistent task', () => {
        expect(() => {
          taskQueue.updatePhasePayload('nonexistent-task', {
            gitBranch: 'feature/test'
          });
        }).not.toThrow();
      });
    });

    describe('clearPhasePayload', () => {
      it('should clear payload for task', () => {
        const createdTask = taskQueue.createTask({
          type: 'feature',
          title: 'Test Task',
          priority: 1,
          assigned_agent: 'agent-1'
        });
        const taskId = createdTask.id;

        const payload: PhasePayload = {
          gitBranch: 'feature/test',
          artifacts: { data: 'value' }
        };

        taskQueue.updatePhasePayload(taskId, payload);

        // Verify payload exists
        let currentPayload = taskQueue.getPhasePayload(taskId);
        expect(currentPayload.gitBranch).toBe('feature/test');

        // Clear it
        taskQueue.clearPhasePayload(taskId);

        // Verify cleared
        currentPayload = taskQueue.getPhasePayload(taskId);
        expect(currentPayload).toEqual({});
      });

      it('should not throw for task with no payload', () => {
        const createdTask = taskQueue.createTask({
          type: 'feature',
          title: 'Test Task',
          priority: 1,
          assigned_agent: 'agent-1'
        });

        expect(() => {
          taskQueue.clearPhasePayload(createdTask.id);
        }).not.toThrow();
      });

      it('should not throw for nonexistent task', () => {
        expect(() => {
          taskQueue.clearPhasePayload('nonexistent-task');
        }).not.toThrow();
      });
    });
  });
});
