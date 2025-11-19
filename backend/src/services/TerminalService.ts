/**
 * Terminal Service - tmux-based persistent terminal sessions
 *
 * This service provides terminal session management using tmux for persistence.
 * Sessions survive WebSocket disconnects and can be reconnected.
 *
 * Architecture:
 * - tmux provides session persistence (sessions continue even when disconnected)
 * - node-pty provides PTY interface for spawning/attaching to tmux sessions
 * - Socket.IO provides real-time bidirectional communication with frontend
 *
 * Key features:
 * - Sessions persist across WebSocket disconnects
 * - Multiple clients can attach to the same session
 * - Simple, maintainable codebase (~200 lines vs ~1800)
 */

import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';

export interface TerminalSession {
  id: string;
  tmuxSessionName: string;
  ptyProcess: pty.IPty | null;
  createdAt: Date;
  lastActivity: Date;
  connectedClients: Set<string>;
}

export interface TerminalServiceConfig {
  io: SocketIOServer;
  idleTimeoutMs?: number;
  shellCommand?: string;
}

/**
 * TerminalService manages persistent terminal sessions using tmux
 */
export class TerminalService extends EventEmitter {
  private io: SocketIOServer;
  private sessions: Map<string, TerminalSession> = new Map();
  private idleTimeoutMs: number;
  private shellCommand: string;
  private idleCheckInterval: NodeJS.Timeout | null = null;
  private validSessionIds: Set<string> = new Set();

  constructor(config: TerminalServiceConfig) {
    super();
    this.io = config.io;
    this.idleTimeoutMs = config.idleTimeoutMs ?? 30 * 60 * 1000; // 30 minutes default
    this.shellCommand = config.shellCommand ?? '/bin/bash';

    // Verify tmux is available
    this.verifyTmuxAvailable();

    this.setupSocketIO();
    this.startIdleWatchdog();

    logger.info({
      category: 'interactive_terminal',
      action: 'service_initialized',
      message: 'TerminalService initialized',
      details: {
        idleTimeoutMs: this.idleTimeoutMs,
        shellCommand: this.shellCommand,
      }
    });
  }

  /**
   * Verify tmux is available on the system
   */
  private verifyTmuxAvailable(): void {
    try {
      const checkProcess = pty.spawn('which', ['tmux'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
      });

      checkProcess.onExit(({ exitCode }) => {
        if (exitCode !== 0) {
          logger.error({
            category: 'interactive_terminal',
            action: 'tmux_not_found',
            message: 'tmux is not installed or not in PATH',
            error: 'tmux command not found'
          });
          throw new Error('tmux is required but not installed');
        }
      });
    } catch (error) {
      logger.error({
        category: 'interactive_terminal',
        action: 'tmux_verification_failed',
        message: 'Failed to verify tmux availability',
        error
      });
      throw error;
    }
  }

  /**
   * Sanitize session ID to prevent command injection
   */
  private sanitizeSessionId(sessionId: string): string {
    // Only allow alphanumeric characters, hyphens, and underscores
    return sessionId.replace(/[^a-zA-Z0-9-_]/g, '');
  }

  /**
   * Validate session ID exists in our whitelist
   */
  private isValidSessionId(sessionId: string): boolean {
    return this.validSessionIds.has(sessionId);
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupSocketIO(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info({
        category: 'interactive_terminal',
        action: 'client_connected',
        message: 'Client connected to terminal service',
        details: { socketId: socket.id }
      });

      socket.on('terminal:create', () => this.handleCreate(socket));
      socket.on('terminal:attach', (sessionId: string) => this.handleAttach(socket, sessionId));
      socket.on('terminal:input', (data: string) => this.handleInput(socket, data));
      socket.on('terminal:resize', (cols: number, rows: number) => this.handleResize(socket, cols, rows));
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  /**
   * Handle terminal:create - create a new tmux session
   */
  private async handleCreate(socket: Socket): Promise<void> {
    try {
      const sessionId = this.generateSessionId();
      const sanitizedId = this.sanitizeSessionId(sessionId);
      const tmuxSessionName = `terminal-${sanitizedId}`;

      // Add to whitelist
      this.validSessionIds.add(sanitizedId);

      logger.info({
        category: 'interactive_terminal',
        action: 'session_create',
        message: 'Creating terminal session',
        details: { sessionId: sanitizedId, tmuxSessionName }
      });

      // Create new tmux session with error handling
      const ptyProcess = pty.spawn('tmux', ['new-session', '-s', tmuxSessionName, this.shellCommand], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env as { [key: string]: string },
      });

      // Store session
      const session: TerminalSession = {
        id: sanitizedId,
        tmuxSessionName,
        ptyProcess,
        createdAt: new Date(),
        lastActivity: new Date(),
        connectedClients: new Set([socket.id]),
      };
      this.sessions.set(sanitizedId, session);

      // Forward output to socket
      ptyProcess.onData((data: string) => {
        socket.emit('terminal:output', data);
        session.lastActivity = new Date();
      });

      // Handle process exit
      ptyProcess.onExit(({ exitCode }) => {
        logger.info({
          category: 'interactive_terminal',
          action: 'process_exited',
          message: 'Terminal process exited',
          details: { sessionId: sanitizedId, exitCode }
        });
        socket.emit('terminal:closed', { exitCode });
        this.cleanupSession(sanitizedId);
      });

      // Notify client of successful creation
      socket.emit('terminal:created', { sessionId: sanitizedId });
      socket.data.sessionId = sanitizedId;

      this.emit('sessionCreated', session);
    } catch (error) {
      logger.error({
        category: 'interactive_terminal',
        action: 'session_create_failed',
        message: 'Failed to create terminal session',
        error
      });
      socket.emit('terminal:error', { message: 'Failed to create terminal session' });
    }
  }

  /**
   * Handle terminal:attach - attach to existing tmux session
   */
  private async handleAttach(socket: Socket, sessionId: string): Promise<void> {
    try {
      // Sanitize and validate session ID
      const sanitizedId = this.sanitizeSessionId(sessionId);

      if (!this.isValidSessionId(sanitizedId)) {
        logger.warn({
          category: 'interactive_terminal',
          action: 'invalid_session_attach',
          message: 'Attempt to attach to invalid session ID',
          details: { sessionId: sanitizedId, socketId: socket.id }
        });
        socket.emit('terminal:error', { message: 'Invalid session ID' });
        return;
      }

      const session = this.sessions.get(sanitizedId);

      if (!session) {
        // Session doesn't exist in memory, try to attach to existing tmux session
        const tmuxSessionName = `terminal-${sanitizedId}`;
        logger.info({
          category: 'interactive_terminal',
          action: 'session_reattach_attempt',
          message: 'Attempting to reattach to tmux session',
          details: { sessionId: sanitizedId, tmuxSessionName }
        });

        // Check if tmux session exists
        const sessionExists = await this.checkTmuxSessionExists(tmuxSessionName);
        if (!sessionExists) {
          socket.emit('terminal:error', { message: 'Session not found' });
          return;
        }

        // Attach to existing tmux session
        const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', tmuxSessionName], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: process.cwd(),
          env: process.env as { [key: string]: string },
        });

        // Recreate session object
        const newSession: TerminalSession = {
          id: sanitizedId,
          tmuxSessionName,
          ptyProcess,
          createdAt: new Date(), // We don't have the original creation time
          lastActivity: new Date(),
          connectedClients: new Set([socket.id]),
        };
        this.sessions.set(sanitizedId, newSession);

        // Forward output to socket
        ptyProcess.onData((data: string) => {
          socket.emit('terminal:output', data);
          newSession.lastActivity = new Date();
        });

        // Handle process exit
        ptyProcess.onExit(({ exitCode }) => {
          logger.info({
            category: 'interactive_terminal',
            action: 'process_exited',
            message: 'Terminal process exited',
            details: { sessionId: sanitizedId, exitCode }
          });
          socket.emit('terminal:closed', { exitCode });
          this.cleanupSession(sanitizedId);
        });

        socket.emit('terminal:attached', { sessionId: sanitizedId });
        socket.data.sessionId = sanitizedId;

        this.emit('sessionReattached', newSession);
      } else {
        // Session exists in memory, just add this client
        session.connectedClients.add(socket.id);
        session.lastActivity = new Date();
        socket.data.sessionId = sanitizedId;
        socket.emit('terminal:attached', { sessionId: sanitizedId });

        logger.info({
          category: 'interactive_terminal',
          action: 'client_attached',
          message: 'Client attached to existing session',
          details: { sessionId: sanitizedId, socketId: socket.id }
        });
      }
    } catch (error) {
      logger.error({
        category: 'interactive_terminal',
        action: 'session_attach_failed',
        message: 'Failed to attach to terminal session',
        details: { sessionId },
        error
      });
      socket.emit('terminal:error', { message: 'Failed to attach to terminal session' });
    }
  }

  /**
   * Handle terminal:input - forward input to PTY
   */
  private handleInput(socket: Socket, data: string): void {
    const sessionId = socket.data.sessionId as string | undefined;
    if (!sessionId) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session || !session.ptyProcess) {
      socket.emit('terminal:error', { message: 'Session not found' });
      return;
    }

    session.ptyProcess.write(data);
    session.lastActivity = new Date();
  }

  /**
   * Handle terminal:resize - resize PTY
   */
  private handleResize(socket: Socket, cols: number, rows: number): void {
    const sessionId = socket.data.sessionId as string | undefined;
    if (!sessionId) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session || !session.ptyProcess) {
      return;
    }

    session.ptyProcess.resize(cols, rows);
    logger.debug({
      category: 'interactive_terminal',
      action: 'terminal_resized',
      message: 'Terminal resized',
      details: { sessionId, cols, rows }
    });
  }

  /**
   * Handle disconnect - remove client from session
   */
  private handleDisconnect(socket: Socket): void {
    const sessionId = socket.data.sessionId as string | undefined;
    if (!sessionId) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      session.connectedClients.delete(socket.id);
      logger.info({
        category: 'interactive_terminal',
        action: 'client_disconnected',
        message: 'Client disconnected from terminal session',
        details: {
          sessionId,
          socketId: socket.id,
          remainingClients: session.connectedClients.size,
        }
      });

      // Note: We DON'T kill the tmux session when all clients disconnect
      // This is the key feature - sessions persist!
    }
  }

  /**
   * Check if tmux session exists
   */
  private async checkTmuxSessionExists(sessionName: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        const checkProcess = pty.spawn('tmux', ['has-session', '-t', sessionName], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
        });

        checkProcess.onExit(({ exitCode }) => {
          resolve(exitCode === 0);
        });
      } catch (error) {
        logger.error({
          category: 'interactive_terminal',
          action: 'tmux_check_failed',
          message: 'Failed to check tmux session existence',
          error
        });
        reject(error);
      }
    });
  }

  /**
   * Cleanup session - kill PTY process but leave tmux session running
   */
  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.ptyProcess) {
      session.ptyProcess.kill();
    }

    this.sessions.delete(sessionId);
    this.emit('sessionClosed', sessionId);

    logger.info({
      category: 'interactive_terminal',
      action: 'session_cleanup',
      message: 'Session cleaned up from memory',
      details: { sessionId }
    });
    // Note: tmux session still exists and can be reattached
  }

  /**
   * Kill tmux session (for explicit termination)
   */
  public async killSession(sessionId: string): Promise<void> {
    // Sanitize and validate session ID
    const sanitizedId = this.sanitizeSessionId(sessionId);

    if (!this.isValidSessionId(sanitizedId)) {
      logger.warn({
        category: 'interactive_terminal',
        action: 'invalid_session_kill',
        message: 'Attempt to kill invalid session ID',
        details: { sessionId: sanitizedId }
      });
      throw new Error('Invalid session ID');
    }

    const session = this.sessions.get(sanitizedId);
    const tmuxSessionName = session?.tmuxSessionName ?? `terminal-${sanitizedId}`;

    logger.info({
      category: 'interactive_terminal',
      action: 'session_kill',
      message: 'Killing tmux session',
      details: { sessionId: sanitizedId, tmuxSessionName }
    });

    return new Promise((resolve, reject) => {
      try {
        const killProcess = pty.spawn('tmux', ['kill-session', '-t', tmuxSessionName], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
        });

        killProcess.onExit(({ exitCode }) => {
          if (exitCode === 0 || exitCode === 1) {
            // Exit code 1 means session doesn't exist, which is fine
            this.cleanupSession(sanitizedId);
            this.validSessionIds.delete(sanitizedId);
            resolve();
          } else {
            logger.error({
              category: 'interactive_terminal',
              action: 'session_kill_failed',
              message: 'Failed to kill tmux session',
              details: { sessionId: sanitizedId, exitCode }
            });
            reject(new Error(`Failed to kill session: exit code ${exitCode}`));
          }
        });
      } catch (error) {
        logger.error({
          category: 'interactive_terminal',
          action: 'session_kill_error',
          message: 'Error killing tmux session',
          error
        });
        reject(error);
      }
    });
  }

  /**
   * Start idle watchdog to cleanup old sessions
   */
  private startIdleWatchdog(): void {
    this.idleCheckInterval = setInterval(() => {
      const now = Date.now();

      for (const [sessionId, session] of this.sessions.entries()) {
        const idleDuration = now - session.lastActivity.getTime();

        if (idleDuration > this.idleTimeoutMs && session.connectedClients.size === 0) {
          logger.info({
            category: 'interactive_terminal',
            action: 'idle_session_kill',
            message: 'Killing idle session',
            details: { sessionId, idleDuration }
          });
          this.killSession(sessionId);
        }
      }
    }, 60 * 1000); // Check every minute
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get all active sessions
   */
  public getSessions(): TerminalSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Cleanup service
   */
  public async cleanup(): Promise<void> {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }

    // Kill all PTY processes (but leave tmux sessions running)
    for (const session of this.sessions.values()) {
      if (session.ptyProcess) {
        session.ptyProcess.kill();
      }
    }

    this.sessions.clear();
    logger.info({
      category: 'interactive_terminal',
      action: 'service_cleanup',
      message: 'TerminalService cleaned up'
    });
  }
}
