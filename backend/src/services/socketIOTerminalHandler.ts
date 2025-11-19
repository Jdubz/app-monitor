/**
 * STUB: Socket.IO Terminal Handler
 *
 * This is a temporary stub to prevent compilation errors while we rebuild
 * the terminal feature with tmux.
 *
 * TODO: Remove this stub once new TerminalService is complete
 */

import type { Server as SocketIOServer } from 'socket.io';
import type Docker from 'dockerode';

export interface SocketIOTerminalHandlerOptions {
  io: SocketIOServer;
  docker: Docker;
  backlogLimit?: number;
  shellCommand?: string[];
}

/**
 * STUB - Does nothing
 */
export class SocketIOTerminalHandler {
  constructor(_options: SocketIOTerminalHandlerOptions) {
    // Stub - does nothing
  }

  async startSession(_sessionId: string, _containerId: string): Promise<void> {
    // Stub - does nothing
  }

  async stopSession(_sessionId: string): Promise<void> {
    // Stub - does nothing
  }

  getSession(_sessionId: string): unknown | undefined {
    return undefined;
  }

  getAllSessions(): unknown[] {
    return [];
  }
}
