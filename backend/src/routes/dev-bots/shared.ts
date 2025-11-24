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
import type { TaskLogFileDescriptor } from '../../services/taskLogLocator.js';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import type {
  DevBotsQueueSummary,
  DevBotsQueueItem,
  DevBotsTask,
  DevBotsTaskStatus as ApiDevBotsTaskStatus
} from '@app-monitor/api-contracts';

// ============================================================================
// Type Definitions
// ============================================================================

// Temporary types until fully migrated to API contracts
export type ContractDevBotsTaskDetail = {
  task: DevBotsTask;
  history: Array<Record<string, unknown>>
};
export type DevBotsTaskHistoryEvent = Record<string, unknown>;

export interface TaskLogsResponsePayload {
  taskId: string;
  stdout: TaskLogFileDescriptor | null;
  stderr: TaskLogFileDescriptor | null;
}

// ============================================================================
// Constants
// ============================================================================

export const TECHNICAL_TASK_TYPES = new Set(['refactor', 'implementation', 'bug', 'feature']);
export const MIN_DOCUMENTATION_LENGTH = 50;
export const MIN_ACCEPTANCE_CRITERION_LENGTH = 30;
export const DEFAULT_WORK_TARGET = 'dev-bots';

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

// computeIdleDeadline removed - no longer used after interactive session migration

// ============================================================================
// Task Mapping Functions
// ============================================================================

/**
 * Map internal task status to API contract status
 */
export const mapTaskStatus = (status: Task['status']): ApiDevBotsTaskStatus => {
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
export const mapTaskToContract = (task: Task): DevBotsTask => ({
  id: task.id,
  type: task.type,
  description: task.description ?? task.documentation ?? '',
  documentation: task.documentation,
  status: mapTaskStatus(task.status),
  createdAt: iso(task.created_at) ?? new Date().toISOString(),
  assignedWorker: task.assigned_worker || undefined,
  assignedAgent: task.assigned_agent,
  assignedAt: iso(task.assigned_at),
  completedAt: iso(task.completed_at),
  prompt: task.prompt,
  output: task.output,
  error: task.error,
  exitCode: (task as { exit_code?: number }).exit_code,
  files: task.files ?? [],
  dependencies: task.dependencies ?? [],
  acceptanceCriteria: task.acceptance_criteria?.join('\n'),
  priority: task.priority,
  retryCount: task.retry_count,
  maxRetries: task.max_retries,
  canRetry: task.can_retry,
  notes: task.notes,
  // Phase system fields
  phaseIndex: task.phase_index,
  phaseName: task.phase_name,
  phaseStatus: task.phase_status,
  phaseAttempts: task.phase_attempts,
});

/**
 * Map array of tasks to API contract format
 */
export const mapTasksToContract = (tasks: Task[]): DevBotsTask[] =>
  tasks.map(mapTaskToContract);

/**
 * Build queue summary for API response
 */
export const buildQueueSummary = (
  tasks: { pending: Task[]; active: Task[]; blocked: Task[]; completed: Task[]; failed: Task[] },
  metrics: ReturnType<DevBotsManager['getQueueMetrics']>
): DevBotsQueueSummary => ({
  items: [
    ...tasks.pending.map((task): DevBotsQueueItem => ({
      bucket: 'pending',
      task: mapTaskToContract(task)
    })),
    ...tasks.active.map((task): DevBotsQueueItem => ({
      bucket: 'active',
      task: mapTaskToContract(task)
    })),
    ...tasks.blocked.map((task): DevBotsQueueItem => ({
      bucket: 'blocked',
      task: mapTaskToContract(task)
    })),
    ...tasks.completed.map((task): DevBotsQueueItem => ({
      bucket: 'completed',
      task: mapTaskToContract(task)
    })),
    ...tasks.failed.map((task): DevBotsQueueItem => ({
      bucket: 'failed',
      task: mapTaskToContract(task)
    })),
  ],
  counts: {
    pending: metrics.pending,
    active: metrics.running,
    blocked: metrics.blocked,
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
// Interactive Session Mapping Functions - REMOVED
// ============================================================================
// All interactive session mapping functions have been removed as part of the
// migration to the new tmux-based terminal system. The old InteractiveSessionManager
// has been replaced with a stub, and these mapping functions are no longer used.

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
