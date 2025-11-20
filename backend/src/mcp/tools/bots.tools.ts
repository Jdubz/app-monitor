/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import Database from "better-sqlite3";
import { withAuth } from "../middleware/auth.js";
import { McpServices } from "../server.js";
import type { DevBotsStatus, WorkerStatus } from "../../services/statusAggregation.service.js";

export function registerBotsTools(
  server: McpServer,
  _db: Database.Database,
  services: McpServices
) {
  const devBotsManager = services.devBotsManager;

  const getSystemStatus = async (): Promise<DevBotsStatus> => {
    if (!devBotsManager.getSystemStatus) {
      throw new Error("DevBotsManager must expose getSystemStatus() for MCP access");
    }
    return await devBotsManager.getSystemStatus();
  };

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
        const status = await getSystemStatus();
        const workers = Object.values(status.workers || {}) as WorkerStatus[];
        const filtered = params.include_idle
            ? workers
            : workers.filter((worker) => worker.status !== "idle");
        return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
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
         const status = await getSystemStatus();
         const bot = status.workers?.[params.bot_id];
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
        if (!devBotsManager.triggerEmergencyRecovery) {
            return { isError: true, content: [{ type: "text", text: "Recovery orchestration is not available" }] };
        }
        await devBotsManager.triggerEmergencyRecovery();
        return { content: [{ type: "text", text: `Recovery orchestration triggered (requested bot: ${params.bot_id})` }] };
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
    withAuth("bot_heartbeat_status", async () => {
        const status = await getSystemStatus();
        const now = Date.now();
        const heartbeat = (Object.values(status.workers || {}) as WorkerStatus[]).map((worker) => ({
            id: worker.id,
            status: worker.status,
            current_task: worker.currentTask,
            milliseconds_since_last_seen: worker.lastSeen ? now - worker.lastSeen : null,
        }));
        return { content: [{ type: "text", text: JSON.stringify(heartbeat, null, 2) }] };
    })
  );
}
