import type http from 'http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';

import type { DevBotsManager } from './devBotsManager.js';
import type {
  InteractiveSessionStreamManager,
  InteractiveStreamMessage,
} from './interactiveSessionStreamManager.js';
import { logger } from '../utils/logger.js';

interface InteractiveGatewayOptions {
  server: http.Server;
  path?: string;
  devBotsManager: DevBotsManager;
  streamManager: InteractiveSessionStreamManager;
}

interface ParsedRequest {
  sessionId: string;
}

type ClientMessage =
  | { type: 'input'; data: string }
  | { type: 'signal'; signal: 'interrupt' | 'terminate' }
  | { type: 'resize'; rows: number; cols: number }
  | { type: 'ping' };

export class InteractiveSessionGateway {
  private readonly wss: WebSocketServer;
  private readonly path: string;
  private readonly devBotsManager: DevBotsManager;
  private readonly streamManager: InteractiveSessionStreamManager;
  private readonly clients = new Map<string, Set<WebSocket>>();

  constructor(options: InteractiveGatewayOptions) {
    this.devBotsManager = options.devBotsManager;
    this.streamManager = options.streamManager;
    this.path = options.path ?? '/api/dev-bots/interactive/session';

    this.wss = new WebSocketServer({ noServer: true });
    options.server.on('upgrade', (request, socket, head) => {
      const parsed = this.parseRequest(request);
      if (!parsed) {
        return;
      }

      const session = this.devBotsManager.getInteractiveSession(parsed.sessionId);
      if (!session || session.status === 'ended') {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws, parsed.sessionId);
      });
    });

    this.streamManager.on('message', (message) => {
      this.broadcastStreamMessage(message);
    });

    this.streamManager.on('closed', ({ sessionId, reason }) => {
      this.broadcast(sessionId, {
        type: 'status',
        state: 'closed',
        reason,
      });
      this.closeSessionClients(sessionId);
    });

    this.streamManager.on('error', ({ sessionId, error }) => {
      this.broadcast(sessionId, {
        type: 'error',
        message: error.message,
      });
    });
  }

  private handleConnection(socket: WebSocket, sessionId: string): void {
    const clients = this.getClientSet(sessionId);
    clients.add(socket);

    socket.send(
      JSON.stringify({
        type: 'connected',
        sessionId,
        timestamp: new Date().toISOString(),
      }),
    );

    const backlog = this.streamManager.getBacklog(sessionId);
    backlog.forEach((message) => {
      this.sendStreamPayload(socket, message);
    });

    socket.on('message', (data: RawData) => {
      this.handleClientMessage(socket, sessionId, data);
    });

    socket.on('close', () => {
      clients.delete(socket);
      if (clients.size === 0) {
        this.clients.delete(sessionId);
      }
    });

    socket.on('error', (error: Error) => {
      logger.warn({
        category: 'system',
        action: 'websocket_error',
        message: `Interactive session websocket error for ${sessionId}`,
        error,
      });
    });
  }

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
            this.devBotsManager.sendInteractiveInput(sessionId, payload.data);
          }
          break;
        }
        case 'signal': {
          this.devBotsManager.sendInteractiveSignal(sessionId, payload.signal ?? 'interrupt');
          break;
        }
        case 'resize': {
          if (typeof payload.rows === 'number' && typeof payload.cols === 'number') {
            void this.streamManager.resizePty(sessionId, {
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

  private getClientSet(sessionId: string): Set<WebSocket> {
    let clients = this.clients.get(sessionId);
    if (!clients) {
      clients = new Set();
      this.clients.set(sessionId, clients);
    }
    return clients;
  }

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

  private broadcastStreamMessage(message: InteractiveStreamMessage): void {
    this.broadcast(message.sessionId, this.mapStreamMessage(message));
  }

  private sendStreamPayload(socket: WebSocket, message: InteractiveStreamMessage): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(this.mapStreamMessage(message)));
  }

  private mapStreamMessage(message: InteractiveStreamMessage) {
    return {
      type: 'stream',
      stream: message.kind,
      text: message.text,
      timestamp: message.timestamp,
      level: message.level,
    };
  }

  private parseRequest(request: http.IncomingMessage): ParsedRequest | null {
    if (!request.url) {
      return null;
    }
    try {
      const url = new URL(request.url, 'http://localhost');
      if (!url.pathname.startsWith(this.path)) {
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
}

