/**
 * Task Queue Manager
 * 
 * Manages task queue, execution, and lifecycle
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { TaskCreateSchema, TaskQuery, TaskStats } from '../types/taskSchema.js';
import type { Task, TaskCreate } from '../types/taskSchema.js';

export interface TaskQueueConfig {
  maxConcurrent: number;
  max_retries: number;
  retryDelay: number; // ms
  taskTimeout: number; // ms
}

export class TaskQueueManager extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private config: TaskQueueConfig;
  private activeTasks: Set<string> = new Set();
  private processingInterval?: NodeJS.Timeout;

  constructor(config: Partial<TaskQueueConfig> = {}) {
    super();
    
    this.config = {
      maxConcurrent: config.maxConcurrent || 3,
      max_retries: config.max_retries || 3,
      retryDelay: config.retryDelay || 5000,
      taskTimeout: config.taskTimeout || 300000, // 5 minutes
    };

    logger.info({
      category: 'process',
      action: 'task_queue_initialized',
      message: 'Task Queue Manager initialized',
      details: { config: this.config }
    });
  }

  /**
   * Create a new task
   */
  createTask(taskData: TaskCreate): Task {
    // Validate input
    const validated = TaskCreateSchema.parse(taskData);

    // Build task with SQLite-compatible types
    const task: Task = {
      id: uuidv4(),
      type: validated.type,
      title: validated.title,
      description: validated.description,
      status: 'pending' as const,
      priority: validated.priority || 5,
      created_at: Date.now(),
      assigned_agent: validated.assigned_agent || 'general',
      can_retry: true,
      retry_count: validated.retry_count || 0,
      max_retries: validated.max_retries || this.config.max_retries,
      timeout_ms: validated.timeout_ms || null,
      files: validated.files,
      dependencies: validated.dependencies,
      acceptance_criteria: validated.acceptance_criteria,
      architecture_references: validated.architecture_references,
      validation_steps: validated.validation_steps,
      success_metrics: validated.success_metrics,
      notes: validated.notes,
      documentation: validated.documentation,
      prompt: validated.prompt
    };

    this.tasks.set(task.id, task);

    logger.info({
      category: 'process',
      action: 'task_created',
      message: `Task created: ${task.title}`,
      details: { taskId: task.id, type: task.type }
    });

    this.emit('taskCreated', task);

    return task;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Update task
   */
  updateTask(taskId: string, updates: Partial<Task>): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn({
        category: 'process',
        action: 'task_not_found',
        message: `Task not found: ${taskId}`
      });
      return undefined;
    }

    // Apply updates directly without Zod validation (task already exists and is valid)
    const updatedTask: Task = { ...task, ...updates } as Task;

    this.tasks.set(taskId, updatedTask);

    logger.info({
      category: 'process',
      action: 'task_updated',
      message: `Task updated: ${updatedTask.title}`,
      details: { taskId, updates: Object.keys(updates) }
    });

    this.emit('taskUpdated', updatedTask);

    return updatedTask;
  }

  /**
   * Delete task
   */
  deleteTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    this.tasks.delete(taskId);
    this.activeTasks.delete(taskId);

    logger.info({
      category: 'process',
      action: 'task_deleted',
      message: `Task deleted: ${task.title}`,
      details: { taskId }
    });

    this.emit('taskDeleted', taskId);
    
    return true;
  }

  /**
   * Query tasks with filters
   */
  queryTasks(query: Partial<TaskQuery> = {}): Task[] {
    let tasks = Array.from(this.tasks.values());

    // Apply filters
    if (query.status) {
      tasks = tasks.filter(t => t.status === query.status);
    }
    if (query.type) {
      tasks = tasks.filter(t => t.type === query.type);
    }
    if (query.assigned_agent) {
      tasks = tasks.filter(t => t.assigned_agent === query.assigned_agent);
    }
    if (query.assigned_worker) {
      tasks = tasks.filter(t => t.assigned_worker === query.assigned_worker);
    }
    // project filter removed (property doesn't exist in Task)
    if (query.priority) {
      if (query.priority.min !== undefined) {
        tasks = tasks.filter(t => (t.priority || 5) >= query.priority!.min!);
      }
      if (query.priority.max !== undefined) {
        tasks = tasks.filter(t => (t.priority || 5) <= query.priority!.max!);
      }
    }
    if (query.created_after) {
      tasks = tasks.filter(t => t.created_at >= query.created_after!);
    }
    if (query.created_before) {
      tasks = tasks.filter(t => t.created_at <= query.created_before!);
    }

    // Sort
    const sortBy = query.sort_by || 'created_at';
    const sortOrder = query.sort_order || 'desc';

    tasks.sort((a, b) => {
      let aVal: string | number = a[sortBy as keyof Task] as string | number;
      let bVal: string | number = b[sortBy as keyof Task] as string | number;

      if (sortBy === 'created_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    
    return tasks.slice(offset, offset + limit);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get task statistics
   */
  getStats(): TaskStats {
    const tasks = this.getAllTasks();
    const completed = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');

    // Calculate average completion time
    let avgCompletionTime: number | undefined;
    if (completed.length > 0) {
      const totalTime = completed.reduce((sum, task) => {
        if (task.completed_at && task.created_at) {
          return sum + (new Date(task.completed_at).getTime() - new Date(task.created_at).getTime());
        }
        return sum;
      }, 0);
      avgCompletionTime = totalTime / completed.length;
    }

    // Calculate success rate
    const successRate = tasks.length > 0
      ? (completed.length / (completed.length + failed.length)) * 100
      : undefined;

    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      assigned: tasks.filter(t => t.status === 'running').length,
      active: tasks.filter(t => t.status === 'running').length,
      completed: completed.length,
      failed: failed.length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      timeout: tasks.filter(t => t.status === 'timeout').length,
      retrying: tasks.filter(t => t.status === 'pending').length,
      average_completion_time: avgCompletionTime,
      success_rate: successRate
    };
  }

  /**
   * Get next pending task by priority
   */
  getNextPendingTask(): Task | undefined {
    const pending = this.queryTasks({ status: 'pending' });
    
    if (pending.length === 0) {
      return undefined;
    }

    // Sort by priority (highest first), then by creation time (oldest first)
    pending.sort((a, b) => {
      const priorityDiff = (b.priority || 5) - (a.priority || 5);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return pending[0];
  }

  /**
   * Assign task to worker
   */
  assignTask(taskId: string, workerId: string, agentId: string): Task | undefined {
    const task = this.getTask(taskId);
    if (!task) return undefined;

    if (task.status !== 'pending') {
      logger.warn({
        category: 'process',
        action: 'task_assignment_failed',
        message: `Cannot assign task with status: ${task.status}`,
        details: { taskId, status: task.status }
      });
      return undefined;
    }

    return this.updateTask(taskId, {
      status: 'running',
      assigned_worker: workerId,
      assigned_agent: agentId,
      assigned_at: Date.now()
    });
  }

  /**
   * Start task execution
   */
  startTask(taskId: string): Task | undefined {
    const task = this.getTask(taskId);
    if (!task) return undefined;

    if (task.status !== 'running') {
      logger.warn({
        category: 'process',
        action: 'task_start_failed',
        message: `Cannot start task with status: ${task.status}`,
        details: { taskId, status: task.status }
      });
      return undefined;
    }

    this.activeTasks.add(taskId);

    return this.updateTask(taskId, {
      status: 'running',
    });
  }

  /**
   * Complete task successfully
   */
  completeTask(taskId: string, output?: string): Task | undefined {
    const task = this.getTask(taskId);
    if (!task) return undefined;

    this.activeTasks.delete(taskId);

    return this.updateTask(taskId, {
      status: 'completed',
      completed_at: Date.now(),
      output,
    });
  }

  /**
   * Fail task
   */
  failTask(taskId: string, error: string): Task | undefined {
    const task = this.getTask(taskId);
    if (!task) return undefined;

    this.activeTasks.delete(taskId);

    // Check if we should retry
    if (task.retry_count < (task.max_retries || this.config.max_retries)) {
      logger.info({
        category: 'process',
        action: 'task_retry_scheduled',
        message: `Task will be retried: ${task.title}`,
        details: { 
          taskId, 
          retry_count: task.retry_count + 1,
          max_retries: task.max_retries 
        }
      });

      return this.updateTask(taskId, {
        status: 'pending',
        error,
        retry_count: task.retry_count + 1
      });
    }

    return this.updateTask(taskId, {
      status: 'failed',
      completed_at: Date.now(),
      error
    });
  }

  /**
   * Retry task
   */
  retryTask(taskId: string): Task | undefined {
    const task = this.getTask(taskId);
    if (!task) return undefined;

    if (task.status !== 'failed') {
      logger.warn({
        category: 'process',
        action: 'task_retry_failed',
        message: `Cannot retry task with status: ${task.status}`,
        details: { taskId, status: task.status }
      });
      return undefined;
    }

    return this.updateTask(taskId, {
      status: 'pending',
      error: undefined,
      assigned_worker: undefined,
      assigned_at: undefined
    });
  }

  /**
   * Get active task count
   */
  getActiveCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Check if can accept more tasks
   */
  canAcceptMore(): boolean {
    return this.activeTasks.size < this.config.maxConcurrent;
  }

  /**
   * Clear all tasks
   */
  clearAll(): void {
    const count = this.tasks.size;
    this.tasks.clear();
    this.activeTasks.clear();

    logger.info({
      category: 'process',
      action: 'tasks_cleared',
      message: `Cleared ${count} tasks`
    });

    this.emit('tasksCleared');
  }
}
