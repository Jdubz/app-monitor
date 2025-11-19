import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DevBotsInteractiveSessionState } from '@/types/dev-bots';
import {
  getDevBotsInteractiveSession,
  startDevBotsInteractiveSession,
  endDevBotsInteractiveSession,
  sendDevBotsInteractiveInput,
  sendDevBotsInteractiveInterrupt,
  sendDevBotsInteractiveHeartbeat,
} from '@/services/api';
import { useInteractiveSession } from './useInteractiveSession';

// Mock the API services
vi.mock('@/services/api', () => ({
  getDevBotsInteractiveSession: vi.fn(),
  startDevBotsInteractiveSession: vi.fn(),
  endDevBotsInteractiveSession: vi.fn(),
  sendDevBotsInteractiveInput: vi.fn(),
  sendDevBotsInteractiveInterrupt: vi.fn(),
  sendDevBotsInteractiveHeartbeat: vi.fn(),
}));

// Mock Socket.IO client
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('./useEnhancedSocket', () => ({
  useEnhancedSocket: vi.fn(() => ({
    socket: mockSocket,
    isConnected: true,
  })),
}));

describe('useInteractiveSession', () => {
  const baseState: DevBotsInteractiveSessionState = {
    session: null,
    availableModels: [
      { provider: 'claude', model: 'sonnet', displayName: 'Claude Sonnet' },
      { provider: 'codex', model: 'latest', displayName: 'Codex Latest' },
    ],
    heartbeatIntervalSeconds: 30,
    idleTimeoutSeconds: 300,
  };

  beforeEach(() => {
    vi.mocked(getDevBotsInteractiveSession).mockResolvedValue(baseState);
    vi.mocked(startDevBotsInteractiveSession).mockResolvedValue({ ...baseState });
    vi.mocked(endDevBotsInteractiveSession).mockResolvedValue(baseState);
    vi.mocked(sendDevBotsInteractiveInput).mockResolvedValue(true as unknown as boolean);
    vi.mocked(sendDevBotsInteractiveInterrupt).mockResolvedValue('ok');
    vi.mocked(sendDevBotsInteractiveHeartbeat).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads session state on mount', async () => {
    const { result } = renderHook(() => useInteractiveSession());

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });

    expect(getDevBotsInteractiveSession).toHaveBeenCalledTimes(1);
    expect(result.current.sessionState).toEqual(baseState);
  });

  it('starts a session and uses Socket.IO', async () => {
    const runningState: DevBotsInteractiveSessionState = {
      ...baseState,
      session: {
        id: 'session-1',
        ownerEmail: 'admin@example.com',
        modelProvider: 'claude',
        modelName: 'sonnet',
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    vi.mocked(startDevBotsInteractiveSession).mockResolvedValue(runningState);

    const { result } = renderHook(() => useInteractiveSession());

    await waitFor(() => expect(result.current.isFetching).toBe(false));

    await act(async () => {
      await result.current.startSession('claude', 'sonnet');
    });

    expect(startDevBotsInteractiveSession).toHaveBeenCalledWith({
      modelProvider: 'claude',
      modelName: 'sonnet',
    });
    await waitFor(() => {
      expect(result.current.sessionState?.session?.id).toBe('session-1');
    });
  });

  it('prevents sending input when no session is active', async () => {
    const { result } = renderHook(() => useInteractiveSession());
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    await act(async () => {
      await result.current.sendInput('ls');
    });

    expect(result.current.error).toBe('No active interactive session.');
    expect(sendDevBotsInteractiveInput).not.toHaveBeenCalled();
  });
});
