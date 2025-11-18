/**
 * Docker Mock Service for E2E Testing
 * 
 * Simulates Docker container operations without requiring actual Docker.
 * Useful for testing container lifecycle, resource limits, and cleanup.
 */

export interface ContainerConfig {
  Image: string;
  Cmd?: string[];
  Env?: string[];
  HostConfig?: {
    Memory?: number;
    CpuShares?: number;
    AutoRemove?: boolean;
    Binds?: string[];
  };
  Labels?: Record<string, string>;
}

export interface Container {
  id: string;
  status: 'created' | 'running' | 'stopped' | 'removed';
  config: ContainerConfig;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
}

export interface ContainerInspect {
  Id: string;
  State: {
    Running: boolean;
    Paused: boolean;
    Restarting: boolean;
    Status: string;
    ExitCode: number;
  };
  Config: ContainerConfig;
  HostConfig: ContainerConfig['HostConfig'];
  Created: string;
}

/**
 * Docker Mock Service
 * 
 * Usage:
 * ```typescript
 * const docker = new DockerMock();
 * const container = await docker.createContainer({ Image: 'node:18', ... });
 * await container.start();
 * const inspect = await container.inspect();
 * await container.stop();
 * ```
 */
export class DockerMock {
  private containers: Map<string, Container> = new Map();
  private nextId = 1;

  /**
   * Create a new container
   */
  async createContainer(config: ContainerConfig): Promise<MockContainer> {
    const id = `mock-container-${this.nextId++}`;
    
    const container: Container = {
      id,
      status: 'created',
      config,
      createdAt: Date.now(),
    };
    
    this.containers.set(id, container);
    
    return new MockContainer(id, this);
  }

  /**
   * List containers
   */
  async listContainers(filters?: {
    label?: string[];
    status?: string[];
  }): Promise<Container[]> {
    let containers = Array.from(this.containers.values());
    
    if (filters?.label) {
      containers = containers.filter(c => {
        return filters.label!.every(labelFilter => {
          const [key, value] = labelFilter.split('=');
          return c.config.Labels?.[key] === value;
        });
      });
    }
    
    if (filters?.status) {
      containers = containers.filter(c => 
        filters.status!.includes(c.status)
      );
    }
    
    return containers;
  }

  /**
   * Inspect container
   */
  async inspectContainer(id: string): Promise<ContainerInspect> {
    const container = this.containers.get(id);
    if (!container) {
      throw new Error(`Container ${id} not found`);
    }
    
    return {
      Id: container.id,
      State: {
        Running: container.status === 'running',
        Paused: false,
        Restarting: false,
        Status: container.status,
        ExitCode: container.status === 'stopped' ? 0 : -1,
      },
      Config: container.config,
      HostConfig: container.config.HostConfig,
      Created: new Date(container.createdAt).toISOString(),
    };
  }

  /**
   * Start container
   */
  async startContainer(id: string): Promise<void> {
    const container = this.containers.get(id);
    if (!container) {
      throw new Error(`Container ${id} not found`);
    }
    
    if (container.status === 'running') {
      throw new Error(`Container ${id} is already running`);
    }
    
    container.status = 'running';
    container.startedAt = Date.now();
  }

  /**
   * Stop container
   */
  async stopContainer(id: string): Promise<void> {
    const container = this.containers.get(id);
    if (!container) {
      throw new Error(`Container ${id} not found`);
    }
    
    if (container.status !== 'running') {
      throw new Error(`Container ${id} is not running`);
    }
    
    container.status = 'stopped';
    container.stoppedAt = Date.now();
    
    // Auto-remove if configured
    if (container.config.HostConfig?.AutoRemove) {
      await this.removeContainer(id);
    }
  }

  /**
   * Remove container
   */
  async removeContainer(id: string): Promise<void> {
    const container = this.containers.get(id);
    if (!container) {
      throw new Error(`Container ${id} not found`);
    }
    
    if (container.status === 'running') {
      throw new Error(`Cannot remove running container ${id}`);
    }
    
    container.status = 'removed';
    this.containers.delete(id);
  }

  /**
   * Cleanup orphaned containers
   */
  async cleanupOrphaned(): Promise<string[]> {
    const orphaned = Array.from(this.containers.values())
      .filter(c => c.status === 'running' && 
                   Date.now() - (c.startedAt || 0) > 300000); // 5 min
    
    const ids = orphaned.map(c => c.id);
    
    for (const container of orphaned) {
      await this.stopContainer(container.id);
      await this.removeContainer(container.id);
    }
    
    return ids;
  }

  /**
   * Get container by ID
   */
  getContainer(id: string): MockContainer {
    return new MockContainer(id, this);
  }

  /**
   * Reset all containers
   */
  reset(): void {
    this.containers.clear();
    this.nextId = 1;
  }
}

/**
 * Mock Container instance
 */
export class MockContainer {
  constructor(
    public readonly id: string,
    private docker: DockerMock
  ) {}

  async start(): Promise<void> {
    await this.docker.startContainer(this.id);
  }

  async stop(): Promise<void> {
    await this.docker.stopContainer(this.id);
  }

  async remove(): Promise<void> {
    await this.docker.removeContainer(this.id);
  }

  async inspect(): Promise<ContainerInspect> {
    return await this.docker.inspectContainer(this.id);
  }
}

/**
 * Factory function to create Docker mock
 */
export function setupDockerMock(): DockerMock {
  return new DockerMock();
}

/**
 * Helper to expect container removed
 */
export async function expectContainerRemoved(
  docker: DockerMock,
  containerId: string
): Promise<void> {
  try {
    await docker.inspectContainer(containerId);
    throw new Error(`Container ${containerId} still exists`);
  } catch (error: any) {
    if (!error.message.includes('not found')) {
      throw error;
    }
    // Container not found - this is expected
  }
}
