/**
 * Task Management Routes
 *
 * Endpoints for task CRUD operations, queue management, logs, and chains:
 * - Task lifecycle (create, list, detail, timeout)
 * - Queue operations and statistics
 * - Log streaming (stdout/stderr)
 * - Task validation and assignment
 * - PR tracking integration
 * - Task context and automation runs
 * - Chain management (blocked chains, unblock)
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { logger } from '../../utils/logger.js';
import type { LogEntry } from '../../utils/logger.js';
import {
  validateTaskTemplate,
  formatValidationErrors,
  shouldValidateAsV3Template
} from '../../services/taskTemplateValidator.js';
import { config } from '../../config.js';
import { WorkerLogLocator } from '../../services/taskLogLocator.js';
import { getTaskContextService } from '../../services/taskContext.service.js';
import {
  mapTasksToContract,
  mapTaskToContract,
  buildQueueSummary,
  buildTaskHistoryEvents,
  streamLogFile,
  TECHNICAL_TASK_TYPES,
  MIN_DOCUMENTATION_LENGTH,
  MIN_ACCEPTANCE_CRITERION_LENGTH,
  DEFAULT_WORK_TARGET,
  LOG_STREAM_TYPES,
  type ContractDevBotsTaskDetail,
  type TaskLogsResponsePayload,
  type LogStreamType,
} from './shared.js';

/**
 * Create task management routes
 */
export function createTasksRoutes(devBotsManager: DevBotsManager): Router {
  const router = Router();
  const workerLogLocator = new WorkerLogLocator();

  // ============================================================================
  // Task CRUD Operations
  // ============================================================================

  /**
   * GET /tasks
   * Get all tasks grouped by status
   */
  router.get('/', async (_req: Request, res: Response) => {
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
   * GET /completed
   * Get all completed tasks
   */
  router.get('/completed', (_req: Request, res: Response) => {
    try {
      const tasks = devBotsManager.getTaskQueue().getTasksByStatus('completed');

      logger.debug({
        category: 'api',
        action: 'get_completed_tasks',
        message: `Retrieved ${tasks.length} completed tasks`,
        details: { count: tasks.length }
      });

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
   * GET /:taskId/detail
   * Get single task detail with execution history
   */
  router.get('/:taskId/detail', (req: Request, res: Response) => {
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
   * POST /
   * Create a new task
   *
   * SECURITY: Dev-bots can only spawn other dev-bots in production environments.
   * In non-production environments, this returns a stubbed response to prevent
   * infinite recursion or uncontrolled task spawning during development/testing.
   */
  router.post('/', async (req: Request, res: Response) => {
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

  /**
   * POST /:taskId/timeout
   * Manually timeout a task after verification
   */
  router.post('/:taskId/timeout', (req: Request, res: Response) => {
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

  // ============================================================================
  // Queue Management
  // ============================================================================

  /**
   * GET /queue
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
   * GET /queue/stats
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

  // ============================================================================
  // Task Validation & Assignment
  // ============================================================================

  /**
   * POST /validate
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
   * POST /assign
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
  // Log Streaming
  // ============================================================================

  /**
   * GET /:taskId/logs
   * Get latest stdout/stderr artifacts metadata
   */
  router.get('/:taskId/logs', async (req: Request, res: Response) => {
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
   * GET /:taskId/logs/:stream
   * Stream log contents via SSE
   */
  router.get('/:taskId/logs/:stream', async (req: Request, res: Response) => {
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

  // ============================================================================
  // Task Context & Runs
  // ============================================================================

  /**
   * GET /:id/context
   * Get latest automation run context for task
   */
  router.get('/:id/context', (req: Request, res: Response) => {
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
   * GET /:id/runs
   * Get all automation runs for a task
   */
  router.get('/:id/runs', (req: Request, res: Response) => {
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
   * GET /:id/runs/:runId
   * Get specific automation run details
   */
  router.get('/:id/runs/:runId', (req: Request, res: Response) => {
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
  // PR Tracking
  // ============================================================================

  /**
   * POST /pr/track
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
      const { getGitHubPRService } = await import('../../services/githubPR.service.js');
      const { getTaskQueueService } = await import('../../services/taskQueue.factory.js');
      const { PRConditionStateService } = await import('../../services/prConditionState.service.js');

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
  // Chain Management
  // ============================================================================

  /**
   * GET /chains/blocked
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
   * POST /chains/:chainId/unblock
   * Unblock a chain after manual intervention
   * Body: { unblockedBy: string }
   */
  router.post('/chains/:chainId/unblock', (req: Request, res: Response) => {
    try {
      const { chainId } = req.params;
      const { unblockedBy } = req.body;

      // Validate chainId
      if (!chainId || typeof chainId !== 'string' || chainId.trim().length === 0) {
        return res.status(400).json({
          error: 'Invalid chain ID',
          message: 'chainId must be a non-empty string'
        });
      }

      // Validate unblockedBy
      if (
        typeof unblockedBy !== 'string' ||
        unblockedBy.trim().length === 0
      ) {
        return res.status(400).json({
          error: 'Invalid or missing required field',
          message: 'unblockedBy is required and must be a non-empty string'
        });
      }

      const normalizedUnblockedBy = unblockedBy.trim();

      devBotsManager.getTaskQueue().unblockChain(chainId, normalizedUnblockedBy);

      logger.info({
        category: 'api',
        action: 'chain_unblocked',
        message: `Chain ${chainId} unblocked by ${normalizedUnblockedBy}`,
        details: { chainId, unblockedBy: normalizedUnblockedBy }
      });

      res.json({
        success: true,
        message: `Chain ${chainId} has been unblocked`,
        chainId,
        unblockedBy: normalizedUnblockedBy
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
