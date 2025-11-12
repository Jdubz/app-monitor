/**
 * Cleanup Coordinator Service
 *
 * Coordinates cleanup operations and scope control tasks.
 * Handles emergency recovery, cleanup task creation, and violation tracking.
 */

import type { TaskQueueService, Task } from './taskQueue.sqlite.js';
import type { ScopeControlService } from './scopeControl.service.js';

export class CleanupCoordinator {
  constructor(
    private taskQueue: TaskQueueService,
    private scopeControl: ScopeControlService,
    private assignNextTask: () => Promise<void>
  ) {}

  /**
   * Get scope violations (stub for future implementation)
   */
  async getScopeViolations(): Promise<Array<{ taskId: string; violations: Array<{ type: string; severity: string }> }>> {
    // This would track scope violations - simplified for now
    return [];
  }

  /**
   * Trigger emergency recovery task
   * Creates high-priority recovery task to clean up scope creep
   */
  async triggerEmergencyRecovery(): Promise<Task> {
    const recoveryTask: Task = {
      id: `task-recovery-${Date.now()}`,
      type: 'recovery',
      title: 'Emergency Recovery Task',
      description: 'EMERGENCY RECOVERY: Clean up scope creep and restore system to stable state. DO NOT create new files. Only remove unnecessary code.',
      status: 'pending',
      created_at: Date.now(),
      assigned_agent: 'backend-specialist'
    } as unknown as Task;

    // TaskQueueService doesn't have unshift(), use createTask instead
    await this.taskQueue.createTask(recoveryTask);
    await this.assignNextTask();
    return recoveryTask;
  }

  /**
   * Get cleanup status including schedules and recent cleanup tasks
   */
  async getCleanupStatus(): Promise<{ schedules: string[]; recentTasks: Task[] }> {
    const completedTasks = this.taskQueue.getTasksByStatus('completed');
    const recentCleanupTasks = completedTasks
      .filter(t => t.type === 'cleanup')
      .slice(-10);

    return {
      schedules: this.scopeControl.checkCleanupSchedules(),
      recentTasks: recentCleanupTasks
    };
  }

  /**
   * Trigger cleanup task of specified type
   */
  async triggerCleanup(type: string): Promise<Task> {
    const cleanupTask = this.scopeControl.createCleanupTask(type, Date.now());
    await this.taskQueue.createTask(cleanupTask);
    await this.assignNextTask();
    return cleanupTask;
  }
}
