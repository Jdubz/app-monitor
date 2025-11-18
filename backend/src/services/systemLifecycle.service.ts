import { logger } from '../utils/logger.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { WorkerHealthMonitor } from './workerHealthMonitor.service.js';
import type { InteractiveSessionManager } from './InteractiveSessionManager.js';

export interface SystemLifecycleComponents {
  ephemeralWorkerService: EphemeralWorkerService;
  workerHealthMonitor: WorkerHealthMonitor;
  interactiveSessionService: InteractiveSessionManager;
  taskQueueWorker?: { stop: () => Promise<void> };
  metricsEmitter?: { stop: () => void };
}

/**
 * Service responsible for system lifecycle management
 * Handles system start/stop operations and coordinates service lifecycle
 */
export class SystemLifecycleService {
  private isHealthy: boolean = false;

  constructor(
    private components: SystemLifecycleComponents,
    private emitEvent: (event: string, ...args: unknown[]) => void,
    private assignNextTask: () => void
  ) {}

  /**
   * Start the Dev-Bots system
   * Initializes health monitoring, clears workers, and assigns pending tasks
   */
  public startSystem(): void {
    if (this.isHealthy) {
      logger.info({
        category: 'process',
        action: 'claude_workers_system_is_already_running',
        message: 'Dev-Bots system is already running'
      });
      return;
    }

    this.isHealthy = true;

    // Clear any existing ephemeral workers
    this.components.ephemeralWorkerService.clearAllWorkers();

    // Start health monitoring
    this.components.workerHealthMonitor.start();

    this.emitEvent('systemStatusChange', 'running');
    logger.info({
      category: 'process',
      action: 'claude_workers_system_started_ephemeral_workers_wi',
      message: 'Dev-Bots system started - ephemeral workers will be created for tasks'
    });

    // Try to assign pending tasks
    this.assignNextTask();
  }

  /**
   * Stop the Dev-Bots system
   * Gracefully stops all services and cleans up active workers
   */
  public async stopSystem(): Promise<void> {
    if (!this.isHealthy) {
      logger.info({
        category: 'process',
        action: 'claude_workers_system_is_already_stopped',
        message: 'Dev-Bots system is already stopped'
      });
      return;
    }

    this.isHealthy = false;

    // Stop health monitoring
    this.components.workerHealthMonitor.stop();

    // Stop interactive session idle watchdog
    this.components.interactiveSessionService.stopIdleWatchdog();

    // Stop background task queue worker
    if (this.components.taskQueueWorker) {
      try {
        await this.components.taskQueueWorker.stop();
        logger.info({
          category: 'process',
          action: 'task_queue_worker_stopped',
          message: 'Background task queue worker stopped'
        });
      } catch (error) {
        logger.error({
          category: 'process',
          action: 'task_queue_worker_stop_failed',
          message: 'Failed to stop background task queue worker',
          error
        });
      }
    }

    // Stop metrics emitter
    if (this.components.metricsEmitter) {
      try {
        this.components.metricsEmitter.stop();
        logger.info({
          category: 'process',
          action: 'metrics_emitter_stopped',
          message: 'Metrics emitter stopped'
        });
      } catch (error) {
        logger.error({
          category: 'process',
          action: 'metrics_emitter_stop_failed',
          message: 'Failed to stop metrics emitter',
          error
        });
      }
    }

    // Stop all active ephemeral workers
    for (const worker of this.components.ephemeralWorkerService.getAllWorkers().values()) {
      if (worker.status !== 'destroyed') {
        // Mark task as failed and destroy container
        worker.task.status = 'failed';
        worker.task.error = 'System stopped';
        worker.task.completed_at = Date.now();
        worker.task.can_retry = true;

        // Destroy container
        await this.components.ephemeralWorkerService.destroyWorker(worker.id);
      }
    }

    this.components.ephemeralWorkerService.clearAllWorkers();

    this.emitEvent('systemStatusChange', 'stopped');
    logger.info({
      category: 'process',
      action: 'claude_workers_system_stopped_all_ephemeral_worker',
      message: 'Dev-Bots system stopped - all ephemeral workers terminated'
    });
  }

  /**
   * Check if the system is healthy
   */
  public isSystemHealthy(): boolean {
    return this.isHealthy;
  }

  /**
   * Set the system health state
   * Used by parent when managing health state from other operations
   */
  public setSystemHealth(healthy: boolean): void {
    this.isHealthy = healthy;
  }

  /**
   * Update components (for dynamic updates like taskQueueWorker)
   */
  public updateComponents(updates: Partial<SystemLifecycleComponents>): void {
    Object.assign(this.components, updates);
  }
}
