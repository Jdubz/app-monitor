/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import Database from "better-sqlite3";
import { withAuth } from "../middleware/auth.js";
import { McpServices } from "../server.js";

export function registerPrsTools(
  server: McpServer,
  db: Database.Database,
  services: McpServices
) {
  const prOrchestrator = services.devBotsManager.getPRWorkflowOrchestrator();

  server.registerTool(
    "pr_trigger_evaluation",
    {
        title: "Trigger PR Evaluation",
        description: "Manually triggers a PR gate evaluation.",
        inputSchema: z.object({
            pr_number: z.number(),
            force: z.boolean().optional(),
        }),
    },
    withAuth("pr_trigger_evaluation", async (params) => {
        await prOrchestrator.evaluatePR(params.pr_number, { force: params.force });
        return { content: [{ type: "text", text: `Evaluation triggered for PR #${params.pr_number}` }] };
    })
  );

  server.registerTool(
    "pr_get_blocking_issues",
    {
        title: "Get Blocking Issues for PR",
        description: "Retrieves the detailed reasons why a PR is blocked.",
        inputSchema: z.object({
            pr_number: z.number(),
        }),
    },
    withAuth("pr_get_blocking_issues", async (params) => {
        const status = await prOrchestrator.getPRStatus(params.pr_number);
        if (!status) {
             return { isError: true, content: [{ type: "text", text: `PR #${params.pr_number} not found` }] };
        }

        const blocking = status.checks.filter((c: any) => c.status === 'failed' || c.status === 'blocking');
        return { content: [{ type: "text", text: JSON.stringify(blocking, null, 2) }] };
    })
  );
}
