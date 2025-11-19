import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import Database from "better-sqlite3";

export function registerTasksTools(
  server: McpServer,
  db: Database.Database,
) {
  server.registerTool(
    "task_create",
    {
        title: "Create Task",
        description: "Creates a standalone task.",
        inputSchema: {
            title: z.string(),
            type: z.enum(["implementation", "analysis", "documentation", "review"]),
            prompt: z.string(),
            success_criteria: z.array(z.string()).optional(),
            assigned_agent: z.enum(["claude", "codex", "gemini"]).optional(),
            tags: z.array(z.string()).optional(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "task_get",
    {
        title: "Get Task",
        description: "Retrieves the details of a task.",
        inputSchema: {
            task_id: z.string(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "task_list",
    {
        title: "List Tasks",
        description: "Lists tasks with filtering options.",
        inputSchema: {
            status: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]).optional(),
            plan_id: z.string().optional(),
            batch_id: z.string().optional(),
            assigned_agent: z.string().optional(),
            limit: z.number().optional(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "task_unblock",
    {
        title: "Unblock Task",
        description: "Manually unblocks a blocked task.",
        inputSchema: {
            task_id: z.string(),
            resolution_notes: z.string(),
            retry_immediately: z.boolean().optional(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "task_cancel",
    {
        title: "Cancel Task",
        description: "Cancels a task.",
        inputSchema: {
            task_id: z.string(),
            reason: z.string(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "task_report_outcome",
    {
        title: "Report Task Outcome",
        description: "(DEV-BOTS ONLY) Allows a dev-bot to report the outcome of a task.",
        inputSchema: {
            task_id: z.string(),
            outcome: z.enum(["success", "failure"]),
            pr_url: z.string().optional(),
            summary: z.string(),
            files_changed: z.array(z.string()).optional(),
            failure_reason: z.string().optional(),
            failure_code: z.enum(["compilation_error", "test_failure", "dependency_error", "timeout", "validation_error", "unknown"]).optional(),
            error_details: z.string().optional(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );
}
