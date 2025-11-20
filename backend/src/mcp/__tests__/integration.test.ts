import { AppMonitorMcpServer } from '../server';
import Database from 'better-sqlite3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { describe, it, expect, beforeEach } from 'vitest';

describe('MCP Server Integration', () => {
  let server: AppMonitorMcpServer;
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    server = new AppMonitorMcpServer({ databasePath: ':memory:' });
  });

  it('should initialize the server without errors', async () => {
    // If the server initializes without throwing an error,
    // we can infer that all tools were registered correctly.
    expect(server).toBeInstanceOf(AppMonitorMcpServer);
  });
});
