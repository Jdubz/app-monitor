/**
 * Task Repository
 * 
 * Extracted from TaskQueueService to follow Single Responsibility Principle.
 * Handles all database CRUD operations for tasks.
 * 
 * Part of P0 refactoring plan - Week 1: Extract Database Operations
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import type { Task, TaskStatus, TaskExecution } from '../services/taskQueue.sqlite.js';

export interface TaskFilters {
  status?: TaskStatus;
  assignedAgent?: string;
  chainId?: string;
  planId?: string;
  prNumber?: number;
  phaseIndex?: number;
}

export interface TaskUpdate {
  status?: TaskStatus;
  assignedWorker?: string;
  assignedAt?: number;
  startedAt?: number;
  completedAt?: number;
  output?: string;
  error?: string;
  phaseIndex?: number;
  phaseName?: string;
  phaseStatus?: string;
  phaseAttempts?: number;
  phasePayload?: string;
  retryCount?: number;
  agentType?: 'claude' | 'codex' | 'gemini';
  prNumber?: number;
  verificationPassed?: boolean;
  verificationResults?: string;
  verificationTimestamp?: number;
}

/**
 * Repository pattern for Task database operations
 */
export class TaskRepository {
  constructor(private db: Database.Database) {}

  /**
   * Execute operations within a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Find task by ID
   */
  findById(id: string): Task | null {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `);
    
    const row = stmt.get(id) as Task | undefined;
    if (!row) return null;
    
    return this.hydrateTask(row);
  }

  /**
   * Find all tasks matching filters
   */
  findAll(filters?: TaskFilters): Task[] {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: unknown[] = [];
    
    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters?.assignedAgent) {
      query += ' AND assigned_agent = ?';
      params.push(filters.assignedAgent);
    }
    
    if (filters?.chainId) {
      query += ' AND chain_id = ?';
      params.push(filters.chainId);
    }
    
    if (filters?.planId) {
      query += ' AND plan_id = ?';
      params.push(filters.planId);
    }
    
    if (filters?.prNumber) {
      query += ' AND pr_number = ?';
      params.push(filters.prNumber);
    }
    
    if (filters?.phaseIndex !== undefined) {
      query += ' AND phase_index = ?';
      params.push(filters.phaseIndex);
    }
    
    query += ' ORDER BY priority DESC, created_at ASC';
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Task[];
    
    return rows.map(row => this.hydrateTask(row));
  }

  /**
   * Find tasks by chain ID
   */
  findByChainId(chainId: string): Task[] {
    return this.findAll({ chainId });
  }

  /**
   * Find tasks by plan ID
   */
  findByPlanId(planId: string): Task[] {
    return this.findAll({ planId });
  }

  /**
   * Find tasks by status
   */
  findByStatus(status: TaskStatus): Task[] {
    return this.findAll({ status });
  }

  /**
   * Create a new task
   */
  create(taskData: Partial<Task>): Task {
    const now = Date.now();
    const generatedId = `task-${taskData.type || 'implementation'}-${randomUUID()}`;
    
    const chainId = taskData.chain_id || taskData.id || generatedId;
    
    const task: Task = {
      id: taskData.id || generatedId,
      type: taskData.type || 'implementation',
      title: taskData.title || 'Untitled Task',
      description: taskData.description,
      documentation: taskData.documentation,
      notes: taskData.notes,
      status: taskData.status || 'pending',
      priority: taskData.priority || 5,
      created_at: now,
      assigned_agent: taskData.assigned_agent || 'backend-specialist',
      prompt: taskData.prompt,
      can_retry: taskData.can_retry !== undefined ? taskData.can_retry : true,
      retry_count: 0,
      max_retries: taskData.max_retries || 3,
      timeout_ms: taskData.timeout_ms !== undefined ? taskData.timeout_ms : null,
      fingerprint: taskData.fingerprint,
      estimated_hours: taskData.estimated_hours,
      complexity: taskData.complexity,
      task_category: taskData.task_category,
      file_patterns: taskData.file_patterns,
      estimated_complexity: taskData.estimated_complexity,
      preferred_agent: taskData.preferred_agent,
      chain_status: taskData.chain_status || 'pending',
      chain_id: chainId,
      chain_depth: taskData.chain_depth || 0,
      phase_index: taskData.phase_index || 1,
      phase_name: taskData.phase_name || 'Planning',
      phase_status: taskData.phase_status || 'ready',
      phase_attempts: taskData.phase_attempts || 1,
      phase_payload: taskData.phase_payload || undefined,
      plan_id: taskData.plan_id
    };

    return this.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO tasks (
          id, type, title, description, documentation, notes, status, priority,
          created_at, assigned_agent, prompt, can_retry, retry_count, max_retries,
          timeout_ms, fingerprint, estimated_hours, complexity,
          task_category, file_patterns, estimated_complexity, preferred_agent,
          chain_status, chain_id, chain_depth,
          phase_index, phase_name, phase_status, phase_attempts, phase_payload,
          plan_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        task.id, task.type, task.title, task.description, task.documentation,
        task.notes, task.status, task.priority, task.created_at, task.assigned_agent,
        task.prompt, task.can_retry ? 1 : 0, task.retry_count, task.max_retries,
        task.timeout_ms, task.fingerprint, task.estimated_hours, task.complexity,
        task.task_category, task.file_patterns, task.estimated_complexity, task.preferred_agent,
        task.chain_status, task.chain_id, task.chain_depth,
        task.phase_index, task.phase_name, task.phase_status, task.phase_attempts, task.phase_payload,
        task.plan_id
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
        category: 'repository',
        action: 'task_created',
        message: `Created task ${task.id}: ${task.title}`
      });

      // Return hydrated task with all related data
      return this.hydrateTask(task);
    });
  }

  /**
   * Update a task
   */
  update(id: string, updates: TaskUpdate): Task | null {
    const task = this.findById(id);
    if (!task) return null;

    const setClauses: string[] = [];
    const params: unknown[] = [];

    // Map camelCase fields to snake_case database columns
    const fieldMap: Record<string, string> = {
      status: 'status',
      assignedWorker: 'assigned_worker',
      assignedAt: 'assigned_at',
      startedAt: 'started_at',
      completedAt: 'completed_at',
      output: 'output',
      error: 'error',
      phaseIndex: 'phase_index',
      phaseName: 'phase_name',
      phaseStatus: 'phase_status',
      phaseAttempts: 'phase_attempts',
      phasePayload: 'phase_payload',
      retryCount: 'retry_count',
      agentType: 'agent_type',
      prNumber: 'pr_number',
      verificationPassed: 'verification_passed',
      verificationResults: 'verification_results',
      verificationTimestamp: 'verification_timestamp'
    };

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbColumn = fieldMap[key];
        if (dbColumn) {
          setClauses.push(`${dbColumn} = ?`);
          // Handle boolean conversion for SQLite
          if (key === 'verificationPassed') {
            params.push(value ? 1 : 0);
          } else {
            params.push(value);
          }
        }
      }
    });

    if (setClauses.length === 0) {
      return task;
    }

    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE tasks
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...params);

    logger.info({
      category: 'repository',
      action: 'task_updated',
      message: `Updated task ${id}`,
      details: { updates: Object.keys(updates) }
    });

    return this.findById(id);
  }

  /**
   * Delete a task
   */
  delete(id: string): boolean {
    return this.transaction(() => {
      // Delete related data first
      this.db.prepare('DELETE FROM task_files WHERE task_id = ?').run(id);
      this.db.prepare('DELETE FROM task_criteria WHERE task_id = ?').run(id);
      this.db.prepare('DELETE FROM task_references WHERE task_id = ?').run(id);
      this.db.prepare('DELETE FROM task_validation_steps WHERE task_id = ?').run(id);
      this.db.prepare('DELETE FROM task_success_metrics WHERE task_id = ?').run(id);
      this.db.prepare('DELETE FROM task_executions WHERE task_id = ?').run(id);

      const result = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

      if (result.changes > 0) {
        logger.info({
          category: 'repository',
          action: 'task_deleted',
          message: `Deleted task ${id}`
        });
        return true;
      }

      return false;
    });
  }

  /**
   * Get task executions (execution history)
   */
  getExecutions(taskId: string): TaskExecution[] {
    const stmt = this.db.prepare(`
      SELECT * FROM task_executions
      WHERE task_id = ?
      ORDER BY started_at DESC
    `);
    
    return stmt.all(taskId) as TaskExecution[];
  }

  /**
   * Hydrate a task row with related data (files, criteria, etc.)
   */
  private hydrateTask(row: Task): Task {
    // Convert SQLite INTEGER (0/1) to boolean
    const task = {
      ...row,
      can_retry: Boolean(row.can_retry)
    };

    // Load related data
    const filesStmt = this.db.prepare('SELECT file_path FROM task_files WHERE task_id = ? ORDER BY id');
    const files = filesStmt.all(task.id) as Array<{ file_path: string }>;
    if (files.length > 0) {
      task.files = files.map(f => f.file_path);
    }

    const criteriaStmt = this.db.prepare('SELECT criterion FROM task_criteria WHERE task_id = ? ORDER BY sort_order');
    const criteria = criteriaStmt.all(task.id) as Array<{ criterion: string }>;
    if (criteria.length > 0) {
      task.acceptance_criteria = criteria.map(c => c.criterion);
    }

    const refsStmt = this.db.prepare('SELECT reference FROM task_references WHERE task_id = ? ORDER BY sort_order');
    const refs = refsStmt.all(task.id) as Array<{ reference: string }>;
    if (refs.length > 0) {
      task.architecture_references = refs.map(r => r.reference);
    }

    const validationStmt = this.db.prepare('SELECT step FROM task_validation_steps WHERE task_id = ? ORDER BY sort_order');
    const validationSteps = validationStmt.all(task.id) as Array<{ step: string }>;
    if (validationSteps.length > 0) {
      task.validation_steps = validationSteps.map(v => v.step);
    }

    const metricsStmt = this.db.prepare('SELECT metric FROM task_success_metrics WHERE task_id = ? ORDER BY sort_order');
    const metrics = metricsStmt.all(task.id) as Array<{ metric: string }>;
    if (metrics.length > 0) {
      task.success_metrics = metrics.map(m => m.metric);
    }

    return task;
  }
}
