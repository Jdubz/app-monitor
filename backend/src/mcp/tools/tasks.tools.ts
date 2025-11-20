import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { withAuth } from '../middleware/auth.js';
import type { McpServices } from '../server.js';
import type { Task, TaskStatus } from '../../services/taskQueue.sqlite.js';

type TaskCreateParams = {
  title: string;
  type?: 'implementation' | 'analysis' | 'documentation' | 'review';
  prompt: string;
  success_criteria?: string[];
  assigned_agent?: 'claude' | 'codex' | 'gemini';
  tags?: string[];
};

type TaskGetParams = { task_id: string };

type TaskListParams = {
  status?: TaskStatus;
  assigned_agent?: string;
  limit?: number;
};

type TaskUnblockParams = {
  task_id: string;
  resumed_by?: string;
};

type TaskReportOutcomeParams = {
  task_id: string;
  outcome: 'success' | 'failure';
  pr_url?: string;
  summary: string;
  files_changed?: string[];
  failure_reason?: string;
  failure_code?: 'compilation_error' | 'test_failure' | 'dependency_error' | 'timeout' | 'validation_error' | 'unknown';
  error_details?: string;
};

const TASK_LIST_STATUS_VALUES: TaskStatus[] = [
  'pending',
  'running',
  'blocked',
  'completed',
  'failed',
  'cancelled',
  'timeout',
];

const taskListSchema = z.object({
  status: z.enum(TASK_LIST_STATUS_VALUES as [TaskStatus, ...TaskStatus[]]).optional(),
  assigned_agent: z.string().min(1).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

function parseTaskMetadata(task: Task): Record<string, unknown> {
  const raw = task.metadata;
  if (!raw) {
    return {};
  }

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      return { corrupted_metadata: raw, parse_error: error instanceof Error ? error.message : String(error) };
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

  server.registerTool(
    'task_create',
    {
      title: 'Create Task',
      description: 'Creates a standalone task using the existing submission pipeline.',
      inputSchema: z.object({
        title: z.string().min(3),
        type: z.enum(['implementation', 'analysis', 'documentation', 'review']).optional(),
        prompt: z.string().min(10),
        success_criteria: z.array(z.string().min(3)).optional(),
        assigned_agent: z.enum(['claude', 'codex', 'gemini']).optional(),
        tags: z.array(z.string().min(1)).optional(),
      }),
    },
    withAuth('task_create', async (params: TaskCreateParams, _context) => {
      const noteFromTags = params.tags?.length ? `Tags: ${params.tags.join(', ')}` : undefined;
      const result = await devBotsManager.addTask({
        type: params.type ?? 'implementation',
        title: params.title,
        description: params.prompt,
        acceptanceCriteria: params.success_criteria ?? [],
        documentation: noteFromTags,
        project: 'app-monitor',
        assignedAgent: params.assigned_agent ?? 'claude-sonnet',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ task: result.task, validation: result.validation }, null, 2),
          },
        ],
      };
    }),
  );

  server.registerTool(
    'task_get',
    {
      title: 'Get Task',
      description: 'Retrieves the details of a task by ID.',
      inputSchema: z.object({
        task_id: z.string().min(1),
      }),
    },
    withAuth('task_get', async (params: TaskGetParams, _context) => {
      const task = taskQueue.getTask(params.task_id);
      if (!task) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Task not found: ${params.task_id}` }],
        };
      }

      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    }),
  );

  server.registerTool(
    'task_list',
    {
      title: 'List Tasks',
      description: 'Lists tasks with optional filtering.',
      inputSchema: taskListSchema,
    },
    withAuth('task_list', async (params: TaskListParams, _context) => {
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

      return { content: [{ type: 'text', text: JSON.stringify(limited, null, 2) }] };
    }),
  );

  server.registerTool(
    'task_unblock',
    {
      title: 'Resume Blocked Task',
      description: 'Resumes a blocked task using the manual resume flow.',
      inputSchema: z.object({
        task_id: z.string().min(1),
        resumed_by: z.string().optional(),
      }),
    },
    withAuth('task_unblock', async (params: TaskUnblockParams, context) => {
      try {
        const resumedBy = params.resumed_by || process.env.APP_MONITOR_MCP_USER_ID || context.role;
        taskQueue.resumeTask(params.task_id, resumedBy);
        return { content: [{ type: 'text', text: `Task ${params.task_id} resumed by ${resumedBy}` }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: 'text', text: `Failed to resume task: ${message}` }] };
      }
    }),
  );

  server.registerTool(
    'task_report_outcome',
    {
      title: 'Report Task Outcome',
      description: '(DEV-BOTS ONLY) Stores outcome details for the assigned task.',
      inputSchema: z.object({
        task_id: z.string().min(1),
        outcome: z.enum(['success', 'failure']),
        pr_url: z.string().optional(),
        summary: z.string().min(3),
        files_changed: z.array(z.string().min(1)).optional(),
        failure_reason: z.string().optional(),
        failure_code: z.enum(['compilation_error', 'test_failure', 'dependency_error', 'timeout', 'validation_error', 'unknown']).optional(),
        error_details: z.string().optional(),
      }),
    },
    withAuth('task_report_outcome', async (params: TaskReportOutcomeParams, context) => {
      const task = taskQueue.getTask(params.task_id);
      if (!task) {
        return { isError: true, content: [{ type: 'text', text: `Task not found: ${params.task_id}` }] };
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

      return {
        content: [
          {
            type: 'text',
            text: `Outcome recorded for ${params.task_id} (${params.outcome.toUpperCase()})`,
          },
        ],
      };
    }),
  );
}
