/**
 * Interactive Session Streaming
 *
 * Consolidated service managing real-time streaming and WebSocket connectivity.
 * Merges functionality from:
 * - interactiveSessionStreamManager.ts (Docker stream, PTY, log backlog)
 * - interactiveSessionGateway.ts (WebSocket server, client management)
 *
 * Responsibilities:
 * - Docker exec stream handling (PTY/terminal I/O)
 * - Log backlog management
 * - WebSocket server lifecycle
 * - Client connection multiplexing
 * - Real-time message broadcasting
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type http from 'http';
import type Docker from 'dockerode';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type InteractiveStreamMessageKind = 'stdout' | 'stderr' | 'system' | 'status';
export type InteractiveStreamMessageLevel = 'info' | 'warning' | 'error';

export interface InteractiveStreamMessage {
  id: string;
  sessionId: string;
  kind: InteractiveStreamMessageKind;
  text: string;
  timestamp: string;
  level?: InteractiveStreamMessageLevel;
}

export interface InteractiveSessionStreamingOptions {
  docker: Docker;
  httpServer: http.Server;
  backlogLimit?: number;
  shellCommand?: string[];
  websocketPath?: string;
}

export interface PtySize {
  rows: number;
  cols: number;
}

interface ActiveStreamContext {
  sessionId: string;
  containerId: string;
  exec?: Docker.Exec;
  stream?: NodeJS.ReadWriteStream;
  backlog: InteractiveStreamMessage[];
  ready: boolean;
}

interface ParsedRequest {
  sessionId: string;
}

type ClientMessage =
  | { type: 'input'; data: string }
  | { type: 'signal'; signal: 'interrupt' | 'terminate' }
  | { type: 'resize'; rows: number; cols: number }
  | { type: 'ping' };

// ============================================================================
// Interactive Session Streaming
// ============================================================================

export class InteractiveSessionStreaming extends EventEmitter {
  private readonly docker: Docker;
  private readonly wss: WebSocketServer;
  private readonly websocketPath: string;
  private readonly backlogLimit: number;
  private readonly shellCommand: string[];

  // Stream state
  private active?: ActiveStreamContext;

  // WebSocket client management
  private readonly clients = new Map<string, Set<WebSocket>>();

  constructor(options: InteractiveSessionStreamingOptions) {
    super();
    this.docker = options.docker;
    this.backlogLimit = options.backlogLimit ?? 200;
    this.shellCommand = options.shellCommand ?? ['/bin/bash'];
    this.websocketPath = options.websocketPath ?? '/api/dev-bots/interactive/session';

    // Initialize WebSocket server
    this.wss = new WebSocketServer({ noServer: true });

    // Handle HTTP upgrade requests
    options.httpServer.on('upgrade', (request, socket, head) => {
      const parsed = this.parseRequest(request);
      if (!parsed) {
        return;
      }

      // Session validation will be handled by caller via event emission
      this.emit('validateSession', parsed.sessionId, (isValid: boolean) => {
        if (!isValid) {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
          return;
        }

        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.handleConnection(ws, parsed.sessionId);
        });
      });
    });
  }

  // ==========================================================================
  // Stream Management (from StreamManager)
  // ==========================================================================

  /**
   * Get active session ID
   */
  getActiveSessionId(): string | undefined {
    return this.active?.sessionId;
  }

  /**
   * Get log backlog for session
   */
  getBacklog(sessionId: string): InteractiveStreamMessage[] {
    if (!this.active || this.active.sessionId !== sessionId) {
      return [];
    }
    return [...this.active.backlog];
  }

  /**
   * Attach stream to container
   */
  async attach(sessionId: string, containerId: string): Promise<void> {
    if (this.active && this.active.sessionId === sessionId) {
      if (this.active.ready) {
        return;
      }
    } else {
      await this.detach(this.active?.sessionId);
      this.active = {
        sessionId,
        containerId,
        backlog: [],
        ready: false,
      };
    }

    await this.initializeStream();
  }

  /**
   * Detach stream from session
   */
  async detach(sessionId?: string | null): Promise<void> {
    if (!this.active) {
      return;
    }
    if (sessionId && this.active.sessionId !== sessionId) {
      return;
    }

    const context = this.active;
    this.active = undefined;

    if (context.stream) {
      context.stream.removeAllListeners();
      try {
        context.stream.end();
      } catch (error) {
        logger.warn({
          category: 'system',
          action: 'stream_end_failed',
          message: `Failed to end interactive stream for ${context.sessionId}`,
          error,
        });
      }
    }

    // Close all WebSocket clients for this session
    this.closeSessionClients(context.sessionId);
  }

  /**
   * Send input to active session
   */
  sendInput(sessionId: string, chunk: string | Buffer): void {
    const context = this.assertActive(sessionId);
    context.stream?.write(chunk);
  }

  /**
   * Send signal to active session (SIGINT or EOF)
   */
  sendSignal(sessionId: string, signal: 'interrupt' | 'terminate' = 'interrupt'): void {
    const context = this.assertActive(sessionId);
    if (!context.stream) {
      return;
    }
    const payload = signal === 'interrupt' ? '\u0003' : '\u0004';
    context.stream.write(payload);
    this.pushSystemMessage(
      context,
      signal === 'interrupt' ? 'Sent SIGINT to session' : 'Sent EOF to session',
      'warning',
    );
  }

  /**
   * Resize PTY
   */
  async resizePty(sessionId: string, size: PtySize): Promise<void> {
    const context = this.assertActive(sessionId);
    if (!context.exec) {
      return;
    }
    try {
      await context.exec.resize({
        h: size.rows,
        w: size.cols,
      });
    } catch (error) {
      logger.warn({
        category: 'system',
        action: 'pty_resize_failed',
        message: `Failed to resize PTY for session ${sessionId}`,
        error,
      });
    }
  }

  // ==========================================================================
  // WebSocket Gateway (from Gateway)
  // ==========================================================================

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: WebSocket, sessionId: string): void {
    const clients = this.getClientSet(sessionId);
    clients.add(socket);

    // Send connection acknowledgment
    socket.send(
      JSON.stringify({
        type: 'connected',
        sessionId,
        timestamp: new Date().toISOString(),
      }),
    );

    // Send backlog to new client
    const backlog = this.getBacklog(sessionId);
    backlog.forEach((message) => {
      this.sendStreamPayload(socket, message);
    });

    // Handle client messages
    socket.on('message', (data: RawData) => {
      this.handleClientMessage(socket, sessionId, data);
    });

    // Handle client disconnect
    socket.on('close', () => {
      clients.delete(socket);
      if (clients.size === 0) {
        this.clients.delete(sessionId);
      }
    });

    // Handle client errors
    socket.on('error', (error: Error) => {
      logger.warn({
        category: 'system',
        action: 'websocket_error',
        message: `Interactive session websocket error for ${sessionId}`,
        error,
      });
    });
  }

  /**
   * Handle incoming client message
   */
  private handleClientMessage(socket: WebSocket, sessionId: string, raw: RawData): void {
    let payload: ClientMessage | undefined;
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      payload = JSON.parse(text) as ClientMessage;
    } catch (error) {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid message payload' }));
      return;
    }

    if (!payload || typeof payload !== 'object' || !('type' in payload)) {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid message payload' }));
      return;
    }

    try {
      switch (payload.type) {
        case 'input': {
          if (typeof payload.data === 'string') {
            this.sendInput(sessionId, payload.data);
            // Emit event for activity tracking
            this.emit('userActivity', sessionId);
          }
          break;
        }
        case 'signal': {
          this.sendSignal(sessionId, payload.signal ?? 'interrupt');
          // Emit event for activity tracking
          this.emit('userActivity', sessionId);
          break;
        }
        case 'resize': {
          if (typeof payload.rows === 'number' && typeof payload.cols === 'number') {
            void this.resizePty(sessionId, {
              rows: payload.rows,
              cols: payload.cols,
            });
          }
          break;
        }
        case 'ping': {
          socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        }
        default:
          socket.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Request failed',
        }),
      );
    }
  }

  // ==========================================================================
  // Stream Initialization & Event Handling
  // ==========================================================================

  /**
   * Initialize Docker exec stream
   */
  private async initializeStream(): Promise<void> {
    if (!this.active) {
      return;
    }
    if (this.active.stream) {
      this.active.ready = true;
      return;
    }

    try {
      const container = this.docker.getContainer(this.active.containerId);
      const exec = await container.exec({
        Cmd: this.shellCommand,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        WorkingDir: '/workspace',
        Env: ['TERM=xterm-256color'],
      });

      const stream = await exec.start({
        hijack: true,
        stdin: true,
      });

      this.active.exec = exec;
      this.active.stream = stream;
      this.active.ready = true;

      // Handle stream data
      stream.on('data', (chunk: Buffer) => {
        this.handleChunk(chunk.toString('utf8'));
      });

      // Handle stream errors
      stream.on('error', (error: Error) => {
        if (!this.active) {
          return;
        }
        logger.error({
          category: 'system',
          action: 'stream_error',
          message: `Interactive stream error for session ${this.active.sessionId}`,
          error,
        });
        this.emit('error', {
          sessionId: this.active.sessionId,
          error,
        });
      });

      // Handle stream close
      stream.on('close', () => {
        if (!this.active) {
          return;
        }
        const sessionId = this.active.sessionId;

        // Broadcast close event to WebSocket clients
        this.broadcast(sessionId, {
          type: 'status',
          state: 'closed',
          reason: 'stream_closed',
        });

        this.emit('closed', {
          sessionId,
          reason: 'stream_closed',
        });

        this.detach(sessionId).catch(() => {
          /* ignore */
        });
      });

      this.emit('ready', { sessionId: this.active.sessionId });
      this.pushSystemMessage(this.active, 'Interactive stream ready', 'info');
    } catch (error) {
      if (!this.active) {
        return;
      }
      logger.error({
        category: 'system',
        action: 'stream_init_failed',
        message: `Failed to attach interactive stream for session ${this.active.sessionId}`,
        error,
      });
      this.emit('error', {
        sessionId: this.active.sessionId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Handle incoming stream chunk
   */
  private handleChunk(text: string): void {
    if (!text || !this.active) {
      return;
    }
    const normalized = text.replace(/\r?\n/g, '\n');
    const message: InteractiveStreamMessage = {
      id: randomUUID(),
      sessionId: this.active.sessionId,
      kind: 'stdout',
      text: normalized,
      timestamp: new Date().toISOString(),
    };

    this.pushMessage(this.active, message);

    // Broadcast to WebSocket clients
    this.broadcastStreamMessage(message);
  }

  /**
   * Push system message to backlog
   */
  private pushSystemMessage(
    context: ActiveStreamContext,
    text: string,
    level: InteractiveStreamMessageLevel,
  ): void {
    const message: InteractiveStreamMessage = {
      id: randomUUID(),
      sessionId: context.sessionId,
      kind: 'system',
      text,
      level,
      timestamp: new Date().toISOString(),
    };

    this.pushMessage(context, message);
    this.broadcastStreamMessage(message);
  }

  /**
   * Push message to backlog
   */
  private pushMessage(context: ActiveStreamContext, message: InteractiveStreamMessage): void {
    context.backlog.push(message);
    if (context.backlog.length > this.backlogLimit) {
      context.backlog.shift();
    }
    this.emit('message', message);
  }

  // ==========================================================================
  // WebSocket Broadcasting
  // ==========================================================================

  /**
   * Get or create client set for session
   */
  private getClientSet(sessionId: string): Set<WebSocket> {
    let clients = this.clients.get(sessionId);
    if (!clients) {
      clients = new Set();
      this.clients.set(sessionId, clients);
    }
    return clients;
  }

  /**
   * Close all WebSocket clients for session
   */
  private closeSessionClients(sessionId: string): void {
    const clients = this.clients.get(sessionId);
    if (!clients) {
      return;
    }
    for (const socket of clients) {
      socket.close();
    }
    this.clients.delete(sessionId);
  }

  /**
   * Broadcast message to all clients of session
   */
  private broadcast(sessionId: string, payload: Record<string, unknown>): void {
    const clients = this.clients.get(sessionId);
    if (!clients || clients.size === 0) {
      return;
    }
    const data = JSON.stringify(payload);
    for (const socket of clients) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    }
  }

  /**
   * Broadcast stream message to all clients
   */
  private broadcastStreamMessage(message: InteractiveStreamMessage): void {
    this.broadcast(message.sessionId, this.mapStreamMessage(message));
  }

  /**
   * Send stream message to specific client
   */
  private sendStreamPayload(socket: WebSocket, message: InteractiveStreamMessage): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(this.mapStreamMessage(message)));
  }

  /**
   * Map stream message to WebSocket payload
   */
  private mapStreamMessage(message: InteractiveStreamMessage) {
    return {
      type: 'stream',
      stream: message.kind,
      text: message.text,
      timestamp: message.timestamp,
      level: message.level,
    };
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Parse WebSocket upgrade request
   */
  private parseRequest(request: http.IncomingMessage): ParsedRequest | null {
    if (!request.url) {
      return null;
    }
    try {
      const url = new URL(request.url, 'http://localhost');
      if (!url.pathname.startsWith(this.websocketPath)) {
        return null;
      }
      const segments = url.pathname.split('/').filter(Boolean);
      const streamIndex = segments.lastIndexOf('stream');
      if (streamIndex < 0 || streamIndex === 0) {
        return null;
      }
      const sessionId = decodeURIComponent(segments[streamIndex - 1]);
      if (!sessionId) {
        return null;
      }
      return { sessionId };
    } catch {
      return null;
    }
  }

  /**
   * Assert active stream context exists
   */
  private assertActive(sessionId: string): ActiveStreamContext {
    if (!this.active || this.active.sessionId !== sessionId) {
      throw new Error('Interactive session stream is not attached');
    }
    return this.active;
  }
}
