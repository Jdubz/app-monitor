// @ts-nocheck
/**
 * Unit tests for PR Sync Service
 * 
 * Tests the PR recovery mechanism that checks both pr_condition_states
 * and tasks tables to detect and clean up stale PRs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PRSyncService } from '../prSync.service.js';
import type { TaskQueueService, Task } from '../taskQueue.sqlite.js';
import type { GitHubPRService } from '../githubPR.service.js';
import type { PullRequestHandler } from '../webhookHandlers/pullRequestHandler.js';
import type { PRConditionStateService } from '../prConditionState.service.js';

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('../githubPR.service.js', () => ({
  getGitHubPRService: vi.fn()
}));

vi.mock('../config.js', () => ({
  config: {
    prSync: {
      enabled: true,
      taskThreshold: 10
    },
    devBots: {
      repositoryUrl: 'https://github.com/test-owner/test-repo.git'
    }
  }
}));

describe('PRSyncService', () => {
  let prSyncService: PRSyncService;
  let mockTaskQueue: Partial<TaskQueueService>;
  let mockGitHubPR: Partial<GitHubPRService>;
  let mockPRHandler: Partial<PullRequestHandler>;
  let mockPRConditionState: Partial<PRConditionStateService>;

  beforeEach(() => {
    // Mock task queue
    mockTaskQueue = {
      getTasksByStatus: vi.fn()
    };

    // Mock GitHub PR service
    mockGitHubPR = {
      getPRStatus: vi.fn()
    };

    // Mock pull request handler
    mockPRHandler = {
      handle: vi.fn()
    };

    // Mock PR condition state service
    mockPRConditionState = {
      getAllTrackedPRNumbers: vi.fn()
    };

    // Create service instance
    prSyncService = new PRSyncService(mockTaskQueue as TaskQueueService);
    
    // Inject dependencies
    (prSyncService as any).githubPR = mockGitHubPR;
    prSyncService.setPullRequestHandler(mockPRHandler as PullRequestHandler);
    prSyncService.setPRConditionStateService(mockPRConditionState as PRConditionStateService);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTrackedPRsWithTasks', () => {
    it('should get PRs from pr_condition_states table', async () => {
      // Setup: PRs in pr_condition_states
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([183, 184, 185]);
      vi.mocked(mockTaskQueue.getTasksByStatus!).mockResolvedValue([]);

      await prSyncService.syncAllTrackedPRs();

      expect(mockPRConditionState.getAllTrackedPRNumbers).toHaveBeenCalled();
    });

    it('should get PRs from tasks table', async () => {
      // Setup: Tasks with pr_number
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([]);
      
      const tasksWithPR: Partial<Task>[] = [
        { id: 'task-1', pr_number: 100, status: 'pending' },
        { id: 'task-2', pr_number: 101, status: 'running' },
        { id: 'task-3', pr_number: 102, status: 'failed' }
      ];

      vi.mocked(mockTaskQueue.getTasksByStatus!)
        .mockResolvedValueOnce(tasksWithPR.filter(t => t.status === 'pending') as Task[])
        .mockResolvedValueOnce(tasksWithPR.filter(t => t.status === 'running') as Task[])
        .mockResolvedValueOnce(tasksWithPR.filter(t => t.status === 'failed') as Task[]);

      await prSyncService.syncAllTrackedPRs();

      expect(mockTaskQueue.getTasksByStatus).toHaveBeenCalledWith('pending');
      expect(mockTaskQueue.getTasksByStatus).toHaveBeenCalledWith('running');
      expect(mockTaskQueue.getTasksByStatus).toHaveBeenCalledWith('failed');
    });

    it('should combine PRs from both sources without duplicates', async () => {
      // Setup: PR 183 in both sources
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([183, 184]);
      
      const tasksWithPR: Partial<Task>[] = [
        { id: 'task-1', pr_number: 183, status: 'failed' }, // Duplicate PR 183
        { id: 'task-2', pr_number: 185, status: 'pending' }  // New PR 185
      ];

      vi.mocked(mockTaskQueue.getTasksByStatus!)
        .mockResolvedValueOnce([tasksWithPR[1] as Task])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([tasksWithPR[0] as Task]);

      // Mock GitHub to return merged for all
      vi.mocked(mockGitHubPR.getPRStatus!).mockResolvedValue({
        state: 'MERGED',
        number: 183,
        title: 'Test PR',
        url: 'https://github.com/test/repo/pull/183',
        head: { ref: 'test', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        merged: true,
        mergeable: null,
        checks: []
      });

      await prSyncService.syncAllTrackedPRs();

      // Should call GitHub API for PRs 183, 184, 185 (3 unique PRs)
      expect(mockGitHubPR.getPRStatus).toHaveBeenCalledTimes(3);
    });

    it('should include failed tasks (regression test)', async () => {
      // CRITICAL: This prevents regression of the bug where failed tasks were ignored
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([]);
      
      const failedTask: Partial<Task> = {
        id: 'task-failed',
        pr_number: 200,
        status: 'failed',
        title: 'Failed task with merged PR'
      };

      vi.mocked(mockTaskQueue.getTasksByStatus!)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([failedTask as Task]);

      vi.mocked(mockGitHubPR.getPRStatus!).mockResolvedValue({
        state: 'MERGED',
        number: 200,
        title: 'Test PR',
        url: 'https://github.com/test/repo/pull/200',
        head: { ref: 'test', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        merged: true,
        mergeable: null,
        checks: []
      });

      await prSyncService.syncAllTrackedPRs();

      // Should check the failed task's PR
      expect(mockGitHubPR.getPRStatus).toHaveBeenCalledWith(200);
    });
  });

  describe('checkPRDelta - source detection', () => {
    it('should detect PRs from pr_condition_states as source: pr_conditions', async () => {
      // Setup: PR only in pr_condition_states (no tasks)
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([183]);
      vi.mocked(mockTaskQueue.getTasksByStatus!).mockResolvedValue([]);

      vi.mocked(mockGitHubPR.getPRStatus!).mockResolvedValue({
        state: 'MERGED',
        number: 183,
        title: 'Test PR',
        url: 'https://github.com/test/repo/pull/183',
        head: { ref: 'test', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        merged: true,
        mergeable: null,
        checks: []
      });

      await prSyncService.syncAllTrackedPRs();

      // Should call handler with merged PR
      expect(mockPRHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'closed',
          number: 183,
          pull_request: expect.objectContaining({
            merged: true
          })
        })
      );
    });

    it('should detect PRs from tasks as source: tasks', async () => {
      // Setup: PR only in tasks (not in pr_condition_states)
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([]);
      
      const task: Partial<Task> = {
        id: 'task-1',
        pr_number: 100,
        status: 'failed'
      };

      vi.mocked(mockTaskQueue.getTasksByStatus!)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([task as Task]);

      vi.mocked(mockGitHubPR.getPRStatus!).mockResolvedValue({
        state: 'MERGED',
        number: 100,
        title: 'Test PR',
        url: 'https://github.com/test/repo/pull/100',
        head: { ref: 'test', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        merged: true,
        mergeable: null,
        checks: []
      });

      await prSyncService.syncAllTrackedPRs();

      expect(mockPRHandler.handle).toHaveBeenCalled();
    });

    it('should always check PRs from pr_condition_states (no task filter)', async () => {
      // CRITICAL: PRs from pr_condition_states should always be checked,
      // regardless of task status
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([183]);
      vi.mocked(mockTaskQueue.getTasksByStatus!).mockResolvedValue([]);

      vi.mocked(mockGitHubPR.getPRStatus!).mockResolvedValue({
        state: 'MERGED',
        number: 183,
        title: 'Test PR',
        url: 'https://github.com/test/repo/pull/183',
        head: { ref: 'test', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        merged: true,
        mergeable: null,
        checks: []
      });

      await prSyncService.syncAllTrackedPRs();

      // Should check PR even with no tasks
      expect(mockGitHubPR.getPRStatus).toHaveBeenCalledWith(183);
    });

    it('should skip task-based PRs with only completed tasks', async () => {
      // Task-based PRs should skip if all tasks are completed
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([]);

      // Return empty arrays for all status queries (no tasks at all)
      vi.mocked(mockTaskQueue.getTasksByStatus!)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await prSyncService.syncAllTrackedPRs();

      // Should NOT check GitHub (no PRs to sync)
      expect(mockGitHubPR.getPRStatus).not.toHaveBeenCalled();
    });
  });

  describe('delta resolution', () => {
    it('should detect merged PRs and call webhook handler', async () => {
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([183]);
      vi.mocked(mockTaskQueue.getTasksByStatus!).mockResolvedValue([]);

      vi.mocked(mockGitHubPR.getPRStatus!).mockResolvedValue({
        state: 'MERGED',
        number: 183,
        title: 'Staging',
        url: 'https://github.com/test/repo/pull/183',
        head: { ref: 'staging', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        merged: true,
        mergeable: null,
        checks: []
      });

      await prSyncService.syncAllTrackedPRs();

      expect(mockPRHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'closed',
          number: 183,
          pull_request: expect.objectContaining({
            state: 'closed',
            merged: true
          })
        })
      );
    });

    it('should detect closed (non-merged) PRs', async () => {
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([184]);
      vi.mocked(mockTaskQueue.getTasksByStatus!).mockResolvedValue([]);

      vi.mocked(mockGitHubPR.getPRStatus!).mockResolvedValue({
        state: 'CLOSED',
        number: 184,
        title: 'Test PR',
        url: 'https://github.com/test/repo/pull/184',
        head: { ref: 'test', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        merged: false,
        mergeable: null,
        checks: []
      });

      await prSyncService.syncAllTrackedPRs();

      expect(mockPRHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          pull_request: expect.objectContaining({
            merged: false
          })
        })
      );
    });

    it('should skip open PRs (no delta)', async () => {
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([185]);
      vi.mocked(mockTaskQueue.getTasksByStatus!).mockResolvedValue([]);

      vi.mocked(mockGitHubPR.getPRStatus!).mockResolvedValue({
        state: 'OPEN',
        number: 185,
        title: 'Test PR',
        url: 'https://github.com/test/repo/pull/185',
        head: { ref: 'test', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        merged: false,
        mergeable: true,
        checks: []
      });

      await prSyncService.syncAllTrackedPRs();

      // Should NOT call handler for open PRs
      expect(mockPRHandler.handle).not.toHaveBeenCalled();
    });

    it('should handle deleted PRs (404)', async () => {
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([999]);
      vi.mocked(mockTaskQueue.getTasksByStatus!).mockResolvedValue([]);

      const error: any = new Error('Not Found');
      error.status = 404;
      vi.mocked(mockGitHubPR.getPRStatus!).mockRejectedValue(error);

      await prSyncService.syncAllTrackedPRs();

      // Should call handler for deleted PRs
      expect(mockPRHandler.handle).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle GitHub API rate limiting gracefully', async () => {
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([183]);
      vi.mocked(mockTaskQueue.getTasksByStatus!).mockResolvedValue([]);

      const error: any = new Error('rate limit exceeded');
      error.status = 403;
      vi.mocked(mockGitHubPR.getPRStatus!).mockRejectedValue(error);

      await prSyncService.syncAllTrackedPRs();

      // Should complete without throwing
      const stats = prSyncService.getStats();
      expect(stats.syncs_triggered).toBe(1);
    });

    it('should handle missing PR condition state service', async () => {
      // Create new service without PR condition state service
      const serviceWithoutPRCondition = new PRSyncService(mockTaskQueue as TaskQueueService);
      (serviceWithoutPRCondition as any).githubPR = mockGitHubPR;
      serviceWithoutPRCondition.setPullRequestHandler(mockPRHandler as PullRequestHandler);
      // Don't set PR condition state service

      vi.mocked(mockTaskQueue.getTasksByStatus!).mockResolvedValue([]);

      await serviceWithoutPRCondition.syncAllTrackedPRs();

      // Should complete gracefully (only check tasks)
      const stats = serviceWithoutPRCondition.getStats();
      expect(stats.syncs_completed).toBe(1);
    });

    it('should continue processing other PRs if one fails', async () => {
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([183, 184, 185]);
      vi.mocked(mockTaskQueue.getTasksByStatus!).mockResolvedValue([]);

      // First PR fails, second succeeds, third succeeds
      vi.mocked(mockGitHubPR.getPRStatus!)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          state: 'MERGED',
          number: 184,
          title: 'Test',
          url: 'https://github.com/test/repo/pull/184',
          head: { ref: 'test', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          merged: true,
          mergeable: null,
          checks: []
        })
        .mockResolvedValueOnce({
          state: 'MERGED',
          number: 185,
          title: 'Test',
          url: 'https://github.com/test/repo/pull/185',
          head: { ref: 'test', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          merged: true,
          mergeable: null,
          checks: []
        });

      await prSyncService.syncAllTrackedPRs();

      // Should have processed successful PRs
      expect(mockPRHandler.handle).toHaveBeenCalledTimes(2);
    });
  });

  describe('statistics', () => {
    it('should track sync statistics', async () => {
      vi.mocked(mockPRConditionState.getAllTrackedPRNumbers!).mockResolvedValue([183, 184]);
      vi.mocked(mockTaskQueue.getTasksByStatus!).mockResolvedValue([]);

      vi.mocked(mockGitHubPR.getPRStatus!).mockResolvedValue({
        state: 'MERGED',
        number: 183,
        title: 'Test',
        url: 'https://github.com/test/repo/pull/183',
        head: { ref: 'test', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        merged: true,
        mergeable: null,
        checks: []
      });

      await prSyncService.syncAllTrackedPRs();

      const stats = prSyncService.getStats();
      expect(stats.syncs_triggered).toBe(1);
      expect(stats.syncs_completed).toBe(1);
      expect(stats.total_prs_checked).toBe(2);
      expect(stats.total_stale_prs_found).toBe(2);
      expect(stats.github_api_calls).toBe(2);
    });
  });
});
