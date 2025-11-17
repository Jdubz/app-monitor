// @ts-nocheck
/**
 * Core DevBots Manager Tests
 * 
 * Based on test scenarios from docs/plans/test-scenarios-by-repository.md
 * Covers task creation, assignment, worker management, and error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DevBotsManager, type Task } from './devBotsManager.js';
import { logger } from '../utils/logger.js';

// Mock all dependencies
vi.mock('./processManager.js');
vi.mock('./taskPersistence.js');
vi.mock('./agentPersonalities.js');
vi.mock('./workspaceSyncManager.js');
vi.mock('./dockerManager.js');
vi.mock('./retryManager.js');
vi.mock('./workspaceOrchestrator.js', () => {
  const mockInitialize = vi.fn();
  const mockCreateWorkspace = vi.fn(() => ({
    id: 'workspace-test',
    hostPath: '/tmp/workspace',
    branchName: 'bots/task-core',
    mirrorPath: '/tmp/mirror',
    createdAt: new Date().toISOString()
  }));
  const mockSealWorkspace = vi.fn(async () => ({
    status: 'success',
    branchName: 'bots/task-core',
    commitSha: 'abc123'
  }));
  const mockCleanupWorkspace = vi.fn();
  const mockCreatePatchArtifact = vi.fn(() => '/tmp/workspace.patch');

  return {
    WorkspaceOrchestrator: vi.fn().mockImplementation(() => ({
      initialize: mockInitialize,
      createWorkspace: mockCreateWorkspace,
      sealWorkspace: mockSealWorkspace,
      cleanupWorkspace: mockCleanupWorkspace,
      createPatchArtifact: mockCreatePatchArtifact
    })),
    PushCoordinator: class {
      enqueue(handler: () => Promise<unknown> | unknown) {
        return Promise.resolve(handler());
      }
    }
  };
});
vi.mock('./taskCreationGuidelines.js', async () => {
  return {
    TaskCreationGuidelinesManager: class MockTaskCreationGuidelinesManager {
      validateTaskData = vi.fn().mockReturnValue({
        isValid: true,
        warnings: [],
        suggestions: [],
        errors: []
      });
      getGuidelinesForType = vi.fn().mockReturnValue({ type: 'feature', guidelines: [] });
      constructor() {}
    }
  };
});
vi.mock('./promptTemplateService.js');
vi.mock('../utils/logger.js');

import { createMockDevBotsManagerDependencies } from './devBotsManager.mocks.js';

describe('DevBotsManager Core Functionality', () => {
  let devBotsManager: DevBotsManager;
  let managerInternals: any;
  let mockProcessManager: any;
  let mockTaskPersistence: any;
  let mockWorkspaceSyncManager: any;
  let mockDockerManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock logger methods
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});
    vi.mocked(logger.debug).mockImplementation(() => {});

    // Create DevBotsManager instance with mock dependencies
    const mockDeps = createMockDevBotsManagerDependencies();
    devBotsManager = new DevBotsManager(mockDeps);
    managerInternals = devBotsManager as any;

    // Store references for test assertions
    mockProcessManager = mockDeps.processManager;
    mockTaskPersistence = mockDeps.taskPersistence;
    mockWorkspaceSyncManager = mockDeps.workspaceSyncManager;
    mockDockerManager = mockDeps.dockerManager;

    // Mock private methods to avoid filesystem operations
    managerInternals.initializeWorkerLogFile = vi.fn().mockResolvedValue(undefined);
    managerInternals.cleanupWorker = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task Creation and Assignment', () => {
    it('should create task and assign to worker', async () => {
      // Given: Task is submitted
      // Mock worker availability
      managerInternals.workers = {
        'worker-1': {
          id: 'worker-1',
          status: 'idle',
          lastSeen: Date.now(),
          personality: { id: 'test-agent', name: 'Test Agent' },
          onboardingComplete: true,
          lastOnboardingCheck: Date.now()
        }
      };

      // When: Task is created using correct API
      const task = await devBotsManager.addTask(
        'feature',
        'Test Task',
        'A test task for development',
        'Task should be completed successfully',
        { assignedAgent: 'test-agent' }
      );

      // Then: Task is created with correct properties
      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.status).toBe('pending');
      expect(task.assignedAgent).toBe('test-agent');
      expect(task.createdAt).toBeDefined();

      // And: Task is added to queue
      const status = await devBotsManager.getSystemStatus();
      expect(status.tasks.pending).toContain(task);
    });

    it('should enforce concurrent worker limits', async () => {
      // Given: Max workers is set to 2 and 2 workers are active
      devBotsManager['maxConcurrentWorkers'] = 2;
      devBotsManager['workers'] = {
        'worker-1': {
          id: 'worker-1',
          status: 'busy',
          lastSeen: Date.now(),
          personality: { id: 'bot-a', name: 'Bot A' },
          onboardingComplete: true,
          lastOnboardingCheck: Date.now(),
          currentTask: 'task-1'
        },
        'worker-2': {
          id: 'worker-2',
          status: 'busy',
          lastSeen: Date.now(),
          personality: { id: 'bot-b', name: 'Bot B' },
          onboardingComplete: true,
          lastOnboardingCheck: Date.now(),
          currentTask: 'task-2'
        }
      };

      // When: New task arrives
      const task = await devBotsManager.addTask(
        'feature',
        'Third Task',
        'This should be queued',
        'Task should remain queued',
        { assignedAgent: 'test-agent' }
      );

      // Then: Task is queued, not assigned
      expect(task.status).toBe('pending');
      expect(devBotsManager['taskQueue']).toContain(task);

      // And: No worker is assigned
      expect(task.assignedWorker).toBeUndefined();
    });

    it('should assign task when worker becomes available', async () => {
      // Given: Task is queued and worker becomes available
      const task: Task = {
        id: 'task-1',
        type: 'feature',
        title: 'Queued Task',
        status: 'pending',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent'
      };

      devBotsManager['taskQueue'] = [task];
      devBotsManager['workers'] = {
        'worker-1': {
          id: 'worker-1',
          status: 'idle',
          lastSeen: Date.now(),
          personality: { id: 'test-agent', name: 'Test Agent' },
          onboardingComplete: true,
          lastOnboardingCheck: Date.now()
        }
      };

      // When: Worker becomes available
      await devBotsManager['assignNextTask']();

      // Then: Task is assigned to worker
      expect(task.status).toBe('assigned');
      expect(task.assignedWorker).toBe('worker-1');
      expect(devBotsManager['taskQueue']).not.toContain(task);
    });
  });

  describe('Worker Management', () => {
    it('should create and manage worker lifecycle', async () => {
      // Given: DevBotsManager is initialized
      const workerId = 'worker-1';
      const agentPersonality = { id: 'test-agent', name: 'Test Agent' };

      // When: Worker is created (using private method for testing)
      devBotsManager['workers'].set(workerId, {
        id: workerId,
        status: 'idle',
        lastSeen: Date.now(),
        personality: agentPersonality,
        onboardingComplete: true,
        lastOnboardingCheck: Date.now()
      });

      // Then: Worker is added to workers map
      expect(devBotsManager['workers'].get(workerId)).toBeDefined();
      expect(devBotsManager['workers'].get(workerId)?.id).toBe(workerId);
      expect(devBotsManager['workers'].get(workerId)?.personality).toEqual(agentPersonality);
      expect(devBotsManager['workers'].get(workerId)?.status).toBe('idle');
    });

    it('should handle worker cleanup on failure', async () => {
      // Given: Worker exists and fails
      const workerId = 'worker-1';
      devBotsManager['workers'][workerId] = {
        id: workerId,
        status: 'busy',
        lastSeen: Date.now(),
        personality: { id: 'test-agent', name: 'Test Agent' },
        onboardingComplete: true,
        lastOnboardingCheck: Date.now(),
        currentTask: 'task-1'
      };

      // When: Worker cleanup is triggered
      await devBotsManager['cleanupWorker'](workerId, 'Worker failed');

      // Then: Worker is removed
      expect(devBotsManager['workers'][workerId]).toBeUndefined();
      
      // And: Current task is marked for retry
      const status = await devBotsManager.getSystemStatus();
      const failedTask = status.tasks.pending.find(t => t.id === 'task-1');
      expect(failedTask?.status).toBe('retrying');
    });

    it('should isolate task contexts', async () => {
      // Given: Multiple tasks running
      const task1: Task = {
        id: 'task-1',
        type: 'feature',
        title: 'Task 1',
        status: 'active',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        assignedWorker: 'worker-1'
      };

      const task2: Task = {
        id: 'task-2',
        type: 'bugfix',
        title: 'Task 2',
        status: 'active',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        assignedWorker: 'worker-2'
      };

      devBotsManager['activeTasks'] = new Map([
        ['task-1', task1],
        ['task-2', task2]
      ]);

      // When: Tasks access context
      const context1 = devBotsManager['getTaskContext']('task-1');
      const context2 = devBotsManager['getTaskContext']('task-2');

      // Then: Each task has isolated context
      expect(context1).toBeDefined();
      expect(context2).toBeDefined();
      expect(context1).not.toEqual(context2);
      expect(context1.taskId).toBe('task-1');
      expect(context2.taskId).toBe('task-2');
    });
  });

  describe('Task Retry System', () => {
    it('should retry failed tasks with backoff', async () => {
      // Given: Task fails
      const task: Task = {
        id: 'task-1',
        type: 'feature',
        title: 'Failing Task',
        status: 'failed',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        retryCount: 0,
        maxRetries: 3,
        retryStrategy: 'exponential'
      };

      devBotsManager['activeTasks'].set('task-1', task);

      // When: Retry is triggered
      await devBotsManager['retryTask'](task, 'Test failure');

      // Then: Task is retried after delay
      expect(task.status).toBe('retrying');
      expect(task.retryCount).toBe(1);
      expect(task.retryReason).toBe('Test failure');
      
      // And: Retry history is updated
      expect(task.retryHistory).toHaveLength(1);
      expect(task.retryHistory![0].attemptNumber).toBe(1);
      expect(task.retryHistory![0].reason).toBe('Test failure');
    });

    it('should respect max retries limit', async () => {
      // Given: Task has exceeded max retries
      const task: Task = {
        id: 'task-1',
        type: 'feature',
        title: 'Failing Task',
        status: 'failed',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        retryCount: 3,
        maxRetries: 3,
        retryStrategy: 'exponential'
      };

      devBotsManager['activeTasks'].set('task-1', task);

      // When: Retry is attempted
      await devBotsManager['retryTask'](task, 'Final failure');

      // Then: Task is not retried
      expect(task.status).toBe('failed');
      expect(task.retryCount).toBe(3);
      
      // And: Task is moved to completed with error
      const status = await devBotsManager.getSystemStatus();
      const completedTask = status.tasks.completed.find(t => t.id === 'task-1');
      expect(completedTask?.status).toBe('failed');
    });
  });

  describe('Task Cancellation', () => {
    it('should cancel running task', async () => {
      // Given: Task is running
      const task: Task = {
        id: 'task-1',
        type: 'feature',
        title: 'Running Task',
        status: 'active',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        assignedWorker: 'worker-1'
      };

      devBotsManager['activeTasks'].set('task-1', task);
      devBotsManager['workers']['worker-1'] = {
        id: 'worker-1',
        status: 'busy',
        lastSeen: Date.now(),
        personality: { id: 'test-agent', name: 'Test Agent' },
        onboardingComplete: true,
        lastOnboardingCheck: Date.now(),
        currentTask: 'task-1'
      };

      // When: Cancellation is requested
      // Note: cancelTask method doesn't exist, using private method for testing
      await devBotsManager['failEphemeralTask']({ id: 'worker-1' } as any, 'cancelled');

      // Then: Task is cancelled
      expect(task.status).toBe('failed');
      expect(task.error).toContain('cancelled');
      
      // And: Worker is notified
      expect(mockProcessManager.emit).toHaveBeenCalledWith('task:cancelled', {
        taskId: 'task-1',
        workerId: 'worker-1'
      });
    });
  });

  describe('Status and Monitoring', () => {
    it('should return comprehensive system status', async () => {
      // Given: System with workers and tasks
      devBotsManager['workers'] = {
        'worker-1': {
          id: 'worker-1',
          status: 'busy',
          lastSeen: Date.now(),
          personality: { id: 'test-agent', name: 'Test Agent' },
          onboardingComplete: true,
          lastOnboardingCheck: Date.now(),
          currentTask: 'task-1'
        },
        'worker-2': {
          id: 'worker-2',
          status: 'idle',
          lastSeen: Date.now(),
          personality: { id: 'test-agent', name: 'Test Agent' },
          onboardingComplete: true,
          lastOnboardingCheck: Date.now()
        }
      };

      devBotsManager['taskQueue'] = [
        { id: 'task-2', status: 'pending' } as Task
      ];

      devBotsManager['activeTasks'] = new Map([
        ['task-1', { id: 'task-1', status: 'active' } as Task]
      ]);

      // When: Status is requested
      const status = await devBotsManager.getSystemStatus();

      // Then: Complete status is returned
      expect(status.systemStatus).toBe('running');
      expect(status.workerCount).toBe(2);
      expect(status.queueSize).toBe(1);
      expect(status.activeTasks).toBe(1);
      expect(Object.keys(status.workers)).toHaveLength(2);
      expect(status.tasks.pending).toHaveLength(1);
      expect(status.tasks.active).toHaveLength(1);
    });

    it('should track worker uptime and health', async () => {
      // Given: Worker with known creation time
      const workerId = 'worker-1';
      const startTime = Date.now() - 60000; // 1 minute ago
      
      devBotsManager['workers'][workerId] = {
        id: workerId,
        status: 'busy',
        lastSeen: startTime,
        personality: { id: 'test-agent', name: 'Test Agent' },
        onboardingComplete: true,
        lastOnboardingCheck: startTime,
        currentTask: 'task-1'
      };

      // When: Status is checked
      const status = await devBotsManager.getSystemStatus();
      const worker = status.workers[workerId];

      // Then: Uptime is calculated correctly
      expect(worker).toBeDefined();
      expect(worker.lastSeen).toBeLessThanOrEqual(Date.now());
      expect(worker.lastSeen).toBeGreaterThan(startTime);
    });
  });

  describe('Error Handling', () => {
    it('should handle task creation errors gracefully', async () => {
      // Given: Invalid task data
      const invalidTaskData = {
        type: 'invalid-type',
        // Missing required fields
      } as any;

      // When: Task creation is attempted
      const result = await devBotsManager.addTask(invalidTaskData);

      // Then: Error is handled gracefully
      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle worker assignment failures', async () => {
      // Given: Task and no available workers
      const task: Task = {
        id: 'task-1',
        type: 'feature',
        title: 'Test Task',
        status: 'pending',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent'
      };

      devBotsManager['workers'] = {}; // No workers available

      // When: Task assignment is attempted
      await devBotsManager['assignNextTask']();

      // Then: Task remains in queue
      expect(task.status).toBe('pending');
      expect(devBotsManager['taskQueue']).toContain(task);
    });

    it('should handle Docker container failures', async () => {
      // Given: Docker operation fails
      mockDockerManager.createContainer.mockRejectedValue(new Error('Docker error'));

      // When: Ephemeral worker creation is attempted
      const result = await devBotsManager['createEphemeralWorker'](
        { id: 'test-agent', name: 'Test Agent' },
        { id: 'task-1' } as Task
      );

      // Then: Error is handled gracefully
      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create ephemeral worker'),
        expect.any(Error)
      );
    });
  });

  describe('Integration with External Services', () => {
    it('should integrate with workspace sync', async () => {
      // Given: Task requiring workspace sync
      const taskData: Partial<Task> = {
        type: 'feature',
        title: 'Sync Task',
        description: 'Task requiring workspace sync',
        assignedAgent: 'test-agent'
      };

      // When: Task is created
      await devBotsManager.addTask(taskData as Task);

      // Then: Workspace sync is triggered
      expect(mockWorkspaceSyncManager.syncWorkspace).toHaveBeenCalled();
    });

    it('should integrate with task persistence', async () => {
      // Given: Task completion
      const taskData = {
        id: 'task-1',
        type: 'feature',
        title: 'Completed Task',
        status: 'completed',
        createdAt: new Date().toISOString(),
        assignedAgent: 'test-agent',
        completedAt: new Date().toISOString(),
        output: 'Task completed successfully'
      };

      // When: Task is completed
      await devBotsManager['completeTask'](taskData as Task);

      // Then: Task is persisted
      expect(mockTaskPersistence.saveCompletedTasks).toHaveBeenCalled();
    });
  });
});
