import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import Database from "better-sqlite3";
import { withAuth, getAuthContext } from "../middleware/auth.js";
import { McpServices } from "../server.js";

export function registerBotsTools(
  server: McpServer,
  db: Database.Database,
  services: McpServices
) {
  const devBotsManager = services.devBotsManager;

  server.registerTool(
    "bot_list_active",
    {
        title: "List Active Bots",
        description: "Lists all active dev-bots.",
        inputSchema: z.object({
            include_idle: z.boolean().optional(),
        }),
    },
    withAuth("bot_list_active", async (params) => {
        const active = devBotsManager.getActiveBots ? devBotsManager.getActiveBots() : [];
        // Filter if include_idle is false
        const result = params.include_idle ? active : active.filter((b: any) => b.status !== 'idle');
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    "bot_get_status",
    {
        title: "Get Bot Status",
        description: "Retrieves the detailed status of a dev-bot.",
        inputSchema: z.object({
            bot_id: z.string(),
        }),
    },
    withAuth("bot_get_status", async (params) => {
         const bot = devBotsManager.getBotStatus ? devBotsManager.getBotStatus(params.bot_id) : null;
         if (!bot) {
             return { isError: true, content: [{ type: "text", text: `Bot not found: ${params.bot_id}` }] };
         }
         return { content: [{ type: "text", text: JSON.stringify(bot, null, 2) }] };
    })
  );

  server.registerTool(
    "bot_recover",
    {
        title: "Recover Bot",
        description: "(ADMIN ONLY) Recovers a hung dev-bot.",
        inputSchema: z.object({
            bot_id: z.string(),
            reason: z.string(),
            recovery_strategy: z.enum(["auto", "diagnose", "requeue", "abandon"]).optional(),
        }),
    },
    withAuth("bot_recover", async (params) => {
        const context = getAuthContext();
        if (!context.isAdminBot) {
             return { isError: true, content: [{ type: "text", text: "Only admin bot can recover bots" }] };
        }

        // Assuming recoverBot method exists
        await devBotsManager.recoverBot(params.bot_id, params.reason, params.recovery_strategy);
        return { content: [{ type: "text", text: `Bot ${params.bot_id} recovery initiated` }] };
    })
  );

  server.registerTool(
    "bot_heartbeat_status",
    {
        title: "Bot Heartbeat Status",
        description: "Checks the heartbeat status of all dev-bots.",
        inputSchema: z.object({
            alert_threshold_seconds: z.number().optional(),
        }),
    },
    withAuth("bot_heartbeat_status", async (params) => {
        // Assuming getHeartbeatStatus exists
        const status = devBotsManager.getHeartbeatStatus ? devBotsManager.getHeartbeatStatus() : {};
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    })
  );
}
