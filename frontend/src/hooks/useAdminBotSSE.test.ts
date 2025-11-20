/**
 * useAdminBotSSE Hook Unit Tests
 *
 * Tests for the Admin Bot SSE connection hook.
 * Covers connection management, event handling, and cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAdminBotSSE } from './useAdminBotSSE';

// Mock EventSource
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  url: string;
  readyState: number = MockEventSource.CONNECTING;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners: Map<string, ((event: MessageEvent) => void)[]> = new Map();

  constructor(url: string) {
    this.url = url;

    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
    }, 10);
  }

  addEventListener(event: string, handler: (event: MessageEvent) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(handler);
  }

  removeEventListener(event: string, handler: (event: MessageEvent) => void) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  // Test helper to simulate incoming messages
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  // Test helper to simulate errors
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

describe('useAdminBotSSE', () => {
  let mockEventSourceInstances: MockEventSource[] = [];

  beforeEach(() => {
    mockEventSourceInstances = [];

    // Mock EventSource globally as a constructor function
    global.EventSource = vi.fn().mockImplementation((url: string) => {
      const instance = new MockEventSource(url);
      mockEventSourceInstances.push(instance);
      return instance;
    }) as any;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should connect to SSE endpoint on mount', () => {
    renderHook(() =>
      useAdminBotSSE({
        onOutput: vi.fn(),
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    expect(EventSource).toHaveBeenCalled();
  });

  it('should call onConnected when connection established', async () => {
    const onConnected = vi.fn();

    renderHook(() =>
      useAdminBotSSE({
        onOutput: vi.fn(),
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected,
      })
    );

    // Get the EventSource instance
    const eventSource = mockEventSourceInstances[0];

    // Simulate connected event
    eventSource.simulateMessage({ type: 'connected', timestamp: Date.now() });

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledTimes(1);
    });
  });

  it('should call onOutput when receiving output events', async () => {
    const onOutput = vi.fn();

    renderHook(() =>
      useAdminBotSSE({
        onOutput,
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];

    eventSource.simulateMessage({ type: 'output', content: 'test output' });

    await waitFor(() => {
      expect(onOutput).toHaveBeenCalledWith('test output');
    });
  });

  it('should call onError when receiving error events', async () => {
    const onError = vi.fn();

    renderHook(() =>
      useAdminBotSSE({
        onOutput: vi.fn(),
        onError,
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];

    eventSource.simulateMessage({ type: 'error', content: 'test error' });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('test error');
    });
  });

  it('should call onExit when receiving exit events', async () => {
    const onExit = vi.fn();

    renderHook(() =>
      useAdminBotSSE({
        onOutput: vi.fn(),
        onError: vi.fn(),
        onExit,
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];

    eventSource.simulateMessage({ type: 'exit', code: 0 });

    await waitFor(() => {
      expect(onExit).toHaveBeenCalledWith(0);
    });
  });

  it('should handle exit with null code', async () => {
    const onExit = vi.fn();

    renderHook(() =>
      useAdminBotSSE({
        onOutput: vi.fn(),
        onError: vi.fn(),
        onExit,
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];

    eventSource.simulateMessage({ type: 'exit', code: null });

    await waitFor(() => {
      expect(onExit).toHaveBeenCalledWith(null);
    });
  });

  it('should not crash on unknown event types', async () => {
    const onOutput = vi.fn();

    renderHook(() =>
      useAdminBotSSE({
        onOutput,
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];

    // Should not throw
    expect(() => {
      eventSource.simulateMessage({ type: 'unknown', data: 'test' });
    }).not.toThrow();

    // Should not call any handlers
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('should handle malformed JSON gracefully', async () => {
    const onOutput = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHook(() =>
      useAdminBotSSE({
        onOutput,
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];

    // Simulate malformed JSON
    if (eventSource.onmessage) {
      eventSource.onmessage(new MessageEvent('message', { data: '{invalid json}' }));
    }

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });

    expect(onOutput).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('should close connection on unmount', () => {
    const { unmount } = renderHook(() =>
      useAdminBotSSE({
        onOutput: vi.fn(),
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];
    const closeSpy = vi.spyOn(eventSource, 'close');

    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });

  it('should provide close function', () => {
    const { result } = renderHook(() =>
      useAdminBotSSE({
        onOutput: vi.fn(),
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    expect(result.current.close).toBeDefined();
    expect(typeof result.current.close).toBe('function');
  });

  it('should close connection when close function called', () => {
    const { result } = renderHook(() =>
      useAdminBotSSE({
        onOutput: vi.fn(),
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];
    const closeSpy = vi.spyOn(eventSource, 'close');

    result.current.close();

    expect(closeSpy).toHaveBeenCalled();
  });

  it('should handle connection errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHook(() =>
      useAdminBotSSE({
        onOutput: vi.fn(),
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];

    eventSource.simulateError();

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });

    consoleError.mockRestore();
  });

  it('should update callbacks without reconnecting', async () => {
    const onOutput1 = vi.fn();
    const onOutput2 = vi.fn();

    const { rerender } = renderHook(
      ({ onOutput }) =>
        useAdminBotSSE({
          onOutput,
          onError: vi.fn(),
          onExit: vi.fn(),
          onConnected: vi.fn(),
        }),
      {
        initialProps: { onOutput: onOutput1 },
      }
    );

    const eventSource1 = mockEventSourceInstances[0];

    // Send event with first callback
    eventSource1.simulateMessage({ type: 'output', content: 'test1' });

    await waitFor(() => {
      expect(onOutput1).toHaveBeenCalledWith('test1');
    });

    // Update callback
    rerender({ onOutput: onOutput2 });

    // Should not create new EventSource
    expect(EventSource).toHaveBeenCalledTimes(1);

    // Send event with second callback
    eventSource1.simulateMessage({ type: 'output', content: 'test2' });

    await waitFor(() => {
      expect(onOutput2).toHaveBeenCalledWith('test2');
    });

    // First callback should not be called again
    expect(onOutput1).toHaveBeenCalledTimes(1);
  });

  it('should include API key in URL query params', () => {
    renderHook(() =>
      useAdminBotSSE({
        onOutput: vi.fn(),
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];

    expect(eventSource.url).toContain('apiKey=');
  });

  it('should connect to correct endpoint', () => {
    renderHook(() =>
      useAdminBotSSE({
        onOutput: vi.fn(),
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];

    expect(eventSource.url).toContain('/api/admin-bot/chat/stream');
  });

  it('should handle multiple output events in sequence', async () => {
    const onOutput = vi.fn();

    renderHook(() =>
      useAdminBotSSE({
        onOutput,
        onError: vi.fn(),
        onExit: vi.fn(),
        onConnected: vi.fn(),
      })
    );

    const eventSource = mockEventSourceInstances[0];

    eventSource.simulateMessage({ type: 'output', content: 'line 1' });
    eventSource.simulateMessage({ type: 'output', content: 'line 2' });
    eventSource.simulateMessage({ type: 'output', content: 'line 3' });

    await waitFor(() => {
      expect(onOutput).toHaveBeenCalledTimes(3);
    });

    expect(onOutput).toHaveBeenNthCalledWith(1, 'line 1');
    expect(onOutput).toHaveBeenNthCalledWith(2, 'line 2');
    expect(onOutput).toHaveBeenNthCalledWith(3, 'line 3');
  });
});
