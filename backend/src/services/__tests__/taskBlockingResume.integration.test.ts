/**
 * Task Blocking & Resume Integration Tests
 *
 * Tests the complete block/resume workflow including:
 * - Task blocking via recovery
 * - Phase payload persistence
 * - Manual task resume
 * - State consistency across the workflow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskQueueService, type Task } from '../taskQueue.sqlite.js';

describe('Task Blocking & Resume - Integration', () => {
  let taskQueue: TaskQueueService;

  beforeEach(() => {
    taskQueue = new TaskQueueService(':memory:');
  });

  afterEach(() => {
    try {
      taskQueue.close();
    } catch (_err) {
      // Ignore close errors
    }
  });

  describe('Complete Block/Resume Workflow', () => {
    it('should preserve context through block and resume cycle', () => {
      // Step 1: Create a task
      const task = taskQueue.createTask({
        type: 'feature',
        title: 'Integration Test Task',
        description: 'Testing block/resume flow',
        priority: 1,
        assigned_agent: 'claude-sonnet'
      });
      const taskId = task.id;

      // Verify initial state
      let currentTask = taskQueue.getTask(taskId)!;
      expect(currentTask.status).toBe('pending');
      expect(currentTask.phase_index).toBe(1);
      expect(currentTask.phase_name).toBe('Planning');
      expect(currentTask.phase_attempts).toBe(1);

      // Step 2: Simulate task advancement to Implementation phase
      taskQueue.updateTask(taskId, {
        phase_index: 2,
        phase_name: 'Implementation',
        phase_attempts: 2
      });

      // Step 3: Set phase payload (simulating container execution results)
      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/integration-test',
        lastExecutionAt: Date.now(),
        artifacts: {
          validationPassed: false,
          phaseIndex: 2,
          phaseName: 'Implementation',
          errorMessage: 'Build failed with 5 errors'
        },
        recoveryAttempts: 1
      });

      // Verify payload was stored
      let payload = taskQueue.getPhasePayload(taskId);
      expect(payload.gitBranch).toBe('feature/integration-test');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts!.errorMessage).toBe('Build failed with 5 errors');

      // Step 4: Block the task (simulating recovery failure)
      const db = taskQueue.getDb();
      db.prepare(`
        UPDATE tasks
        SET status = 'blocked',
            phase_status = 'blocked',
            chain_status = 'blocked',
            blocked_reason = 'Build failed - manual intervention required',
            blocked_at = ?,
            blocked_by = 'recovery_agent'
        WHERE id = ?
      `).run(Date.now(), taskId);

      // Verify blocked state
      currentTask = taskQueue.getTask(taskId)!;
      expect(currentTask.status).toBe('blocked');
      expect(currentTask.phase_status).toBe('blocked');
      expect(currentTask.chain_status).toBe('blocked');
      expect(currentTask.blocked_reason).toBe('Build failed - manual intervention required');
      expect(currentTask.phase_index).toBe(2); // Phase preserved
      expect(currentTask.phase_name).toBe('Implementation'); // Phase preserved
      expect(currentTask.phase_attempts).toBe(2); // Attempts preserved

      // Verify payload still exists
      payload = taskQueue.getPhasePayload(taskId);
      expect(payload.gitBranch).toBe('feature/integration-test');
      expect(payload.artifacts!.errorMessage).toBe('Build failed with 5 errors');

      // Step 5: Resume the task
      taskQueue.resumeTask(taskId, 'developer-john');

      // Verify resumed state
      currentTask = taskQueue.getTask(taskId)!;
      expect(currentTask.status).toBe('pending');
      expect(currentTask.phase_status).toBe('ready');
      expect(currentTask.chain_status).toBe('blocked'); // Chain status unchanged
      expect(currentTask.blocked_reason).toBeNull();
      expect(currentTask.blocked_at).toBeNull();
      expect(currentTask.blocked_by).toBeNull();
      expect(currentTask.resumed_by).toBe('developer-john');
      expect(currentTask.resumed_at).toBeGreaterThan(0);

      // Phase preserved, but attempts reset
      expect(currentTask.phase_index).toBe(2);
      expect(currentTask.phase_name).toBe('Implementation');
      expect(currentTask.phase_attempts).toBe(1); // RESET to 1

      // Payload still preserved
      payload = taskQueue.getPhasePayload(taskId);
      expect(payload.gitBranch).toBe('feature/integration-test');
      expect(payload.artifacts).toBeDefined();

      // Notes should contain resume audit trail
      expect(currentTask.notes).toContain('Task resumed by developer-john');
      expect(currentTask.notes).toContain('Previous block reason: Build failed - manual intervention required');
    });

    it('should handle multiple block/resume cycles', () => {
      const task = taskQueue.createTask({
        type: 'feature',
        title: 'Multi-cycle Test',
        priority: 1,
        assigned_agent: 'claude-sonnet'
      });
      const taskId = task.id;

      // First cycle
      taskQueue.updateTask(taskId, {
        phase_index: 3,
        phase_name: 'Review',
        phase_attempts: 2
      });

      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/multi-cycle',
        recoveryAttempts: 1
      });

      const db = taskQueue.getDb();
      db.prepare(`
        UPDATE tasks SET status = 'blocked', blocked_reason = 'First block',
        blocked_at = ?, blocked_by = 'agent'
        WHERE id = ?
      `).run(Date.now(), taskId);

      taskQueue.resumeTask(taskId, 'admin-1');

      let currentTask = taskQueue.getTask(taskId)!;
      expect(currentTask.phase_attempts).toBe(1);
      expect(currentTask.resumed_by).toBe('admin-1');

      // Second cycle
      taskQueue.updateTask(taskId, {
        phase_attempts: 3
      });

      db.prepare(`
        UPDATE tasks SET status = 'blocked', blocked_reason = 'Second block',
        blocked_at = ?, blocked_by = 'agent', resumed_by = NULL, resumed_at = NULL
        WHERE id = ?
      `).run(Date.now(), taskId);

      taskQueue.resumeTask(taskId, 'admin-2');

      currentTask = taskQueue.getTask(taskId)!;
      expect(currentTask.phase_attempts).toBe(1); // Reset again
      expect(currentTask.resumed_by).toBe('admin-2'); // Updated

      // Payload preserved through both cycles
      const payload = taskQueue.getPhasePayload(taskId);
      expect(payload.gitBranch).toBe('feature/multi-cycle');
    });

    it('should allow payload updates after resume', () => {
      const task = taskQueue.createTask({
        type: 'feature',
        title: 'Payload Update Test',
        priority: 1,
        assigned_agent: 'claude-sonnet'
      });
      const taskId = task.id;

      // Set initial payload
      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/test',
        recoveryAttempts: 1,
        artifacts: { attempt: 1 }
      });

      // Block and resume
      const db = taskQueue.getDb();
      db.prepare(`
        UPDATE tasks SET status = 'blocked', blocked_reason = 'Test',
        blocked_at = ?, blocked_by = 'agent'
        WHERE id = ?
      `).run(Date.now(), taskId);

      taskQueue.resumeTask(taskId, 'admin');

      // Update payload after resume (simulating next execution)
      taskQueue.updatePhasePayload(taskId, {
        recoveryAttempts: 2,
        artifacts: { attempt: 2 }
      });

      const payload = taskQueue.getPhasePayload(taskId);
      expect(payload.gitBranch).toBe('feature/test'); // Preserved
      expect(payload.recoveryAttempts).toBe(2); // Updated
      expect(payload.artifacts!.attempt).toBe(2); // Updated
    });

    it('should clear payload on task completion', () => {
      const task = taskQueue.createTask({
        type: 'feature',
        title: 'Completion Test',
        priority: 1,
        assigned_agent: 'claude-sonnet'
      });
      const taskId = task.id;

      // Set payload
      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/complete',
        artifacts: { data: 'value' }
      });

      let payload = taskQueue.getPhasePayload(taskId);
      expect(payload.gitBranch).toBe('feature/complete');

      // Complete task
      taskQueue.updateTask(taskId, {
        status: 'completed'
      });

      // Clear payload (would be done by orchestration layer)
      taskQueue.clearPhasePayload(taskId);

      payload = taskQueue.getPhasePayload(taskId);
      expect(payload).toEqual({});
    });

    it('should preserve payload across phase transitions', () => {
      const task = taskQueue.createTask({
        type: 'feature',
        title: 'Phase Transition Test',
        priority: 1,
        assigned_agent: 'claude-sonnet'
      });
      const taskId = task.id;

      // Phase 1: Planning
      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/transition',
        artifacts: { phase: 'planning', data: 'plan-data' }
      });

      // Transition to Phase 2
      taskQueue.updateTask(taskId, {
        phase_index: 2,
        phase_name: 'Implementation'
      });

      // Update payload for new phase
      taskQueue.updatePhasePayload(taskId, {
        artifacts: { phase: 'implementation', buildStatus: 'in-progress' }
      });

      const payload = taskQueue.getPhasePayload(taskId);
      expect(payload.gitBranch).toBe('feature/transition'); // Preserved
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts!.phase).toBe('implementation'); // Updated
      expect(payload.artifacts!.data).toBe('plan-data'); // Preserved from phase 1
      expect(payload.artifacts!.buildStatus).toBe('in-progress'); // Added
    });
  });

  describe('Error Handling', () => {
    it('should handle resume of non-existent task gracefully', () => {
      expect(() => {
        taskQueue.resumeTask('non-existent-id', 'admin');
      }).toThrow('Task non-existent-id not found');
    });

    it('should handle resume of non-blocked task gracefully', () => {
      const task = taskQueue.createTask({
        type: 'feature',
        title: 'Non-blocked Task',
        priority: 1,
        assigned_agent: 'claude-sonnet'
      });

      expect(() => {
        taskQueue.resumeTask(task.id, 'admin');
      }).toThrow('is not blocked');
    });

    it('should handle corrupted payload gracefully', () => {
      const task = taskQueue.createTask({
        type: 'feature',
        title: 'Corrupted Payload Test',
        priority: 1,
        assigned_agent: 'claude-sonnet'
      });

      // Corrupt the payload
      const db = taskQueue.getDb();
      db.prepare(`
        UPDATE tasks SET phase_payload = 'corrupted {json'
        WHERE id = ?
      `).run(task.id);

      // Should return empty object instead of throwing
      const payload = taskQueue.getPhasePayload(task.id);
      expect(payload).toEqual({});

      // Should still allow updates
      taskQueue.updatePhasePayload(task.id, {
        gitBranch: 'feature/recovery'
      });

      const newPayload = taskQueue.getPhasePayload(task.id);
      expect(newPayload.gitBranch).toBe('feature/recovery');
    });
  });
});
