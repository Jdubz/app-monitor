import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { ParsedCloudLog, CloudLogHistory, CloudLoggingStatus } from '../types/log.types';

interface UseCloudLogsParams {
  socket: Socket | null;
  environment: string;
  service: string;
  severity?: string;
}

export const useCloudLogs = ({ socket, environment, service, severity }: UseCloudLogsParams) => {
  const [logs, setLogs] = useState<ParsedCloudLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloudLoggingStatus, setCloudLoggingStatus] = useState<CloudLoggingStatus | null>(null);

  // Subscribe to cloud logs when params change
  useEffect(() => {
    if (!socket || !environment || !service) return;

    const subscribeData = {
      environment,
      service,
      severity,
    };

    setIsLoading(true);
    setError(null);
    socket.emit('subscribe_cloud_logs', subscribeData);

    return () => {
      socket.emit('unsubscribe_cloud_logs', { environment, service });
    };
  }, [socket, environment, service, severity]);

  // Listen for cloud log history
  useEffect(() => {
    if (!socket) return;

    const handleCloudLogHistory = (data: CloudLogHistory) => {
      if (data.environment === environment && data.service === service) {
        setLogs(data.logs);
        setIsLoading(false);
        setError(null);
      }
    };

    socket.on('cloud_log_history', handleCloudLogHistory);

    return () => {
      socket.off('cloud_log_history', handleCloudLogHistory);
    };
  }, [socket, environment, service]);

  // Listen for errors
  useEffect(() => {
    if (!socket) return;

    const handleError = (data: { message: string }) => {
      setError(data.message);
      setIsLoading(false);
    };

    socket.on('error', handleError);

    return () => {
      socket.off('error', handleError);
    };
  }, [socket]);

  // Check cloud logging status
  useEffect(() => {
    if (!socket) return;

    socket.emit('check_cloud_logging_status');

    const handleCloudLoggingStatus = (status: CloudLoggingStatus) => {
      setCloudLoggingStatus(status);
    };

    socket.on('cloud_logging_status', handleCloudLoggingStatus);

    return () => {
      socket.off('cloud_logging_status', handleCloudLoggingStatus);
    };
  }, [socket]);

  // Refresh logs
  const refreshLogs = useCallback((limit?: number) => {
    if (!socket) return;

    setIsLoading(true);
    setError(null);
    socket.emit('refresh_cloud_logs', {
      environment,
      service,
      severity,
      limit: limit || 100,
    });
  }, [socket, environment, service, severity]);

  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    isLoading,
    error,
    cloudLoggingStatus,
    refreshLogs,
    clearLogs,
  };
};
