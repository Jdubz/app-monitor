/**
 * Task Artifact Service
 *
 * Manages task artifact metadata in the database.
 * Links artifact files (logs, summaries) to tasks for tracking and retrieval.
 */

import * as fs from 'fs';
import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export type ArtifactType = 'stdout' | 'stderr' | 'patch' | 'log' | 'screenshot' | 'report' | 'session_summary';

export interface TaskArtifact {
  id?: number;
  run_id: string;
  task_id: string;
  type: ArtifactType;
  path: string;
  size_bytes?: number;
  description?: string;
  mime_type?: string;
  created_at: string;
}

export class TaskArtifactService {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || config.databasePath;
    this.db = new Database(resolvedPath);
  }

  /**
   * Insert artifact metadata into database
   */
  insertArtifact(artifact: TaskArtifact): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO task_artifacts (
          run_id, task_id, type, path, size_bytes, description, mime_type, created_at
        ) VALUES (
          @run_id, @task_id, @type, @path, @size_bytes, @description, @mime_type, @created_at
        )
      `);

      const result = stmt.run({
        run_id: artifact.run_id,
        task_id: artifact.task_id,
        type: artifact.type,
        path: artifact.path,
        size_bytes: artifact.size_bytes || null,
        description: artifact.description || null,
        mime_type: artifact.mime_type || null,
        created_at: artifact.created_at,
      });

      logger.debug({
        category: 'artifact',
        action: 'artifact_inserted',
        message: `Inserted artifact for task ${artifact.task_id}`,
        details: {
          task_id: artifact.task_id,
          type: artifact.type,
          path: artifact.path,
          artifact_id: result.lastInsertRowid,
        },
      });

      return Number(result.lastInsertRowid);
    } catch (error) {
      logger.error({
        category: 'artifact',
        action: 'artifact_insert_failed',
        message: `Failed to insert artifact for task ${artifact.task_id}`,
        error,
        details: {
          task_id: artifact.task_id,
          type: artifact.type,
          path: artifact.path,
        },
      });
      throw error;
    }
  }

  /**
   * Insert artifact for a log file
   */
  insertLogArtifact(taskId: string, runId: string, logPath: string, type: 'stdout' | 'stderr'): number {
    let size = 0;
    try {
      const stats = fs.statSync(logPath);
      size = stats.size;
    } catch (error) {
      logger.warn({
        category: 'artifact',
        action: 'log_stat_failed',
        message: `Failed to get size for ${logPath}`,
        error,
      });
    }

    return this.insertArtifact({
      run_id: runId,
      task_id: taskId,
      type,
      path: logPath,
      size_bytes: size,
      mime_type: 'text/plain',
      description: `Task ${type} log`,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Insert session summary artifact
   */
  insertSessionSummary(taskId: string, runId: string, summaryPath: string): number {
    let size = 0;
    try {
      const stats = fs.statSync(summaryPath);
      size = stats.size;
    } catch (error) {
      logger.warn({
        category: 'artifact',
        action: 'summary_stat_failed',
        message: `Failed to get size for ${summaryPath}`,
        error,
      });
    }

    return this.insertArtifact({
      run_id: runId,
      task_id: taskId,
      type: 'session_summary',
      path: summaryPath,
      size_bytes: size,
      mime_type: 'application/json',
      description: 'Task execution session summary',
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Get all artifacts for a task
   */
  getTaskArtifacts(taskId: string): TaskArtifact[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM task_artifacts
        WHERE task_id = ?
        ORDER BY created_at DESC
      `);
      return stmt.all(taskId) as TaskArtifact[];
    } catch (error) {
      logger.error({
        category: 'artifact',
        action: 'get_artifacts_failed',
        message: `Failed to get artifacts for task ${taskId}`,
        error,
      });
      return [];
    }
  }

  /**
   * Get artifacts by type
   */
  getArtifactsByType(taskId: string, type: ArtifactType): TaskArtifact[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM task_artifacts
        WHERE task_id = ? AND type = ?
        ORDER BY created_at DESC
      `);
      return stmt.all(taskId, type) as TaskArtifact[];
    } catch (error) {
      logger.error({
        category: 'artifact',
        action: 'get_artifacts_by_type_failed',
        message: `Failed to get ${type} artifacts for task ${taskId}`,
        error,
      });
      return [];
    }
  }

  close(): void {
    this.db.close();
  }
}
