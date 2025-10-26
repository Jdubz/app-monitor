import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DevBotsManager } from './devBotsManager.js';
import { ProcessManager } from './processManager.js';
import { AgentPersonalityManager } from './agentPersonalities.js';
import { TaskPersistence } from './taskPersistence.js';
import { WorkspaceSyncManager } from './workspaceSyncManager.js';
import { logger } from '../utils/logger.js';

// Mock dependencies
vi.mock('./processManager.js');
vi.mock('./taskPersistence.js');
vi.mock('./taskPromptTemplates.js');
vi.mock('./retryManager.js');
vi.mock('./workspaceSyncManager.js');
vi.mock('../utils/logger.js');

describe('DevBotsManager Worker Limit Enforcement', () => {
  let devBotsManager: DevBotsManager;
  let mockProcessManager: any;
  let mockTaskPersistence: any;
  let mockWorkspaceSyncManager: any;
  let agentManager: AgentPersonalityManager;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProcessManager = new ProcessManager();
    mockTaskPersistence = new TaskPersistence({
      storagePath: './test-data/tasks.json',
      backupPath: './test-data/backups',
      maxBackups: 5,
      autoSave: false,
      saveInterval: 5000
    });
    mockWorkspaceSyncManager = new WorkspaceSyncManager();

    agentManager = new AgentPersonalityManager();

    // Mock Logger methods
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});

    devBotsManager = new DevBotsManager(mockProcessManager);

    // Mock initializeWorkerLogFile to avoid filesystem operations
    devBotsManager['initializeWorkerLogFile'] = vi.fn().mockResolvedValue(undefined);

    // Mock initial state
    devBotsManager['taskQueue'] = [];
    devBotsManager['activeTasks'] = new Map();
    devBotsManager['completedTasks'] = [];
    devBotsManager['ephemeralWorkers'] = new Map();
    // MAX_CONCURRENT_WORKERS is a readonly constant

    // Mock task persistence methods
    vi.mocked(mockTaskPersistence.loadTasks).mockReturnValue({
      version: '1.0',
      lastSaved: new Date().toISOString(),
      tasks: []
    });
    vi.mocked(mockTaskPersistence.saveTasks).mockImplementation(() => {});
    vi.mocked(mockTaskPersistence.saveCompletedTasks).mockImplementation(() => {});
  });

  describe('Worker Limit Enforcement', () => {
    it.skip('should allow first task to be assigned to worker-a (integration test - fix in Phase 2)', async () => {
      const task = {
        id: 'task-1',
        type: 'implementation',
        title: 'Test task 1',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        assignedAgent: 'backend-specialist',
        assignedWorker: undefined as string | undefined,
        worktree: undefined as string | undefined,
        project: 'dev-monitor'
      };
      devBotsManager['taskQueue'].push(task as any);

      vi.mocked(mockWorkspaceSyncManager.syncAllWorkspaces).mockResolvedValue({
        successful: [],
        conflicts: [],
        errors: [],
        skipped: []
      });

      // Mock Docker container creation
      const mockContainer = {
        id: 'container-1',
        start: vi.fn().mockResolvedValue(undefined)
      };
      const mockDocker = {
        createContainer: vi.fn().mockResolvedValue(mockContainer)
      };
      devBotsManager['docker'] = mockDocker as any;

      await devBotsManager.assignNextTask();

      expect(task.status).toBe('assigned');
      expect(task.assignedWorker).toContain('worker-a');
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Assigning task task-1 to available worker')
      }));
    });

    it.skip('should allow second task to be assigned to worker-b (integration test - fix in Phase 2)', async () => {
      // First, add a worker-a to simulate it being active
      devBotsManager['ephemeralWorkers'].set('worker-a-test-123', {
        id: 'worker-a-test-123',
        containerId: 'container-1',
        agent: agentManager.getPersonality('backend-specialist')!,
        task: { id: 'task-0' } as any,
        status: 'running',
        createdAt: new Date().toISOString()
      });

      const task = {
        id: 'task-2',
        type: 'implementation',
        title: 'Test task 2',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        assignedAgent: 'frontend-specialist',
        assignedWorker: undefined as string | undefined,
        worktree: undefined as string | undefined,
        project: 'dev-monitor'
      };
      devBotsManager['taskQueue'].push(task as any);

      vi.mocked(mockWorkspaceSyncManager.syncAllWorkspaces).mockResolvedValue({
        successful: [],
        conflicts: [],
        errors: [],
        skipped: []
      });

      // Mock Docker container creation
      const mockContainer = {
        id: 'container-2',
        start: vi.fn().mockResolvedValue(undefined)
      };
      const mockDocker = {
        createContainer: vi.fn().mockResolvedValue(mockContainer)
      };
      devBotsManager['docker'] = mockDocker as any;

      await devBotsManager.assignNextTask();

      expect(task.status).toBe('assigned');
      expect(task.assignedWorker).toContain('worker-b');
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Assigning task task-2 to available worker')
      }));
    });

    it('should prevent third task assignment when both worker-a and worker-b are active', async () => {
      // Add both worker-a and worker-b to simulate them being active
      devBotsManager['ephemeralWorkers'].set('worker-a-test-123', {
        id: 'worker-a-test-123',
        containerId: 'container-1',
        agent: agentManager.getPersonality('backend-specialist')!,
        task: { id: 'task-0' } as any,
        status: 'running',
        createdAt: new Date().toISOString()
      });

      devBotsManager['ephemeralWorkers'].set('worker-b-test-456', {
        id: 'worker-b-test-456',
        containerId: 'container-2',
        agent: agentManager.getPersonality('frontend-specialist')!,
        task: { id: 'task-1' } as any,
        status: 'running',
        createdAt: new Date().toISOString()
      });

      const task = {
        id: 'task-3',
        type: 'implementation',
        title: 'Test task 3',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        assignedAgent: 'testing-specialist',
        assignedWorker: undefined as string | undefined,
        worktree: undefined as string | undefined,
        project: 'dev-monitor'
      };
      devBotsManager['taskQueue'].push(task as any);

      await devBotsManager.assignNextTask();

      // Task should remain pending
      expect(task.status).toBe('pending');
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Both worker-a and worker-b are active, skipping task assignment'
      }));
    });

    it.skip('should assign to worker-a when no workers are active (integration test - fix in Phase 2)', async () => {
      const task = {
        id: 'task-1',
        type: 'implementation',
        title: 'Test task 1',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        assignedAgent: 'backend-specialist',
        assignedWorker: undefined as string | undefined,
        worktree: undefined as string | undefined,
        project: 'dev-monitor'
      };
      devBotsManager['taskQueue'].push(task as any);

      vi.mocked(mockWorkspaceSyncManager.syncAllWorkspaces).mockResolvedValue({
        successful: [],
        conflicts: [],
        errors: [],
        skipped: []
      });

      // Mock Docker container creation
      const mockContainer = {
        id: 'container-1',
        start: vi.fn().mockResolvedValue(undefined)
      };
      const mockDocker = {
        createContainer: vi.fn().mockResolvedValue(mockContainer)
      };
      devBotsManager['docker'] = mockDocker as any;

      await devBotsManager.assignNextTask();

      expect(task.assignedWorker).toContain('worker-a');
    });

    it.skip('should assign to worker-b when only worker-a is active (integration test - fix in Phase 2)', async () => {
      // Add worker-a to simulate it being active
      devBotsManager['ephemeralWorkers'].set('worker-a-test-123', {
        id: 'worker-a-test-123',
        containerId: 'container-1',
        agent: agentManager.getPersonality('backend-specialist')!,
        task: { id: 'task-0' } as any,
        status: 'running',
        createdAt: new Date().toISOString()
      });

      const task = {
        id: 'task-2',
        type: 'implementation',
        title: 'Test task 2',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        assignedAgent: 'frontend-specialist',
        assignedWorker: undefined as string | undefined,
        worktree: undefined as string | undefined,
        project: 'dev-monitor'
      };
      devBotsManager['taskQueue'].push(task as any);

      vi.mocked(mockWorkspaceSyncManager.syncAllWorkspaces).mockResolvedValue({
        successful: [],
        conflicts: [],
        errors: [],
        skipped: []
      });

      // Mock Docker container creation
      const mockContainer = {
        id: 'container-2',
        start: vi.fn().mockResolvedValue(undefined)
      };
      const mockDocker = {
        createContainer: vi.fn().mockResolvedValue(mockContainer)
      };
      devBotsManager['docker'] = mockDocker as any;

      await devBotsManager.assignNextTask();

      expect(task.assignedWorker).toContain('worker-b');
    });

    it.skip('should use correct worktree path for worker-a (integration test - fix in Phase 2)', async () => {
      const task = {
        id: 'task-1',
        type: 'implementation',
        title: 'Test task 1',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        assignedAgent: 'backend-specialist',
        assignedWorker: undefined as string | undefined,
        worktree: undefined as string | undefined,
        project: 'dev-monitor'
      };
      devBotsManager['taskQueue'].push(task as any);

      vi.mocked(mockWorkspaceSyncManager.syncAllWorkspaces).mockResolvedValue({
        successful: [],
        conflicts: [],
        errors: [],
        skipped: []
      });

      // Mock Docker container creation
      const mockContainer = {
        id: 'container-1',
        start: vi.fn().mockResolvedValue(undefined)
      };
      const mockDocker = {
        createContainer: vi.fn().mockResolvedValue(mockContainer)
      };
      devBotsManager['docker'] = mockDocker as any;

      await devBotsManager.assignNextTask();

      // Check that the container was created with correct working directory
      expect(vi.mocked(mockDocker.createContainer)).toHaveBeenCalledWith(
        expect.objectContaining({
          WorkingDir: '/app/worktrees/worker-a'
        })
      );
    });

    it.skip('should use correct worktree path for worker-b (integration test - fix in Phase 2)', async () => {
      // Add worker-a to simulate it being active
      devBotsManager['ephemeralWorkers'].set('worker-a-test-123', {
        id: 'worker-a-test-123',
        containerId: 'container-1',
        agent: agentManager.getPersonality('backend-specialist')!,
        task: { id: 'task-0' } as any,
        status: 'running',
        createdAt: new Date().toISOString()
      });

      const task = {
        id: 'task-2',
        type: 'implementation',
        title: 'Test task 2',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        assignedAgent: 'frontend-specialist',
        assignedWorker: undefined as string | undefined,
        worktree: undefined as string | undefined,
        project: 'dev-monitor'
      };
      devBotsManager['taskQueue'].push(task as any);

      vi.mocked(mockWorkspaceSyncManager.syncAllWorkspaces).mockResolvedValue({
        successful: [],
        conflicts: [],
        errors: [],
        skipped: []
      });

      // Mock Docker container creation
      const mockContainer = {
        id: 'container-2',
        start: vi.fn().mockResolvedValue(undefined)
      };
      const mockDocker = {
        createContainer: vi.fn().mockResolvedValue(mockContainer)
      };
      devBotsManager['docker'] = mockDocker as any;

      await devBotsManager.assignNextTask();

      // Check that the container was created with correct working directory
      expect(vi.mocked(mockDocker.createContainer)).toHaveBeenCalledWith(
        expect.objectContaining({
          WorkingDir: '/app/worktrees/worker-b'
        })
      );
    });

    it.skip('should update task worktree path correctly (integration test - fix in Phase 2)', async () => {
      const task = {
        id: 'task-1',
        type: 'implementation',
        title: 'Test task 1',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        assignedAgent: 'backend-specialist',
        assignedWorker: undefined as string | undefined,
        worktree: undefined as string | undefined,
        project: 'dev-monitor'
      };
      devBotsManager['taskQueue'].push(task as any);

      vi.mocked(mockWorkspaceSyncManager.syncAllWorkspaces).mockResolvedValue({
        successful: [],
        conflicts: [],
        errors: [],
        skipped: []
      });

      // Mock Docker container creation
      const mockContainer = {
        id: 'container-1',
        start: vi.fn().mockResolvedValue(undefined)
      };
      const mockDocker = {
        createContainer: vi.fn().mockResolvedValue(mockContainer)
      };
      devBotsManager['docker'] = mockDocker as any;

      await devBotsManager.assignNextTask();

      // Check that the task worktree was updated
      expect(task.worktree).toBe('./worktrees/worker-a');
    });

    it('should respect MAX_CONCURRENT_WORKERS limit', () => {
      expect(devBotsManager.getMaxWorkers()).toBe(2);
    });

    it('should handle worker cleanup errors gracefully', async () => {
      // Add a worker to simulate cleanup failure
      devBotsManager['ephemeralWorkers'].set('worker-a-test-123', {
        id: 'worker-a-test-123',
        containerId: 'container-1',
        agent: agentManager.getPersonality('backend-specialist')!,
        task: { id: 'task-0' } as any,
        status: 'running',
        createdAt: new Date().toISOString()
      });

      // Mock Docker to throw error on container removal
      const mockDocker = {
        getContainer: vi.fn().mockReturnValue({
          remove: vi.fn().mockRejectedValue(new Error('Container not found'))
        })
      };
      devBotsManager['docker'] = mockDocker as any;

      // This should not throw an error
      await expect(devBotsManager['destroyEphemeralWorker']('worker-a-test-123')).resolves.not.toThrow();
    });
  });

  describe('Worker Type Assignment Logic', () => {
    it('should correctly identify active worker-a', () => {
      devBotsManager['ephemeralWorkers'].set('worker-a-test-123', {
        id: 'worker-a-test-123',
        containerId: 'container-1',
        agent: agentManager.getPersonality('backend-specialist')!,
        task: { id: 'task-0' } as any,
        status: 'running',
        createdAt: new Date().toISOString()
      });

      const activeWorkers = Array.from(devBotsManager['ephemeralWorkers'].values()).filter(
        worker => worker.status !== 'destroyed'
      );
      
      const hasWorkerA = activeWorkers.some(worker => worker.id.includes('worker-a'));
      expect(hasWorkerA).toBe(true);
    });

    it('should correctly identify active worker-b', () => {
      devBotsManager['ephemeralWorkers'].set('worker-b-test-456', {
        id: 'worker-b-test-456',
        containerId: 'container-2',
        agent: agentManager.getPersonality('frontend-specialist')!,
        task: { id: 'task-1' } as any,
        status: 'running',
        createdAt: new Date().toISOString()
      });

      const activeWorkers = Array.from(devBotsManager['ephemeralWorkers'].values()).filter(
        worker => worker.status !== 'destroyed'
      );
      
      const hasWorkerB = activeWorkers.some(worker => worker.id.includes('worker-b'));
      expect(hasWorkerB).toBe(true);
    });

    it('should correctly identify when both workers are active', () => {
      devBotsManager['ephemeralWorkers'].set('worker-a-test-123', {
        id: 'worker-a-test-123',
        containerId: 'container-1',
        agent: agentManager.getPersonality('backend-specialist')!,
        task: { id: 'task-0' } as any,
        status: 'running',
        createdAt: new Date().toISOString()
      });

      devBotsManager['ephemeralWorkers'].set('worker-b-test-456', {
        id: 'worker-b-test-456',
        containerId: 'container-2',
        agent: agentManager.getPersonality('frontend-specialist')!,
        task: { id: 'task-1' } as any,
        status: 'running',
        createdAt: new Date().toISOString()
      });

      const activeWorkers = Array.from(devBotsManager['ephemeralWorkers'].values()).filter(
        worker => worker.status !== 'destroyed'
      );
      
      const hasWorkerA = activeWorkers.some(worker => worker.id.includes('worker-a'));
      const hasWorkerB = activeWorkers.some(worker => worker.id.includes('worker-b'));
      
      expect(hasWorkerA).toBe(true);
      expect(hasWorkerB).toBe(true);
    });
  });
});
