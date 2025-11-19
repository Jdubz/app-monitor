/**
 * @deprecated This class has been replaced by TerminalService (tmux-based terminal)
 *
 * STUB: Socket.IO Terminal Handler
 *
 * This stub exists for backwards compatibility during the migration period.
 * All methods are no-ops.
 *
 * Migration completed: 2025-11-18
 * New implementation: TerminalService (backend/src/services/TerminalService.ts)
 *
 * TODO: Remove this stub once all references are cleaned up (Phase 3 cleanup)
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
