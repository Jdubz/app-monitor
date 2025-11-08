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
  DevBotsQueueSummary,
  DevBotsTask as ContractDevBotsTask,
  DevBotsTaskDetail as ContractDevBotsTaskDetail,
  DevBotsTaskHistoryEvent,
  DevBotsTaskStatus
} from '@app-monitor/api-contracts';
import type { Task, TaskExecution } from '../services/taskQueue.sqlite.js';
import { WorkerLogLocator } from '../services/taskLogLocator.js';

const TECHNICAL_TASK_TYPES = new Set(['refactor', 'implementation', 'bug', 'feature']);
const MIN_DOCUMENTATION_LENGTH = 50;
const MIN_ACCEPTANCE_CRITERION_LENGTH = 30;
const DEFAULT_WORK_TARGET = 'dev-bots';
const LOG_STREAM_TYPES = ['stdout', 'stderr'] as const;
type LogStreamType = (typeof LOG_STREAM_TYPES)[number];

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
  exitCode: task.exit_code,
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

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    watcher?.close();
    res.end();
  };

  const pump = (start: number) =>
    new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(filePath, { encoding: 'utf-8', start });

      readStream.on('data', (chunk: string) => {
        bytesRead += Buffer.byteLength(chunk);
        const combined = remainder + chunk;
        const lines = combined.split(/\r?\n/);
        remainder = lines.pop() ?? '';
        for (const line of lines) {
          res.write(`data: ${line}\n\n`);
        }
      });

      readStream.on('end', () => {
        resolve();
      });

      readStream.on('error', (error) => {
        reject(error);
      });
    });

  const handleError = (error: unknown) => {
    logger.error({
      category: 'dev-bots',
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
        currentRead = currentRead
          .then(() => pump(bytesRead))
          .catch(handleError);
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
      const tasks = devBotsManager.getCompletedTasks();
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
  // PR Workflow Monitoring
  // ============================================================================

  /**
   * GET /dev-bots/pr-monitor/status
   * Get PR workflow orchestrator status
   */
  router.get('/pr-monitor/status', async (_req: Request, res: Response) => {
    try {
      const orchestrator = devBotsManager.getPRWorkflowOrchestrator();
      if (!orchestrator) {
        res.status(503).json({
          error: 'PR workflow orchestrator not available',
          message: 'PR monitoring is not enabled or not initialized'
        });
        return;
      }

      const status = orchestrator.getStatus();
      res.json(status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_pr_monitor_status',
        message: `Error getting PR monitor status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get PR monitor status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/pr-monitor/prs
   * Get all monitored PRs
   */
  router.get('/pr-monitor/prs', async (_req: Request, res: Response) => {
    try {
      const orchestrator = devBotsManager.getPRWorkflowOrchestrator();
      if (!orchestrator) {
        res.status(503).json({
          error: 'PR workflow orchestrator not available',
          message: 'PR monitoring is not enabled or not initialized'
        });
        return;
      }

      const prs = orchestrator.getMonitoredPRs();
      res.json({
        count: prs.length,
        prs
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_pr_monitor_prs',
        message: `Error getting monitored PRs: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get monitored PRs',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /dev-bots/pr-monitor/pr/:number
   * Get status of a specific PR
   */
  router.get('/pr-monitor/pr/:number', async (req: Request, res: Response) => {
    try {
      const prNumber = parseInt(req.params.number, 10);
      if (isNaN(prNumber)) {
        res.status(400).json({
          error: 'Invalid PR number',
          message: 'PR number must be a valid integer'
        });
        return;
      }

      const orchestrator = devBotsManager.getPRWorkflowOrchestrator();
      if (!orchestrator) {
        res.status(503).json({
          error: 'PR workflow orchestrator not available',
          message: 'PR monitoring is not enabled or not initialized'
        });
        return;
      }

      const prs = orchestrator.getMonitoredPRs();
      const pr = prs.find(p => p.prNumber === prNumber);

      if (!pr) {
        res.status(404).json({
          error: 'PR not found',
          message: `PR #${prNumber} is not being monitored`
        });
        return;
      }

      res.json(pr);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_pr_monitor_pr',
        message: `Error getting PR status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get PR status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /dev-bots/pr-monitor/register-orphaned
   * Manually register orphaned PRs for monitoring
   *
   * This endpoint scans the database for tasks with PR metadata that aren't
   * currently being monitored, and registers them with the PR workflow orchestrator.
   * Useful for recovering from server crashes that orphaned PR tracking.
   */
  router.post('/pr-monitor/register-orphaned', async (_req: Request, res: Response) => {
    try {
      const orchestrator = devBotsManager.getPRWorkflowOrchestrator();
      if (!orchestrator) {
        res.status(503).json({
          error: 'PR workflow orchestrator not available',
          message: 'PR monitoring is not enabled or not initialized'
        });
        return;
      }

      // Get currently monitored PR numbers
      const monitoredPRs = orchestrator.getMonitoredPRs();
      const monitoredPRNumbers = new Set(monitoredPRs.map(pr => pr.prNumber));

      // Get all tasks with unmerged PRs from database
      const taskQueue = devBotsManager.getTaskQueue();
      const tasksWithPRs = taskQueue.getTasksWithUnmergedPRs();

      // Find orphaned PRs (in DB but not monitored)
      const orphanedTasks = tasksWithPRs.filter(task =>
        task.pr_number && !monitoredPRNumbers.has(task.pr_number)
      );

      if (orphanedTasks.length === 0) {
        res.json({
          success: true,
          message: 'No orphaned PRs found',
          registered: 0,
          alreadyMonitored: monitoredPRs.length
        });
        return;
      }

      // Register each orphaned PR
      const registered: Array<{ taskId: string; prNumber: number; prUrl: string }> = [];
      for (const task of orphanedTasks) {
        try {
          // Get PR monitor service through orchestrator's internal prMonitor
          // We need to call registerPR which is on the PRMonitorService
          // The orchestrator has this via handleTaskCompletion, but we need direct access

          // For now, manually trigger initialization which will pick up all unmerged PRs
          await orchestrator.initialize();

          registered.push({
            taskId: task.id,
            prNumber: task.pr_number!,
            prUrl: task.pr_url!
          });

          logger.info({
            category: 'pr-workflow',
            action: 'orphaned_pr_registered',
            message: `Manually registered orphaned PR #${task.pr_number}`,
            details: {
              taskId: task.id,
              prNumber: task.pr_number,
              prUrl: task.pr_url
            }
          });
        } catch (error) {
          logger.error({
            category: 'pr-workflow',
            action: 'orphaned_pr_registration_failed',
            message: `Failed to register orphaned PR #${task.pr_number}`,
            error,
            details: { taskId: task.id }
          });
        }
      }

      res.json({
        success: true,
        message: `Registered ${registered.length} orphaned PR(s)`,
        registered,
        totalOrphaned: orphanedTasks.length,
        nowMonitoring: orchestrator.getMonitoredPRs().length
      });

    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_register_orphaned_prs',
        message: `Error registering orphaned PRs: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to register orphaned PRs',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
