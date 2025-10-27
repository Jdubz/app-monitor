/**
 * React Hook for Enhanced Socket Service
 * 
 * Provides easy access to socket connection with health monitoring
 */

import { useState, useEffect, useCallback } from 'react';
import { createSocketService, SocketService, ConnectionState, HealthMetrics } from '../services/socketService';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5174';

export function useEnhancedSocket() {
  const [socketService, setSocketService] = useState<SocketService | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    isReconnecting: false,
    reconnectAttempts: 0,
  });
  const [healthMetrics, setHealthMetrics] = useState<HealthMetrics>({
    latency: 0,
    lastPingAt: 0,
    lastPongAt: 0,
    isHealthy: false,
  });

  // Initialize socket service
  useEffect(() => {
    const service = createSocketService({
      url: SOCKET_URL,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });

    // Listen to connection state changes
    service.on('connection:state', (state: ConnectionState) => {
      console.log('[useEnhancedSocket] Connection state:', state);
      setConnectionState(state);
    });

    // Listen to health updates
    service.on('health:update', (metrics: HealthMetrics) => {
      setHealthMetrics(metrics);
    });

    // Listen to reconnection events
    service.on('connection:reconnected', (attempts: number) => {
      console.log('[useEnhancedSocket] Reconnected after', attempts, 'attempts');
    });

    service.on('connection:failed', () => {
      console.error('[useEnhancedSocket] Connection failed');
    });

    setSocketService(service);

    // Cleanup on unmount
    return () => {
      service.destroy();
    };
  }, []);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    if (socketService) {
      socketService.disconnect();
      setTimeout(() => {
        socketService.connect();
      }, 100);
    }
  }, [socketService]);

  // Get socket instance (for backward compatibility)
  const socket = socketService?.getSocket() || null;

  return {
    socket,
    socketService,
    connectionState,
    healthMetrics,
    isConnected: connectionState.isConnected,
    isReconnecting: connectionState.isReconnecting,
    reconnectAttempts: connectionState.reconnectAttempts,
    latency: healthMetrics.latency,
    isHealthy: healthMetrics.isHealthy,
    reconnect,
  };
}
