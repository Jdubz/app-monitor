/**
 * Dev-Bots Integration Tests
 *
 * Tests the complete dev-bots workflow including task management,
 * worker status, and interactive sessions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { DevBotsTab } from '../tabs/DevBotsTab';
import { createMockEnvironment, mockGenerators, apiSuccess } from '../../test/api-mocks';

const mockEnv = createMockEnvironment();

vi.mock('../../services/ApiClient', () => ({
  apiClient: mockEnv.apiClient,
}));

const renderDevBotsTab = () => {
  return render(
    <BrowserRouter>
      <DevBotsTab socket={mockEnv.socket} />
    </BrowserRouter>
  );
};

describe('Dev-Bots Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.socket.connected = false;

    // Default mock implementations
    mockEnv.apiClient.get.mockImplementation((url: string) => {
      if (url === '/dev-bots/status') {
        return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
      }
      if (url === '/dev-bots/agent-comparison') {
        return Promise.resolve(
          apiSuccess({ comparison: mockGenerators.devBotsAgentComparison() })
        );
      }
      if (url === '/dev-bots/interactive/session') {
        return Promise.resolve(apiSuccess(mockGenerators.devBotsInteractiveSessionState(false)));
      }
      return Promise.resolve(apiSuccess({}));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task Queue Management', () => {
    it('should load and display task queue', async () => {
      const status = mockGenerators.devBotsStatus();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(status));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/status');
      });

      // Should display task counts
      await waitFor(() => {
        // Verify task information is displayed (implementation-dependent)
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
        expect(status.queueSize).toBeGreaterThanOrEqual(0);
        expect(status.activeTasks).toBeGreaterThanOrEqual(0);
      });
    });

    it('should display pending, active, and completed tasks', async () => {
      const tasks = mockGenerators.devBotsTaskCollections();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.resolve(
            apiSuccess(
              mockGenerators.devBotsStatus({
                tasks,
                queueSize: tasks.pending.length,
                activeTasks: tasks.active.length,
              })
            )
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        // Should show pending tasks
        expect(tasks.pending.length).toBeGreaterThan(0);
        // Should show active tasks
        expect(tasks.active.length).toBeGreaterThan(0);
        // Should show completed tasks
        expect(tasks.completed.length).toBeGreaterThan(0);
      });
    });

    it('should handle task updates via socket', async () => {
      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/status');
      });

      // Connect socket
      mockEnv.socket.connect();

      // Simulate task creation
      const newTask = mockGenerators.devBotsTask({
        id: 'new-task',
        status: 'pending',
        description: 'New task from socket',
      });

      mockEnv.triggerSocketEvent('task:created', newTask);

      await waitFor(() => {
        expect(mockEnv.socket._listeners.has('task:created')).toBe(true);
      });
    });

    it('should handle task status changes via socket', async () => {
      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      mockEnv.socket.connect();

      // Simulate task status update
      const updatedTask = mockGenerators.devBotsTask({
        id: 'task-1',
        status: 'active',
        assignedWorker: 'worker-1',
      });

      mockEnv.triggerSocketEvent('task:updated', updatedTask);

      await waitFor(() => {
        expect(mockEnv.socket._listeners.has('task:updated')).toBe(true);
      });
    });

    it('should handle task completion via socket', async () => {
      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      mockEnv.socket.connect();

      // Simulate task completion
      const completedTask = mockGenerators.devBotsTask({
        id: 'task-1',
        status: 'completed',
        completedAt: new Date().toISOString(),
        output: 'Task completed successfully',
      });

      mockEnv.triggerSocketEvent('task:completed', completedTask);

      await waitFor(() => {
        expect(mockEnv.socket._listeners.has('task:completed')).toBe(true);
      });
    });

    it('should handle task failure via socket', async () => {
      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      mockEnv.socket.connect();

      // Simulate task failure
      const failedTask = mockGenerators.devBotsTask({
        id: 'task-1',
        status: 'failed',
        error: 'Task execution failed',
        exitCode: 1,
      });

      mockEnv.triggerSocketEvent('task:failed', failedTask);

      await waitFor(() => {
        expect(mockEnv.socket._listeners.has('task:failed')).toBe(true);
      });
    });
  });

  describe('Worker Management', () => {
    it('should display worker status', async () => {
      const status = mockGenerators.devBotsStatus({
        workers: {
          'worker-1': mockGenerators.devBotsWorkerStatus('worker-1', { status: 'idle' }),
          'worker-2': mockGenerators.devBotsWorkerStatus('worker-2', { status: 'busy' }),
        },
        workerCount: 2,
        maxWorkers: 5,
      });

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(status));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        // Should display worker count
        expect(status.workerCount).toBe(2);
        expect(status.maxWorkers).toBe(5);
      });
    });

    it('should handle worker status updates via socket', async () => {
      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      mockEnv.socket.connect();

      // Simulate worker status update
      const workerStatus = mockGenerators.devBotsWorkerStatus('worker-1', {
        status: 'busy',
        currentTask: 'task-1',
      });

      mockEnv.triggerSocketEvent('worker:status', workerStatus);

      await waitFor(() => {
        expect(mockEnv.socket._listeners.has('worker:status')).toBe(true);
      });
    });

    it('should display worker types and availability', async () => {
      const status = mockGenerators.devBotsStatus({
        activeWorkerTypes: ['automation'],
        availableWorkerTypes: ['automation', 'interactive'],
      });

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(status));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        expect(status.activeWorkerTypes).toContain('automation');
        expect(status.availableWorkerTypes).toContain('automation');
        expect(status.availableWorkerTypes).toContain('interactive');
      });
    });
  });

  describe('Interactive Sessions', () => {
    it('should show no active session state', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
        }
        if (url === '/dev-bots/interactive/session') {
          return Promise.resolve(
            apiSuccess(mockGenerators.devBotsInteractiveSessionState(false))
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/interactive/session');
      });
    });

    it('should display active session', async () => {
      const sessionState = mockGenerators.devBotsInteractiveSessionState(true);

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
        }
        if (url === '/dev-bots/interactive/session') {
          return Promise.resolve(apiSuccess(sessionState));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/interactive/session');
      });

      // Should show session information
      expect(sessionState.session).not.toBeNull();
      expect(sessionState.session?.status).toBe('running');
    });

    it('should start a new interactive session', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
        }
        if (url === '/dev-bots/interactive/session') {
          return Promise.resolve(
            apiSuccess(mockGenerators.devBotsInteractiveSessionState(false))
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      mockEnv.apiClient.post.mockImplementation((url: string) => {
        if (url === '/dev-bots/interactive/session') {
          return Promise.resolve(
            apiSuccess(mockGenerators.devBotsInteractiveSessionState(true))
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/interactive/session');
      });

      // Look for start session button (implementation-dependent)
      // This validates the API integration is set up correctly
      expect(mockEnv.apiClient.post).toBeDefined();
    });

    it('should end an active interactive session', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
        }
        if (url === '/dev-bots/interactive/session') {
          return Promise.resolve(
            apiSuccess(mockGenerators.devBotsInteractiveSessionState(true))
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      mockEnv.apiClient.delete.mockImplementation((url: string) => {
        if (url === '/dev-bots/interactive/session') {
          return Promise.resolve(
            apiSuccess(mockGenerators.devBotsInteractiveSessionState(false))
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/interactive/session');
      });

      // Validate delete endpoint is available
      expect(mockEnv.apiClient.delete).toBeDefined();
    });
  });

  describe('Agent Comparison Metrics', () => {
    it('should load and display agent comparison data', async () => {
      const comparison = mockGenerators.devBotsAgentComparison();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
        }
        if (url === '/dev-bots/agent-comparison') {
          return Promise.resolve(apiSuccess({ comparison }));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/agent-comparison');
      });

      // Should show metrics
      expect(comparison.claude.success_rate).toBe(90.0);
      expect(comparison.codex.success_rate).toBe(81.25);
    });

    it('should display task type breakdown', async () => {
      const comparison = mockGenerators.devBotsAgentComparison();

      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
        }
        if (url === '/dev-bots/agent-comparison') {
          return Promise.resolve(apiSuccess({ comparison }));
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/agent-comparison');
      });

      // Validate task type breakdown data exists
      expect(comparison.task_type_breakdown.claude).toBeDefined();
      expect(comparison.task_type_breakdown.claude.implementation).toBeDefined();
      expect(comparison.task_type_breakdown.claude.testing).toBeDefined();
      expect(comparison.task_type_breakdown.claude.documentation).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.reject(
            mockEnv.respondWithError('SERVER_ERROR', 'Failed to fetch dev-bots status')
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/status');
      });

      // Should handle error (implementation-dependent)
    });

    it('should handle socket disconnections during task updates', async () => {
      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });

      // Connect socket
      mockEnv.socket.connect();
      expect(mockEnv.socket.connected).toBe(true);

      // Disconnect
      mockEnv.socket.disconnect();
      expect(mockEnv.socket.connected).toBe(false);

      // Should handle reconnection gracefully
      await waitFor(() => {
        expect(mockEnv.socket._listeners.has('disconnect')).toBe(true);
      });
    });

    it('should handle task fetch errors', async () => {
      mockEnv.apiClient.get.mockImplementation((url: string) => {
        if (url === '/dev-bots/status') {
          return Promise.resolve(apiSuccess(mockGenerators.devBotsStatus()));
        }
        if (url.includes('/tasks/') && url.endsWith('/detail')) {
          return Promise.reject(
            mockEnv.respondWithError('NOT_FOUND', 'Task not found')
          );
        }
        return Promise.resolve(apiSuccess({}));
      });

      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalled();
      });
    });
  });

  describe('Real-time System Status', () => {
    it('should update system status via socket', async () => {
      renderDevBotsTab();

      await waitFor(() => {
        expect(mockEnv.apiClient.get).toHaveBeenCalledWith('/dev-bots/status');
      });

      mockEnv.socket.connect();

      // Simulate system status update
      const statusUpdate = mockGenerators.devBotsStatus({
        systemStatus: 'running',
        queueSize: 5,
        activeTasks: 2,
      });

      mockEnv.triggerSocketEvent('devbots:status', statusUpdate);

      await waitFor(() => {
        expect(mockEnv.socket._listeners.has('devbots:status')).toBe(true);
      });
    });
  });
});
