/**
 * Task Persistence Service for Dev-Monitor
 *
 * Provides file-based storage for tasks to persist between restarts
 * Integrates with the existing DevBotsManager
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger.js";
import { Task } from "./devBotsManager.js";

export interface TaskStorageConfig {
  storagePath: string;
  backupPath: string;
  maxBackups: number;
  autoSave: boolean;
  saveInterval: number; // milliseconds
}

export class TaskPersistence {
  private config: TaskStorageConfig;
  private isDirty: boolean = false;
  private saveTimer?: NodeJS.Timeout;

  constructor(config: TaskStorageConfig) {
    this.config = config;
    this.ensureStorageDirectories();

    if (config.autoSave) {
      this.startAutoSave();
    }
  }

  private ensureStorageDirectories(): void {
    // Ensure storage directory exists
    if (!fs.existsSync(this.config.storagePath)) {
      fs.mkdirSync(this.config.storagePath, { recursive: true });
    }

    // Ensure backup directory exists
    if (!fs.existsSync(this.config.backupPath)) {
      fs.mkdirSync(this.config.backupPath, { recursive: true });
    }
  }

  /**
   * Load tasks from storage file
   */
  public loadTasks(): Task[] {
    const tasksFile = path.join(this.config.storagePath, "tasks.json");

    if (!fs.existsSync(tasksFile)) {
      logger.info({
        category: "process",
        action: "no_existing_tasks_file_found_starting_with_empty_t",
        message:
          "No existing tasks file found, starting with empty task storage",
      });
      return [];
    }

    try {
      const data = fs.readFileSync(tasksFile, "utf-8");
      const tasksData = JSON.parse(data);

      logger.info({
        category: "process",
        action: "loaded_tasksdata_tasks_length_0_tasks_from_storage",
        message: `Loaded ${tasksData.tasks?.length || 0} tasks from storage`,
      });
      return tasksData.tasks || [];
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_load_tasks_from_storage",
        message: "Failed to load tasks from storage:",
        error: error,
      });
      // Try to load from backup
      return this.loadFromBackup();
    }
  }

  /**
   * Load tasks from backup file
   */
  private loadFromBackup(): Task[] {
    const backupFiles = fs
      .readdirSync(this.config.backupPath)
      .filter(
        (file) => file.startsWith("tasks-backup-") && file.endsWith(".json"),
      )
      .sort()
      .reverse(); // Most recent first

    for (const backupFile of backupFiles) {
      try {
        const backupPath = path.join(this.config.backupPath, backupFile);
        const data = fs.readFileSync(backupPath, "utf-8");
        const tasksData = JSON.parse(data);

        logger.info({
          category: "process",
          action: "loaded_tasksdata_tasks_length_0_tasks_from_backup_",
          message: `Loaded ${tasksData.tasks?.length || 0} tasks from backup: ${backupFile}`,
        });
        return tasksData.tasks || [];
      } catch (error) {
        logger.error({
          category: "process",
          action: "failed_to_load_backup_backupfile",
          message: `Failed to load backup ${backupFile}:`,
          error: error,
        });
        continue;
      }
    }

    logger.info({
      category: "process",
      action: "no_valid_backup_files_found_starting_with_empty_ta",
      message: "No valid backup files found, starting with empty task storage",
    });
    return [];
  }

  /**
   * Save tasks to storage file
   */
  public saveTasks(tasks: Task[]): void {
    try {
      // Create backup before saving
      this.createBackup(tasks);

      // Save current tasks
      const tasksFile = path.join(this.config.storagePath, "tasks.json");
      const tasksData = {
        version: "1.0",
        lastSaved: new Date().toISOString(),
        tasks: tasks,
      };

      fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2));
      this.isDirty = false;

      logger.info({
        category: "process",
        action: "saved_tasks_length_tasks_to_storage",
        message: `Saved ${tasks.length} tasks to storage`,
      });
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_save_tasks",
        message: "Failed to save tasks:",
        error: error,
      });
    }
  }

  /**
   * Save completed tasks to separate file for verification
   */
  public saveCompletedTasks(completedTasks: Task[]): void {
    try {
      // Load existing completed tasks
      const existingCompleted = this.loadCompletedTasks();

      // Merge with new completed tasks (avoid duplicates)
      const existingIds = new Set(existingCompleted.map((t) => t.id));
      const newCompletedTasks = completedTasks.filter(
        (t) => !existingIds.has(t.id),
      );
      const allCompletedTasks = [...existingCompleted, ...newCompletedTasks];

      // Create backup before saving
      this.createCompletedTasksBackup(allCompletedTasks);

      // Save completed tasks
      const completedFile = path.join(
        this.config.storagePath,
        "completed-tasks.json",
      );
      const completedData = {
        version: "1.0",
        lastSaved: new Date().toISOString(),
        totalCompleted: allCompletedTasks.length,
        tasks: allCompletedTasks,
      };

      fs.writeFileSync(completedFile, JSON.stringify(completedData, null, 2));

      logger.info({
        category: "process",
        action: "saved_newcompletedtasks_length_new_completed_tasks",
        message: `Saved ${newCompletedTasks.length} new completed tasks (total: ${allCompletedTasks.length})`,
      });
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_save_completed_tasks",
        message: "Failed to save completed tasks:",
        error: error,
      });
    }
  }

  /**
   * Load completed tasks from storage
   */
  public loadCompletedTasks(): Task[] {
    try {
      const completedFile = path.join(
        this.config.storagePath,
        "completed-tasks.json",
      );

      if (!fs.existsSync(completedFile)) {
        logger.info({
          category: "process",
          action: "no_completed_tasks_file_found_starting_with_empty_",
          message:
            "No completed tasks file found, starting with empty completed tasks storage",
        });
        return [];
      }

      const data = fs.readFileSync(completedFile, "utf-8");
      const completedData = JSON.parse(data);

      logger.info({
        category: "process",
        action: "loaded_completeddata_tasks_length_0_completed_task",
        message: `Loaded ${completedData.tasks?.length || 0} completed tasks from storage`,
      });
      return completedData.tasks || [];
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_load_completed_tasks",
        message: "Failed to load completed tasks:",
        error: error,
      });
      return this.loadCompletedTasksFromBackup();
    }
  }

  /**
   * Create backup of current tasks
   */
  private createBackup(tasks: Task[]): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFile = path.join(
        this.config.backupPath,
        `tasks-backup-${timestamp}.json`,
      );

      const tasksData = {
        version: "1.0",
        backupCreated: new Date().toISOString(),
        tasks: tasks,
      };

      fs.writeFileSync(backupFile, JSON.stringify(tasksData, null, 2));

      // Clean up old backups
      this.cleanupOldBackups();
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_create_backup",
        message: "Failed to create backup:",
        error: error,
      });
    }
  }

  /**
   * Clean up old backup files
   */
  private cleanupOldBackups(): void {
    try {
      const backupFiles = fs
        .readdirSync(this.config.backupPath)
        .filter(
          (file) => file.startsWith("tasks-backup-") && file.endsWith(".json"),
        )
        .map((file) => ({
          name: file,
          path: path.join(this.config.backupPath, file),
          stats: fs.statSync(path.join(this.config.backupPath, file)),
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      // Keep only the most recent backups
      const filesToDelete = backupFiles.slice(this.config.maxBackups);

      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        logger.info({
          category: "process",
          action: "deleted_old_backup_file_name",
          message: `Deleted old backup: ${file.name}`,
        });
      }
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_cleanup_old_backups",
        message: "Failed to cleanup old backups:",
        error: error,
      });
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    this.saveTimer = setInterval(() => {
      // This will be called by the manager when needed
    }, this.config.saveInterval);
  }

  /**
   * Stop auto-save timer
   */
  public stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = undefined;
    }
  }

  /**
   * Mark data as dirty (needs saving)
   */
  public markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Check if data needs saving
   */
  public needsSaving(): boolean {
    return this.isDirty;
  }

  /**
   * Export tasks to file
   */
  public exportTasks(tasks: Task[], exportPath: string): void {
    try {
      const tasksData = {
        version: "1.0",
        exported: new Date().toISOString(),
        tasks: tasks,
      };

      fs.writeFileSync(exportPath, JSON.stringify(tasksData, null, 2));
      logger.info({
        category: "process",
        action: "exported_tasks_length_tasks_to_exportpath",
        message: `Exported ${tasks.length} tasks to ${exportPath}`,
      });
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_export_tasks",
        message: "Failed to export tasks:",
        error: error,
      });
      throw error;
    }
  }

  /**
   * Import tasks from file
   */
  public importTasks(importPath: string): Task[] {
    try {
      const data = fs.readFileSync(importPath, "utf-8");
      const tasksData = JSON.parse(data);

      const importedTasks = tasksData.tasks || [];
      this.markDirty();

      logger.info({
        category: "process",
        action: "imported_importedtasks_length_tasks_from_importpat",
        message: `Imported ${importedTasks.length} tasks from ${importPath}`,
      });
      return importedTasks;
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_import_tasks",
        message: "Failed to import tasks:",
        error: error,
      });
      throw error;
    }
  }

  /**
   * Cleanup completed tasks older than specified days
   */
  public cleanupCompletedTasks(
    tasks: Task[],
    olderThanDays: number = 7,
  ): Task[] {
    const cutoffDate = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
    );

    const filteredTasks = tasks.filter((task) => {
      if (task.status === "completed" && task.completedAt) {
        const completedDate = new Date(task.completedAt);
        return completedDate >= cutoffDate;
      }
      return true; // Keep non-completed tasks
    });

    const cleanedCount = tasks.length - filteredTasks.length;
    if (cleanedCount > 0) {
      this.markDirty();
      logger.info({
        category: "process",
        action: "cleaned_up_cleanedcount_completed_tasks_older_than",
        message: `Cleaned up ${cleanedCount} completed tasks older than ${olderThanDays} days`,
      });
    }

    return filteredTasks;
  }

  /**
   * Load completed tasks from backup if main file fails
   */
  private loadCompletedTasksFromBackup(): Task[] {
    try {
      const backupFiles = fs
        .readdirSync(this.config.backupPath)
        .filter(
          (file) =>
            file.startsWith("completed-tasks-backup-") &&
            file.endsWith(".json"),
        )
        .sort()
        .reverse(); // Most recent first

      for (const backupFile of backupFiles) {
        try {
          const backupPath = path.join(this.config.backupPath, backupFile);
          const data = fs.readFileSync(backupPath, "utf-8");
          const completedData = JSON.parse(data);

          logger.info({
            category: "process",
            action: "loaded_completeddata_tasks_length_0_completed_task",
            message: `Loaded ${completedData.tasks?.length || 0} completed tasks from backup: ${backupFile}`,
          });
          return completedData.tasks || [];
        } catch (error) {
          logger.error({
            category: "process",
            action: "failed_to_load_completed_tasks_backup_backupfile",
            message: `Failed to load completed tasks backup ${backupFile}:`,
            error: error,
          });
          continue;
        }
      }

      logger.info({
        category: "process",
        action: "no_valid_completed_tasks_backup_files_found_starti",
        message:
          "No valid completed tasks backup files found, starting with empty completed tasks storage",
      });
      return [];
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_load_completed_tasks_from_backup",
        message: "Failed to load completed tasks from backup:",
        error: error,
      });
      return [];
    }
  }

  /**
   * Create backup of completed tasks
   */
  private createCompletedTasksBackup(completedTasks: Task[]): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFile = path.join(
        this.config.backupPath,
        `completed-tasks-backup-${timestamp}.json`,
      );

      const backupData = {
        version: "1.0",
        backedUp: new Date().toISOString(),
        totalCompleted: completedTasks.length,
        tasks: completedTasks,
      };

      fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));

      // Clean up old backups
      this.cleanupCompletedTasksBackups();
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_create_completed_tasks_backup",
        message: "Failed to create completed tasks backup:",
        error: error,
      });
    }
  }

  /**
   * Clean up old completed tasks backups
   */
  private cleanupCompletedTasksBackups(): void {
    try {
      const backupFiles = fs
        .readdirSync(this.config.backupPath)
        .filter(
          (file) =>
            file.startsWith("completed-tasks-backup-") &&
            file.endsWith(".json"),
        )
        .map((file) => ({
          name: file,
          path: path.join(this.config.backupPath, file),
          stats: fs.statSync(path.join(this.config.backupPath, file)),
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      // Keep only the most recent backups
      const filesToDelete = backupFiles.slice(this.config.maxBackups);

      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        logger.info({
          category: "process",
          action: "deleted_old_completed_tasks_backup_file_name",
          message: `Deleted old completed tasks backup: ${file.name}`,
        });
      }
    } catch (error) {
      logger.error({
        category: "process",
        action: "failed_to_cleanup_completed_tasks_backups",
        message: "Failed to cleanup completed tasks backups:",
        error: error,
      });
    }
  }

  /**
   * Graceful shutdown
   */
  public shutdown(): void {
    this.stopAutoSave();
    logger.info({
      category: "process",
      action: "task_persistence_shutdown_complete",
      message: "Task persistence shutdown complete",
    });
  }
}
