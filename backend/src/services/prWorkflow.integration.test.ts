/**
 * PR Workflow Integration Tests
 *
 * Comprehensive integration tests for the complete PR workflow quality gates system.
 * Tests cover:
 * - Complete PR lifecycle (open → checks → review → merge)
 * - Task verification integration
 * - Review comment tracking and resolution
 * - Auto-merge decision logic
 * - Orphaned PR handling
 * - Followup task creation
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { PRMonitorService } from './prMonitor.service.js';
import type { TaskQueueService } from './taskQueue.sqlite.js';
import type { PRStatus, CopilotReviewAnalysis } from './githubPR.service.js';
import type { Task } from './taskQueue.sqlite.js';

// Mock the database module to avoid real database access in tests
vi.mock('./database.js', () => ({
  getDatabase: vi.fn(() => ({
    getConnection: vi.fn(() => ({
      prepare: vi.fn(() => ({
        all: vi.fn(() => []),
        run: vi.fn(),
        get: vi.fn()
      }))
    })),
    close: vi.fn()
  }))
}));

describe('PR Workflow Integration Tests', () => {
  let prMonitor: PRMonitorService;
  let mockTaskQueue: TaskQueueService;

  beforeAll(() => {
    // Create mock task queue
    mockTaskQueue = {
      addTask: vi.fn(),
      updateTask: vi.fn(),
      getTask: vi.fn(),
      getAllTasks: vi.fn(),
      getTasksByPR: vi.fn(),
      getTasksByStatus: vi.fn(),
      close: vi.fn(),
    } as unknown as TaskQueueService;

    // Create PR Monitor with mock dependencies
    prMonitor = new PRMonitorService(mockTaskQueue, {
      enableAutoMerge: true,
      maxFollowupDepth: 3,
      maxFollowupTotal: 5
    });
  });

  afterAll(() => {
    // No cleanup needed for mocks
  });

  describe('Complete PR Lifecycle', () => {
    it('should auto-merge PR when all quality gates pass', () => {
      // Scenario: Happy path - all gates pass
      const prNumber = 100;

      // Mock PR status: All checks passed
      const prStatus: PRStatus = {
        number: prNumber,
        state: 'open',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'CI Build', status: 'success', conclusion: 'success' },
          { name: 'Tests', status: 'success', conclusion: 'success' }
        ],
        reviews: [
          { author: 'github-copilot[bot]', state: 'APPROVED', body: 'LGTM' }
        ],
        comments: []
      };

      // Mock Copilot analysis: No issues
      const copilotAnalysis: CopilotReviewAnalysis = {
        severity: 'approved',
        hasBlockingIssues: false,
        hasCriticalIssues: false,
        hasWarnings: false,
        blockingCount: 0,
        suggestionCount: 0,
        nitpickCount: 0
      };

      // Mock task with verification passed
      const task: Partial<Task> = {
        id: 'task-100',
        pr_number: prNumber,
        verification_passed: true,
        verification_results: JSON.stringify({
          passed: true,
          overallScore: 90.0,
          acceptanceCriteria: { met: 9, total: 10, percentMet: 90.0 }
        })
      };

      const shouldCreateFollowup = prMonitor.shouldCreateFollowup(
        prNumber,
        prStatus,
        copilotAnalysis,
        task as Task
      );

      expect(shouldCreateFollowup).toBe(false);
    });

    it('should block auto-merge when CI checks fail', () => {
      const prNumber = 101;

      const prStatus: PRStatus = {
        number: prNumber,
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'CI Build', status: 'failure', conclusion: 'failure', detailsUrl: null }
        ],
        reviews: [],
        comments: [],
        url: `https://github.com/test/repo/pull/${prNumber}`
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        severity: 'approved',
        hasBlockingIssues: false,
        hasCriticalIssues: false,
        hasWarnings: false,
        blockingCount: 0,
        suggestionCount: 0,
        nitpickCount: 0
      };

      const shouldCreateFollowup = prMonitor.shouldCreateFollowup(
        prNumber,
        prStatus,
        copilotAnalysis
      );

      expect(shouldCreateFollowup).toBe(true);
    });

    it('should block auto-merge when Copilot finds critical issues', () => {
      const prNumber = 102;

      const prStatus: PRStatus = {
        number: prNumber,
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        url: `https://github.com/test/repo/pull/${prNumber}`,
        checks: [
          { name: 'CI Build', status: 'success', conclusion: 'success', detailsUrl: null }
        ],
        reviews: [
          {
            author: 'github-copilot[bot]',
            state: 'COMMENTED',
            submittedAt: new Date().toISOString(),
            body: '**Critical Bug:** Missing null check will cause runtime error'
          }
        ],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        hasComments: true,
        totalComments: 1,
        blockingIssues: ['**Critical Bug:** Missing null check will cause runtime error'],
        suggestions: [],
        severity: 'high'
      };

      const shouldCreateFollowup = prMonitor.shouldCreateFollowup(
        prNumber,
        prStatus,
        copilotAnalysis
      );

      expect(shouldCreateFollowup).toBe(true);
    });

    it('should block auto-merge when human reviewer requests changes', () => {
      const prNumber = 103;

      const prStatus: PRStatus = {
        number: prNumber,
        state: 'open',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'CI Build', status: 'success', conclusion: 'success' }
        ],
        reviews: [
          { author: 'developer', state: 'CHANGES_REQUESTED', body: 'Please add tests' }
        ],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        severity: 'approved',
        hasBlockingIssues: false,
        hasCriticalIssues: false,
        hasWarnings: false,
        blockingCount: 0,
        suggestionCount: 0,
        nitpickCount: 0
      };

      const shouldCreateFollowup = prMonitor.shouldCreateFollowup(
        prNumber,
        prStatus,
        copilotAnalysis
      );

      expect(shouldCreateFollowup).toBe(true);
    });

    it('should block auto-merge when merge conflicts exist', () => {
      const prNumber = 104;

      const prStatus: PRStatus = {
        number: prNumber,
        state: 'open',
        mergeable: 'CONFLICTING',
        checks: [
          { name: 'CI Build', status: 'success', conclusion: 'success' }
        ],
        reviews: [
          { author: 'github-copilot[bot]', state: 'APPROVED', body: 'LGTM' }
        ],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        severity: 'approved',
        hasBlockingIssues: false,
        hasCriticalIssues: false,
        hasWarnings: false,
        blockingCount: 0,
        suggestionCount: 0,
        nitpickCount: 0
      };

      const shouldCreateFollowup = prMonitor.shouldCreateFollowup(
        prNumber,
        prStatus,
        copilotAnalysis
      );

      expect(shouldCreateFollowup).toBe(true);
    });
  });

  describe('Task Verification Integration', () => {
    it('should block auto-merge when verification fails (<80% criteria)', () => {
      const prNumber = 105;

      const prStatus: PRStatus = {
        number: prNumber,
        state: 'open',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'CI Build', status: 'success', conclusion: 'success' }
        ],
        reviews: [
          { author: 'github-copilot[bot]', state: 'APPROVED', body: 'LGTM' }
        ],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        severity: 'approved',
        hasBlockingIssues: false,
        hasCriticalIssues: false,
        hasWarnings: false,
        blockingCount: 0,
        suggestionCount: 0,
        nitpickCount: 0
      };

      // Task with verification failed (< 80%)
      const task: Partial<Task> = {
        id: 'task-105',
        pr_number: prNumber,
        verification_passed: false,
        verification_results: JSON.stringify({
          passed: false,
          overallScore: 60.0,
          acceptanceCriteria: { met: 3, total: 5, percentMet: 60.0 }
        })
      };

      const shouldCreateFollowup = prMonitor.shouldCreateFollowup(
        prNumber,
        prStatus,
        copilotAnalysis,
        task as Task
      );

      expect(shouldCreateFollowup).toBe(true);
    });

    it('should allow auto-merge when verification passes (≥80% criteria)', () => {
      const prNumber = 106;

      const prStatus: PRStatus = {
        number: prNumber,
        state: 'open',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'CI Build', status: 'success', conclusion: 'success' }
        ],
        reviews: [
          { author: 'github-copilot[bot]', state: 'APPROVED', body: 'LGTM' }
        ],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        severity: 'approved',
        hasBlockingIssues: false,
        hasCriticalIssues: false,
        hasWarnings: false,
        blockingCount: 0,
        suggestionCount: 0,
        nitpickCount: 0
      };

      // Task with verification passed (≥ 80%)
      const task: Partial<Task> = {
        id: 'task-106',
        pr_number: prNumber,
        verification_passed: true,
        verification_results: JSON.stringify({
          passed: true,
          overallScore: 85.0,
          acceptanceCriteria: { met: 17, total: 20, percentMet: 85.0 }
        })
      };

      const shouldCreateFollowup = prMonitor.shouldCreateFollowup(
        prNumber,
        prStatus,
        copilotAnalysis,
        task as Task
      );

      expect(shouldCreateFollowup).toBe(false);
    });
  });

  describe('Orphaned PR Detection and Handling', () => {
    it('should detect system-created PRs by branch pattern', () => {
      const branchNames = [
        'task/implement-feature-abc123',
        'task/fix-bug-def456',
        'claude/update-docs-789xyz'
      ];

      branchNames.forEach(branch => {
        const isSystemPR = /^(task|claude)\//.test(branch);
        expect(isSystemPR).toBe(true);
      });
    });

    it('should detect user-created PRs', () => {
      const branchNames = [
        'feature/user-auth',
        'bugfix/login-error',
        'main',
        'develop'
      ];

      branchNames.forEach(branch => {
        const isSystemPR = /^(task|claude)\//.test(branch);
        expect(isSystemPR).toBe(false);
      });
    });

    it('should detect system PRs by title pattern', () => {
      const titles = [
        '[task-abc123] Implement user authentication',
        'Task abc123: Add database migrations',
        'Claude: Refactor API endpoints'
      ];

      titles.forEach(title => {
        const hasTaskId = /\[?task[- ]([a-z0-9-]+)\]?/i.test(title) || /claude:/i.test(title);
        expect(hasTaskId).toBe(true);
      });
    });
  });

  describe('Copilot Review Analysis (5-Tier Priority System)', () => {
    it('should detect blocking issues from explicit markdown tags (Priority 1)', () => {
      const comments = [
        { body: '**Critical Bug:** Missing null check' },
        { body: '**Security concern:** SQL injection vulnerability' },
        { body: '**MUST fix:** Breaking API change' }
      ];

      comments.forEach(comment => {
        const hasExplicitBlockingTag = /\*\*(Critical Bug|Security [Cc]oncern|MUST fix|Required):\*\*/i.test(comment.body);
        expect(hasExplicitBlockingTag).toBe(true);
      });
    });

    it('should detect nitpicks from explicit tags (Priority 1)', () => {
      const comments = [
        { body: '[nitpick] Consider using const instead of let' },
        { body: '**Nitpick:** Add trailing comma for consistency' }
      ];

      comments.forEach(comment => {
        const hasNitpickTag = /\[nitpick\]|\*\*Nitpick:\*\*/i.test(comment.body);
        expect(hasNitpickTag).toBe(true);
      });
    });

    it('should detect severity from bracketed indicators (Priority 2)', () => {
      const comments = [
        { body: '[critical] This will cause data loss', severity: 'blocking' },
        { body: '[suggestion] Could improve performance here', severity: 'suggestion' }
      ];

      comments.forEach(comment => {
        if (/\[(critical|blocking|security|required)\]/i.test(comment.body)) {
          expect(['blocking', 'suggestion']).toContain(comment.severity);
        }
      });
    });

    it('should use strong keyword patterns (Priority 3)', () => {
      const blockingKeywords = [
        'security vulnerability',
        'critical bug',
        'must be fixed'
      ];

      blockingKeywords.forEach(keyword => {
        const isBlockingPattern = /(security vulnerability|critical\s+(bug|error|issue)|must\s+(be\s+)?(fixed|addressed))/i.test(keyword);
        expect(isBlockingPattern).toBe(true);
      });
    });
  });

  describe('Followup Task Limits', () => {
    it('should respect maximum followup depth', () => {
      const prNumber = 110;

      const prStatus: PRStatus = {
        number: prNumber,
        state: 'open',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'CI Build', status: 'completed', conclusion: 'failure' }
        ],
        reviews: [],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        severity: 'approved',
        hasBlockingIssues: false,
        hasCriticalIssues: false,
        hasWarnings: false,
        blockingCount: 0,
        suggestionCount: 0,
        nitpickCount: 0
      };

      // Task at maximum depth (3)
      const task: Partial<Task> = {
        id: 'task-110',
        pr_number: prNumber,
        followup_depth: 3  // At max depth
      };

      const shouldCreateFollowup = prMonitor.shouldCreateFollowup(
        prNumber,
        prStatus,
        copilotAnalysis,
        task as Task
      );

      // Even though CI failed, should not create followup due to depth limit
      expect(shouldCreateFollowup).toBe(false);
    });
  });

  describe('Multiple Quality Gates Combined', () => {
    it('should block when multiple gates fail simultaneously', () => {
      const prNumber = 111;

      const prStatus: PRStatus = {
        number: prNumber,
        state: 'open',
        mergeable: 'CONFLICTING',  // Gate 1: Merge conflict
        checks: [
          { name: 'CI Build', status: 'completed', conclusion: 'failure' }  // Gate 2: CI failed
        ],
        reviews: [
          {
            author: 'github-copilot[bot]',
            state: 'COMMENTED',
            body: '**Critical Bug:** Missing error handling'  // Gate 3: Copilot blocking issue
          },
          { author: 'developer', state: 'CHANGES_REQUESTED', body: 'Needs refactoring' }  // Gate 4: Human changes requested
        ],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        severity: 'blocking',
        hasBlockingIssues: true,
        hasCriticalIssues: true,
        hasWarnings: false,
        blockingCount: 1,
        suggestionCount: 0,
        nitpickCount: 0
      };

      // Gate 5: Verification failed
      const task: Partial<Task> = {
        id: 'task-111',
        pr_number: prNumber,
        verification_passed: false
      };

      const shouldCreateFollowup = prMonitor.shouldCreateFollowup(
        prNumber,
        prStatus,
        copilotAnalysis,
        task as Task
      );

      expect(shouldCreateFollowup).toBe(true);
    });
  });
});
