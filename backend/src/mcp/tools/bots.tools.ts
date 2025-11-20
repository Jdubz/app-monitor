import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Database from "better-sqlite3";
import { withAuth } from "../middleware/auth.js";
import { createJsonResponse, createErrorResponse, createSuccessResponse, withErrorHandling } from "../utils/response.js";
import { McpServices } from "../server.js";
import type { DevBotsStatus, WorkerStatus } from "../../services/statusAggregation.service.js";
import { registerZodTool } from "../utils/registerTool.js";

const botListActiveInputSchema = z.object({
  include_idle: z.boolean().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const botGetStatusInputSchema = z.object({
  bot_id: z.string(),
});

const botRecoverInputSchema = z.object({
  bot_id: z.string(),
  reason: z.string(),
});

const botHeartbeatInputSchema = z.object({
  alert_threshold_seconds: z.number().optional(),
});

type BotListActiveParams = z.infer<typeof botListActiveInputSchema>;
type BotGetStatusParams = z.infer<typeof botGetStatusInputSchema>;
type BotRecoverParams = z.infer<typeof botRecoverInputSchema>;
type BotHeartbeatParams = z.infer<typeof botHeartbeatInputSchema>;

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

  registerZodTool(
    server,
    "bot_list_active",
    {
        title: "List Active Bots",
        description: "Lists all active dev-bots.",
        inputSchema: botListActiveInputSchema,
    },
    withAuth("bot_list_active", withErrorHandling(async (params: BotListActiveParams) => {
        const status = await getSystemStatus();
        const workers = Object.values(status.workers || {}) as WorkerStatus[];
        const filtered = params.include_idle
            ? workers
            : workers.filter((worker) => worker.status !== "idle");

        // Add pagination
        const limit = Math.min(params.limit ?? 50, 100);
        const limited = filtered.slice(0, limit);

        return createJsonResponse(limited);
    }))
  );

  registerZodTool(
    server,
    "bot_get_status",
    {
        title: "Get Bot Status",
        description: "Retrieves the detailed status of a dev-bot.",
        inputSchema: botGetStatusInputSchema,
    },
    withAuth("bot_get_status", withErrorHandling(async (params: BotGetStatusParams) => {
         const status = await getSystemStatus();
         const bot = status.workers?.[params.bot_id];
         if (!bot) {
             return createErrorResponse(`Bot not found: ${params.bot_id}`);
         }
         return createJsonResponse(bot);
    }))
  );

  registerZodTool(
    server,
    "bot_recover",
    {
        title: "Recover Bot",
        description: "(ADMIN ONLY) Triggers emergency recovery orchestration. Note: Currently triggers system-wide recovery rather than targeting a specific bot.",
        inputSchema: botRecoverInputSchema,
    },
    withAuth("bot_recover", withErrorHandling(async (params: BotRecoverParams) => {
        if (!devBotsManager.triggerEmergencyRecovery) {
            return createErrorResponse("Recovery orchestration is not available");
        }
        await devBotsManager.triggerEmergencyRecovery();
        return createSuccessResponse(`Recovery orchestration triggered (reason: ${params.reason}, mentioned bot: ${params.bot_id})`);
    }))
  );

  registerZodTool(
    server,
    "bot_heartbeat_status",
    {
        title: "Bot Heartbeat Status",
        description: "Checks the heartbeat status of all dev-bots.",
        inputSchema: botHeartbeatInputSchema,
    },
    withAuth("bot_heartbeat_status", withErrorHandling(async (params: BotHeartbeatParams) => {
        const status = await getSystemStatus();
        const now = Date.now();
        const thresholdMs = (params.alert_threshold_seconds ?? 30) * 1000;
        const heartbeat = (Object.values(status.workers || {}) as WorkerStatus[]).map((worker) => ({
            id: worker.id,
            status: worker.status,
            current_task: worker.currentTask,
            milliseconds_since_last_seen: worker.lastSeen ? now - worker.lastSeen : null,
            needs_attention: worker.lastSeen ? now - worker.lastSeen > thresholdMs : null,
        }));
        return createJsonResponse(heartbeat);
    }))
  );
}
