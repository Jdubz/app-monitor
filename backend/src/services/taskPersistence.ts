import fs from 'fs';
import path from 'path';

import { logger } from '../utils/logger.js';
import type { Task } from './devBotsManager.js';

const STORAGE_VERSION = '1.0';

export interface TaskStorageConfig {
  storagePath: string;
  backupPath: string;
  maxBackups?: number;
  autoSave?: boolean;
  saveInterval?: number;
}

interface StoredTasksPayload {
  version: string;
  lastSaved: string;
  totalTasks?: number;
  totalCompleted?: number;
  tasks: Task[];
}

type BackupKind = 'tasks' | 'completed-tasks';

export class TaskPersistence {
  private readonly storageFile: string;
  private readonly completedFile: string;
  private readonly backupPath: string;
  private readonly config: Required<Pick<TaskStorageConfig, 'maxBackups' | 'autoSave' | 'saveInterval'>> &
    Pick<TaskStorageConfig, 'storagePath' | 'backupPath'>;
  private autoSaveTimer?: NodeJS.Timeout;
  private cachedTasks: Task[] = [];
  private dirty = false;

  constructor(config: TaskStorageConfig) {
    this.config = {
      storagePath: config.storagePath,
      backupPath: config.backupPath,
      maxBackups: config.maxBackups ?? 5,
      autoSave: config.autoSave ?? false,
      saveInterval: config.saveInterval ?? 60_000,
    };
    this.storageFile = path.join(this.config.storagePath, 'tasks.json');
    this.completedFile = path.join(this.config.storagePath, 'completed-tasks.json');
    this.backupPath = this.config.backupPath;

    this.ensureDirectory(this.config.storagePath);
    this.ensureDirectory(this.backupPath);

    if (this.config.autoSave) {
      this.startAutoSave();
    }
  }

  public destroy(): void {
    this.stopAutoSave();
  }

  public shutdown(): void {
    this.destroy();
  }

  public loadTasks(): Task[] {
    const payload = this.safeReadPayload(this.storageFile);
    if (payload) {
      return payload.tasks;
    }

    const backupPayload = this.loadLatestBackup('tasks');
    return backupPayload?.tasks ?? [];
  }

  public saveTasks(tasks: Task[]): void {
    this.cachedTasks = [...tasks];
    this.dirty = false;
    const serialized = this.serializeTasks(tasks);
    try {
      this.writeBackup('tasks', serialized);
      fs.writeFileSync(this.storageFile, serialized);
      this.cleanupBackups('tasks');
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'save_tasks_failed',
        message: 'Failed to save tasks:',
        error,
      });
    }
  }

  public saveTask(tasks: Task | Task[]): void {
    if (Array.isArray(tasks)) {
      this.saveTasks(tasks);
    } else {
      this.saveTasks([tasks]);
    }
  }

  public markDirty(): void {
    this.dirty = true;
  }

  public needsSaving(): boolean {
    return this.dirty;
  }

  public saveCompletedTasks(tasks: Task[]): void {
    const serialized = this.serializeTasks(tasks, { completed: true });
    try {
      this.writeBackup('completed-tasks', serialized);
      fs.writeFileSync(this.completedFile, serialized);
      this.cleanupBackups('completed-tasks');
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'save_completed_failed',
        message: 'Failed to save completed tasks:',
        error,
      });
    }
  }

  public loadCompletedTasks(): Task[] {
    const payload = this.safeReadPayload(this.completedFile);
    return payload?.tasks ?? [];
  }

  public exportTasks(tasks: Task[], exportPath: string): void {
    const serialized = this.serializeTasks(tasks);
    fs.writeFileSync(exportPath, serialized);
  }

  public importTasks(importPath: string): Task[] {
    const payload = this.safeReadPayload(importPath, { throwOnError: true });
    return payload?.tasks ?? [];
  }

  public cleanupCompletedTasks(tasks: Task[], retentionDays: number): Task[] {
    if (!retentionDays || retentionDays <= 0) {
      return tasks;
    }
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const filtered = tasks.filter((task) => {
      const completedAt = this.getCompletedTimestamp(task);
      return !completedAt || completedAt >= cutoff;
    });
    return filtered;
  }

  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      if (!this.dirty || this.cachedTasks.length === 0) {
        return;
      }
      this.saveTasks(this.cachedTasks);
    }, this.config.saveInterval);
  }

  public stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  private serializeTasks(tasks: Task[], options?: { completed?: boolean }): string {
    const payload: StoredTasksPayload = {
      version: STORAGE_VERSION,
      lastSaved: new Date().toISOString(),
      tasks,
    };
    if (options?.completed) {
      payload.totalCompleted = tasks.length;
    } else {
      payload.totalTasks = tasks.length;
    }
    return JSON.stringify(payload, null, 2);
  }

  private safeReadPayload(filePath: string, options?: { throwOnError?: boolean }): StoredTasksPayload | null {
    if (!fs.existsSync(filePath)) {
      if (options?.throwOnError) {
        throw new Error(`File not found: ${filePath}`);
      }
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as StoredTasksPayload;
    } catch (error) {
      if (options?.throwOnError) {
        throw error;
      }
      logger.error({
        category: 'system',
        action: 'load_failed',
        message: 'Failed to load tasks from storage:',
        error,
      });
      return null;
    }
  }

  private loadLatestBackup(kind: BackupKind): StoredTasksPayload | null {
    try {
      const files = fs.readdirSync(this.backupPath);
      const prefix = this.backupPrefix(kind);
      const candidates = files.filter((file) => file.startsWith(prefix));
      if (!candidates.length) {
        return null;
      }

      const sorted = candidates
        .map((file) => ({
          file,
          mtime: fs.statSync(path.join(this.backupPath, file)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime);

      for (const candidate of sorted) {
        const payload = this.safeReadPayload(path.join(this.backupPath, candidate.file));
        if (payload) {
          return payload;
        }
      }
    } catch (error) {
      logger.warn({
        category: 'system',
        action: 'backup_load_failed',
        message: 'Failed to load backup file',
        error,
      });
    }
    return null;
  }

  private writeBackup(kind: BackupKind, payload: string): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:]/g, '-');
      const backupFile = path.join(this.backupPath, `${this.backupPrefix(kind)}${timestamp}.json`);
      fs.writeFileSync(backupFile, payload);
    } catch (error) {
      logger.warn({
        category: 'system',
        action: 'backup_write_failed',
        message: 'Failed to write backup file',
        error,
      });
    }
  }

  private cleanupBackups(kind: BackupKind): void {
    try {
      const files = fs.readdirSync(this.backupPath);
      const prefix = this.backupPrefix(kind);
      const candidates = files
        .filter((file) => file.startsWith(prefix))
        .map((file) => ({
          file,
          mtime: fs.statSync(path.join(this.backupPath, file)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (candidates.length <= this.config.maxBackups) {
        return;
      }

      const toRemove = candidates.slice(this.config.maxBackups);
      toRemove.forEach(({ file }) => {
        fs.unlinkSync(path.join(this.backupPath, file));
      });
    } catch (error) {
      logger.warn({
        category: 'system',
        action: 'backup_cleanup_failed',
        message: 'Failed to cleanup backup files',
        error,
      });
    }
  }

  private backupPrefix(kind: BackupKind): string {
    return kind === 'tasks' ? 'tasks-backup-' : 'completed-tasks-backup-';
  }

  private ensureDirectory(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private getCompletedTimestamp(task: Task): number | undefined {
    const completedAt = (task as unknown as Record<string, unknown>).completed_at ?? (task as unknown as Record<string, unknown>).completedAt;
    if (typeof completedAt === 'number') {
      return completedAt;
    }
    if (typeof completedAt === 'string') {
      const parsed = Date.parse(completedAt);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }
}
