/**
 * useSSE Hook
 *
 * Manages Server-Sent Events (SSE) connection for real-time updates.
 * Automatically handles reconnection via EventSource API.
 */

import { useEffect, useRef } from 'react';

export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Connect to SSE endpoint and handle incoming events
 *
 * @param onTaskEvent - Callback for task-related events
 * @param onSystemEvent - Callback for system events
 * @returns Ref to EventSource instance
 */
export function useSSE(
  onTaskEvent: (data: unknown) => void,
  onSystemEvent?: (data: unknown) => void
) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onTaskEventRef = useRef(onTaskEvent);
  const onSystemEventRef = useRef(onSystemEvent);

  // Keep callback refs up to date
  useEffect(() => {
    onTaskEventRef.current = onTaskEvent;
    onSystemEventRef.current = onSystemEvent;
  }, [onTaskEvent, onSystemEvent]);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const apiKey = import.meta.env.VITE_API_KEY || '';

    // EventSource doesn't support custom headers, so pass API key as query param
    const url = `${apiUrl}/api/sse/events?apiKey=${encodeURIComponent(apiKey)}`;

    const eventSource = new EventSource(url);

    // Generic message handler (for connection message)
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          console.log('[SSE] Connected to event stream');
        }
      } catch (error) {
        console.error('[SSE] Failed to parse message:', error);
      }
    };

    // Listen for specific event types sent via `event:` field
    const handleTaskEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        onTaskEventRef.current(data);
      } catch (error) {
        console.error('[SSE] Failed to parse task event:', error);
      }
    };

    const handleSystemEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (onSystemEventRef.current) {
          onSystemEventRef.current(data);
        }
      } catch (error) {
        console.error('[SSE] Failed to parse system event:', error);
      }
    };

    // Register listeners for specific event types
    eventSource.addEventListener('task:added', handleTaskEvent);
    eventSource.addEventListener('task:assigned', handleTaskEvent);
    eventSource.addEventListener('task:started', handleTaskEvent);
    eventSource.addEventListener('task:completed', handleTaskEvent);
    eventSource.addEventListener('task:failed', handleTaskEvent);
    eventSource.addEventListener('system:status', handleSystemEvent);
    eventSource.addEventListener('system:health', handleSystemEvent);

    // Handle errors
    eventSource.onerror = (error) => {
      // Check if connection failed due to auth (readyState = 2 = CLOSED)
      if (eventSource.readyState === EventSource.CLOSED) {
        console.error('[SSE] Connection closed, likely authentication failure', error);
        eventSource.close();
        return;
      }

      console.error('[SSE] Connection error:', error);
      // EventSource will automatically attempt to reconnect for transient errors
    };

    eventSourceRef.current = eventSource;

    // Cleanup on unmount
    return () => {
      console.log('[SSE] Closing event stream');
      eventSource.close();
    };
  }, []); // Empty deps - only connect once

  return eventSourceRef;
}
