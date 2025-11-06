/**
 * SQLite-based Task Queue Service
 *
 * Provides reliable, ACID-compliant task queue with:
 * - Atomic task assignment (no race conditions)
 * - Worker heartbeat tracking (detect crashed workers)
 * - Manual timeout support (no automatic timeouts)
 * - File lock conflict resolution
 * - Execution history and observability
 *
 * ## Timeout Philosophy
 *
 * We DO NOT automatically timeout tasks. Complex tasks may legitimately take hours.
 * Instead, we provide:
 *
 * 1. **Warning Detection**: detectLongRunningTasks() logs tasks exceeding a threshold
 *    but does NOT fail them automatically.
 *
 * 2. **Manual Intervention**: manuallyTimeoutTask() allows operators to timeout
 *    tasks after human verification (e.g., container crashed).
 *
 * 3. **Baseline Learning**: getTaskDurationStats() helps understand actual task
 *    durations. After collecting sufficient data (50+ tasks per type/complexity),
 *    can consider enabling smart timeouts with appropriate thresholds.
 *
 * 4. **Worker Heartbeats**: detectStalledWorkers() handles actual infrastructure
 *    failures (container crashes, system issues) via heartbeat mechanism.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger.js';

// Task status enum
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

// Worker status enum
export type WorkerStatus = 'starting' | 'running' | 'stopping' | 'stopped';

export interface Task {
  id: string;
  type: string;
  title: string;
  description?: string;
  documentation?: string;
  notes?: string;
  status: TaskStatus;
  priority: number;
  created_at: number;
  assigned_at?: number;
  started_at?: number;
  completed_at?: number;
  assigned_agent: string;
  assigned_worker?: string;
  prompt?: string;
  output?: string;
  error?: string;
  can_retry: boolean;
  retry_count: number;
  max_retries: number;
  timeout_ms: number;
  fingerprint?: string;
  estimated_hours?: number;
  complexity?: string;
  files?: string[];
  dependencies?: string[];
  acceptance_criteria?: string[];
  architecture_references?: string[];
  validation_steps?: string[];
  success_metrics?: string[];
}

export interface Worker {
  id: string;
  agent_id: string;
  status: WorkerStatus;
  current_task_id?: string;
  created_at: number;
  last_heartbeat: number;
  heartbeat_timeout_ms: number;
}

export interface TaskExecution {
  id: number;
  task_id: string;
  worker_id: string;
  attempt_number: number;
  started_at: number;
  ended_at?: number;
  exit_code?: number;
  error?: string;
  duration_ms?: number;
}

export interface QueueMetrics {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  timeout: number;
  total: number;
  avg_completion_time_ms?: number;
  oldest_pending_age_ms?: number;
}

export class TaskQueueService {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.ensureDirectory();
    this.db = new Database(dbPath);
    this.initialize();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private initialize(): void {
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    // Create schema
    this.createSchema();

    logger.info({
      category: 'process',
      action: 'sqlite_queue_initialized',
      message: `SQLite task queue initialized at ${this.dbPath}`
    });
  }

  private createSchema(): void {
    this.db.exec(`
      -- Main tasks table
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        documentation TEXT,
        notes TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
        priority INTEGER NOT NULL DEFAULT 5,
        created_at INTEGER NOT NULL,
        assigned_at INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        assigned_agent TEXT NOT NULL,
        assigned_worker TEXT,
        prompt TEXT,
        output TEXT,
        error TEXT,
        can_retry INTEGER DEFAULT 1,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        timeout_ms INTEGER DEFAULT NULL, -- NULL = no timeout (conservative approach)
        fingerprint TEXT,
        estimated_hours REAL,
        complexity TEXT
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_tasks_fingerprint ON tasks(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_worker ON tasks(assigned_worker);

      -- Worker tracking
      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('starting', 'running', 'stopping', 'stopped')),
        current_task_id TEXT,
        created_at INTEGER NOT NULL,
        last_heartbeat INTEGER NOT NULL,
        heartbeat_timeout_ms INTEGER DEFAULT 30000,

        FOREIGN KEY (current_task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
      CREATE INDEX IF NOT EXISTS idx_workers_last_heartbeat ON workers(last_heartbeat);

      -- Task execution history
      CREATE TABLE IF NOT EXISTS task_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        exit_code INTEGER,
        error TEXT,
        duration_ms INTEGER,

        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_executions_task_id ON task_executions(task_id);
      CREATE INDEX IF NOT EXISTS idx_executions_worker_id ON task_executions(worker_id);

      -- Task files (for file locking)
      CREATE TABLE IF NOT EXISTS task_files (
        task_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        lock_acquired_at INTEGER,

        PRIMARY KEY (task_id, file_path),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_task_files_path ON task_files(file_path);

      -- Task acceptance criteria
      CREATE TABLE IF NOT EXISTS task_criteria (
        task_id TEXT NOT NULL,
        criterion TEXT NOT NULL,
        sort_order INTEGER NOT NULL,

        PRIMARY KEY (task_id, sort_order),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- Task architecture references
      CREATE TABLE IF NOT EXISTS task_references (
        task_id TEXT NOT NULL,
        reference TEXT NOT NULL,
        sort_order INTEGER NOT NULL,

        PRIMARY KEY (task_id, sort_order),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- Task dependencies
      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,

        PRIMARY KEY (task_id, depends_on_task_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- Task validation steps
      CREATE TABLE IF NOT EXISTS task_validation_steps (
        task_id TEXT NOT NULL,
        step TEXT NOT NULL,
        sort_order INTEGER NOT NULL,

        PRIMARY KEY (task_id, sort_order),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- Task success metrics
      CREATE TABLE IF NOT EXISTS task_success_metrics (
        task_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        sort_order INTEGER NOT NULL,

        PRIMARY KEY (task_id, sort_order),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
    `);
  }

  /**
   * Create a new task
   */
  createTask(taskData: Partial<Task>): Task {
    const now = Date.now();
    const task: Task = {
      id: taskData.id || `task-${taskData.type}-${now}`,
      type: taskData.type || 'implementation',
      title: taskData.title || 'Untitled Task',
      description: taskData.description,
      documentation: taskData.documentation,
      notes: taskData.notes,
      status: 'pending',
      priority: taskData.priority || 5,
      created_at: now,
      assigned_agent: taskData.assigned_agent || 'general-purpose',
      prompt: taskData.prompt,
      can_retry: taskData.can_retry !== undefined ? taskData.can_retry : true,
      retry_count: 0,
      max_retries: taskData.max_retries || 3,
      timeout_ms: taskData.timeout_ms || null, // NULL = no automatic timeout
      fingerprint: taskData.fingerprint,
      estimated_hours: taskData.estimated_hours,
      complexity: taskData.complexity
    };

    return this.transaction(() => {
      // Insert main task
      const stmt = this.db.prepare(`
        INSERT INTO tasks (
          id, type, title, description, documentation, notes, status, priority,
          created_at, assigned_agent, prompt, can_retry, retry_count, max_retries,
          timeout_ms, fingerprint, estimated_hours, complexity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        task.id, task.type, task.title, task.description, task.documentation,
        task.notes, task.status, task.priority, task.created_at, task.assigned_agent,
        task.prompt, task.can_retry ? 1 : 0, task.retry_count, task.max_retries,
        task.timeout_ms, task.fingerprint, task.estimated_hours, task.complexity
      );

      // Insert related data
      if (taskData.files && taskData.files.length > 0) {
        const fileStmt = this.db.prepare('INSERT INTO task_files (task_id, file_path) VALUES (?, ?)');
        for (const file of taskData.files) {
          fileStmt.run(task.id, file);
        }
      }

      if (taskData.acceptance_criteria && taskData.acceptance_criteria.length > 0) {
        const criteriaStmt = this.db.prepare('INSERT INTO task_criteria (task_id, criterion, sort_order) VALUES (?, ?, ?)');
        taskData.acceptance_criteria.forEach((criterion, index) => {
          criteriaStmt.run(task.id, criterion, index);
        });
      }

      if (taskData.architecture_references && taskData.architecture_references.length > 0) {
        const refStmt = this.db.prepare('INSERT INTO task_references (task_id, reference, sort_order) VALUES (?, ?, ?)');
        taskData.architecture_references.forEach((ref, index) => {
          refStmt.run(task.id, ref, index);
        });
      }

      if (taskData.validation_steps && taskData.validation_steps.length > 0) {
        const validationStmt = this.db.prepare('INSERT INTO task_validation_steps (task_id, step, sort_order) VALUES (?, ?, ?)');
        taskData.validation_steps.forEach((step, index) => {
          validationStmt.run(task.id, step, index);
        });
      }

      if (taskData.success_metrics && taskData.success_metrics.length > 0) {
        const metricStmt = this.db.prepare('INSERT INTO task_success_metrics (task_id, metric, sort_order) VALUES (?, ?, ?)');
        taskData.success_metrics.forEach((metric, index) => {
          metricStmt.run(task.id, metric, index);
        });
      }

      logger.info({
        category: 'process',
        action: 'task_created',
        message: `Created task ${task.id}: ${task.title}`
      });

      return task;
    });
  }

  /**
   * Check for duplicate task by fingerprint
   */
  checkDuplicateTask(fingerprint: string): Task | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE fingerprint = ?
      AND status IN ('pending', 'running')
      ORDER BY created_at ASC
      LIMIT 1
    `);

    return stmt.get(fingerprint) as Task | undefined;
  }

  /**
   * Assign next available task atomically
   * Returns null if no tasks available or all have file conflicts
   */
  assignNextTask(): Task | null {
    return this.transaction(() => {
      // Find next pending task ordered by priority and age
      const taskStmt = this.db.prepare(`
        SELECT * FROM tasks
        WHERE status = 'pending'
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      `);

      const task = taskStmt.get() as Task | undefined;
      if (!task) return null;

      // Check for file conflicts
      const conflictStmt = this.db.prepare(`
        SELECT tf.file_path, t.id as conflicting_task_id
        FROM task_files tf
        JOIN tasks t ON tf.task_id = t.id
        WHERE tf.file_path IN (SELECT file_path FROM task_files WHERE task_id = ?)
        AND t.status = 'running'
        AND t.id != ?
      `);

      const conflict = conflictStmt.get(task.id, task.id);
      if (conflict) {
        logger.info({
          category: 'process',
          action: 'task_assignment_blocked_by_file_conflict',
          message: `Task ${task.id} blocked by file conflict with task ${(conflict as any).conflicting_task_id}`
        });
        return null;
      }

      // Assign task atomically
      const now = Date.now();
      const workerId = `bot-${task.assigned_agent}-${now}`;

      const updateStmt = this.db.prepare(`
        UPDATE tasks
        SET status = 'running',
            assigned_at = ?,
            started_at = ?,
            assigned_worker = ?
        WHERE id = ?
      `);

      updateStmt.run(now, now, workerId, task.id);

      // Create worker record
      const workerStmt = this.db.prepare(`
        INSERT INTO workers (id, agent_id, status, current_task_id, created_at, last_heartbeat)
        VALUES (?, ?, 'running', ?, ?, ?)
      `);

      workerStmt.run(workerId, task.assigned_agent, task.id, now, now);

      // Record execution attempt
      const executionStmt = this.db.prepare(`
        INSERT INTO task_executions (task_id, worker_id, attempt_number, started_at)
        VALUES (?, ?, ?, ?)
      `);

      executionStmt.run(task.id, workerId, task.retry_count + 1, now);

      logger.info({
        category: 'process',
        action: 'task_assigned',
        message: `Assigned task ${task.id} to worker ${workerId}`
      });

      return {
        ...task,
        status: 'running',
        assigned_worker: workerId,
        assigned_at: now,
        started_at: now
      };
    });
  }

  /**
   * Complete a task (idempotent)
   */
  completeTask(taskId: string, output: string): void {
    this.transaction(() => {
      const taskStmt = this.db.prepare('SELECT status FROM tasks WHERE id = ?');
      const task = taskStmt.get(taskId) as { status: TaskStatus } | undefined;

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Idempotency: only complete if currently running
      if (task.status !== 'running') {
        logger.warn({
          category: 'process',
          action: 'task_already_in_final_state',
          message: `Task ${taskId} already in ${task.status} state, skipping completion`
        });
        return;
      }

      const now = Date.now();

      // Update task
      const updateStmt = this.db.prepare(`
        UPDATE tasks
        SET status = 'completed',
            output = ?,
            completed_at = ?
        WHERE id = ?
      `);

      updateStmt.run(output, now, taskId);

      // Update execution record
      const executionStmt = this.db.prepare(`
        SELECT id, started_at
        FROM task_executions
        WHERE task_id = ? AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `);

      const execution = executionStmt.get(taskId) as { id: number; started_at: number } | undefined;

      if (execution) {
        const updateExecutionStmt = this.db.prepare(`
          UPDATE task_executions
          SET ended_at = ?,
              duration_ms = ?,
              exit_code = 0
          WHERE id = ?
        `);

        updateExecutionStmt.run(now, now - execution.started_at, execution.id);
      }

      // Clean up worker
      const workerStmt = this.db.prepare(`
        UPDATE workers
        SET status = 'stopped',
            current_task_id = NULL
        WHERE current_task_id = ?
      `);

      workerStmt.run(taskId);

      logger.info({
        category: 'process',
        action: 'task_completed',
        message: `Task ${taskId} completed successfully`
      });
    });
  }

  /**
   * Fail a task
   */
  failTask(taskId: string, error: string): void {
    this.transaction(() => {
      const taskStmt = this.db.prepare('SELECT status, can_retry, retry_count, max_retries FROM tasks WHERE id = ?');
      const task = taskStmt.get(taskId) as { status: TaskStatus; can_retry: number; retry_count: number; max_retries: number } | undefined;

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (task.status !== 'running') {
        logger.warn({
          category: 'process',
          action: 'task_already_in_final_state',
          message: `Task ${taskId} already in ${task.status} state, skipping failure`
        });
        return;
      }

      const now = Date.now();

      // Determine if task can be retried
      const canRetry = task.can_retry && task.retry_count < task.max_retries;
      const newStatus = canRetry ? 'pending' : 'failed';

      // Update task
      const updateStmt = this.db.prepare(`
        UPDATE tasks
        SET status = ?,
            error = ?,
            completed_at = ?,
            retry_count = retry_count + 1,
            assigned_worker = NULL,
            assigned_at = NULL,
            started_at = NULL
        WHERE id = ?
      `);

      updateStmt.run(newStatus, error, now, taskId);

      // Update execution record
      const executionStmt = this.db.prepare(`
        SELECT id, started_at
        FROM task_executions
        WHERE task_id = ? AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `);

      const execution = executionStmt.get(taskId) as { id: number; started_at: number } | undefined;

      if (execution) {
        const updateExecutionStmt = this.db.prepare(`
          UPDATE task_executions
          SET ended_at = ?,
              duration_ms = ?,
              exit_code = 1,
              error = ?
          WHERE id = ?
        `);

        updateExecutionStmt.run(now, now - execution.started_at, error, execution.id);
      }

      // Clean up worker
      const workerStmt = this.db.prepare(`
        UPDATE workers
        SET status = 'stopped',
            current_task_id = NULL
        WHERE current_task_id = ?
      `);

      workerStmt.run(taskId);

      logger.info({
        category: 'process',
        action: canRetry ? 'task_failed_retrying' : 'task_failed',
        message: `Task ${taskId} failed: ${error}${canRetry ? ' (will retry)' : ''}`
      });
    });
  }

  /**
   * Update worker heartbeat
   */
  updateWorkerHeartbeat(workerId: string): void {
    const stmt = this.db.prepare('UPDATE workers SET last_heartbeat = ? WHERE id = ?');
    stmt.run(Date.now(), workerId);
  }

  /**
   * Detect and handle stalled workers
   * Returns array of stalled worker IDs
   */
  detectStalledWorkers(): string[] {
    return this.transaction(() => {
      const timeout = Date.now() - 30000; // 30 seconds

      const stmt = this.db.prepare(`
        SELECT id, current_task_id
        FROM workers
        WHERE status = 'running'
        AND last_heartbeat < ?
      `);

      const stalledWorkers = stmt.all(timeout) as { id: string; current_task_id: string }[];

      for (const worker of stalledWorkers) {
        if (worker.current_task_id) {
          const updateTaskStmt = this.db.prepare(`
            UPDATE tasks
            SET status = 'failed',
                error = 'Worker heartbeat timeout',
                completed_at = ?
            WHERE id = ?
          `);

          updateTaskStmt.run(Date.now(), worker.current_task_id);
        }

        const updateWorkerStmt = this.db.prepare('UPDATE workers SET status = \'stopped\' WHERE id = ?');
        updateWorkerStmt.run(worker.id);

        logger.warn({
          category: 'process',
          action: 'stalled_worker_detected',
          message: `Worker ${worker.id} stalled, marked task ${worker.current_task_id} as failed`
        });
      }

      return stalledWorkers.map(w => w.id);
    });
  }

  /**
   * Detect tasks that have exceeded their timeout (WARNING ONLY)
   * Does NOT automatically fail tasks - returns them for investigation
   *
   * IMPORTANT: Only use this for alerting/monitoring. Do not auto-fail tasks
   * until we have baseline data on actual task durations.
   */
  detectLongRunningTasks(warningThresholdMs: number = 1800000): Array<{ id: string; title: string; started_at: number; duration_ms: number }> {
    const now = Date.now();
    const threshold = now - warningThresholdMs;

    const stmt = this.db.prepare(`
      SELECT id, title, started_at,
             ? - started_at as duration_ms
      FROM tasks
      WHERE status = 'running'
      AND started_at < ?
    `);

    const longRunningTasks = stmt.all(now, threshold) as Array<{ id: string; title: string; started_at: number; duration_ms: number }>;

    if (longRunningTasks.length > 0) {
      logger.warn({
        category: 'process',
        action: 'long_running_tasks_detected',
        message: `Found ${longRunningTasks.length} tasks running longer than ${warningThresholdMs / 60000} minutes (WARNING ONLY - not auto-failing)`,
        details: longRunningTasks.map(t => ({
          id: t.id,
          title: t.title,
          duration_minutes: Math.round(t.duration_ms / 60000)
        }))
      });
    }

    return longRunningTasks;
  }

  /**
   * Manually timeout a specific task (requires explicit call)
   * Use this only after human verification that a task is truly stuck
   */
  manuallyTimeoutTask(taskId: string, reason: string = 'Manually timed out by operator'): void {
    this.transaction(() => {
      const taskStmt = this.db.prepare('SELECT status FROM tasks WHERE id = ?');
      const task = taskStmt.get(taskId) as { status: TaskStatus } | undefined;

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (task.status !== 'running') {
        logger.warn({
          category: 'process',
          action: 'task_not_running',
          message: `Task ${taskId} is ${task.status}, cannot timeout`
        });
        return;
      }

      const now = Date.now();

      const updateStmt = this.db.prepare(`
        UPDATE tasks
        SET status = 'timeout',
            error = ?,
            completed_at = ?
        WHERE id = ?
      `);

      updateStmt.run(reason, now, taskId);

      // Update execution record
      const executionStmt = this.db.prepare(`
        SELECT id, started_at
        FROM task_executions
        WHERE task_id = ? AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `);

      const execution = executionStmt.get(taskId) as { id: number; started_at: number } | undefined;

      if (execution) {
        const updateExecutionStmt = this.db.prepare(`
          UPDATE task_executions
          SET ended_at = ?,
              duration_ms = ?,
              error = ?
          WHERE id = ?
        `);

        updateExecutionStmt.run(now, now - execution.started_at, reason, execution.id);
      }

      logger.warn({
        category: 'process',
        action: 'task_manually_timed_out',
        message: `Task ${taskId} manually timed out: ${reason}`
      });
    });
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | undefined {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const task = stmt.get(taskId) as Task | undefined;

    if (task) {
      // Load related data
      task.files = this.getTaskFiles(taskId);
      task.acceptance_criteria = this.getTaskCriteria(taskId);
      task.architecture_references = this.getTaskReferences(taskId);
      task.validation_steps = this.getTaskValidationSteps(taskId);
      task.success_metrics = this.getTaskSuccessMetrics(taskId);
    }

    return task;
  }

  /**
   * Get all tasks by status
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, created_at ASC');
    return stmt.all(status) as Task[];
  }

  /**
   * Get task duration statistics by type and complexity
   * Useful for learning baseline durations before setting timeouts
   */
  getTaskDurationStats(daysBack: number = 30): Array<{
    type: string;
    complexity: string;
    completed_count: number;
    avg_minutes: number;
    max_minutes: number;
    min_minutes: number;
  }> {
    const since = Date.now() - (daysBack * 86400000);

    const stmt = this.db.prepare(`
      SELECT
        t.type,
        COALESCE(t.complexity, 'unknown') as complexity,
        COUNT(*) as completed_count,
        AVG(te.duration_ms) / 60000.0 as avg_minutes,
        MAX(te.duration_ms) / 60000.0 as max_minutes,
        MIN(te.duration_ms) / 60000.0 as min_minutes
      FROM task_executions te
      JOIN tasks t ON te.task_id = t.id
      WHERE te.exit_code = 0
      AND te.ended_at > ?
      GROUP BY t.type, t.complexity
      ORDER BY t.type, t.complexity
    `);

    return stmt.all(since) as Array<{
      type: string;
      complexity: string;
      completed_count: number;
      avg_minutes: number;
      max_minutes: number;
      min_minutes: number;
    }>;
  }

  /**
   * Get queue metrics
   */
  getQueueMetrics(): QueueMetrics {
    const countStmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM tasks
      GROUP BY status
    `);

    const counts = countStmt.all() as { status: TaskStatus; count: number }[];
    const metrics: QueueMetrics = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      timeout: 0,
      total: 0
    };

    for (const { status, count } of counts) {
      metrics[status] = count;
      metrics.total += count;
    }

    // Average completion time
    const avgStmt = this.db.prepare(`
      SELECT AVG(duration_ms) as avg_duration
      FROM task_executions
      WHERE exit_code = 0
      AND ended_at > ?
    `);

    const oneDayAgo = Date.now() - 86400000;
    const avgResult = avgStmt.get(oneDayAgo) as { avg_duration: number } | undefined;
    metrics.avg_completion_time_ms = avgResult?.avg_duration;

    // Oldest pending task age
    const oldestStmt = this.db.prepare(`
      SELECT MIN(created_at) as oldest
      FROM tasks
      WHERE status = 'pending'
    `);

    const oldestResult = oldestStmt.get() as { oldest: number } | undefined;
    if (oldestResult?.oldest) {
      metrics.oldest_pending_age_ms = Date.now() - oldestResult.oldest;
    }

    return metrics;
  }

  /**
   * Get task execution history
   */
  getTaskExecutions(taskId: string): TaskExecution[] {
    const stmt = this.db.prepare(`
      SELECT * FROM task_executions
      WHERE task_id = ?
      ORDER BY started_at ASC
    `);

    return stmt.all(taskId) as TaskExecution[];
  }

  /**
   * Execute a function within a transaction
   */
  private transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  // Helper methods for related data

  private getTaskFiles(taskId: string): string[] {
    const stmt = this.db.prepare('SELECT file_path FROM task_files WHERE task_id = ? ORDER BY file_path');
    const rows = stmt.all(taskId) as { file_path: string }[];
    return rows.map(r => r.file_path);
  }

  private getTaskCriteria(taskId: string): string[] {
    const stmt = this.db.prepare('SELECT criterion FROM task_criteria WHERE task_id = ? ORDER BY sort_order');
    const rows = stmt.all(taskId) as { criterion: string }[];
    return rows.map(r => r.criterion);
  }

  private getTaskReferences(taskId: string): string[] {
    const stmt = this.db.prepare('SELECT reference FROM task_references WHERE task_id = ? ORDER BY sort_order');
    const rows = stmt.all(taskId) as { reference: string }[];
    return rows.map(r => r.reference);
  }

  private getTaskValidationSteps(taskId: string): string[] {
    const stmt = this.db.prepare('SELECT step FROM task_validation_steps WHERE task_id = ? ORDER BY sort_order');
    const rows = stmt.all(taskId) as { step: string }[];
    return rows.map(r => r.step);
  }

  private getTaskSuccessMetrics(taskId: string): string[] {
    const stmt = this.db.prepare('SELECT metric FROM task_success_metrics WHERE task_id = ? ORDER BY sort_order');
    const rows = stmt.all(taskId) as { metric: string }[];
    return rows.map(r => r.metric);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info({
      category: 'process',
      action: 'sqlite_queue_closed',
      message: 'SQLite task queue closed'
    });
  }

  /**
   * Backup database
   */
  backup(backupPath: string): void {
    this.db.backup(backupPath);
    logger.info({
      category: 'process',
      action: 'database_backed_up',
      message: `Database backed up to ${backupPath}`
    });
  }
}
