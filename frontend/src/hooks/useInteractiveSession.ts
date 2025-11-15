import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DevBotsInteractiveSessionState } from '@/types/dev-bots';
import {
  getDevBotsInteractiveSession,
  startDevBotsInteractiveSession,
  endDevBotsInteractiveSession,
  sendDevBotsInteractiveInput,
  sendDevBotsInteractiveInterrupt,
  sendDevBotsInteractiveHeartbeat,
  getDevBotsInteractiveStreamUrl,
} from '@/services/api';
import { BoundedLogBuffer } from '@/utils/boundedLogBuffer';
import { createLogger } from '@/utils/logger';

const DEFAULT_LOG_CAPACITY = 2000;
const SOCKET_RECONNECT_DELAY_MS = 3000;
const log = createLogger('useInteractiveSession');

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';
type LogSource = 'system' | 'agent' | 'user';

type StreamSocketPayload = {
  type: 'stream';
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
  timestamp?: string;
  level?: string;
};

type StatusSocketPayload = {
  type: 'status';
  state: string;
  reason?: string;
};

type ErrorSocketPayload = {
  type: 'error';
  message: string;
};

type ConnectedSocketPayload = {
  type: 'connected';
  sessionId: string;
  timestamp: string;
};

type SocketPayload = StreamSocketPayload | StatusSocketPayload | ErrorSocketPayload | ConnectedSocketPayload;

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

  const [sessionState, setSessionState] = useState<DevBotsInteractiveSessionState | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isFetching, setIsFetching] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<string>();
  const [logsVersion, setLogsVersion] = useState(0);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(null);

  const logBufferRef = useRef(new BoundedLogBuffer<InteractiveLogEntry>(maxLogEntries));
  const socketRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<number>();
  const heartbeatTimerRef = useRef<number>();
  const isMountedRef = useRef(true);
  const latestStreamUrlRef = useRef<string | undefined>(undefined);
  const suppressNextReconnectRef = useRef(false);

  const logs = useMemo(() => logBufferRef.current.toArray(), [logsVersion]);

  const clearLogs = useCallback(() => {
    logBufferRef.current.clear();
    setLogsVersion((value) => value + 1);
  }, []);

  const appendLog = useCallback((entry: InteractiveLogEntry) => {
    logBufferRef.current.push(entry);
    setLogsVersion((value) => value + 1);
  }, []);

  const parseSocketPayload = useCallback((raw: string): SocketPayload | null => {
    try {
      return JSON.parse(raw) as SocketPayload;
    } catch {
      return null;
    }
  }, []);

  const sendSocketPayload = useCallback((payload: Record<string, unknown>): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch (error: unknown) {
      log.warn('Failed to send socket payload', { error });
      return false;
    }
  }, []);

  const closeSocket = useCallback((options?: { suppressReconnect?: boolean }) => {
    if (options?.suppressReconnect) {
      suppressNextReconnectRef.current = true;
      latestStreamUrlRef.current = undefined;
    }
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = undefined;
    }
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (err) {
        log.warn('Failed to close socket', err);
      }
      socketRef.current = null;
    }
    setConnectionState('disconnected');
  }, []);

  const connectToStream = useCallback(
    (sessionId: string, streamUrl?: string) => {
      if (!isEnabled) {
        return;
      }
      if (typeof window === 'undefined' || typeof window.WebSocket === 'undefined') {
        appendLog({
          id: 'log-' + Date.now(),
          body: 'Interactive streaming is not supported in this environment.',
          source: 'system',
          timestamp: Date.now(),
        });
        setError('Interactive streaming unsupported');
        return;
      }

      closeSocket({ suppressReconnect: true });
      const url = streamUrl ?? getDevBotsInteractiveStreamUrl(sessionId);
      latestStreamUrlRef.current = url;
      setConnectionState('connecting');
      try {
        const socket = new WebSocket(url);
        socketRef.current = socket;

        socket.addEventListener('open', () => {
          if (!isMountedRef.current) return;
          suppressNextReconnectRef.current = false;
          setConnectionState('connected');
          appendLog({
            id: 'system-' + Date.now(),
            body: 'Connected to interactive stream.',
            source: 'system',
            timestamp: Date.now(),
          });
        });

        socket.addEventListener('message', (event) => {
          if (!isMountedRef.current) return;
          const raw = typeof event.data === 'string' ? event.data : '';
          if (!raw) {
            return;
          }
          const payload = parseSocketPayload(raw);
          if (!payload) {
            appendLog({
              id: 'agent-' + Date.now(),
              body: raw,
              source: 'agent',
              timestamp: Date.now(),
            });
            return;
          }

          switch (payload.type) {
            case 'stream':
              appendLog({
                id: 'agent-' + Date.now(),
                body: payload.text,
                source: payload.stream === 'system' ? 'system' : 'agent',
                timestamp: payload.timestamp ? Date.parse(payload.timestamp) : Date.now(),
              });
              break;
            case 'status':
              appendLog({
                id: 'system-' + Date.now(),
                body: payload.reason ? `Session ${payload.state}: ${payload.reason}` : `Session ${payload.state}`,
                source: 'system',
                timestamp: Date.now(),
              });
              if (payload.state === 'closed') {
                sessionIdRef.current = null;
                setSessionState((state) => (state ? { ...state, session: null } : state));
              }
              break;
            case 'error':
              setError(payload.message);
              appendLog({
                id: 'system-' + Date.now(),
                body: `Stream error: ${payload.message}`,
                source: 'system',
                timestamp: Date.now(),
              });
              break;
            case 'connected':
              appendLog({
                id: 'system-' + Date.now(),
                body: 'Interactive stream ready.',
                source: 'system',
                timestamp: Date.now(),
              });
              break;
            default:
              break;
          }
        });

        socket.addEventListener('close', () => {
          if (!isMountedRef.current) return;
          setConnectionState('disconnected');
          if (suppressNextReconnectRef.current) {
            suppressNextReconnectRef.current = false;
            return;
          }
          if (reconnectTimerRef.current || !sessionIdRef.current || !latestStreamUrlRef.current) {
            return;
          }
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = undefined;
            if (sessionIdRef.current && latestStreamUrlRef.current) {
              connectToStream(sessionIdRef.current, latestStreamUrlRef.current);
            }
          }, SOCKET_RECONNECT_DELAY_MS) as unknown as number;
        });

        socket.addEventListener('error', (event) => {
          log.warn('websocket error', { event });
          setConnectionState('disconnected');
        });
      } catch (err) {
        setConnectionState('disconnected');
        setError(err instanceof Error ? err.message : 'Unable to open interactive stream');
      }
    },
    [appendLog, closeSocket, isEnabled, parseSocketPayload],
  );

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
      if (activeSession?.id) {
        const streamUrl = state.stream?.url ?? getDevBotsInteractiveStreamUrl(activeSession.id);
        connectToStream(activeSession.id, streamUrl);
      } else {
        closeSocket({ suppressReconnect: true });
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load interactive session';
      setError(message);
      closeSocket({ suppressReconnect: true });
    } finally {
      if (isMountedRef.current) {
        setIsFetching(false);
      }
    }
  }, [closeSocket, connectToStream, isEnabled]);

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
        if (activeSession?.id) {
          const streamUrl = state.stream?.url ?? getDevBotsInteractiveStreamUrl(activeSession.id);
          connectToStream(activeSession.id, streamUrl);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Unable to start interactive session';
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
    [appendLog, connectToStream, isEnabled],
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
      closeSocket({ suppressReconnect: true });
      appendLog({
        id: 'system-' + Date.now(),
        body: 'Interactive session ended.',
        source: 'system',
        timestamp: Date.now(),
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to end interactive session';
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
  }, [appendLog, closeSocket]);

  const streamInput = useCallback(
    async (chunk: string) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        setError('No active interactive session.');
        return;
      }
      const normalizedChunk = chunk;
      const sent = sendSocketPayload({ type: 'input', data: normalizedChunk });
      if (!sent) {
        try {
          await sendDevBotsInteractiveInput(sessionId, normalizedChunk);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to send input';
          setError(message);
          return;
        }
      }
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
    [appendLog, sendSocketPayload],
  );

  const notifyResize = useCallback(
    (size: { cols: number; rows: number }) => {
      sendSocketPayload({ type: 'resize', cols: size.cols, rows: size.rows });
    },
    [sendSocketPayload],
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
    try {
      const sent = sendSocketPayload({ type: 'signal', signal: 'interrupt' });
      if (!sent) {
        await sendDevBotsInteractiveInterrupt(sessionId);
      }
      appendLog({
        id: 'system-' + Date.now(),
        body: 'Sent interrupt signal to session.',
        source: 'system',
        timestamp: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to interrupt session';
      setError(message);
    }
  }, [appendLog, sendSocketPayload]);

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
      closeSocket({ suppressReconnect: true });
      if (heartbeatTimerRef.current) {
        window.clearInterval(heartbeatTimerRef.current);
      }
    };
  }, [closeSocket, isEnabled, refreshSession]);

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
