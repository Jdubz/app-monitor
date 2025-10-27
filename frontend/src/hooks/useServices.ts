import { useState, useEffect, useCallback } from 'react';
import { ProcessInfo } from '../types/service.types';
import { getAllStatuses, startService, stopService, restartService, killService, handleApiError } from '../services/api';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5174';

export const useServices = () => {
  const [services, setServices] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Fetch all service statuses
  const fetchStatuses = useCallback(async () => {
    try {
      setError(null);
      const statuses = await getAllStatuses();
      setServices(statuses);
    } catch (err) {
      const errorMessage = handleApiError(err);
      setError(errorMessage);
      console.error('Failed to fetch service statuses:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize Socket.IO connection for real-time updates
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('Socket.IO connected');
    });

    newSocket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
    });

    // Listen for status changes
    newSocket.on('status_change', (data: { serviceName: string; status: string; error?: string }) => {
      setServices(prev =>
        prev.map(service =>
          service.name === data.serviceName
            ? { ...service, status: data.status as ProcessInfo['status'], error: data.error }
            : service
        )
      );
    });

    // Listen for initial statuses
    newSocket.on('initial_statuses', (statuses: ProcessInfo[]) => {
      setServices(statuses);
      // Only set loading to false if we have services or after initial HTTP fetch completes
      // This prevents showing "No services configured" if backend is still initializing
      if (statuses.length > 0) {
        setLoading(false);
      }
    });

    // Listen for all statuses update
    newSocket.on('all_statuses', (statuses: ProcessInfo[]) => {
      setServices(statuses);
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  // Poll for updates every 10 seconds as backup to Socket.IO
  useEffect(() => {
    const interval = setInterval(fetchStatuses, 10000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  // Service control actions with optimistic updates
  const handleStart = useCallback(async (serviceName: string) => {
    // Optimistic update
    setServices(prev =>
      prev.map(s => s.name === serviceName ? { ...s, status: 'starting' as const, error: undefined } : s)
    );

    try {
      const updatedService = await startService(serviceName);
      setServices(prev =>
        prev.map(s => s.name === serviceName ? updatedService : s)
      );
    } catch (err) {
      const errorMessage = handleApiError(err);
      setServices(prev =>
        prev.map(s => s.name === serviceName ? { ...s, status: 'error' as const, error: errorMessage } : s)
      );
      throw new Error(errorMessage);
    }
  }, []);

  const handleStop = useCallback(async (serviceName: string, graceful: boolean = true) => {
    // Optimistic update
    setServices(prev =>
      prev.map(s => s.name === serviceName ? { ...s, status: 'stopping' as const, error: undefined } : s)
    );

    try {
      const updatedService = await stopService(serviceName, graceful);
      setServices(prev =>
        prev.map(s => s.name === serviceName ? updatedService : s)
      );
    } catch (err) {
      const errorMessage = handleApiError(err);
      setServices(prev =>
        prev.map(s => s.name === serviceName ? { ...s, status: 'error' as const, error: errorMessage } : s)
      );
      throw new Error(errorMessage);
    }
  }, []);

  const handleRestart = useCallback(async (serviceName: string, graceful: boolean = true) => {
    // Optimistic update
    setServices(prev =>
      prev.map(s => s.name === serviceName ? { ...s, status: 'stopping' as const, error: undefined } : s)
    );

    try {
      const updatedService = await restartService(serviceName, graceful);
      setServices(prev =>
        prev.map(s => s.name === serviceName ? updatedService : s)
      );
    } catch (err) {
      const errorMessage = handleApiError(err);
      setServices(prev =>
        prev.map(s => s.name === serviceName ? { ...s, status: 'error' as const, error: errorMessage } : s)
      );
      throw new Error(errorMessage);
    }
  }, []);

  const handleKill = useCallback(async (serviceName: string) => {
    // Optimistic update
    setServices(prev =>
      prev.map(s => s.name === serviceName ? { ...s, status: 'stopping' as const, error: undefined } : s)
    );

    try {
      const updatedService = await killService(serviceName);
      setServices(prev =>
        prev.map(s => s.name === serviceName ? updatedService : s)
      );
    } catch (err) {
      const errorMessage = handleApiError(err);
      setServices(prev =>
        prev.map(s => s.name === serviceName ? { ...s, status: 'error' as const, error: errorMessage } : s)
      );
      throw new Error(errorMessage);
    }
  }, []);

  return {
    services,
    loading,
    error,
    socket,
    refresh: fetchStatuses,
    startService: handleStart,
    stopService: handleStop,
    restartService: handleRestart,
    killService: handleKill,
  };
};
