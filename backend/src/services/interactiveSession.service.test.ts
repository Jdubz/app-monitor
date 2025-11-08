import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  InteractiveSessionRecord,
  InteractiveSessionStatus,
  InteractiveSessionUpdate,
  NewInteractiveSession,
} from './database.js';
import { InteractiveSessionService } from './interactiveSession.service.js';

type MockDb = ReturnType<typeof createMockDatabase>;

const ACTIVE_STATUSES: InteractiveSessionStatus[] = ['starting', 'running', 'disconnecting', 'terminating'];

const createMockDatabase = () => {
  const sessions = new Map<string, InteractiveSessionRecord>();

  return {
    getActiveInteractiveSession: () =>
      Array.from(sessions.values()).find((session) => ACTIVE_STATUSES.includes(session.status)) ?? null,
    getInteractiveSessionById: (id: string) => sessions.get(id) ?? null,
    listRecentInteractiveSessions: (limit: number) => Array.from(sessions.values()).slice(0, limit),
    createInteractiveSession: (payload: NewInteractiveSession) => {
      sessions.set(payload.id, {
        id: payload.id,
        ownerEmail: payload.ownerEmail,
        modelProvider: payload.modelProvider,
        modelName: payload.modelName,
        status: payload.status,
        containerId: payload.containerId,
        startedAt: payload.startedAt ?? new Date().toISOString(),
        lastUserActivityAt: payload.lastUserActivityAt ?? undefined,
        lastAgentActivityAt: payload.lastAgentActivityAt ?? undefined,
        endedAt: payload.endedAt ?? undefined,
        terminationReason: payload.terminationReason ?? undefined,
        contextSnapshot: payload.contextSnapshot,
        logPath: payload.logPath,
        metadata: payload.metadata,
        updatedAt: new Date().toISOString(),
      });
    },
    updateInteractiveSession: (id: string, updates: InteractiveSessionUpdate) => {
      const session = sessions.get(id);
      if (!session) return;
      sessions.set(id, {
        ...session,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    },
    __reset: () => sessions.clear(),
  };
};

let currentDb: MockDb = createMockDatabase();

vi.mock('./database.js', async () => {
  const actual = await vi.importActual<typeof import('./database.js')>('./database.js');
  return {
    ...actual,
    getDatabase: () => currentDb,
  };
});

describe('InteractiveSessionService', () => {
  beforeEach(() => {
    currentDb = createMockDatabase();
  });

  it('prevents starting multiple concurrent sessions', () => {
    const service = new InteractiveSessionService();
    service.startSession({ ownerEmail: 'admin@example.com', modelProvider: 'claude', modelName: 'claude-3-5-sonnet' });
    expect(() =>
      service.startSession({
        ownerEmail: 'admin@example.com',
        modelProvider: 'claude',
        modelName: 'claude-3-5-sonnet',
      }),
    ).toThrowError(/already active/);
  });

  it('rejects disallowed models', () => {
    const service = new InteractiveSessionService({
      allowedModels: [{ provider: 'claude', name: 'opus' }],
    });
    expect(() => service.startSession({ ownerEmail: 'admin', modelProvider: 'codex', modelName: 'gpt-4o' })).toThrowError(
      /not allowed/,
    );
  });

  it('records user activity timestamps', () => {
    const service = new InteractiveSessionService();
    const session = service.startSession({
      ownerEmail: 'admin',
      modelProvider: 'claude',
      modelName: 'claude-3-5-sonnet',
    });
    service.recordActivity(session.id, 'user');
    const updated = service.getSessionById(session.id);
    expect(updated?.lastUserActivityAt).toBeTruthy();
  });
});
