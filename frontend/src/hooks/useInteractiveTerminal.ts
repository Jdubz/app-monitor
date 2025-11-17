/**
 * Interactive Terminal Hook - V0
 *
 * Clean, simple React hook for managing interactive terminal sessions.
 * Uses Socket.IO for real-time PTY streams and REST API for session lifecycle.
 *
 * Key Features:
 * - Session lifecycle: start, stop, reset
 * - Real-time PTY streams via Socket.IO /terminal namespace
 * - Automatic reconnection after server_migration events
 * - Terminal resize support
 * - Clean error handling and loading states
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { apiClient } from '@/services/ApiClient';

export type SessionStatus = 'starting' | 'running' | 'disconnected' | 'terminating' | 'ended' | 'error';

export interface InteractiveSession {
  id: string;
  ownerEmail: string;
  modelProvider: string;
  modelName: string;
  status: SessionStatus;
  containerId: string | null;
  startedAt: string;
  lastUserActivityAt: string | null;
  lastAgentActivityAt: string | null;
  endedAt: string | null;
  terminationReason: string | null;
  contextSnapshot: unknown;
  logPath: string | null;
  metadata: unknown;
}

interface UseInteractiveTerminalOptions {
  autoStart?: boolean;
}

export interface UseInteractiveTerminalReturn {
  // Session state
  session: InteractiveSession | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Terminal output
  output: string;

  // Actions
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  resetSession: () => Promise<void>;
  sendInput: (input: string) => void;
  resize: (rows: number, cols: number) => void;

  // Connection management
  reconnect: () => void;
}

/**
 * Hook for managing interactive terminal sessions
 */
export function useInteractiveTerminal(
  options: UseInteractiveTerminalOptions = {}
): UseInteractiveTerminalReturn {
  const { autoStart = false } = options;

  // State
  const [session, setSession] = useState<InteractiveSession | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState('');

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Connect to Socket.IO /terminal namespace
   */
  const connectSocket = useCallback((sessionId: string) => {
    // Clean up existing socket
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    // Create new socket connection with session ID
    const socket = io('/terminal', {
      query: { sessionId },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[InteractiveTerminal] Socket connected');
      setIsConnected(true);
      setError(null);
    });

    socket.on('disconnect', (reason) => {
      console.log('[InteractiveTerminal] Socket disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('terminal:ready', () => {
      console.log('[InteractiveTerminal] Terminal ready');
    });

    socket.on('terminal:output', ({ output: terminalOutput }: { output: string }) => {
      setOutput((prev) => prev + terminalOutput);
    });

    socket.on('terminal:ended', () => {
      console.log('[InteractiveTerminal] Terminal ended');
      setIsConnected(false);
    });

    socket.on('terminal:error', ({ message }: { message: string }) => {
      console.error('[InteractiveTerminal] Terminal error:', message);
      setError(message);
    });

    socket.on('error', ({ message }: { message: string }) => {
      console.error('[InteractiveTerminal] Socket error:', message);
      setError(message);
    });

    socketRef.current = socket;
  }, []);

  /**
   * Start a new interactive terminal session
   */
  const startSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.post<{
        success: boolean;
        data: {
          sessionId: string;
          containerId: string;
          session: InteractiveSession;
        };
      }>('/api/dev-bots/interactive/start');

      if (!response.success) {
        throw new Error('Failed to start session');
      }

      const { session: newSession } = response.data;
      setSession(newSession);
      setOutput(''); // Clear output for new session

      // Connect Socket.IO to the new session
      connectSocket(newSession.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start session';
      setError(message);
      console.error('[InteractiveTerminal] Start session error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [connectSocket]);

  /**
   * Stop the current session
   */
  const stopSession = useCallback(async () => {
    if (!session) return;

    try {
      setIsLoading(true);
      setError(null);

      await apiClient.post(`/api/dev-bots/interactive/${session.id}/stop`, {
        reason: 'User requested',
      });

      // Disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      setSession(null);
      setIsConnected(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop session';
      setError(message);
      console.error('[InteractiveTerminal] Stop session error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  /**
   * Reset the current session (stops old container, starts fresh one)
   */
  const resetSession = useCallback(async () => {
    if (!session) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.post<{
        success: boolean;
        data: {
          sessionId: string;
          containerId: string;
          session: InteractiveSession;
        };
      }>(`/api/dev-bots/interactive/${session.id}/reset`);

      if (!response.success) {
        throw new Error('Failed to reset session');
      }

      const { session: resetedSession } = response.data;
      setSession(resetedSession);
      setOutput(''); // Clear output for reset session

      // Reconnect socket
      connectSocket(resetedSession.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset session';
      setError(message);
      console.error('[InteractiveTerminal] Reset session error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [session, connectSocket]);

  /**
   * Send input to the terminal
   */
  const sendInput = useCallback((input: string) => {
    if (!socketRef.current || !isConnected) {
      console.warn('[InteractiveTerminal] Cannot send input - socket not connected');
      return;
    }

    socketRef.current.emit('terminal:input', { input });
  }, [isConnected]);

  /**
   * Resize the terminal
   */
  const resize = useCallback((rows: number, cols: number) => {
    if (!socketRef.current || !isConnected) {
      return;
    }

    socketRef.current.emit('terminal:resize', { rows, cols });
  }, [isConnected]);

  /**
   * Reconnect to existing session after server restart
   */
  const reconnect = useCallback(() => {
    if (!session) return;

    console.log('[InteractiveTerminal] Reconnecting to session:', session.id);
    setError(null);
    connectSocket(session.id);
  }, [session, connectSocket]);

  /**
   * Handle server_migration events
   */
  useEffect(() => {
    const handleServerMigration = (event: CustomEvent) => {
      console.log('[InteractiveTerminal] Server migration detected:', event.detail);

      // Disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      setIsConnected(false);

      // Schedule reconnection after the specified delay
      const reconnectDelay = event.detail?.reconnectDelay || 5000;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[InteractiveTerminal] Attempting reconnection after server migration');
        reconnect();
      }, reconnectDelay);
    };

    window.addEventListener('server_migration' as any, handleServerMigration);

    return () => {
      window.removeEventListener('server_migration' as any, handleServerMigration);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [reconnect]);

  /**
   * Auto-start session if requested
   */
  useEffect(() => {
    if (autoStart && !session && !isLoading) {
      startSession();
    }
  }, [autoStart, session, isLoading, startSession]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    session,
    isConnected,
    isLoading,
    error,
    output,
    startSession,
    stopSession,
    resetSession,
    sendInput,
    resize,
    reconnect,
  };
}
