/**
 * CheckSuiteHandler Integration Tests
 * 
 * Tests for complete check suite workflow including data recovery,
 * condition evaluation, and auto-merge logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CheckSuiteHandler } from '../checkSuiteHandler.js';
import type { GitHubCheckSuitePayload } from '../types.js';
import type { Task, TaskQueueService } from '../../taskQueue.sqlite.js';
import type { PRWorkflowOrchestrator } from '../../prWorkflowOrchestrator.service.js';
import type { PRConditionStateService } from '../../prConditionState.service.js';

describe('CheckSuiteHandler - Complete Workflow', () => {
  let handler: CheckSuiteHandler;
  let mockTaskQueue: Partial<TaskQueueService>;
  let mockPROrchestrator: Partial<PRWorkflowOrchestrator>;
  let mockPRConditionState: Partial<PRConditionStateService>;
  let mockGitHubPR: any;
  let mockPRMonitor: any;

  beforeEach(() => {
    mockGitHubPR = {
      getPRStatus: vi.fn(),
      updateBranch: vi.fn(),
    };

    mockPRMonitor = {
      mergePR: vi.fn(),
    };

    mockPROrchestrator = {
      getGitHubPRService: vi.fn(() => mockGitHubPR),
      getPRMonitor: vi.fn(() => mockPRMonitor),
    };

    mockTaskQueue = {
      findByPRNumber: vi.fn(),
      findByTaskId: vi.fn(),
      updateTask: vi.fn(),
    };

    mockPRConditionState = {
      evaluateConditions: vi.fn(),
    };

    handler = new CheckSuiteHandler(
      mockTaskQueue as TaskQueueService,
      mockPROrchestrator as PRWorkflowOrchestrator,
      mockPRConditionState as PRConditionStateService
    );
  });

  describe('Action Filtering', () => {
    it('should only process completed check suites', async () => {
      const actions = ['queued', 'in_progress', 'requested'];
      
      for (const action of actions) {
        const payload = createPayload(123, action, null);
        mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-abc', 'main'));
        
        await handler.handle(payload);
        
        expect(mockGitHubPR.getPRStatus).not.toHaveBeenCalled();
      }
    });

    it('should process completed action', async () => {
      const payload = createPayload(123, 'completed', 'success');
      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-abc', 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([createTask('task-impl-abc')]);

      await handler.handle(payload);

      expect(mockGitHubPR.getPRStatus).toHaveBeenCalled();
    });

    it('should skip if no PRs associated with check suite', async () => {
      const payload = createPayload(null, 'completed', 'success');

      await handler.handle(payload);

      expect(mockGitHubPR.getPRStatus).not.toHaveBeenCalled();
    });
  });

  describe('Data Recovery Workflow', () => {
    it('should recover orphaned task and continue processing', async () => {
      const taskId = 'task-implementation-recovery123';
      const payload = createPayload(300, 'completed', 'success');
      const task = createTask(taskId);

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus(taskId, 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([]);
      mockTaskQueue.findByTaskId!.mockResolvedValue(task);

      await handler.handle(payload);

      // Should update task with PR number
      expect(mockTaskQueue.updateTask).toHaveBeenCalledWith(taskId, { pr_number: 300 });
      
      // Should continue to evaluate conditions
      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledWith(300, 'check_suite');
    });

    it('should not attempt recovery if no task ID in branch', async () => {
      const payload = createPayload(301, 'completed', 'success');

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('copilot/sub-pr-50', 'staging'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([]);

      await handler.handle(payload);

      expect(mockTaskQueue.findByTaskId).not.toHaveBeenCalled();
      expect(mockPRConditionState.evaluateConditions).not.toHaveBeenCalled();
    });

    it('should skip update if task already has PR number', async () => {
      const taskId = 'task-implementation-existing';
      const payload = createPayload(302, 'completed', 'success');
      const task = createTask(taskId);
      task.pr_number = 302;

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus(taskId, 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([]);
      mockTaskQueue.findByTaskId!.mockResolvedValue(task);

      await handler.handle(payload);

      expect(mockTaskQueue.updateTask).not.toHaveBeenCalled();
      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalled();
    });
  });

  describe('Auto-Update Branch Workflow', () => {
    it('should update branch when PR is behind base', async () => {
      const payload = createPayload(400, 'completed', 'success');
      const task = createTask('task-impl-test');

      mockGitHubPR.getPRStatus.mockResolvedValue({
        ...createPRStatus('task-impl-test', 'main'),
        mergeable_state: 'behind',
        state: 'OPEN',
      });
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      expect(mockGitHubPR.updateBranch).toHaveBeenCalledWith(400, expect.any(String), expect.any(String));
    });

    it('should not update branch if PR is up to date', async () => {
      const payload = createPayload(401, 'completed', 'success');
      const task = createTask('task-impl-test');

      mockGitHubPR.getPRStatus.mockResolvedValue({
        ...createPRStatus('task-impl-test', 'main'),
        mergeable_state: 'clean',
        state: 'OPEN',
      });
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      expect(mockGitHubPR.updateBranch).not.toHaveBeenCalled();
    });

    it('should not update branch if PR is closed', async () => {
      const payload = createPayload(402, 'completed', 'success');
      const task = createTask('task-impl-test');

      mockGitHubPR.getPRStatus.mockResolvedValue({
        ...createPRStatus('task-impl-test', 'main'),
        mergeable_state: 'behind',
        state: 'CLOSED',
      });
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      expect(mockGitHubPR.updateBranch).not.toHaveBeenCalled();
    });
  });

  describe('Condition Evaluation Workflow', () => {
    it('should always evaluate PR conditions', async () => {
      const payload = createPayload(500, 'completed', 'success');
      const task = createTask('task-impl-test');

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-test', 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledWith(500, 'check_suite');
    });

    it('should evaluate conditions even on failure', async () => {
      const payload = createPayload(501, 'completed', 'failure');
      const task = createTask('task-impl-test');

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-test', 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledWith(501, 'check_suite');
    });

    it('should continue even if condition evaluation fails', async () => {
      const payload = createPayload(502, 'completed', 'success');
      const task = createTask('task-impl-test');

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-test', 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);
      mockPRConditionState.evaluateConditions!.mockRejectedValue(new Error('Evaluation failed'));

      await handler.handle(payload);

      // Should still attempt merge despite condition evaluation failure
      expect(mockPRMonitor.mergePR).toHaveBeenCalled();
    });
  });

  describe('Auto-Merge Workflow', () => {
    it('should attempt merge when tasks exist', async () => {
      const payload = createPayload(600, 'completed', 'success');
      const task = createTask('task-impl-test');

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-test', 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      expect(mockPRMonitor.mergePR).toHaveBeenCalledWith(600, task.id);
    });

    it('should use first task for merge when multiple tasks exist', async () => {
      const payload = createPayload(601, 'completed', 'success');
      const task1 = createTask('task-impl-first');
      const task2 = createTask('task-impl-second');

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-first', 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task1, task2]);

      await handler.handle(payload);

      expect(mockPRMonitor.mergePR).toHaveBeenCalledWith(601, task1.id);
    });
  });

  describe('Multiple PRs in Check Suite', () => {
    it('should process each PR independently', async () => {
      const payload = {
        action: 'completed',
        check_suite: {
          id: Date.now(),
          status: 'completed',
          conclusion: 'success',
          pull_requests: [
            { number: 700 },
            { number: 701 },
            { number: 702 },
          ],
        },
        repository: {
          full_name: 'test/repo',
          name: 'repo',
          owner: { login: 'test' },
        },
      };

      const prStatuses = [
        createPRStatus('task-impl-1', 'main'),
        createPRStatus('task-impl-2', 'main'),
        createPRStatus('task-impl-3', 'main'),
      ];

      mockGitHubPR.getPRStatus
        .mockResolvedValueOnce(prStatuses[0])
        .mockResolvedValueOnce(prStatuses[1])
        .mockResolvedValueOnce(prStatuses[2]);

      mockTaskQueue.findByPRNumber!.mockResolvedValue([createTask('task-impl-test')]);

      await handler.handle(payload);

      expect(mockGitHubPR.getPRStatus).toHaveBeenCalledTimes(3);
      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledTimes(3);
    });

    it('should skip invalid PRs but continue processing valid ones', async () => {
      const payload = {
        action: 'completed',
        check_suite: {
          id: Date.now(),
          status: 'completed',
          conclusion: 'success',
          pull_requests: [
            { number: 710 }, // Valid
            { number: 711 }, // Invalid branch
            { number: 712 }, // Valid
          ],
        },
        repository: {
          full_name: 'test/repo',
          name: 'repo',
          owner: { login: 'test' },
        },
      };

      mockGitHubPR.getPRStatus
        .mockResolvedValueOnce(createPRStatus('task-impl-1', 'main'))
        .mockResolvedValueOnce(createPRStatus('staging', 'main')) // Invalid
        .mockResolvedValueOnce(createPRStatus('task-impl-2', 'main'));

      mockTaskQueue.findByPRNumber!.mockResolvedValue([createTask('task-impl-test')]);

      await handler.handle(payload);

      // Should process first and third PR
      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledTimes(2);
      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledWith(710, 'check_suite');
      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledWith(712, 'check_suite');
    });
  });

  describe('Error Handling', () => {
    it('should handle PR status fetch failure gracefully', async () => {
      const payload = createPayload(800, 'completed', 'success');
      mockGitHubPR.getPRStatus.mockRejectedValue(new Error('GitHub API error'));

      await handler.handle(payload);

      expect(mockTaskQueue.findByPRNumber).not.toHaveBeenCalled();
    });

    it('should handle task queue errors gracefully', async () => {
      const payload = createPayload(801, 'completed', 'success');
      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-test', 'main'));
      mockTaskQueue.findByPRNumber!.mockRejectedValue(new Error('Database error'));

      await expect(handler.handle(payload)).resolves.not.toThrow();
    });

    it('should handle merge errors gracefully', async () => {
      const payload = createPayload(802, 'completed', 'success');
      const task = createTask('task-impl-test');

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-test', 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);
      mockPRMonitor.mergePR.mockRejectedValue(new Error('Merge conflict'));

      await expect(handler.handle(payload)).resolves.not.toThrow();
    });
  });

  describe('Conclusion-Specific Behavior', () => {
    it('should process success conclusion', async () => {
      const payload = createPayload(900, 'completed', 'success');
      const task = createTask('task-impl-test');

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-test', 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalled();
      expect(mockPRMonitor.mergePR).toHaveBeenCalled();
    });

    it('should process failure conclusion', async () => {
      const payload = createPayload(901, 'completed', 'failure');
      const task = createTask('task-impl-test');

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-test', 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      // Should still evaluate conditions (to spawn fix tasks)
      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalled();
    });

    it('should process cancelled conclusion', async () => {
      const payload = createPayload(902, 'completed', 'cancelled');
      const task = createTask('task-impl-test');

      mockGitHubPR.getPRStatus.mockResolvedValue(createPRStatus('task-impl-test', 'main'));
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalled();
    });
  });
});

// Helper functions

function createPayload(
  prNumber: number | null,
  action: string,
  conclusion: string | null
): GitHubCheckSuitePayload {
  return {
    action,
    check_suite: {
      id: Date.now(),
      status: action === 'completed' ? 'completed' : 'queued',
      conclusion,
      pull_requests: prNumber ? [{ number: prNumber }] : [],
    },
    repository: {
      full_name: 'test/repo',
      name: 'repo',
      owner: {
        login: 'test',
      },
    },
  };
}

function createPRStatus(headRef: string, baseRef: string): any {
  return {
    number: 123,
    url: 'https://api.github.com/repos/test/repo/pulls/123',
    html_url: 'https://github.com/test/repo/pull/123',
    state: 'OPEN',
    mergeable: 'MERGEABLE',
    mergeable_state: 'clean',
    head_ref: headRef,
    base_ref: baseRef,
    checks: [],
    reviews: [],
    comments: [],
  };
}

function createTask(id: string): Task {
  return {
    id,
    type: 'implementation',
    title: 'Test task',
    status: 'running',
    priority: 1,
    created_at: Date.now(),
    assigned_agent: 'claude',
    can_retry: true,
    retry_count: 0,
    max_retries: 3,
    timeout_ms: null,
    pr_number: undefined as any,
  } as Task;
}
