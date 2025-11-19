/**
 * @deprecated This class has been replaced by TerminalService (tmux-based terminal)
 *
 * STUB: Interactive Session Manager
 *
 * This stub exists for backwards compatibility during the migration period.
 * All methods are no-ops that either return empty results or throw errors.
 *
 * Migration completed: 2025-11-18
 * New implementation: TerminalService (backend/src/services/TerminalService.ts)
 *
 * TODO: Remove this stub once all references are cleaned up (Phase 3 cleanup)
 */

import { EventEmitter } from 'events';

export type InteractiveSessionStatus = 'pending' | 'starting' | 'running' | 'disconnecting' | 'terminating' | 'ended';
export type ActivityKind = 'user' | 'agent';

export interface InteractiveSessionRecord {
  id: string;
  ownerEmail: string;
  modelProvider: string;
  modelName: string;
  status: InteractiveSessionStatus;
  containerId?: string;
  startedAt: string;
  updatedAt?: string;
  lastUserActivityAt?: string;
  lastAgentActivityAt?: string;
  endedAt?: string;
  terminationReason?: string;
  contextSnapshot?: unknown;
  logPath?: string;
  metadata?: unknown;
}

export interface AllowedInteractiveModel {
  provider: string;
  name: string;
  displayName?: string;
  description?: string;
  default?: boolean;
}

export interface StartInteractiveSessionOptions {
  modelProvider: string;
  modelName: string;
  ownerEmail: string;
  metadata?: Record<string, unknown>;
}

export interface InteractiveSessionUpdate {
  status?: InteractiveSessionStatus;
  containerId?: string;
  lastUserActivityAt?: string;
  lastAgentActivityAt?: string;
  endedAt?: string;
  terminationReason?: string;
  contextSnapshot?: unknown;
  logPath?: string;
  metadata?: unknown;
}

/**
 * STUB - Returns empty/null for all methods
 */
export class InteractiveSessionManager extends EventEmitter {
  constructor(_workerService?: unknown, _config?: unknown) {
    super();
  }

  getActiveSession(): InteractiveSessionRecord | null {
    return null;
  }

  getSessionById(_id: string): InteractiveSessionRecord | null {
    return null;
  }

  listRecentSessions(_limit = 20): InteractiveSessionRecord[] {
    return [];
  }

  async launchSession(_options: StartInteractiveSessionOptions): Promise<InteractiveSessionRecord> {
    throw new Error('Interactive sessions disabled - feature being rebuilt with tmux');
  }

  async endSession(_sessionId: string, _reason: string): Promise<void> {
    // No-op
  }

  recordActivity(_sessionId: string, _kind: ActivityKind): void {
    // No-op
  }

  setStatus(_sessionId: string, _status: InteractiveSessionStatus, _updates?: Partial<InteractiveSessionUpdate>): void {
    // No-op
  }

  updateContext(_sessionId: string, _snapshot: unknown): void {
    // No-op
  }

  getIdleTimeoutMs(): number {
    return 1800000; // 30 minutes default
  }

  getAllowedModels(): AllowedInteractiveModel[] {
    return [];
  }

  startIdleWatchdog(_callback: (sessionId: string, idleDuration: number) => void): void {
    // No-op
  }

  stopIdleWatchdog(): void {
    // No-op
  }

  async cleanup(): Promise<void> {
    // No-op
  }
}
