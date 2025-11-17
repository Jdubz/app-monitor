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
import { sendSuccess, sendError } from '../../utils/apiResponse.js';
import {
  validateTaskTemplate,
  formatValidationErrors,
  shouldValidateAsV3Template
} from '../../services/taskTemplateValidator.js';
import { config } from '../../config.js';
import { WorkerLogLocator } from '../../services/taskLogLocator.js';
import { getTaskContextService } from '../../services/taskContext.service.js';
import { taskAutoDetectionService } from '../../services/taskAutoDetection.service.js';
import type { MinimalTaskPayload } from '@app-monitor/api-contracts';
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
  router.get('/tasks', async (_req: Request, res: Response) => {
    try {
      const tasks = await devBotsManager.getTasks();
      if (tasks) {
        sendSuccess(res, {
          pending: mapTasksToContract(tasks.pending),
          active: mapTasksToContract(tasks.active),
          completed: mapTasksToContract(tasks.completed),
          failed: mapTasksToContract(tasks.failed),
        });
      } else {
        sendError(
          res,
          'Dev-Bots coordinator is not available',
          503,
          { details: { healthy: devBotsManager.isHealthy() } }
        );
      }
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_claude_workers_tasks_error',
        message: `Error getting Dev-Bots tasks: ${error}`,
        error
      });
      sendError(
        res,
        'Failed to get Dev-Bots tasks',
        500,
        { message: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  /**
   * GET /tasks/completed
   * Get all completed tasks
   */
  router.get('/tasks/completed', (_req: Request, res: Response) => {
    try {
      const tasks = devBotsManager.getTaskQueue().getTasksByStatus('completed');

      logger.debug({
        category: 'api',
        action: 'get_completed_tasks',
        message: `Retrieved ${tasks.length} completed tasks`,
        details: { count: tasks.length }
      });

      sendSuccess(res, { tasks });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_completed_tasks_error',
        message: `Error getting completed tasks: ${error}`,
        error
      });
      sendError(
        res,
        'Failed to get completed tasks',
        500,
        { message: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  /**
   * GET /tasks/:taskId/detail
   * Get single task detail with execution history
   */
  router.get('/tasks/:taskId/detail', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const task = devBotsManager.getTask(taskId);
      if (!task) {
        return sendError(
          res,
          'Task not found',
          404,
          { message: `Task ${taskId} was not found in the queue` }
        );
      }

      const executions = devBotsManager.getTaskExecutions(taskId);
      const detail: ContractDevBotsTaskDetail = {
        task: mapTaskToContract(task),
        history: buildTaskHistoryEvents(executions),
      };

      sendSuccess(res, detail);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_detail',
        message: `Error getting task detail: ${error}`,
        error,
      });
      sendError(
        res,
        'Failed to get task detail',
        500,
        { message: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  // ============================================================================
  // Context-Aware Minimal Task Creation (NEW)
  // ============================================================================

  /**
   * POST /tasks/minimal
   * Create task with minimal payload (3 required fields)
   * Auto-detects: files, risk level, context profiles, outputs
   */
  router.post('/tasks/minimal', async (req: Request, res: Response) => {
    try {
      const payload: MinimalTaskPayload = req.body;
      
      // Validate required fields
      if (!payload.title || !payload.taskType || !payload.intent) {
        return sendError(
          res,
          'Missing required fields',
          400,
          {
            message: 'title, taskType, and intent are required',
            details: {
              provided: Object.keys(payload),
              required: ['title', 'taskType', 'intent']
            }
          }
        );
      }
      
      // Auto-detect missing fields
      const detected = await taskAutoDetectionService.detectFields(payload);
      
      // Convert to SimpleTaskData format (matches existing task creation)
      const taskData = {
        type: payload.taskType,
        title: payload.title,
        description: payload.intent,
        documentation: payload.intent,  // Use intent as documentation
        acceptanceCriteria: [`Task must accomplish: ${payload.intent}`],
        files: detected.detectedFiles,
        dependencies: [],
        project: 'app-monitor',  // Default project
        assignedAgent: payload.assignedAgent || 'claude-sonnet',
        priority: payload.priority || 1,
        metadata: {
          riskLevel: detected.inferredRiskLevel,
          contextProfiles: detected.selectedProfiles,
          desiredOutputs: detected.recommendedOutputs,
          autoDetectionConfidence: detected.confidence,
          autoDetectionWarnings: detected.warnings,
          submissionMode: 'minimal',
          followUpOf: payload.followUpOf,
          chainId: payload.chainId
        }
      };
      
      // Create task using existing service
      const result = await devBotsManager.addTask(taskData);
      
      logger.info({
        category: 'api',
        action: 'task_created_minimal',
        message: `Created task ${result.task.id} via minimal API`,
        details: {
          taskId: result.task.id,
          taskType: payload.taskType,
          filesDetected: detected.detectedFiles.length,
          riskLevel: detected.inferredRiskLevel,
          contextProfiles: detected.selectedProfiles,
          hasWarnings: detected.warnings.length > 0
        }
      });
      
      sendSuccess(
        res,
        {
          task: mapTaskToContract(result.task),
          validation: result.validation,
          autoDetection: detected
        },
        201
      );
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'task_creation_minimal_failed',
        message: `Failed to create task via minimal API: ${error}`,
        error
      });
      sendError(
        res,
        'Failed to create task',
        500,
        { message: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  /**
   * POST /tasks/preview-detection
   * Preview auto-detection without creating task
   * Useful for UX to show what will be detected before submission
   */
  router.post('/tasks/preview-detection', async (req: Request, res: Response) => {
    try {
      const payload: MinimalTaskPayload = req.body;
      
      // Validate at least task type is provided
      if (!payload.taskType) {
        return sendError(
          res,
          'Missing taskType',
          400,
          { message: 'taskType is required for preview' }
        );
      }
      
      const detected = await taskAutoDetectionService.detectFields(payload);
      
      logger.debug({
        category: 'api',
        action: 'preview_detection',
        message: `Preview detection for ${payload.taskType} task`,
        details: {
          taskType: payload.taskType,
          filesDetected: detected.detectedFiles.length,
          riskLevel: detected.inferredRiskLevel,
          profilesSelected: detected.selectedProfiles.length
        }
      });
      
      sendSuccess(res, detected);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'preview_detection_failed',
        message: `Failed to preview detection: ${error}`,
        error
      });
      sendError(res, 'Failed to preview detection', 500, { message: error instanceof Error ? error.message : String(error)
       });
    }
  });

  /**
   * POST /tasks/:taskId/timeout
   * Manually timeout a task after verification
   */
  router.post('/tasks/:taskId/timeout', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return sendError(res, 'Reason is required for manual timeout', 400);
      }

      devBotsManager.manuallyTimeoutTask(taskId, reason);
      sendSuccess(res, {
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
      sendError(res, 'Failed to timeout task', 500, { message: error instanceof Error ? error.message : String(error),
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
      sendSuccess(res, summary);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_queue_summary',
        message: `Error getting queue summary: ${error}`,
        error,
      });
      sendError(
        res,
        'Failed to get queue summary',
        500,
        { message: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  /**
   * GET /queue/stats
   * Get queue statistics including chain utilization
   */
  router.get('/queue/stats', (_req: Request, res: Response) => {
    try {
      const stats = devBotsManager.getTaskQueue().getChainStats();
      sendSuccess(res, stats);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_queue_stats',
        message: `Error getting queue stats: ${error}`,
        error
      });
      sendError(res, 'Failed to get queue stats', 500, { message: error instanceof Error ? error.message : String(error),
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
      sendSuccess(res, result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_validating_task_error',
        message: `Error validating task: ${error}`,
        error
      });
      sendError(res, 'Failed to validate task', 500, { message: error instanceof Error ? error.message : String(error),
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
      sendError(res, 'Failed to assign task', 500, { message: error instanceof Error ? error.message : String(error),
       });
    }
  });

  // ============================================================================
  // Log Streaming
  // ============================================================================

  /**
   * GET /tasks/:taskId/logs
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
      sendSuccess(res, response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_logs_metadata',
        message: `Error getting task log metadata: ${error}`,
        error,
      });
      sendError(res, 'Failed to get task logs', 500, { message: error instanceof Error ? error.message : String(error),
       });
    }
  });

  /**
   * GET /tasks/:taskId/logs/:stream
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
        sendError(res, 'Failed to stream task logs', 500, { message: error instanceof Error ? error.message : String(error),
         });
      }
    }
  });

  // ============================================================================
  // Task Context & Runs
  // ============================================================================

  /**
   * GET /tasks/:id/context
   * Get latest automation run context for task
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

      sendSuccess(res, latestRun);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_context',
        message: `Error getting task context: ${error}`,
        error
      });
      sendError(res, 'Failed to get task context', 500, { message: error instanceof Error ? error.message : String(error),
       });
    }
  });

  /**
   * GET /tasks/:id/runs
   * Get all automation runs for a task
   */
  router.get('/tasks/:id/runs', (req: Request, res: Response) => {
    try {
      const { id: taskId } = req.params;
      const runs = getTaskContextService().getTaskAutomationRuns(taskId);

      sendSuccess(res, { runs });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_task_runs',
        message: `Error getting task runs: ${error}`,
        error
      });
      sendError(res, 'Failed to get task runs', 500, { message: error instanceof Error ? error.message : String(error),
       });
    }
  });

  /**
   * GET /tasks/:id/runs/:runId
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

      sendSuccess(res, run);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_automation_run',
        message: `Error getting automation run: ${error}`,
        error
      });
      sendError(res, 'Failed to get automation run', 500, { message: error instanceof Error ? error.message : String(error),
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
        return sendError(res, 'PR number is required and must be a number', 400);
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
      sendError(res, 'Failed to track PR', 500, { message: error instanceof Error ? error.message : String(error),
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
      sendSuccess(res, blockedChains);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_blocked_chains',
        message: `Error getting blocked chains: ${error}`,
        error
      });
      sendError(res, 'Failed to get blocked chains', 500, { message: error instanceof Error ? error.message : String(error),
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
      sendError(res, 'Failed to unblock chain', 500, { message: error instanceof Error ? error.message : String(error),
       });
    }
  });

  return router;
}
