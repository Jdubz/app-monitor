import type { DevBotsTask } from '@app-monitor/api-contracts';

export type DevBotsQueueBucket = 'pending' | 'active' | 'completed';

export interface DevBotsQueueItem {
  task: DevBotsTask;
  bucket: DevBotsQueueBucket;
}

export interface DevBotsQueueSummary {
  items: DevBotsQueueItem[];
  counts: {
    pending: number;
    active: number;
    completed: number;
    failed: number;
  };
  lastUpdated: string;
}

export interface DevBotsTaskHistoryEvent {
  id: string;
  taskId: string;
  type: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface DevBotsTaskDetail {
  task: DevBotsTask;
  history: DevBotsTaskHistoryEvent[];
}

export interface DevBotsSettings {
  modelStrategy: 'alternate' | 'claude-only' | 'codex-only' | 'random';
  maxWorkers: number;
  dryRun: boolean;
  autoCleanup: boolean;
  updatedAt: string;
}

export interface DevBotsTaskLogDescriptor {
  filename: string;
  path: string;
  size: number;
  updatedAt: string;
  stream?: 'stdout' | 'stderr';
}

export interface DevBotsTaskLogsResponse {
  taskId: string;
  stdout: DevBotsTaskLogDescriptor | null;
  stderr: DevBotsTaskLogDescriptor | null;
}
