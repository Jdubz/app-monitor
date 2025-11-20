import { logger } from '../utils/logger.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { WorkerHealthMonitor } from './workerHealthMonitor.service.js';
// InteractiveSessionManager import removed - migrated to tmux-based TerminalService

export interface SystemLifecycleComponents {
  ephemeralWorkerService: EphemeralWorkerService;
  workerHealthMonitor: WorkerHealthMonitor;
  // interactiveSessionService removed - migrated to tmux-based TerminalService
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
   * Initialize the Dev-Bots system.
   * Called once after dependencies are ready to ensure automation never stops.
   */
  public initialize(): void {
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

}
