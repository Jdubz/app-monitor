/**
 * Docker Manager
 * Handles Docker connectivity, image management, and validation
 */

import Docker, { ContainerCreateOptions, ContainerRemoveOptions } from 'dockerode';
import { logger } from '../utils/logger.js';

export interface DockerValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  info: {
    dockerVersion?: string;
    apiVersion?: string;
    osType?: string;
    architecture?: string;
  };
}

export interface DockerImageInfo {
  name: string;
  tag: string;
  exists: boolean;
  id?: string;
  created?: string;
  size?: number;
}

export class DockerManager {
  private docker: Docker;
  private static readonly CLAUDE_WORKER_IMAGE = 'dev-bot:latest';
  private static readonly REQUIRED_IMAGES = [
    DockerManager.CLAUDE_WORKER_IMAGE
  ];

  constructor(socketPath: string = '/var/run/docker.sock') {
    this.docker = new Docker({ socketPath });
  }

  /**
   * Validate Docker connectivity and environment
   */
  async validateDockerEnvironment(): Promise<DockerValidationResult> {
    const result: DockerValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      info: {}
    };

    try {
      // Test Docker socket connectivity
      const info = await this.docker.info();

      result.info = {
        dockerVersion: info.ServerVersion,
        apiVersion: info.ApiVersion,
        osType: info.OSType,
        architecture: info.Architecture
      };

      logger.info({
        category: 'process',
        action: 'docker_connectivity_validated',
        message: 'Docker connectivity validated',
        details: { info: result.info }
      });

      // Check if Docker daemon is running
      if (!info.ServerVersion) {
        result.errors.push('Docker daemon is not running or not accessible');
        result.isValid = false;
      }

      // Check for required images
      for (const imageName of DockerManager.REQUIRED_IMAGES) {
        const imageInfo = await this.checkImage(imageName);
        if (!imageInfo.exists) {
          result.warnings.push(`Required image '${imageName}' not found - will attempt to pull`);
        } else {
          logger.info({
      category: 'process',
      action: 'image_imagename_found_imageinfo_id_substring_0_12',
      message: `Image ${imageName} found: ${imageInfo.id?.substring(0, 12)}`
    });
        }
      }

      // Check Docker socket permissions
      try {
        await this.docker.listContainers();
      } catch (error) {
        result.errors.push('Insufficient permissions to access Docker socket');
        result.isValid = false;
      }

    } catch (error) {
      result.errors.push(`Docker validation failed: ${error instanceof Error ? error.message : String(error)}`);
      result.isValid = false;
      logger.error({
      category: 'process',
      action: 'docker_validation_error',
      message: 'Docker validation error:',
      error: error
    });
    }

    return result;
  }

  /**
   * Check if a Docker image exists
   */
  async checkImage(imageName: string): Promise<DockerImageInfo> {
    try {
      const [name, tag = 'latest'] = imageName.split(':');
      const images = await this.docker.listImages({
        filters: { reference: [imageName] }
      });

      if (images.length > 0) {
        const image = images[0];
        return {
          name,
          tag,
          exists: true,
          id: image.Id,
          created: image.Created ? new Date(image.Created * 1000).toISOString() : undefined,
          size: image.Size
        };
      }

      return { name, tag, exists: false };
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_check_image_imagename',
      message: `Failed to check image ${imageName}:`,
      error: error
    });
      return { name: imageName, tag: 'latest', exists: false };
    }
  }

  /**
   * Pull a Docker image
   */
  async pullImage(imageName: string, onProgress?: (progress: string) => void): Promise<boolean> {
    try {
      logger.info({
      category: 'process',
      action: 'pulling_docker_image_imagename',
      message: `Pulling Docker image: ${imageName}`
    });

      const stream = await this.docker.pull(imageName);

      return new Promise((resolve, reject) => {
        this.docker.modem.followProgress(
          stream,
          (err, _output) => {
            if (err) {
              logger.error({
      category: 'process',
      action: 'failed_to_pull_image_imagename',
      message: `Failed to pull image ${imageName}:`,
      error: err
    });
              reject(err);
            } else {
              logger.info({
      category: 'process',
      action: 'successfully_pulled_image_imagename',
      message: `Successfully pulled image: ${imageName}`
    });
              resolve(true);
            }
          },
          (event) => {
            if (event.status && onProgress) {
              onProgress(`${event.status}${event.progress || ''}`);
            }
          }
        );
      });
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'error_pulling_image_imagename',
      message: `Error pulling image ${imageName}:`,
      error: error
    });
      return false;
    }
  }

  /**
   * Ensure required images are available (pull if missing)
   */
  async ensureRequiredImages(): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const imageName of DockerManager.REQUIRED_IMAGES) {
      const imageInfo = await this.checkImage(imageName);

      if (!imageInfo.exists) {
        logger.warn({
      category: 'process',
      action: 'image_imagename_not_found_attempting_to_pull',
      message: `Image ${imageName} not found, attempting to pull...`
    });

        // For custom images that need to be built, provide helpful error
        if (imageName.startsWith('dev-bot')) {
          errors.push(
            `Custom image '${imageName}' not found. Please build it first:\n` +
            `  cd dev-monitor/backend && ./build-dev-bot-image.sh`
          );
          continue;
        }

        // Try to pull the image
        const pulled = await this.pullImage(imageName, (progress) => {
          logger.info({
      category: 'process',
      action: 'progress',
      message: `  ${progress}`
    });
        });

        if (!pulled) {
          errors.push(`Failed to pull image: ${imageName}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }

  /**
   * Create a new container
   */
  async createContainer(
    options: ContainerCreateOptions,
    { pullImageIfMissing = true }: { pullImageIfMissing?: boolean } = {}
  ): Promise<Docker.Container> {
    const imageName = options.Image;

    if (pullImageIfMissing && imageName) {
      const imageInfo = await this.checkImage(imageName);
      if (!imageInfo.exists) {
        logger.warn({
          category: 'docker',
          action: 'create_container_pull_missing_image',
          message: `Image ${imageName} not present locally. Attempting to pull before container creation.`
        });

        const pulled = await this.pullImage(imageName);
        if (!pulled) {
          throw new Error(`Failed to pull image ${imageName} required for container creation.`);
        }
      }
    }

    try {
      const container = await this.docker.createContainer(options);
      const containerId = container.id ?? (await container.inspect()).Id;

      if (!containerId) {
        throw new Error('Container ID not available after creation');
      }

      if (!container.id) {
        // Align dockerode instance with inspected ID so downstream consumers can rely on it.
        (container as { id: string }).id = containerId;
      }

      logger.info({
        category: 'docker',
        action: 'create_container',
        message: `Created container ${containerId ?? 'unknown'}`,
        details: {
          image: options.Image,
          name: (options as { name?: string }).name
        }
      });

      return container;
    } catch (error) {
      logger.error({
        category: 'docker',
        action: 'create_container_error',
        message: `Failed to create container from image ${imageName ?? 'unknown'}`,
        error
      });
      throw error;
    }
  }

  /**
   * Get Docker client instance
   */
  getDocker(): Docker {
    return this.docker;
  }

  /**
   * Get the Dev-Bot image name
   */
  static getDevBotImage(): string {
    return DockerManager.CLAUDE_WORKER_IMAGE;
  }

  /**
   * Health check for Docker
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'docker_health_check_failed',
      message: 'Docker health check failed:',
      error: error
    });
      return false;
    }
  }

  /**
   * Clean up orphaned volumes
   */
  async cleanupOrphanedVolumes(): Promise<number> {
    try {
      const volumes = await this.docker.listVolumes({
        filters: { dangling: ['true'] }
      });

      let cleaned = 0;
      if (volumes.Volumes) {
        for (const volume of volumes.Volumes) {
          try {
            const vol = this.docker.getVolume(volume.Name);
            await vol.remove();
            cleaned++;
            logger.info({
      category: 'process',
      action: 'removed_orphaned_volume_volume_name',
      message: `Removed orphaned volume: ${volume.Name}`
    });
          } catch (error) {
            logger.warn({
      category: 'process',
      action: 'failed_to_remove_volume_volume_name',
      message: `Failed to remove volume ${volume.Name}:`,
      details: { error }
    });
          }
        }
      }

      return cleaned;
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_cleanup_orphaned_volumes',
      message: 'Failed to cleanup orphaned volumes:',
      error: error
    });
      return 0;
    }
  }

  /**
   * Clean up orphaned networks
   */
  async cleanupOrphanedNetworks(): Promise<number> {
    try {
      const networks = await this.docker.listNetworks({
        filters: {
          label: ['claude.worker.network=true'],
          dangling: ['true']
        }
      });

      let cleaned = 0;
      for (const network of networks) {
        try {
          const net = this.docker.getNetwork(network.Id);
          await net.remove();
          cleaned++;
          logger.info({
      category: 'process',
      action: 'removed_orphaned_network_network_name',
      message: `Removed orphaned network: ${network.Name}`
    });
        } catch (error) {
          logger.warn({
      category: 'process',
      action: 'failed_to_remove_network_network_name',
      message: `Failed to remove network ${network.Name}:`,
      details: { error }
    });
        }
      }

      return cleaned;
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_cleanup_orphaned_networks',
      message: 'Failed to cleanup orphaned networks:',
      error: error
    });
      return 0;
    }
  }

  /**
   * Get container logs
   */
  async getContainerLogs(containerId: string, tail: number = 100): Promise<string> {
    try {
      const container = this.docker.getContainer(containerId);
      const stream = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true
      });

      return stream.toString();
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_get_logs_for_container_containerid',
      message: `Failed to get logs for container ${containerId}:`,
      error: error
    });
      return '';
    }
  }

  /**
   * Cleanup orphaned Docker resources (volumes and networks)
   */
  async cleanupOrphanedResources(): Promise<{
    volumesCleaned: number;
    networksCleaned: number;
  }> {
    logger.info({
      category: 'process',
      action: 'triggering_orphaned_resource_cleanup',
      message: 'Triggering orphaned resource cleanup...'
    });

    const volumesCleaned = await this.cleanupOrphanedVolumes();
    const networksCleaned = await this.cleanupOrphanedNetworks();

    logger.info({
      category: 'process',
      action: 'cleanup_complete_volumescleaned_volumes_networkscl',
      message: `Cleanup complete: ${volumesCleaned} volumes, ${networksCleaned} networks removed`
    });

    return { volumesCleaned, networksCleaned };
  }

  /**
   * Get container health status
   */
  async getContainerHealth(containerId: string): Promise<{
    healthy: boolean;
    status?: string;
    logs?: string;
  }> {
    try {
      const container = this.docker.getContainer(containerId);
      const inspect = await container.inspect();

      return {
        healthy: inspect.State.Running,
        status: inspect.State.Status,
        logs: await this.getContainerLogs(containerId, 20)
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'not_found'
      };
    }
  }

  /**
   * List containers with optional filters
   */
  async listContainers(options?: { all?: boolean; filters?: Record<string, string[]> }): Promise<Docker.ContainerInfo[]> {
    try {
      const containers = await this.docker.listContainers({
        all: options?.all ?? false,
        filters: options?.filters
      });

      logger.info({
        category: 'docker',
        action: 'list_containers',
        message: `Listed ${containers.length} containers`,
        details: { count: containers.length, all: options?.all }
      });

      return containers;
    } catch (error) {
      logger.error({
        category: 'docker',
        action: 'list_containers_error',
        message: 'Failed to list containers',
        error
      });
      return [];
    }
  }

  /**
   * Start a container
   */
  async startContainer(containerId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.start();

      logger.info({
        category: 'docker',
        action: 'start_container',
        message: `Started container ${containerId}`,
        details: { containerId }
      });

      return true;
    } catch (error) {
      logger.error({
        category: 'docker',
        action: 'start_container_error',
        message: `Failed to start container ${containerId}`,
        error
      });
      return false;
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(containerId: string, timeout: number = 10): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: timeout });

      logger.info({
        category: 'docker',
        action: 'stop_container',
        message: `Stopped container ${containerId}`,
        details: { containerId, timeout }
      });

      return true;
    } catch (error) {
      logger.error({
        category: 'docker',
        action: 'stop_container_error',
        message: `Failed to stop container ${containerId}`,
        error
      });
      return false;
    }
  }

  /**
   * Restart a container
   */
  async restartContainer(containerId: string, timeout: number = 10): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.restart({ t: timeout });

      logger.info({
        category: 'docker',
        action: 'restart_container',
        message: `Restarted container ${containerId}`,
        details: { containerId, timeout }
      });

      return true;
    } catch (error) {
      logger.error({
        category: 'docker',
        action: 'restart_container_error',
        message: `Failed to restart container ${containerId}`,
        error
      });
      return false;
    }
  }

  /**
   * Remove a container
   */
  async removeContainer(
    containerId: string,
    options: boolean | (ContainerRemoveOptions & { force?: boolean }) = false
  ): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      const removeOptions: ContainerRemoveOptions =
        typeof options === 'boolean'
          ? { force: options }
          : { force: options.force, v: options.v, link: options.link };
      await container.remove(removeOptions);

      logger.info({
        category: 'docker',
        action: 'remove_container',
        message: `Removed container ${containerId}`,
        details: { containerId, options: removeOptions }
      });

      return true;
    } catch (error) {
      logger.error({
        category: 'docker',
        action: 'remove_container_error',
        message: `Failed to remove container ${containerId}`,
        error
      });
      return false;
    }
  }

  /**
   * Inspect a container
   */
  async inspectContainer(containerId: string): Promise<Docker.ContainerInspectInfo | null> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();

      logger.info({
        category: 'docker',
        action: 'inspect_container',
        message: `Inspected container ${containerId}`,
        details: { 
          containerId,
          state: info.State?.Status,
          running: info.State?.Running
        }
      });

      return info;
    } catch (error) {
      logger.error({
        category: 'docker',
        action: 'inspect_container_error',
        message: `Failed to inspect container ${containerId}`,
        error
      });
      return null;
    }
  }

  /**
   * Stream container logs in real-time
   */
  async streamContainerLogs(
    containerId: string,
    onData: (log: string) => void,
    options?: {
      stdout?: boolean;
      stderr?: boolean;
      tail?: number;
      timestamps?: boolean;
    }
  ): Promise<NodeJS.ReadableStream | null> {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Use follow: true to get streaming logs
      const stream = await container.logs({
        stdout: options?.stdout ?? true,
        stderr: options?.stderr ?? true,
        follow: true,
        tail: options?.tail ?? 100,
        timestamps: options?.timestamps ?? true
      }) as NodeJS.ReadableStream;

      // Handle data events
      stream.on('data', (chunk: Buffer) => {
        const log = chunk.toString();
        onData(log);
      });

      logger.info({
        category: 'docker',
        action: 'stream_logs',
        message: `Streaming logs for container ${containerId}`,
        details: { containerId, options }
      });

      return stream;
    } catch (error) {
      logger.error({
        category: 'docker',
        action: 'stream_logs_error',
        message: `Failed to stream logs for container ${containerId}`,
        error
      });
      return null;
    }
  }

  /**
   * Get container stats (CPU, memory, network, etc.)
   */
  async getContainerStats(containerId: string): Promise<Docker.ContainerStats | null> {
    try {
      const container = this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });

      logger.info({
        category: 'docker',
        action: 'get_stats',
        message: `Retrieved stats for container ${containerId}`,
        details: { containerId }
      });

      return stats as Docker.ContainerStats;
    } catch (error) {
      logger.error({
        category: 'docker',
        action: 'get_stats_error',
        message: `Failed to get stats for container ${containerId}`,
        error
      });
      return null;
    }
  }

  /**
   * Get the Claude worker image name
   */
  static getClaudeWorkerImage(): string {
    return 'dev-bot:latest';
  }
}
