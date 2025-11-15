/**
 * Shared utilities, types, and constants for Dev-Bots routes
 *
 * This module contains common code used across all route modules:
 * - Type definitions
 * - Constants and configuration
 * - Utility functions for mapping and transformation
 * - Helper functions for requests and validation
 */

import { Request, Response } from 'express';
import type { Task, TaskExecution } from '../../services/taskQueue.sqlite.js';
import type { InteractiveSessionRecord } from '../../services/database.js';
import type { TaskLogFileDescriptor } from '../../services/taskLogLocator.js';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import type { DevBotsQueueSummary, DevBotsQueueItem } from '@app-monitor/api-contracts';

// ============================================================================
// Type Definitions
// ============================================================================

// Temporary types until fully migrated to API contracts
export type ContractDevBotsTask = Record<string, unknown>;
export type ContractDevBotsTaskDetail = {
  task: Record<string, unknown>;
  history: Array<Record<string, unknown>>
};
export type DevBotsTaskHistoryEvent = Record<string, unknown>;
export type DevBotsTaskStatus = 'pending' | 'active' | 'completed' | 'failed';
export type DevBotsInteractiveSessionState = Record<string, unknown>;
export type DevBotsInteractiveSessionStateResponse = { data: Record<string, unknown> };
export type DevBotsInteractiveSessionModelOption = Record<string, unknown>;
export type DevBotsInteractiveSession = Record<string, unknown>;
export type DevBotsInteractiveSessionStartPayload = {
  modelProvider: string;
  modelName: string;
  metadata?: Record<string, unknown>
};
export type DevBotsInteractiveSessionInputPayload = { data: string };
export type DevBotsInteractiveHeartbeatPayload = {
  sessionId: string;
  source?: 'agent' | 'user'
};
export type DevBotsInteractiveInterruptPayload = { sessionId: string };

export type AllowedInteractiveModel = ReturnType<DevBotsManager['getAllowedInteractiveModels']>[number];

export interface TaskLogsResponsePayload {
  taskId: string;
  stdout: TaskLogFileDescriptor | null;
  stderr: TaskLogFileDescriptor | null;
}

export const LOG_STREAM_TYPES = ['stdout', 'stderr'] as const;
export type LogStreamType = (typeof LOG_STREAM_TYPES)[number];

export interface LogStreamOptions {
  req: Request;
  res: Response;
  filePath: string;
  follow: boolean;
  stream: LogStreamType;
}

// ============================================================================
// Constants
// ============================================================================

export const TECHNICAL_TASK_TYPES = new Set(['refactor', 'implementation', 'bug', 'feature']);
export const MIN_DOCUMENTATION_LENGTH = 50;
export const MIN_ACCEPTANCE_CRITERION_LENGTH = 30;
export const DEFAULT_WORK_TARGET = 'dev-bots';

// Log streaming configuration
const parsedStreamLimit = Number(process.env.MAX_LOG_STREAM_SUBSCRIBERS ?? '5');
export const MAX_LOG_STREAM_SUBSCRIBERS =
  Number.isFinite(parsedStreamLimit) && parsedStreamLimit > 0 ? parsedStreamLimit : 5;

// Interactive session configuration
export const DEFAULT_INTERACTIVE_OWNER_EMAIL = (
  process.env.INTERACTIVE_SESSION_OWNER ?? 'contact@joshwentworth.com'
).toLowerCase();
export const INTERACTIVE_STREAM_BASE_PATH = '/api/dev-bots/interactive/session';
export const INTERACTIVE_HEARTBEAT_INTERVAL_SECONDS = 30;

// ============================================================================
// Request Helper Functions
// ============================================================================

/**
 * Extract user email from request headers
 */
export const getRequestUserEmail = (req: Request): string | undefined => {
  const header = req.headers['x-user-email'];
  if (typeof header === 'string') {
    return header.toLowerCase();
  }
  if (Array.isArray(header) && header[0]) {
    return header[0].toLowerCase();
  }
  return undefined;
};

/**
 * Check if value is a plain object (not array, not null)
 */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

// ============================================================================
// Date/Time Utilities
// ============================================================================

/**
 * Convert timestamp to ISO string, handling various input formats
 */
export const iso = (value?: number | string | null): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Number.isNaN(value)) {
    return undefined;
  }
  return new Date(value).toISOString();
};

/**
 * Compute idle deadline for interactive session
 */
export const computeIdleDeadline = (
  session: InteractiveSessionRecord,
  idleTimeoutMs: number
): string | undefined => {
  const timestamps = [session.startedAt, session.lastUserActivityAt, session.lastAgentActivityAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value)) as number[];
  if (!timestamps.length) {
    return undefined;
  }
  return new Date(Math.max(...timestamps) + idleTimeoutMs).toISOString();
};

// ============================================================================
// Task Mapping Functions
// ============================================================================

/**
 * Map internal task status to API contract status
 */
export const mapTaskStatus = (status: Task['status']): DevBotsTaskStatus => {
  switch (status) {
    case 'running':
      return 'active';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'timeout':
    case 'cancelled':
      return 'failed';
    case 'pending':
    default:
      return 'pending';
  }
};

/**
 * Map Task to API contract format
 */
export const mapTaskToContract = (task: Task): ContractDevBotsTask => ({
  id: task.id,
  type: task.type,
  description: task.description ?? task.documentation ?? '',
  documentation: task.documentation,
  status: mapTaskStatus(task.status),
  createdAt: iso(task.created_at) ?? new Date().toISOString(),
  assignedWorker: task.assigned_worker,
  assignedAgent: task.assigned_agent,
  assignedAt: iso(task.assigned_at),
  completedAt: iso(task.completed_at),
  prompt: task.prompt,
  output: task.output,
  error: task.error,
  exitCode: (task as { exit_code?: number }).exit_code,
  files: task.files ?? [],
  dependencies: task.dependencies ?? [],
  acceptanceCriteria: task.acceptance_criteria ?? [],
  priority: task.priority,
  retryCount: task.retry_count,
  maxRetries: task.max_retries,
  canRetry: task.can_retry,
  architectureReferences: task.architecture_references ?? [],
  validationSteps: task.validation_steps ?? [],
  successMetrics: task.success_metrics ?? [],
  notes: task.notes,
  isPeriodicCleanup: task.is_repair_bot ?? false,
});

/**
 * Map array of tasks to API contract format
 */
export const mapTasksToContract = (tasks: Task[]): ContractDevBotsTask[] =>
  tasks.map(mapTaskToContract);

/**
 * Build queue summary for API response
 */
export const buildQueueSummary = (
  tasks: { pending: Task[]; active: Task[]; completed: Task[] },
  metrics: ReturnType<DevBotsManager['getQueueMetrics']>
): DevBotsQueueSummary => ({
  items: [
    ...tasks.pending.map((task): DevBotsQueueItem => ({ 
      bucket: 'pending', 
      task: mapTaskToContract(task) as any 
    })),
    ...tasks.active.map((task): DevBotsQueueItem => ({ 
      bucket: 'active', 
      task: mapTaskToContract(task) as any 
    })),
    ...tasks.completed.map((task): DevBotsQueueItem => ({ 
      bucket: 'completed', 
      task: mapTaskToContract(task) as any 
    })),
  ],
  counts: {
    pending: metrics.pending,
    active: metrics.running,
    completed: metrics.completed,
    failed: metrics.failed,
  },
  lastUpdated: new Date().toISOString(),
});

/**
 * Build task history events from executions
 */
export const buildTaskHistoryEvents = (
  executions: TaskExecution[]
): DevBotsTaskHistoryEvent[] =>
  executions.map((execution) => ({
    id: `execution-${execution.id}`,
    taskId: execution.task_id,
    type: execution.exit_code === 0 ? 'execution' : 'error',
    message:
      execution.exit_code === 0
        ? `Attempt ${execution.attempt_number} completed`
        : execution.error || `Attempt ${execution.attempt_number} failed`,
    timestamp: iso(execution.started_at) ?? new Date().toISOString(),
    metadata: {
      attemptNumber: execution.attempt_number,
      workerId: execution.worker_id,
      durationMs: execution.duration_ms,
      exitCode: execution.exit_code,
      endedAt: iso(execution.ended_at),
    },
  }));

// ============================================================================
// Interactive Session Mapping Functions
// ============================================================================

/**
 * Map interactive session record to API format
 */
export const mapInteractiveSession = (
  session: InteractiveSessionRecord,
  idleTimeoutMs: number
): DevBotsInteractiveSession => ({
  id: session.id,
  ownerEmail: session.ownerEmail,
  modelProvider: session.modelProvider,
  modelName: session.modelName,
  status: session.status,
  containerId: session.containerId,
  startedAt: session.startedAt,
  lastUserActivityAt: session.lastUserActivityAt,
  lastAgentActivityAt: session.lastAgentActivityAt,
  lastHeartbeatAt: undefined,
  idleTimeoutSeconds: Math.floor(idleTimeoutMs / 1000),
  idleDeadline: computeIdleDeadline(session, idleTimeoutMs),
  reconnectDeadline: undefined,
  endedAt: session.endedAt,
  terminationReason: session.terminationReason,
  contextSnapshot: (session.contextSnapshot ?? null) as DevBotsInteractiveSession['contextSnapshot'],
  logPath: session.logPath,
  metadata: session.metadata,
});

/**
 * Map interactive model option to API format
 */
export const mapInteractiveModelOption = (
  model: AllowedInteractiveModel
): DevBotsInteractiveSessionModelOption => ({
  provider: model.provider,
  model: model.name,
  displayName:
    model.displayName ??
    (model.name === '*' ? `${model.provider.toUpperCase()} (any)` : `${model.provider}:${model.name}`),
  description: model.description,
  default: model.default,
});

/**
 * Build interactive session state for API response
 */
export const buildInteractiveSessionState = (
  devBotsManager: DevBotsManager
): DevBotsInteractiveSessionState => {
  const idleTimeoutMs = devBotsManager.getInteractiveIdleTimeoutMs();
  const session = devBotsManager.getActiveInteractiveSession();
  const mappedSession = session ? mapInteractiveSession(session, idleTimeoutMs) : null;
  const availableModels = devBotsManager.getAllowedInteractiveModels().map(mapInteractiveModelOption);
  const baseState: DevBotsInteractiveSessionState = {
    session: mappedSession,
    availableModels,
    heartbeatIntervalSeconds: INTERACTIVE_HEARTBEAT_INTERVAL_SECONDS,
    idleTimeoutSeconds: Math.floor(idleTimeoutMs / 1000),
    stream: mappedSession
      ? {
          sessionId: mappedSession.id,
          url: `${INTERACTIVE_STREAM_BASE_PATH}/${mappedSession.id}/stream`,
        }
      : undefined,
  };
  if (!mappedSession) {
    return {
      ...baseState,
      warnings: ['No active interactive session'],
    };
  }
  return baseState;
};

// ============================================================================
// Server-Sent Events (SSE) Utilities
// ============================================================================

/**
 * Write Server-Sent Event to response stream
 */
export const writeSseEvent = (res: Response, event: string, data: unknown) => {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
};

/**
 * Stream log file with SSE, handling follower limits
 * NOTE: Log streaming functionality deprecated - keeping stub for compatibility
 */
export const streamLogFile = async ({ res }: LogStreamOptions) => {
  // Log streaming removed - return not implemented
  res.status(501).json({
    error: 'Not Implemented',
    message: 'Log streaming has been removed. Use task logs API instead.'
  });
  return;
};
