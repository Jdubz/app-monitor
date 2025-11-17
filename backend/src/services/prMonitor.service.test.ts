// @ts-nocheck
/**
 * Tests for PR Monitor Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PRMonitorService } from './prMonitor.service.js';
import { TaskQueueService } from './taskQueue.sqlite.js';
import type { PRStatus, CopilotReviewAnalysis } from './githubPR.service.js';

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('./githubPR.service.js', () => ({
  getGitHubPRService: vi.fn(() => ({
    getPR: vi.fn(),
    mergePR: vi.fn(),
    updateBranch: vi.fn()
  }))
}));

vi.mock('./reviewCommentTracker.service.js', () => ({
  ReviewCommentTracker: vi.fn(() => ({
    getResolutionSummary: vi.fn(() => ({
      totalComments: 0,
      resolved: 0,
      unresolvedBlocking: 0,
      unresolvedNonBlocking: 0
    }))
  }))
}));

vi.mock('./database.js', () => ({
  getDatabase: vi.fn(() => ({}))
}));

describe('PRMonitorService', () => {
  let service: PRMonitorService;
  let mockTaskQueue: Partial<TaskQueueService>;

  beforeEach(() => {
    mockTaskQueue = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      updateTask: vi.fn(),
      updatePRStatus: vi.fn(),
      findByPRNumber: vi.fn(() => Promise.resolve([])),
      hasFollowupFingerprint: vi.fn(() => false),
      addFollowupFingerprint: vi.fn(),
      clearFollowupFingerprints: vi.fn()
    };

    service = new PRMonitorService(mockTaskQueue as TaskQueueService);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('categorizeFailure', () => {
    // Access private method through type assertion for testing
    const callCategorizeFailure = (issues: string[]) => {
      return (service as any).categorizeFailure(issues);
    };

    describe('CI/Build failures', () => {
      it('should categorize build failures with high confidence', () => {
        const issues = ['Failed CI checks: build failed', 'npm build failed'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('ci_failure');
        expect(result.confidence).toBe('high');
      });

      it('should detect compilation errors', () => {
        const issues = ['Compilation error in src/main.ts'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('ci_failure');
        expect(result.confidence).toBe('high');
      });

      it('should detect webpack build failures', () => {
        const issues = ['Failed CI checks: webpack error - module not found'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('ci_failure');
        expect(result.confidence).toBe('high');
      });

      it('should detect TypeScript compiler errors', () => {
        const issues = ['Failed CI checks: tsc error - type mismatch'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('ci_failure');
        expect(result.confidence).toBe('high');
      });
    });

    describe('Test failures', () => {
      it('should categorize test failures with high confidence', () => {
        const issues = ['Failed CI checks: test failed'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('test_failure');
        expect(result.confidence).toBe('high');
      });

      it('should detect Jest test failures', () => {
        const issues = ['Failed CI checks: jest failed - 5 tests failing'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('test_failure');
        expect(result.confidence).toBe('high');
      });

      it('should detect unit test failures', () => {
        const issues = ['Unit test failed in UserService.test.ts'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('test_failure');
        expect(result.confidence).toBe('high');
      });

      it('should detect integration test failures', () => {
        const issues = ['Integration test failed: API endpoint not responding'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('test_failure');
        expect(result.confidence).toBe('high');
      });

      it('should detect E2E test failures', () => {
        const issues = ['E2E fail: cypress test timeout'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('test_failure');
        expect(result.confidence).toBe('high');
      });
    });

    describe('Linting/Type checking failures', () => {
      it('should categorize lint failures with high confidence', () => {
        const issues = ['Failed CI checks: lint failed'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('lint_failure');
        expect(result.confidence).toBe('high');
      });

      it('should detect ESLint errors', () => {
        const issues = ['Failed CI checks: eslint error - unused variable'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('lint_failure');
        expect(result.confidence).toBe('high');
      });

      it('should detect TypeScript type errors', () => {
        const issues = ['Type check failed: Property does not exist'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('lint_failure');
        expect(result.confidence).toBe('high');
      });

      it('should detect formatting errors', () => {
        const issues = ['Formatting error: prettier check failed'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('lint_failure');
        expect(result.confidence).toBe('high');
      });

      it('should detect syntax errors', () => {
        const issues = ['Syntax error: unexpected token'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('lint_failure');
        expect(result.confidence).toBe('high');
      });
    });

    describe('Merge conflicts', () => {
      it('should categorize merge conflicts with high confidence', () => {
        const issues = ['Merge conflict in src/main.ts'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('merge_conflict');
        expect(result.confidence).toBe('high');
      });

      it('should detect conflicting status', () => {
        const issues = ['Branch status: CONFLICTING'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('merge_conflict');
        expect(result.confidence).toBe('high');
      });

      it('should detect cannot merge messages', () => {
        const issues = ['Cannot merge: resolve conflicts first'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('merge_conflict');
        expect(result.confidence).toBe('high');
      });
    });

    describe('Review feedback', () => {
      it('should categorize Copilot feedback with medium confidence', () => {
        const issues = ['Copilot found 3 blocking issue(s)'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('review_feedback');
        expect(result.confidence).toBe('medium');
      });

      it('should detect blocking issues', () => {
        const issues = ['Security: blocking issue detected'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('review_feedback');
        expect(result.confidence).toBe('medium');
      });

      it('should detect human change requests', () => {
        const issues = ['Human reviewer(s) requested changes: john-doe'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('review_feedback');
        expect(result.confidence).toBe('medium');
      });

      it('should detect code review feedback', () => {
        const issues = ['Code review: needs improvement'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('review_feedback');
        expect(result.confidence).toBe('medium');
      });
    });

    describe('Verification failures', () => {
      it('should categorize verification failures with medium confidence', () => {
        const issues = ['Task verification failed'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('verification_failure');
        expect(result.confidence).toBe('medium');
      });

      it('should detect acceptance criteria not met', () => {
        const issues = ['Acceptance criteria not met: < 80% complete'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('verification_failure');
        expect(result.confidence).toBe('medium');
      });

      it('should detect verification_passed false', () => {
        const issues = ['Task verification_passed: false'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('verification_failure');
        expect(result.confidence).toBe('medium');
      });
    });

    describe('Unknown failures', () => {
      it('should return unknown for unrecognized patterns', () => {
        const issues = ['Something went wrong but not sure what'];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('unknown');
        expect(result.confidence).toBe('low');
      });

      it('should handle empty issues array', () => {
        const issues: string[] = [];
        const result = callCategorizeFailure(issues);

        expect(result.category).toBe('unknown');
        expect(result.confidence).toBe('low');
      });
    });

    describe('Priority ordering', () => {
      it('should prioritize CI failures over review feedback', () => {
        const issues = [
          'Build failed',
          'Copilot found issues'
        ];
        const result = callCategorizeFailure(issues);

        // CI failures are checked first in the categorization logic
        expect(result.category).toBe('ci_failure');
      });

      it('should prioritize test failures over linting', () => {
        const issues = [
          'Test failed',
          'Lint error found'
        ];
        const result = callCategorizeFailure(issues);

        // Test failures are checked before lint failures
        expect(result.category).toBe('test_failure');
      });

      it('should prioritize lint failures over merge conflicts', () => {
        const issues = [
          'Lint failed',
          'Merge conflict'
        ];
        const result = callCategorizeFailure(issues);

        // Lint failures are checked before merge conflicts
        expect(result.category).toBe('lint_failure');
      });
    });

    describe('Case insensitivity', () => {
      it('should detect failures regardless of case', () => {
        const testCases = [
          { issues: ['BUILD FAILED'], expected: 'ci_failure' },
          { issues: ['Test Failed'], expected: 'test_failure' },
          { issues: ['LINT FAILED'], expected: 'lint_failure' },
          { issues: ['Merge Conflict'], expected: 'merge_conflict' }
        ];

        testCases.forEach(({ issues, expected }) => {
          const result = callCategorizeFailure(issues);
          expect(result.category).toBe(expected);
        });
      });
    });
  });

  describe('createFollowupTask', () => {
    const mockPRStatus: PRStatus = {
      number: 123,
      state: 'open',
      mergeable: 'MERGEABLE',
      checks: [],
      reviews: [],
      comments: []
    };

    const mockCopilotAnalysis: CopilotReviewAnalysis = {
      hasComments: false,
      totalComments: 0,
      blockingIssues: [],
      suggestions: [],
      severity: 'none'
    };

    beforeEach(() => {
      vi.mocked(mockTaskQueue.getTask!).mockReturnValue({
        id: 'task-123',
        title: 'Original task',
        type: 'implementation',
        status: 'running',
        assigned_agent: 'backend-specialist',
        followup_tasks: []
      } as any);

      // Mock createTask to return a followup task with an ID
      vi.mocked(mockTaskQueue.createTask!).mockReturnValue({
        id: 'followup-task-456',
        title: 'Fix PR #123 issues',
        type: 'fix',
        status: 'pending',
        assigned_agent: 'backend-specialist',
        followup_for_pr: 123
      } as any);
    });

    it('should include failure category in task description', async () => {
      const prStatus = {
        ...mockPRStatus,
        checks: [{ name: 'test', status: 'failure' as const, conclusion: 'failure' as const }]
      };

      await service.createFollowupTask(123, 'task-123', 'feature-branch', prStatus, mockCopilotAnalysis);

      expect(mockTaskQueue.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('**Failure Category:**')
        })
      );
    });

    it('should log failure category and confidence', async () => {
      const prStatus = {
        ...mockPRStatus,
        checks: [{ name: 'build', status: 'failure' as const, conclusion: 'failure' as const }]
      };

      await service.createFollowupTask(123, 'task-123', 'feature-branch', prStatus, mockCopilotAnalysis);

      const logger = await import('../utils/logger.js');
      expect(logger.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            failureCategory: expect.any(String),
            failureConfidence: expect.any(String)
          })
        })
      );
    });
  });
});
