/**
 * Recovery System Database Migration
 *
 * Adds tables and fields for automatic failure recovery system
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export interface RecoveryMigrationResult {
  success: boolean;
  tablesCreated: number;
  fieldsAdded: number;
  errors: string[];
}

export class RecoveryMigration {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Run the recovery system migration
   */
  migrate(): RecoveryMigrationResult {
    const result: RecoveryMigrationResult = {
      success: false,
      tablesCreated: 0,
      fieldsAdded: 0,
      errors: []
    };

    try {
      logger.info({
        category: 'process',
        action: 'recovery_migration_started',
        message: 'Starting recovery system database migration'
      });

      // Step 1: Add repair bot fields to tasks table (ONLY NEEDED FIELDS)
      this.addRepairBotFields(result);

      // Step 2: Create indexes for repair bot fields
      this.createIndexes(result);

      // NOTE: recovery_attempts and recovery_safety_checks tables removed
      // The simplified recovery system only uses task metadata fields
      // (is_repair_bot, original_task_id, repair_stage) which are tracked
      // in the tasks table directly.

      result.success = result.errors.length === 0;

      if (result.success) {
        logger.info({
          category: 'process',
          action: 'recovery_migration_completed',
          message: 'Recovery system migration completed successfully',
          details: {
            tablesCreated: result.tablesCreated,
            fieldsAdded: result.fieldsAdded
          }
        });
      } else {
        logger.error({
          category: 'process',
          action: 'recovery_migration_failed',
          message: 'Recovery system migration completed with errors',
          details: {
            errors: result.errors
          }
        });
      }

      return result;
    } catch (error) {
      const errorMsg = `Recovery migration failed: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      logger.error({
        category: 'process',
        action: 'recovery_migration_error',
        message: errorMsg,
        error
      });
      return result;
    }
  }

  /**
   * Add repair bot tracking fields to tasks table
   */
  private addRepairBotFields(result: RecoveryMigrationResult): void {
    try {
      // Check if fields already exist
      const tableInfo = this.db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      const existingFields = new Set(tableInfo.map(col => col.name));

      const fieldsToAdd = [
        {
          name: 'is_repair_bot',
          definition: 'is_repair_bot INTEGER DEFAULT 0' // 0 = false, 1 = true
        },
        {
          name: 'original_task_id',
          definition: 'original_task_id TEXT'
        },
        {
          name: 'repair_stage',
          definition: "repair_stage TEXT CHECK(repair_stage IS NULL OR repair_stage IN ('cleanup', 'followup'))"
        }
      ];

      for (const field of fieldsToAdd) {
        if (!existingFields.has(field.name)) {
          this.db.exec(`ALTER TABLE tasks ADD COLUMN ${field.definition}`);
          result.fieldsAdded++;
          logger.info({
            category: 'process',
            action: 'field_added',
            message: `Added field ${field.name} to tasks table`
          });
        } else {
          logger.debug({
            category: 'process',
            action: 'field_exists',
            message: `Field ${field.name} already exists in tasks table`
          });
        }
      }
    } catch (error) {
      const errorMsg = `Failed to add repair bot fields: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      logger.error({
        category: 'process',
        action: 'add_fields_failed',
        message: errorMsg,
        error
      });
    }
  }

  // NOTE: Removed unused table creation methods:
  // - createRecoveryAttemptsTable()
  // - createRecoverySafetyChecksTable()
  //
  // The simplified recovery system (73% code reduction) only uses
  // task metadata fields for tracking repair bots:
  // - is_repair_bot (boolean)
  // - original_task_id (references failed task)
  // - repair_stage ('cleanup' | 'followup')

  /**
   * Create indexes for repair bot fields
   */
  private createIndexes(result: RecoveryMigrationResult): void {
    try {
      // Only indexes needed for simplified recovery system
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_tasks_repair_bot ON tasks(is_repair_bot, status)',
        'CREATE INDEX IF NOT EXISTS idx_tasks_original_task ON tasks(original_task_id)'
      ];

      for (const indexSql of indexes) {
        this.db.exec(indexSql);
      }

      logger.info({
        category: 'process',
        action: 'indexes_created',
        message: `Created ${indexes.length} indexes for repair bot fields`
      });
    } catch (error) {
      const errorMsg = `Failed to create recovery indexes: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      logger.error({
        category: 'process',
        action: 'create_indexes_failed',
        message: errorMsg,
        error
      });
    }
  }

  /**
   * Rollback migration (if needed)
   */
  rollback(): void {
    try {
      logger.warn({
        category: 'process',
        action: 'recovery_migration_rollback_started',
        message: 'Rolling back recovery system migration'
      });

      // Drop tables (will cascade and remove foreign key references)
      this.db.exec('DROP TABLE IF EXISTS recovery_safety_checks');
      this.db.exec('DROP TABLE IF NOT EXISTS recovery_attempts');

      // Note: Cannot easily drop columns in SQLite, would need to recreate table
      // For now, just document that columns exist but are unused after rollback

      logger.warn({
        category: 'process',
        action: 'recovery_migration_rollback_completed',
        message: 'Recovery migration rollback completed (task table columns remain but unused)'
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'recovery_migration_rollback_failed',
        message: 'Failed to rollback recovery migration',
        error
      });
      throw error;
    }
  }
}
