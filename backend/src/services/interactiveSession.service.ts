import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

import {
  getDatabase,
  InteractiveSessionRecord,
  InteractiveSessionStatus,
  NewInteractiveSession,
  InteractiveSessionUpdate,
} from './database.js';

export interface AllowedInteractiveModel {
  provider: string;
  name: string;
  displayName?: string;
  description?: string;
  default?: boolean;
}

export interface StartInteractiveSessionOptions {
  ownerEmail: string;
  modelProvider: string;
  modelName: string;
  metadata?: Record<string, unknown>;
  contextSnapshot?: unknown;
}

export interface InteractiveSessionServiceOptions {
  idleTimeoutMs?: number;
  allowedModels?: AllowedInteractiveModel[];
}

export type ActivityKind = 'user' | 'agent';

const DEFAULT_ALLOWED_MODELS: AllowedInteractiveModel[] = [
  {
    provider: 'codex',
    name: 'gpt-5.1-codex',
    displayName: 'Codex GPT-5.1',
    default: true,
  },
  {
    provider: 'claude',
    name: 'claude-3-5-sonnet',
    displayName: 'Claude 3.5 Sonnet',
  },
];

export class InteractiveSessionService extends EventEmitter {
  private readonly idleTimeoutMs: number;
  private readonly allowedModels: AllowedInteractiveModel[];
  private idleWatchdogInterval?: NodeJS.Timeout;
  private onIdleTimeoutCallback?: (sessionId: string, idleDuration: number) => void;

  constructor(options: InteractiveSessionServiceOptions = {}) {
    super();
    this.idleTimeoutMs = options.idleTimeoutMs ?? 5 * 60 * 1000;
    this.allowedModels =
      options.allowedModels && options.allowedModels.length > 0
        ? options.allowedModels
        : DEFAULT_ALLOWED_MODELS;
  }

  getActiveSession(): InteractiveSessionRecord | null {
    return getDatabase().getActiveInteractiveSession();
  }

  getSessionById(id: string): InteractiveSessionRecord | null {
    return getDatabase().getInteractiveSessionById(id);
  }

  listRecentSessions(limit = 20): InteractiveSessionRecord[] {
    return getDatabase().listRecentInteractiveSessions(limit);
  }

  startSession(options: StartInteractiveSessionOptions): InteractiveSessionRecord {
    const db = getDatabase();
    const existing = db.getActiveInteractiveSession();
    if (existing) {
      throw new Error('An interactive session is already active');
    }

    this.validateModel(options.modelProvider, options.modelName);

    const now = new Date().toISOString();
    const sessionId = `interactive-${randomUUID()}`;

    const payload: NewInteractiveSession = {
      id: sessionId,
      ownerEmail: options.ownerEmail,
      modelProvider: options.modelProvider,
      modelName: options.modelName,
      status: 'starting',
      startedAt: now,
      lastUserActivityAt: now,
      lastAgentActivityAt: now,
      metadata: options.metadata,
      contextSnapshot: options.contextSnapshot,
    };

    db.createInteractiveSession(payload);
    const record = db.getInteractiveSessionById(sessionId);
    if (!record) {
      throw new Error('Failed to create interactive session');
    }

    this.emit('sessionStarted', record);
    return record;
  }

  setStatus(
    sessionId: string,
    status: InteractiveSessionStatus,
    updates: Partial<InteractiveSessionUpdate> = {},
  ): void {
    getDatabase().updateInteractiveSession(sessionId, {
      status,
      ...updates,
    });
    const record = this.getSessionById(sessionId);
    if (record) {
      this.emit('sessionUpdated', record);
    }
  }

  recordActivity(sessionId: string, kind: ActivityKind): void {
    const timestamp = new Date().toISOString();
    if (kind === 'user') {
      getDatabase().updateInteractiveSession(sessionId, { lastUserActivityAt: timestamp });
    } else {
      getDatabase().updateInteractiveSession(sessionId, { lastAgentActivityAt: timestamp });
    }
  }

  updateContext(sessionId: string, contextSnapshot?: unknown, metadata?: Record<string, unknown>): void {
    getDatabase().updateInteractiveSession(sessionId, {
      contextSnapshot,
      metadata,
    });
  }

  endSession(sessionId: string, reason?: string, status: InteractiveSessionStatus = 'ended'): void {
    getDatabase().updateInteractiveSession(sessionId, {
      status,
      endedAt: new Date().toISOString(),
      terminationReason: reason ?? null,
    });
    const record = this.getSessionById(sessionId);
    if (record) {
      this.emit('sessionEnded', record);
    }
  }

  getIdleTimeoutMs(): number {
    return this.idleTimeoutMs;
  }

  getAllowedModels(): AllowedInteractiveModel[] {
    return [...this.allowedModels];
  }

  /**
   * Start idle timeout watchdog
   * Monitors active sessions and calls the callback when idle timeout is reached
   */
  startIdleWatchdog(onIdleTimeout: (sessionId: string, idleDuration: number) => void): void {
    this.onIdleTimeoutCallback = onIdleTimeout;

    if (this.idleWatchdogInterval) {
      clearInterval(this.idleWatchdogInterval);
    }

    this.idleWatchdogInterval = setInterval(() => {
      const session = this.getActiveSession();
      if (!session) {
        return;
      }

      const lastActivity = this.getLastActivity(session);
      if (!lastActivity) {
        return;
      }

      const idleDuration = Date.now() - lastActivity;
      if (idleDuration >= this.idleTimeoutMs) {
        // Call the callback to handle timeout
        if (this.onIdleTimeoutCallback) {
          this.onIdleTimeoutCallback(session.id, idleDuration);
        }
        // Emit event for monitoring
        this.emit('idleTimeout', { sessionId: session.id, idleDuration });
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop idle timeout watchdog
   */
  stopIdleWatchdog(): void {
    if (this.idleWatchdogInterval) {
      clearInterval(this.idleWatchdogInterval);
      this.idleWatchdogInterval = undefined;
    }
    this.onIdleTimeoutCallback = undefined;
  }

  /**
   * Get the last activity timestamp for a session
   * Returns the most recent of: startedAt, lastUserActivityAt, lastAgentActivityAt
   */
  getLastActivity(session: InteractiveSessionRecord): number | null {
    const timestamps = [
      session.startedAt,
      session.lastUserActivityAt,
      session.lastAgentActivityAt
    ]
      .map((value) => (value ? Date.parse(value) : Number.NaN))
      .filter((value) => Number.isFinite(value)) as number[];

    if (!timestamps.length) {
      return null;
    }

    return Math.max(...timestamps);
  }

  private validateModel(provider: string, name: string): void {
    const match = this.allowedModels.some(
      (model) => model.provider === provider && (model.name === name || model.name === '*'),
    );
    if (!match) {
      const allowed = this.allowedModels.map((m) => `${m.provider}:${m.name}`).join(', ');
      throw new Error(`Model ${provider}:${name} is not allowed. Allowed models: ${allowed}`);
    }
  }
}
