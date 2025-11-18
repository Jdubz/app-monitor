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
    const apiKey = import.meta.env.VITE_API_KEY;

    // Warn if API key is missing in production
    if (!apiKey) {
      log.warn('VITE_API_KEY is not set - Socket.IO authentication will fail if required', {
        env: import.meta.env.MODE,
        hasKey: !!apiKey,
      });
    }

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: {
        apiKey,
      },
    });

    newSocket.on('connect', () => {
      log.info('Socket connected');
    });

    newSocket.on('connect_error', (error) => {
      log.error('Socket connection error', 'useServices', error);
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
