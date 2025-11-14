import { useState, useEffect, useCallback } from 'react';
import { getPortStatuses, killPortProcess as apiKillPortProcess } from '../services/api';
import type { PortStatusMap } from '@/types/contracts';
import { createLogger } from '@/utils/logger';

interface UsePortStatusReturn {
  portStatuses: PortStatusMap;
  loading: boolean;
  error: string | null;
  killPortProcess: (port: number) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook to poll port statuses and provide port management functionality
 * @param pollInterval - Interval in milliseconds to poll for port statuses (default: 5000)
 */
const log = createLogger('usePortStatus');

export const usePortStatus = (pollInterval: number = 5000): UsePortStatusReturn => {
  const [portStatuses, setPortStatuses] = useState<PortStatusMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPortStatuses = useCallback(async () => {
    try {
      const statuses = await getPortStatuses();
      setPortStatuses(statuses);
      setError(null);
    } catch (err) {
      log.error('Failed to fetch port statuses', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch port statuses');
    } finally {
      setLoading(false);
    }
  }, []);

  const killPortProcess = useCallback(async (port: number) => {
    try {
      const result = await apiKillPortProcess(port);
      if (result.success) {
        // Refresh port statuses immediately after killing
        await fetchPortStatuses();
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      log.error(`Failed to kill process on port ${port}`, err);
      throw err;
    }
  }, [fetchPortStatuses]);

  // Initial fetch
  useEffect(() => {
    fetchPortStatuses();
  }, [fetchPortStatuses]);

  // Polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPortStatuses();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [fetchPortStatuses, pollInterval]);

  return {
    portStatuses,
    loading,
    error,
    killPortProcess,
    refresh: fetchPortStatuses,
  };
};
