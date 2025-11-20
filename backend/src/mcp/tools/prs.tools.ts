import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import Database from "better-sqlite3";

export function registerPrsTools(
  server: McpServer,
  db: Database.Database,
) {
  server.registerTool(
    "pr_trigger_evaluation",
    {
        title: "Trigger PR Evaluation",
        description: "Manually triggers a PR gate evaluation.",
        inputSchema: {
            pr_number: z.number(),
            force: z.boolean().optional(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );

  server.registerTool(
    "pr_get_blocking_issues",
    {
        title: "Get Blocking Issues for PR",
        description: "Retrieves the detailed reasons why a PR is blocked.",
        inputSchema: {
            pr_number: z.number(),
        },
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );
}
