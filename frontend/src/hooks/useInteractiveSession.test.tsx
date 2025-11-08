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

vi.mock('@/services/api', () => ({
  getDevBotsInteractiveSession: vi.fn(),
  startDevBotsInteractiveSession: vi.fn(),
  endDevBotsInteractiveSession: vi.fn(),
  sendDevBotsInteractiveInput: vi.fn(),
  sendDevBotsInteractiveInterrupt: vi.fn(),
  sendDevBotsInteractiveHeartbeat: vi.fn(),
  getDevBotsInteractiveStreamUrl: vi.fn((sessionId: string) =>
    'ws://localhost/api/dev-bots/interactive/session/' + sessionId + '/stream',
  ),
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

  class MockWebSocket {
    static instances: MockWebSocket[] = [];
    public url: string;
    public onopen: (() => void) | null = null;
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public onclose: (() => void) | null = null;
    public onerror: (() => void) | null = null;

    constructor(url: string) {
      this.url = url;
      MockWebSocket.instances.push(this);
      setTimeout(() => {
        this.onopen?.();
      }, 0);
    }

    addEventListener(type: string, handler: any) {
      if (type === 'open') this.onopen = handler;
      if (type === 'message') this.onmessage = handler;
      if (type === 'close') this.onclose = handler;
      if (type === 'error') this.onerror = handler;
    }

    removeEventListener() {}
    send() {}
    close() {
      this.onclose?.();
    }
  }

  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
      MockWebSocket as unknown as typeof WebSocket;
    vi.mocked(getDevBotsInteractiveSession).mockResolvedValue(baseState);
    vi.mocked(startDevBotsInteractiveSession).mockResolvedValue({ ...baseState });
    vi.mocked(endDevBotsInteractiveSession).mockResolvedValue(baseState);
    vi.mocked(sendDevBotsInteractiveInput).mockResolvedValue(true as unknown as boolean);
    vi.mocked(sendDevBotsInteractiveInterrupt).mockResolvedValue('ok');
    vi.mocked(sendDevBotsInteractiveHeartbeat).mockResolvedValue(true);
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
    vi.clearAllMocks();
    MockWebSocket.instances = [];
  });

  it('loads session state on mount', async () => {
    const { result } = renderHook(() => useInteractiveSession());

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });

    expect(getDevBotsInteractiveSession).toHaveBeenCalledTimes(1);
    expect(result.current.sessionState).toEqual(baseState);
  });

  it('starts a session and connects to the stream', async () => {
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
      stream: {
        sessionId: 'session-1',
        url: 'ws://localhost/dev-bots/session-1',
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
    expect(MockWebSocket.instances[0]?.url).toBe('ws://localhost/dev-bots/session-1');
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
