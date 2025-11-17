/**
 * Unit Tests for Bot Self-Reporting in Task Completion Logic
 *
 * Tests that the task completion service correctly prioritizes
 * bot self-reported status over exit codes and error detection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskCompletionService } from '../taskCompletion.service.js';
import { logger } from '../../utils/logger.js';
import type { Task } from '../taskQueue.sqlite.js';
import type { EphemeralWorker } from '../ephemeralWorker.service.js';
import type { TaskPersistence } from '../taskPersistence.js';
import type { PushCoordinator } from '../taskCompletion.service.js';

// Mock the logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock other dependencies
vi.mock('../tokenTracking.js', () => ({
  getTokenTrackingService: vi.fn().mockReturnValue({
    recordUsage: vi.fn()
  })
}));

vi.mock('../qualityGates.js', () => ({
  getQualityGateValidator: vi.fn().mockReturnValue({
    validateTask: vi.fn().mockResolvedValue({
      taskId: 'test',
      passed: true,
      overallScore: 100,
      gates: [],
      duration: 0,
      timestamp: new Date().toISOString()
    })
  })
}));

vi.mock('../taskVerification.service.js', () => ({
  getTaskVerificationService: vi.fn().mockReturnValue({
    verifyTask: vi.fn().mockResolvedValue({
      taskId: 'test',
      passed: true,
      acceptanceCriteria: {
        taskId: 'test',
        criteria: [],
        allMet: true,
        totalCriteria: 0,
        metCount: 0,
        percentMet: 100
      },
      overallScore: 100,
      timestamp: new Date().toISOString()
    })
  })
}));

vi.mock('../qualityObservation.service.js', () => ({
  getQualityObservationService: vi.fn().mockReturnValue({
    observeQuality: vi.fn().mockResolvedValue({
      taskId: 'test',
      overallScore: 100,
      qualityLevel: 'excellent',
      improvementOpportunities: [],
      readyForMerge: true
    })
  })
}));

vi.mock('../database.js', () => ({
  getDatabase: vi.fn().mockReturnValue({
    storeQualityObservation: vi.fn()
  })
}));

describe('TaskCompletionService - Bot Self-Reporting', () => {
  let taskCompletionService: TaskCompletionService;
  let mockEphemeralWorkerService: any;
  let mockTaskPersistence: Partial<TaskPersistence>;
  let mockPushCoordinator: Partial<PushCoordinator>;
  let mockEmit: vi.Mock;
  let mockTask: Task;
  let mockWorker: EphemeralWorker;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock dependencies
    mockEphemeralWorkerService = {
      destroyWorker: vi.fn().mockResolvedValue(undefined),
      getAllWorkers: vi.fn().mockReturnValue(new Map())
    };

    mockTaskPersistence = {
      saveCompletedTasks: vi.fn()
    };

    mockPushCoordinator = {
      enqueue: vi.fn().mockImplementation((fn) => fn())
    };

    mockEmit = vi.fn();

    // Create service
    taskCompletionService = new TaskCompletionService(
      mockEphemeralWorkerService,
      mockTaskPersistence as TaskPersistence,
      mockPushCoordinator as PushCoordinator,
      mockEmit,
      {
        enableQualityGates: false, // Disable for simpler tests
        enableTaskVerification: false
      }
    );

    // Mock task
    mockTask = {
      id: 'test-task-123',
      title: 'Test Task',
      type: 'implementation',
      status: 'running',
      assigned_agent: 'backend-specialist',
      priority: 5,
      created_at: Date.now(),
      output: '',
      error: ''
    } as Task;

    // Mock worker
    mockWorker = {
      id: 'worker-123',
      task: mockTask,
      status: 'running',
      workspace: {
        id: 'workspace-123',
        hostPath: '/tmp/workspace'
      }
    } as EphemeralWorker;
  });

  describe('Bot Self-Report Priority', () => {
    it('should mark task as completed when bot reports success (exit code 0)', async () => {
      // Bot reports success
      mockTask.metadata = JSON.stringify({
        bot_reported_success: true,
        bot_reported_summary: 'All tests passed',
        bot_reported_at: Date.now()
      });

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        'Task output',
        '',
        0, // exit code 0
        vi.fn()
      );

      expect(mockTask.status).toBe('completed');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'process',
          action: 'bot_self_reported_status',
          message: expect.stringContaining('SUCCESS')
        })
      );
    });

    it('should mark task as failed when bot reports failure (even with exit code 0)', async () => {
      // Bot reports failure despite exit code 0
      mockTask.metadata = JSON.stringify({
        bot_reported_success: false,
        bot_reported_summary: 'Linter checks failed',
        bot_reported_at: Date.now()
      });

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        'Task output',
        '',
        0, // exit code 0 but bot says failed
        vi.fn()
      );

      expect(mockTask.status).toBe('failed');
      expect(mockTask.error).toContain('Bot reported failure: Linter checks failed');
    });

    it('should mark task as completed when bot reports success (even with exit code 1)', async () => {
      // Bot reports success despite non-zero exit code
      mockTask.metadata = JSON.stringify({
        bot_reported_success: true,
        bot_reported_summary: 'Completed with warnings',
        bot_reported_at: Date.now()
      });

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        'Task output',
        '',
        1, // exit code 1 but bot says success
        vi.fn()
      );

      expect(mockTask.status).toBe('completed');
    });

    it('should prioritize bot report over authentication errors', async () => {
      // Bot reports success even though output contains auth errors
      mockTask.metadata = JSON.stringify({
        bot_reported_success: true,
        bot_reported_summary: 'Task completed before auth error',
        bot_reported_at: Date.now()
      });

      const outputWithAuthError = 'Some work done\nERROR: 401 Unauthorized';

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        outputWithAuthError,
        '',
        0,
        vi.fn()
      );

      // Bot report takes priority
      expect(mockTask.status).toBe('completed');
    });

    it('should prioritize bot report over critical errors', async () => {
      // Bot reports success despite critical error patterns
      mockTask.metadata = JSON.stringify({
        bot_reported_success: true,
        bot_reported_summary: 'Recovered from error',
        bot_reported_at: Date.now()
      });

      const outputWithCriticalError = 'ERROR: exceeded retry limit';

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        outputWithCriticalError,
        '',
        0,
        vi.fn()
      );

      expect(mockTask.status).toBe('completed');
    });
  });

  describe('Fallback to Exit Code Detection', () => {
    it('should use exit code when bot does not report', async () => {
      // No bot report - should use exit code
      mockTask.metadata = undefined;

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        'Task output',
        '',
        0, // exit code 0
        vi.fn()
      );

      expect(mockTask.status).toBe('completed');
    });

    it('should detect authentication error when bot does not report', async () => {
      mockTask.metadata = undefined;

      const outputWithAuthError = 'Reconnecting...\nERROR: exceeded retry limit, last status: 401 Unauthorized';

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        outputWithAuthError,
        '',
        0, // exit code 0 but auth error detected
        vi.fn()
      );

      expect(mockTask.status).toBe('failed');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'task_error_detected',
          details: expect.objectContaining({
            hasAuthenticationError: true
          })
        })
      );
    });

    it('should detect critical error when bot does not report', async () => {
      mockTask.metadata = undefined;

      const outputWithCriticalError = 'ERROR: exceeded retry limit';

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        outputWithCriticalError,
        '',
        0,
        vi.fn()
      );

      expect(mockTask.status).toBe('failed');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'task_error_detected',
          details: expect.objectContaining({
            hasCriticalError: true
          })
        })
      );
    });
  });

  describe('Metadata Parsing', () => {
    it('should handle metadata as string (from database)', async () => {
      // Metadata stored as TEXT in database
      mockTask.metadata = '{"bot_reported_success":true,"bot_reported_summary":"Done"}';

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        '',
        '',
        0,
        vi.fn()
      );

      expect(mockTask.status).toBe('completed');
    });

    it('should handle metadata as object (from interface)', async () => {
      // Metadata as object (TypeScript interface type)
      mockTask.metadata = {
        bot_reported_success: false,
        bot_reported_summary: 'Failed'
      } as any;

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        '',
        '',
        0,
        vi.fn()
      );

      expect(mockTask.status).toBe('failed');
    });

    it('should handle malformed metadata gracefully', async () => {
      mockTask.metadata = 'invalid json{' as any;

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        '',
        '',
        0,
        vi.fn()
      );

      // Should fall back to exit code detection
      expect(mockTask.status).toBe('completed');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failed_to_parse_bot_report'
        })
      );
    });

    it('should ignore non-boolean bot_reported_success', async () => {
      mockTask.metadata = JSON.stringify({
        bot_reported_success: 'yes', // Invalid - should be boolean
        bot_reported_summary: 'Done'
      });

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        '',
        '',
        0,
        vi.fn()
      );

      // Should fall back to exit code since bot_reported_success is not boolean
      expect(mockTask.status).toBe('completed');
    });
  });

  describe('Failure Reason Messages', () => {
    it('should include bot summary in failure reason', async () => {
      mockTask.metadata = JSON.stringify({
        bot_reported_success: false,
        bot_reported_summary: 'Tests failed with 3 errors'
      });

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        '',
        '',
        0,
        vi.fn()
      );

      expect(mockTask.error).toContain('Bot reported failure: Tests failed with 3 errors');
    });

    it('should use generic message when no summary provided', async () => {
      mockTask.metadata = JSON.stringify({
        bot_reported_success: false
      });

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        '',
        '',
        0,
        vi.fn()
      );

      expect(mockTask.error).toContain('Bot reported task failure');
    });
  });

  describe('Worker Cleanup', () => {
    it('should destroy worker after completion', async () => {
      mockTask.metadata = JSON.stringify({
        bot_reported_success: true
      });

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        '',
        '',
        0,
        vi.fn()
      );

      expect(mockEphemeralWorkerService.destroyWorker).toHaveBeenCalledWith('worker-123');
    });

    it('should save task to persistence', async () => {
      mockTask.metadata = JSON.stringify({
        bot_reported_success: true
      });

      await taskCompletionService.completeEphemeralTask(
        mockWorker,
        '',
        '',
        0,
        vi.fn()
      );

      expect(mockTaskPersistence.saveCompletedTasks).toHaveBeenCalledWith([mockTask]);
    });
  });
});
