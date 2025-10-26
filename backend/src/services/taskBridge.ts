/**
 * Task Bridge Service
 * 
 * Bridges the TaskQueueManager with ClaudeWorkersManager
 * Provides bidirectional synchronization
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import type { TaskQueueManager } from './taskQueueManager.js';
import type { ClaudeWorkersManager } from './claudeWorkersManager.js';
import type { Task as QueueTask } from '../types/taskSchema.js';
import type { Task as ClaudeTask } from './claudeWorkersManager.js';

export interface TaskBridgeConfig {
  autoSync: boolean;
  syncInterval: number; // milliseconds
}

export class TaskBridge extends EventEmitter {
  private taskQueueManager: TaskQueueManager;
  private claudeWorkersManager: ClaudeWorkersManager;
  private config: TaskBridgeConfig;
  private syncInterval?: NodeJS.Timeout;
  private taskMapping: Map<string, string> = new Map(); // QueueTask.id -> ClaudeTask.id

  constructor(
    taskQueueManager: TaskQueueManager,
    claudeWorkersManager: ClaudeWorkersManager,
    config: Partial<TaskBridgeConfig> = {}
  ) {
    super();
    
    this.taskQueueManager = taskQueueManager;
    this.claudeWorkersManager = claudeWorkersManager;
    
    this.config = {
      autoSync: config.autoSync ?? true,
      syncInterval: config.syncInterval ?? 5000,
    };

    this.setupEventListeners();

    if (this.config.autoSync) {
      this.startAutoSync();
    }

    logger.info({
      category: 'process',
      action: 'task_bridge_initialized',
      message: 'Task Bridge initialized',
      details: { config: this.config }
    });
  }

  /**
   * Setup event listeners for bidirectional sync
   */
  private setupEventListeners(): void {
    // Listen to TaskQueueManager events
    this.taskQueueManager.on('taskCreated', (task: QueueTask) => {
      this.onQueueTaskCreated(task);
    });

    this.taskQueueManager.on('taskUpdated', (task: QueueTask) => {
      this.onQueueTaskUpdated(task);
    });

    // Listen to ClaudeWorkersManager events
    this.claudeWorkersManager.on('taskAdded', (task: ClaudeTask) => {
      this.onClaudeTaskAdded(task);
    });

    this.claudeWorkersManager.on('taskAssigned', (task: ClaudeTask) => {
      this.onClaudeTaskAssigned(task);
    });

    this.claudeWorkersManager.on('taskCompleted', (task: ClaudeTask) => {
      this.onClaudeTaskCompleted(task);
    });

    this.claudeWorkersManager.on('taskFailed', (task: ClaudeTask) => {
      this.onClaudeTaskFailed(task);
    });
  }

  /**
   * Handle queue task created - sync to Claude
   */
  private async onQueueTaskCreated(task: QueueTask): Promise<void> {
    try {
      // Create task in ClaudeWorkersManager
      const claudeTask = await this.claudeWorkersManager.addTask(
        task.type,
        task.title,
        task.documentation || '',
        task.description || '',
        {
          files: task.files,
          dependencies: task.dependencies,
          repository: task.project,
          assignedAgent: task.assignedAgent,
          notes: task.notes,
        }
      );

      // Store mapping
      this.taskMapping.set(task.id, claudeTask.id);

      logger.info({
        category: 'process',
        action: 'task_synced_to_claude',
        message: `Task ${task.id} synced to Claude as ${claudeTask.id}`,
        details: { queueTaskId: task.id, claudeTaskId: claudeTask.id }
      });

      this.emit('taskSynced', { queueTask: task, claudeTask });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'task_sync_error',
        message: 'Failed to sync task to Claude',
        error
      });
    }
  }

  /**
   * Handle queue task updated - sync to Claude
   */
  private onQueueTaskUpdated(task: QueueTask): void {
    const claudeTaskId = this.taskMapping.get(task.id);
    if (!claudeTaskId) {
      logger.debug({
        category: 'process',
        action: 'task_not_mapped',
        message: `Queue task ${task.id} has no Claude mapping, skipping update`
      });
      return;
    }

    // Claude tasks are managed by ClaudeWorkersManager
    // We mainly sync status changes
    logger.debug({
      category: 'process',
      action: 'task_updated',
      message: `Queue task ${task.id} updated (Claude: ${claudeTaskId})`,
      details: { status: task.status }
    });
  }

  /**
   * Handle Claude task added - already in queue, just log
   */
  private onClaudeTaskAdded(task: ClaudeTask): void {
    logger.debug({
      category: 'process',
      action: 'claude_task_added',
      message: `Claude task ${task.id} added`
    });
  }

  /**
   * Handle Claude task assigned - update queue
   */
  private onClaudeTaskAssigned(task: ClaudeTask): void {
    const queueTaskId = this.getQueueTaskId(task.id);
    if (!queueTaskId) return;

    const queueTask = this.taskQueueManager.getTask(queueTaskId);
    if (!queueTask) return;

    // Update queue task
    this.taskQueueManager.updateTask(queueTaskId, {
      status: 'assigned',
      assignedWorker: task.assignedWorker,
      assignedAgent: task.assignedAgent,
      assignedAt: task.assignedAt,
    });

    logger.info({
      category: 'process',
      action: 'task_assigned',
      message: `Task ${task.id} assigned to ${task.assignedWorker}`,
      details: { queueTaskId, claudeTaskId: task.id }
    });
  }

  /**
   * Handle Claude task completed - update queue
   */
  private onClaudeTaskCompleted(task: ClaudeTask): void {
    const queueTaskId = this.getQueueTaskId(task.id);
    if (!queueTaskId) return;

    const queueTask = this.taskQueueManager.getTask(queueTaskId);
    if (!queueTask) return;

    // Update queue task
    this.taskQueueManager.updateTask(queueTaskId, {
      status: 'completed',
      completedAt: task.completedAt,
      output: task.output,
      exitCode: task.exitCode,
    });

    logger.info({
      category: 'process',
      action: 'task_completed',
      message: `Task ${task.id} completed`,
      details: { queueTaskId, claudeTaskId: task.id }
    });
  }

  /**
   * Handle Claude task failed - update queue
   */
  private onClaudeTaskFailed(task: ClaudeTask): void {
    const queueTaskId = this.getQueueTaskId(task.id);
    if (!queueTaskId) return;

    const queueTask = this.taskQueueManager.getTask(queueTaskId);
    if (!queueTask) return;

    // Update queue task
    this.taskQueueManager.updateTask(queueTaskId, {
      status: 'failed',
      completedAt: task.completedAt,
      error: task.error,
      exitCode: task.exitCode,
    });

    logger.info({
      category: 'process',
      action: 'task_failed',
      message: `Task ${task.id} failed`,
      details: { queueTaskId, claudeTaskId: task.id, error: task.error }
    });
  }

  /**
   * Get queue task ID from Claude task ID
   */
  private getQueueTaskId(claudeTaskId: string): string | undefined {
    for (const [queueId, claudeId] of this.taskMapping.entries()) {
      if (claudeId === claudeTaskId) {
        return queueId;
      }
    }
    return undefined;
  }

  /**
   * Start automatic synchronization
   */
  private startAutoSync(): void {
    this.syncInterval = setInterval(() => {
      this.syncTasks();
    }, this.config.syncInterval);

    logger.info({
      category: 'process',
      action: 'auto_sync_started',
      message: `Task auto-sync started (interval: ${this.config.syncInterval}ms)`
    });
  }

  /**
   * Stop automatic synchronization
   */
  public stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;

      logger.info({
        category: 'process',
        action: 'auto_sync_stopped',
        message: 'Task auto-sync stopped'
      });
    }
  }

  /**
   * Manual synchronization
   */
  public async syncTasks(): Promise<void> {
    try {
      // Get all tasks from both systems
      // const _queueTasks = this.taskQueueManager.getAllTasks();
      const claudeTasksObj = await this.claudeWorkersManager.getTasks();
      
      // Flatten all claude tasks into a single array
      const claudeTasks = [
        ...claudeTasksObj.pending,
        ...claudeTasksObj.active,
        ...claudeTasksObj.completed
      ];

      // Sync status updates from Claude to Queue
      for (const claudeTask of claudeTasks) {
        const queueTaskId = this.getQueueTaskId(claudeTask.id);
        if (!queueTaskId) continue;

        const queueTask = this.taskQueueManager.getTask(queueTaskId);
        if (!queueTask) continue;

        // Only sync if status changed
        if (this.shouldSyncStatus(queueTask, claudeTask)) {
          this.taskQueueManager.updateTask(queueTaskId, {
            status: this.mapClaudeStatus(claudeTask.status),
            assignedWorker: claudeTask.assignedWorker,
            completedAt: claudeTask.completedAt,
            output: claudeTask.output,
            error: claudeTask.error,
            exitCode: claudeTask.exitCode,
          });

          logger.debug({
            category: 'process',
            action: 'task_synced',
            message: `Synced task ${queueTaskId} status: ${claudeTask.status}`
          });
        }
      }
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'sync_error',
        message: 'Failed to sync tasks',
        error
      });
    }
  }

  /**
   * Check if status should be synced
   */
  private shouldSyncStatus(queueTask: QueueTask, claudeTask: ClaudeTask): boolean {
    const mappedStatus = this.mapClaudeStatus(claudeTask.status);
    return queueTask.status !== mappedStatus;
  }

  /**
   * Map Claude task status to Queue task status
   */
  private mapClaudeStatus(
    claudeStatus: ClaudeTask['status']
  ): QueueTask['status'] {
    const mapping: Record<ClaudeTask['status'], QueueTask['status']> = {
      'pending': 'pending',
      'assigned': 'assigned',
      'active': 'active',
      'completed': 'completed',
      'failed': 'failed',
      'retrying': 'retrying',
    };
    return mapping[claudeStatus] || 'pending';
  }

  /**
   * Get sync statistics
   */
  public getStats(): {
    mappedTasks: number;
    queueTasks: number;
    claudeTasks: number;
    autoSync: boolean;
  } {
    return {
      mappedTasks: this.taskMapping.size,
      queueTasks: this.taskQueueManager.getAllTasks().length,
      claudeTasks: this.claudeWorkersManager.getTasks().length,
      autoSync: this.config.autoSync && !!this.syncInterval,
    };
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.stopAutoSync();
    this.removeAllListeners();
    this.taskMapping.clear();

    logger.info({
      category: 'process',
      action: 'task_bridge_destroyed',
      message: 'Task Bridge destroyed'
    });
  }
}
