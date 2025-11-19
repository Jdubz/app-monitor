import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import Database from "better-sqlite3";
import { withAuth } from "../middleware/auth.js";

export function registerSystemTools(
  server: McpServer,
  db: Database.Database,
) {
  server.registerTool(
    "system_health",
    {
        title: "System Health",
        description: "Provides a comprehensive overview of the system's health.",
        inputSchema: z.object({}),
    },
    withAuth("system_health", async (params) => {
        // Basic health check
        const health = {
            status: "healthy",
            database: "connected",
            timestamp: new Date().toISOString(),
            // Could add more metrics here if available via db or services
        };

        try {
            db.prepare("SELECT 1").get();
        } catch (e) {
            health.status = "unhealthy";
            health.database = "disconnected";
        }

        return { content: [{ type: "text", text: JSON.stringify(health, null, 2) }] };
    })
  );
}
