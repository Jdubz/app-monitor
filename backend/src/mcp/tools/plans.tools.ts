import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import Database from "better-sqlite3";

export function registerPlanTools(
  server: McpServer,
  db: Database.Database,
) {
  server.registerTool(
    "plan_create",
    {
        title: "Create Plan",
        description: "Creates a new plan with an auto-generated YAML file.",
        inputSchema: {
            name: z.string(),
            type: z.enum(["feature", "refactor", "fix", "investigation"]).optional(),
            priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "plan_get_status",
    {
        title: "Get Plan Status",
        description: "Retrieves the execution status of a plan.",
        inputSchema: {
            plan_id: z.string(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "plan_update_metadata",
    {
        title: "Update Plan Metadata",
        description: "Updates a plan's metadata.",
        inputSchema: {
            plan_id: z.string(),
            updates: z.object({
                title: z.string().optional(),
                description: z.string().optional(),
                priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
                estimated_effort_hours: z.number().optional(),
            }),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "plan_add_batch",
    {
        title: "Add Batch to Plan",
        description: "Adds a batch of tasks to a plan.",
        inputSchema: {
            plan_id: z.string(),
            batch: z.object({
                id: z.string().optional(),
                name: z.string(),
                description: z.string().optional(),
                order_num: z.number().optional(),
                depends_on: z.array(z.string()).optional(),
                tasks: z.array(z.object({
                    title: z.string(),
                    type: z.enum(["implementation", "analysis", "documentation", "review"]).optional(),
                    context: z.string(),
                    success_criteria: z.array(z.string()),
                    estimated_effort_hours: z.number().optional(),
                    agent_preference: z.enum(["claude", "codex", "gemini"]).optional(),
                    tags: z.array(z.string()).optional(),
                })),
            }),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "plan_update_batch",
    {
        title: "Update Batch in Plan",
        description: "Updates a batch of tasks (fails if the batch has already been imported).",
        inputSchema: {
            plan_id: z.string(),
            batch_id: z.string(),
            updates: z.object({
                name: z.string().optional(),
                description: z.string().optional(),
                tasks: z.array(z.any()).optional(),
            }),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "plan_update_markdown",
    {
        title: "Update Plan Markdown",
        description: "Updates the markdown sections of a plan.",
        inputSchema: {
            plan_id: z.string(),
            section: z.enum(["research", "execution", "retrospective", "full"]),
            content: z.string(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "plan_validate",
    {
        title: "Validate Plan",
        description: "Validates a plan without saving it.",
        inputSchema: {
            plan_id: z.string(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "plan_save",
    {
        title: "Save Plan",
        description: "Persists a plan to the database.",
        inputSchema: {
            plan_id: z.string(),
            commit_message: z.string().optional(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "plan_list",
    {
        title: "List Plans",
        description: "Lists plans with filtering options.",
        inputSchema: {
            status: z.enum(["draft", "researched", "ready", "in_progress", "completed"]).optional(),
            type: z.enum(["feature", "refactor", "fix", "investigation"]).optional(),
            limit: z.number().optional(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "plan_get_progress",
    {
        title: "Get Plan Progress",
        description: "Retrieves the real-time execution progress of a plan.",
        inputSchema: {
            plan_id: z.string(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "batch_can_import",
    {
        title: "Check if Batch Can Be Imported",
        description: "Checks if a batch is ready to be imported.",
        inputSchema: {
            plan_id: z.string(),
            batch_id: z.string(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );
}
