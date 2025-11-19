/**
 * Task Blocking and Resume Backend E2E Tests
 *
 * Tests the backend services for task blocking and resume functionality.
 * Focuses on:
 * - Task blocking on recovery failure
 * - Task blocking on attempt exhaustion
 * - Task resume mechanics
 * - Phase payload preservation
 * - Git branch tracking
 */

import Database from 'better-sqlite3';
import { TaskQueueService } from '../taskQueue.sqlite.js';
import { PhaseOrchestratorService } from '../phaseOrchestrator.service.js';
import { RecoveryAgentService } from '../recoveryAgent.service.js';
import { TaskExecutionService } from '../taskExecution.service.js';
import { EphemeralWorkerService } from '../ephemeralWorker.service.js';
import { MAX_PHASE_ATTEMPTS } from '../phaseConstants.js';
import fs from 'fs';
import path from 'path';

describe('Task Blocking and Resume - Backend E2E', () => {
  let db: Database.Database;
  let taskQueue: TaskQueueService;
  let phaseOrchestrator: PhaseOrchestratorService;
  let recoveryAgent: RecoveryAgentService;
  let taskExecution: TaskExecutionService;

  const TEST_DB_PATH = path.join(__dirname, '../../test-data/blocking-resume-test.db');

  beforeEach(() => {
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create fresh database
    db = new Database(TEST_DB_PATH);

    // Initialize tables (simplified schema for testing)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout', 'blocked')),
        phase_index INTEGER NOT NULL DEFAULT 1,
        phase_name TEXT NOT NULL DEFAULT 'planning',
        phase_attempts INTEGER NOT NULL DEFAULT 1,
        phase_status TEXT CHECK(phase_status IN ('ready', 'running', 'complete', 'blocked')),
        phase_payload TEXT,
        chain_status TEXT,
        blocked_reason TEXT,
        blocked_at INTEGER,
        blocked_by TEXT,
        resumed_by TEXT,
        resumed_at INTEGER,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS task_stage_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        phase_index INTEGER NOT NULL,
        phase_name TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failed', 'skipped')),
        artifacts_blob TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        recovery_diagnosis TEXT,
        exit_code INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );
    `);

    // Initialize services
    taskQueue = new TaskQueueService(db);
    phaseOrchestrator = new PhaseOrchestratorService(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Task Blocking - Recovery Failure', () => {
    test('should block task when recovery agent returns chain_blocked', () => {
      // Create a task
      const taskId = taskQueue.createTask({
        title: 'Test recovery blocking',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Simulate recovery failure
      const recovery = {
        category: 'chain_blocked' as const,
        diagnosis: 'Recovery agent failed - unrecoverable error',
        suggestedAction: 'Manual intervention required',
        confidence: 0.9
      };

      // Update task to blocked status (simulating taskExecution.service behavior)
      taskQueue.updateTask(taskId, {
        status: 'blocked',
        phase_status: 'blocked',
        blocked_reason: recovery.diagnosis,
        blocked_at: Date.now(),
        blocked_by: 'recovery_agent'
      });

      const task = taskQueue.getTask(taskId);

      expect(task?.status).toBe('blocked');
      expect(task?.phase_status).toBe('blocked');
      expect(task?.blocked_reason).toContain('Recovery agent failed');
      expect(task?.blocked_at).toBeTruthy();
      expect(task?.blocked_by).toBe('recovery_agent');
    });

    test('should set chain_status to blocked when blocking task', () => {
      const taskId = taskQueue.createTask({
        title: 'Test chain blocking',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Block task
      taskQueue.updateTask(taskId, {
        status: 'blocked',
        phase_status: 'blocked',
        chain_status: 'blocked',
        blocked_reason: 'Test blocking',
        blocked_at: Date.now()
      });

      const task = taskQueue.getTask(taskId);

      expect(task?.chain_status).toBe('blocked');
    });
  });

  describe('Task Blocking - Attempt Exhaustion', () => {
    test('should block task after MAX_PHASE_ATTEMPTS exhausted', () => {
      const taskId = taskQueue.createTask({
        title: 'Test max attempts blocking',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Update task to have max attempts
      taskQueue.updateTask(taskId, {
        phase_attempts: MAX_PHASE_ATTEMPTS,
        phase_index: 3,
        phase_name: 'review'
      });

      let task = taskQueue.getTask(taskId)!;

      // Check attempt limits
      const shouldBlock = phaseOrchestrator.checkAttemptLimits(task);

      expect(shouldBlock).toBe(true);

      // Verify task was blocked
      task = taskQueue.getTask(taskId)!;
      expect(task.status).toBe('blocked');
      expect(task.phase_status).toBe('blocked');
      expect(task.blocked_reason).toContain('4 attempts');
    });

    test('should not block task if under MAX_PHASE_ATTEMPTS', () => {
      const taskId = taskQueue.createTask({
        title: 'Test under max attempts',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Update task to have < max attempts
      taskQueue.updateTask(taskId, {
        phase_attempts: 2,
        phase_index: 3
      });

      const task = taskQueue.getTask(taskId)!;

      // Check attempt limits
      const shouldBlock = phaseOrchestrator.checkAttemptLimits(task);

      expect(shouldBlock).toBe(false);
      expect(task.status).toBe('pending');
    });
  });

  describe('Task Resume - Basic Mechanics', () => {
    test('should successfully resume a blocked task', () => {
      const taskId = taskQueue.createTask({
        title: 'Test task resume',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Block the task
      taskQueue.updateTask(taskId, {
        status: 'blocked',
        phase_status: 'blocked',
        phase_attempts: 4,
        blocked_reason: 'Test blocking',
        blocked_at: Date.now()
      });

      // Resume the task
      taskQueue.resumeTask(taskId, 'test-user');

      const task = taskQueue.getTask(taskId)!;

      expect(task.status).toBe('pending');
      expect(task.phase_status).toBe('ready');
      expect(task.phase_attempts).toBe(1); // Reset to 1
      expect(task.blocked_reason).toBeNull();
      expect(task.blocked_at).toBeNull();
      expect(task.resumed_by).toBe('test-user');
      expect(task.resumed_at).toBeTruthy();
    });

    test('should reset phase_attempts to 1 on resume', () => {
      const taskId = taskQueue.createTask({
        title: 'Test attempts reset',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      taskQueue.updateTask(taskId, {
        status: 'blocked',
        phase_attempts: 10
      });

      taskQueue.resumeTask(taskId, 'test-user');

      const task = taskQueue.getTask(taskId)!;
      expect(task.phase_attempts).toBe(1);
    });

    test('should preserve phase_index and phase_name on resume', () => {
      const taskId = taskQueue.createTask({
        title: 'Test phase preservation',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      taskQueue.updateTask(taskId, {
        status: 'blocked',
        phase_index: 5,
        phase_name: 'test-and-validate',
        phase_attempts: 4
      });

      taskQueue.resumeTask(taskId, 'test-user');

      const task = taskQueue.getTask(taskId)!;
      expect(task.phase_index).toBe(5);
      expect(task.phase_name).toBe('test-and-validate');
    });
  });

  describe('Phase Payload - Context Preservation', () => {
    test('should save phase_payload after phase execution', () => {
      const taskId = taskQueue.createTask({
        title: 'Test payload save',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Update phase payload
      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/test-branch',
        lastExecutionAt: Date.now(),
        artifacts: {
          validationPassed: false,
          phaseIndex: 3
        }
      });

      const payload = taskQueue.getPhasePayload(taskId);

      expect(payload).toBeTruthy();
      expect(payload.gitBranch).toBe('feature/test-branch');
      expect(payload.lastExecutionAt).toBeTruthy();
      expect(payload.artifacts).toBeTruthy();
    });

    test('should preserve phase_payload across block/resume', () => {
      const taskId = taskQueue.createTask({
        title: 'Test payload preservation',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Set payload
      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/preserve-test',
        lastCommitSha: 'abc123',
        recoveryAttempts: 2
      });

      const payloadBefore = taskQueue.getPhasePayload(taskId);

      // Block task
      taskQueue.updateTask(taskId, {
        status: 'blocked',
        blocked_reason: 'Test'
      });

      // Resume task
      taskQueue.resumeTask(taskId, 'test-user');

      const payloadAfter = taskQueue.getPhasePayload(taskId);

      expect(payloadAfter.gitBranch).toBe(payloadBefore.gitBranch);
      expect(payloadAfter.lastCommitSha).toBe(payloadBefore.lastCommitSha);
      expect(payloadAfter.recoveryAttempts).toBe(payloadBefore.recoveryAttempts);
    });

    test('should clear phase_payload when advancing to next phase', () => {
      const taskId = taskQueue.createTask({
        title: 'Test payload clearing',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Set payload
      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/clear-test',
        artifacts: { test: 'data' }
      });

      let payload = taskQueue.getPhasePayload(taskId);
      expect(payload.gitBranch).toBe('feature/clear-test');

      // Simulate phase advancement
      const task = taskQueue.getTask(taskId)!;
      const validation = { passed: true };
      phaseOrchestrator.advancePhase(task, validation);

      // Payload should be cleared
      payload = taskQueue.getPhasePayload(taskId);
      expect(payload).toEqual({});
    });

    test('should update phase_payload with partial data', () => {
      const taskId = taskQueue.createTask({
        title: 'Test partial payload update',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Set initial payload
      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/partial-test',
        lastCommitSha: 'abc123'
      });

      // Update with partial data
      taskQueue.updatePhasePayload(taskId, {
        recoveryAttempts: 3,
        environmentVars: { NODE_ENV: 'test' }
      });

      const payload = taskQueue.getPhasePayload(taskId);

      expect(payload.gitBranch).toBe('feature/partial-test');
      expect(payload.lastCommitSha).toBe('abc123');
      expect(payload.recoveryAttempts).toBe(3);
      expect(payload.environmentVars).toEqual({ NODE_ENV: 'test' });
    });
  });

  describe('Git Branch Tracking', () => {
    test('should store git branch name in phase_payload', () => {
      const taskId = taskQueue.createTask({
        title: 'Test git branch storage',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/task-123-implementation'
      });

      const payload = taskQueue.getPhasePayload(taskId);
      expect(payload.gitBranch).toBe('feature/task-123-implementation');
    });

    test('should NOT store entire branch content', () => {
      const taskId = taskQueue.createTask({
        title: 'Test branch content exclusion',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Update with typical branch name (not content)
      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/my-branch'
      });

      const task = taskQueue.getTask(taskId)!;
      const payloadStr = task.phase_payload || '';

      // Payload should be small (< 5KB for typical metadata)
      expect(payloadStr.length).toBeLessThan(5000);

      const payload = taskQueue.getPhasePayload(taskId);

      // Branch name should be a simple string, not complex object
      expect(typeof payload.gitBranch).toBe('string');
      expect(payload.gitBranch!.length).toBeLessThan(200);
    });

    test('should preserve git branch across multiple phase attempts', () => {
      const taskId = taskQueue.createTask({
        title: 'Test branch preservation across attempts',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Simulate first attempt
      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/multi-attempt',
        lastExecutionAt: Date.now()
      });

      const branch1 = taskQueue.getPhasePayload(taskId).gitBranch;

      // Simulate retry (update payload with new execution time)
      taskQueue.updatePhasePayload(taskId, {
        lastExecutionAt: Date.now() + 1000
      });

      const branch2 = taskQueue.getPhasePayload(taskId).gitBranch;

      // Branch name should remain the same
      expect(branch2).toBe(branch1);
      expect(branch2).toBe('feature/multi-attempt');
    });
  });

  describe('Stage Runs - Audit Trail', () => {
    test('should record stage run on task blocking', () => {
      const taskId = taskQueue.createTask({
        title: 'Test stage run recording',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // Record a failed stage run
      const stageRunId = phaseOrchestrator.recordStageRun({
        task_id: taskId,
        phase_index: 3,
        phase_name: 'review',
        attempt: 4,
        status: 'failed',
        created_at: Date.now(),
        completed_at: Date.now()
      });

      expect(stageRunId).toBeGreaterThan(0);

      // Get phase history
      const history = phaseOrchestrator.getPhaseHistory(taskId);
      expect(history).toHaveLength(1);
      expect(history[0].phase_index).toBe(3);
      expect(history[0].status).toBe('failed');
    });

    test('should record recovery diagnosis in stage run', () => {
      const taskId = taskQueue.createTask({
        title: 'Test recovery diagnosis recording',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      const stageRunId = phaseOrchestrator.recordStageRun({
        task_id: taskId,
        phase_index: 2,
        phase_name: 'implementation',
        attempt: 3,
        status: 'failed',
        created_at: Date.now()
      });

      // Update with recovery diagnosis
      const diagnosis = JSON.stringify({
        category: 'chain_blocked',
        reason: 'Unrecoverable compilation error'
      });

      phaseOrchestrator.updateStageRunWithRecovery(stageRunId, diagnosis, 'failed');

      const history = phaseOrchestrator.getPhaseHistory(taskId);
      expect(history[0].recovery_diagnosis).toBe(diagnosis);
    });
  });

  describe('Complete Block/Resume Flow', () => {
    test('should complete full block/resume lifecycle', () => {
      // 1. Create task
      const taskId = taskQueue.createTask({
        title: 'E2E lifecycle test',
        type: 'implementation',
        prompt: 'Test prompt',
        created_by: 'test-user'
      });

      // 2. Execute and set up context
      taskQueue.updateTask(taskId, {
        status: 'running',
        phase_index: 3,
        phase_name: 'review',
        phase_attempts: 1
      });

      taskQueue.updatePhasePayload(taskId, {
        gitBranch: 'feature/lifecycle-test',
        lastExecutionAt: Date.now()
      });

      // 3. Simulate failure and blocking
      taskQueue.updateTask(taskId, {
        status: 'blocked',
        phase_status: 'blocked',
        phase_attempts: 4,
        blocked_reason: 'Max attempts exhausted',
        blocked_at: Date.now()
      });

      let task = taskQueue.getTask(taskId)!;
      expect(task.status).toBe('blocked');

      const payloadBeforeResume = taskQueue.getPhasePayload(taskId);
      expect(payloadBeforeResume.gitBranch).toBe('feature/lifecycle-test');

      // 4. Resume task
      taskQueue.resumeTask(taskId, 'e2e-test-user');

      task = taskQueue.getTask(taskId)!;
      expect(task.status).toBe('pending');
      expect(task.phase_status).toBe('ready');
      expect(task.phase_attempts).toBe(1);
      expect(task.phase_index).toBe(3); // Preserved
      expect(task.resumed_by).toBe('e2e-test-user');

      // 5. Verify payload preserved
      const payloadAfterResume = taskQueue.getPhasePayload(taskId);
      expect(payloadAfterResume.gitBranch).toBe('feature/lifecycle-test');

      // 6. Simulate successful completion after resume
      taskQueue.updateTask(taskId, {
        status: 'completed',
        phase_status: 'complete',
        completed_at: Date.now()
      });

      task = taskQueue.getTask(taskId)!;
      expect(task.status).toBe('completed');
    });
  });
});
