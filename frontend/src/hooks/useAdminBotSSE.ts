/**
 * useAdminBotSSE Hook
 *
 * Manages Server-Sent Events (SSE) connection for Admin Bot chat streaming.
 * Connects to /api/admin-bot/chat/stream and handles output, error, and exit events.
 */

import { useEffect, useRef, useCallback } from 'react';

export interface AdminBotSSEEvent {
  type: 'connected' | 'output' | 'error' | 'exit';
  content?: string;
  code?: number | null;
  timestamp?: number;
}

export interface AdminBotSSEOptions {
  onOutput?: (content: string) => void;
  onError?: (content: string) => void;
  onExit?: (code: number | null) => void;
  onConnected?: () => void;
}

/**
 * Hook for managing Admin Bot SSE connection
 *
 * @param options - Callbacks for different event types
 * @returns Object with connection status and manual close function
 */
export function useAdminBotSSE(options: AdminBotSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const callbacksRef = useRef(options);

  // Keep callbacks up to date without triggering reconnection
  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  // Close connection manually (for cleanup or user action)
  const close = useCallback(() => {
    if (eventSourceRef.current) {
      console.log('[AdminBotSSE] Manually closing connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    const apiKey = import.meta.env.VITE_API_KEY || '';

    // EventSource doesn't support custom headers, so pass API key as query param
    const url = `${apiUrl}/api/admin-bot/chat/stream?apiKey=${encodeURIComponent(apiKey)}`;

    console.log('[AdminBotSSE] Connecting to', url);
    const eventSource = new EventSource(url);

    // Generic message handler (for all data: events)
    eventSource.onmessage = (event) => {
      try {
        const data: AdminBotSSEEvent = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            console.log('[AdminBotSSE] Connected to admin bot stream');
            callbacksRef.current.onConnected?.();
            break;

          case 'output':
            if (data.content) {
              callbacksRef.current.onOutput?.(data.content);
            }
            break;

          case 'error':
            if (data.content) {
              callbacksRef.current.onError?.(data.content);
            }
            break;

          case 'exit':
            console.log('[AdminBotSSE] Session exited with code:', data.code);
            callbacksRef.current.onExit?.(data.code ?? null);
            break;

          default:
            console.warn('[AdminBotSSE] Unknown event type:', data);
        }
      } catch (error) {
        console.error('[AdminBotSSE] Failed to parse event:', error);
      }
    };

    // Handle errors
    eventSource.onerror = (error) => {
      // Check if connection failed due to auth or other reasons
      if (eventSource.readyState === EventSource.CLOSED) {
        console.error('[AdminBotSSE] Connection closed', error);
        eventSource.close();
        return;
      }

      console.error('[AdminBotSSE] Connection error:', error);
      // EventSource will automatically attempt to reconnect for transient errors
    };

    eventSourceRef.current = eventSource;

    // Cleanup on unmount
    return () => {
      console.log('[AdminBotSSE] Closing event stream (component unmount)');
      eventSource.close();
    };
  }, []); // Empty deps - only connect once per mount

  return {
    close,
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN,
  };
}
