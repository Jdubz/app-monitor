import type {
  DevBotsAgentPersonality as ContractDevBotsAgentPersonality,
  DevBotsAgentComparison as ContractDevBotsAgentComparison,
  DevBotsAgentMetrics as ContractDevBotsAgentMetrics,
  DevBotsAgentTaskTypeBreakdown as ContractDevBotsAgentTaskTypeBreakdown,
  DevBotsCleanupStatus as ContractDevBotsCleanupStatus,
  DevBotsInteractiveSession as ContractDevBotsInteractiveSession,
  DevBotsInteractiveSessionResponse as ContractDevBotsInteractiveSessionResponse,
  DevBotsInteractiveSessionStartPayload as ContractDevBotsInteractiveSessionStartPayload,
  DevBotsInteractiveHeartbeatPayload as ContractDevBotsInteractiveHeartbeatPayload,
  DevBotsInteractiveInterruptPayload as ContractDevBotsInteractiveInterruptPayload,
  DevBotsInteractiveSessionStatus as ContractDevBotsInteractiveSessionStatus,
  DevBotsInteractiveSessionModelOption as ContractDevBotsInteractiveSessionModelOption,
  DevBotsInteractiveSessionState as ContractDevBotsInteractiveSessionState,
  DevBotsScopeViolation as ContractDevBotsScopeViolation,
  DevBotsStatus as ContractDevBotsStatus,
  DevBotsTask as ContractDevBotsTask,
  DevBotsTaskTemplate as ContractDevBotsTaskTemplate,
  DevBotsWorkerStatus as ContractDevBotsWorkerStatus,
  DevBotsTrackedTaskType as ContractDevBotsTrackedTaskType,
  DevBotsQueueSummary as ContractDevBotsQueueSummary,
  DevBotsQueueItem as ContractDevBotsQueueItem,
  DevBotsQueueBucket as ContractDevBotsQueueBucket,
} from '@/types/contracts';

export type DevBotsStatus = ContractDevBotsStatus;
export type DevBotsTask = ContractDevBotsTask;
export type DevBotsScopeViolation = ContractDevBotsScopeViolation;
export type DevBotsCleanupStatus = ContractDevBotsCleanupStatus;
export type DevBotsAgentPersonality = ContractDevBotsAgentPersonality;
export type DevBotsTaskTemplate = ContractDevBotsTaskTemplate;
export type DevBotsWorkerStatus = ContractDevBotsWorkerStatus;
export type DevBotsInteractiveSession = ContractDevBotsInteractiveSession;
export type DevBotsInteractiveSessionStatus = ContractDevBotsInteractiveSessionStatus;
export type DevBotsInteractiveSessionModelOption = ContractDevBotsInteractiveSessionModelOption;
export type DevBotsInteractiveSessionState = ContractDevBotsInteractiveSessionState;
export type DevBotsInteractiveSessionResponse = ContractDevBotsInteractiveSessionResponse;
export type DevBotsInteractiveSessionStartPayload = ContractDevBotsInteractiveSessionStartPayload;
export type DevBotsInteractiveHeartbeatPayload = ContractDevBotsInteractiveHeartbeatPayload;
export type DevBotsInteractiveInterruptPayload = ContractDevBotsInteractiveInterruptPayload;
export type DevBotsAgentComparison = ContractDevBotsAgentComparison;
export type DevBotsAgentMetrics = ContractDevBotsAgentMetrics;
export type DevBotsAgentTaskTypeBreakdown = ContractDevBotsAgentTaskTypeBreakdown;
export type DevBotsTrackedTaskType = ContractDevBotsTrackedTaskType;

// Queue types - re-exported from shared contracts
export type DevBotsQueueSummary = ContractDevBotsQueueSummary;
export type DevBotsQueueItem = ContractDevBotsQueueItem;
export type DevBotsQueueBucket = ContractDevBotsQueueBucket;

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
  maxWorkers: number;
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
