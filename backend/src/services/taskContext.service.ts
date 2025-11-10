/**
 * Task Context Service
 *
 * Provides access to task automation run data and context information.
 * This service queries the task_automation_runs table and related tables
 * from the 004_task_context migration.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'dev-bots.db');

// Types for automation run data
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
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better concurrency
  }

  /**
   * Get all automation runs for a specific task
   */
  getTaskAutomationRuns(taskId: string): AutomationRun[] {
    const stmt = this.db.prepare(`
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
    const stmt = this.db.prepare(`
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
}
