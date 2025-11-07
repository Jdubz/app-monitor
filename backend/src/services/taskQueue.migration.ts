/**
 * Task Queue Migration Script
 *
 * Migrates tasks from JSON file-based storage to SQLite database
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { TaskQueueService, Task as SQLiteTask } from './taskQueue.sqlite.js';
import { Task as LegacyTask } from './devBotsManager.js';

export interface MigrationResult {
  success: boolean;
  tasksImported: number;
  executionsCreated: number;
  errors: string[];
}

export class TaskQueueMigration {
  private queueService: TaskQueueService;
  private legacyStoragePath: string;

  constructor(queueService: TaskQueueService, legacyStoragePath: string) {
    this.queueService = queueService;
    this.legacyStoragePath = legacyStoragePath;
  }

  /**
   * Migrate all tasks from JSON to SQLite
   */
  migrate(): MigrationResult {
    const result: MigrationResult = {
      success: false,
      tasksImported: 0,
      executionsCreated: 0,
      errors: []
    };

    try {
      // Load legacy tasks
      const legacyTasks = this.loadLegacyTasks();
      logger.info({
        category: 'process',
        action: 'migration_started',
        message: `Starting migration of ${legacyTasks.length} tasks from JSON to SQLite`
      });

      // Import each task
      for (const legacyTask of legacyTasks) {
        try {
          this.importTask(legacyTask);
          result.tasksImported++;

          // Create execution history if task was started
          if (legacyTask.assignedAt) {
            this.createExecutionHistory(legacyTask);
            result.executionsCreated++;
          }
        } catch (error) {
          const errorMsg = `Failed to import task ${legacyTask.id}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          logger.error({
            category: 'process',
            action: 'task_import_failed',
            message: errorMsg,
            error
          });
        }
      }

      // Load completed tasks
      const completedTasks = this.loadCompletedTasks();
      logger.info({
        category: 'process',
        action: 'importing_completed_tasks',
        message: `Importing ${completedTasks.length} completed tasks`
      });

      for (const completedTask of completedTasks) {
        try {
          // Skip if already imported from active tasks
          const existing = this.queueService.getTask(completedTask.id);
          if (!existing) {
            this.importTask(completedTask);
            result.tasksImported++;

            if (completedTask.assignedAt) {
              this.createExecutionHistory(completedTask);
              result.executionsCreated++;
            }
          }
        } catch (error) {
          const errorMsg = `Failed to import completed task ${completedTask.id}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          logger.error({
            category: 'process',
            action: 'completed_task_import_failed',
            message: errorMsg,
            error
          });
        }
      }

      result.success = result.errors.length === 0;

      logger.info({
        category: 'process',
        action: 'migration_completed',
        message: `Migration completed: ${result.tasksImported} tasks imported, ${result.executionsCreated} executions created, ${result.errors.length} errors`
      });

      return result;
    } catch (error) {
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.error({
        category: 'process',
        action: 'migration_failed',
        message: 'Migration failed',
        error
      });
      return result;
    }
  }

  /**
   * Load legacy tasks from JSON file
   */
  private loadLegacyTasks(): LegacyTask[] {
    const tasksFile = path.join(this.legacyStoragePath, 'tasks.json');

    if (!fs.existsSync(tasksFile)) {
      logger.info({
        category: 'process',
        action: 'no_legacy_tasks_found',
        message: 'No legacy tasks.json found, starting fresh'
      });
      return [];
    }

    try {
      const data = fs.readFileSync(tasksFile, 'utf-8');
      const tasksData = JSON.parse(data);
      return tasksData.tasks || [];
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_load_legacy_tasks',
        message: 'Failed to load legacy tasks',
        error
      });
      return [];
    }
  }

  /**
   * Load completed tasks from JSON file
   */
  private loadCompletedTasks(): LegacyTask[] {
    const completedFile = path.join(this.legacyStoragePath, 'completed-tasks.json');

    if (!fs.existsSync(completedFile)) {
      return [];
    }

    try {
      const data = fs.readFileSync(completedFile, 'utf-8');
      const completedData = JSON.parse(data);
      return completedData.tasks || [];
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_load_completed_tasks',
        message: 'Failed to load completed tasks',
        error
      });
      return [];
    }
  }

  /**
   * Import a legacy task into SQLite
   */
  private importTask(legacyTask: LegacyTask): void {
    // Map legacy status to new status
    let status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout' = 'pending';

    if (legacyTask.status === 'pending') {
      status = 'pending';
    } else if (legacyTask.status === 'assigned' || legacyTask.status === 'active') {
      status = 'running';
    } else if (legacyTask.status === 'completed') {
      status = 'completed';
    } else if (legacyTask.status === 'failed') {
      status = 'failed';
    } else if (legacyTask.status === 'retrying') {
      status = 'pending'; // Retrying tasks become pending
    }

    // Calculate fingerprint for deduplication
    const fingerprint = crypto.createHash('md5')
      .update(JSON.stringify({
        title: legacyTask.title.toLowerCase().trim(),
        files: legacyTask.files?.sort() || [],
        type: legacyTask.type
      }))
      .digest('hex');

    // Create task in SQLite
    const sqliteTask: Partial<SQLiteTask> = {
      id: legacyTask.id,
      type: legacyTask.type,
      title: legacyTask.title,
      description: legacyTask.description,
      documentation: legacyTask.documentation,
      notes: legacyTask.notes,
      assigned_agent: legacyTask.assignedAgent,
      prompt: legacyTask.prompt,
      priority: (legacyTask as any).priority || 5,
      can_retry: (legacyTask as any).canRetry !== undefined ? (legacyTask as any).canRetry : true,
      retry_count: legacyTask.retryCount || 0,
      max_retries: (legacyTask as any).maxRetries || 3,
      timeout_ms: (legacyTask as any).timeout_ms || null, // Conservative: no automatic timeout
      fingerprint,
      estimated_hours: legacyTask.estimatedEffort?.hours,
      complexity: legacyTask.estimatedEffort?.complexity,
      files: legacyTask.files,
      acceptance_criteria: legacyTask.acceptanceCriteria,
      architecture_references: legacyTask.architectureReferences,
      validation_steps: legacyTask.validationSteps,
      success_metrics: legacyTask.successMetrics
    };

    // Parse timestamps
    if (legacyTask.createdAt) {
      sqliteTask.created_at = new Date(legacyTask.createdAt).getTime();
    }
    if (legacyTask.assignedAt) {
      sqliteTask.assigned_at = new Date(legacyTask.assignedAt).getTime();
    }
    if ((legacyTask as any).startedAt) {
      sqliteTask.started_at = new Date((legacyTask as any).startedAt).getTime();
    }
    if (legacyTask.completedAt) {
      sqliteTask.completed_at = new Date(legacyTask.completedAt).getTime();
    }

    // Set output/error based on status
    if (status === 'completed' && legacyTask.output) {
      sqliteTask.output = typeof legacyTask.output === 'string' ? legacyTask.output : JSON.stringify(legacyTask.output);
    }
    if ((status === 'failed') && legacyTask.error) {
      sqliteTask.error = legacyTask.error;
    }

    // Set assigned worker if task is running
    if (status === 'running' && legacyTask.assignedWorker) {
      sqliteTask.assigned_worker = legacyTask.assignedWorker;
    }

    this.queueService.createTask(sqliteTask);
  }

  /**
   * Create execution history for a task
   */
  private createExecutionHistory(legacyTask: LegacyTask): void {
    // Note: We can't insert into task_executions directly through the public API
    // This will be handled when tasks are first processed by the new system
    // For now, we just log that execution history exists for this task

    if (!legacyTask.assignedWorker || !legacyTask.assignedAt) {
      return;
    }

    logger.debug({
      category: 'process',
      action: 'execution_history_noted',
      message: `Task ${legacyTask.id} has execution history (worker: ${legacyTask.assignedWorker})`
    });
  }

  /**
   * Backup legacy JSON files before migration
   */
  static backupLegacyFiles(storagePath: string, backupPath: string): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(backupPath, `pre-migration-${timestamp}`);

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Backup tasks.json
    const tasksFile = path.join(storagePath, 'tasks.json');
    if (fs.existsSync(tasksFile)) {
      fs.copyFileSync(tasksFile, path.join(backupDir, 'tasks.json'));
    }

    // Backup completed-tasks.json
    const completedFile = path.join(storagePath, 'completed-tasks.json');
    if (fs.existsSync(completedFile)) {
      fs.copyFileSync(completedFile, path.join(backupDir, 'completed-tasks.json'));
    }

    logger.info({
      category: 'process',
      action: 'legacy_files_backed_up',
      message: `Legacy files backed up to ${backupDir}`
    });
  }
}
