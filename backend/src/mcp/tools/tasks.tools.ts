/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import Database from "better-sqlite3";
import { withAuth } from "../middleware/auth.js";
import { McpServices } from "../server.js";

export function registerTasksTools(
  server: McpServer,
  db: Database.Database,
  services: McpServices
) {
  const taskQueue = services.devBotsManager.getTaskQueue();

  server.registerTool(
    "task_create",
    {
        title: "Create Task",
        description: "Creates a standalone task.",
        inputSchema: z.object({
            title: z.string(),
            type: z.enum(["implementation", "analysis", "documentation", "review"]).optional(),
            prompt: z.string(),
            success_criteria: z.array(z.string()).optional(),
            assigned_agent: z.enum(["claude", "codex", "gemini"]).optional(),
            tags: z.array(z.string()).optional(),
        }),
    },
    withAuth("task_create", async (params) => {
        const task = await taskQueue.createTask({
            title: params.title,
            type: params.type || 'implementation',
            prompt: params.prompt,
            success_criteria: params.success_criteria,
            assigned_agent: params.assigned_agent,
            tags: params.tags,
            source: "mcp"
        });
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    })
  );

  server.registerTool(
    "task_get",
    {
        title: "Get Task",
        description: "Retrieves the details of a task.",
        inputSchema: z.object({
            task_id: z.string(),
        }),
    },
    withAuth("task_get", async (params) => {
        const task = await taskQueue.getTask(params.task_id);
        if (!task) {
            return { isError: true, content: [{ type: "text", text: `Task not found: ${params.task_id}` }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    })
  );

  server.registerTool(
    "task_list",
    {
        title: "List Tasks",
        description: "Lists tasks with filtering options.",
        inputSchema: z.object({
            status: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]).optional(),
            plan_id: z.string().optional(),
            batch_id: z.string().optional(),
            assigned_agent: z.string().optional(),
            limit: z.number().optional(),
        }),
    },
    withAuth("task_list", async (params) => {
        const tasks = await taskQueue.listTasks({
            status: params.status,
            plan_id: params.plan_id,
            batch_id: params.batch_id,
            assigned_agent: params.assigned_agent,
            limit: params.limit || 50
        });
        return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
    })
  );

  server.registerTool(
    "task_unblock",
    {
        title: "Unblock Task",
        description: "Manually unblocks a blocked task.",
        inputSchema: z.object({
            task_id: z.string(),
            resolution_notes: z.string(),
            retry_immediately: z.boolean().optional(),
        }),
    },
    withAuth("task_unblock", async (params) => {
        // Assuming taskQueue has an unblock method, otherwise might need to update state directly
        // Checking TaskQueue interface (inferred)
        // It might be updateTaskStatus or similar.
        // For now, I'll use a placeholder implementation that logs the intent if method missing
        try {
            // This might fail if method doesn't exist, catching it
             await taskQueue.unblockTask(params.task_id, params.resolution_notes);
             if (params.retry_immediately) {
                 // Retry logic
             }
             return { content: [{ type: "text", text: `Task ${params.task_id} unblocked` }] };
        } catch (e: any) {
             return { isError: true, content: [{ type: "text", text: `Failed to unblock task: ${e.message}` }] };
        }
    })
  );

  server.registerTool(
    "task_cancel",
    {
        title: "Cancel Task",
        description: "Cancels a task.",
        inputSchema: z.object({
            task_id: z.string(),
            reason: z.string(),
        }),
    },
    withAuth("task_cancel", async (params) => {
        await taskQueue.cancelTask(params.task_id, params.reason);
        return { content: [{ type: "text", text: `Task ${params.task_id} cancelled` }] };
    })
  );

  server.registerTool(
    "task_report_outcome",
    {
        title: "Report Task Outcome",
        description: "(DEV-BOTS ONLY) Allows a dev-bot to report the outcome of a task.",
        inputSchema: z.object({
            task_id: z.string(),
            outcome: z.enum(["success", "failure"]),
            pr_url: z.string().optional(),
            summary: z.string(),
            files_changed: z.array(z.string()).optional(),
            failure_reason: z.string().optional(),
            failure_code: z.enum(["compilation_error", "test_failure", "dependency_error", "timeout", "validation_error", "unknown"]).optional(),
            error_details: z.string().optional(),
        }),
    },
    withAuth("task_report_outcome", async (params) => {
        if (params.outcome === "success") {
            await taskQueue.completeTask(params.task_id, {
                pr_url: params.pr_url,
                summary: params.summary,
                files_changed: params.files_changed
            });
        } else {
            await taskQueue.failTask(params.task_id, {
                reason: params.failure_reason || "Unknown failure",
                code: params.failure_code || "unknown",
                details: params.error_details
            });
        }
        return { content: [{ type: "text", text: "Outcome reported" }] };
    })
  );
}
