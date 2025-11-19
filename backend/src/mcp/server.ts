import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import Database from "better-sqlite3";
import { registerPlanTools } from "./tools/plans.tools.js";
import { registerTasksTools } from "./tools/tasks.tools.js";
import { registerBotsTools } from "./tools/bots.tools.js";
import { registerPrsTools } from "./tools/prs.tools.js";
import { registerSystemTools } from "./tools/system.tools.js";

export class AppMonitorMcpServer {
  private server: McpServer;
  private db: Database.Database;

  constructor(config: {
    databasePath: string;
  }) {
    this.db = new Database(config.databasePath);

    this.server = new McpServer({
      name: "app-monitor",
      version: "1.0.0"
    });

    this.registerAllTools();
  }

  private registerAllTools() {
    registerPlanTools(this.server, this.db);
    registerTasksTools(this.server, this.db);
    registerBotsTools(this.server, this.db);
    registerPrsTools(this.server, this.db);
    registerSystemTools(this.server, this.db);
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error("App Monitor MCP Server started");
    console.error(`Database: ${this.db.name}`);
    // console.error(`Tools registered: ${this.getToolCount()}`);
  }

  /*private getToolCount(): number {
    return Object.keys(this.server.tools).length;
  }*/
}

export async function startMcpServer(options: { db: Database.Database, services: any }) {
    const server = new AppMonitorMcpServer({
        databasePath: options.db.name,
    });
    await server.start();
}
