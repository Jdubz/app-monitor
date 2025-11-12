/**
 * Dev-Bots Management Routes
 * 
 * Comprehensive API for Dev-Bots system:
 * - System status and health
 * - Task management
 * - Agent management
 * - Templates and guidelines
 * - Docker integration
 * - Workspace synchronization
 * - Emergency recovery
 * 
 * Total: 30+ endpoints organized into logical groups
 */

import fs from 'fs';
import { Router, Request, Response, NextFunction } from 'express';
import type { DevBotsManager } from '../services/devBotsManager.js';
import { logger } from '../utils/logger.js';
import type { LogEntry } from '../utils/logger.js';
import {
  validateTaskTemplate,
  formatValidationErrors,
  shouldValidateAsV3Template
} from '../services/taskTemplateValidator.js';
import type {
  ApiError,
  ApiSuccess,
} from '@app-monitor/api-contracts';
import { config } from '../config.js';

// Temporary types until API contracts are updated
type DevBotsQueueSummary = {
  items: Array<{ bucket: 'pending' | 'active' | 'completed'; task: Record<string, unknown> }>;
  counts: { pending: number; active: number; completed: number; failed: number };
  lastUpdated: string;
};
type ContractDevBotsTask = Record<string, unknown>;
type ContractDevBotsTaskDetail = { task: Record<string, unknown>; history: Array<Record<string, unknown>> };
type DevBotsTaskHistoryEvent = Record<string, unknown>;
type DevBotsTaskStatus = 'pending' | 'active' | 'completed' | 'failed';
type DevBotsInteractiveSessionState = Record<string, unknown>;
type DevBotsInteractiveSessionStateResponse = { data: Record<string, unknown> };
type DevBotsInteractiveSessionModelOption = Record<string, unknown>;
type DevBotsInteractiveSession = Record<string, unknown>;
type DevBotsInteractiveSessionStartPayload = { modelProvider: string; modelName: string; metadata?: Record<string, unknown> };
type DevBotsInteractiveSessionInputPayload = { data: string };
type DevBotsInteractiveHeartbeatPayload = { sessionId: string; source?: 'agent' | 'user' };
type DevBotsInteractiveInterruptPayload = { sessionId: string };
import type { Task, TaskExecution } from '../services/taskQueue.sqlite.js';
import type { InteractiveSessionRecord } from '../services/database.js';
import { WorkerLogLocator } from '../services/taskLogLocator.js';
import { LogStreamAccessTracker } from '../services/logStreamAccessTracker.js';
import { getTaskContextService } from '../services/taskContext.service.js';

const TECHNICAL_TASK_TYPES = new Set(['refactor', 'implementation', 'bug', 'feature']);
const MIN_DOCUMENTATION_LENGTH = 50;
const MIN_ACCEPTANCE_CRITERION_LENGTH = 30;
const DEFAULT_WORK_TARGET = 'dev-bots';
const LOG_STREAM_TYPES = ['stdout', 'stderr'] as const;
type LogStreamType = (typeof LOG_STREAM_TYPES)[number];
const parsedStreamLimit = Number(process.env.MAX_LOG_STREAM_SUBSCRIBERS ?? '5');
const MAX_LOG_STREAM_SUBSCRIBERS =
  Number.isFinite(parsedStreamLimit) && parsedStreamLimit > 0 ? parsedStreamLimit : 5;
const logStreamAccessTracker = new LogStreamAccessTracker(MAX_LOG_STREAM_SUBSCRIBERS);

const DEFAULT_INTERACTIVE_OWNER_EMAIL = (process.env.INTERACTIVE_SESSION_OWNER ?? 'contact@joshwentworth.com').toLowerCase();
const INTERACTIVE_STREAM_BASE_PATH = '/api/dev-bots/interactive/session';
const INTERACTIVE_HEARTBEAT_INTERVAL_SECONDS = 30;

type AllowedInteractiveModel = ReturnType<DevBotsManager['getAllowedInteractiveModels']>[number];

const getRequestUserEmail = (req: Request): string | undefined => {
  const header = req.headers['x-user-email'];
  if (typeof header === 'string') {
    return header.toLowerCase();
  }
  if (Array.isArray(header) && header[0]) {
    return header[0].toLowerCase();
  }
  return undefined;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

// Import the actual type from taskLogLocator
import type { TaskLogFileDescriptor } from '../services/taskLogLocator.js';

interface TaskLogsResponsePayload {
  taskId: string;
  stdout: TaskLogFileDescriptor | null;
  stderr: TaskLogFileDescriptor | null;
}

const iso = (value?: number | string | null): string | undefined => {
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

const mapTaskStatus = (status: Task['status']): DevBotsTaskStatus => {
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

const mapTaskToContract = (task: Task): ContractDevBotsTask => ({
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
  exitCode: (task as {exit_code?: number}).exit_code,
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

const mapTasksToContract = (tasks: Task[]): ContractDevBotsTask[] => tasks.map(mapTaskToContract);

const buildQueueSummary = (
  tasks: { pending: Task[]; active: Task[]; completed: Task[] },
  metrics: ReturnType<DevBotsManager['getQueueMetrics']>,
): DevBotsQueueSummary => ({
  items: [
    ...tasks.pending.map((task) => ({ bucket: 'pending' as const, task: mapTaskToContract(task) })),
    ...tasks.active.map((task) => ({ bucket: 'active' as const, task: mapTaskToContract(task) })),
    ...tasks.completed.map((task) => ({ bucket: 'completed' as const, task: mapTaskToContract(task) })),
  ],
  counts: {
    pending: metrics.pending,
    active: metrics.running,
    completed: metrics.completed,
    failed: metrics.failed,
  },
  lastUpdated: new Date().toISOString(),
});

const buildTaskHistoryEvents = (executions: TaskExecution[]): DevBotsTaskHistoryEvent[] =>
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

const mapInteractiveSession = (
  session: InteractiveSessionRecord,
  idleTimeoutMs: number,
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

const mapInteractiveModelOption = (
  model: AllowedInteractiveModel,
): DevBotsInteractiveSessionModelOption => ({
  provider: model.provider,
  model: model.name,
  displayName:
    model.displayName ??
    (model.name === '*' ? `${model.provider.toUpperCase()} (any)` : `${model.provider}:${model.name}`),
  description: model.description,
  default: model.default,
});

const computeIdleDeadline = (session: InteractiveSessionRecord, idleTimeoutMs: number): string | undefined => {
  const timestamps = [session.startedAt, session.lastUserActivityAt, session.lastAgentActivityAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value)) as number[];
  if (!timestamps.length) {
    return undefined;
  }
  return new Date(Math.max(...timestamps) + idleTimeoutMs).toISOString();
};

const buildInteractiveSessionState = (devBotsManager: DevBotsManager): DevBotsInteractiveSessionState => {
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

const writeSseEvent = (res: Response, event: string, data: unknown) => {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
};

interface LogStreamOptions {
  req: Request;
  res: Response;
  filePath: string;
  follow: boolean;
  stream: LogStreamType;
}

const streamLogFile = async ({ req, res, filePath, follow, stream }: LogStreamOptions) => {
  let slotAcquired = false;
  const streamKey = filePath;

  if (follow) {
    slotAcquired = logStreamAccessTracker.tryAcquire(streamKey);
    if (!slotAcquired) {
      logger.warn({
        category: 'api',
        action: 'log_stream_limit_reached',
        message: `Rejected ${stream} log stream due to subscriber limit`,
        details: { filePath, limit: MAX_LOG_STREAM_SUBSCRIBERS },
      });
      res.status(429).json({
        error: 'Log stream limit reached',
        message: `Only ${MAX_LOG_STREAM_SUBSCRIBERS} concurrent followers are allowed per ${stream} stream.`,
      });
      return;
    }
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as Response & { flushHeaders?: () => void }).flushHeaders?.();
  res.write('retry: 3000\n\n');

  let bytesRead = 0;
  let remainder = '';
  let closed = false;
  let currentRead: Promise<void> = Promise.resolve();

  const heartbeat = setInterval(() => {
    if (!closed) {
      res.write(': keep-alive\n\n');
    }
  }, 15000);

  const releaseFollowSlot = () => {
    if (!slotAcquired) {
      return;
    }
    logStreamAccessTracker.release(streamKey);
    slotAcquired = false;
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    watcher?.close();
    releaseFollowSlot();
    res.end();
  };

  let pumpInProgress = false;
  let pumpQueued = false;
  const pump = (start: number) =>
    new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(filePath, { encoding: 'utf-8', start });

      const writeLine = (line: string) => {
        if (closed) {
          readStream.destroy();
          return;
        }

        const canContinue = res.write(`data: ${line}\n\n`);
        if (!canContinue) {
          readStream.pause();
          res.once('drain', () => {
            if (!closed) {
              readStream.resume();
            }
          });
        }
      };

      readStream.on('data', (chunk: string | Buffer) => {
        const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString();
        bytesRead += Buffer.byteLength(chunkStr);
        const combined = remainder + chunkStr;
        const lines = combined.split(/\r?\n/);
        remainder = lines.pop() ?? '';
        for (const line of lines) {
          writeLine(line);
        }
      });

      readStream.on('end', () => {
        resolve();
      });

      readStream.on('error', (error) => {
        reject(error);
      });
    });

  const schedulePump = () => {
    if (closed) {
      return;
    }
    if (pumpInProgress) {
      pumpQueued = true;
      return;
    }
    pumpInProgress = true;
    const nextRead = currentRead
      .then(() => pump(bytesRead))
      .catch(handleError)
      .finally(() => {
        pumpInProgress = false;
        if (pumpQueued) {
          pumpQueued = false;
          schedulePump();
        }
      });
    currentRead = nextRead;
  };

  const handleError = (error: unknown) => {
    logger.error({
      category: 'api',
      action: 'log_stream_error',
      message: `Error streaming ${stream} log`,
      error,
    });
    writeSseEvent(
      res,
      'stream-error',
      typeof error === 'string' ? error : (error as Error)?.message ?? 'Unknown error',
    );
    cleanup();
  };

  currentRead = pump(0)
    .then(() => {
      if (!follow && remainder) {
        res.write(`data: ${remainder}\n\n`);
        remainder = '';
      }
      if (!follow) {
        writeSseEvent(res, 'end', 'close');
        cleanup();
      }
    })
    .catch(handleError);

  let watcher: fs.FSWatcher | null = null;
  if (follow) {
    try {
      watcher = fs.watch(filePath, (eventType) => {
        if (eventType !== 'change') {
          return;
        }
        schedulePump();
      });
    } catch (error) {
      handleError(error);
    }
  }

  req.on('close', cleanup);
};

/**
 * Create Dev-Bots router
 * 
 * @param devBotsManager - DevBotsManager instance
 * @returns Express router with Dev-Bots endpoints
 */
export function createClaudeWorkersRouter(devBotsManager: DevBotsManager): Router {
  const router = Router();
  const workerLogLocator = new WorkerLogLocator();

  router.use((_req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = ((body?: unknown) => {
      if (isPlainObject(body) && 'success' in body) {
        return originalJson(body);
      }

      if (res.statusCode >= 400) {
        let errorLabel = 'Request failed';
        let message: string | undefined;
        let code: string | undefined;
        let details: Record<string, unknown> | undefined;

        if (isPlainObject(body)) {
          const { error, message: bodyMessage, code: bodyCode, details: bodyDetails, ...rest } = body;
          if (typeof error === 'string') {
            errorLabel = error;
          }
          if (typeof bodyMessage === 'string') {
            message = bodyMessage;
          }
          if (typeof bodyCode === 'string') {
            code = bodyCode;
          }
          if (bodyDetails && typeof bodyDetails === 'object') {
            details = bodyDetails as Record<string, unknown>;
          } else if (Object.keys(rest).length > 0) {
            details = rest;
          }
        } else if (typeof body === 'string') {
          message = body;
        }

        const errorPayload: ApiError = {
          success: false,
          error: errorLabel,
          ...(message ? { message } : {}),
          ...(code ? { code } : {}),
          ...(details ? { details } : {}),
        };

        return originalJson(errorPayload);
      }

      const payload: ApiSuccess<unknown> = {
        success: true,
        data: body as unknown,
      };

      return originalJson(payload);
    }) as typeof res.json;

    next();
  });

  // ============================================================================
  // System Status & Health
  // ============================================================================

  /**
   * GET /dev-bots/status
   * Get overall system status
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getSystemStatus();
      if (status) {
        const normalizedStatus = {
          ...status,
          tasks: {
            pending: mapTasksToContract(status.tasks.pending),
            active: mapTasksToContract(status.tasks.active),
            completed: mapTasksToContract(status.tasks.completed),
          },
        };
        res.json(normalizedStatus);
      } else {
        res.status(503).json({
          error: 'Dev-Bots coordinator is not available',
          healthy: devBotsManager.isHealthy()
        });
      }
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_claude_workers_status_error',
        message: `Error getting Dev-Bots status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get Dev-Bots status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/health
   * Get health check status
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      healthy: devBotsManager.isHealthy(),
      status: devBotsManager.isHealthy() ? 'healthy' : 'unhealthy'
    });
  });

  /**
   * POST /dev-bots/start
   * Start Dev-Bots system
   */
  router.post('/start', (_req: Request, res: Response) => {
    try {
      devBotsManager.startSystem();
      res.json({ success: true, message: 'Dev-Bots started' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_starting_claude_workers_error',
        message: `Error starting Dev-Bots: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to start Dev-Bots',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/stop
   * Stop Dev-Bots system
   */
  router.post('/stop', (_req: Request, res: Response) => {
    try {
      devBotsManager.stopSystem();
      res.json({ success: true, message: 'Dev-Bots stopped' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_stopping_claude_workers_error',
        message: `Error stopping Dev-Bots: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to stop Dev-Bots',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Task Management
  // ============================================================================

  /**
   * GET /dev-bots/tasks
   * Get all tasks
   */
  router.get('/tasks', async (_req: Request, res: Response) => {
    try {
      const tasks = await devBotsManager.getTasks();
      if (tasks) {
        res.json({
          pending: mapTasksToContract(tasks.pending),
          active: mapTasksToContract(tasks.active),
          completed: mapTasksToContract(tasks.completed),
        });
      } else {
        res.status(503).json({
          error: 'Dev-Bots coordinator is not available',
          healthy: devBotsManager.isHealthy()
        });
      }
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_claude_workers_tasks_error',
        message: `Error getting Dev-Bots tasks: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get Dev-Bots tasks',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/queue
   * Get queue buckets with counts and metadata
   */
  router.get('/queue', async (_req: Request, res: Response) => {
    try {
      const [tasks, metrics] = await Promise.all([
        devBotsManager.getTasks(),
        devBotsManager.getQueueMetrics(),
      ]);
      const summary = buildQueueSummary(tasks, metrics);
      res.json(summary);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_queue_summary',
        message: `Error getting queue summary: ${error}`,
        error,
      });
      res.status(500).json({
        error: 'Failed to get queue summary',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/tasks/:taskId/detail
   * Get single task detail with history
   */
  router.get('/tasks/:taskId/detail', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const task = devBotsManager.getTask(taskId);
      if (!task) {
        res.status(404).json({
          error: 'Task not found',
          message: `Task ${taskId} was not found in the queue`,
        });
        return;
      }

      const executions = devBotsManager.getTaskExecutions(taskId);
      const detail: ContractDevBotsTaskDetail = {
        task: mapTaskToContract(task),
        history: buildTaskHistoryEvents(executions),
      };

      res.json(detail);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_detail',
        message: `Error getting task detail: ${error}`,
        error,
      });
      res.status(500).json({
        error: 'Failed to get task detail',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/tasks/:taskId/logs
   * Get latest stdout/stderr artifacts metadata
   */
  router.get('/tasks/:taskId/logs', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const workTarget = (req.query.workTarget as string) || DEFAULT_WORK_TARGET;
      const [stdoutDescriptor, stderrDescriptor] = await Promise.all([
        workerLogLocator.getDescriptor(workTarget, taskId, 'stdout'),
        workerLogLocator.getDescriptor(workTarget, taskId, 'stderr'),
      ]);
      const response: TaskLogsResponsePayload = {
        taskId,
        stdout: stdoutDescriptor,
        stderr: stderrDescriptor,
      };
      res.json(response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_logs_metadata',
        message: `Error getting task log metadata: ${error}`,
        error,
      });
      res.status(500).json({
        error: 'Failed to get task logs',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/tasks/:taskId/logs/:stream
   * Stream log contents via SSE
   */
  router.get('/tasks/:taskId/logs/:stream', async (req: Request, res: Response) => {
    try {
      const { taskId, stream } = req.params;
      const normalizedStream = stream as LogStreamType;
      if (!LOG_STREAM_TYPES.includes(normalizedStream)) {
        res.status(400).json({
          error: 'Invalid stream',
          message: `Stream must be one of: ${LOG_STREAM_TYPES.join(', ')}`,
        });
        return;
      }

      const workTarget = (req.query.workTarget as string) || DEFAULT_WORK_TARGET;
      const descriptor = await workerLogLocator.getDescriptor(workTarget, taskId, normalizedStream);
      if (!descriptor) {
        res.status(404).json({
          error: 'Log not found',
          message: `No ${normalizedStream} log found for task ${taskId}`,
        });
        return;
      }

      const follow = req.query.follow !== 'false';
      await streamLogFile({
        req,
        res,
        filePath: descriptor.path,
        follow,
        stream: normalizedStream,
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_streaming_task_logs',
        message: `Error streaming task logs: ${error}`,
        error,
      });
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to stream task logs',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  /**
   * POST /dev-bots/tasks
   * Create a new task
   *
   * SECURITY: Dev-bots can only spawn other dev-bots in production environments.
   * In non-production environments, this returns a stubbed response to prevent
   * infinite recursion or uncontrolled task spawning during development/testing.
   */
  router.post('/tasks', async (req: Request, res: Response) => {
    try {
      const {
        type,
        title,
        documentation,
        description,
        acceptanceCriteria,
        files,
        dependencies,
        repository,
        project,
        assignedAgent,
        notes,
        architectureReferences,
        validationSteps,
        successMetrics,
        estimatedEffort,
      } = req.body;

      // Accept either 'documentation' or 'description' field
      const taskDescription = documentation || description;

      if (!type || !title || !taskDescription || !acceptanceCriteria) {
        return res.status(400).json({
          error: 'Type, title, description, and acceptanceCriteria are required'
        });
      }

      // Validate assignedAgent if provided
      if (assignedAgent) {
        const validAgents = devBotsManager.getValidAgents();
        if (!validAgents.includes(assignedAgent)) {
          return res.status(400).json({
            error: `Invalid agent: ${assignedAgent}. Valid agents: ${validAgents.join(', ')}`
          });
        }
      }

      // SECURITY: Prevent dev-bots from spawning other dev-bots in non-production environments
      // This prevents infinite recursion and uncontrolled task spawning during development/testing
      if (config.nodeEnv !== 'production') {
        logger.warn({
          category: 'api',
          action: 'task_creation_blocked_non_production',
          message: `Task creation blocked in ${config.nodeEnv} environment`,
          details: {
            environment: config.nodeEnv,
            taskType: type,
            taskTitle: title,
            note: 'Dev-bots can only create tasks in production to prevent recursive spawning'
          }
        });

        // Return stubbed success response
        return res.json({
          task: {
            id: `stub-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            type,
            title,
            description: taskDescription,
            status: 'pending',
            createdAt: new Date().toISOString(),
            stubbed: true,
            reason: 'Task creation is disabled in non-production environments'
          },
          validation: {
            isValid: true,
            warnings: ['Task not created - dev-bot task spawning is disabled in non-production environments'],
            suggestions: []
          },
          message: 'Task creation stubbed (non-production environment)'
        });
      }

      // V3 Template Validation (PE-API-VALIDATION-001)
      // If the request body matches v3 template structure, enforce validation
      if (shouldValidateAsV3Template(req.body)) {
        const validationResult = validateTaskTemplate(req.body);

        // Log validation warnings even if template passes
        if (validationResult.warnings.length > 0) {
          logger.warn({
            category: 'api',
            action: 'v3_template_warnings',
            message: 'V3 template validation warnings',
            details: {
              taskTitle: title,
              warnings: validationResult.warnings
            }
          });
        }

        // Return error if template is invalid
        if (!validationResult.isValid) {
          logger.error({
            category: 'api',
            action: 'v3_template_validation_failed',
            message: 'V3 template validation failed',
            details: {
              taskTitle: title,
              errors: validationResult.errors,
              warnings: validationResult.warnings
            }
          });

          return res.status(400).json({
            error: 'Task template validation failed',
            details: formatValidationErrors(validationResult),
            errors: validationResult.errors,
            warnings: validationResult.warnings
          });
        }

        logger.info({
          category: 'api',
          action: 'v3_template_validated',
          message: 'V3 template passed validation',
          details: { taskTitle: title }
        });
      }

      if (TECHNICAL_TASK_TYPES.has(type)) {
        const warnings: Array<Pick<LogEntry, 'category' | 'action' | 'message' | 'details'>> = [];

        if (!Array.isArray(files) || files.length === 0) {
          warnings.push({
            category: 'api',
            action: 'task_missing_files_array',
            message: `Technical task type '${type}' created without files array`,
            details: { taskId: title },
          });
        }

        const documentationLength = typeof taskDescription === 'string' ? taskDescription.trim().length : 0;
        if (documentationLength < MIN_DOCUMENTATION_LENGTH) {
          warnings.push({
            category: 'api',
            action: 'task_missing_description',
            message: `Technical task type '${type}' created without detailed description`,
            details: { taskId: title },
          });
        }

        const criteriaArray = Array.isArray(acceptanceCriteria)
          ? acceptanceCriteria
          : typeof acceptanceCriteria === 'string'
          ? [acceptanceCriteria]
          : [];

        if (criteriaArray.length === 1) {
          const rawCriterion = criteriaArray[0];
          const criterionText = typeof rawCriterion === 'string' ? rawCriterion : '';
          if (criterionText.trim().length > 0 && criterionText.trim().length < MIN_ACCEPTANCE_CRITERION_LENGTH) {
            warnings.push({
              category: 'api',
              action: 'vague_acceptance_criteria',
              message: `Task has vague acceptance criteria: "${criterionText}"`,
              details: { taskId: title },
            });
          }
        }

        warnings.forEach((warning) => logger.warn(warning));
      }

      // Add timeout protection to prevent API from hanging indefinitely
      const TASK_CREATION_TIMEOUT_MS = 10000; // 10 seconds
      const taskCreationStartTime = Date.now();

      const result = await Promise.race([
        devBotsManager.addTask({
          type,
          title,
          description: taskDescription,
          acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [acceptanceCriteria],
          files,
          dependencies,
          project: project || repository, // Accept either 'project' or 'repository'
          assignedAgent,
          notes,
          architectureReferences,
          validationSteps,
          successMetrics,
          estimatedEffort
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Task creation timeout - operation took longer than 10 seconds')),
            TASK_CREATION_TIMEOUT_MS
          )
        )
      ]);

      const taskCreationDuration = Date.now() - taskCreationStartTime;

      // Log slow task creation for monitoring
      if (taskCreationDuration > 1000) {
        logger.warn({
          category: 'api',
          action: 'slow_task_creation',
          message: `Task creation took ${taskCreationDuration}ms (expected < 1000ms)`,
          details: {
            durationMs: taskCreationDuration,
            taskId: result.task.id,
            taskTitle: title
          }
        });
      }

      res.json({
        task: result.task,
        validation: result.validation,
        message: 'Task added successfully'
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_adding_claude_workers_task_error',
        message: `Error adding Dev-Bots task: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to add task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // REMOVED: POST /tasks/enhanced endpoint (deprecated)
  // All clients now use POST /dev-bots/tasks

  /**
   * GET /dev-bots/tasks/completed
   * Get all completed tasks
   */
  router.get('/tasks/completed', (_req: Request, res: Response) => {
    try {
      // getCompletedTasks() is deprecated - return empty array for now
      const tasks: Array<Record<string, unknown>> = []; // TODO: Implement if needed via taskQueue.getTasksByStatus('completed')
      res.json({ tasks });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_completed_tasks_error',
        message: `Error getting completed tasks: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get completed tasks',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/metrics
   * Get queue metrics and task duration statistics
   */
  router.get('/metrics', (_req: Request, res: Response) => {
    try {
      const metrics = devBotsManager.getQueueMetrics();
      const stats = devBotsManager.getTaskDurationStats();
      res.json({ metrics, stats });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_metrics',
        message: `Error getting metrics: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get metrics',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/agent-comparison
   * Get performance comparison metrics between Claude and Codex agents
   */
  router.get('/agent-comparison', (_req: Request, res: Response) => {
    try {
      const comparison = devBotsManager.getAgentComparisonMetrics();
      res.json({ comparison });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_agent_comparison',
        message: `Error getting agent comparison metrics: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get agent comparison metrics',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/tasks/:taskId/timeout
   * Manually timeout a task after verification
   */
  router.post('/tasks/:taskId/timeout', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          error: 'Reason is required for manual timeout'
        });
      }

      devBotsManager.manuallyTimeoutTask(taskId, reason);
      res.json({
        success: true,
        message: `Task ${taskId} manually timed out`,
        reason
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_timing_out_task',
        message: `Error timing out task: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to timeout task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/validate
   * Validate task data
   */
  router.post('/validate', async (req: Request, res: Response) => {
    try {
      const { type, ...taskData } = req.body;
      const result = devBotsManager.validateTaskData(taskData, type || 'general');
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_validating_task_error',
        message: `Error validating task: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to validate task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/assign
   * Manually trigger task assignment
   */
  router.post('/assign', async (_req: Request, res: Response) => {
    try {
      await devBotsManager.assignNextTask();
      const metrics = devBotsManager.getQueueMetrics();
      res.json({
        success: true,
        message: 'Task assignment triggered',
        metrics
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_assigning_task',
        message: `Error assigning task: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to assign task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/pr/track
   * Manually submit a PR for tracking in the workflow
   *
   * If PR is already tracked, this will re-evaluate all conditions and spawn
   * fix tasks for any unmet conditions (restarting hung PRs)
   */
  router.post('/pr/track', async (req: Request, res: Response) => {
    try {
      const { prNumber } = req.body;

      if (!prNumber || typeof prNumber !== 'number') {
        return res.status(400).json({
          error: 'PR number is required and must be a number'
        });
      }

      // Import services
      const { getGitHubPRService } = await import('../services/githubPR.service.js');
      const { getTaskQueueService } = await import('../services/taskQueue.factory.js');
      const { PRConditionStateService } = await import('../services/prConditionState.service.js');

      const prService = getGitHubPRService();
      const taskQueue = getTaskQueueService();

      // Track the PR - it will extract task ID from branch name if present
      await prService.trackPR(prNumber);

      // Check if PR is already tracked (has associated tasks)
      const existingTasks = await taskQueue.findByPRNumber(prNumber);
      const isAlreadyTracked = existingTasks.length > 0;

      // Trigger full condition evaluation (checks all 8 conditions)
      // This will spawn fix tasks for any unmet conditions
      const prConditionState = new PRConditionStateService(taskQueue);
      await prConditionState.evaluateConditions(prNumber, 'manual_restart');

      logger.info({
        category: 'pr-workflow',
        action: 'pr_tracked_and_evaluated',
        message: `PR #${prNumber} ${isAlreadyTracked ? 'restarted' : 'tracked'} - condition evaluation triggered`,
        details: {
          pr_number: prNumber,
          is_restart: isAlreadyTracked,
          task_count: existingTasks.length
        }
      });

      res.json({
        success: true,
        message: isAlreadyTracked
          ? `PR #${prNumber} conditions re-evaluated - fix tasks will be spawned for any unmet conditions`
          : `PR #${prNumber} added to tracking workflow - evaluating conditions`,
        prNumber,
        isRestart: isAlreadyTracked,
        associatedTasks: existingTasks.length
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_tracking_pr',
        message: `Error tracking PR: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to track PR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Agent Management
  // ============================================================================

  /**
   * GET /dev-bots/agents
   * Get all agent personalities
   */
  router.get('/agents', (_req: Request, res: Response) => {
    try {
      const agents = devBotsManager.getAgentPersonalities();
      res.json({ agents });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_agent_personalities_error',
        message: `Error getting agent personalities: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get agent personalities',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/agents/valid
   * Get list of valid agent IDs
   */
  router.get('/agents/valid', (_req: Request, res: Response) => {
    try {
      const validAgents = devBotsManager.getValidAgents();
      res.json({ validAgents });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_valid_agents_error',
        message: `Error getting valid agents: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get valid agents',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Templates & Guidelines
  // ============================================================================

  /**
   * GET /dev-bots/templates
   * Get all task templates
   */
  router.get('/templates', (_req: Request, res: Response) => {
    try {
      const templates = devBotsManager.getTaskTemplates();
      res.json({ templates });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_templates_error',
        message: `Error getting templates: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get templates',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/guidelines
   * Get all task guidelines
   */
  router.get('/guidelines', (_req: Request, res: Response) => {
    try {
      const guidelines = devBotsManager.getTaskGuidelines();
      res.json({ guidelines });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_guidelines_error',
        message: `Error getting guidelines: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get guidelines',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/guidelines/:taskType
   * Get guidelines for specific task type
   */
  router.get('/guidelines/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const guidelines = devBotsManager.getTaskGuidelines(taskType);
      res.json({ guidelines });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_guidelines_error',
        message: `Error getting guidelines for ${req.params.taskType}: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get task guidelines',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/examples/:taskType
   * Get examples for specific task type
   */
  router.get('/examples/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const example = devBotsManager.getTaskExample(taskType);
      res.json({ examples: [example] });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_examples_error',
        message: `Error getting examples for ${req.params.taskType}: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get task examples',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/checklist/:taskType
   * Get checklist for specific task type
   */
  router.get('/checklist/:taskType', (req: Request, res: Response) => {
    try {
      const { taskType } = req.params;
      const checklist = devBotsManager.getTaskChecklist(taskType);
      res.json({ checklist });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_checklist_error',
        message: `Error getting checklist for ${req.params.taskType}: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get task checklist',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Project Management
  // ============================================================================

  /**
   * GET /dev-bots/projects
   * Get all projects
   */
  router.get('/projects', (_req: Request, res: Response) => {
    try {
      const projects = devBotsManager.getValidProjects();
      res.json({ projects });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_projects_error',
        message: `Error getting projects: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get projects',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Data Import/Export
  // ============================================================================

  /**
   * POST /dev-bots/export
   * Export system data
   */
  router.post('/export', async (req: Request, res: Response) => {
    try {
      const { path = './task-export.json' } = req.body;
      devBotsManager.exportTasks(path);
      res.json({ success: true, message: `Tasks exported to ${path}` });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_exporting_data_error',
        message: `Error exporting data: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to export data',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/import
   * Import system data
   */
  router.post('/import', async (req: Request, res: Response) => {
    try {
      const { path = './task-export.json' } = req.body;
      devBotsManager.importTasks(path);
      res.json({ success: true, message: `Tasks imported from ${path}` });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_importing_data_error',
        message: `Error importing data: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to import data',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Onboarding
  // ============================================================================

  /**
   * POST /dev-bots/onboarding/complete
   * Mark onboarding as complete
   */
  router.post('/onboarding/complete', async (req: Request, res: Response) => {
    try {
      const { workerId } = req.body;
      if (!workerId) {
        return res.status(400).json({ error: 'Worker ID is required' });
      }
      devBotsManager.completeWorkerOnboarding(workerId);
      res.json({ success: true, message: 'Onboarding completed' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_completing_onboarding_error',
        message: `Error completing onboarding: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to complete onboarding',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Workspace Synchronization
  // ============================================================================

  /**
   * GET /dev-bots/workspace-sync/status
   * Get workspace sync status
   */
  router.get('/workspace-sync/status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getWorkspaceSyncStatus();
      res.json(status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_workspace_sync_status_error',
        message: `Error getting workspace sync status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get workspace sync status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/workspace-sync/trigger
   * Trigger workspace synchronization
   */
  router.post('/workspace-sync/trigger', async (req: Request, res: Response) => {
    try {
      const { force } = req.body;
      const result = await devBotsManager.triggerWorkspaceSync(force);
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_triggering_workspace_sync_error',
        message: `Error triggering workspace sync: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to trigger workspace sync',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Docker Integration
  // ============================================================================

  /**
   * GET /dev-bots/docker/status
   * Get Docker integration status
   */
  router.get('/docker/status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getDockerStatus();
      res.json(status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_docker_status_error',
        message: `Error getting Docker status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get Docker status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/docker/revalidate
   * Revalidate Docker containers
   */
  router.post('/docker/revalidate', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.revalidateDockerEnvironment();
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_revalidating_docker_error',
        message: `Error revalidating Docker containers: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to revalidate Docker containers',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/docker/cleanup
   * Clean up Docker resources
   */
  router.post('/docker/cleanup', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.cleanupOrphanedResources();
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_cleaning_docker_error',
        message: `Error cleaning Docker resources: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to clean Docker resources',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/containers/:containerId/health
   * Get health status of specific container
   */
  router.get('/containers/:containerId/health', async (req: Request, res: Response) => {
    try {
      const { containerId } = req.params;
      const health = await devBotsManager.getContainerHealth(containerId);
      res.json(health);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_container_health_error',
        message: `Error getting container health for ${req.params.containerId}: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get container health',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Cleanup & Maintenance
  // ============================================================================

  /**
   * GET /dev-bots/cleanup-status
   * Get cleanup system status
   */
  router.get('/cleanup-status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getCleanupStatus();
      res.json(status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_cleanup_status_error',
        message: `Error getting cleanup status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get cleanup status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/trigger-cleanup
   * Manually trigger cleanup
   */
  router.post('/trigger-cleanup', async (req: Request, res: Response) => {
    try {
      const { aggressive } = req.body;
      const result = await devBotsManager.triggerCleanup(aggressive);
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_triggering_cleanup_error',
        message: `Error triggering cleanup: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to trigger cleanup',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/scope-violations
   * Get scope violation reports
   */
  router.get('/scope-violations', async (_req: Request, res: Response) => {
    try {
      const violations = await devBotsManager.getScopeViolations();
      res.json(violations);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_scope_violations_error',
        message: `Error getting scope violations: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get scope violations',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/emergency-recovery
   * Trigger emergency recovery procedures
   */
  router.post('/emergency-recovery', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.triggerEmergencyRecovery();
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_emergency_recovery_error',
        message: `Error during emergency recovery: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to execute emergency recovery',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Interactive Sessions
  // ============================================================================

  router.get('/interactive/session', (_req, res) => {
    const payload: DevBotsInteractiveSessionStateResponse['data'] = buildInteractiveSessionState(devBotsManager);
    res.json({ success: true, data: payload });
  });

  router.post('/interactive/session', async (req, res) => {
    const payload = req.body as DevBotsInteractiveSessionStartPayload | undefined;
    if (!payload || typeof payload.modelProvider !== 'string' || typeof payload.modelName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'invalid_payload',
        message: 'modelProvider and modelName are required',
      });
    }
    try {
      await devBotsManager.launchInteractiveSession({
        ownerEmail: getRequestUserEmail(req) ?? DEFAULT_INTERACTIVE_OWNER_EMAIL,
        modelProvider: payload.modelProvider,
        modelName: payload.modelName,
        metadata: payload.metadata,
      });
      const state = buildInteractiveSessionState(devBotsManager);
      res.status(201).json({ success: true, data: state });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'interactive_session_failed',
        message: error instanceof Error ? error.message : 'Failed to launch session',
      });
    }
  });

  router.delete('/interactive/session', async (req, res) => {
    const session = devBotsManager.getActiveInteractiveSession();
    if (!session) {
      return res.status(404).json({ success: false, error: 'not_found', message: 'No active interactive session' });
    }
    await devBotsManager.endInteractiveSession(session.id, 'Operator ended session');
    const payload: DevBotsInteractiveSessionStateResponse['data'] = buildInteractiveSessionState(devBotsManager);
    res.json({ success: true, data: payload });
  });

  router.post('/interactive/session/:sessionId/input', (req, res) => {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'invalid_params', message: 'sessionId is required' });
    }
    const payload = req.body as DevBotsInteractiveSessionInputPayload | undefined;
    if (!payload || typeof payload.data !== 'string' || payload.data.length === 0) {
      return res.status(400).json({ success: false, error: 'invalid_payload', message: 'input data is required' });
    }
    const session = devBotsManager.getInteractiveSession(sessionId);
    if (!session || session.status === 'ended') {
      return res.status(404).json({ success: false, error: 'not_found', message: 'Session not found or already ended' });
    }
    devBotsManager.sendInteractiveInput(sessionId, payload.data);
    res.json({ success: true, data: { accepted: true } });
  });

  router.post('/interactive/heartbeat', (req, res) => {
    const payload = req.body as DevBotsInteractiveHeartbeatPayload | undefined;
    if (!payload || typeof payload.sessionId !== 'string') {
      return res.status(400).json({ success: false, error: 'invalid_payload', message: 'sessionId is required' });
    }
    const session = devBotsManager.getInteractiveSession(payload.sessionId);
    if (!session || session.status === 'ended') {
      return res.status(404).json({ success: false, error: 'not_found', message: 'Session not found' });
    }
    const source = payload.source === 'agent' ? 'agent' : 'user';
    devBotsManager.recordInteractiveActivity(payload.sessionId, source);
    res.json({ success: true, data: { acknowledged: true } });
  });

  router.post('/interactive/interrupt', (req, res) => {
    const payload = req.body as DevBotsInteractiveInterruptPayload | undefined;
    if (!payload || typeof payload.sessionId !== 'string') {
      return res.status(400).json({ success: false, error: 'invalid_payload', message: 'sessionId is required' });
    }
    const session = devBotsManager.getInteractiveSession(payload.sessionId);
    if (!session || session.status === 'ended') {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Session not found or already ended',
      });
    }
    devBotsManager.sendInteractiveSignal(payload.sessionId, 'interrupt');
    res.json({ success: true, data: { message: 'Interrupt signal sent' } });
  });

  // ============================================================================
  // Task Context API Endpoints
  // ============================================================================

  /**
   * GET /dev-bots/tasks/:id/context
   * Get task context (latest automation run)
   */
  router.get('/tasks/:id/context', (req: Request, res: Response) => {
    try {
      const { id: taskId } = req.params;
      const latestRun = getTaskContextService().getLatestAutomationRun(taskId);

      if (!latestRun) {
        return res.status(404).json({
          error: 'No context found',
          message: `No automation runs found for task ${taskId}`
        });
      }

      res.json(latestRun);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_context',
        message: `Error getting task context: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get task context',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/tasks/:id/runs
   * Get all automation runs for a task
   */
  router.get('/tasks/:id/runs', (req: Request, res: Response) => {
    try {
      const { id: taskId } = req.params;
      const runs = getTaskContextService().getTaskAutomationRuns(taskId);

      res.json({ runs });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_runs',
        message: `Error getting task runs: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get task runs',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/tasks/:id/runs/:runId
   * Get specific automation run details
   */
  router.get('/tasks/:id/runs/:runId', (req: Request, res: Response) => {
    try {
      const { id: taskId, runId } = req.params;
      const run = getTaskContextService().getAutomationRun(runId);

      if (!run) {
        return res.status(404).json({
          error: 'Run not found',
          message: `Automation run ${runId} not found`
        });
      }

      // Verify the run belongs to the specified task
      if (run.task_id !== taskId) {
        return res.status(404).json({
          error: 'Run not found',
          message: `Automation run ${runId} does not belong to task ${taskId}`
        });
      }

      res.json(run);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_automation_run',
        message: `Error getting automation run: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get automation run',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Chain Management Routes (Phase 3: Staged Queue)
  // ============================================================================

  /**
   * GET /dev-bots/queue/stats
   * Get queue statistics including chain utilization
   */
  router.get('/queue/stats', (_req: Request, res: Response) => {
    try {
      const stats = devBotsManager.getTaskQueue().getChainStats();
      res.json(stats);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_queue_stats',
        message: `Error getting queue stats: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get queue stats',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/chains/blocked
   * Get list of blocked chains requiring manual intervention
   */
  router.get('/chains/blocked', (_req: Request, res: Response) => {
    try {
      const blockedChains = devBotsManager.getTaskQueue().getBlockedChains();
      res.json(blockedChains);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_blocked_chains',
        message: `Error getting blocked chains: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get blocked chains',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/chains/:chainId/unblock
   * Unblock a chain after manual intervention
   * Body: { unblockedBy: string }
   */
  router.post('/chains/:chainId/unblock', (req: Request, res: Response) => {
    try {
      const { chainId } = req.params;
      const { unblockedBy } = req.body;

      if (!unblockedBy) {
        return res.status(400).json({
          error: 'Missing required field',
          message: 'unblockedBy is required'
        });
      }

      devBotsManager.getTaskQueue().unblockChain(chainId, unblockedBy);

      logger.info({
        category: 'api',
        action: 'chain_unblocked',
        message: `Chain ${chainId} unblocked by ${unblockedBy}`,
        details: { chainId, unblockedBy }
      });

      res.json({
        success: true,
        chainId,
        unblockedBy
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_unblocking_chain',
        message: `Error unblocking chain: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to unblock chain',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
