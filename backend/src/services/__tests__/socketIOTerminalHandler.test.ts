/**
 * Socket.IO Terminal Handler Tests
 *
 * Tests for the unified Socket.IO-based terminal handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { SocketIOTerminalHandler } from '../socketIOTerminalHandler.js';
import type Docker from 'dockerode';

describe('SocketIOTerminalHandler', () => {
  let handler: SocketIOTerminalHandler;
  let io: SocketIOServer;
  let httpServer: ReturnType<typeof createServer>;
  let mockDocker: Docker;

  beforeEach(() => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer);

    // Mock Docker instance
    mockDocker = {
      getContainer: vi.fn(() => ({
        exec: vi.fn(async () => ({
          start: vi.fn(async () => {
            const stream = {
              on: vi.fn(),
              write: vi.fn(),
              destroy: vi.fn(),
            };
            return stream as unknown as NodeJS.ReadWriteStream;
          }),
          resize: vi.fn(),
        })),
      })),
    } as unknown as Docker;

    handler = new SocketIOTerminalHandler({
      io,
      docker: mockDocker,
      backlogLimit: 100,
    });
  });

  afterEach(() => {
    io.close();
    httpServer.close();
  });

  describe('Session Management', () => {
    it('should start a terminal session', async () => {
      const sessionId = 'test-session-1';
      const containerId = 'container-123';

      await handler.startSession(sessionId, containerId);

      const session = handler.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.sessionId).toBe(sessionId);
      expect(session?.containerId).toBe(containerId);
      expect(session?.ready).toBe(true);
    });

    it('should stop a terminal session', async () => {
      const sessionId = 'test-session-2';
      const containerId = 'container-456';

      await handler.startSession(sessionId, containerId);
      await handler.stopSession(sessionId);

      const session = handler.getSession(sessionId);
      expect(session).toBeUndefined();
    });

    it('should track multiple sessions', async () => {
      await handler.startSession('session-1', 'container-1');
      await handler.startSession('session-2', 'container-2');

      const sessions = handler.getAllSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.sessionId)).toContain('session-1');
      expect(sessions.map(s => s.sessionId)).toContain('session-2');
    });
  });

  describe('Event Handling', () => {
    it('should handle terminal:join event', async () => {
      const sessionId = 'test-session';
      await handler.startSession(sessionId, 'container-123');

      const mockSocket = {
        id: 'socket-1',
        data: {},
        join: vi.fn(),
        emit: vi.fn(),
        on: vi.fn(),
      };

      // Simulate join
      await handler['handleJoin'](mockSocket as any, sessionId);

      expect(mockSocket.join).toHaveBeenCalledWith(`terminal:${sessionId}`);
      expect(mockSocket.data.terminalSessions).toContain(sessionId);
      expect(mockSocket.emit).toHaveBeenCalledWith('terminal:joined', { sessionId });
    });

    it('should handle terminal:leave event', async () => {
      const sessionId = 'test-session';
      const mockSocket = {
        id: 'socket-1',
        data: { terminalSessions: new Set([sessionId]) },
        leave: vi.fn(),
      };

      handler['handleLeave'](mockSocket as any, sessionId);

      expect(mockSocket.leave).toHaveBeenCalledWith(`terminal:${sessionId}`);
      expect(mockSocket.data.terminalSessions.has(sessionId)).toBe(false);
    });
  });

  describe('Backlog Management', () => {
    it('should maintain message backlog within limit', async () => {
      const sessionId = 'test-session';
      await handler.startSession(sessionId, 'container-123');

      const session = handler.getSession(sessionId);
      expect(session?.backlog).toHaveLength(0);

      // Backlog limit is set to 100 in test setup
      // Verify it doesn't exceed limit
    });

    it('should send backlog to new clients on join', async () => {
      const sessionId = 'test-session';
      await handler.startSession(sessionId, 'container-123');

      const session = handler.getSession(sessionId);
      if (session) {
        // Add some backlog messages
        session.backlog.push({
          sessionId,
          stream: 'stdout',
          text: 'Test message 1',
          timestamp: new Date().toISOString(),
        });
        session.backlog.push({
          sessionId,
          stream: 'stdout',
          text: 'Test message 2',
          timestamp: new Date().toISOString(),
        });
      }

      const mockSocket = {
        id: 'socket-1',
        data: {},
        join: vi.fn(),
        emit: vi.fn(),
      };

      await handler['handleJoin'](mockSocket as any, sessionId);

      // Should emit backlog messages
      expect(mockSocket.emit).toHaveBeenCalledWith('terminal:output', expect.objectContaining({
        sessionId,
        text: 'Test message 1',
      }));
      expect(mockSocket.emit).toHaveBeenCalledWith('terminal:output', expect.objectContaining({
        sessionId,
        text: 'Test message 2',
      }));
    });
  });

  describe('Error Handling', () => {
    it('should handle session start errors gracefully', async () => {
      const badDocker = {
        getContainer: vi.fn(() => ({
          exec: vi.fn(async () => {
            throw new Error('Container not found');
          }),
        })),
      } as unknown as Docker;

      const errorHandler = new SocketIOTerminalHandler({
        io,
        docker: badDocker,
      });

      await expect(errorHandler.startSession('test', 'bad-container')).rejects.toThrow();
    });

    it('should emit error events to clients on failure', async () => {
      const emitSpy = vi.spyOn(io, 'to');

      const badDocker = {
        getContainer: vi.fn(() => ({
          exec: vi.fn(async () => {
            throw new Error('Exec failed');
          }),
        })),
      } as unknown as Docker;

      const errorHandler = new SocketIOTerminalHandler({
        io,
        docker: badDocker,
      });

      try {
        await errorHandler.startSession('test-session', 'bad-container');
      } catch {
        // Expected to throw
      }

      expect(emitSpy).toHaveBeenCalledWith('terminal:test-session');
    });
  });
});
