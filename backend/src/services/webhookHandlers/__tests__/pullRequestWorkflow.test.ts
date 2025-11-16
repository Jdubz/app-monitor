/**
 * PullRequestHandler Workflow Tests
 * 
 * Tests for complete PR lifecycle including task adoption,
 * event routing, and state transitions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PullRequestHandler } from '../pullRequestHandler.js';
import type { GitHubPullRequestPayload } from '../types.js';
import type { TaskQueueService, Task } from '../../taskQueue.sqlite.js';
import type { PRWorkflowOrchestrator } from '../../prWorkflowOrchestrator.service.js';

describe('PullRequestHandler - Workflow Tests', () => {
  let handler: PullRequestHandler;
  let mockTaskQueue: Partial<TaskQueueService>;
  let mockPROrchestrator: Partial<PRWorkflowOrchestrator>;
  let mockPRConditionState: any;

  beforeEach(() => {
    mockTaskQueue = {
      findByPRNumber: vi.fn(),
      findByTaskId: vi.fn(),
      updateTask: vi.fn(),
    };

    mockPRConditionState = {
      evaluateConditions: vi.fn(),
    };

    mockPROrchestrator = {
      getPRConditionState: vi.fn(() => mockPRConditionState),
    };

    handler = new PullRequestHandler(
      mockTaskQueue as TaskQueueService,
      mockPROrchestrator as PRWorkflowOrchestrator
    );
  });

  describe('Task Finding and Adoption', () => {
    it('should find task by PR number', async () => {
      const task = createTask('task-impl-abc123');
      const payload = createPRPayload('task-impl-abc123', 'main', 'opened', 100);

      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      expect(mockTaskQueue.findByPRNumber).toHaveBeenCalledWith(100);
    });

    it('should find task by task ID from branch if not found by PR number', async () => {
      const taskId = 'task-impl-abc123';
      const task = createTask(taskId);
      const payload = createPRPayload(taskId, 'main', 'opened', 101);

      mockTaskQueue.findByPRNumber!.mockResolvedValue([]);
      mockTaskQueue.findByTaskId!.mockResolvedValue(task);

      await handler.handle(payload);

      expect(mockTaskQueue.findByTaskId).toHaveBeenCalledWith(taskId);
    });

    it('should extract task ID from PR title if not in branch', async () => {
      const taskId = 'task-impl-from-title';
      const task = createTask(taskId);
      const payload = createPRPayload('copilot/sub-pr-50', 'staging', 'opened', 102);
      payload.pull_request.title = `Fix: ${taskId} - Update logic`;

      mockTaskQueue.findByPRNumber!.mockResolvedValue([]);
      mockTaskQueue.findByTaskId!.mockResolvedValue(task);

      await handler.handle(payload);

      expect(mockTaskQueue.findByTaskId).toHaveBeenCalledWith(taskId);
    });

    it('should skip processing if no tasks found and no task ID available', async () => {
      const payload = createPRPayload('copilot/sub-pr-50', 'staging', 'opened', 103);

      mockTaskQueue.findByPRNumber!.mockResolvedValue([]);

      await handler.handle(payload);

      expect(mockPRConditionState.evaluateConditions).not.toHaveBeenCalled();
    });
  });

  describe('PR Event Routing', () => {
    const taskId = 'task-impl-test';
    const task = createTask(taskId);

    beforeEach(() => {
      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);
    });

    it('should handle opened event', async () => {
      const payload = createPRPayload(taskId, 'main', 'opened', 200);

      await handler.handle(payload);

      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledWith(200, 'pull_request_synchronize');
    });

    it('should handle synchronize event', async () => {
      const payload = createPRPayload(taskId, 'main', 'synchronize', 201);

      await handler.handle(payload);

      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledWith(201, 'pull_request_synchronize');
    });

    it('should handle closed event (not merged)', async () => {
      const payload = createPRPayload(taskId, 'main', 'closed', 202);
      payload.pull_request.merged = false;

      await handler.handle(payload);

      // Should not evaluate conditions for non-merged closed PRs
      expect(mockPRConditionState.evaluateConditions).not.toHaveBeenCalled();
    });

    it('should handle closed event (merged)', async () => {
      const payload = createPRPayload(taskId, 'main', 'closed', 203);
      payload.pull_request.merged = true;
      payload.pull_request.merged_at = new Date().toISOString();

      await handler.handle(payload);

      // Merged PRs are handled differently - should update task status
      expect(mockTaskQueue.updateTask).toHaveBeenCalled();
    });

    it('should handle reopened event', async () => {
      const payload = createPRPayload(taskId, 'main', 'reopened', 204);

      await handler.handle(payload);

      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledWith(204, 'pull_request_reopened');
    });

    it('should handle ready_for_review event', async () => {
      const payload = createPRPayload(taskId, 'main', 'ready_for_review', 205);
      payload.pull_request.draft = false;

      await handler.handle(payload);

      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledWith(205, 'pull_request_ready_for_review');
    });
  });

  describe('Draft PR Handling', () => {
    it('should skip evaluating conditions for draft PRs on opened', async () => {
      const taskId = 'task-impl-draft';
      const task = createTask(taskId);
      const payload = createPRPayload(taskId, 'main', 'opened', 300);
      payload.pull_request.draft = true;

      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      // Draft PRs should be tracked but not processed
      expect(mockTaskQueue.findByPRNumber).toHaveBeenCalled();
      expect(mockPRConditionState.evaluateConditions).not.toHaveBeenCalled();
    });

    it('should process when draft PR becomes ready', async () => {
      const taskId = 'task-impl-ready';
      const task = createTask(taskId);
      const payload = createPRPayload(taskId, 'main', 'ready_for_review', 301);
      payload.pull_request.draft = false;

      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);

      await handler.handle(payload);

      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalledWith(301, 'pull_request_ready_for_review');
    });
  });

  describe('Statistics Tracking', () => {
    it('should increment PR events counter', async () => {
      const taskId = 'task-impl-stats';
      const payload = createPRPayload(taskId, 'main', 'opened', 400);

      mockTaskQueue.findByPRNumber!.mockResolvedValue([]);

      const statsBefore = handler.getStats();
      await handler.handle(payload);
      const statsAfter = handler.getStats();

      expect(statsAfter.pr_events_received).toBeGreaterThan(statsBefore.pr_events_received);
    });

    it('should update last event timestamp', async () => {
      const taskId = 'task-impl-time';
      const payload = createPRPayload(taskId, 'main', 'opened', 401);

      mockTaskQueue.findByPRNumber!.mockResolvedValue([]);

      const before = Date.now();
      await handler.handle(payload);
      const stats = handler.getStats();

      expect(stats.last_event_time).toBeGreaterThanOrEqual(before);
    });
  });

  describe('Error Handling', () => {
    it('should handle task queue fetch errors gracefully', async () => {
      const payload = createPRPayload('task-impl-error', 'main', 'opened', 500);
      mockTaskQueue.findByPRNumber!.mockRejectedValue(new Error('Database error'));

      await expect(handler.handle(payload)).rejects.toThrow('Database error');
    });

    it('should handle condition evaluation errors gracefully', async () => {
      const taskId = 'task-impl-cond-error';
      const task = createTask(taskId);
      const payload = createPRPayload(taskId, 'main', 'opened', 501);

      mockTaskQueue.findByPRNumber!.mockResolvedValue([task]);
      mockPRConditionState.evaluateConditions.mockRejectedValue(new Error('Evaluation failed'));

      await expect(handler.handle(payload)).rejects.toThrow('Evaluation failed');
    });
  });

  describe('Multiple Tasks per PR', () => {
    it('should process PR with multiple associated tasks', async () => {
      const task1 = createTask('task-impl-first');
      const task2 = createTask('task-impl-second');
      const payload = createPRPayload('task-impl-first', 'main', 'opened', 600);

      mockTaskQueue.findByPRNumber!.mockResolvedValue([task1, task2]);

      await handler.handle(payload);

      // Should still process even with multiple tasks
      expect(mockPRConditionState.evaluateConditions).toHaveBeenCalled();
    });
  });

  describe('User Type Filtering', () => {
    it('should process PRs from bot users', async () => {
      const payload = createPRPayload('task-impl-bot', 'main', 'opened', 700);
      payload.pull_request.user.type = 'Bot';
      payload.pull_request.user.login = 'github-actions[bot]';

      mockTaskQueue.findByPRNumber!.mockResolvedValue([createTask('task-impl-bot')]);

      await handler.handle(payload);

      expect(mockTaskQueue.findByPRNumber).toHaveBeenCalled();
    });

    it('should process PRs from human users with task branches', async () => {
      const payload = createPRPayload('task-impl-human', 'main', 'opened', 701);
      payload.pull_request.user.type = 'User';
      payload.pull_request.user.login = 'developer';

      mockTaskQueue.findByPRNumber!.mockResolvedValue([createTask('task-impl-human')]);

      await handler.handle(payload);

      expect(mockTaskQueue.findByPRNumber).toHaveBeenCalled();
    });
  });
});

// Helper function

function createPRPayload(
  headRef: string,
  baseRef: string,
  action: string,
  prNumber: number
): GitHubPullRequestPayload {
  return {
    action,
    number: prNumber,
    pull_request: {
      number: prNumber,
      title: 'Test PR',
      state: 'open',
      html_url: `https://github.com/test/repo/pull/${prNumber}`,
      user: {
        login: 'testuser',
        type: 'User',
      },
      head: {
        ref: headRef,
        sha: 'abc123',
      },
      base: {
        ref: baseRef,
      },
      draft: false,
      merged: false,
      merged_at: null,
    },
    repository: {
      full_name: 'test/repo',
    },
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
