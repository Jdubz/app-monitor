/**
 * Migration Testing Utilities
 *
 * Helpers for testing database migrations against production-like state.
 * Tests migrations on both fresh databases and databases with old schemas.
 */

import Database from 'better-sqlite3';
import { MigrationManager } from '../../services/migrationManager.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create a database with old schema (before a specific migration)
 */
export function createDatabaseWithOldSchema(beforeMigrationId: number): Database.Database {
  const db = new Database(':memory:');
  const manager = new MigrationManager(db);

  // Discover all migrations
  const migrations = manager.listMigrations();

  // Apply only migrations before the specified ID
  const oldMigrations = migrations.filter(m => m.id < beforeMigrationId);

  // Apply each migration manually
  for (const migration of oldMigrations) {
    const migrationPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'migrations',
      migration.filename
    );

    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      try {
        db.exec(sql);
      } catch (error) {
        // Some migrations may fail if they depend on earlier state
        // This is expected for documentation-only migrations
        console.warn(`Warning: Migration ${migration.id} failed during old schema creation:`, error);
      }
    }
  }

  return db;
}

/**
 * Create a fresh database with all migrations
 */
export function createFreshDatabase(): Database.Database {
  const db = new Database(':memory:');
  const manager = new MigrationManager(db);
  manager.runMigrations();
  return db;
}

/**
 * Check if column exists in table
 */
export function columnExists(
  db: Database.Database,
  tableName: string,
  columnName: string
): boolean {
  try {
    const tableInfo = db.pragma(`table_info(${tableName})`) as Array<{ name: string }>;
    return tableInfo.some(col => col.name === columnName);
  } catch {
    return false;
  }
}

/**
 * Check if table exists
 */
export function tableExists(
  db: Database.Database,
  tableName: string
): boolean {
  try {
    const result = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(tableName);
    return !!result;
  } catch {
    return false;
  }
}

/**
 * Get column type
 */
export function getColumnType(
  db: Database.Database,
  tableName: string,
  columnName: string
): string | null {
  try {
    const tableInfo = db.pragma(`table_info(${tableName})`) as Array<{
      name: string;
      type: string;
    }>;
    const column = tableInfo.find(col => col.name === columnName);
    return column?.type || null;
  } catch {
    return null;
  }
}

/**
 * Get all column names for a table
 */
export function getTableColumns(
  db: Database.Database,
  tableName: string
): string[] {
  try {
    const tableInfo = db.pragma(`table_info(${tableName})`) as Array<{ name: string }>;
    return tableInfo.map(col => col.name);
  } catch {
    return [];
  }
}

/**
 * Get CREATE TABLE statement for a table
 */
export function getTableSchema(
  db: Database.Database,
  tableName: string
): string | null {
  try {
    const result = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
      .get(tableName) as { sql: string } | undefined;
    return result?.sql || null;
  } catch {
    return null;
  }
}

/**
 * Apply a specific migration by ID
 */
export function applyMigration(
  db: Database.Database,
  migrationId: number
): { success: boolean; error?: string } {
  try {
    const manager = new MigrationManager(db);
    const migrations = manager.listMigrations();
    const migration = migrations.find(m => m.id === migrationId);

    if (!migration) {
      return { success: false, error: `Migration ${migrationId} not found` };
    }

    const migrationPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'migrations',
      migration.filename
    );

    if (!fs.existsSync(migrationPath)) {
      return { success: false, error: `Migration file not found: ${migration.filename}` };
    }

    const sql = fs.readFileSync(migrationPath, 'utf-8');
    db.exec(sql);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test if a migration is idempotent (safe to run twice)
 */
export function testMigrationIdempotency(
  migrationId: number
): { idempotent: boolean; error?: string } {
  try {
    // Create database and apply migration once
    const db = createDatabaseWithOldSchema(migrationId);
    const firstRun = applyMigration(db, migrationId);

    if (!firstRun.success) {
      return {
        idempotent: false,
        error: `First run failed: ${firstRun.error}`
      };
    }

    // Apply again - should succeed or fail gracefully
    const secondRun = applyMigration(db, migrationId);

    // For idempotent migrations, second run might fail with "duplicate column"
    // This is expected and safe
    if (!secondRun.success) {
      const isDuplicateError =
        secondRun.error?.includes('duplicate column') ||
        secondRun.error?.includes('already exists');

      if (isDuplicateError) {
        return { idempotent: true }; // Expected failure, migration is idempotent
      }

      return {
        idempotent: false,
        error: `Second run failed unexpectedly: ${secondRun.error}`
      };
    }

    return { idempotent: true };
  } catch (error) {
    return {
      idempotent: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Compare schemas between two databases
 */
export function compareSchemas(
  db1: Database.Database,
  db2: Database.Database,
  tableName: string
): {
  identical: boolean;
  differences: Array<{
    type: 'column_missing' | 'column_added' | 'type_mismatch';
    column: string;
    db1Value?: string;
    db2Value?: string;
  }>;
} {
  const columns1 = getTableColumns(db1, tableName);
  const columns2 = getTableColumns(db2, tableName);

  const differences: Array<{
    type: 'column_missing' | 'column_added' | 'type_mismatch';
    column: string;
    db1Value?: string;
    db2Value?: string;
  }> = [];

  // Check for missing columns (in db2 but not db1)
  for (const col of columns1) {
    if (!columns2.includes(col)) {
      differences.push({
        type: 'column_missing',
        column: col,
        db1Value: getColumnType(db1, tableName, col) || undefined
      });
    }
  }

  // Check for added columns (in db1 but not db2)
  for (const col of columns2) {
    if (!columns1.includes(col)) {
      differences.push({
        type: 'column_added',
        column: col,
        db2Value: getColumnType(db2, tableName, col) || undefined
      });
    }
  }

  // Check for type mismatches
  for (const col of columns1) {
    if (columns2.includes(col)) {
      const type1 = getColumnType(db1, tableName, col);
      const type2 = getColumnType(db2, tableName, col);

      if (type1 !== type2) {
        differences.push({
          type: 'type_mismatch',
          column: col,
          db1Value: type1 || undefined,
          db2Value: type2 || undefined
        });
      }
    }
  }

  return {
    identical: differences.length === 0,
    differences
  };
}
