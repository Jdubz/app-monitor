import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { LogLine, LogHistory } from '../types/log.types';

const MAX_LOG_LINES = 5000;

export const useLogStream = (socket: Socket | null) => {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const pausedLogsBuffer = useRef<LogLine[]>([]);

  // Subscribe to all logs on mount
  useEffect(() => {
    if (!socket) return;

    socket.emit('subscribe_logs', 'all');

    return () => {
      socket.emit('unsubscribe_logs', 'all');
    };
  }, [socket]);

  // Listen for log history
  useEffect(() => {
    if (!socket) return;

    const handleLogHistory = (data: LogHistory) => {
      setLogs(prev => {
        const combined = [...prev, ...data.logs];
        return combined.slice(-MAX_LOG_LINES);
      });
    };

    socket.on('log_history', handleLogHistory);

    return () => {
      socket.off('log_history', handleLogHistory);
    };
  }, [socket]);

  // Listen for new log lines
  useEffect(() => {
    if (!socket) return;

    const handleLogLine = (logLine: LogLine) => {
      if (isPaused) {
        // Buffer logs when paused
        pausedLogsBuffer.current.push(logLine);
      } else {
        setLogs(prev => {
          const updated = [...prev, logLine];
          return updated.slice(-MAX_LOG_LINES);
        });
      }
    };

    socket.on('log_line', handleLogLine);

    return () => {
      socket.off('log_line', handleLogLine);
    };
  }, [socket, isPaused]);

  // Clear all logs
  const clearLogs = useCallback(() => {
    setLogs([]);
    pausedLogsBuffer.current = [];
  }, []);

  // Toggle pause/resume
  const togglePause = useCallback(() => {
    setIsPaused(prev => {
      if (prev) {
        // Resuming - flush buffered logs
        setLogs(current => {
          const combined = [...current, ...pausedLogsBuffer.current];
          pausedLogsBuffer.current = [];
          return combined.slice(-MAX_LOG_LINES);
        });
      }
      return !prev;
    });
  }, []);

  // Toggle auto-scroll
  const toggleAutoScroll = useCallback(() => {
    setAutoScroll(prev => !prev);
  }, []);

  // Download logs as text file
  const downloadLogs = useCallback(() => {
    const text = logs
      .map(log => {
        const date = new Date(log.timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const ms = date.getMilliseconds().toString().padStart(3, '0');
        const timestamp = `${hours}:${minutes}:${seconds}.${ms}`;
        return `[${timestamp}] [${log.service}] [${log.level}] ${log.message}`;
      })
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-monitor-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [logs]);

  // Request history for a specific service
  const requestHistory = useCallback((serviceName: string, lines: number = 100) => {
    if (!socket) return;
    socket.emit('get_history', { serviceName, lines });
  }, [socket]);

  return {
    logs,
    isPaused,
    autoScroll,
    clearLogs,
    togglePause,
    toggleAutoScroll,
    downloadLogs,
    requestHistory,
    logCount: logs.length,
    bufferedCount: pausedLogsBuffer.current.length,
  };
};
