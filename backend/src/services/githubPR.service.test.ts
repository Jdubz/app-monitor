/**
 * Tests for GitHub PR Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubPRService } from './githubPR.service.js';
import type { PRComment, PRStatus, CopilotReviewAnalysis } from './githubPR.service.js';
import { exec } from 'child_process';

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

describe('GitHubPRService', () => {
  let service: GitHubPRService;

  beforeEach(() => {
    service = new GitHubPRService('test-owner', 'test-repo');
    vi.mocked(exec);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('analyzeCopilotReview', () => {
    it('should return no comments when no Copilot comments exist', () => {
      const comments: PRComment[] = [
        {
          author: 'human-reviewer',
          body: 'Looks good to me!',
          createdAt: '2025-01-01T00:00:00Z',
          path: null,
          line: null
        }
      ];

      const result = service.analyzeCopilotReview(comments);

      expect(result).toEqual({
        hasComments: false,
        totalComments: 0,
        blockingIssues: [],
        suggestions: [],
        severity: 'none'
      });
    });

    it('should identify Copilot comments by author', () => {
      const comments: PRComment[] = [
        {
          author: 'github-copilot[bot]',
          body: 'Consider using const instead of let',
          createdAt: '2025-01-01T00:00:00Z',
          path: 'src/file.ts',
          line: 10
        }
      ];

      const result = service.analyzeCopilotReview(comments);

      expect(result.hasComments).toBe(true);
      expect(result.totalComments).toBe(1);
    });

    it('should identify blocking issues from keywords', () => {
      const comments: PRComment[] = [
        {
          author: 'github-copilot[bot]',
          body: 'Security vulnerability detected: SQL injection risk',
          createdAt: '2025-01-01T00:00:00Z',
          path: 'src/db.ts',
          line: 42
        },
        {
          author: 'github-copilot[bot]',
          body: 'Critical error: this will break existing functionality',
          createdAt: '2025-01-01T00:00:00Z',
          path: 'src/api.ts',
          line: 100
        }
      ];

      const result = service.analyzeCopilotReview(comments);

      expect(result.blockingIssues.length).toBe(2);
      expect(result.severity).toBe('medium'); // 2 blocking issues = medium (3+ would be high)
      expect(result.blockingIssues[0]).toContain('Security vulnerability');
      expect(result.blockingIssues[1]).toContain('Critical error');
    });

    it('should identify suggestions from keywords', () => {
      const comments: PRComment[] = [
        {
          author: 'github-copilot[bot]',
          body: 'Consider using async/await for better readability',
          createdAt: '2025-01-01T00:00:00Z',
          path: 'src/service.ts',
          line: 20
        },
        {
          author: 'github-copilot[bot]',
          body: 'Suggest adding type annotations here',
          createdAt: '2025-01-01T00:00:00Z',
          path: 'src/util.ts',
          line: 5
        }
      ];

      const result = service.analyzeCopilotReview(comments);

      expect(result.suggestions.length).toBe(2);
      expect(result.blockingIssues.length).toBe(0);
      expect(result.severity).toBe('low');
    });

    it('should detect acceptance criteria violations as blocking', () => {
      const comments: PRComment[] = [
        {
          author: 'github-copilot[bot]',
          body: 'Acceptance criteria not satisfied: missing error handling',
          createdAt: '2025-01-01T00:00:00Z',
          path: 'src/handler.ts',
          line: 15
        },
        {
          author: 'github-copilot[bot]',
          body: 'Requirement not met: tests are incomplete',
          createdAt: '2025-01-01T00:00:00Z',
          path: 'src/test.ts',
          line: 1
        }
      ];

      const result = service.analyzeCopilotReview(comments);

      expect(result.blockingIssues.length).toBe(2);
      expect(result.severity).toBe('medium');
      expect(result.blockingIssues[0]).toContain('Acceptance criteria');
      expect(result.blockingIssues[1]).toContain('Requirement not');
    });

    it('should assign severity based on blocking issues count', () => {
      // 0 blocking issues = low severity
      let result = service.analyzeCopilotReview([
        {
          author: 'github-copilot[bot]',
          body: 'Consider refactoring this',
          createdAt: '2025-01-01T00:00:00Z',
          path: null,
          line: null
        }
      ]);
      expect(result.severity).toBe('low');

      // 1-2 blocking issues = medium severity
      result = service.analyzeCopilotReview([
        {
          author: 'github-copilot[bot]',
          body: 'Security issue found here',
          createdAt: '2025-01-01T00:00:00Z',
          path: null,
          line: null
        }
      ]);
      expect(result.severity).toBe('medium');

      // 3+ blocking issues = high severity
      result = service.analyzeCopilotReview([
        {
          author: 'github-copilot[bot]',
          body: 'Critical bug detected',
          createdAt: '2025-01-01T00:00:00Z',
          path: null,
          line: null
        },
        {
          author: 'github-copilot[bot]',
          body: 'Security vulnerability found',
          createdAt: '2025-01-01T00:00:00Z',
          path: null,
          line: null
        },
        {
          author: 'github-copilot[bot]',
          body: 'Error in implementation',
          createdAt: '2025-01-01T00:00:00Z',
          path: null,
          line: null
        }
      ]);
      expect(result.severity).toBe('high');
    });

    it('should handle mixed blocking and suggestion comments', () => {
      const comments: PRComment[] = [
        {
          author: 'github-copilot[bot]',
          body: 'Security vulnerability: XSS risk',
          createdAt: '2025-01-01T00:00:00Z',
          path: 'src/view.ts',
          line: 10
        },
        {
          author: 'github-copilot[bot]',
          body: 'Consider using a constant for this magic number',
          createdAt: '2025-01-01T00:00:00Z',
          path: 'src/config.ts',
          line: 5
        }
      ];

      const result = service.analyzeCopilotReview(comments);

      expect(result.blockingIssues.length).toBe(1);
      expect(result.suggestions.length).toBe(1);
      expect(result.severity).toBe('medium');
    });
  });

  describe('canAutoMerge', () => {
    let baseStatus: PRStatus;
    let baseCopilotAnalysis: CopilotReviewAnalysis;

    beforeEach(() => {
      baseStatus = {
        number: 42,
        url: 'https://github.com/test-owner/test-repo/pull/42',
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'CI', status: 'success', conclusion: 'success', detailsUrl: null }
        ],
        reviews: [],
        comments: []
      };

      baseCopilotAnalysis = {
        hasComments: false,
        totalComments: 0,
        blockingIssues: [],
        suggestions: [],
        severity: 'none'
      };
    });

    it('should allow merge when all conditions are met', () => {
      const result = service.canAutoMerge(baseStatus, baseCopilotAnalysis);

      expect(result.canMerge).toBe(true);
      expect(result.reason).toBe('All checks passed, no blocking issues');
    });

    it('should block merge when PR is not open', () => {
      baseStatus.state = 'CLOSED';

      const result = service.canAutoMerge(baseStatus, baseCopilotAnalysis);

      expect(result.canMerge).toBe(false);
      expect(result.reason).toBe('PR is not open');
    });

    it('should block merge when PR has conflicts', () => {
      baseStatus.mergeable = 'CONFLICTING';

      const result = service.canAutoMerge(baseStatus, baseCopilotAnalysis);

      expect(result.canMerge).toBe(false);
      expect(result.reason).toBe('PR has merge conflicts');
    });

    it('should block merge when CI checks fail', () => {
      baseStatus.checks = [
        { name: 'CI', status: 'success', conclusion: 'success', detailsUrl: null },
        { name: 'Lint', status: 'failure', conclusion: 'failure', detailsUrl: null }
      ];

      const result = service.canAutoMerge(baseStatus, baseCopilotAnalysis);

      expect(result.canMerge).toBe(false);
      expect(result.reason).toContain('CI checks failed');
      expect(result.reason).toContain('Lint');
    });

    it('should block merge when CI checks are pending', () => {
      baseStatus.checks = [
        { name: 'CI', status: 'pending', conclusion: null, detailsUrl: null }
      ];

      const result = service.canAutoMerge(baseStatus, baseCopilotAnalysis);

      expect(result.canMerge).toBe(false);
      expect(result.reason).toContain('CI checks still pending');
      expect(result.reason).toContain('CI');
    });

    it('should block merge when Copilot found blocking issues', () => {
      baseCopilotAnalysis.severity = 'high';
      baseCopilotAnalysis.blockingIssues = ['Security issue', 'Bug detected'];

      const result = service.canAutoMerge(baseStatus, baseCopilotAnalysis);

      expect(result.canMerge).toBe(false);
      expect(result.reason).toContain('Copilot found 2 blocking issue(s)');
    });

    it('should block merge when human reviewer requests changes', () => {
      baseStatus.reviews = [
        {
          author: 'human-reviewer',
          state: 'CHANGES_REQUESTED',
          submittedAt: '2025-01-01T00:00:00Z',
          body: 'Please fix the bug'
        }
      ];

      const result = service.canAutoMerge(baseStatus, baseCopilotAnalysis);

      expect(result.canMerge).toBe(false);
      expect(result.reason).toContain('Human reviewer(s) requested changes');
      expect(result.reason).toContain('human-reviewer');
    });

    it('should ignore Copilot change requests in reviews', () => {
      baseStatus.reviews = [
        {
          author: 'github-copilot[bot]',
          state: 'CHANGES_REQUESTED',
          submittedAt: '2025-01-01T00:00:00Z',
          body: 'Some suggestions'
        }
      ];

      const result = service.canAutoMerge(baseStatus, baseCopilotAnalysis);

      expect(result.canMerge).toBe(true);
      expect(result.reason).toBe('All checks passed, no blocking issues');
    });

    it('should block merge with multiple failing conditions', () => {
      baseStatus.checks = [
        { name: 'Test', status: 'failure', conclusion: 'failure', detailsUrl: null }
      ];
      baseCopilotAnalysis.severity = 'medium';
      baseCopilotAnalysis.blockingIssues = ['Issue 1'];

      // Should report first blocking condition (CI checks)
      const result = service.canAutoMerge(baseStatus, baseCopilotAnalysis);

      expect(result.canMerge).toBe(false);
      expect(result.reason).toContain('CI checks failed');
    });
  });

  describe('normalizeCheckStatus', () => {
    it('should normalize success statuses', () => {
      // Use type assertion to access private method for testing
      const normalizeCheckStatus = (service as any).normalizeCheckStatus.bind(service);

      expect(normalizeCheckStatus('success')).toBe('success');
      expect(normalizeCheckStatus('SUCCESS')).toBe('success');
      expect(normalizeCheckStatus('completed')).toBe('success');
    });

    it('should normalize failure statuses', () => {
      const normalizeCheckStatus = (service as any).normalizeCheckStatus.bind(service);

      expect(normalizeCheckStatus('failure')).toBe('failure');
      expect(normalizeCheckStatus('FAILURE')).toBe('failure');
      expect(normalizeCheckStatus('failed')).toBe('failure');
    });

    it('should normalize error statuses', () => {
      const normalizeCheckStatus = (service as any).normalizeCheckStatus.bind(service);

      expect(normalizeCheckStatus('error')).toBe('error');
      expect(normalizeCheckStatus('ERROR')).toBe('error');
    });

    it('should default to pending for unknown statuses', () => {
      const normalizeCheckStatus = (service as any).normalizeCheckStatus.bind(service);

      expect(normalizeCheckStatus('queued')).toBe('pending');
      expect(normalizeCheckStatus('in_progress')).toBe('pending');
      expect(normalizeCheckStatus('unknown')).toBe('pending');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle PR ready to merge', () => {
      const prStatus: PRStatus = {
        number: 100,
        url: 'https://github.com/test/repo/pull/100',
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'CI', status: 'success', conclusion: 'success', detailsUrl: null },
          { name: 'Lint', status: 'success', conclusion: 'success', detailsUrl: null }
        ],
        reviews: [
          {
            author: 'reviewer1',
            state: 'APPROVED',
            submittedAt: '2025-01-01T00:00:00Z',
            body: 'LGTM'
          }
        ],
        comments: [
          {
            author: 'github-copilot[bot]',
            body: 'Consider adding JSDoc comments',
            createdAt: '2025-01-01T00:00:00Z',
            path: null,
            line: null
          }
        ]
      };

      const copilotAnalysis = service.analyzeCopilotReview(prStatus.comments);
      const mergeDecision = service.canAutoMerge(prStatus, copilotAnalysis);

      expect(copilotAnalysis.severity).toBe('low');
      expect(mergeDecision.canMerge).toBe(true);
    });

    it('should handle PR with blocking Copilot issues', () => {
      const prStatus: PRStatus = {
        number: 101,
        url: 'https://github.com/test/repo/pull/101',
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'CI', status: 'success', conclusion: 'success', detailsUrl: null }
        ],
        reviews: [],
        comments: [
          {
            author: 'github-copilot[bot]',
            body: 'Security vulnerability: potential XSS attack vector',
            createdAt: '2025-01-01T00:00:00Z',
            path: 'src/render.ts',
            line: 42
          },
          {
            author: 'github-copilot[bot]',
            body: 'Critical bug: this will cause null pointer exception',
            createdAt: '2025-01-01T00:00:00Z',
            path: 'src/handler.ts',
            line: 100
          }
        ]
      };

      const copilotAnalysis = service.analyzeCopilotReview(prStatus.comments);
      const mergeDecision = service.canAutoMerge(prStatus, copilotAnalysis);

      expect(copilotAnalysis.severity).toBe('medium');
      expect(copilotAnalysis.blockingIssues.length).toBe(2);
      expect(mergeDecision.canMerge).toBe(false);
      expect(mergeDecision.reason).toContain('Copilot found 2 blocking issue(s)');
    });

    it('should handle PR with failed CI and Copilot issues', () => {
      const prStatus: PRStatus = {
        number: 102,
        url: 'https://github.com/test/repo/pull/102',
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'Tests', status: 'failure', conclusion: 'failure', detailsUrl: null }
        ],
        reviews: [],
        comments: [
          {
            author: 'github-copilot[bot]',
            body: 'Acceptance criteria not met: missing input validation',
            createdAt: '2025-01-01T00:00:00Z',
            path: null,
            line: null
          }
        ]
      };

      const copilotAnalysis = service.analyzeCopilotReview(prStatus.comments);
      const mergeDecision = service.canAutoMerge(prStatus, copilotAnalysis);

      expect(copilotAnalysis.severity).toBe('medium');
      expect(mergeDecision.canMerge).toBe(false);
      // Should report CI failure first
      expect(mergeDecision.reason).toContain('CI checks failed');
    });
  });
});
