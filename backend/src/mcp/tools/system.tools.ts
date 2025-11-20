import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import Database from "better-sqlite3";
import { withAuth } from "../middleware/auth.js";
import type { McpServices } from "../server.js";

export function registerSystemTools(
  server: McpServer,
  db: Database.Database,
  services: McpServices,
) {
  server.registerTool(
    "system_health",
    {
        title: "System Health",
        description: "Provides a comprehensive overview of the system's health.",
        inputSchema: z.object({}),
    },
    withAuth("system_health", async (_params: Record<string, never>, _context) => {
        const health: Record<string, unknown> = {
            status: "healthy",
            database: "connected",
            timestamp: new Date().toISOString(),
        };

        try {
            db.prepare("SELECT 1").get();
        } catch (error) {
            health.status = "unhealthy";
            health.database = "disconnected";
            health.database_error = error instanceof Error ? error.message : String(error);
        }

        const taskQueue = services.devBotsManager.getTaskQueue ? services.devBotsManager.getTaskQueue() : null;
        if (taskQueue?.getQueueMetrics) {
            health.queue = taskQueue.getQueueMetrics();
        }

        if (services.devBotsManager.getSystemStatus) {
            const devBotStatus = await services.devBotsManager.getSystemStatus();
            health.devBots = {
                workerCount: devBotStatus.workerCount,
                maxWorkers: devBotStatus.maxWorkers,
                activeTasks: devBotStatus.activeTasks,
                systemStatus: devBotStatus.systemStatus,
            };
        }

        const orchestrator = services.devBotsManager.getPRWorkflowOrchestrator?.();
        if (orchestrator) {
            health.pr = { available: true };
        }

        return { content: [{ type: "text", text: JSON.stringify(health, null, 2) }] };
    })
  );
}
