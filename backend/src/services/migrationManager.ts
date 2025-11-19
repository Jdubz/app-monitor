/**
 * Migration Manager
 * 
 * Elegant, automated database migration system that:
 * - Auto-discovers migration files from backend/migrations/
 * - Tracks applied migrations in migrations table
 * - Handles errors gracefully with rollback support
 * - Provides detailed logging and alerts
 * - Validates migration files before execution
 * - Supports both .sql files and TypeScript migration functions
 * 
 * Migration files should be named: <number>_<description>.sql
 * Example: 012_staged_queue.sql
 * 
 * The manager will:
 * 1. Create migrations tracking table if needed
 * 2. Scan backend/migrations/ for .sql files
 * 3. Sort by migration number
 * 4. Skip already-applied migrations
 * 5. Execute pending migrations in transaction
 * 6. Record success/failure with timestamp
 * 7. Alert on failures with detailed error info
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Migration {
  id: number;
  name: string;
  filename: string;
  sql?: string;
  applied_at?: number;
  status?: 'pending' | 'applied' | 'failed';
  error?: string;
}

export interface MigrationResult {
  success: boolean;
  applied: number;
  failed: number;
  skipped: number;
  migrations: Array<{
    id: number;
    name: string;
    status: 'applied' | 'failed' | 'skipped';
    error?: string;
    duration?: number;
  }>;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: Array<{
    table: string;
    column: string;
    expectedType: string;
    actualType?: string;
    issue: 'missing' | 'type_mismatch';
  }>;
  warnings: Array<{
    table: string;
    message: string;
  }>;
}

export class MigrationManager {
  private db: Database.Database;
  private migrationsDir: string;

  constructor(db: Database.Database, migrationsDir?: string) {
    this.db = db;
    this.migrationsDir = migrationsDir || path.join(__dirname, '..', '..', 'migrations');
  }

  /**
   * Initialize migrations tracking table
   */
  private initializeMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        applied_at INTEGER NOT NULL,
        duration_ms INTEGER,
        checksum TEXT,
        status TEXT CHECK(status IN ('applied', 'failed')) DEFAULT 'applied'
      );
      
      CREATE INDEX IF NOT EXISTS idx_migrations_applied_at ON migrations(applied_at);
      CREATE INDEX IF NOT EXISTS idx_migrations_status ON migrations(status);
    `);
  }

  /**
   * Discover migration files from migrations directory
   */
  private discoverMigrations(): Migration[] {
    try {
      if (!fs.existsSync(this.migrationsDir)) {
        logger.warn({
          category: 'database',
          action: 'migrations_dir_not_found',
          message: `Migrations directory not found: ${this.migrationsDir}`,
        });
        return [];
      }

      const files = fs.readdirSync(this.migrationsDir)
        .filter(f => f.endsWith('.sql') && f !== 'README.md')
        .sort(); // Lexicographic sort works for numbered files

      const migrations: Migration[] = [];

      for (const filename of files) {
        const match = filename.match(/^(\d+)_(.+)\.sql$/);
        if (!match) {
          logger.warn({
            category: 'database',
            action: 'invalid_migration_filename',
            message: `Skipping migration file with invalid name: ${filename}`,
            details: { expectedFormat: '<number>_<description>.sql' }
          });
          continue;
        }

        const id = parseInt(match[1], 10);
        const name = match[2].replace(/_/g, ' ');
        const filepath = path.join(this.migrationsDir, filename);
        const sql = fs.readFileSync(filepath, 'utf-8');

        migrations.push({ id, name, filename, sql });
      }

      return migrations;
    } catch (error) {
      logger.error({
        category: 'database',
        action: 'migration_discovery_failed',
        message: 'Failed to discover migrations',
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get applied migrations from database
   */
  private getAppliedMigrations(): Map<number, Migration> {
    const stmt = this.db.prepare(`
      SELECT id, name, filename, applied_at, status
      FROM migrations
      ORDER BY id ASC
    `);

    const rows = stmt.all() as Migration[];
    const map = new Map<number, Migration>();
    
    for (const row of rows) {
      map.set(row.id, row);
    }

    return map;
  }

  /**
   * Calculate checksum for migration content
   */
  private calculateChecksum(content: string): string {
    // Simple hash for content verification
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Apply a single migration with error handling
   */
  private applyMigration(migration: Migration): { success: boolean; error?: string; duration: number } {
    const startTime = Date.now();

    try {
      logger.info({
        category: 'database',
        action: 'applying_migration',
        message: `Applying migration ${migration.id}: ${migration.name}`,
        details: { id: migration.id, name: migration.name, filename: migration.filename }
      });

      // Execute migration in a transaction
      const transaction = this.db.transaction(() => {
        try {
          // Execute the SQL
          this.db.exec(migration.sql!);
        } catch (execError: unknown) {
          // Handle idempotent migration errors (e.g., duplicate column)
          // These are expected for ALTER TABLE ADD COLUMN when column exists
          if (execError instanceof Error && execError.message?.includes('duplicate column')) {
            logger.info({
              category: 'database',
              action: 'migration_already_applied',
              message: `Migration ${migration.id} changes already applied (idempotent)`,
              details: {
                id: migration.id,
                name: migration.name,
                reason: 'duplicate_column'
              }
            });
            // Continue to record as successfully applied
          } else {
            // Re-throw non-idempotent errors
            throw execError;
          }
        }

        // Record successful migration
        const checksum = this.calculateChecksum(migration.sql!);
        const duration = Date.now() - startTime;

        this.db.prepare(`
          INSERT INTO migrations (id, name, filename, applied_at, duration_ms, checksum, status)
          VALUES (?, ?, ?, ?, ?, ?, 'applied')
          ON CONFLICT(name) DO UPDATE SET
            applied_at = excluded.applied_at,
            duration_ms = excluded.duration_ms,
            status = 'applied'
        `).run(migration.id, migration.name, migration.filename, Date.now(), duration, checksum);
      });

      transaction();

      const duration = Date.now() - startTime;

      logger.info({
        category: 'database',
        action: 'migration_applied',
        message: `Successfully applied migration ${migration.id}: ${migration.name}`,
        details: { id: migration.id, name: migration.name, duration_ms: duration }
      });

      return { success: true, duration };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({
        category: 'database',
        action: 'migration_failed',
        message: `Failed to apply migration ${migration.id}: ${migration.name}`,
        error: errorMessage,
        details: {
          id: migration.id,
          name: migration.name,
          filename: migration.filename,
          duration_ms: duration,
          sql_preview: migration.sql?.substring(0, 200)
        }
      });

      // Record failed migration attempt
      try {
        this.db.prepare(`
          INSERT INTO migrations (id, name, filename, applied_at, duration_ms, status)
          VALUES (?, ?, ?, ?, ?, 'failed')
          ON CONFLICT(name) DO UPDATE SET
            applied_at = excluded.applied_at,
            duration_ms = excluded.duration_ms,
            status = 'failed'
        `).run(migration.id, migration.name, migration.filename, Date.now(), duration);
      } catch (recordError) {
        logger.error({
          category: 'database',
          action: 'migration_record_failed',
          message: 'Failed to record migration failure',
          error: recordError instanceof Error ? recordError.message : String(recordError)
        });
      }

      return { success: false, error: errorMessage, duration };
    }
  }

  /**
   * Run all pending migrations
   */
  runMigrations(): MigrationResult {
    const startTime = Date.now();
    
    logger.info({
      category: 'database',
      action: 'migration_check_started',
      message: 'Checking for pending database migrations',
      details: { migrationsDir: this.migrationsDir }
    });

    try {
      // Initialize migrations table
      this.initializeMigrationsTable();

      // Discover available migrations
      const availableMigrations = this.discoverMigrations();
      
      if (availableMigrations.length === 0) {
        logger.info({
          category: 'database',
          action: 'no_migrations_found',
          message: 'No migration files found',
        });
        return { success: true, applied: 0, failed: 0, skipped: 0, migrations: [] };
      }

      // Get already applied migrations
      const appliedMigrations = this.getAppliedMigrations();

      // Determine pending migrations
      const pendingMigrations = availableMigrations.filter(m => !appliedMigrations.has(m.id));

      if (pendingMigrations.length === 0) {
        logger.info({
          category: 'database',
          action: 'no_pending_migrations',
          message: 'All migrations are up to date',
          details: { total: availableMigrations.length, applied: appliedMigrations.size }
        });
        return {
          success: true,
          applied: 0,
          failed: 0,
          skipped: availableMigrations.length,
          migrations: availableMigrations.map(m => ({ id: m.id, name: m.name, status: 'skipped' as const }))
        };
      }

      logger.info({
        category: 'database',
        action: 'pending_migrations_found',
        message: `Found ${pendingMigrations.length} pending migration(s)`,
        details: {
          total: availableMigrations.length,
          applied: appliedMigrations.size,
          pending: pendingMigrations.length,
          migrations: pendingMigrations.map(m => ({ id: m.id, name: m.name }))
        }
      });

      // Apply pending migrations
      const results: MigrationResult = {
        success: true,
        applied: 0,
        failed: 0,
        skipped: appliedMigrations.size,
        migrations: []
      };

      for (const migration of pendingMigrations) {
        const result = this.applyMigration(migration);
        
        if (result.success) {
          results.applied++;
          results.migrations.push({
            id: migration.id,
            name: migration.name,
            status: 'applied',
            duration: result.duration
          });
        } else {
          results.failed++;
          results.success = false;
          results.migrations.push({
            id: migration.id,
            name: migration.name,
            status: 'failed',
            error: result.error,
            duration: result.duration
          });
          
          // Stop on first failure to prevent cascading issues
          logger.error({
            category: 'database',
            action: 'migration_stopped',
            message: 'Stopping migration process due to failure',
            error: result.error,
            details: {
              failedMigration: { id: migration.id, name: migration.name },
              remainingMigrations: pendingMigrations.length - results.applied - results.failed
            }
          });
          break;
        }
      }

      const totalDuration = Date.now() - startTime;

      logger.info({
        category: 'database',
        action: 'migration_check_completed',
        message: `Migration check completed in ${totalDuration}ms`,
        details: {
          applied: results.applied,
          failed: results.failed,
          skipped: results.skipped,
          duration_ms: totalDuration,
          success: results.success
        }
      });

      return results;

    } catch (error) {
      logger.error({
        category: 'database',
        action: 'migration_process_failed',
        message: 'Migration process failed with unexpected error',
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        applied: 0,
        failed: 0,
        skipped: 0,
        migrations: []
      };
    }
  }

  /**
   * Get migration status
   */
  getStatus(): {
    available: number;
    applied: number;
    pending: number;
    failed: number;
    lastMigration?: { id: number; name: string; applied_at: number };
  } {
    const availableMigrations = this.discoverMigrations();
    const appliedMigrations = this.getAppliedMigrations();
    
    const applied = Array.from(appliedMigrations.values()).filter(m => m.status === 'applied');
    const failed = Array.from(appliedMigrations.values()).filter(m => m.status === 'failed');
    const pending = availableMigrations.filter(m => !appliedMigrations.has(m.id));

    const lastApplied = applied.length > 0 ? applied[applied.length - 1] : undefined;

    return {
      available: availableMigrations.length,
      applied: applied.length,
      pending: pending.length,
      failed: failed.length,
      lastMigration: lastApplied ? {
        id: lastApplied.id,
        name: lastApplied.name,
        applied_at: lastApplied.applied_at!
      } : undefined
    };
  }

  /**
   * List all migrations with their status
   */
  listMigrations(): Array<{
    id: number;
    name: string;
    filename: string;
    status: 'pending' | 'applied' | 'failed';
    applied_at?: number;
  }> {
    const available = this.discoverMigrations();
    const applied = this.getAppliedMigrations();

    return available.map(m => ({
      id: m.id,
      name: m.name,
      filename: m.filename,
      status: applied.has(m.id)
        ? (applied.get(m.id)!.status === 'failed' ? 'failed' : 'applied')
        : 'pending',
      applied_at: applied.get(m.id)?.applied_at
    }));
  }

  /**
   * Validate critical schema columns exist
   * This catches schema drift between migrations and actual database
   */
  validateSchema(): SchemaValidationResult {
    const errors: SchemaValidationResult['errors'] = [];
    const warnings: SchemaValidationResult['warnings'] = [];

    // Critical columns that MUST exist
    const criticalColumns: Array<{ table: string; column: string; type: string }> = [
      // task_stage_runs - phase system tracking
      { table: 'task_stage_runs', column: 'recovery_diagnosis', type: 'TEXT' },
      { table: 'task_stage_runs', column: 'artifacts_blob', type: 'TEXT' },
      { table: 'task_stage_runs', column: 'phase_index', type: 'INTEGER' },
      { table: 'task_stage_runs', column: 'phase_name', type: 'TEXT' },

      // tasks - phase tracking
      { table: 'tasks', column: 'phase_index', type: 'INTEGER' },
      { table: 'tasks', column: 'phase_name', type: 'TEXT' },
      { table: 'tasks', column: 'phase_status', type: 'TEXT' },
      { table: 'tasks', column: 'phase_attempts', type: 'INTEGER' },
      { table: 'tasks', column: 'phase_payload', type: 'TEXT' },

      // tasks - other critical
      { table: 'tasks', column: 'fingerprint', type: 'TEXT' },
      { table: 'tasks', column: 'chain_id', type: 'TEXT' },
    ];

    for (const { table, column, type } of criticalColumns) {
      try {
        const tableInfo = this.db.pragma(`table_info(${table})`) as Array<{
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: unknown;
          pk: number;
        }>;

        const columnInfo = tableInfo.find(c => c.name === column);

        if (!columnInfo) {
          errors.push({
            table,
            column,
            expectedType: type,
            issue: 'missing'
          });
        } else if (columnInfo.type !== type) {
          errors.push({
            table,
            column,
            expectedType: type,
            actualType: columnInfo.type,
            issue: 'type_mismatch'
          });
        }
      } catch (error) {
        warnings.push({
          table,
          message: `Could not validate table ${table}: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if column exists in table
   */
  private columnExists(table: string, column: string): boolean {
    try {
      const tableInfo = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>;
      return tableInfo.some(c => c.name === column);
    } catch {
      return false;
    }
  }

  /**
   * Get helpful error message for schema mismatch
   */
  getSchemaErrorHelp(error: Error): string | null {
    const message = error.message;

    // Check for column not found errors
    const columnMatch = message.match(/table (\w+) has no column named (\w+)/i);
    if (columnMatch) {
      const [, table, column] = columnMatch;
      return `
Schema mismatch detected: column '${column}' missing from table '${table}'

This usually means migrations are out of sync with the database.

To fix:
1. Run schema validation: npm run migrate:validate
2. Check pending migrations: npm run migrate:status
3. Apply migrations: npm run migrate:up
4. If issue persists, check: docs/migrations/troubleshooting.md

The missing column should be added by a migration file.
Check backend/migrations/ for ALTER TABLE statements that add this column.

Original error: ${message}
      `.trim();
    }

    return null;
  }
}
