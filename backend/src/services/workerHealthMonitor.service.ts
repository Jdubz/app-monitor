/**
 * Worker Health Monitor Service
 *
 * Extracted from DevBotsManager to handle worker health monitoring,
 * long-running task detection, and cleanup scheduling.
 *
 * Responsibilities:
 * - Monitor worker heartbeats (currently disabled for ephemeral containers)
 * - Detect and cleanup long-running/stuck tasks
 * - Check worker health status
 * - Schedule and trigger cleanup tasks
 */

import { logger } from '../utils/logger.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { TaskQueueService } from './taskQueue.sqlite.js';
import type { DockerManager } from './dockerManager.js';
import type { ScopeControlService } from './scopeControl.service.js';
import { TIME_BASED_GUARDS } from './taskFailureGuards.js';
import { HEARTBEAT_TIMEOUT_MS } from '../constants/timeouts.js';

export interface WorkerHealthMonitorConfig {
  heartbeatCheckInterval: number;  // Currently disabled
  longRunningCheckInterval: number;  // Default: 5 minutes
  softTimeoutMs: number;  // Warn after this time
  hardTimeoutMs: number;  // Force fail after this time
  healthCheckInterval: number;  // Default: 5 seconds
  cleanupCheckInterval: number;  // Default: 1 minute
}

export class WorkerHealthMonitor {
  private heartbeatInterval?: NodeJS.Timeout;
  private longRunningInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private isHealthy: boolean = false;

  constructor(
    private ephemeralWorkerService: EphemeralWorkerService,
    private taskQueue: TaskQueueService,
    private dockerManager: DockerManager,
    private scopeControl: ScopeControlService,
    private processManager: null,  // Removed - no longer needed
    private recovery: unknown | null,
    private emit: (event: string, ...args: unknown[]) => void,
    private config: WorkerHealthMonitorConfig = {
      heartbeatCheckInterval: 60000,  // 1 minute (disabled)
      longRunningCheckInterval: 60000,  // 1 minute (was 5 minutes)
      softTimeoutMs: TIME_BASED_GUARDS.SOFT_TIMEOUT_MS,
      hardTimeoutMs: TIME_BASED_GUARDS.ABSOLUTE_MAX_DURATION_MS,
      healthCheckInterval: 5000,  // 5 seconds
      cleanupCheckInterval: 60000  // 1 minute
    }
  ) {}

  /**
   * Start all monitoring loops
   */
  start(): void {
    this.startHeartbeatMonitor();
    this.startLongRunningTaskMonitor();
    this.startHealthCheck();
    this.startCleanupScheduler();

    logger.info({
      category: 'process',
      action: 'monitor_started',
      message: 'Worker health monitor started',
      details: {
        longRunningCheckInterval_ms: this.config.longRunningCheckInterval,
        softTimeout_minutes: this.config.softTimeoutMs / 60000,
        hardTimeout_minutes: this.config.hardTimeoutMs / 60000,
        healthCheckInterval_ms: this.config.healthCheckInterval,
        cleanupCheckInterval_ms: this.config.cleanupCheckInterval
      }
    });
  }

  /**
   * Stop all monitoring loops
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    if (this.longRunningInterval) {
      clearInterval(this.longRunningInterval);
      this.longRunningInterval = undefined;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    logger.info({
      category: 'process',
      action: 'monitor_stopped',
      message: 'Worker health monitor stopped'
    });
  }

  /**
   * Check if monitoring is healthy
   */
  isMonitorHealthy(): boolean {
    return this.isHealthy;
  }

  /**
   * Monitor worker heartbeats
   * 
   * CRITICAL: Docker process.on('close') is NOT reliable - containers can exit
   * without triggering the event, leaving tasks stuck. Heartbeat monitoring
   * provides a failsafe to detect and recover from these situations.
   */
  private startHeartbeatMonitor(): void {
    this.heartbeatInterval = setInterval(() => {
      const stalledWorkers = this.taskQueue.detectStalledWorkers();
      if (stalledWorkers.length > 0) {
        logger.warn({
          category: 'process',
          action: 'stalled_workers_detected',
          message: `Detected ${stalledWorkers.length} stalled workers (heartbeat timeout)`,
          details: { stalledWorkers }
        });

        // Trigger task reassignment
        for (let i = 0; i < stalledWorkers.length; i++) {
          this.emit('stalledWorkerDetected', stalledWorkers[i]);
        }
      }
    }, this.config.heartbeatCheckInterval);

    logger.info({
      category: 'process',
      action: 'heartbeat_monitor_started',
      message: `Worker heartbeat monitor started (check interval: ${this.config.heartbeatCheckInterval / 1000}s, timeout: ${HEARTBEAT_TIMEOUT_MS / 1000}s)`,
      details: {
        checkInterval_ms: this.config.heartbeatCheckInterval,
        timeout_ms: HEARTBEAT_TIMEOUT_MS
      }
    });
  }

  /**
   * Monitor long-running tasks and auto-cleanup stuck tasks
   */
  private startLongRunningTaskMonitor(): void {
    this.longRunningInterval = setInterval(async () => {
      // Soft timeout warning (30 minutes)
      const longRunning = this.taskQueue.detectLongRunningTasks(this.config.softTimeoutMs);
      if (longRunning.length > 0) {
        logger.warn({
          category: 'process',
          action: 'long_running_tasks_detected',
          message: `Found ${longRunning.length} tasks running longer than ${this.config.softTimeoutMs / 60000} minutes`,
          details: longRunning.map(task => ({
            id: task.id,
            title: task.title,
            duration: task.duration_ms,
            durationMinutes: Math.round(task.duration_ms / 60000)
          })) as unknown as Record<string, unknown>
        });
      }

      // Hard timeout - force cleanup (1 hour)
      const stuck = this.taskQueue.detectLongRunningTasks(this.config.hardTimeoutMs);
      if (stuck.length > 0) {
        logger.error({
          category: 'process',
          action: 'stuck_tasks_detected_auto_cleanup',
          message: `Found ${stuck.length} tasks stuck for >${this.config.hardTimeoutMs / 60000} minutes. Auto-failing and cleaning up.`,
          details: stuck.map(task => ({
            id: task.id,
            title: task.title,
            duration: task.duration_ms,
            durationHours: Math.round(task.duration_ms / 3600000)
          })) as unknown as Record<string, unknown>
        });

        // Cleanup each stuck task
        for (const task of stuck) {
          await this.cleanupStuckTask(task);
        }
      }
    }, this.config.longRunningCheckInterval);

    logger.info({
      category: 'process',
      action: 'long_running_task_monitor_started',
      message: `Task monitor started - Soft warn: ${this.config.softTimeoutMs / 60000}min, Hard fail: ${this.config.hardTimeoutMs / 60000}min`,
      details: {
        checkInterval_ms: this.config.longRunningCheckInterval,
        softTimeout_minutes: this.config.softTimeoutMs / 60000,
        hardTimeout_minutes: this.config.hardTimeoutMs / 60000
      }
    });
  }

  /**
   * Cleanup a stuck task
   */
  private async cleanupStuckTask(task: { id: string; title: string; started_at: number; duration_ms: number }): Promise<void> {
    try {
      // Force kill any Docker containers for this task
      await this.ephemeralWorkerService.cleanupStuckTaskContainers(task.id);

      // Get full task details to check for error
      const fullTask = this.taskQueue.getTask(task.id);
      if (!fullTask) {
        logger.warn({
          category: 'process',
          action: 'stuck_task_not_found',
          message: `Stuck task ${task.id} not found in database`
        });
        return;
      }

      // Check if task has an existing error that indicates a failure pattern
      const taskError = fullTask.error || '';
      const { detectFailurePattern } = await import('./taskFailureGuards.js');
      const failurePattern = detectFailurePattern(taskError, '', 0);

      if (failurePattern && this.recovery) {
        logger.info({
          category: 'process',
          action: 'stuck_task_has_failure_pattern',
          message: `Stuck task ${task.id} has detectable failure pattern: ${failurePattern.name}`,
          details: {
            taskId: task.id,
            pattern: failurePattern.name,
            category: failurePattern.category
          }
        });

        // Recovery is now handled by phase execution service
      }

      // Mark task as failed in database
      this.taskQueue.failTask(
        task.id,
        `Task stuck for ${Math.round(task.duration_ms / 60000)} minutes (exceeded ${this.config.hardTimeoutMs / 60000}min timeout). Auto-failed by failure guard.`
      );

      logger.info({
        category: 'process',
        action: 'stuck_task_cleaned_up',
        message: `Successfully cleaned up stuck task ${task.id}`,
        details: {
          taskId: task.id,
          duration_minutes: Math.round(task.duration_ms / 60000),
          cleanup_reason: 'ABSOLUTE_MAX_DURATION_EXCEEDED',
          hadFailurePattern: failurePattern?.name || 'none'
        }
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'stuck_task_cleanup_failed',
        message: `Failed to cleanup stuck task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Periodic health check
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkWorkerHealth();
    }, this.config.healthCheckInterval);
  }

  /**
   * Check worker health status
   */
  async checkWorkerHealth(): Promise<boolean> {
    try {
      const wasHealthy = this.isHealthy;

      // Check Docker health instead of process manager (processManager removed)
      try {
        const ping = await this.dockerManager.getDocker().ping();
        this.isHealthy = !!ping;
      } catch (_error) {
        this.isHealthy = false;
      }

      if (wasHealthy !== this.isHealthy) {
        this.emit('coordinatorHealthChange', this.isHealthy);
        logger.info({
          category: 'process',
          action: 'health_status_changed',
          message: `Worker health changed: ${this.isHealthy ? 'healthy' : 'unhealthy'}`
        });
      }

      return this.isHealthy;
    } catch (error) {
      const wasHealthy = this.isHealthy;
      this.isHealthy = false;

      if (wasHealthy !== this.isHealthy) {
        this.emit('coordinatorHealthChange', this.isHealthy);
        logger.warn({
          category: 'process',
          action: 'health_check_failed',
          message: 'Worker health check failed',
          details: { error }
        });
      }

      return false;
    }
  }

  /**
   * Start cleanup scheduler
   */
  private startCleanupScheduler(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.checkCleanupSchedules();
    }, this.config.cleanupCheckInterval);
  }

  /**
   * Check and schedule cleanup tasks
   */
  private async checkCleanupSchedules(): Promise<void> {
    try {
      // Remove phantom workers whose containers have disappeared so UI stays accurate
      const pruned = await this.ephemeralWorkerService.pruneStaleWorkers();
      if (pruned.length > 0) {
        for (const worker of pruned) {
          const reason = worker.reason === 'missing_container'
            ? 'Worker container disappeared'
            : `Worker container exited (state=${worker.containerState || 'unknown'})`;
          this.taskQueue.markWorkerMissing(worker.workerId, worker.taskId, reason);
        }
      }

      // Proactively clean up any untracked dev-bot containers to prevent orphans
      await this.ephemeralWorkerService.reconcileOrphanedDevBotContainers();

      const dueTasks = this.scopeControl.checkCleanupSchedules();
      for (const taskType of dueTasks) {
        const cleanupTask = this.scopeControl.createCleanupTask(taskType, Date.now());
        await this.taskQueue.createTask(cleanupTask);
        logger.info({
          category: 'process',
          action: 'cleanup_scheduled',
          message: `Scheduled ${taskType} cleanup task: ${cleanupTask.id}`
        });
      }
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'cleanup_check_failed',
        message: 'Failed to check cleanup schedules',
        error: error
      });
    }
  }
}
