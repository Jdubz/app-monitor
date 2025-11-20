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
 * @param onEvent - Callback for handling SSE messages
 * @returns Ref to EventSource instance
 */
export function useSSE(onEvent: (event: MessageEvent) => void) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const apiKey = import.meta.env.VITE_API_KEY || '';

    // EventSource doesn't support custom headers, so pass API key as query param
    const url = `${apiUrl}/api/sse/events?apiKey=${encodeURIComponent(apiKey)}`;

    const eventSource = new EventSource(url);

    // Handle incoming messages
    eventSource.onmessage = onEvent;

    // Handle connection open
    eventSource.onopen = () => {
      console.log('[SSE] Connected to event stream');
    };

    // Handle errors (EventSource automatically reconnects)
    eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
      // EventSource will automatically attempt to reconnect
    };

    eventSourceRef.current = eventSource;

    // Cleanup on unmount
    return () => {
      console.log('[SSE] Closing event stream');
      eventSource.close();
    };
  }, [onEvent]);

  return eventSourceRef;
}
