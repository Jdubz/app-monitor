import { logger } from '../utils/logger.js';
import type { DockerManager, DockerValidationResult } from './dockerManager.js';
import type { TaskQueueService } from './taskQueue.sqlite.js';
import type { TaskExecutionService } from './taskExecution.service.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { InteractiveSessionManager } from './InteractiveSessionManager.js';
import type { SystemLifecycleService } from './systemLifecycle.service.js';
import { MetricsEmitter } from './metricsEmitter.js';

export interface InitializationComponents {
  dockerManager: DockerManager;
  taskQueue: TaskQueueService;
  taskExecutionService: TaskExecutionService;
  ephemeralWorkerService: EphemeralWorkerService;
  interactiveSessionService: InteractiveSessionManager;
  systemLifecycleService: SystemLifecycleService;
}

/**
 * Service responsible for system initialization
 * Handles Docker validation, orphaned task recovery, and background service startup
 */
export class SystemInitializationService {
  private dockerValidationResult?: DockerValidationResult;
  private taskQueueWorker?: { start: () => Promise<void>; stop: () => Promise<void> };
  private metricsEmitter?: MetricsEmitter;

  constructor(
    private components: InitializationComponents,
    private emitEvent: (event: string, ...args: unknown[]) => void,
    private endInteractiveSession: (sessionId: string, reason: string) => Promise<void>
  ) {}

  /**
   * Initialize and validate Docker environment
   */
  async initializeDockerEnvironment(): Promise<void> {
    try {
      logger.info({
        category: 'process',
        action: 'validating_docker_environment',
        message: 'Validating Docker environment...'
      });
      this.dockerValidationResult = await this.components.dockerManager.validateDockerEnvironment();

      if (!this.dockerValidationResult.isValid) {
        logger.error({
          category: 'process',
          action: 'docker_validation_failed',
          message: 'Docker validation failed',
          details: { errors: this.dockerValidationResult.errors }
        });
        this.emitEvent('dockerError', {
          type: 'validation_failed',
          errors: this.dockerValidationResult.errors,
          message: 'Docker environment validation failed. Dev-Bots cannot start.'
        });
        return;
      }

      // Log warnings if any
      if (this.dockerValidationResult.warnings.length > 0) {
        logger.warn({
          category: 'process',
          action: 'docker_validation_warnings',
          message: 'Docker validation warnings',
          details: { warnings: this.dockerValidationResult.warnings }
        });
        this.emitEvent('dockerWarning', {
          warnings: this.dockerValidationResult.warnings
        });
      }

      // Ensure required images are available
      logger.info({
        category: 'process',
        action: 'checking_required_docker_images',
        message: 'Checking required Docker images...'
      });
      const imageResult = await this.components.dockerManager.ensureRequiredImages();

      if (!imageResult.success) {
        logger.error({
          category: 'process',
          action: 'required_docker_images_not_available',
          message: 'Required Docker images not available',
          details: { errors: imageResult.errors }
        });
        this.emitEvent('dockerError', {
          type: 'images_missing',
          errors: imageResult.errors,
          message: 'Required Docker images are not available'
        });
        return;
      }

      logger.info({
        category: 'process',
        action: 'docker_environment_validated_successfully',
        message: 'Docker environment validated successfully',
        details: { info: this.dockerValidationResult.info }
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_initialize_docker_environment',
        message: 'Failed to initialize Docker environment:',
        error: error
      });
      this.emitEvent('dockerError', {
        type: 'initialization_failed',
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to initialize Docker environment'
      });
    }
  }

  /**
   * Initialize async components (orphaned task recovery)
   */
  async initializeAsync(): Promise<void> {
    // Recover orphaned tasks from previous server crash/restart
    const orphanedTaskIds = this.components.taskQueue.recoverOrphanedTasks();

    if (orphanedTaskIds.length > 0) {
      logger.warn({
        category: 'recovery',
        action: 'orphaned_tasks_recovered_on_startup',
        message: `Recovered ${orphanedTaskIds.length} orphaned tasks on startup`,
        details: {
          taskIds: orphanedTaskIds,
          willAttemptRecovery: true
        }
      });

      // Note: Orphaned tasks are marked as failed during recoverOrphanedTasks()
      // Recovery will be handled by the normal task execution flow if configured
    }

    logger.info({
      category: 'process',
      action: 'async_initialization_complete',
      message: 'Async initialization complete: orphaned task recovery finished'
    });

    // Start background task queue worker
    await this.startTaskQueueWorker();

    // Start metrics emitter
    this.startMetricsEmitter();

    // Start interactive session idle watchdog
    this.startInteractiveIdleWatchdog();

    // Always start the dev-bots system after initialization
    this.components.systemLifecycleService.startSystem();
  }

  /**
   * Start background task queue worker
   */
  private async startTaskQueueWorker(): Promise<void> {
    try {
      // Dynamically import to avoid circular dependency
      const { TaskQueueWorker } = await import('./taskQueueWorker.js');

      this.taskQueueWorker = new TaskQueueWorker(this.components.taskExecutionService, {
        pollIntervalMs: 5000, // Poll every 5 seconds
        enabled: true,
        maxConsecutiveFailures: 10
      });

      await this.taskQueueWorker.start();

      // Update SystemLifecycleService with taskQueueWorker reference
      this.components.systemLifecycleService.updateComponents({ taskQueueWorker: this.taskQueueWorker });

      logger.info({
        category: 'process',
        action: 'task_queue_worker_started',
        message: 'Background task queue worker started successfully'
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'task_queue_worker_start_failed',
        message: 'Failed to start background task queue worker',
        error
      });
    }
  }

  /**
   * Start metrics emitter
   */
  private startMetricsEmitter(): void {
    try {
      this.metricsEmitter = new MetricsEmitter(
        this.components.taskQueue,
        this.components.ephemeralWorkerService,
        60000
      );
      this.metricsEmitter.start();

      // Update SystemLifecycleService with metricsEmitter reference
      this.components.systemLifecycleService.updateComponents({ metricsEmitter: this.metricsEmitter });

      logger.info({
        category: 'process',
        action: 'metrics_emitter_started',
        message: 'Background metrics emitter started successfully'
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'metrics_emitter_start_failed',
        message: 'Failed to start metrics emitter',
        error
      });
    }
  }

  /**
   * Wire interactive session stream events
   * Note: Stream events are now handled by SocketIOTerminalHandler
   * Event listeners are wired in server.ts (sessionStarted → startSession, sessionEnded → stopSession)
   */
  wireInteractiveStreamEvents(): void {
    // Legacy method - no longer needed with Socket.IO architecture
    // Interactive session streaming is now handled by SocketIOTerminalHandler
    // Event listeners are wired in server.ts
  }

  /**
   * Start interactive session idle timeout watchdog
   */
  private startInteractiveIdleWatchdog(): void {
    this.components.interactiveSessionService.startIdleWatchdog((sessionId, idleDuration) => {
      const idleTimeout = this.components.interactiveSessionService.getIdleTimeoutMs();
      logger.warn({
        category: 'system',
        action: 'idle_timeout',
        message: 'Interactive session exceeded idle timeout',
        details: {
          sessionId,
          idleDurationMs: idleDuration,
          idleTimeoutMs: idleTimeout,
        },
      });

      void this.endInteractiveSession(sessionId, 'Idle timeout (no activity)').catch((error) => {
        logger.error({
          category: 'system',
          action: 'idle_timeout_cleanup_failed',
          message: `Failed to stop idle interactive session ${sessionId}`,
          error,
        });
      });
    });
  }

  /**
   * Get Docker validation result
   */
  getDockerValidationResult(): DockerValidationResult | undefined {
    return this.dockerValidationResult;
  }

  /**
   * Get task queue worker instance
   */
  getTaskQueueWorker(): { start: () => Promise<void>; stop: () => Promise<void> } | undefined {
    return this.taskQueueWorker;
  }

  /**
   * Get metrics emitter instance
   */
  getMetricsEmitter(): MetricsEmitter | undefined {
    return this.metricsEmitter;
  }
}
