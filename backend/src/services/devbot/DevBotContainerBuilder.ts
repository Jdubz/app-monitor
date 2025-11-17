/**
 * DevBot Container Builder
 *
 * Fluent API for building dev-bot containers with sensible defaults
 * and composable configuration. Supports multiple use cases:
 * - Automation workers (queue-based task execution)
 * - Interactive sessions (manual debugging)
 * - One-off scripts, test runners, etc.
 */

import Docker from 'dockerode';
import fs from 'fs';
import { logger } from '../../utils/logger.js';
import { CONTAINER_CPU_QUOTA, WORKER_UID_GID } from '../../constants/containers.js';

export interface ContainerLabels {
  [key: string]: string;
}

export interface VolumeMount {
  hostPath: string;
  containerPath: string;
  mode: 'ro' | 'rw';
}

export interface TmpfsMount {
  containerPath: string;
  options: string;
}

export interface ContainerResources {
  memoryMB: number;
  cpuQuota: number; // In microseconds per 100ms period
}

export interface DevBotContainerConfig {
  image: string;
  name: string;
  workingDir: string;
  command: string[];
  env: Record<string, string>;
  labels: ContainerLabels;
  volumes: VolumeMount[];
  tmpfs: TmpfsMount[];
  resources: ContainerResources;
  autoRemove: boolean;
  tty: boolean;
  stdin: boolean;
  extraHosts?: string[];
}

/**
 * Builder for creating dev-bot containers with fluent API
 */
export class DevBotContainerBuilder {
  private config: DevBotContainerConfig;

  constructor(containerName: string, imageName: string = 'dev-bot:latest') {
    // Sensible defaults
    this.config = {
      image: imageName,
      name: containerName,
      workingDir: '/workspace',
      command: ['/bin/bash', '-c', 'tail -f /dev/null'],
      env: {},
      labels: {
        'app': 'app-monitor',
        'dev-bot.version': '1.0',
        'dev-bot.created': new Date().toISOString(),
      },
      volumes: [],
      tmpfs: [
        // Writable temp for agent CLI session data
        // uid=1000 (node user) gid=1000 (node group) mode=0700
        { containerPath: '/home/node/.claude', options: `size=100m,${WORKER_UID_GID},mode=0700` },
        { containerPath: '/home/node/.codex', options: `size=100m,${WORKER_UID_GID},mode=0700` },
        { containerPath: '/home/node/.gemini', options: `size=100m,${WORKER_UID_GID},mode=0700` }
      ],
      resources: {
        memoryMB: 512,
        cpuQuota: CONTAINER_CPU_QUOTA,
      },
      autoRemove: true,
      tty: true,
      stdin: true,
      extraHosts: ['host.docker.internal:host-gateway'],
    };
  }

  /**
   * Set container working directory
   */
  workingDirectory(dir: string): this {
    this.config.workingDir = dir;
    return this;
  }

  /**
   * Set container command
   */
  command(cmd: string[]): this {
    this.config.command = cmd;
    return this;
  }

  /**
   * Add environment variable
   */
  env(key: string, value: string): this {
    this.config.env[key] = value;
    return this;
  }

  /**
   * Add multiple environment variables
   */
  envFromObject(vars: Record<string, string>): this {
    Object.assign(this.config.env, vars);
    return this;
  }

  /**
   * Add environment variables from process.env by key
   */
  passthroughEnv(keys: string[]): this {
    for (const key of keys) {
      const value = process.env[key];
      if (value && value.length > 0) {
        this.config.env[key] = value;
      }
    }
    return this;
  }

  /**
   * Add label
   */
  label(key: string, value: string): this {
    this.config.labels[key] = value;
    return this;
  }

  /**
   * Add multiple labels
   */
  labels(labels: ContainerLabels): this {
    Object.assign(this.config.labels, labels);
    return this;
  }

  /**
   * Add volume mount
   */
  volume(hostPath: string, containerPath: string, mode: 'ro' | 'rw' = 'rw'): this {
    this.config.volumes.push({ hostPath, containerPath, mode });
    return this;
  }

  /**
   * Add tmpfs mount
   */
  tmpfsMount(containerPath: string, options: string = ''): this {
    this.config.tmpfs.push({ containerPath, options });
    return this;
  }

  /**
   * Set resource limits
   */
  resources(memoryMB: number, cpuQuota: number): this {
    this.config.resources = { memoryMB, cpuQuota };
    return this;
  }

  /**
   * Set auto-remove behavior
   */
  autoRemove(enabled: boolean): this {
    this.config.autoRemove = enabled;
    return this;
  }

  /**
   * Enable/disable TTY
   */
  tty(enabled: boolean): this {
    this.config.tty = enabled;
    return this;
  }

  /**
   * Enable/disable stdin
   */
  stdin(enabled: boolean): this {
    this.config.stdin = enabled;
    return this;
  }

  /**
   * Add extra host entries
   */
  addExtraHost(host: string): this {
    if (!this.config.extraHosts) {
      this.config.extraHosts = [];
    }
    this.config.extraHosts.push(host);
    return this;
  }

  /**
   * Mount work-target specific log directories for troubleshooting
   *
   * @param logMappings - Array of log path mappings from work target config
   * @returns this builder for chaining
   */
  mountWorkTargetLogs(logMappings: Array<{ hostPath: string; containerPath: string; mode?: 'ro' | 'rw' }>): this {
    for (const mapping of logMappings) {
      // Only mount if the host path exists
      try {
        if (fs.existsSync(mapping.hostPath)) {
          this.volume(mapping.hostPath, mapping.containerPath, mapping.mode || 'ro');
        }
      } catch (err) {
        // Silently skip if we can't check existence (e.g., in test environments)
      }
    }
    return this;
  }

  /**
   * Build and return the configuration
   */
  getConfig(): DevBotContainerConfig {
    return { ...this.config };
  }

  /**
   * Create the container using Docker API
   */
  async create(docker: Docker): Promise<Docker.Container> {
    const config = this.getConfig();

    // Convert to Dockerode format
    const createOptions: Docker.ContainerCreateOptions = {
      Image: config.image,
      name: config.name,
      Tty: config.tty,
      OpenStdin: config.stdin,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: config.workingDir,
      Cmd: config.command,
      Env: Object.entries(config.env).map(([k, v]) => `${k}=${v}`),
      Labels: config.labels,
      HostConfig: {
        AutoRemove: config.autoRemove,
        Binds: config.volumes.map(v => `${v.hostPath}:${v.containerPath}:${v.mode}`),
        Memory: config.resources.memoryMB * 1024 * 1024,
        CpuQuota: config.resources.cpuQuota,
        Tmpfs: config.tmpfs.reduce((acc, mount) => {
          acc[mount.containerPath] = mount.options;
          return acc;
        }, {} as Record<string, string>),
        ExtraHosts: config.extraHosts,
      },
    };

    logger.info({
      category: 'system',
      action: 'creating_devbot_container',
      message: `Creating dev-bot container: ${config.name}`,
      details: {
        image: config.image,
        memoryMB: config.resources.memoryMB,
        cpuQuota: config.resources.cpuQuota,
        volumeCount: config.volumes.length,
      },
    });

    const container = await docker.createContainer(createOptions);

    logger.info({
      category: 'system',
      action: 'devbot_container_created',
      message: `Container created: ${container.id}`,
      details: { name: config.name },
    });

    return container;
  }
}

/**
 * Factory functions for common container types
 */
export class DevBotContainerPresets {
  /**
   * Create builder for automation worker container
   */
  static automationWorker(workerId: string, taskId: string, agentId: string): DevBotContainerBuilder {
    return new DevBotContainerBuilder(`automation-bot-${workerId}`)
      .labels({
        'dev-bot.type': 'automation',
        'dev-bot.worker.id': workerId,
        'dev-bot.task.id': taskId,
        'dev-bot.agent.id': agentId,
      })
      .autoRemove(true);
  }

  /**
   * Create builder for interactive session container
   */
  static interactiveSession(sessionId: string, ownerEmail: string): DevBotContainerBuilder {
    return new DevBotContainerBuilder(`interactive-bot-${sessionId}`)
      .labels({
        'dev-bot.type': 'interactive',
        'dev-bot.session.id': sessionId,
        'dev-bot.owner': ownerEmail,
      })
      .autoRemove(false); // Keep for manual inspection
  }

  /**
   * Create builder for one-off script execution
   */
  static scriptRunner(scriptName: string): DevBotContainerBuilder {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return new DevBotContainerBuilder(`script-bot-${uniqueId}`)
      .labels({
        'dev-bot.type': 'script',
        'dev-bot.script.name': scriptName,
      })
      .autoRemove(true);
  }

  /**
   * Create builder for test runner
   */
  static testRunner(testSuite: string): DevBotContainerBuilder {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return new DevBotContainerBuilder(`test-bot-${uniqueId}`)
      .labels({
        'dev-bot.type': 'test',
        'dev-bot.test.suite': testSuite,
      })
      .resources(1024, 100000) // More resources for tests
      .autoRemove(true);
  }
}
