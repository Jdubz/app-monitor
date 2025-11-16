// @ts-nocheck
/**
 * Tests for PR Workflow Orchestrator Service - detectStaleBranch method
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';
import { exec } from 'child_process';
import type { TaskQueueService } from './taskQueue.sqlite.js';

// Mock child_process exec
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock PRMonitorService
vi.mock('./prMonitor.service.js', () => ({
  PRMonitorService: vi.fn().mockImplementation(() => ({
    getStatus: vi.fn().mockReturnValue({})
  }))
}));

// Mock PRArtifactRecoveryService
vi.mock('./prArtifactRecovery.service.js', () => ({
  PRArtifactRecoveryService: vi.fn().mockImplementation(() => ({
    recoverOrphanedPRs: vi.fn().mockResolvedValue({
      prInfoRecovered: 0,
      tasksUpdated: 0,
      artifactsProcessed: 0
    })
  }))
}));

// Mock getGitHubPRService
vi.mock('./githubPR.service.js', () => ({
  getGitHubPRService: vi.fn().mockReturnValue({})
}));

describe('PRWorkflowOrchestrator - detectStaleBranch', () => {
  let orchestrator: PRWorkflowOrchestrator;
  let mockTaskQueue: TaskQueueService;

  beforeEach(() => {
    // Create mock task queue
    mockTaskQueue = {
      getTasksWithUnmergedPRs: vi.fn().mockResolvedValue([]),
      updateTask: vi.fn().mockResolvedValue(undefined)
    } as unknown as TaskQueueService;

    orchestrator = new PRWorkflowOrchestrator(mockTaskQueue);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectStaleBranch', () => {
    it('should detect branch is up to date (not stale)', async () => {
      // Mock git commands
      const mockExec = vi.mocked(exec);

      // Mock merge-base command
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: 'abc123def456\n', stderr: '' } as any);
        }
        return {} as any;
      });

      // Mock rev-list for commits behind (0 commits)
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '0\n', stderr: '' } as any);
        }
        return {} as any;
      });

      // Mock rev-list for commits ahead (5 commits)
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '5\n', stderr: '' } as any);
        }
        return {} as any;
      });

      const result = await orchestrator.detectStaleBranch('feature-branch', 'main', '/repo');

      expect(result).toEqual({
        isStale: false,
        commitsBehind: 0,
        commitsAhead: 5,
        mergeBase: 'abc123def456'
      });
    });

    it('should detect branch is stale (behind base)', async () => {
      const mockExec = vi.mocked(exec);

      // Mock merge-base command
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: 'xyz789abc123\n', stderr: '' } as any);
        }
        return {} as any;
      });

      // Mock rev-list for commits behind (3 commits)
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '3\n', stderr: '' } as any);
        }
        return {} as any;
      });

      // Mock rev-list for commits ahead (2 commits)
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '2\n', stderr: '' } as any);
        }
        return {} as any;
      });

      const result = await orchestrator.detectStaleBranch('old-feature', 'main', '/repo');

      expect(result).toEqual({
        isStale: true,
        commitsBehind: 3,
        commitsAhead: 2,
        mergeBase: 'xyz789abc123'
      });
    });

    it('should detect branch is way behind (many commits)', async () => {
      const mockExec = vi.mocked(exec);

      // Mock merge-base command
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: 'oldcommit123\n', stderr: '' } as any);
        }
        return {} as any;
      });

      // Mock rev-list for commits behind (50 commits)
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '50\n', stderr: '' } as any);
        }
        return {} as any;
      });

      // Mock rev-list for commits ahead (1 commit)
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '1\n', stderr: '' } as any);
        }
        return {} as any;
      });

      const result = await orchestrator.detectStaleBranch('very-old-branch', 'main');

      expect(result).toEqual({
        isStale: true,
        commitsBehind: 50,
        commitsAhead: 1,
        mergeBase: 'oldcommit123'
      });
    });

    it('should use default parameters when not provided', async () => {
      const mockExec = vi.mocked(exec);

      // Mock successful execution
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: 'mergebase123\n', stderr: '' } as any);
        }
        return {} as any;
      });

      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '0\n', stderr: '' } as any);
        }
        return {} as any;
      });

      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '0\n', stderr: '' } as any);
        }
        return {} as any;
      });

      const result = await orchestrator.detectStaleBranch('test-branch');

      expect(result.isStale).toBe(false);
      expect(result.commitsBehind).toBe(0);
      expect(result.commitsAhead).toBe(0);

      // Verify default parameters were used
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('git -C "." merge-base "main" "test-branch"'),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle git command errors gracefully', async () => {
      const mockExec = vi.mocked(exec);

      // Mock git command failure
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(new Error('fatal: Not a valid object name') as any, { stdout: '', stderr: 'fatal: Not a valid object name' } as any);
        }
        return {} as any;
      });

      await expect(orchestrator.detectStaleBranch('non-existent-branch'))
        .rejects
        .toThrow('fatal: Not a valid object name');
    });

    it('should use custom repo path when provided', async () => {
      const mockExec = vi.mocked(exec);
      const customPath = '/custom/repo/path';

      // Mock successful execution
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: 'commit123\n', stderr: '' } as any);
        }
        return {} as any;
      });

      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '1\n', stderr: '' } as any);
        }
        return {} as any;
      });

      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '1\n', stderr: '' } as any);
        }
        return {} as any;
      });

      await orchestrator.detectStaleBranch('branch', 'main', customPath);

      // Verify custom path was used
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining(`git -C "${customPath}"`),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle branches that are equal (same commit)', async () => {
      const mockExec = vi.mocked(exec);

      // Mock merge-base command
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: 'samecommit\n', stderr: '' } as any);
        }
        return {} as any;
      });

      // Mock rev-list for commits behind (0 commits - branches at same point)
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '0\n', stderr: '' } as any);
        }
        return {} as any;
      });

      // Mock rev-list for commits ahead (0 commits - branches at same point)
      mockExec.mockImplementationOnce((cmd, options, callback) => {
        if (callback) {
          callback(null, { stdout: '0\n', stderr: '' } as any);
        }
        return {} as any;
      });

      const result = await orchestrator.detectStaleBranch('same-branch', 'main');

      expect(result).toEqual({
        isStale: false,
        commitsBehind: 0,
        commitsAhead: 0,
        mergeBase: 'samecommit'
      });
    });
  });
});
