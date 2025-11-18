/**
 * Test Database Utilities
 * 
 * Provides helper functions for creating isolated test database instances.
 * All test databases use in-memory SQLite to avoid file cleanup issues and
 * ensure proper test isolation.
 */

import Database from 'better-sqlite3';
import { TaskQueueService } from '../services/taskQueue.sqlite.js';

/**
 * Create an in-memory SQLite database for testing
 * @returns Database instance configured for tests
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  
  // Enable foreign keys for referential integrity in tests
  db.pragma('foreign_keys = ON');
  
  return db;
}

/**
 * Create a test TaskQueueService with in-memory database
 * @returns TaskQueueService instance for testing
 */
export function createTestTaskQueue(): TaskQueueService {
  return new TaskQueueService(':memory:');
}

/**
 * Safely close a database connection, ignoring errors
 * @param db Database or TaskQueueService to close
 */
export function closeTestDatabase(db: Database.Database | TaskQueueService): void {
  try {
    if ('close' in db) {
      db.close();
    }
  } catch (_err) {
    // Ignore close errors in tests - database may already be closed
  }
}

/**
 * Setup a test database with a custom schema
 * @param db Database instance
 * @param schema SQL schema to execute
 */
export function setupTestSchema(db: Database.Database, schema: string): void {
  db.exec(schema);
}

/**
 * Create a database with a specific schema for testing
 * @param schema SQL schema to execute
 * @returns Database instance with schema applied
 */
export function createTestDatabaseWithSchema(schema: string): Database.Database {
  const db = createTestDatabase();
  setupTestSchema(db, schema);
  return db;
}

/**
 * Common test schemas for reuse across tests
 */
export const TEST_SCHEMAS = {
  /**
   * Basic tasks table schema with phase system
   */
  tasks: `
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      phase_index INTEGER DEFAULT 1,
      phase_name TEXT,
      phase_status TEXT DEFAULT 'ready',
      phase_attempts INTEGER DEFAULT 1,
      phase_payload TEXT,
      chain_status TEXT,
      chain_id TEXT,
      chain_depth INTEGER DEFAULT 0,
      blocked_reason TEXT,
      blocked_at INTEGER,
      blocked_by TEXT,
      followup_for_pr INTEGER,
      pr_number INTEGER,
      pr_status TEXT,
      assigned_agent TEXT,
      created_at INTEGER NOT NULL
    );
  `,
  
  /**
   * Plans table schema
   */
  plans: `
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );
  `,
  
  /**
   * Session metadata for logs
   */
  sessionMetadata: `
    CREATE TABLE IF NOT EXISTS session_metadata (
      session_id TEXT PRIMARY KEY,
      user_agent TEXT NOT NULL,
      viewport_width INTEGER,
      viewport_height INTEGER,
      start_time TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `
};

/**
 * Example usage in tests:
 * 
 * ```typescript
 * import { createTestDatabase, closeTestDatabase, TEST_SCHEMAS } from '../__tests__/testDb.js';
 * 
 * describe('My Service', () => {
 *   let db: Database.Database;
 * 
 *   beforeEach(() => {
 *     db = createTestDatabase();
 *     db.exec(TEST_SCHEMAS.tasks);
 *   });
 * 
 *   afterEach(() => {
 *     closeTestDatabase(db);
 *   });
 * 
 *   // ... tests
 * });
 * ```
 * 
 * For TaskQueueService:
 * 
 * ```typescript
 * import { createTestTaskQueue, closeTestDatabase } from '../__tests__/testDb.js';
 * 
 * describe('My Service', () => {
 *   let taskQueue: TaskQueueService;
 * 
 *   beforeEach(() => {
 *     taskQueue = createTestTaskQueue();
 *   });
 * 
 *   afterEach(() => {
 *     closeTestDatabase(taskQueue);
 *   });
 * 
 *   // ... tests
 * });
 * ```
 */
