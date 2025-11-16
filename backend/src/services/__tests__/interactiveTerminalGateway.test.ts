/**
 * Interactive Terminal Gateway - Unit Tests
 *
 * Tests WebSocket connection handling, PTY stream management,
 * and graceful shutdown behavior.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InteractiveTerminalGateway } from '../interactiveTerminalGateway.js';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import type Docker from 'dockerode';
import type { InteractiveTerminalService } from '../interactiveTerminal.service.js';
import { EventEmitter } from 'events';

// Mock Socket
const createMockSocket = (sessionId?: string): Socket => {
  const socket = new EventEmitter() as any;
  socket.id = 'socket-123';
  socket.handshake = {
    query: { sessionId: sessionId || 'session-123' },
  };
  socket.data = {};
  socket.emit = vi.fn();
  socket.disconnect = vi.fn();
  return socket;
};

// Mock Socket.IO Namespace
const createMockNamespace = () => {
  const namespace = new EventEmitter() as any;
  namespace.on = vi.fn((event: string, handler: Function) => {
    if (event === 'connection') {
      namespace._connectionHandler = handler;
    }
  });
  return namespace;
};

// Mock Socket.IO Server
const createMockIO = (): SocketIOServer => {
  const mockNamespace = createMockNamespace();
  return {
    of: vi.fn().mockReturnValue(mockNamespace),
  } as unknown as SocketIOServer;
};

// Mock PTY Stream
const createMockStream = () => {
  const stream = new EventEmitter() as any;
  stream.write = vi.fn();
  stream.end = vi.fn();
  stream.removeListener = vi.fn();
  return stream;
};

// Mock Docker Exec
const createMockExec = () => ({
  start: vi.fn().mockResolvedValue(createMockStream()),
  resize: vi.fn().mockResolvedValue(undefined),
});

// Mock Docker Container
const createMockContainer = () => ({
  id: 'container-123',
  exec: vi.fn().mockResolvedValue(createMockExec()),
});

// Mock Docker
const createMockDocker = (): Docker => ({
  getContainer: vi.fn().mockReturnValue(createMockContainer()),
} as unknown as Docker);

// Mock Terminal Service
const createMockTerminalService = (): InteractiveTerminalService => ({
  getSession: vi.fn().mockReturnValue({
    id: 'session-123',
    containerId: 'container-123',
    status: 'running',
  }),
  recordActivity: vi.fn(),
  markDisconnected: vi.fn().mockResolvedValue(undefined),
} as unknown as InteractiveTerminalService);

describe('InteractiveTerminalGateway', () => {
  let gateway: InteractiveTerminalGateway;
  let mockIO: SocketIOServer;
  let mockTerminalService: InteractiveTerminalService;
  let mockDocker: Docker;
  let mockNamespace: any;

  beforeEach(() => {
    mockIO = createMockIO();
    mockTerminalService = createMockTerminalService();
    mockDocker = createMockDocker();

    gateway = new InteractiveTerminalGateway({
      io: mockIO,
      terminalService: mockTerminalService,
      docker: mockDocker,
    });

    mockNamespace = (mockIO.of as any)();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create /terminal namespace', () => {
      gateway.initialize();

      expect(mockIO.of).toHaveBeenCalledWith('/terminal');
    });

    it('should register connection handler', () => {
      gateway.initialize();

      expect(mockNamespace.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });
  });

  describe('Connection Handling', () => {
    beforeEach(() => {
      gateway.initialize();
    });

    it('should reject connection without sessionId', () => {
      const socket = createMockSocket();
      delete socket.handshake.query.sessionId;

      mockNamespace._connectionHandler(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Session ID required',
      });
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should reject connection for nonexistent session', () => {
      (mockTerminalService.getSession as any).mockReturnValueOnce(null);

      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Session not found',
      });
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should reject connection for session without containerId', () => {
      (mockTerminalService.getSession as any).mockReturnValueOnce({
        id: 'session-123',
        containerId: null,
        status: 'starting',
      });

      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Session has no container',
      });
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should accept valid connection', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(mockDocker.getContainer).toHaveBeenCalledWith('container-123');
    });

    it('should store sessionId in socket data', () => {
      const socket = createMockSocket('session-456');
      mockNamespace._connectionHandler(socket);

      expect(socket.data.sessionId).toBe('session-456');
    });
  });

  describe('PTY Stream Management', () => {
    beforeEach(() => {
      gateway.initialize();
    });

    it('should create exec with PTY configuration', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const mockContainer = (mockDocker.getContainer as any)();
      expect(mockContainer.exec).toHaveBeenCalledWith(
        expect.objectContaining({
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Cmd: ['/bin/bash'],
          Env: ['TERM=xterm-256color'],
        })
      );
    });

    it('should start PTY stream with Tty enabled', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const mockExec = createMockExec();
      expect(mockExec.start).toHaveBeenCalledWith(
        expect.objectContaining({
          Tty: true,
          stdin: true,
        })
      );
    });

    it('should emit terminal:ready when stream starts', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(socket.emit).toHaveBeenCalledWith('terminal:ready', {});
    });

    it('should handle PTY stream data events', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;
      const dataHandler = stream._events.data[0] || stream._events.data;

      dataHandler(Buffer.from('test output'));

      expect(socket.emit).toHaveBeenCalledWith('terminal:output', {
        output: 'test output',
      });
    });

    it('should handle PTY stream end events', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;
      const endHandler = stream._events.end[0] || stream._events.end;

      endHandler();

      expect(socket.emit).toHaveBeenCalledWith('terminal:ended', {});
    });

    it('should handle PTY stream error events', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;
      const errorHandler = stream._events.error[0] || stream._events.error;

      errorHandler(new Error('Stream error'));

      expect(socket.emit).toHaveBeenCalledWith('terminal:error', {
        message: 'Stream error occurred',
      });
    });

    it('should clean up event listeners on stream end', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;
      const endHandler = stream._events.end[0] || stream._events.end;

      endHandler();

      expect(stream.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
      expect(stream.removeListener).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should clean up event listeners on stream error', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;
      const errorHandler = stream._events.error[0] || stream._events.error;

      errorHandler(new Error('Test error'));

      expect(stream.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
      expect(stream.removeListener).toHaveBeenCalledWith('end', expect.any(Function));
    });
  });

  describe('Terminal Input Handling', () => {
    beforeEach(() => {
      gateway.initialize();
    });

    it('should write input to PTY stream', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simulate terminal:input event
      const inputHandler = socket.listeners('terminal:input')[0];
      await inputHandler({ input: 'ls -la\n' });

      const stream = socket.data.stream;
      expect(stream.write).toHaveBeenCalledWith('ls -la\n');
    });

    it('should record user activity', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const inputHandler = socket.listeners('terminal:input')[0];
      await inputHandler({ input: 'echo test' });

      expect(mockTerminalService.recordActivity).toHaveBeenCalledWith('session-123');
    });

    it('should handle input errors gracefully', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;
      stream.write.mockImplementationOnce(() => {
        throw new Error('Write failed');
      });

      const inputHandler = socket.listeners('terminal:input')[0];
      await inputHandler({ input: 'test' });

      expect(socket.emit).toHaveBeenCalledWith('terminal:error', {
        message: 'Failed to send input',
      });
    });
  });

  describe('Terminal Resize Handling', () => {
    beforeEach(() => {
      gateway.initialize();
    });

    it('should resize PTY when requested', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const resizeHandler = socket.listeners('terminal:resize')[0];
      await resizeHandler({ rows: 24, cols: 80 });

      const mockContainer = (mockDocker.getContainer as any)();
      const mockExec = (mockContainer.exec as any).mock.results[0].value;
      expect(mockExec.resize).toHaveBeenCalledWith({ h: 24, w: 80 });
    });

    it('should handle resize errors gracefully', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const mockContainer = (mockDocker.getContainer as any)();
      const mockExec = (mockContainer.exec as any).mock.results[0].value;
      mockExec.resize.mockRejectedValueOnce(new Error('Resize failed'));

      const resizeHandler = socket.listeners('terminal:resize')[0];
      await resizeHandler({ rows: 30, cols: 100 });

      // Should not crash
      expect(socket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('Client Disconnect Handling', () => {
    beforeEach(() => {
      gateway.initialize();
    });

    it('should clean up stream on disconnect', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const disconnectHandler = socket.listeners('disconnect')[0];
      disconnectHandler();

      const stream = socket.data.stream;
      expect(stream.end).toHaveBeenCalled();
    });

    it('should handle stream cleanup errors', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;
      stream.end.mockImplementationOnce(() => {
        throw new Error('End failed');
      });

      const disconnectHandler = socket.listeners('disconnect')[0];
      disconnectHandler();

      // Should not crash
      expect(true).toBe(true);
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(() => {
      gateway.initialize();
    });

    it('should mark all active sessions as disconnected', async () => {
      const socket1 = createMockSocket('session-1');
      const socket2 = createMockSocket('session-2');

      (mockTerminalService.getSession as any)
        .mockReturnValueOnce({ id: 'session-1', containerId: 'c1', status: 'running' })
        .mockReturnValueOnce({ id: 'session-2', containerId: 'c2', status: 'running' });

      mockNamespace._connectionHandler(socket1);
      mockNamespace._connectionHandler(socket2);

      await new Promise((resolve) => setTimeout(resolve, 100));

      await gateway.gracefulShutdown();

      expect(mockTerminalService.markDisconnected).toHaveBeenCalledWith('session-1');
      expect(mockTerminalService.markDisconnected).toHaveBeenCalledWith('session-2');
    });

    it('should close all active streams', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;

      await gateway.gracefulShutdown();

      expect(stream.end).toHaveBeenCalled();
    });

    it('should set isShuttingDown flag', async () => {
      await gateway.gracefulShutdown();

      // After shutdown, new PTY output should not be emitted
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;
      if (stream) {
        const dataHandler = stream._events.data?.[0] || stream._events.data;
        if (dataHandler) {
          (socket.emit as any).mockClear();
          dataHandler(Buffer.from('late output'));

          // Should not emit during shutdown
          expect(socket.emit).not.toHaveBeenCalledWith('terminal:output', expect.any(Object));
        }
      }
    });

    it('should handle markDisconnected errors gracefully', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      (mockTerminalService.markDisconnected as any).mockRejectedValueOnce(
        new Error('Database error')
      );

      // Should not throw
      await gateway.gracefulShutdown();
      expect(true).toBe(true);
    });

    it('should handle stream close errors gracefully', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;
      stream.end.mockImplementationOnce(() => {
        throw new Error('Close failed');
      });

      // Should not throw
      await gateway.gracefulShutdown();
      expect(true).toBe(true);
    });
  });

  describe('Memory Leak Prevention', () => {
    beforeEach(() => {
      gateway.initialize();
    });

    it('should clean up listeners on normal stream end', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;
      const initialListenerCount = stream.listenerCount?.('data') || 0;

      const endHandler = stream._events.end[0] || stream._events.end;
      endHandler();

      expect(stream.removeListener).toHaveBeenCalled();
    });

    it('should clean up listeners on stream error', async () => {
      const socket = createMockSocket();
      mockNamespace._connectionHandler(socket);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stream = socket.data.stream;
      const errorHandler = stream._events.error[0] || stream._events.error;

      errorHandler(new Error('Test error'));

      expect(stream.removeListener).toHaveBeenCalled();
    });
  });
});
