/**
 * Container Lifecycle Service
 * 
 * Manages Docker container lifecycle operations extracted from EphemeralWorkerService.
 * Handles creation, health checking, stopping, and cleanup of containers.
 * 
 * Part of P1 refactoring plan - Week 1: Extract Container Management
 */

import type Docker from 'dockerode';
import { logger } from '../utils/logger.js';

export interface ContainerConfig {
  image: string;
  name: string;
  cmd?: string[];
  env?: string[];
  workingDir?: string;
  memory?: number;
  cpuQuota?: number;
  autoRemove?: boolean;
  binds?: string[];
  tmpfs?: { [key: string]: string };
  labels?: { [key: string]: string };
}

export interface HealthCheckOptions {
  maxAttempts: number;
  intervalMs: number;
}

export interface ContainerInspection {
  id: string;
  state: {
    running: boolean;
    paused: boolean;
    restarting: boolean;
    dead: boolean;
    oomKilled: boolean;
    exitCode?: number;
    error?: string;
    health?: {
      status: 'healthy' | 'unhealthy' | 'starting';
    };
  };
}

/**
 * Service for managing Docker container lifecycle
 */
export class ContainerLifecycleService {
  constructor(private docker: Docker) {}

  /**
   * Create a Docker container with the specified configuration
   * 
   * @param config Container configuration
   * @returns Created container instance
   */
  async createContainer(config: ContainerConfig): Promise<Docker.Container> {
    const containerConfig: Docker.ContainerCreateOptions = {
      Image: config.image,
      name: config.name,
      Cmd: config.cmd,
      Env: config.env,
      WorkingDir: config.workingDir,
      HostConfig: {
        Memory: config.memory,
        CpuQuota: config.cpuQuota,
        AutoRemove: config.autoRemove,
        Binds: config.binds,
        Tmpfs: config.tmpfs
      },
      Labels: config.labels
    };

    const container = await this.docker.createContainer(containerConfig);

    logger.info({
      category: 'docker',
      action: 'container_created',
      message: `Created container ${config.name}`,
      details: { 
        containerId: container.id,
        name: config.name,
        image: config.image
      }
    });

    return container;
  }

  /**
   * Start a Docker container
   * 
   * @param containerId Container ID to start
   */
  async startContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.start();

    logger.info({
      category: 'docker',
      action: 'container_started',
      message: `Started container ${containerId}`,
      details: { containerId }
    });
  }

  /**
   * Stop a Docker container with optional grace period
   * 
   * @param containerId Container ID to stop
   * @param gracePeriodSeconds Grace period in seconds (default: 10)
   */
  async stopContainer(containerId: string, gracePeriodSeconds: number = 10): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: gracePeriodSeconds });

      logger.info({
        category: 'docker',
        action: 'container_stopped',
        message: `Stopped container ${containerId}`,
        details: { containerId, gracePeriodSeconds }
      });
    } catch (error) {
      // Container may already be stopped
      if ((error as Error).message.includes('is not running')) {
        logger.debug({
          category: 'docker',
          action: 'container_already_stopped',
          message: `Container ${containerId} already stopped`,
          details: { containerId }
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Remove a Docker container
   * 
   * @param containerId Container ID to remove
   * @param force Force removal even if running
   */
  async removeContainer(containerId: string, force: boolean = true): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ v: true, force });

      logger.info({
        category: 'docker',
        action: 'container_removed',
        message: `Removed container ${containerId}`,
        details: { containerId, force }
      });
    } catch (error) {
      // Container may already be removed
      if ((error as Error).message.includes('no such container')) {
        logger.debug({
          category: 'docker',
          action: 'container_already_removed',
          message: `Container ${containerId} already removed`,
          details: { containerId }
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Wait for a container to become healthy
   * 
   * Polls the container status with exponential backoff until:
   * - Container is running and healthy (if health check defined)
   * - Container is running (if no health check defined)
   * - Container enters a fatal state (dead, OOMKilled)
   * - Max attempts reached
   * 
   * @param containerId Container ID to check
   * @param options Health check options
   * @throws Error if container fails to become healthy
   */
  async waitForHealthy(containerId: string, options: HealthCheckOptions): Promise<void> {
    const { maxAttempts, intervalMs } = options;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const container = this.docker.getContainer(containerId);
        const inspection = await container.inspect();

        // Check if container is running
        if (inspection.State.Running) {
          // If container has no health check, consider it ready once running
          if (!inspection.State.Health) {
            logger.info({
              category: 'docker',
              action: 'container_ready',
              message: 'Container is running (no health check defined)',
              details: { containerId, attempt }
            });
            return;
          }

          // If health check exists, wait for healthy status
          if (inspection.State.Health.Status === 'healthy') {
            logger.info({
              category: 'docker',
              action: 'container_ready',
              message: 'Container is running and healthy',
              details: { containerId, attempt }
            });
            return;
          }
        }

        // Check for fatal states
        if (inspection.State.Dead || inspection.State.OOMKilled) {
          const error = inspection.State.Error || 'Unknown error';
          throw new Error(`Container failed to start: ${error}`);
        }

        // Not ready yet, wait with exponential backoff
        const delay = Math.min(intervalMs * (2 ** (attempt - 1)), 3000); // Cap at 3 seconds
        await new Promise(resolve => setTimeout(resolve, delay));

      } catch (error) {
        if (attempt === maxAttempts) {
          logger.error({
            category: 'docker',
            action: 'container_health_check_failed',
            message: `Container failed to become ready after ${maxAttempts} attempts`,
            error: { message: (error as Error).message },
            details: { containerId, maxAttempts }
          });
          throw new Error(`Container failed to become ready after ${maxAttempts} attempts: ${(error as Error).message}`);
        }

        // For non-fatal errors, continue retrying
        if ((error as Error).message.includes('no such container')) {
          throw error; // Container doesn't exist, fail immediately
        }
      }
    }

    // If we've exhausted all attempts without success, throw
    throw new Error(`Container failed to become ready after ${maxAttempts} attempts`);
  }

  /**
   * Inspect a container to get its current state
   * 
   * @param containerId Container ID to inspect
   * @returns Container inspection data
   */
  async inspectContainer(containerId: string): Promise<ContainerInspection> {
    const container = this.docker.getContainer(containerId);
    const inspection = await container.inspect();

    return {
      id: inspection.Id,
      state: {
        running: inspection.State.Running,
        paused: inspection.State.Paused,
        restarting: inspection.State.Restarting,
        dead: inspection.State.Dead,
        oomKilled: inspection.State.OOMKilled,
        exitCode: inspection.State.ExitCode,
        error: inspection.State.Error,
        health: inspection.State.Health ? {
          status: inspection.State.Health.Status as 'healthy' | 'unhealthy' | 'starting'
        } : undefined
      }
    };
  }

  /**
   * Get a container instance by ID
   * 
   * @param containerId Container ID
   * @returns Docker container instance
   */
  getContainer(containerId: string): Docker.Container {
    return this.docker.getContainer(containerId);
  }
}
