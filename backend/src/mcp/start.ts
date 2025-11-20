#!/usr/bin/env node
/**
 * MCP Server Start Script
 *
 * Entry point for MCP server when launched by Codex CLI.
 * This script initializes the database and services, then starts the MCP server.
 *
 * This runs as a separate process (spawned by Codex via stdio transport) and provides
 * the admin bot with access to all App Monitor MCP tools.
 */

import { startMcpServer } from './server.js';
import { createDevBotsManagerDependencies } from '../services/devBotsManager.factory.js';
import { DevBotsManager } from '../services/devBotsManager.js';
import { logger } from '../utils/logger.js';

async function main() {
  try {
    logger.info({
      category: 'mcp',
      action: 'startup',
      message: 'Starting MCP server for admin bot session'
    });

    // Create dev-bots manager dependencies (includes database)
    const devBotsDeps = await createDevBotsManagerDependencies();

    // Create dev-bots manager
    const devBotsManager = new DevBotsManager(devBotsDeps);

    // Start MCP server with raw database from task queue
    await startMcpServer({
      db: devBotsDeps.taskQueue.getDb(),
      services: { devBotsManager }
    });

    logger.info({
      category: 'mcp',
      action: 'started',
      message: 'MCP server started successfully'
    });

    // Keep process alive and handle shutdown gracefully
    process.on('SIGTERM', async () => {
      logger.info({
        category: 'mcp',
        action: 'shutdown',
        message: 'Received SIGTERM, shutting down MCP server'
      });
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info({
        category: 'mcp',
        action: 'shutdown',
        message: 'Received SIGINT, shutting down MCP server'
      });
      process.exit(0);
    });

  } catch (error) {
    logger.error({
      category: 'mcp',
      action: 'startup_error',
      message: 'Failed to start MCP server',
      error: error instanceof Error ? error.message : String(error)
    });
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
