/**
 * DevBot Container Lifecycle Manager
 *
 * Handles lifecycle operations for dev-bot containers:
 * - Starting and stopping containers
 * - Health checks and monitoring
 * - Graceful shutdown
 * - Cleanup and resource management
 */

import Docker from 'dockerode';
import { logger } from '../../utils/logger.js';
import { MS_PER_HOUR } from '../../constants/timeouts.js';

export interface ContainerHealth {
  isRunning: boolean;
  status: string;
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
}

export interface ContainerStats {
  cpuUsage: number; // Percentage
  memoryUsageMB: number;
  memoryLimitMB: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

/**
 * Manages container lifecycle operations
 */
export class DevBotContainerLifecycle {
  constructor(private docker: Docker) {}

  /**
   * Start a container and wait for it to be running
   */
  async start(containerId: string, waitMs: number = 1000): Promise<void> {
    logger.info({
      category: 'system',
      action: 'starting_container',
      message: `Starting container ${containerId}`,
    });

    const container = this.docker.getContainer(containerId);

    try {
      await container.start();

      logger.info({
        category: 'system',
        action: 'container_started',
        message: `Container ${containerId} started successfully`,
      });

      // Wait for container to be fully running
      if (waitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'container_start_failed',
        message: `Failed to start container ${containerId}`,
        error,
      });
      throw error;
    }
  }

  /**
   * Stop a container gracefully with timeout
   */
  async stop(containerId: string, timeoutSeconds: number = 10): Promise<void> {
    logger.info({
      category: 'system',
      action: 'stopping_container',
      message: `Stopping container ${containerId} (timeout: ${timeoutSeconds}s)`,
    });

    const container = this.docker.getContainer(containerId);

    try {
      await container.stop({ t: timeoutSeconds });

      logger.info({
        category: 'system',
        action: 'container_stopped',
        message: `Container ${containerId} stopped successfully`,
      });
    } catch (error) {
      // Docker returns 304 if container is already stopped
      if (!(error instanceof Error) || (error as { statusCode?: number }).statusCode !== 304) {
        logger.warn({
          category: 'system',
          action: 'container_stop_failed',
          message: `Failed to stop container ${containerId}`,
          error,
        });
        throw error;
      } else {
        logger.debug({
          category: 'system',
          action: 'container_already_stopped',
          message: `Container ${containerId} was already stopped`,
        });
      }
    }
  }

  /**
   * Remove a container (force if necessary)
   */
  async remove(containerId: string, force: boolean = true): Promise<void> {
    logger.info({
      category: 'system',
      action: 'removing_container',
      message: `Removing container ${containerId} (force: ${force})`,
    });

    const container = this.docker.getContainer(containerId);

    try {
      await container.remove({ force });

      logger.info({
        category: 'system',
        action: 'container_removed',
        message: `Container ${containerId} removed successfully`,
      });
    } catch (error) {
      logger.warn({
        category: 'system',
        action: 'container_remove_failed',
        message: `Failed to remove container ${containerId}`,
        error,
      });
      // Don't throw - removal failures are not critical
    }
  }

  /**
   * Stop and remove a container
   */
  async stopAndRemove(containerId: string, stopTimeout: number = 10): Promise<void> {
    logger.info({
      category: 'system',
      action: 'stopping_and_removing_container',
      message: `Stopping and removing container ${containerId}`,
    });

    try {
      await this.stop(containerId, stopTimeout);
    } catch (error) {
      logger.warn({
        category: 'system',
        action: 'stop_failed_proceeding_to_remove',
        message: 'Stop failed, will force remove',
      });
    }

    await this.remove(containerId, true);
  }

  /**
   * Kill a container immediately (SIGKILL)
   */
  async kill(containerId: string): Promise<void> {
    logger.warn({
      category: 'system',
      action: 'killing_container',
      message: `Killing container ${containerId} (SIGKILL)`,
    });

    const container = this.docker.getContainer(containerId);

    try {
      await container.kill();

      logger.info({
        category: 'system',
        action: 'container_killed',
        message: `Container ${containerId} killed successfully`,
      });
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'container_kill_failed',
        message: `Failed to kill container ${containerId}`,
        error,
      });
      throw error;
    }
  }

  /**
   * Get container health status
   */
  async getHealth(containerId: string): Promise<ContainerHealth> {
    const container = this.docker.getContainer(containerId);

    try {
      const info = await container.inspect();

      return {
        isRunning: info.State.Running,
        status: info.State.Status,
        exitCode: info.State.ExitCode,
        startedAt: info.State.StartedAt,
        finishedAt: info.State.FinishedAt,
      };
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'failed_to_get_container_health',
        message: `Failed to inspect container ${containerId}`,
        error,
      });
      throw error;
    }
  }

  /**
   * Wait for container to be healthy
   */
  async waitForHealthy(
    containerId: string,
    maxWaitMs: number = 10000,
    checkIntervalMs: number = 500
  ): Promise<boolean> {
    logger.info({
      category: 'system',
      action: 'waiting_for_container_health',
      message: `Waiting for container ${containerId} to be healthy`,
    });

    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const health = await this.getHealth(containerId);

        if (health.isRunning) {
          logger.info({
            category: 'system',
            action: 'container_healthy',
            message: `Container ${containerId} is running`,
          });
          return true;
        }

        if (health.exitCode !== undefined && health.exitCode !== 0) {
          logger.error({
            category: 'system',
            action: 'container_exited_with_error',
            message: `Container ${containerId} exited with code ${health.exitCode}`,
          });
          return false;
        }
      } catch (error) {
        logger.warn({
          category: 'system',
          action: 'health_check_failed',
          message: 'Health check failed, will retry',
          error,
        });
      }

      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }

    logger.warn({
      category: 'system',
      action: 'container_health_timeout',
      message: `Container ${containerId} did not become healthy within ${maxWaitMs}ms`,
    });

    return false;
  }

  /**
   * Get container resource stats
   */
  async getStats(containerId: string): Promise<ContainerStats | null> {
    const container = this.docker.getContainer(containerId);

    try {
      const stats = await container.stats({ stream: false });

      // Calculate CPU percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuUsage = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;

      // Memory stats
      const memoryUsageMB = stats.memory_stats.usage / 1024 / 1024;
      const memoryLimitMB = stats.memory_stats.limit / 1024 / 1024;

      // Network stats
      const networkStats = stats.networks?.eth0 || { rx_bytes: 0, tx_bytes: 0 };

      return {
        cpuUsage: Math.round(cpuUsage * 100) / 100,
        memoryUsageMB: Math.round(memoryUsageMB * 100) / 100,
        memoryLimitMB: Math.round(memoryLimitMB * 100) / 100,
        networkRxBytes: networkStats.rx_bytes,
        networkTxBytes: networkStats.tx_bytes,
      };
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'failed_to_get_container_stats',
        message: `Failed to get stats for container ${containerId}`,
        error,
      });
      return null;
    }
  }

  /**
   * Execute a command in a running container
   */
  async exec(
    containerId: string,
    command: string[],
    options: {
      workingDir?: string;
      env?: string[];
      attachStdout?: boolean;
      attachStderr?: boolean;
      tty?: boolean;
    } = {}
  ): Promise<string> {
    const container = this.docker.getContainer(containerId);

    logger.debug({
      category: 'system',
      action: 'executing_command_in_container',
      message: `Executing command in ${containerId}: ${command.join(' ')}`,
    });

    const exec = await container.exec({
      Cmd: command,
      AttachStdout: options.attachStdout ?? true,
      AttachStderr: options.attachStderr ?? true,
      Tty: options.tty ?? false,
      WorkingDir: options.workingDir,
      Env: options.env,
    });

    const stream = await exec.start({ Detach: false, Tty: options.tty ?? false });

    let output = '';
    stream.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    return output;
  }

  /**
   * List all dev-bot containers
   */
  async listDevBotContainers(type?: string): Promise<Docker.ContainerInfo[]> {
    const filters: { label: string[] } = {
      label: ['app=app-monitor'],
    };

    if (type) {
      filters.label.push(`dev-bot.type=${type}`);
    }

    const containers = await this.docker.listContainers({
      all: true,
      filters: JSON.stringify(filters),
    });

    return containers;
  }

  /**
   * Cleanup orphaned containers (containers that are stopped but not removed)
   */
  async cleanupOrphaned(olderThanHours: number = 24): Promise<number> {
    logger.info({
      category: 'system',
      action: 'cleaning_up_orphaned_containers',
      message: `Cleaning up dev-bot containers older than ${olderThanHours} hours`,
    });

    const containers = await this.listDevBotContainers();
    const now = Date.now();
    const cutoffTime = now - olderThanHours * MS_PER_HOUR;

    let cleanedCount = 0;

    for (const containerInfo of containers) {
      // Skip running containers
      if (containerInfo.State === 'running') {
        continue;
      }

      const createdTime = containerInfo.Created * 1000;

      if (createdTime < cutoffTime) {
        try {
          await this.remove(containerInfo.Id, true);
          cleanedCount++;
            } catch (_error) {
              logger.warn({
                category: 'system',
                action: 'failed_to_cleanup_container',            message: `Failed to remove container ${containerInfo.Id}`,
            error: _error,
          });
        }
      }
    }

    logger.info({
      category: 'system',
      action: 'orphaned_cleanup_complete',
      message: `Cleaned up ${cleanedCount} orphaned containers`,
    });

    return cleanedCount;
  }
}
