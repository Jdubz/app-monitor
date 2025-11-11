/**
 * Task Context Service
 *
 * Provides CRUD operations for task context data (creation and execution context).
 * Stores rich diagnostic information for task automation and debugging.
 */

import { getDatabase } from './database.js';
import type {
  TaskCreationContext,
  TaskExecutionContext,
} from '../types/taskContext.js';
import { logger } from '../utils/logger.js';

export class TaskContextService {
  /**
   * Store task creation context
   * Captures environment, client metadata, and diagnostic breadcrumbs at task creation time
   */
  storeTaskCreationContext(taskId: string, context: TaskCreationContext): void {
    const db = getDatabase();
    const connection = db.getConnection();

    try {
      const stmt = connection.prepare(`
        INSERT INTO task_creation_context (
          task_id,
          context_json,
          created_at
        ) VALUES (?, ?, ?)
      `);

      stmt.run(
        taskId,
        JSON.stringify(context),
        new Date().toISOString()
      );

      logger.info({
        category: 'task_context',
        action: 'creation_context_stored',
        message: `Stored creation context for task ${taskId}`,
        details: {
          taskId,
          workTarget: context.workTarget,
          hasAttachments: !!context.attachments?.length,
          hasLogs: !!context.recentLogs?.length
        }
      });
    } catch (error) {
      logger.error({
        category: 'task_context',
        action: 'store_creation_context_failed',
        message: `Failed to store creation context for task ${taskId}`,
        error
      });
      throw error;
    }
  }

  /**
   * Store task execution context
   * Captures full execution trail including commands, file operations, and test results
   */
  storeTaskExecutionContext(runId: string, taskId: string, context: TaskExecutionContext): void {
    const db = getDatabase();
    const connection = db.getConnection();

    try {
      const stmt = connection.prepare(`
        INSERT INTO task_execution_context (
          run_id,
          task_id,
          context_json,
          created_at
        ) VALUES (?, ?, ?, ?)
      `);

      stmt.run(
        runId,
        taskId,
        JSON.stringify(context),
        new Date().toISOString()
      );

      logger.info({
        category: 'task_context',
        action: 'execution_context_stored',
        message: `Stored execution context for task ${taskId}, run ${runId}`,
        details: {
          taskId,
          runId,
          status: context.status,
          durationMs: context.durationMs,
          exitCode: context.exitCode
        }
      });
    } catch (error) {
      logger.error({
        category: 'task_context',
        action: 'store_execution_context_failed',
        message: `Failed to store execution context for task ${taskId}, run ${runId}`,
        error
      });
      throw error;
    }
  }

  /**
   * Retrieve task creation context by task ID
   * Returns the context captured when the task was created
   */
  getTaskCreationContext(taskId: string): TaskCreationContext | null {
    const db = getDatabase();
    const connection = db.getConnection();

    try {
      const stmt = connection.prepare(`
        SELECT context_json
        FROM task_creation_context
        WHERE task_id = ?
      `);

      const row = stmt.get(taskId) as { context_json: string } | undefined;

      if (!row) {
        logger.debug({
          category: 'task_context',
          action: 'creation_context_not_found',
          message: `No creation context found for task ${taskId}`
        });
        return null;
      }

      const context = JSON.parse(row.context_json) as TaskCreationContext;

      logger.debug({
        category: 'task_context',
        action: 'creation_context_retrieved',
        message: `Retrieved creation context for task ${taskId}`
      });

      return context;
    } catch (error) {
      logger.error({
        category: 'task_context',
        action: 'get_creation_context_failed',
        message: `Failed to retrieve creation context for task ${taskId}`,
        error
      });
      throw error;
    }
  }

  /**
   * Retrieve task execution context by run ID
   * Returns the context captured during/after task execution
   */
  getTaskExecutionContext(runId: string): TaskExecutionContext | null {
    const db = getDatabase();
    const connection = db.getConnection();

    try {
      const stmt = connection.prepare(`
        SELECT context_json
        FROM task_execution_context
        WHERE run_id = ?
      `);

      const row = stmt.get(runId) as { context_json: string } | undefined;

      if (!row) {
        logger.debug({
          category: 'task_context',
          action: 'execution_context_not_found',
          message: `No execution context found for run ${runId}`
        });
        return null;
      }

      const context = JSON.parse(row.context_json) as TaskExecutionContext;

      logger.debug({
        category: 'task_context',
        action: 'execution_context_retrieved',
        message: `Retrieved execution context for run ${runId}`
      });

      return context;
    } catch (error) {
      logger.error({
        category: 'task_context',
        action: 'get_execution_context_failed',
        message: `Failed to retrieve execution context for run ${runId}`,
        error
      });
      throw error;
    }
  }
}

// Singleton instance
let serviceInstance: TaskContextService | null = null;

export function getTaskContextService(): TaskContextService {
  if (!serviceInstance) {
    serviceInstance = new TaskContextService();
  }
  return serviceInstance;
}
