import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DevBotsInteractiveSessionState } from '@/types/dev-bots';
import {
  getDevBotsInteractiveSession,
  startDevBotsInteractiveSession,
  endDevBotsInteractiveSession,
  sendDevBotsInteractiveHeartbeat,
} from '@/services/api';
import { BoundedLogBuffer } from '@/utils/boundedLogBuffer';
import { createLogger } from '@/utils/logger';
import { useEnhancedSocket } from './useEnhancedSocket';

const DEFAULT_LOG_CAPACITY = 2000;
const log = createLogger('useInteractiveSession');

// Type guard for NotImplementedError (501 response)
function isNotImplementedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { error?: { error?: string } };
  return err.error?.error === 'not_implemented';
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';
type LogSource = 'system' | 'agent' | 'user';

export interface InteractiveLogEntry {
  id: string;
  body: string;
  timestamp: number;
  source: LogSource;
}

export interface UseInteractiveSessionOptions {
  enabled?: boolean;
  maxLogEntries?: number;
}

export interface UseInteractiveSessionResult {
  sessionState: DevBotsInteractiveSessionState | null;
  logs: InteractiveLogEntry[];
  connectionState: ConnectionState;
  isFetching: boolean;
  isStarting: boolean;
  isEnding: boolean;
  error?: string;
  lastHeartbeatAt?: number | null;
  refreshSession: () => Promise<void>;
  startSession: (modelProvider: string, modelName: string) => Promise<void>;
  endSession: () => Promise<void>;
  sendInput: (data: string) => Promise<void>;
  interrupt: () => Promise<void>;
  keepAlive: (source?: 'user' | 'agent') => Promise<void>;
  streamInput: (chunk: string) => Promise<void>;
  notifyResize: (size: { cols: number; rows: number }) => void;
  clearLogs: () => void;
}

export function useInteractiveSession(
  options: UseInteractiveSessionOptions = {},
): UseInteractiveSessionResult {
  const isManuallyEnabled = options.enabled ?? true;
  const maxLogEntries = options.maxLogEntries ?? DEFAULT_LOG_CAPACITY;
  const isEnabled = isManuallyEnabled;

  // Use Socket.IO instead of native WebSocket
  const { socket, isConnected: socketConnected } = useEnhancedSocket();

  const [sessionState, setSessionState] = useState<DevBotsInteractiveSessionState | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isFetching, setIsFetching] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<string>();
  const [logsVersion, setLogsVersion] = useState(0);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(null);

  const logBufferRef = useRef(new BoundedLogBuffer<InteractiveLogEntry>(maxLogEntries));
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatTimerRef = useRef<number>();
  const isMountedRef = useRef(true);
  const joinedSessionRef = useRef<string | null>(null);

  const logs = useMemo(() => logBufferRef.current.toArray(), [logsVersion]);

  const clearLogs = useCallback(() => {
    logBufferRef.current.clear();
    setLogsVersion((value) => value + 1);
  }, []);

  const appendLog = useCallback((entry: InteractiveLogEntry) => {
    logBufferRef.current.push(entry);
    setLogsVersion((value) => value + 1);
  }, []);

  // Join terminal session via Socket.IO
  const joinTerminalSession = useCallback(
    (sessionId: string) => {
      if (!socket || !socketConnected) {
        log.warn('Cannot join terminal session - socket not connected', { sessionId });
        return;
      }

      if (joinedSessionRef.current === sessionId) {
        log.debug('Already joined terminal session', { sessionId });
        return;
      }

      log.info('Joining terminal session via Socket.IO', { sessionId });
      socket.emit('terminal:join', { sessionId });
      joinedSessionRef.current = sessionId;
      setConnectionState('connecting');
    },
    [socket, socketConnected],
  );

  // Leave terminal session via Socket.IO
  const leaveTerminalSession = useCallback(() => {
    if (!socket || !joinedSessionRef.current) {
      return;
    }

    const sessionId = joinedSessionRef.current;
    log.info('Leaving terminal session via Socket.IO', { sessionId });
    socket.emit('terminal:leave', { sessionId });
    joinedSessionRef.current = null;
    setConnectionState('disconnected');
  }, [socket]);

  // Setup Socket.IO event listeners for terminal events
  useEffect(() => {
    if (!socket || !isEnabled) {
      return;
    }

    // Handle terminal:joined confirmation
    const onJoined = (data: { sessionId: string }) => {
      if (!isMountedRef.current) return;
      log.info('Terminal session joined', data);
      setConnectionState('connected');
      appendLog({
        id: 'system-' + Date.now(),
        body: 'Connected to interactive terminal.',
        source: 'system',
        timestamp: Date.now(),
      });
    };

    // Handle terminal:output (stdout/system only - TTY mode merges stderr into stdout)
    const onOutput = (data: {
      sessionId: string;
      stream: 'stdout' | 'system';
      text: string;
      timestamp: string;
    }) => {
      if (!isMountedRef.current) return;
      appendLog({
        id: 'agent-' + Date.now(),
        body: data.text,
        source: data.stream === 'system' ? 'system' : 'agent',
        timestamp: data.timestamp ? Date.parse(data.timestamp) : Date.now(),
      });
    };

    // Handle terminal:status (connected/ended only)
    const onStatus = (data: {
      sessionId: string;
      state: 'connected' | 'ended';
      reason?: string;
    }) => {
      if (!isMountedRef.current) return;

      if (data.state === 'connected') {
        setConnectionState('connected');
        appendLog({
          id: 'system-' + Date.now(),
          body: 'Interactive terminal ready.',
          source: 'system',
          timestamp: Date.now(),
        });
      } else if (data.state === 'ended') {
        setConnectionState('disconnected');
        appendLog({
          id: 'system-' + Date.now(),
          body: data.reason ? `Session ended: ${data.reason}` : 'Session ended',
          source: 'system',
          timestamp: Date.now(),
        });
        sessionIdRef.current = null;
        joinedSessionRef.current = null;
        setSessionState((state) => (state ? { ...state, session: null } : state));
      }
    };

    // Handle terminal:error
    const onError = (data: { sessionId: string; message: string }) => {
      if (!isMountedRef.current) return;
      setError(data.message);
      appendLog({
        id: 'system-' + Date.now(),
        body: `Terminal error: ${data.message}`,
        source: 'system',
        timestamp: Date.now(),
      });
    };

    // Register Socket.IO event listeners
    socket.on('terminal:joined', onJoined);
    socket.on('terminal:output', onOutput);
    socket.on('terminal:status', onStatus);
    socket.on('terminal:error', onError);

    // Cleanup listeners on unmount
    return () => {
      socket.off('terminal:joined', onJoined);
      socket.off('terminal:output', onOutput);
      socket.off('terminal:status', onStatus);
      socket.off('terminal:error', onError);
    };
  }, [socket, isEnabled, appendLog]);

  // Auto-join terminal session when socket connects and session exists
  useEffect(() => {
    if (!socket || !socketConnected || !sessionIdRef.current) {
      return;
    }

    // If we have a session but haven't joined yet, join now
    if (sessionIdRef.current && joinedSessionRef.current !== sessionIdRef.current) {
      joinTerminalSession(sessionIdRef.current);
    }
  }, [socket, socketConnected, joinTerminalSession]);

  const refreshSession = useCallback(async () => {
    if (!isEnabled) {
      setIsFetching(false);
      return;
    }
    setIsFetching(true);
    setError(undefined);
    try {
      const state = await getDevBotsInteractiveSession();
      if (!isMountedRef.current) return;
      setSessionState(state);
      const activeSession = state.session;
      sessionIdRef.current = activeSession?.id ?? null;

      // Join terminal session via Socket.IO if session exists
      if (activeSession?.id && socket && socketConnected) {
        joinTerminalSession(activeSession.id);
      } else if (!activeSession?.id) {
        leaveTerminalSession();
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;

      // Check if this is a 501 Not Implemented error - feature is disabled
      if (isNotImplementedError(err)) {
        // Silently disable the feature - no logging spam
        leaveTerminalSession();
        setIsFetching(false);
        return;
      }

      const message = err instanceof Error ? err.message : 'Failed to load interactive session';
      log.error('Failed to refresh interactive session', { error: err, message });
      setError(message);
      leaveTerminalSession();
    } finally {
      if (isMountedRef.current) {
        setIsFetching(false);
      }
    }
  }, [isEnabled, socket, socketConnected, joinTerminalSession, leaveTerminalSession]);

  const startSession = useCallback(
    async (modelProvider: string, modelName: string) => {
      if (!isEnabled) {
        setError('Interactive sessions are disabled');
        return;
      }
      setIsStarting(true);
      setError(undefined);
      try {
        const state = await startDevBotsInteractiveSession({ modelProvider, modelName });
        if (!isMountedRef.current) return;
        logBufferRef.current.clear();
        setLogsVersion((value) => value + 1);
        setSessionState(state);
        const activeSession = state.session;
        sessionIdRef.current = activeSession?.id ?? null;
        appendLog({
          id: 'system-' + Date.now(),
          body: 'Session started with ' + modelProvider + '/' + modelName,
          source: 'system',
          timestamp: Date.now(),
        });

        // Join terminal session via Socket.IO
        if (activeSession?.id && socket && socketConnected) {
          joinTerminalSession(activeSession.id);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Unable to start interactive session';
        log.error('Failed to start interactive session', { error: err, message, modelProvider, modelName });
        setError(message);
        appendLog({
          id: 'system-' + Date.now(),
          body: 'Failed to start session: ' + message,
          source: 'system',
          timestamp: Date.now(),
        });
      } finally {
        if (isMountedRef.current) {
          setIsStarting(false);
        }
      }
    },
    [appendLog, isEnabled, socket, socketConnected, joinTerminalSession],
  );

  const endSession = useCallback(async () => {
    if (!sessionIdRef.current) {
      return;
    }
    setIsEnding(true);
    setError(undefined);
    try {
      const state = await endDevBotsInteractiveSession();
      if (!isMountedRef.current) return;
      setSessionState(state);
      sessionIdRef.current = null;
      leaveTerminalSession();
      appendLog({
        id: 'system-' + Date.now(),
        body: 'Interactive session ended.',
        source: 'system',
        timestamp: Date.now(),
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to end interactive session';
      log.error('Failed to end interactive session', { error: err, message, sessionId: sessionIdRef.current });
      setError(message);
      appendLog({
        id: 'system-' + Date.now(),
        body: 'Failed to end session: ' + message,
        source: 'system',
        timestamp: Date.now(),
      });
    } finally {
      if (isMountedRef.current) {
        setIsEnding(false);
      }
    }
  }, [appendLog, leaveTerminalSession]);

  const streamInput = useCallback(
    async (chunk: string) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        setError('No active interactive session.');
        return;
      }

      const normalizedChunk = chunk;

      // Send input via Socket.IO only (REST endpoint deprecated and returns 410)
      if (!socket || !socketConnected || joinedSessionRef.current !== sessionId) {
        setError('Socket.IO connection not available. Please reconnect and try again.');
        return;
      }

      // socket.emit doesn't throw - network issues are handled by connection state
      socket.emit('terminal:input', { sessionId, data: normalizedChunk });

      // Show user input in logs
      if (normalizedChunk.endsWith('\n')) {
        const display = normalizedChunk.replace(/\n$/, '');
        if (display) {
          appendLog({
            id: 'user-' + Date.now(),
            body: display,
            source: 'user',
            timestamp: Date.now(),
          });
        }
      }
    },
    [appendLog, socket, socketConnected],
  );

  const notifyResize = useCallback(
    (size: { cols: number; rows: number }) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId || !socket || !socketConnected || joinedSessionRef.current !== sessionId) {
        return;
      }
      socket.emit('terminal:resize', { sessionId, rows: size.rows, cols: size.cols });
    },
    [socket, socketConnected],
  );

  const sendInput = useCallback(
    async (data: string) => {
      const payload = data.endsWith('\n') ? data : data + '\n';
      await streamInput(payload);
    },
    [streamInput],
  );

  const interrupt = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      setError('No active interactive session.');
      return;
    }

    // Send interrupt via Socket.IO (REST API endpoint is deprecated and returns 410)
    if (!socket || !socketConnected || joinedSessionRef.current !== sessionId) {
      setError('Socket.IO connection not available. Please reconnect and try again.');
      return;
    }

    // socket.emit doesn't throw - network issues are handled by connection state
    socket.emit('terminal:signal', { sessionId, signal: 'interrupt' });

    appendLog({
      id: 'system-' + Date.now(),
      body: 'Sent interrupt signal to session.',
      source: 'system',
      timestamp: Date.now(),
    });
  }, [appendLog, socket, socketConnected]);

  const keepAlive = useCallback(async (source: 'user' | 'agent' = 'user') => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      setError('No active interactive session.');
      return;
    }
    try {
      await sendDevBotsInteractiveHeartbeat(sessionId, source);
      setLastHeartbeatAt(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send heartbeat';
      setError(message);
    }
  }, []);

  // Initial session load and cleanup
  useEffect(() => {
    if (!isEnabled) {
      setIsFetching(false);
      return () => {
        isMountedRef.current = false;
      };
    }
    void refreshSession();
    return () => {
      isMountedRef.current = false;
      leaveTerminalSession();
      if (heartbeatTimerRef.current) {
        window.clearInterval(heartbeatTimerRef.current);
      }
    };
  }, [isEnabled, refreshSession, leaveTerminalSession]);

  // Heartbeat timer
  useEffect(() => {
    if (!sessionState?.session?.id) {
      if (heartbeatTimerRef.current) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = undefined;
      }
      return;
    }
    const intervalSeconds = sessionState.heartbeatIntervalSeconds ?? 30;
    const intervalMs = Math.max(5000, intervalSeconds * 1000);
    heartbeatTimerRef.current = window.setInterval(() => {
      void keepAlive();
    }, intervalMs) as unknown as number;
    return () => {
      if (heartbeatTimerRef.current) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = undefined;
      }
    };
  }, [keepAlive, sessionState?.heartbeatIntervalSeconds, sessionState?.session?.id]);

  return {
    sessionState,
    logs,
    connectionState,
    isFetching,
    isStarting,
    isEnding,
    error,
    lastHeartbeatAt,
    refreshSession,
    startSession,
    endSession,
    sendInput,
    interrupt,
    keepAlive,
    streamInput,
    notifyResize,
    clearLogs,
  };
}
