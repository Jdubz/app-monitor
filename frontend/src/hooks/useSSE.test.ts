import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSSE } from './useSSE';

// Mock EventSource
class MockEventSource {
  url: string;
  readyState: number = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners: Map<string, Set<EventListener>> = new Map();

  // EventSource constants
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  constructor(url: string) {
    this.url = url;
    this.readyState = MockEventSource.OPEN;
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
  }

  // Test helper methods
  simulateMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  simulateEvent(type: string, data: string): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const event = new MessageEvent(type, { data });
      listeners.forEach(listener => listener(event));
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateClose(): void {
    this.readyState = MockEventSource.CLOSED;
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// Global reference to track EventSource instances
let mockEventSourceInstance: MockEventSource | null = null;

describe('useSSE', () => {
  beforeEach(() => {
    // Clear environment variables to test defaults
    delete import.meta.env.VITE_API_BASE_URL;
    delete import.meta.env.VITE_API_KEY;

    // Mock EventSource globally with static constants
    global.EventSource = vi.fn((url: string) => {
      mockEventSourceInstance = new MockEventSource(url);
      return mockEventSourceInstance as any;
    }) as any;

    // Set static constants on global EventSource
    (global.EventSource as any).CONNECTING = MockEventSource.CONNECTING;
    (global.EventSource as any).OPEN = MockEventSource.OPEN;
    (global.EventSource as any).CLOSED = MockEventSource.CLOSED;

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockEventSourceInstance = null;
    vi.clearAllMocks();
  });

  it('creates EventSource connection on mount', () => {
    const onTaskEvent = vi.fn();

    renderHook(() => useSSE(onTaskEvent));

    expect(global.EventSource).toHaveBeenCalledWith(
      expect.stringContaining('/api/sse/events?apiKey=')
    );
    expect(mockEventSourceInstance).not.toBeNull();
  });

  it('closes EventSource connection on unmount', () => {
    const onTaskEvent = vi.fn();

    const { unmount } = renderHook(() => useSSE(onTaskEvent));

    expect(mockEventSourceInstance?.readyState).toBe(MockEventSource.OPEN);

    unmount();

    expect(mockEventSourceInstance?.readyState).toBe(MockEventSource.CLOSED);
    expect(console.log).toHaveBeenCalledWith('[SSE] Closing event stream');
  });

  it('handles connection message', () => {
    const onTaskEvent = vi.fn();

    renderHook(() => useSSE(onTaskEvent));

    mockEventSourceInstance?.simulateMessage('{"type":"connected"}');

    expect(console.log).toHaveBeenCalledWith('[SSE] Connected to event stream');
  });

  it('handles task:added event', () => {
    const onTaskEvent = vi.fn();
    const taskData = { id: 'task-123', status: 'pending', type: 'test' };

    renderHook(() => useSSE(onTaskEvent));

    mockEventSourceInstance?.simulateEvent('task:added', JSON.stringify(taskData));

    expect(onTaskEvent).toHaveBeenCalledWith(taskData);
  });

  it('handles task:assigned event', () => {
    const onTaskEvent = vi.fn();
    const taskData = { id: 'task-456', status: 'assigned', agent: 'claude' };

    renderHook(() => useSSE(onTaskEvent));

    mockEventSourceInstance?.simulateEvent('task:assigned', JSON.stringify(taskData));

    expect(onTaskEvent).toHaveBeenCalledWith(taskData);
  });

  it('handles task:started event', () => {
    const onTaskEvent = vi.fn();
    const taskData = { id: 'task-789', status: 'active' };

    renderHook(() => useSSE(onTaskEvent));

    mockEventSourceInstance?.simulateEvent('task:started', JSON.stringify(taskData));

    expect(onTaskEvent).toHaveBeenCalledWith(taskData);
  });

  it('handles task:completed event', () => {
    const onTaskEvent = vi.fn();
    const taskData = { id: 'task-321', status: 'completed', result: 'success' };

    renderHook(() => useSSE(onTaskEvent));

    mockEventSourceInstance?.simulateEvent('task:completed', JSON.stringify(taskData));

    expect(onTaskEvent).toHaveBeenCalledWith(taskData);
  });

  it('handles task:failed event', () => {
    const onTaskEvent = vi.fn();
    const taskData = { id: 'task-654', status: 'failed', error: 'timeout' };

    renderHook(() => useSSE(onTaskEvent));

    mockEventSourceInstance?.simulateEvent('task:failed', JSON.stringify(taskData));

    expect(onTaskEvent).toHaveBeenCalledWith(taskData);
  });

  it('handles system:status event when onSystemEvent provided', () => {
    const onTaskEvent = vi.fn();
    const onSystemEvent = vi.fn();
    const statusData = { workerCount: 2, maxWorkers: 4 };

    renderHook(() => useSSE(onTaskEvent, onSystemEvent));

    mockEventSourceInstance?.simulateEvent('system:status', JSON.stringify(statusData));

    expect(onSystemEvent).toHaveBeenCalledWith(statusData);
  });

  it('handles system:health event when onSystemEvent provided', () => {
    const onTaskEvent = vi.fn();
    const onSystemEvent = vi.fn();
    const healthData = { healthy: true, timestamp: Date.now() };

    renderHook(() => useSSE(onTaskEvent, onSystemEvent));

    mockEventSourceInstance?.simulateEvent('system:health', JSON.stringify(healthData));

    expect(onSystemEvent).toHaveBeenCalledWith(healthData);
  });

  it('does not crash when onSystemEvent not provided', () => {
    const onTaskEvent = vi.fn();

    renderHook(() => useSSE(onTaskEvent));

    // Should not throw when system event received but no handler
    mockEventSourceInstance?.simulateEvent('system:status', '{"workerCount":1}');

    expect(onTaskEvent).not.toHaveBeenCalled();
  });

  it('handles invalid JSON in task event gracefully', () => {
    const onTaskEvent = vi.fn();

    renderHook(() => useSSE(onTaskEvent));

    mockEventSourceInstance?.simulateEvent('task:added', 'invalid json');

    expect(console.error).toHaveBeenCalledWith(
      '[SSE] Failed to parse task event:',
      expect.any(Error)
    );
    expect(onTaskEvent).not.toHaveBeenCalled();
  });

  it('handles invalid JSON in connection message gracefully', () => {
    const onTaskEvent = vi.fn();

    renderHook(() => useSSE(onTaskEvent));

    mockEventSourceInstance?.simulateMessage('not valid json');

    expect(console.error).toHaveBeenCalledWith(
      '[SSE] Failed to parse message:',
      expect.any(Error)
    );
  });

  it('handles transient connection errors', () => {
    const onTaskEvent = vi.fn();

    renderHook(() => useSSE(onTaskEvent));

    // Simulate transient error (readyState still OPEN)
    if (mockEventSourceInstance) {
      mockEventSourceInstance.readyState = MockEventSource.OPEN;
    }
    mockEventSourceInstance?.simulateError();

    expect(console.error).toHaveBeenCalledWith('[SSE] Connection error:', expect.any(Event));
    // EventSource should auto-reconnect for transient errors
  });

  it('handles authentication failure (connection closed)', () => {
    const onTaskEvent = vi.fn();

    renderHook(() => useSSE(onTaskEvent));

    // Simulate auth failure (connection closed with readyState CLOSED)
    // The mock sets readyState to CLOSED before calling onerror
    mockEventSourceInstance?.simulateClose();

    // Should log both error messages (first the error, then it checks readyState)
    expect(console.error).toHaveBeenCalledWith(
      '[SSE] Connection closed, likely authentication failure',
      expect.any(Event)
    );
  });

  it('uses stable callback references to prevent reconnections', () => {
    const onTaskEvent = vi.fn();
    let renderCount = 0;

    const { rerender } = renderHook(() => {
      renderCount++;
      return useSSE(onTaskEvent);
    });

    const initialInstance = mockEventSourceInstance;
    expect(global.EventSource).toHaveBeenCalledTimes(1);

    // Rerender with same callback
    rerender();

    // Should NOT create new EventSource (stable connection)
    expect(global.EventSource).toHaveBeenCalledTimes(1);
    expect(mockEventSourceInstance).toBe(initialInstance);
    expect(renderCount).toBe(2);
  });

  it('updates callback ref without reconnecting', () => {
    let callback = vi.fn();

    const { rerender } = renderHook(({ onTaskEvent }) => useSSE(onTaskEvent), {
      initialProps: { onTaskEvent: callback }
    });

    const initialInstance = mockEventSourceInstance;

    // Change callback reference
    callback = vi.fn();
    rerender({ onTaskEvent: callback });

    // Should NOT reconnect
    expect(mockEventSourceInstance).toBe(initialInstance);
    expect(global.EventSource).toHaveBeenCalledTimes(1);

    // New callback should be called
    mockEventSourceInstance?.simulateEvent('task:added', '{"id":"test"}');
    expect(callback).toHaveBeenCalledWith({ id: 'test' });
  });

  it('includes API key in URL query parameter', () => {
    const onTaskEvent = vi.fn();

    renderHook(() => useSSE(onTaskEvent));

    expect(global.EventSource).toHaveBeenCalledWith(
      expect.stringMatching(/\?apiKey=/)
    );
  });

  it('uses correct API URL from environment', () => {
    const onTaskEvent = vi.fn();

    renderHook(() => useSSE(onTaskEvent));

    // Check that URL uses window origin when VITE_API_BASE_URL is not set
    // In test environment (jsdom), window.location.origin is typically http://localhost:3000
    expect(global.EventSource).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/localhost:\d+\/api\/sse\/events/)
    );
  });

  it('registers all task event listeners', () => {
    const onTaskEvent = vi.fn();

    renderHook(() => useSSE(onTaskEvent));

    // Verify all task event types are registered
    const instance = mockEventSourceInstance!;
    expect(instance['listeners'].has('task:added')).toBe(true);
    expect(instance['listeners'].has('task:assigned')).toBe(true);
    expect(instance['listeners'].has('task:started')).toBe(true);
    expect(instance['listeners'].has('task:completed')).toBe(true);
    expect(instance['listeners'].has('task:failed')).toBe(true);
  });

  it('registers all system event listeners', () => {
    const onTaskEvent = vi.fn();
    const onSystemEvent = vi.fn();

    renderHook(() => useSSE(onTaskEvent, onSystemEvent));

    // Verify all system event types are registered
    const instance = mockEventSourceInstance!;
    expect(instance['listeners'].has('system:status')).toBe(true);
    expect(instance['listeners'].has('system:health')).toBe(true);
  });
});
