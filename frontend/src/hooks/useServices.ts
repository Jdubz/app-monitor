import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { createLogger } from '@/utils/logger';
import { getApiBaseUrl } from '@/utils/apiBaseUrl';

const SOCKET_URL = getApiBaseUrl();
const log = createLogger('useSocket');

/**
 * Hook for Socket.IO connection
 * Used for real-time dev-bots updates
 */
export const useServices = () => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      log.info('Socket connected');
    });

    newSocket.on('disconnect', () => {
      log.warn('Socket disconnected');
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return { socket };
};
