/**
 * Test Database Helper
 *
 * Creates in-memory SQLite databases for testing without requiring
 * a persistent database. Safe for CI environments.
 */

import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { DevBotsDatabase } from '../../../database.js';

export class TestDatabase {
  private db: Database.Database | null = null;

  /**
   * Create an in-memory database for testing
   * Runs the context bundle cache migration
   */
  async create(): Promise<Database.Database> {
    // Create in-memory database (no file system required)
    this.db = new Database(':memory:');

    // Run the context bundle cache migration
    await this.runMigration();

    return this.db;
  }

  /**
   * Run the context_bundle_cache table migration
   */
  private async runMigration(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not created');
    }

    // Read the migration file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const migrationPath = path.join(__dirname, '../../../../../migrations/019_context_bundle_cache.sql');

    const migrationSql = await fs.readFile(migrationPath, 'utf-8');

    // Execute migration
    this.db.exec(migrationSql);
  }

  /**
   * Get the database connection
   */
  getConnection(): Database.Database {
    if (!this.db) {
      throw new Error('Database not created. Call create() first.');
    }
    return this.db;
  }

  /**
   * Close and destroy the database
   */
  destroy(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Clear all data from the context_bundle_cache table
   */
  clearData(): void {
    if (!this.db) return;

    this.db.prepare('DELETE FROM context_bundle_cache').run();
  }

  /**
   * Get row count from context_bundle_cache
   */
  getRowCount(): number {
    if (!this.db) return 0;

    const result = this.db.prepare('SELECT COUNT(*) as count FROM context_bundle_cache').get() as { count: number };
    return result.count;
  }

  /**
   * Get a DevBotsDatabase-compatible wrapper for use with ContextCache
   */
  asDevBotsDatabase(): DevBotsDatabase {
    const db = this.db;
    if (!db) {
      throw new Error('Database not created. Call create() first.');
    }

    // Create a minimal DevBotsDatabase-compatible object
    return {
      getConnection: () => db,
      close: () => db.close()
    } as unknown as DevBotsDatabase;
  }
}

/**
 * Create a test database instance
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const testDb = new TestDatabase();
  await testDb.create();
  return testDb;
}
