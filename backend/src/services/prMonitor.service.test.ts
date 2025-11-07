/**
 * Tests for PR Monitor Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PRMonitorService } from './prMonitor.service.js';
import type { Task } from './taskQueue.sqlite.js';
import type { PRStatus, CopilotReviewAnalysis } from './githubPR.service.js';

// Mock TaskQueueService
const mockTaskQueue = {
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  getAllTasks: vi.fn(),
  getPendingTasks: vi.fn()
};

// Mock GitHubPRService
const mockGitHubPR = {
  getPRStatus: vi.fn(),
  analyzeCopilotReview: vi.fn(),
  canAutoMerge: vi.fn(),
  mergePR: vi.fn(),
  addComment: vi.fn()
};

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock GitHubPRService module
vi.mock('./githubPR.service.js', () => ({
  getGitHubPRService: () => mockGitHubPR
}));

describe('PRMonitorService', () => {
  let service: PRMonitorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PRMonitorService(mockTaskQueue as any, {
      pollIntervalMs: 100, // Short interval for testing
      maxPollAttempts: 5,
      enableAutoMerge: true
    });
  });

  afterEach(() => {
    service.stopPolling();
  });

  describe('registerPR', () => {
    it('should register a PR for monitoring', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
        description: 'Test description',
        type: 'feature',
        status: 'completed',
        priority: 5,
        created_at: Date.now(),
        pr_number: 42,
        pr_url: 'https://github.com/owner/repo/pull/42',
        pr_branch: 'feature-branch'
      } as Task;

      service.registerPR(task);

      const monitored = service.getMonitoredPRs();
      expect(monitored.length).toBe(1);
      expect(monitored[0].prNumber).toBe(42);
      expect(monitored[0].taskId).toBe('task-1');
      expect(monitored[0].status).toBe('monitoring');
    });

    it('should skip registration when PR info is missing', () => {
      const task: Task = {
        id: 'task-2',
        title: 'Test task',
        description: 'Test description',
        type: 'feature',
        status: 'completed',
        priority: 5,
        created_at: Date.now()
      } as Task;

      service.registerPR(task);

      const monitored = service.getMonitoredPRs();
      expect(monitored.length).toBe(0);
    });

    it('should start polling when first PR is registered', () => {
      const task: Task = {
        id: 'task-3',
        title: 'Test task',
        description: 'Test description',
        type: 'feature',
        status: 'completed',
        priority: 5,
        created_at: Date.now(),
        pr_number: 100,
        pr_url: 'https://github.com/owner/repo/pull/100',
        pr_branch: 'test-branch'
      } as Task;

      service.registerPR(task);

      const status = service.getStatus();
      expect(status.isPolling).toBe(true);
      expect(status.monitoredCount).toBe(1);
    });
  });

  describe('shouldCreateFollowup', () => {
    it('should create followup for failed CI checks', () => {
      const prStatus: PRStatus = {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'CI', status: 'failure', conclusion: 'failure', detailsUrl: null }
        ],
        reviews: [],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        hasComments: false,
        totalComments: 0,
        blockingIssues: [],
        suggestions: [],
        severity: 'none'
      };

      const shouldCreate = (service as any).shouldCreateFollowup(prStatus, copilotAnalysis);
      expect(shouldCreate).toBe(true);
    });

    it('should create followup for high severity Copilot issues', () => {
      const prStatus: PRStatus = {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        checks: [],
        reviews: [],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        hasComments: true,
        totalComments: 3,
        blockingIssues: ['Issue 1', 'Issue 2', 'Issue 3'],
        suggestions: [],
        severity: 'high'
      };

      const shouldCreate = (service as any).shouldCreateFollowup(prStatus, copilotAnalysis);
      expect(shouldCreate).toBe(true);
    });

    it('should create followup for medium severity Copilot issues', () => {
      const prStatus: PRStatus = {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        checks: [],
        reviews: [],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        hasComments: true,
        totalComments: 1,
        blockingIssues: ['Issue 1'],
        suggestions: [],
        severity: 'medium'
      };

      const shouldCreate = (service as any).shouldCreateFollowup(prStatus, copilotAnalysis);
      expect(shouldCreate).toBe(true);
    });

    it('should create followup for human change requests', () => {
      const prStatus: PRStatus = {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        checks: [],
        reviews: [
          {
            author: 'human-reviewer',
            state: 'CHANGES_REQUESTED',
            submittedAt: '2025-01-01T00:00:00Z',
            body: 'Please fix this'
          }
        ],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        hasComments: false,
        totalComments: 0,
        blockingIssues: [],
        suggestions: [],
        severity: 'none'
      };

      const shouldCreate = (service as any).shouldCreateFollowup(prStatus, copilotAnalysis);
      expect(shouldCreate).toBe(true);
    });

    it('should not create followup for low severity suggestions', () => {
      const prStatus: PRStatus = {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        checks: [
          { name: 'CI', status: 'success', conclusion: 'success', detailsUrl: null }
        ],
        reviews: [],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        hasComments: true,
        totalComments: 1,
        blockingIssues: [],
        suggestions: ['Consider refactoring'],
        severity: 'low'
      };

      const shouldCreate = (service as any).shouldCreateFollowup(prStatus, copilotAnalysis);
      expect(shouldCreate).toBe(false);
    });

    it('should ignore Copilot change requests', () => {
      const prStatus: PRStatus = {
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        checks: [],
        reviews: [
          {
            author: 'github-copilot[bot]',
            state: 'CHANGES_REQUESTED',
            submittedAt: '2025-01-01T00:00:00Z',
            body: 'Some suggestions'
          }
        ],
        comments: []
      };

      const copilotAnalysis: CopilotReviewAnalysis = {
        hasComments: false,
        totalComments: 0,
        blockingIssues: [],
        suggestions: [],
        severity: 'none'
      };

      const shouldCreate = (service as any).shouldCreateFollowup(prStatus, copilotAnalysis);
      expect(shouldCreate).toBe(false);
    });
  });

  describe('monitoring status', () => {
    it('should return monitoring status', () => {
      const status = service.getStatus();

      expect(status).toHaveProperty('isPolling');
      expect(status).toHaveProperty('monitoredCount');
      expect(status).toHaveProperty('config');
      expect(status.config.pollIntervalMs).toBe(100);
      expect(status.config.maxPollAttempts).toBe(5);
      expect(status.config.enableAutoMerge).toBe(true);
    });

    it('should track monitored PR count', () => {
      const task1: Task = {
        id: 'task-1',
        title: 'Test 1',
        description: 'Test',
        type: 'feature',
        status: 'completed',
        priority: 5,
        created_at: Date.now(),
        pr_number: 1,
        pr_url: 'https://github.com/owner/repo/pull/1',
        pr_branch: 'branch-1'
      } as Task;

      const task2: Task = {
        id: 'task-2',
        title: 'Test 2',
        description: 'Test',
        type: 'feature',
        status: 'completed',
        priority: 5,
        created_at: Date.now(),
        pr_number: 2,
        pr_url: 'https://github.com/owner/repo/pull/2',
        pr_branch: 'branch-2'
      } as Task;

      service.registerPR(task1);
      service.registerPR(task2);

      const status = service.getStatus();
      expect(status.monitoredCount).toBe(2);
    });
  });

  describe('polling control', () => {
    it('should stop polling', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test',
        description: 'Test',
        type: 'feature',
        status: 'completed',
        priority: 5,
        created_at: Date.now(),
        pr_number: 1,
        pr_url: 'https://github.com/owner/repo/pull/1',
        pr_branch: 'branch-1'
      } as Task;

      service.registerPR(task);
      expect(service.getStatus().isPolling).toBe(true);

      service.stopPolling();
      expect(service.getStatus().isPolling).toBe(false);
    });
  });

  describe('PR state tracking', () => {
    it('should track PR in monitoring state', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test',
        description: 'Test',
        type: 'feature',
        status: 'completed',
        priority: 5,
        created_at: Date.now(),
        pr_number: 42,
        pr_url: 'https://github.com/owner/repo/pull/42',
        pr_branch: 'test-branch'
      } as Task;

      service.registerPR(task);

      const monitored = service.getMonitoredPRs();
      expect(monitored[0].status).toBe('monitoring');
      expect(monitored[0].checkCount).toBe(0);
      expect(monitored[0].issuesFound).toEqual([]);
    });

    it('should initialize lastChecked timestamp', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test',
        description: 'Test',
        type: 'feature',
        status: 'completed',
        priority: 5,
        created_at: Date.now(),
        pr_number: 42,
        pr_url: 'https://github.com/owner/repo/pull/42',
        pr_branch: 'test-branch'
      } as Task;

      const beforeRegister = Date.now();
      service.registerPR(task);
      const afterRegister = Date.now();

      const monitored = service.getMonitoredPRs();
      expect(monitored[0].lastChecked).toBeGreaterThanOrEqual(beforeRegister);
      expect(monitored[0].lastChecked).toBeLessThanOrEqual(afterRegister);
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const defaultService = new PRMonitorService(mockTaskQueue as any);
      const status = defaultService.getStatus();

      expect(status.config.pollIntervalMs).toBe(60000); // 1 minute
      expect(status.config.maxPollAttempts).toBe(60); // 1 hour
      expect(status.config.enableAutoMerge).toBe(true);
    });

    it('should use custom configuration', () => {
      const customService = new PRMonitorService(mockTaskQueue as any, {
        pollIntervalMs: 30000,
        maxPollAttempts: 120,
        enableAutoMerge: false
      });

      const status = customService.getStatus();

      expect(status.config.pollIntervalMs).toBe(30000);
      expect(status.config.maxPollAttempts).toBe(120);
      expect(status.config.enableAutoMerge).toBe(false);
    });

    it('should allow partial configuration override', () => {
      const partialService = new PRMonitorService(mockTaskQueue as any, {
        pollIntervalMs: 45000
      });

      const status = partialService.getStatus();

      expect(status.config.pollIntervalMs).toBe(45000); // Custom
      expect(status.config.maxPollAttempts).toBe(60); // Default
      expect(status.config.enableAutoMerge).toBe(true); // Default
    });
  });

  describe('edge cases', () => {
    it('should handle registering same PR multiple times', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test',
        description: 'Test',
        type: 'feature',
        status: 'completed',
        priority: 5,
        created_at: Date.now(),
        pr_number: 42,
        pr_url: 'https://github.com/owner/repo/pull/42',
        pr_branch: 'test-branch'
      } as Task;

      service.registerPR(task);
      service.registerPR(task);

      // Should only have one entry (Map.set overwrites)
      const monitored = service.getMonitoredPRs();
      expect(monitored.length).toBe(1);
    });

    it('should handle empty PR list', () => {
      const monitored = service.getMonitoredPRs();
      expect(monitored).toEqual([]);

      const status = service.getStatus();
      expect(status.monitoredCount).toBe(0);
      expect(status.isPolling).toBe(false);
    });

    it('should handle partial PR information', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test',
        description: 'Test',
        type: 'feature',
        status: 'completed',
        priority: 5,
        created_at: Date.now(),
        pr_number: 42,
        pr_url: 'https://github.com/owner/repo/pull/42'
        // Missing pr_branch
      } as Task;

      service.registerPR(task);

      const monitored = service.getMonitoredPRs();
      expect(monitored.length).toBe(0); // Should skip incomplete PR info
    });
  });
});
