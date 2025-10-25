import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import {
  DevMonitorLogLine,
  LocalService,
  LogHistory,
} from '@jsdubzw/job-finder-shared-types';

const MAX_LOG_LINES = 10000; // Keep more logs globally

interface LogContextValue {
  // All logs by service
  logsByService: Map<LocalService, DevMonitorLogLine[]>;

  // Get logs for a specific service
  getLogsForService: (service: LocalService | 'all') => DevMonitorLogLine[];

  // Clear logs for a specific service or all
  clearLogs: (service?: LocalService) => void;

  // Subscribe/unsubscribe to services
  subscribeToService: (service: LocalService) => void;
  unsubscribeFromService: (service: LocalService) => void;

  // Connection status
  isConnected: boolean;
}

const LogContext = createContext<LogContextValue | undefined>(undefined);

interface LogProviderProps {
  socket: Socket | null;
  children: React.ReactNode;
}

export const LogProvider: React.FC<LogProviderProps> = ({ socket, children }) => {
  // Store logs by service for efficient filtering
  const [logsByService, setLogsByService] = useState<Map<LocalService, DevMonitorLogLine[]>>(
    new Map()
  );
  const [isConnected, setIsConnected] = useState(false);
  const subscriptions = useRef<Set<LocalService>>(new Set());

  // Initialize subscriptions and set up socket listeners
  useEffect(() => {
    if (!socket) return;

    // Connection status handlers
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    setIsConnected(socket.connected);

    // Log line handler
    const handleLogLine = (logLine: DevMonitorLogLine) => {
      setLogsByService((prev) => {
        const updated = new Map(prev);
        const serviceLogs = updated.get(logLine.service) || [];

        // Add new log and trim if necessary
        const newLogs = [...serviceLogs, logLine].slice(-MAX_LOG_LINES);
        updated.set(logLine.service, newLogs);

        return updated;
      });
    };

    // Log history handler
    const handleLogHistory = (data: LogHistory) => {
      const service = data.serviceName as LocalService;
      setLogsByService((prev) => {
        const updated = new Map(prev);
        const existingLogs = updated.get(service) || [];

        // Merge history with existing logs, removing duplicates by ID
        const logMap = new Map<string, DevMonitorLogLine>();
        [...existingLogs, ...data.logs].forEach(log => logMap.set(log.id, log));
        const merged = Array.from(logMap.values())
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-MAX_LOG_LINES);

        updated.set(service, merged);
        return updated;
      });
    };

    socket.on('log_line', handleLogLine);
    socket.on('log_history', handleLogHistory);

    // Subscribe to 'all' by default to catch all logs
    socket.emit('subscribe_logs', 'all');
    subscriptions.current.add('all');

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('log_line', handleLogLine);
      socket.off('log_history', handleLogHistory);

      // Unsubscribe from all services
      subscriptions.current.forEach(service => {
        socket.emit('unsubscribe_logs', service);
      });
      subscriptions.current.clear();
    };
  }, [socket]);

  // Get logs for a specific service or all services
  const getLogsForService = useCallback((service: LocalService | 'all'): DevMonitorLogLine[] => {
    if (service === 'all') {
      // Combine all logs from all services and sort by timestamp
      const allLogs: DevMonitorLogLine[] = [];
      logsByService.forEach((logs) => {
        allLogs.push(...logs);
      });
      return allLogs.sort((a, b) => a.timestamp - b.timestamp);
    }

    return logsByService.get(service) || [];
  }, [logsByService]);

  // Clear logs for a specific service or all services
  const clearLogs = useCallback((service?: LocalService) => {
    setLogsByService((prev) => {
      if (!service) {
        // Clear all logs
        return new Map();
      }

      // Clear specific service
      const updated = new Map(prev);
      updated.delete(service);
      return updated;
    });
  }, []);

  // Subscribe to a specific service
  const subscribeToService = useCallback((service: LocalService) => {
    if (!socket || subscriptions.current.has(service)) return;

    socket.emit('subscribe_logs', service);
    subscriptions.current.add(service);

    // Request history for this service
    socket.emit('get_history', { serviceName: service, lines: 100 });
  }, [socket]);

  // Unsubscribe from a specific service
  const unsubscribeFromService = useCallback((service: LocalService) => {
    if (!socket || !subscriptions.current.has(service)) return;

    socket.emit('unsubscribe_logs', service);
    subscriptions.current.delete(service);
  }, [socket]);

  const value: LogContextValue = {
    logsByService,
    getLogsForService,
    clearLogs,
    subscribeToService,
    unsubscribeFromService,
    isConnected,
  };

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
};

// Custom hook to use the log context
export const useLogContext = (): LogContextValue => {
  const context = useContext(LogContext);
  if (!context) {
    throw new Error('useLogContext must be used within a LogProvider');
  }
  return context;
};
