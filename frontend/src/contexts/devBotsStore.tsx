import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Socket } from 'socket.io-client';
import type {
  DevBotsStatus,
  DevBotsTask,
  DevBotsWorkerStatus,
} from '@app-monitor/api-contracts';
import type {
  DevBotsQueueSummary,
  DevBotsTaskDetail,
  DevBotsSettings,
  DevBotsTaskLogsResponse,
} from '@/types/dev-bots';

import {
  api,
  getDevBotsSettings,
  getDevBotsStatus,
  getDevBotsQueue,
  getDevBotsTaskDetail,
  getDevBotsTaskLogs,
} from '@/services/api';

type QueueFilter = 'pending' | 'active' | 'completed' | 'failed';
type QueueRow = DevBotsQueueSummary['items'][number];

type TaskLogsDescriptor = DevBotsTaskLogsResponse;

interface DevBotsStoreValue {
  status: DevBotsStatus | null;
  isLoading: boolean;
  error?: string;
  queueFilter: QueueFilter;
  setQueueFilter: (filter: QueueFilter) => void;
  queueSummary: DevBotsQueueSummary | null;
  queueRows: QueueRow[];
  filteredRows: QueueRow[];
  selectedTaskId: string | null;
  selectTask: (taskId: string | null) => void;
  selectedTask: DevBotsTask | null;
  selectedTaskDetail: DevBotsTaskDetail | null;
  taskDetailLoading: boolean;
  taskDetailError?: string;
  taskLogs: TaskLogsDescriptor | null;
  refreshTaskDetail: () => Promise<void>;
  workers: Record<string, DevBotsWorkerStatus>;
  selectedWorkerId: string | null;
  selectWorker: (workerId: string | null) => void;
  settings: DevBotsSettings | null;
  settingsLoading: boolean;
  settingsError?: string;
  settingsUpdating: boolean;
  settingsUpdateError?: string;
  refreshSettings: () => Promise<void>;
  updateSettings: (payload: Partial<DevBotsSettings>) => Promise<void>;
  refreshStatus: () => Promise<void>;
}

const DevBotsStoreContext = createContext<DevBotsStoreValue | undefined>(undefined);

interface DevBotsStoreProviderProps {
  children: React.ReactNode;
  socket?: Socket | null;
}

const INITIAL_TASK_LOGS: TaskLogsDescriptor | null = null;

export function DevBotsStoreProvider({ children, socket }: DevBotsStoreProviderProps) {
  const [status, setStatus] = useState<DevBotsStatus | null>(null);
  const [queueSummary, setQueueSummary] = useState<DevBotsQueueSummary | null>(null);
  const [settings, setSettings] = useState<DevBotsSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string>();
  const [settingsUpdating, setSettingsUpdating] = useState(false);
  const [settingsUpdateError, setSettingsUpdateError] = useState<string>();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('pending');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<DevBotsTaskDetail | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [taskDetailError, setTaskDetailError] = useState<string>();
  const [taskLogs, setTaskLogs] = useState<TaskLogsDescriptor | null>(INITIAL_TASK_LOGS);

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const [statusResult, queueResult] = await Promise.all([
        getDevBotsStatus(),
        getDevBotsQueue(),
      ]);
      if (!isMountedRef.current) {
        return;
      }
      setStatus(statusResult);
      setQueueSummary(queueResult);

      setSelectedTaskId((current) => {
        if (current) return current;
        const firstPending = queueResult.items.find((item) => item.bucket === 'pending');
        const firstActive = queueResult.items.find((item) => item.bucket === 'active');
        return firstPending?.task.id ?? firstActive?.task.id ?? null;
      });
      setSelectedWorkerId((current) => {
        if (current) return current;
        const workerIds = Object.keys(statusResult.workers);
        return workerIds[0] ?? null;
      });
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Failed to load Dev-Bots status. Please retry.';
      setError(message);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(undefined);
    try {
      const result = await getDevBotsSettings();
      if (!isMountedRef.current) return;
      setSettings(result);
    } catch (err) {
      if (!isMountedRef.current) return;
      setSettingsError(
        err instanceof Error ? err.message : 'Unable to load Dev-Bots settings at this time.',
      );
    } finally {
      if (isMountedRef.current) {
        setSettingsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void fetchSettings();
  }, [refreshStatus, fetchSettings]);

  useEffect(() => {
    if (!socket) return;
    const handleTaskUpdates = () => {
      void refreshStatus();
    };
    socket.on('task:created', handleTaskUpdates);
    socket.on('task:updated', handleTaskUpdates);
    socket.on('task:completed', handleTaskUpdates);
    socket.on('task:failed', handleTaskUpdates);
    socket.on('task:started', handleTaskUpdates);
    socket.on('task:assigned', handleTaskUpdates);
    return () => {
      socket.off('task:created', handleTaskUpdates);
      socket.off('task:updated', handleTaskUpdates);
      socket.off('task:completed', handleTaskUpdates);
      socket.off('task:failed', handleTaskUpdates);
      socket.off('task:started', handleTaskUpdates);
      socket.off('task:assigned', handleTaskUpdates);
    };
  }, [socket, refreshStatus]);

  const fetchTaskDetail = useCallback(
    async (taskId: string | null) => {
      if (!taskId) {
        setSelectedTaskDetail(null);
        setTaskDetailError(undefined);
        setTaskLogs(INITIAL_TASK_LOGS);
        return;
      }

      setTaskDetailLoading(true);
      setTaskDetailError(undefined);
      try {
        const [detail, logs] = await Promise.all([
          getDevBotsTaskDetail(taskId),
          getDevBotsTaskLogs(taskId),
        ]);
        if (!isMountedRef.current) return;
        setSelectedTaskDetail(detail);
        setTaskLogs({
          taskId,
          stdout: logs.stdout,
          stderr: logs.stderr,
        });
      } catch (err) {
        if (!isMountedRef.current) return;
        setSelectedTaskDetail(null);
        setTaskLogs(null);
        setTaskDetailError(
          err instanceof Error ? err.message : 'Unable to load task details at this time.',
        );
      } finally {
        if (isMountedRef.current) {
          setTaskDetailLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void fetchTaskDetail(selectedTaskId);
  }, [selectedTaskId, fetchTaskDetail]);

  const queueRows = useMemo<QueueRow[]>(() => {
    if (queueSummary) {
      return queueSummary.items;
    }
    if (!status) {
      return [];
    }
    const pending = status.tasks.pending.map((task) => ({ task, bucket: 'pending' as const }));
    const active = status.tasks.active.map((task) => ({ task, bucket: 'active' as const }));
    const completed = status.tasks.completed.map((task) => ({ task, bucket: 'completed' as const }));
    return [...pending, ...active, ...completed];
  }, [queueSummary, status]);

  const filteredRows = useMemo(() => {
    switch (queueFilter) {
      case 'failed':
        return queueRows.filter((row) => row.task.status === 'failed');
      default:
        return queueRows.filter((row) => row.bucket === queueFilter);
    }
  }, [queueRows, queueFilter]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return queueRows.find((row) => row.task.id === selectedTaskId)?.task ?? null;
  }, [queueRows, selectedTaskId]);

  const workers = useMemo(() => status?.workers ?? {}, [status]);

  const updateSettings = useCallback(
    async (payload: Partial<DevBotsSettings>) => {
      if (!settings) return;
      setSettingsUpdating(true);
      setSettingsUpdateError(undefined);
      try {
        const request = {
          modelStrategy: payload.modelStrategy ?? settings.modelStrategy,
          maxWorkers: payload.maxWorkers ?? settings.maxWorkers,
          dryRun: payload.dryRun ?? settings.dryRun,
          autoCleanup: payload.autoCleanup ?? settings.autoCleanup,
        };
        const updated = await api.put<DevBotsSettings>('/dev-bots/settings', request);
        if (!isMountedRef.current) return;
        setSettings(updated);
      } catch (err) {
        if (!isMountedRef.current) return;
        setSettingsUpdateError(
          err instanceof Error ? err.message : 'Failed to update Dev-Bots settings.',
        );
        throw err;
      } finally {
        if (isMountedRef.current) {
          setSettingsUpdating(false);
        }
      }
    },
    [settings],
  );

  const value = useMemo<DevBotsStoreValue>(
    () => ({
      status,
      workers,
      isLoading,
      error,
      queueFilter,
      setQueueFilter,
      queueSummary,
      queueRows,
      filteredRows,
      selectedTaskId,
      selectTask: setSelectedTaskId,
      selectedTask,
      selectedTaskDetail,
      taskDetailLoading,
      taskDetailError,
      taskLogs,
      refreshTaskDetail: () => fetchTaskDetail(selectedTaskId),
      selectedWorkerId,
      selectWorker: setSelectedWorkerId,
      settings,
      settingsLoading,
      settingsError,
      settingsUpdating,
      settingsUpdateError,
      refreshSettings: fetchSettings,
      updateSettings,
      refreshStatus,
    }),
    [
      status,
      workers,
      isLoading,
      error,
      queueFilter,
      queueSummary,
      queueRows,
      filteredRows,
      selectedTaskId,
      selectedTask,
      selectedTaskDetail,
      taskDetailLoading,
      taskDetailError,
      taskLogs,
      fetchTaskDetail,
      selectedWorkerId,
      settings,
      settingsLoading,
      settingsError,
      settingsUpdating,
      settingsUpdateError,
      fetchSettings,
      updateSettings,
      refreshStatus,
    ],
  );

  return <DevBotsStoreContext.Provider value={value}>{children}</DevBotsStoreContext.Provider>;
}

export function useDevBotsStore(): DevBotsStoreValue {
  const context = useContext(DevBotsStoreContext);
  if (!context) {
    throw new Error('useDevBotsStore must be used within DevBotsStoreProvider');
  }
  return context;
}
