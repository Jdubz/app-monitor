import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import Database from 'better-sqlite3';
import { registerTasksTools } from './tools/tasks.tools.js';
import { registerBotsTools } from './tools/bots.tools.js';
import { registerPrsTools } from './tools/prs.tools.js';
import { registerSystemTools } from './tools/system.tools.js';
import type { DevBotsManager } from '../services/devBotsManager.js';

export interface McpServices {
  devBotsManager: DevBotsManager;
}

export class AppMonitorMcpServer {
  private server: McpServer;

  private db: Database.Database;

  private services: McpServices;

  constructor(config: {
    db: Database.Database;
    services: McpServices;
  }) {
    this.db = config.db;
    this.services = config.services;

    this.server = new McpServer({
      name: 'app-monitor',
      version: '1.0.0',
    });

    this.registerAllTools();
  }

  private registerAllTools() {
    registerTasksTools(this.server, this.db, this.services);
    registerBotsTools(this.server, this.db, this.services);
    registerPrsTools(this.server, this.db, this.services);
    registerSystemTools(this.server, this.db, this.services);
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('App Monitor MCP Server started');
    console.error(`Database: ${this.db.name}`);
    console.error(`Tools registered: ${this.getToolCount()}`);
  }

  private getToolCount(): number {
    const registry = (this.server as unknown as { tools?: Record<string, unknown> }).tools;
    return registry ? Object.keys(registry).length : 0;
  }
}

export async function startMcpServer(options: {
  db: Database.Database;
  services: McpServices;
}) {
  const server = new AppMonitorMcpServer({
    db: options.db,
    services: options.services,
  });
  await server.start();
  return server;
}
