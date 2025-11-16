/**
 * Interactive Terminal Gateway - V0
 *
 * WebSocket gateway for interactive terminal sessions using Socket.IO.
 * Handles PTY streams, graceful shutdown, and session reconnection.
 *
 * Key Features:
 * - PTY stream management (stdin, stdout, stderr)
 * - Graceful shutdown with session disconnection
 * - Container lifecycle integration
 * - Automatic reconnection support
 *
 * Architecture:
 * - Uses Socket.IO for bidirectional communication
 * - Integrates with InteractiveTerminalService for session management
 * - Responds to server_migration events for graceful shutdown
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type Docker from 'dockerode';
import { logger } from '../utils/logger.js';
import type { InteractiveTerminalService } from './interactiveTerminal.service.js';

export interface InteractiveTerminalGatewayOptions {
  io: SocketIOServer;
  terminalService: InteractiveTerminalService;
  docker: Docker;
}

/**
 * Interactive Terminal Gateway
 *
 * Manages WebSocket connections for interactive terminal sessions.
 * Handles PTY streams and graceful shutdown during server restarts.
 */
export class InteractiveTerminalGateway {
  private io: SocketIOServer;
  private terminalService: InteractiveTerminalService;
  private docker: Docker;
  private activeStreams: Map<string, { exec: Docker.Exec; socket: Socket }>;
  private isShuttingDown: boolean;

  constructor(options: InteractiveTerminalGatewayOptions) {
    this.io = options.io;
    this.terminalService = options.terminalService;
    this.docker = options.docker;
    this.activeStreams = new Map();
    this.isShuttingDown = false;
  }

  /**
   * Initialize the gateway and set up Socket.IO event handlers
   */
  initialize(): void {
    logger.info({
      category: 'interactive_terminal',
      action: 'gateway_initialized',
      message: 'Interactive terminal gateway initialized',
    });

    // Set up Socket.IO namespace for interactive terminals
    const terminalNamespace = this.io.of('/terminal');

    terminalNamespace.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle new Socket.IO connection
   */
  private handleConnection(socket: Socket): void {
    logger.info({
      category: 'interactive_terminal',
      action: 'client_connected',
      message: 'Interactive terminal client connected',
      details: { socketId: socket.id },
    });

    // Attach session ID from handshake query
    const sessionId = socket.handshake.query.sessionId as string | undefined;

    if (!sessionId) {
      logger.warn({
        category: 'interactive_terminal',
        action: 'connection_rejected',
        message: 'Connection rejected - no session ID provided',
        details: { socketId: socket.id },
      });
      socket.emit('error', { message: 'Session ID required' });
      socket.disconnect();
      return;
    }

    // Verify session exists
    const session = this.terminalService.getSession(sessionId);
    if (!session) {
      logger.warn({
        category: 'interactive_terminal',
        action: 'connection_rejected',
        message: 'Connection rejected - session not found',
        details: { socketId: socket.id, sessionId },
      });
      socket.emit('error', { message: 'Session not found' });
      socket.disconnect();
      return;
    }

    // Verify session has container ID
    if (!session.containerId) {
      logger.warn({
        category: 'interactive_terminal',
        action: 'connection_rejected',
        message: 'Connection rejected - session has no container',
        details: { socketId: socket.id, sessionId },
      });
      socket.emit('error', { message: 'Session has no container' });
      socket.disconnect();
      return;
    }

    // Store session ID in socket data
    socket.data.sessionId = sessionId;

    // Set up event handlers
    this.setupSocketHandlers(socket, sessionId);

    // Start PTY stream
    this.startPtyStream(socket, sessionId, session.containerId);
  }

  /**
   * Set up Socket.IO event handlers for a session
   */
  private setupSocketHandlers(socket: Socket, sessionId: string): void {
    // Handle terminal input from client
    socket.on('terminal:input', async (data: { input: string }) => {
      try {
        await this.handleTerminalInput(sessionId, data.input);
        this.terminalService.recordActivity(sessionId);
      } catch (error) {
        logger.error({
          category: 'interactive_terminal',
          action: 'input_error',
          message: 'Failed to send terminal input',
          details: { sessionId },
          error,
        });
        socket.emit('terminal:error', {
          message: 'Failed to send input',
        });
      }
    });

    // Handle terminal resize
    socket.on('terminal:resize', async (data: { rows: number; cols: number }) => {
      try {
        await this.handleTerminalResize(sessionId, data.rows, data.cols);
      } catch (error) {
        logger.error({
          category: 'interactive_terminal',
          action: 'resize_error',
          message: 'Failed to resize terminal',
          details: { sessionId, rows: data.rows, cols: data.cols },
          error,
        });
      }
    });

    // Handle client disconnect
    socket.on('disconnect', () => {
      this.handleDisconnect(socket, sessionId);
    });
  }

  /**
   * Start PTY stream for a session
   */
  private async startPtyStream(
    socket: Socket,
    sessionId: string,
    containerId: string
  ): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);

      // Create exec instance for PTY
      const exec = await container.exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: ['/bin/bash'], // Interactive shell
        Env: ['TERM=xterm-256color'],
      });

      // Start exec and get stream
      const stream = await exec.start({
        Tty: true,
        stdin: true,
      });

      // Store active stream
      this.activeStreams.set(sessionId, { exec, socket });

      // Define event handlers
      const onData = (chunk: Buffer) => {
        if (!this.isShuttingDown) {
          socket.emit('terminal:output', {
            output: chunk.toString('utf8'),
          });
        }
      };

      const onEnd = () => {
        logger.info({
          category: 'interactive_terminal',
          action: 'stream_ended',
          message: 'PTY stream ended',
          details: { sessionId },
        });
        this.activeStreams.delete(sessionId);
        socket.emit('terminal:ended', {});
        // Clean up listeners
        stream.removeListener('data', onData);
        stream.removeListener('error', onError);
      };

      const onError = (error: Error) => {
        logger.error({
          category: 'interactive_terminal',
          action: 'stream_error',
          message: 'PTY stream error',
          details: { sessionId },
          error,
        });
        this.activeStreams.delete(sessionId);
        socket.emit('terminal:error', {
          message: 'Stream error occurred',
        });
        // Clean up listeners
        stream.removeListener('data', onData);
        stream.removeListener('end', onEnd);
      };

      // Attach event listeners
      stream.on('data', onData);
      stream.on('end', onEnd);
      stream.on('error', onError);

      // Store stream for input handling
      socket.data.stream = stream;

      logger.info({
        category: 'interactive_terminal',
        action: 'stream_started',
        message: 'PTY stream started successfully',
        details: { sessionId, containerId },
      });

      socket.emit('terminal:ready', {});
    } catch (error) {
      logger.error({
        category: 'interactive_terminal',
        action: 'stream_start_failed',
        message: 'Failed to start PTY stream',
        details: { sessionId, containerId },
        error,
      });
      socket.emit('terminal:error', {
        message: 'Failed to start terminal stream',
      });
    }
  }

  /**
   * Handle terminal input from client
   */
  private async handleTerminalInput(sessionId: string, input: string): Promise<void> {
    const streamData = this.activeStreams.get(sessionId);
    if (!streamData) {
      throw new Error('No active stream for session');
    }

    const { socket } = streamData;
    const stream = socket.data.stream as NodeJS.ReadWriteStream;

    if (!stream) {
      throw new Error('Stream not available');
    }

    // Write input to container stdin
    stream.write(input);
  }

  /**
   * Handle terminal resize
   */
  private async handleTerminalResize(
    sessionId: string,
    rows: number,
    cols: number
  ): Promise<void> {
    const streamData = this.activeStreams.get(sessionId);
    if (!streamData) {
      throw new Error('No active stream for session');
    }

    const { exec } = streamData;

    try {
      // Resize the PTY
      await exec.resize({ h: rows, w: cols });

      logger.debug({
        category: 'interactive_terminal',
        action: 'terminal_resized',
        message: 'Terminal resized',
        details: { sessionId, rows, cols },
      });
    } catch (error) {
      logger.warn({
        category: 'interactive_terminal',
        action: 'resize_failed',
        message: 'Failed to resize terminal',
        details: { sessionId, rows, cols },
        error,
      });
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(socket: Socket, sessionId: string): void {
    logger.info({
      category: 'interactive_terminal',
      action: 'client_disconnected',
      message: 'Interactive terminal client disconnected',
      details: { socketId: socket.id, sessionId },
    });

    // Clean up stream
    const stream = socket.data.stream as NodeJS.ReadWriteStream;
    if (stream) {
      try {
        stream.end();
      } catch (error) {
        logger.warn({
          category: 'interactive_terminal',
          action: 'stream_cleanup_error',
          message: 'Error cleaning up stream',
          details: { sessionId },
          error,
        });
      }
    }

    // Remove from active streams
    this.activeStreams.delete(sessionId);
  }

  /**
   * Gracefully shutdown all active sessions
   * Called during server shutdown to mark sessions as disconnected
   */
  async gracefulShutdown(): Promise<void> {
    this.isShuttingDown = true;

    logger.info({
      category: 'interactive_terminal',
      action: 'shutdown_started',
      message: 'Starting graceful shutdown of interactive terminal gateway',
      details: { activeSessions: this.activeStreams.size },
    });

    // Mark all active sessions as disconnected
    const disconnectPromises: Promise<void>[] = [];

    for (const [sessionId] of this.activeStreams) {
      disconnectPromises.push(
        this.terminalService
          .markDisconnected(sessionId)
          .catch((error) => {
            logger.error({
              category: 'interactive_terminal',
              action: 'disconnect_failed',
              message: 'Failed to mark session as disconnected',
              details: { sessionId },
              error,
            });
          })
      );
    }

    await Promise.all(disconnectPromises);

    // Close all streams
    for (const [sessionId, { socket }] of this.activeStreams) {
      try {
        const stream = socket.data.stream as NodeJS.ReadWriteStream;
        if (stream) {
          stream.end();
        }
      } catch (error) {
        logger.warn({
          category: 'interactive_terminal',
          action: 'stream_close_error',
          message: 'Error closing stream during shutdown',
          details: { sessionId },
          error,
        });
      }
    }

    // Clear active streams
    this.activeStreams.clear();

    logger.info({
      category: 'interactive_terminal',
      action: 'shutdown_completed',
      message: 'Interactive terminal gateway shutdown completed',
    });
  }
}
