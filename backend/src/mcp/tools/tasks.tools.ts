import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { withAuth, type AuthContext } from '../middleware/auth.js';
import { createJsonResponse, createErrorResponse, createSuccessResponse, withErrorHandling } from '../utils/response.js';
import { logger } from '../../utils/logger.js';
import type { McpServices } from '../server.js';
import type { Task, TaskStatus } from '../../services/taskQueue.sqlite.js';
import { registerZodTool } from '../utils/registerTool.js';

const TASK_LIST_STATUS_VALUES: TaskStatus[] = [
  'pending',
  'running',
  'blocked',
  'completed',
  'failed',
  'cancelled',
  'timeout',
];
const taskCreateInputSchema = z.object({
  title: z.string().min(3),
  type: z.enum(['implementation', 'analysis', 'documentation', 'review']).optional(),
  prompt: z.string().min(10),
  success_criteria: z.array(z.string().min(3)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const taskGetInputSchema = z.object({
  task_id: z.string().min(1),
});

const taskListInputSchema = z.object({
  status: z.enum(TASK_LIST_STATUS_VALUES as [TaskStatus, ...TaskStatus[]]).optional(),
  assigned_agent: z.string().min(1).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

const taskUnblockInputSchema = z.object({
  task_id: z.string().min(1),
  resumed_by: z.string().optional(),
});

const taskOutcomeInputSchema = z.object({
  task_id: z.string().min(1),
  outcome: z.enum(['success', 'failure']),
  pr_url: z.string().optional(),
  summary: z.string().min(3),
  files_changed: z.array(z.string().min(1)).optional(),
  failure_reason: z.string().optional(),
  failure_code: z.enum(['compilation_error', 'test_failure', 'dependency_error', 'timeout', 'validation_error', 'unknown']).optional(),
  error_details: z.string().optional(),
});

type TaskCreateParams = z.infer<typeof taskCreateInputSchema>;
type TaskGetParams = z.infer<typeof taskGetInputSchema>;
type TaskListParams = z.infer<typeof taskListInputSchema>;
type TaskUnblockParams = z.infer<typeof taskUnblockInputSchema>;
type TaskReportOutcomeParams = z.infer<typeof taskOutcomeInputSchema>;

function parseTaskMetadata(task: Task): Record<string, unknown> {
  const raw = task.metadata;
  if (!raw) {
    return {};
  }

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const rawStr = String(raw);
      logger.warn({
        category: 'mcp',
        action: 'metadata_parse_error',
        message: `Failed to parse metadata for task ${task.id}`,
        details: {
          taskId: task.id,
          error: errorMessage,
          metadata: rawStr.substring(0, 100), // Log first 100 chars
        },
      });
      return { corrupted_metadata: raw, parse_error: errorMessage };
    }
  }

  return raw as Record<string, unknown>;
}

function selectTasksByStatus(allTasks: Task[], status?: TaskStatus): Task[] {
  if (!status) {
    return allTasks;
  }
  return allTasks.filter((task) => task.status === status);
}

export function registerTasksTools(
  server: McpServer,
  _db: Database.Database,
  services: McpServices,
) {
  const { devBotsManager } = services;
  const taskQueue = devBotsManager.getTaskQueue();

  registerZodTool(
    server,
    'task_create',
    {
      title: 'Create Task',
      description: 'Creates a standalone task using the existing submission pipeline.',
      inputSchema: taskCreateInputSchema,
    },
    withAuth('task_create', withErrorHandling(async (params: TaskCreateParams) => {
      const noteFromTags = params.tags?.length ? `Tags: ${params.tags.join(', ')}` : undefined;
      const result = await devBotsManager.addTask({
        type: params.type ?? 'implementation',
        title: params.title,
        description: params.prompt,
        acceptanceCriteria: params.success_criteria ?? [],
        documentation: noteFromTags,
        project: 'app-monitor',
      });

      return createJsonResponse({ task: result.task, validation: result.validation });
    })),
  );

  registerZodTool(
    server,
    'task_get',
    {
      title: 'Get Task',
      description: 'Retrieves the details of a task by ID.',
      inputSchema: taskGetInputSchema,
    },
    withAuth('task_get', withErrorHandling(async (params: TaskGetParams) => {
      const task = taskQueue.getTask(params.task_id);
      if (!task) {
        return createErrorResponse(`Task not found: ${params.task_id}`);
      }

      return createJsonResponse(task);
    })),
  );

  registerZodTool(
    server,
    'task_list',
    {
      title: 'List Tasks',
      description: 'Lists tasks with optional filtering.',
      inputSchema: taskListInputSchema,
    },
    withAuth('task_list', withErrorHandling(async (params: TaskListParams) => {
      const lists = await devBotsManager.getTasks();
      const combined: Task[] = [
        ...lists.pending,
        ...lists.active,
        ...lists.blocked,
        ...lists.completed,
        ...lists.failed,
      ];

      let filtered = selectTasksByStatus(combined, params.status);

      if (params.status && (params.status === 'cancelled' || params.status === 'timeout')) {
        filtered = taskQueue.getTasksByStatus(params.status);
      }

      if (params.assigned_agent) {
        const agentLower = params.assigned_agent.toLowerCase();
        filtered = filtered.filter((task) => (task.assigned_agent ?? '').toLowerCase() === agentLower);
      }

      const limit = Math.min(params.limit ?? 50, 200);
      const limited = filtered.slice(0, limit);

      return createJsonResponse(limited);
    })),
  );

  registerZodTool(
    server,
    'task_unblock',
    {
      title: 'Resume Blocked Task',
      description: 'Resumes a blocked task using the manual resume flow.',
      inputSchema: taskUnblockInputSchema,
    },
    withAuth('task_unblock', withErrorHandling(async (params: TaskUnblockParams, context: AuthContext) => {
      const resumedBy = params.resumed_by || process.env.APP_MONITOR_MCP_USER_ID || context.role;
      taskQueue.resumeTask(params.task_id, resumedBy);
      return createSuccessResponse(`Task ${params.task_id} resumed by ${resumedBy}`);
    })),
  );

  registerZodTool(
    server,
    'task_report_outcome',
    {
      title: 'Report Task Outcome',
      description: '(DEV-BOTS ONLY) Stores outcome details for the assigned task.',
      inputSchema: taskOutcomeInputSchema,
    },
    withAuth('task_report_outcome', withErrorHandling(async (params: TaskReportOutcomeParams, context: AuthContext) => {
      const task = taskQueue.getTask(params.task_id);
      if (!task) {
        return createErrorResponse(`Task not found: ${params.task_id}`);
      }

      const metadata = {
        ...parseTaskMetadata(task),
        bot_reported_success: params.outcome === 'success',
        bot_reported_summary: params.summary,
        bot_reported_at: Date.now(),
        bot_reported_pr_url: params.pr_url ?? null,
        bot_reported_files_changed: params.files_changed ?? null,
        bot_reported_failure_reason: params.failure_reason ?? null,
        bot_reported_failure_code: params.failure_code ?? null,
        bot_reported_error_details: params.error_details ?? null,
        bot_reported_by: context.role,
      };

      taskQueue.updateTaskMetadata(params.task_id, metadata);

      return createSuccessResponse(`Outcome recorded for ${params.task_id} (${params.outcome.toUpperCase()})`);
    })),
  );
}
