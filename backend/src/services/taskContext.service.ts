/**
 * Task Context Service
 *
 * Provides comprehensive task context management:
 * 1. Access to task automation run data (migration 004: task_automation_runs)
 * 2. CRUD operations for creation/execution context (migration 009: task_creation_context, task_execution_context)
 *
 * This service integrates both the automation run tracking and diagnostic context storage.
 */

import { getDatabase } from './database.js';
import type {
  TaskCreationContext,
  TaskExecutionContext,
} from '../types/taskContext.js';
import { logger } from '../utils/logger.js';

// Types for automation run data (from migration 004)
export interface AutomationRun {
  run_id: string;
  task_id: string;
  worker_id: string | null;
  container_id: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  exit_code: number | null;
  status: 'success' | 'failed' | 'noop';
  failure_reason: string | null;
  commit_sha: string | null;
  branch: string | null;
  quality_passed: number | null;
  quality_validation_json: string | null;
  resource_usage_json: string | null;
  token_usage_json: string | null;
  container_meta_json: string | null;
  build_exit_code: number | null;
  test_passed: number | null;
  test_failed: number | null;
  test_skipped: number | null;
  lint_errors: number | null;
  lint_warnings: number | null;
  created_at: string;
}

export class TaskContextService {
  // ============================================================================
  // Automation Run Data (migration 004: task_automation_runs)
  // Used by dev-bots.routes.ts for API endpoints
  // ============================================================================

  /**
   * Get all automation runs for a specific task
   */
  getTaskAutomationRuns(taskId: string): AutomationRun[] {
    const db = getDatabase();
    const connection = db.getConnection();

    const stmt = connection.prepare(`
      SELECT * FROM task_automation_runs
      WHERE task_id = ?
      ORDER BY started_at DESC
    `);

    return stmt.all(taskId) as AutomationRun[];
  }

  /**
   * Get a specific automation run by run_id
   */
  getAutomationRun(runId: string): AutomationRun | null {
    const db = getDatabase();
    const connection = db.getConnection();

    const stmt = connection.prepare(`
      SELECT * FROM task_automation_runs
      WHERE run_id = ?
    `);

    const result = stmt.get(runId);
    return result ? (result as AutomationRun) : null;
  }

  /**
   * Get the most recent automation run for a task
   */
  getLatestAutomationRun(taskId: string): AutomationRun | null {
    const runs = this.getTaskAutomationRuns(taskId);
    return runs.length > 0 ? runs[0] : null;
  }

  // ============================================================================
  // Task Creation/Execution Context (migration 009)
  // ============================================================================


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

export function resetTaskContextService(): void {
  serviceInstance = null;
}
