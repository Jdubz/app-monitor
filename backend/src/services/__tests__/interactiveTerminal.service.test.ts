/**
 * Interactive Terminal Service - Unit Tests
 *
 * Comprehensive test coverage for session lifecycle, database persistence,
 * container management, and graceful shutdown handling.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InteractiveTerminalService } from '../interactiveTerminal.service.js';
import type { DevBotsDatabase } from '../database.js';
import type Docker from 'dockerode';

// Mock Docker container
const createMockContainer = () => ({
  id: 'container-123',
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  inspect: vi.fn().mockResolvedValue({
    State: { Running: true },
  }),
  exec: vi.fn().mockResolvedValue({
    start: vi.fn().mockResolvedValue({
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    }),
    resize: vi.fn().mockResolvedValue(undefined),
  }),
});

// Mock Docker instance
const createMockDocker = (): Docker => {
  const mockContainer = createMockContainer();
  return {
    createContainer: vi.fn().mockResolvedValue(mockContainer),
    getContainer: vi.fn().mockReturnValue(mockContainer),
  } as unknown as Docker;
};

// Mock Database
const createMockDatabase = (): DevBotsDatabase => {
  const sessions = new Map<string, any>();

  return {
    createInteractiveSession: vi.fn((session) => {
      sessions.set(session.id, { ...session });
      return session.id;
    }),
    updateInteractiveSession: vi.fn((id, updates) => {
      const session = sessions.get(id);
      if (session) {
        Object.assign(session, updates);
      }
    }),
    getInteractiveSessionById: vi.fn((id) => sessions.get(id) || null),
    getActiveInteractiveSession: vi.fn(() => {
      for (const session of sessions.values()) {
        if (session.status === 'running') {
          return session;
        }
      }
      return null;
    }),
    listRecentInteractiveSessions: vi.fn((limit) => {
      return Array.from(sessions.values()).slice(0, limit);
    }),
  } as unknown as DevBotsDatabase;
};

describe('InteractiveTerminalService', () => {
  let service: InteractiveTerminalService;
  let mockDatabase: DevBotsDatabase;
  let mockDocker: Docker;

  beforeEach(() => {
    mockDatabase = createMockDatabase();
    mockDocker = createMockDocker();

    service = new InteractiveTerminalService({
      database: mockDatabase,
      docker: mockDocker,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Lifecycle', () => {
    describe('startSession', () => {
      it('should create database record first', async () => {
        await service.startSession({ ownerEmail: 'test@example.com' });

        expect(mockDatabase.createInteractiveSession).toHaveBeenCalledWith(
          expect.objectContaining({
            ownerEmail: 'test@example.com',
            modelProvider: 'none',
            modelName: 'terminal',
            status: 'starting',
          })
        );
      });

      it('should create and start container', async () => {
        const result = await service.startSession({ ownerEmail: 'test@example.com' });

        const mockContainer = (mockDocker.getContainer as any)();
        expect(mockContainer.start).toHaveBeenCalled();
        expect(result.containerId).toBe('container-123');
      });

      it('should update database with containerId and running status', async () => {
        await service.startSession({ ownerEmail: 'test@example.com' });

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            containerId: 'container-123',
            status: 'running',
          })
        );
      });

      it('should return session with all fields', async () => {
        const result = await service.startSession({ ownerEmail: 'test@example.com' });

        expect(result).toMatchObject({
          sessionId: expect.any(String),
          containerId: 'container-123',
          session: expect.objectContaining({
            id: expect.any(String),
            ownerEmail: 'test@example.com',
            status: 'running',
            containerId: 'container-123',
          }),
        });
      });

      it('should emit session:started event', async () => {
        const eventSpy = vi.fn();
        service.on('session:started', eventSpy);

        await service.startSession({ ownerEmail: 'test@example.com' });

        expect(eventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: expect.any(String),
            containerId: 'container-123',
          })
        );
      });

      it('should mark session as error if container fails to start', async () => {
        const mockContainer = (mockDocker.getContainer as any)();
        mockContainer.start.mockRejectedValueOnce(new Error('Container failed'));

        await expect(
          service.startSession({ ownerEmail: 'test@example.com' })
        ).rejects.toThrow('Container failed');

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            status: 'error',
            terminationReason: 'Container failed',
            endedAt: expect.any(String),
          })
        );
      });
    });

    describe('stopSession', () => {
      it('should throw if session does not exist', async () => {
        await expect(service.stopSession('nonexistent')).rejects.toThrow(
          'Session not found: nonexistent'
        );
      });

      it('should update status to terminating', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        await service.stopSession(sessionId);

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            status: 'terminating',
          })
        );
      });

      it('should stop and remove container', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        await service.stopSession(sessionId);

        const mockContainer = (mockDocker.getContainer as any)();
        expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
        expect(mockContainer.remove).toHaveBeenCalled();
      });

      it('should mark session as ended', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        await service.stopSession(sessionId, 'User requested');

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            status: 'ended',
            endedAt: expect.any(String),
            terminationReason: 'User requested',
          })
        );
      });

      it('should emit session:stopped event', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        const eventSpy = vi.fn();
        service.on('session:stopped', eventSpy);

        await service.stopSession(sessionId);

        expect(eventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId,
            reason: 'User requested',
          })
        );
      });

      it('should handle container cleanup errors gracefully', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        const mockContainer = (mockDocker.getContainer as any)();
        mockContainer.stop.mockRejectedValueOnce(new Error('Already stopped'));

        // Should not throw
        await service.stopSession(sessionId);

        // Should still mark as ended
        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            status: 'ended',
          })
        );
      });
    });

    describe('resetSession', () => {
      it('should throw if session does not exist', async () => {
        await expect(service.resetSession('nonexistent')).rejects.toThrow(
          'Session not found: nonexistent'
        );
      });

      it('should stop old container', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        await service.resetSession(sessionId);

        const mockContainer = (mockDocker.getContainer as any)();
        expect(mockContainer.stop).toHaveBeenCalled();
        expect(mockContainer.remove).toHaveBeenCalled();
      });

      it('should update to starting status', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        await service.resetSession(sessionId);

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            status: 'starting',
            containerId: null,
            endedAt: null,
            terminationReason: null,
          })
        );
      });

      it('should create new container', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        const mockContainer = (mockDocker.getContainer as any)();
        mockContainer.start.mockClear();

        await service.resetSession(sessionId);

        expect(mockContainer.start).toHaveBeenCalled();
      });

      it('should update to running status with new containerId', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        await service.resetSession(sessionId);

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            containerId: 'container-123',
            status: 'running',
          })
        );
      });

      it('should emit session:reset event', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        const eventSpy = vi.fn();
        service.on('session:reset', eventSpy);

        await service.resetSession(sessionId);

        expect(eventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId,
            containerId: 'container-123',
          })
        );
      });

      it('should handle old container cleanup errors gracefully', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        const mockContainer = (mockDocker.getContainer as any)();
        mockContainer.stop.mockRejectedValueOnce(new Error('Already stopped'));

        // Should not throw
        const result = await service.resetSession(sessionId);

        expect(result.session.status).toBe('running');
      });

      it('should mark as error if new container fails to start', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        const mockContainer = (mockDocker.getContainer as any)();
        mockContainer.start.mockRejectedValueOnce(new Error('Failed to start'));

        await expect(service.resetSession(sessionId)).rejects.toThrow('Failed to start');

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            status: 'error',
            terminationReason: expect.stringContaining('Reset failed'),
          })
        );
      });
    });
  });

  describe('Graceful Shutdown Support', () => {
    describe('markDisconnected', () => {
      it('should change running session to disconnected', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        await service.markDisconnected(sessionId);

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            status: 'disconnected',
          })
        );
      });

      it('should emit session:disconnected event', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        const eventSpy = vi.fn();
        service.on('session:disconnected', eventSpy);

        await service.markDisconnected(sessionId);

        expect(eventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId,
          })
        );
      });

      it('should do nothing if session does not exist', async () => {
        await service.markDisconnected('nonexistent');

        // Should not throw
        expect(mockDatabase.updateInteractiveSession).not.toHaveBeenCalled();
      });

      it('should only update running sessions', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });
        await service.stopSession(sessionId);

        (mockDatabase.updateInteractiveSession as any).mockClear();

        await service.markDisconnected(sessionId);

        // Should not update non-running session
        expect(mockDatabase.updateInteractiveSession).not.toHaveBeenCalled();
      });
    });

    describe('reconnectSession', () => {
      it('should throw if session does not exist', async () => {
        await expect(service.reconnectSession('nonexistent')).rejects.toThrow(
          'Session not found: nonexistent'
        );
      });

      it('should throw if session is not disconnected or running', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });
        await service.stopSession(sessionId);

        await expect(service.reconnectSession(sessionId)).rejects.toThrow(
          'Cannot reconnect session with status: ended'
        );
      });

      it('should throw if container no longer exists', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });
        await service.markDisconnected(sessionId);

        const mockContainer = (mockDocker.getContainer as any)();
        mockContainer.inspect.mockRejectedValueOnce(new Error('Container not found'));

        await expect(service.reconnectSession(sessionId)).rejects.toThrow(
          'Session container no longer exists'
        );

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            status: 'error',
            terminationReason: 'Container no longer exists',
          })
        );
      });

      it('should throw if container is not running', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });
        await service.markDisconnected(sessionId);

        const mockContainer = (mockDocker.getContainer as any)();
        mockContainer.inspect.mockResolvedValueOnce({
          State: { Running: false },
        });

        await expect(service.reconnectSession(sessionId)).rejects.toThrow(
          'Session container no longer exists'
        );
      });

      it('should update to running status if container still exists', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });
        await service.markDisconnected(sessionId);

        await service.reconnectSession(sessionId);

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            status: 'running',
          })
        );
      });

      it('should emit session:reconnected event', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });
        await service.markDisconnected(sessionId);

        const eventSpy = vi.fn();
        service.on('session:reconnected', eventSpy);

        await service.reconnectSession(sessionId);

        expect(eventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId,
          })
        );
      });
    });

    describe('recoverDisconnectedSessions', () => {
      it('should find disconnected sessions', async () => {
        const { sessionId: id1 } = await service.startSession({ ownerEmail: 'test@example.com' });
        const { sessionId: id2 } = await service.startSession({ ownerEmail: 'test@example.com' });

        await service.markDisconnected(id1);
        await service.markDisconnected(id2);

        await service.recoverDisconnectedSessions();

        // Should attempt to check containers
        expect(mockDocker.getContainer).toHaveBeenCalled();
      });

      it('should keep disconnected status for recoverable sessions', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });
        await service.markDisconnected(sessionId);

        const mockContainer = (mockDocker.getContainer as any)();
        mockContainer.inspect.mockResolvedValueOnce({
          State: { Running: true },
        });

        await service.recoverDisconnectedSessions();

        // Should keep as disconnected (ready for reconnection)
        const session = mockDatabase.getInteractiveSessionById(sessionId);
        expect(session?.status).toBe('disconnected');
      });

      it('should mark as ended if container stopped', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });
        await service.markDisconnected(sessionId);

        const mockContainer = (mockDocker.getContainer as any)();
        mockContainer.inspect.mockResolvedValueOnce({
          State: { Running: false },
        });

        await service.recoverDisconnectedSessions();

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            status: 'ended',
            terminationReason: 'Container stopped during server restart',
          })
        );
      });

      it('should mark as ended if container not found', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });
        await service.markDisconnected(sessionId);

        const mockContainer = (mockDocker.getContainer as any)();
        mockContainer.inspect.mockRejectedValueOnce(new Error('Not found'));

        await service.recoverDisconnectedSessions();

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            status: 'ended',
            terminationReason: 'Container not found after server restart',
          })
        );
      });
    });
  });

  describe('Session Queries', () => {
    describe('getSession', () => {
      it('should return session by id', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        const session = service.getSession(sessionId);

        expect(session).toMatchObject({
          id: sessionId,
          ownerEmail: 'test@example.com',
          status: 'running',
        });
      });

      it('should return null for nonexistent session', () => {
        const session = service.getSession('nonexistent');
        expect(session).toBeNull();
      });
    });

    describe('getActiveSession', () => {
      it('should return running session', async () => {
        await service.startSession({ ownerEmail: 'test@example.com' });

        const active = service.getActiveSession();

        expect(active).toMatchObject({
          status: 'running',
        });
      });

      it('should return null if no active session', () => {
        const active = service.getActiveSession();
        expect(active).toBeNull();
      });
    });

    describe('listSessions', () => {
      it('should return recent sessions with limit', async () => {
        await service.startSession({ ownerEmail: 'user1@example.com' });
        await service.startSession({ ownerEmail: 'user2@example.com' });

        const sessions = service.listSessions(10);

        expect(sessions).toHaveLength(2);
      });
    });
  });

  describe('Activity Tracking', () => {
    describe('recordActivity', () => {
      it('should update lastUserActivityAt timestamp', async () => {
        const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

        service.recordActivity(sessionId);

        expect(mockDatabase.updateInteractiveSession).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            lastUserActivityAt: expect.any(String),
          })
        );
      });
    });
  });

  describe('Container Creation Helper', () => {
    it('should not duplicate container creation code', async () => {
      const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

      // Reset should reuse same container creation logic
      await service.resetSession(sessionId);

      // Both should have called container.start
      const mockContainer = (mockDocker.getContainer as any)();
      expect(mockContainer.start).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle null safety without assertions', async () => {
      await service.startSession({ ownerEmail: 'test@example.com' });

      // Simulate database returning null after creation
      (mockDatabase.getInteractiveSessionById as any).mockReturnValueOnce(null);

      await expect(service.startSession({ ownerEmail: 'test@example.com' })).rejects.toThrow(
        'Session not found after creation'
      );
    });

    it('should consistently mark failed stop operations as ended', async () => {
      const { sessionId } = await service.startSession({ ownerEmail: 'test@example.com' });

      const mockContainer = (mockDocker.getContainer as any)();
      mockContainer.stop.mockRejectedValueOnce(new Error('Stop failed'));

      await service.stopSession(sessionId);

      // Container cleanup errors are handled gracefully - session still marked as ended with original reason
      const session = mockDatabase.getInteractiveSessionById(sessionId);
      expect(session?.status).toBe('ended');
      expect(session?.terminationReason).toBe('User requested');
    });
  });
});
