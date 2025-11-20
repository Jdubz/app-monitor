import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import Database from "better-sqlite3";

export function registerSystemTools(
  server: McpServer,
  db: Database.Database,
) {
  server.registerTool(
    "system_health",
    {
        title: "System Health",
        description: "Provides a comprehensive overview of the system's health.",
        inputSchema: {},
    },
    async (params) => {
        return { content: [{ type: "text", text: "Tool not implemented" }] };
    }
  );
}
