/**
 * Task Queue Manager
 *
 * Manages task queue, execution, and lifecycle
 */

import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";
import {
  TaskSchema,
  TaskCreateSchema,
  TaskQuery,
  TaskStats,
} from "../types/taskSchema.js";
import type { Task, TaskCreate } from "../types/taskSchema.js";

export interface TaskQueueConfig {
  maxConcurrent: number;
  maxRetries: number;
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
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000,
      taskTimeout: config.taskTimeout || 300000, // 5 minutes
    };

    logger.info({
      category: "process",
      action: "task_queue_initialized",
      message: "Task Queue Manager initialized",
      details: { config: this.config },
    });
  }

  /**
   * Create a new task
   */
  createTask(taskData: TaskCreate): Task {
    // Validate input
    const validated = TaskCreateSchema.parse(taskData);

    const task: Task = {
      id: uuidv4(),
      ...validated,
      status: "pending",
      createdAt: new Date().toISOString(),
      retryCount: validated.retryCount || 0,
      maxRetries: validated.maxRetries || this.config.maxRetries,
      priority: validated.priority || 5,
      assignedAgent: validated.assignedAgent || "general",
    };

    // Validate full task
    const validatedTask = TaskSchema.parse(task);

    this.tasks.set(validatedTask.id, validatedTask);

    logger.info({
      category: "process",
      action: "task_created",
      message: `Task created: ${validatedTask.title}`,
      details: { taskId: validatedTask.id, type: validatedTask.type },
    });

    this.emit("taskCreated", validatedTask);

    return validatedTask;
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
        category: "process",
        action: "task_not_found",
        message: `Task not found: ${taskId}`,
      });
      return undefined;
    }

    const updatedTask = { ...task, ...updates };

    // Validate updated task
    try {
      const validated = TaskSchema.parse(updatedTask);
      this.tasks.set(taskId, validated);

      logger.info({
        category: "process",
        action: "task_updated",
        message: `Task updated: ${validated.title}`,
        details: { taskId, updates: Object.keys(updates) },
      });

      this.emit("taskUpdated", validated);

      return validated;
    } catch (error) {
      logger.error({
        category: "process",
        action: "task_update_failed",
        message: "Task update validation failed",
        error,
      });
      return undefined;
    }
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
      category: "process",
      action: "task_deleted",
      message: `Task deleted: ${task.title}`,
      details: { taskId },
    });

    this.emit("taskDeleted", taskId);

    return true;
  }

  /**
   * Query tasks with filters
   */
  queryTasks(query: Partial<TaskQuery> = {}): Task[] {
    let tasks = Array.from(this.tasks.values());

    // Apply filters
    if (query.status) {
      tasks = tasks.filter((t) => t.status === query.status);
    }
    if (query.type) {
      tasks = tasks.filter((t) => t.type === query.type);
    }
    if (query.assignedAgent) {
      tasks = tasks.filter((t) => t.assignedAgent === query.assignedAgent);
    }
    if (query.assignedWorker) {
      tasks = tasks.filter((t) => t.assignedWorker === query.assignedWorker);
    }
    if (query.project) {
      tasks = tasks.filter((t) => t.project === query.project);
    }
    if (query.priority) {
      if (query.priority.min !== undefined) {
        tasks = tasks.filter((t) => (t.priority || 5) >= query.priority!.min!);
      }
      if (query.priority.max !== undefined) {
        tasks = tasks.filter((t) => (t.priority || 5) <= query.priority!.max!);
      }
    }
    if (query.createdAfter) {
      tasks = tasks.filter(
        (t) => new Date(t.createdAt) >= new Date(query.createdAfter!),
      );
    }
    if (query.createdBefore) {
      tasks = tasks.filter(
        (t) => new Date(t.createdAt) <= new Date(query.createdBefore!),
      );
    }

    // Sort
    const sortBy = query.sortBy || "createdAt";
    const sortOrder = query.sortOrder || "desc";

    tasks.sort((a, b) => {
      let aVal: string | number = a[sortBy as keyof Task] as string | number;
      let bVal: string | number = b[sortBy as keyof Task] as string | number;

      if (sortBy === "createdAt") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (sortOrder === "asc") {
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
    const completed = tasks.filter((t) => t.status === "completed");
    const failed = tasks.filter((t) => t.status === "failed");

    // Calculate average completion time
    let avgCompletionTime: number | undefined;
    if (completed.length > 0) {
      const totalTime = completed.reduce((sum, task) => {
        if (task.completedAt && task.createdAt) {
          return (
            sum +
            (new Date(task.completedAt).getTime() -
              new Date(task.createdAt).getTime())
          );
        }
        return sum;
      }, 0);
      avgCompletionTime = totalTime / completed.length;
    }

    // Calculate success rate
    const successRate =
      tasks.length > 0
        ? (completed.length / (completed.length + failed.length)) * 100
        : undefined;

    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === "pending").length,
      assigned: tasks.filter((t) => t.status === "assigned").length,
      active: tasks.filter((t) => t.status === "active").length,
      completed: completed.length,
      failed: failed.length,
      retrying: tasks.filter((t) => t.status === "retrying").length,
      averageCompletionTime: avgCompletionTime,
      successRate,
    };
  }

  /**
   * Get next pending task by priority
   */
  getNextPendingTask(): Task | undefined {
    const pending = this.queryTasks({ status: "pending" });

    if (pending.length === 0) {
      return undefined;
    }

    // Sort by priority (highest first), then by creation time (oldest first)
    pending.sort((a, b) => {
      const priorityDiff = (b.priority || 5) - (a.priority || 5);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return pending[0];
  }

  /**
   * Assign task to worker
   */
  assignTask(
    taskId: string,
    workerId: string,
    agentId: string,
  ): Task | undefined {
    const task = this.getTask(taskId);
    if (!task) return undefined;

    if (task.status !== "pending" && task.status !== "retrying") {
      logger.warn({
        category: "process",
        action: "task_assignment_failed",
        message: `Cannot assign task with status: ${task.status}`,
        details: { taskId, status: task.status },
      });
      return undefined;
    }

    return this.updateTask(taskId, {
      status: "assigned",
      assignedWorker: workerId,
      assignedAgent: agentId,
      assignedAt: new Date().toISOString(),
    });
  }

  /**
   * Start task execution
   */
  startTask(taskId: string): Task | undefined {
    const task = this.getTask(taskId);
    if (!task) return undefined;

    if (task.status !== "assigned") {
      logger.warn({
        category: "process",
        action: "task_start_failed",
        message: `Cannot start task with status: ${task.status}`,
        details: { taskId, status: task.status },
      });
      return undefined;
    }

    this.activeTasks.add(taskId);

    return this.updateTask(taskId, {
      status: "active",
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
      status: "completed",
      completedAt: new Date().toISOString(),
      output,
    });
  }

  /**
   * Fail task
   */
  failTask(taskId: string, error: string, exitCode?: number): Task | undefined {
    const task = this.getTask(taskId);
    if (!task) return undefined;

    this.activeTasks.delete(taskId);

    // Check if we should retry
    if (task.retryCount < (task.maxRetries || this.config.maxRetries)) {
      logger.info({
        category: "process",
        action: "task_retry_scheduled",
        message: `Task will be retried: ${task.title}`,
        details: {
          taskId,
          retryCount: task.retryCount + 1,
          maxRetries: task.maxRetries,
        },
      });

      return this.updateTask(taskId, {
        status: "retrying",
        error,
        exitCode,
        retryCount: task.retryCount + 1,
      });
    }

    return this.updateTask(taskId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error,
      exitCode,
    });
  }

  /**
   * Retry task
   */
  retryTask(taskId: string): Task | undefined {
    const task = this.getTask(taskId);
    if (!task) return undefined;

    if (task.status !== "failed" && task.status !== "retrying") {
      logger.warn({
        category: "process",
        action: "task_retry_failed",
        message: `Cannot retry task with status: ${task.status}`,
        details: { taskId, status: task.status },
      });
      return undefined;
    }

    return this.updateTask(taskId, {
      status: "pending",
      error: undefined,
      exitCode: undefined,
      assignedWorker: undefined,
      assignedAt: undefined,
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
      category: "process",
      action: "tasks_cleared",
      message: `Cleared ${count} tasks`,
    });

    this.emit("tasksCleared");
  }
}
