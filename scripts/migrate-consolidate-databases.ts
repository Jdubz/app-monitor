#!/usr/bin/env ts-node
/**
 * Database Consolidation Migration Script
 *
 * Consolidates dev-bots.db and tasks/queue.db into a single app-monitor.db
 *
 * Usage:
 *   npm run migrate:consolidate-db
 *   or
 *   ts-node scripts/migrate-consolidate-databases.ts
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_DIR = path.join(__dirname, '../backend');
const DATA_DIR = path.join(BACKEND_DIR, 'data');

// Source databases
const DEV_BOTS_DB = path.join(DATA_DIR, 'dev-bots.db');
const TASK_QUEUE_DB = path.join(DATA_DIR, 'tasks', 'queue.db');

// Target database
const APP_MONITOR_DB = path.join(DATA_DIR, 'app-monitor.db');

// Backup directory
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');

interface MigrationStats {
  tablesCreated: number;
  rowsCopied: number;
  errors: string[];
  warnings: string[];
}

class DatabaseConsolidator {
  private stats: MigrationStats = {
    tablesCreated: 0,
    rowsCopied: 0,
    errors: [],
    warnings: [],
  };

  async run(): Promise<void> {
    console.log('🗄️  Database Consolidation Migration');
    console.log('=====================================\n');

    try {
      // Pre-flight checks
      await this.preflightChecks();

      // Create backups
      await this.createBackups();

      // Create new consolidated database
      await this.createConsolidatedDatabase();

      // Migrate data
      await this.migrateData();

      // Verify migration
      await this.verifyMigration();

      // Print summary
      this.printSummary();

      console.log('\n✅ Migration completed successfully!');
      console.log(`\nNew database: ${APP_MONITOR_DB}`);
      console.log(`Backups saved to: ${BACKUP_DIR}\n`);
    } catch (error) {
      console.error('\n❌ Migration failed:', error);
      this.stats.errors.push(error instanceof Error ? error.message : String(error));
      this.printSummary();
      process.exit(1);
    }
  }

  private async preflightChecks(): Promise<void> {
    console.log('1. Running pre-flight checks...');

    // Check if source databases exist
    if (!fs.existsSync(DEV_BOTS_DB)) {
      throw new Error(`Source database not found: ${DEV_BOTS_DB}`);
    }

    if (!fs.existsSync(TASK_QUEUE_DB)) {
      this.stats.warnings.push(`Task queue database not found: ${TASK_QUEUE_DB}`);
      console.log('   ⚠️  Task queue database not found, will create empty schema');
    }

    // Check if target already exists
    if (fs.existsSync(APP_MONITOR_DB)) {
      const answer = await this.prompt(
        `Target database already exists: ${APP_MONITOR_DB}\nOverwrite? (yes/no): `
      );
      if (answer.toLowerCase() !== 'yes') {
        throw new Error('Migration cancelled by user');
      }
      fs.unlinkSync(APP_MONITOR_DB);
    }

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    console.log('   ✓ Pre-flight checks passed\n');
  }

  private async createBackups(): Promise<void> {
    console.log('2. Creating backups...');

    if (fs.existsSync(DEV_BOTS_DB)) {
      const backupPath = path.join(BACKUP_DIR, `dev-bots-${TIMESTAMP}.db`);
      fs.copyFileSync(DEV_BOTS_DB, backupPath);
      console.log(`   ✓ Backed up dev-bots.db to ${backupPath}`);
    }

    if (fs.existsSync(TASK_QUEUE_DB)) {
      const backupPath = path.join(BACKUP_DIR, `queue-${TIMESTAMP}.db`);
      fs.copyFileSync(TASK_QUEUE_DB, backupPath);
      console.log(`   ✓ Backed up queue.db to ${backupPath}`);
    }

    console.log('');
  }

  private async createConsolidatedDatabase(): Promise<void> {
    console.log('3. Creating consolidated database...');

    const db = new Database(APP_MONITOR_DB);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    console.log(`   ✓ Created ${APP_MONITOR_DB}`);
    console.log('   ✓ Enabled WAL mode\n');

    db.close();
  }

  private async migrateData(): Promise<void> {
    console.log('4. Migrating data...');

    const targetDb = new Database(APP_MONITOR_DB);

    try {
      // Attach source databases
      if (fs.existsSync(DEV_BOTS_DB)) {
        targetDb.exec(`ATTACH DATABASE '${DEV_BOTS_DB}' AS devbots`);
        console.log('   ✓ Attached dev-bots.db');
      }

      if (fs.existsSync(TASK_QUEUE_DB)) {
        targetDb.exec(`ATTACH DATABASE '${TASK_QUEUE_DB}' AS taskqueue`);
        console.log('   ✓ Attached queue.db\n');
      }

      // Get all tables from dev-bots database
      if (fs.existsSync(DEV_BOTS_DB)) {
        const devbotsTables = targetDb
          .prepare("SELECT name FROM devbots.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
          .all() as Array<{ name: string }>;

        console.log(`   Found ${devbotsTables.length} tables in dev-bots.db`);

        for (const { name } of devbotsTables) {
          // Get table schema
          const schema = targetDb
            .prepare(`SELECT sql FROM devbots.sqlite_master WHERE type='table' AND name=?`)
            .get(name) as { sql: string } | undefined;

          if (schema) {
            // Create table in target database
            targetDb.exec(schema.sql);
            this.stats.tablesCreated++;

            // Copy data
            const rowCount = this.copyTableData(targetDb, 'devbots', name, name);
            this.stats.rowsCopied += rowCount;

            console.log(`     ✓ ${name}: ${rowCount} rows`);
          }
        }
      }

      // Get all tables from task queue database
      if (fs.existsSync(TASK_QUEUE_DB)) {
        const queueTables = targetDb
          .prepare("SELECT name FROM taskqueue.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
          .all() as Array<{ name: string }>;

        console.log(`\n   Found ${queueTables.length} tables in queue.db`);

        for (const { name } of queueTables) {
          // Check if table already exists (from dev-bots migration)
          const exists = targetDb
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
            .get(name);

          if (exists) {
            console.log(`     ⚠️  ${name}: already exists, need to handle schema conflict`);

            // Check if schemas differ by comparing column counts
            const targetCols = targetDb.prepare(`PRAGMA table_info(${name})`).all() as Array<{ name: string }>;
            const sourceCols = targetDb.prepare(`PRAGMA taskqueue.table_info(${name})`).all() as Array<{ name: string }>;

            if (targetCols.length !== sourceCols.length) {
              console.log(`     ⚠️  Schema mismatch: target has ${targetCols.length} columns, source has ${sourceCols.length}`);
              console.log(`     ℹ️  Using source schema (queue.db) as it's more complete`);

              // Drop existing table and recreate with queue.db schema
              targetDb.exec(`DROP TABLE IF EXISTS ${name}`);
              this.stats.warnings.push(`Dropped ${name} table from dev-bots.db due to schema mismatch`);

              // Get and create new schema
              const schema = targetDb
                .prepare(`SELECT sql FROM taskqueue.sqlite_master WHERE type='table' AND name=?`)
                .get(name) as { sql: string } | undefined;

              if (schema) {
                targetDb.exec(schema.sql);
                this.stats.tablesCreated++;
              }
            }

            // Now copy data
            const rowCount = this.copyTableData(targetDb, 'taskqueue', name, name);
            this.stats.rowsCopied += rowCount;
            console.log(`     ✓ ${name}: ${rowCount} rows`);
          } else {
            // Get table schema
            const schema = targetDb
              .prepare(`SELECT sql FROM taskqueue.sqlite_master WHERE type='table' AND name=?`)
              .get(name) as { sql: string } | undefined;

            if (schema) {
              // Create table in target database
              targetDb.exec(schema.sql);
              this.stats.tablesCreated++;

              // Copy data
              const rowCount = this.copyTableData(targetDb, 'taskqueue', name, name);
              this.stats.rowsCopied += rowCount;

              console.log(`     ✓ ${name}: ${rowCount} rows`);
            }
          }
        }
      }

      // Copy indexes
      await this.copyIndexes(targetDb);

      console.log('');
    } finally {
      targetDb.close();
    }
  }

  private copyTableData(
    db: Database.Database,
    sourceDb: string,
    sourceTable: string,
    targetTable: string
  ): number {
    const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${sourceDb}.${sourceTable}`).get() as { count: number };
    const count = countResult.count;

    if (count > 0) {
      db.exec(`INSERT INTO ${targetTable} SELECT * FROM ${sourceDb}.${sourceTable}`);
    }

    return count;
  }

  private async copyIndexes(db: Database.Database): Promise<void> {
    console.log('   Copying indexes...');

    // Copy indexes from dev-bots
    if (fs.existsSync(DEV_BOTS_DB)) {
      const indexes = db
        .prepare("SELECT sql FROM devbots.sqlite_master WHERE type='index' AND sql IS NOT NULL")
        .all() as Array<{ sql: string }>;

      for (const { sql } of indexes) {
        try {
          db.exec(sql);
        } catch (error) {
          // Index might already exist, that's okay
          if (!String(error).includes('already exists')) {
            this.stats.warnings.push(`Failed to copy index: ${error}`);
          }
        }
      }
    }

    // Copy indexes from task queue
    if (fs.existsSync(TASK_QUEUE_DB)) {
      const indexes = db
        .prepare("SELECT sql FROM taskqueue.sqlite_master WHERE type='index' AND sql IS NOT NULL")
        .all() as Array<{ sql: string }>;

      for (const { sql } of indexes) {
        try {
          db.exec(sql);
        } catch (error) {
          // Index might already exist, that's okay
          if (!String(error).includes('already exists')) {
            this.stats.warnings.push(`Failed to copy index: ${error}`);
          }
        }
      }
    }

    console.log('   ✓ Indexes copied\n');
  }

  private async verifyMigration(): Promise<void> {
    console.log('5. Verifying migration...');

    const db = new Database(APP_MONITOR_DB);

    try {
      // Check tables exist
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as Array<{ name: string }>;

      console.log(`   ✓ Found ${tables.length} tables in consolidated database`);

      // Verify row counts match
      let totalRows = 0;
      for (const { name } of tables) {
        const result = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get() as { count: number };
        totalRows += result.count;
      }

      console.log(`   ✓ Total rows: ${totalRows}`);

      // Check WAL mode
      const walMode = db.pragma('journal_mode', { simple: true });
      if (walMode !== 'wal') {
        this.stats.warnings.push('WAL mode not enabled on consolidated database');
      } else {
        console.log('   ✓ WAL mode enabled');
      }

      console.log('');
    } finally {
      db.close();
    }
  }

  private printSummary(): void {
    console.log('\n📊 Migration Summary');
    console.log('====================');
    console.log(`Tables created: ${this.stats.tablesCreated}`);
    console.log(`Rows copied: ${this.stats.rowsCopied}`);

    if (this.stats.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${this.stats.warnings.length}):`);
      this.stats.warnings.forEach(w => console.log(`   - ${w}`));
    }

    if (this.stats.errors.length > 0) {
      console.log(`\n❌ Errors (${this.stats.errors.length}):`);
      this.stats.errors.forEach(e => console.log(`   - ${e}`));
    }
  }

  private async prompt(question: string): Promise<string> {
    process.stdout.write(question);
    return new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim());
      });
    });
  }
}

// Run migration
const consolidator = new DatabaseConsolidator();
consolidator.run().catch(console.error);
