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
import type { TaskQueueService } from '../../services/taskQueue.sqlite.js';
import { logger } from '../../utils/logger.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';
import { ValidationError, BadRequestError } from '../../errors/ValidationError.js';
import { WorkerLogLocator } from '../../services/taskLogLocator.js';
import { getTaskContextService } from '../../services/taskContext.service.js';
import { taskAutoDetectionService } from '../../services/taskAutoDetection.service.js';
import { TaskCreationGuidelinesManager } from '../../services/taskCreationGuidelines.js';
import { PHASE_NAMES } from '../../services/phaseConstants.js';
import type {
  MinimalTaskPayload,
  DevBotsReportCompletionPayload,
  DevBotsReportCompletionResponse
} from '@app-monitor/api-contracts';
import {
  mapTasksToContract,
  mapTaskToContract,
  buildQueueSummary,
  buildTaskHistoryEvents,
  streamLogFile,
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
  const taskCreationGuidelinesManager = new TaskCreationGuidelinesManager();

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
  router.post('/tasks/minimal', async (req: Request, res: Response, next) => {
    try {
      const payload: MinimalTaskPayload = req.body;

      // Validate required fields
      if (!payload.title || !payload.taskType || !payload.intent) {
        throw new BadRequestError('Missing required fields', {
          provided: Object.keys(payload),
          required: ['title', 'taskType', 'intent']
        });
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

      // --- STRUCTURED VALIDATION ---
      const validationResult = taskCreationGuidelinesManager.validateTaskData(taskData, taskData.type);

      // Merge auto-detection warnings into validation warnings
      const allWarnings = [
        ...validationResult.warnings,
        ...detected.warnings.map(w => `Auto-detection: ${w}`)
      ];

      if (!validationResult.isValid) {
        // Throw ValidationError which will be caught by error middleware
        throw new ValidationError('Task validation failed', {
          errors: validationResult.errors,
          warnings: allWarnings,
          suggestions: validationResult.suggestions
        });
      }
      // --- END VALIDATION ---
      
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
      // Pass error to global error handler middleware
      next(error);
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
   * GET /tasks/:id/stage-runs
   * Get historical phase execution records for a task
   */
  router.get('/tasks/:id/stage-runs', (req: Request, res: Response) => {
    try {
      const { id: taskId } = req.params;
      const taskQueue = devBotsManager.getTaskQueue();

      // Use service method instead of direct DB access
      const stageRuns = taskQueue.getStageRuns(taskId);

      sendSuccess(res, { stageRuns });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_stage_runs',
        message: `Error getting stage runs for task: ${error}`,
        error
      });
      sendError(res, 'Failed to get stage runs', 500, {
        message: error instanceof Error ? error.message : String(error),
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

  /**
   * POST /:taskId/report-completion
   * Internal endpoint for bots to self-report task completion status
   * Only accessible from localhost/container network
   *
   * Body: { success: boolean, summary?: string }
   */
  router.post('/:taskId/report-completion', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { success, summary } = req.body as DevBotsReportCompletionPayload;

      // Security: Only allow from localhost/internal network
      const clientIp = req.ip || req.socket.remoteAddress || '';
      const isLocalhost = clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1';

      if (!isLocalhost) {
        logger.warn({
          category: 'api',
          action: 'blocked_external_completion_report',
          message: `Blocked external completion report attempt from ${clientIp}`,
          details: { taskId, clientIp }
        });
        return res.status(403).json({
          error: 'Forbidden',
          message: 'This endpoint is only accessible from localhost'
        });
      }

      // Validate input
      if (!taskId || typeof taskId !== 'string') {
        return res.status(400).json({
          error: 'Invalid task ID',
          message: 'taskId must be a non-empty string'
        });
      }

      if (typeof success !== 'boolean') {
        return res.status(400).json({
          error: 'Invalid success field',
          message: 'success must be a boolean value'
        });
      }

      // Update task with bot-reported status
      const taskQueue = devBotsManager.getTaskQueue();
      const task = taskQueue.getTask(taskId);

      if (!task) {
        return res.status(404).json({
          error: 'Task not found',
          message: `Task ${taskId} does not exist`
        });
      }

      // Store the bot-reported status in task metadata
      // Note: task.metadata from DB is stored as TEXT (string), but interface expects Record<string, unknown>
      const existingMetadata = typeof task.metadata === 'string'
        ? JSON.parse(task.metadata)
        : (task.metadata || {});

      const metadata: Record<string, unknown> = {
        ...existingMetadata,
        bot_reported_success: success,
        bot_reported_summary: summary || null,
        bot_reported_at: Date.now()
      };

      // Update task metadata using the public method to maintain encapsulation
      taskQueue.updateTaskMetadata(taskId, metadata);

      logger.info({
        category: 'process',
        action: 'bot_reported_completion',
        message: `Bot reported ${success ? 'SUCCESS' : 'FAILURE'} for task ${taskId}`,
        details: {
          taskId,
          success,
          summary,
          task_title: task.title
        }
      });

      const response: DevBotsReportCompletionResponse = {
        success: true,
        message: `Task completion status recorded: ${success ? 'SUCCESS' : 'FAILURE'}`,
        taskId
      };

      res.json(response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_recording_completion_report',
        message: `Error recording bot completion report: ${error}`,
        error
      });
      sendError(res, 'Failed to record completion report', 500, {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ============================================================================
  // Phase System Endpoints
  // ============================================================================

  /**
   * GET /tasks/:taskId/phases
   * Get phase execution history for a task
   */
  router.get('/tasks/:taskId/phases', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;

      const taskQueue = devBotsManager.getTaskQueue();

      // Get task info
      const task = taskQueue.getTask(taskId);
      if (!task) {
        sendError(res, 'Task not found', 404);
        return;
      }

      // Use service method instead of direct DB access
      const phaseHistory = taskQueue.getPhaseHistory(taskId);

      // Parse artifacts_blob and recovery_diagnosis JSON fields
      const parsedHistory = phaseHistory.map((run) => {
        return {
          ...run,
          artifacts: run.artifacts_blob ? JSON.parse(run.artifacts_blob) : null,
          validation: run.validation_result ? JSON.parse(run.validation_result) : null,
        };
      });

      sendSuccess(res, {
        taskId,
        currentPhase: {
          index: task.phase_index,
          name: task.phase_name,
          status: task.phase_status,
          attempts: task.phase_attempts,
        },
        history: parsedHistory,
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_phase_history',
        message: `Error getting phase history: ${error}`,
        error
      });
      sendError(res, 'Failed to get phase history', 500, { 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  /**
   * GET /phases/metrics
   * Get aggregated phase system metrics
   */
  router.get('/phases/metrics', async (_req: Request, res: Response) => {
    try {
      const taskQueue = devBotsManager.getTaskQueue();

      // Use service method instead of direct DB access
      const metrics = taskQueue.getPhaseMetrics();

      sendSuccess(res, metrics);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_phase_metrics',
        message: `Error getting phase metrics: ${error}`,
        error
      });
      sendError(res, 'Failed to get phase metrics', 500, { 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  /**
   * GET /phases/:phaseIndex/metrics
   * Get metrics for a specific phase
   */
  router.get('/phases/:phaseIndex/metrics', async (req: Request, res: Response) => {
    try {
      const phaseIndex = parseInt(req.params.phaseIndex, 10);

      if (isNaN(phaseIndex) || phaseIndex < 1 || phaseIndex > 7) {
        sendError(res, 'Invalid phase index. Must be between 1 and 7.', 400);
        return;
      }

      const taskQueue = devBotsManager.getTaskQueue();

      // Use service method instead of direct DB access
      const phaseMetrics = taskQueue.getPhaseSpecificMetrics(phaseIndex);

      if (!phaseMetrics) {
        sendError(res, 'No metrics available for this phase', 404);
        return;
      }

      sendSuccess(res, phaseMetrics);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_phase_specific_metrics',
        message: `Error getting phase-specific metrics: ${error}`,
        error
      });
      sendError(res, 'Failed to get phase metrics', 500, { 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  /**
   * POST /phases/metrics/refresh
   * Clear the metrics cache to force fresh calculation
   */
  router.post('/phases/metrics/refresh', async (_req: Request, res: Response) => {
    try {
      const taskQueue = devBotsManager.getTaskQueue();

      // Use service method instead of direct DB access
      taskQueue.clearPhaseMetricsCache();

      sendSuccess(res, { 
        message: 'Phase metrics cache cleared',
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_refreshing_phase_metrics',
        message: `Error refreshing phase metrics: ${error}`,
        error
      });
      sendError(res, 'Failed to refresh phase metrics', 500, { 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // ============================================================================
  // Test-Only Endpoints (E2E Testing)
  // ============================================================================

  /**
   * POST /tasks/:taskId/simulate-phase-progression
   * Test-only endpoint to simulate phase execution without Docker
   * 
   * Security: Only available in test/development environments
   * 
   * Simulates a task progressing through all 7 phases with realistic delays.
   * Used by E2E tests to validate phase tracking without spinning up dev-bots.
   */
  router.post('/tasks/:taskId/simulate-phase-progression', async (req: Request, res: Response) => {
    // Security: Only allow in test/development environment
    if (process.env.NODE_ENV === 'production') {
      return sendError(res, 'This endpoint is only available in test/development environments', 403);
    }

    const { taskId } = req.params;
    const { speed = 'normal' } = req.body as { speed?: 'fast' | 'normal' | 'slow' };

    try {
      const taskQueue = devBotsManager.getTaskQueue();
      const task = taskQueue.getTask(taskId);

      if (!task) {
        return sendError(res, `Task ${taskId} not found`, 404);
      }

      logger.info({
        category: 'test',
        action: 'simulate_phase_progression_start',
        message: `Starting simulated phase progression for task ${taskId}`,
        details: { taskId, speed, currentPhase: task.phase_index }
      });

      // Start async phase progression (don't await - return immediately)
      simulatePhaseProgression(taskId, taskQueue, speed).catch((error) => {
        logger.error({
          category: 'test',
          action: 'simulate_phase_progression_error',
          message: `Error in phase simulation for ${taskId}: ${error}`,
          error,
          details: { taskId }
        });
      });

      sendSuccess(res, {
        message: 'Phase progression simulation started',
        taskId,
        speed,
        currentPhase: task.phase_index
      });

    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_starting_phase_simulation',
        message: `Error starting phase simulation: ${error}`,
        error
      });
      sendError(res, 'Failed to start phase simulation', 500, {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}

/**
 * Helper function to simulate phase progression for testing
 * Progresses task through phases 1-7 with realistic delays
 */
async function simulatePhaseProgression(
  taskId: string,
  taskQueue: TaskQueueService,
  speed: 'fast' | 'normal' | 'slow'
): Promise<void> {
  const delays = {
    fast: 100,    // 100ms per phase
    normal: 500,  // 500ms per phase
    slow: 2000    // 2s per phase
  };

  const phaseDelay = delays[speed];
  const db = taskQueue.getDatabase();

  // Use centralized phase names constant
  const phaseNames = Object.values(PHASE_NAMES);

  for (let phaseIndex = 1; phaseIndex <= 7; phaseIndex++) {
    const phaseName = phaseNames[phaseIndex - 1];

    // Update task to new phase
    // eslint-disable-next-line local-rules/no-direct-db-in-routes -- Test simulation endpoint
    db.prepare(`
      UPDATE tasks
      SET phase_index = ?,
          phase_name = ?,
          phase_status = 'running',
          phase_attempts = 1
      WHERE id = ?
    `).run(phaseIndex, phaseName, taskId);

    logger.info({
      category: 'test',
      action: 'simulate_phase_update',
      message: `Task ${taskId} now in phase ${phaseIndex}: ${phaseName}`,
      details: { taskId, phaseIndex, phaseName }
    });

    // Wait before next phase
    await new Promise(resolve => setTimeout(resolve, phaseDelay));

    // Mark phase as complete
    // eslint-disable-next-line local-rules/no-direct-db-in-routes -- Test simulation endpoint
    db.prepare(`
      UPDATE tasks
      SET phase_status = 'complete'
      WHERE id = ?
    `).run(taskId);
  }

  // Mark task as completed
  // eslint-disable-next-line local-rules/no-direct-db-in-routes -- Test simulation endpoint
  db.prepare(`
    UPDATE tasks
    SET status = 'completed',
        phase_status = 'complete',
        completed_at = ?
    WHERE id = ?
  `).run(Date.now(), taskId);

  logger.info({
    category: 'test',
    action: 'simulate_phase_progression_complete',
    message: `Task ${taskId} completed all 7 phases`,
    details: { taskId }
  });
}
