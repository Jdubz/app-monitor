import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import Database from "better-sqlite3";
import { registerPlanTools } from "./tools/plans.tools.js";
import { registerTasksTools } from "./tools/tasks.tools.js";
import { registerBotsTools } from "./tools/bots.tools.js";
import { registerPrsTools } from "./tools/prs.tools.js";
import { registerSystemTools } from "./tools/system.tools.js";

export interface McpServices {
  devBotsManager: any; // Typed as any to avoid circular deps or complex type imports here
}

export class AppMonitorMcpServer {
  private server: McpServer;
  private db: Database.Database;
  private services: McpServices;

  constructor(config: {
    databasePath: string;
    services: McpServices;
  }) {
    this.db = new Database(config.databasePath);
    this.services = config.services;

    this.server = new McpServer({
      name: "app-monitor",
      version: "1.0.0"
    });

    this.registerAllTools();
  }

  private registerAllTools() {
    registerPlanTools(this.server, this.db);
    registerTasksTools(this.server, this.db, this.services);
    registerBotsTools(this.server, this.db, this.services);
    registerPrsTools(this.server, this.db, this.services);
    registerSystemTools(this.server, this.db);
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error("App Monitor MCP Server started");
    console.error(`Database: ${this.db.name}`);
  }
}

export async function startMcpServer(options: { db: Database.Database, services: McpServices }) {
    const server = new AppMonitorMcpServer({
        databasePath: options.db.name,
        services: options.services
    });
    await server.start();
}
