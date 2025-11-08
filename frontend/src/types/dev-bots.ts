import type {
  DevBotsAgentPersonality as ContractDevBotsAgentPersonality,
  DevBotsCleanupStatus as ContractDevBotsCleanupStatus,
  DevBotsInteractiveSession as ContractDevBotsInteractiveSession,
  DevBotsInteractiveSessionResponse as ContractDevBotsInteractiveSessionResponse,
  DevBotsInteractiveSessionStartPayload as ContractDevBotsInteractiveSessionStartPayload,
  DevBotsInteractiveHeartbeatPayload as ContractDevBotsInteractiveHeartbeatPayload,
  DevBotsInteractiveInterruptPayload as ContractDevBotsInteractiveInterruptPayload,
  DevBotsInteractiveSessionStatus as ContractDevBotsInteractiveSessionStatus,
  DevBotsScopeViolation as ContractDevBotsScopeViolation,
  DevBotsStatus as ContractDevBotsStatus,
  DevBotsTask as ContractDevBotsTask,
  DevBotsTaskTemplate as ContractDevBotsTaskTemplate,
  DevBotsWorkerStatus as ContractDevBotsWorkerStatus,
  DevBotsWorkspaceSyncResult as ContractDevBotsWorkspaceSyncResult,
  DevBotsWorkspaceSyncStatus as ContractDevBotsWorkspaceSyncStatus,
  DevBotsInteractiveSession as ContractDevBotsInteractiveSession,
  DevBotsInteractiveSessionStatus as ContractDevBotsInteractiveSessionStatus,
  DevBotsInteractiveSessionModelOption as ContractDevBotsInteractiveSessionModelOption,
  DevBotsInteractiveSessionState as ContractDevBotsInteractiveSessionState,
} from '@/types/contracts';

export type DevBotsStatus = ContractDevBotsStatus;
export type DevBotsTask = ContractDevBotsTask;
export type DevBotsScopeViolation = ContractDevBotsScopeViolation;
export type DevBotsCleanupStatus = ContractDevBotsCleanupStatus;
export type DevBotsAgentPersonality = ContractDevBotsAgentPersonality;
export type DevBotsTaskTemplate = ContractDevBotsTaskTemplate;
export type DevBotsWorkerStatus = ContractDevBotsWorkerStatus;
export type DevBotsWorkspaceSyncResult = ContractDevBotsWorkspaceSyncResult;
export type DevBotsWorkspaceSyncStatus = ContractDevBotsWorkspaceSyncStatus;
export type DevBotsInteractiveSession = ContractDevBotsInteractiveSession;
export type DevBotsInteractiveSessionStatus = ContractDevBotsInteractiveSessionStatus;
export type DevBotsInteractiveSessionModelOption = ContractDevBotsInteractiveSessionModelOption;
export type DevBotsInteractiveSessionState = ContractDevBotsInteractiveSessionState;
export type DevBotsInteractiveSessionStatus = ContractDevBotsInteractiveSessionStatus;
export type DevBotsInteractiveSession = ContractDevBotsInteractiveSession;
export type DevBotsInteractiveSessionResponse = ContractDevBotsInteractiveSessionResponse;
export type DevBotsInteractiveSessionStartPayload = ContractDevBotsInteractiveSessionStartPayload;
export type DevBotsInteractiveHeartbeatPayload = ContractDevBotsInteractiveHeartbeatPayload;
export type DevBotsInteractiveInterruptPayload = ContractDevBotsInteractiveInterruptPayload;

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
