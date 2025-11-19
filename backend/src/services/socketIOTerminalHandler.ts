/**
 * Socket.IO Terminal Handler
 *
 * Handles interactive terminal sessions over Socket.IO instead of native WebSockets.
 * This provides a unified real-time communication architecture with:
 * - Built-in reconnection and heartbeat
 * - Polling fallback for restricted environments
 * - Type-safe events
 * - Session isolation via Socket.IO rooms
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type Docker from 'dockerode';
import { logger } from '../utils/logger.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/socketEvents.js';

export interface TerminalSession {
  sessionId: string;
  containerId: string;
  exec?: Docker.Exec;
  stream?: NodeJS.ReadWriteStream;
  backlog: TerminalMessage[];
  ready: boolean;
}

export interface TerminalMessage {
  sessionId: string;
  stream: 'stdout' | 'system';
  text: string;
  timestamp: string;
}

export interface SocketIOTerminalHandlerOptions {
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  docker: Docker;
  backlogLimit?: number;
  shellCommand?: string[];
}

export class SocketIOTerminalHandler {
  private readonly io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  private readonly docker: Docker;
  private readonly backlogLimit: number;
  private readonly shellCommand: string[];
  private readonly sessions = new Map<string, TerminalSession>();

  constructor(options: SocketIOTerminalHandlerOptions) {
    this.io = options.io;
    this.docker = options.docker;
    this.backlogLimit = options.backlogLimit ?? 200;
    this.shellCommand = options.shellCommand ?? ['/bin/bash'];

    this.setupSocketHandlers();
  }

  /**
   * Setup Socket.IO event handlers for terminal sessions
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      logger.debug({
        category: 'interactive_terminal',
        action: 'socket_connected',
        message: 'Socket.IO client connected',
        details: { socketId: socket.id },
      });

      // Handle terminal join requests
      socket.on('terminal:join', async ({ sessionId }) => {
        logger.debug({
          category: 'interactive_terminal',
          action: 'join_request',
          message: 'Terminal join request received',
          details: { sessionId, socketId: socket.id },
        });
        await this.handleJoin(socket, sessionId);
      });

      // Handle terminal leave requests
      socket.on('terminal:leave', ({ sessionId }) => {
        this.handleLeave(socket, sessionId);
      });

      // Handle terminal input
      socket.on('terminal:input', ({ sessionId, data }) => {
        this.handleInput(sessionId, data);
      });

      // Handle terminal signals
      socket.on('terminal:signal', ({ sessionId, signal }) => {
        this.handleSignal(sessionId, signal);
      });

      // Handle terminal resize
      socket.on('terminal:resize', ({ sessionId, rows, cols }) => {
        this.handleResize(sessionId, rows, cols);
      });

      // Handle disconnect - leave all terminal sessions
      socket.on('disconnect', () => {
        const terminalSessions = socket.data.terminalSessions || new Set();
        terminalSessions.forEach((sessionId) => {
          this.handleLeave(socket, sessionId);
        });
      });
    });
  }

  /**
   * Handle client joining a terminal session
   */
  private async handleJoin(socket: Socket, sessionId: string): Promise<void> {
    try {
      // Initialize terminal sessions tracking
      if (!socket.data.terminalSessions) {
        socket.data.terminalSessions = new Set();
      }

      // Join the Socket.IO room for this session
      await socket.join(`terminal:${sessionId}`);
      socket.data.terminalSessions.add(sessionId);

      logger.info({
        category: 'interactive_terminal',
        action: 'session_joined',
        message: 'Client joined terminal session',
        details: { sessionId, socketId: socket.id },
      });

      // Send backlog if session exists
      const session = this.sessions.get(sessionId);
      if (session) {
        session.backlog.forEach((msg) => {
          socket.emit('terminal:output', {
            sessionId: msg.sessionId,
            stream: msg.stream,
            text: msg.text,
            timestamp: msg.timestamp,
          });
        });
      }

      // Confirm join
      socket.emit('terminal:joined', { sessionId });
    } catch (error) {
      logger.error({
        category: 'interactive_terminal',
        action: 'join_error',
        message: 'Failed to join terminal session',
        error,
        details: { sessionId },
      });

      socket.emit('terminal:error', {
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle client leaving a terminal session
   */
  private handleLeave(socket: Socket, sessionId: string): void {
    socket.leave(`terminal:${sessionId}`);
    socket.data.terminalSessions?.delete(sessionId);

    logger.info({
      category: 'interactive_terminal',
      action: 'session_left',
      message: 'Client left terminal session',
      details: { sessionId, socketId: socket.id },
    });
  }

  /**
   * Handle terminal input from client
   */
  private handleInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session?.stream) {
      logger.warn({
        category: 'interactive_terminal',
        action: 'input_no_stream',
        message: 'Attempted to send input to session without stream',
        details: { sessionId },
      });
      return;
    }

    try {
      session.stream.write(data);
    } catch (error) {
      logger.error({
        category: 'interactive_terminal',
        action: 'input_error',
        message: 'Failed to write to terminal stream',
        error,
        details: { sessionId },
      });
    }
  }

  /**
   * Handle terminal signal (interrupt/terminate)
   */
  private handleSignal(sessionId: string, signal: 'interrupt' | 'terminate'): void {
    const session = this.sessions.get(sessionId);
    if (!session?.stream) {
      return;
    }

    try {
      if (signal === 'interrupt') {
        // Send SIGINT (Ctrl+C)
        session.stream.write('\x03');
      } else if (signal === 'terminate') {
        // Send EOT (Ctrl+D)
        session.stream.write('\x04');
      }
    } catch (error) {
      logger.error({
        category: 'interactive_terminal',
        action: 'signal_error',
        message: 'Failed to send signal to terminal',
        error,
        details: { sessionId, signal },
      });
    }
  }

  /**
   * Handle terminal resize
   */
  private async handleResize(sessionId: string, rows: number, cols: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.exec) {
      return;
    }

    // Validate dimensions
    if (!Number.isInteger(rows) || !Number.isInteger(cols) ||
        rows < 1 || cols < 1 || rows > 1000 || cols > 1000) {
      logger.warn({
        category: 'interactive_terminal',
        action: 'invalid_resize',
        message: 'Invalid terminal dimensions',
        details: { sessionId, rows, cols },
      });
      return;
    }

    try {
      await session.exec.resize({ h: rows, w: cols });
      logger.debug({
        category: 'interactive_terminal',
        action: 'resized',
        message: 'Terminal resized',
        details: { sessionId, rows, cols },
      });
    } catch (error) {
      logger.error({
        category: 'interactive_terminal',
        action: 'resize_error',
        message: 'Failed to resize terminal',
        error,
        details: { sessionId, rows, cols },
      });
    }
  }

  /**
   * Start a new terminal session
   */
  async startSession(sessionId: string, containerId: string): Promise<void> {
    logger.info({
      category: 'interactive_terminal',
      action: 'start_session_called',
      message: 'Starting terminal session',
      details: { sessionId, containerId },
    });

    try {
      const container = this.docker.getContainer(containerId);

      // Create exec instance
      const exec = await container.exec({
        Cmd: this.shellCommand,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
      });

      // Start exec and get stream
      const stream = await exec.start({
        hijack: true,
        stdin: true,
        Tty: true,
      });

      // Create session
      const session: TerminalSession = {
        sessionId,
        containerId,
        exec,
        stream,
        backlog: [],
        ready: true,
      };

      this.sessions.set(sessionId, session);

      // Handle stream data
      stream.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        const message: TerminalMessage = {
          sessionId,
          stream: 'stdout',
          text,
          timestamp: new Date().toISOString(),
        };

        // Add to backlog
        session.backlog.push(message);
        if (session.backlog.length > this.backlogLimit) {
          session.backlog.shift();
        }

        // Broadcast to all clients in this session's room
        this.io.to(`terminal:${sessionId}`).emit('terminal:output', {
          sessionId: message.sessionId,
          stream: message.stream,
          text: message.text,
          timestamp: message.timestamp,
        });
      });

      // Handle stream end
      stream.on('end', () => {
        this.io.to(`terminal:${sessionId}`).emit('terminal:status', {
          sessionId,
          state: 'ended',
        });
        this.sessions.delete(sessionId);
      });

      // Handle stream errors
      stream.on('error', (error: Error) => {
        logger.error({
          category: 'interactive_terminal',
          action: 'stream_error',
          message: 'Terminal stream error',
          error,
          details: { sessionId },
        });

        // Emit error first
        this.io.to(`terminal:${sessionId}`).emit('terminal:error', {
          sessionId,
          message: error.message,
        });

        // Then emit ended status and cleanup
        this.io.to(`terminal:${sessionId}`).emit('terminal:status', {
          sessionId,
          state: 'ended',
          reason: 'Stream error',
        });

        this.sessions.delete(sessionId);
      });

      // Notify clients that session is ready
      this.io.to(`terminal:${sessionId}`).emit('terminal:status', {
        sessionId,
        state: 'connected',
      });

      logger.info({
        category: 'interactive_terminal',
        action: 'session_started',
        message: 'Terminal session started',
        details: { sessionId, containerId },
      });
    } catch (error) {
      // Clean up session if it was added to prevent memory leak
      this.sessions.delete(sessionId);

      logger.error({
        category: 'interactive_terminal',
        action: 'start_error',
        message: 'Failed to start terminal session',
        error,
        details: { sessionId, containerId },
      });

      this.io.to(`terminal:${sessionId}`).emit('terminal:error', {
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Stop a terminal session
   */
  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Remove from map first to prevent duplicate stops and avoid memory leak
    this.sessions.delete(sessionId);

    try {
      if (session.stream && 'destroy' in session.stream && typeof session.stream.destroy === 'function') {
        session.stream.destroy();
      }

      this.io.to(`terminal:${sessionId}`).emit('terminal:status', {
        sessionId,
        state: 'ended',
        reason: 'Session stopped',
      });

      logger.info({
        category: 'interactive_terminal',
        action: 'session_stopped',
        message: 'Terminal session stopped',
        details: { sessionId },
      });
    } catch (error) {
      logger.error({
        category: 'interactive_terminal',
        action: 'stop_error',
        message: 'Failed to stop terminal session',
        error,
        details: { sessionId },
      });
    }
  }

  /**
   * Get active session
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): TerminalSession[] {
    return Array.from(this.sessions.values());
  }
}
