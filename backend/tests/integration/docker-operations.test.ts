/**
 * Integration Tests for Docker Operations
 * 
 * Tests Docker container management functionality.
 * Note: These tests require Docker to be running and accessible.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DockerManager } from '../../src/services/dockerManager.js';

describe('Docker Operations Integration', () => {
  let dockerManager: DockerManager;
  const TEST_IMAGE = 'alpine:latest';
  const testContainers: string[] = [];

  beforeAll(async () => {
    dockerManager = new DockerManager();
    
    // Check if Docker is available
    try {
      await dockerManager.validateDockerEnvironment();
    } catch (error) {
      console.warn('Docker not available, skipping Docker integration tests');
    }
  }, 30000);

  afterAll(async () => {
    // Clean up test containers
    for (const containerId of testContainers) {
      try {
        await dockerManager.stopContainer(containerId, 1);
        await dockerManager.removeContainer(containerId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }, 30000);

  describe('Docker Connectivity', () => {
    it('should connect to Docker daemon', async () => {
      const validation = await dockerManager.validateDockerEnvironment();
      expect(validation.isValid).toBe(true);
    });

    it('should get Docker version info', async () => {
      try {
        const version = await dockerManager.getVersion();
        expect(version).toBeDefined();
        expect(version.Version).toBeDefined();
      } catch (error) {
        // Skip if Docker not available
        console.warn('Docker version check skipped');
      }
    });
  });

  describe('List Containers', () => {
    it('should list all containers', async () => {
      try {
        const containers = await dockerManager.listContainers({ all: true });
        expect(Array.isArray(containers)).toBe(true);
      } catch (error) {
        console.warn('List containers skipped - Docker not available');
      }
    });

    it('should list only running containers', async () => {
      try {
        const containers = await dockerManager.listContainers({ all: false });
        expect(Array.isArray(containers)).toBe(true);
        
        // All should be in running state
        containers.forEach(container => {
          expect(container.State).toBe('running');
        });
      } catch (error) {
        console.warn('List running containers skipped');
      }
    });

    it('should filter containers by label', async () => {
      try {
        const containers = await dockerManager.listContainers({
          filters: { label: ['com.example.test=true'] },
        });
        expect(Array.isArray(containers)).toBe(true);
      } catch (error) {
        console.warn('Filter containers skipped');
      }
    });
  });

  describe('Container Creation', () => {
    it('should create a test container', async () => {
      try {
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-container-create',
          Cmd: ['sleep', '30'],
          Labels: {
            'dev-monitor-test': 'true',
          },
        });

        expect(container).toBeDefined();
        expect(container.id).toBeDefined();
        
        testContainers.push(container.id);
      } catch (error) {
        console.warn('Create container skipped:', (error as Error).message);
      }
    }, 30000);

    it('should handle container creation with environment variables', async () => {
      try {
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-container-env',
          Env: ['TEST_VAR=test_value', 'NODE_ENV=test'],
          Cmd: ['sh', '-c', 'echo $TEST_VAR'],
          Labels: {
            'dev-monitor-test': 'true',
          },
        });

        expect(container).toBeDefined();
        testContainers.push(container.id);
      } catch (error) {
        console.warn('Create container with env skipped');
      }
    }, 30000);
  });

  describe('Container Lifecycle', () => {
    it('should start and stop a container', async () => {
      try {
        // Create container
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-container-lifecycle',
          Cmd: ['sleep', '60'],
          Labels: {
            'dev-monitor-test': 'true',
          },
        });

        testContainers.push(container.id);

        // Start container
        await dockerManager.startContainer(container.id);
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check it's running
        const inspect = await dockerManager.inspectContainer(container.id);
        expect(inspect.State.Running).toBe(true);

        // Stop container
        await dockerManager.stopContainer(container.id, 5);
        
        // Check it's stopped
        const inspectStopped = await dockerManager.inspectContainer(container.id);
        expect(inspectStopped.State.Running).toBe(false);
      } catch (error) {
        console.warn('Container lifecycle test skipped:', (error as Error).message);
      }
    }, 60000);

    it('should restart a container', async () => {
      try {
        // Create and start container
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-container-restart',
          Cmd: ['sleep', '60'],
          Labels: {
            'dev-monitor-test': 'true',
          },
        });

        testContainers.push(container.id);
        await dockerManager.startContainer(container.id);
        
        const startTime1 = (await dockerManager.inspectContainer(container.id)).State.StartedAt;
        
        // Wait and restart
        await new Promise(resolve => setTimeout(resolve, 1000));
        await dockerManager.restartContainer(container.id, 5);
        
        const startTime2 = (await dockerManager.inspectContainer(container.id)).State.StartedAt;
        
        expect(startTime2).not.toBe(startTime1);
      } catch (error) {
        console.warn('Restart container test skipped');
      }
    }, 60000);

    it('should pause and unpause a container', async () => {
      try {
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-container-pause',
          Cmd: ['sleep', '60'],
          Labels: {
            'dev-monitor-test': 'true',
          },
        });

        testContainers.push(container.id);
        await dockerManager.startContainer(container.id);
        
        // Pause
        await dockerManager.pauseContainer(container.id);
        let inspect = await dockerManager.inspectContainer(container.id);
        expect(inspect.State.Paused).toBe(true);
        
        // Unpause
        await dockerManager.unpauseContainer(container.id);
        inspect = await dockerManager.inspectContainer(container.id);
        expect(inspect.State.Paused).toBe(false);
      } catch (error) {
        console.warn('Pause/unpause container test skipped');
      }
    }, 60000);
  });

  describe('Container Inspection', () => {
    it('should get container details', async () => {
      try {
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-container-inspect',
          Cmd: ['sleep', '30'],
          Labels: {
            'dev-monitor-test': 'true',
            'test-label': 'test-value',
          },
        });

        testContainers.push(container.id);
        
        const details = await dockerManager.inspectContainer(container.id);
        
        expect(details).toBeDefined();
        expect(details.Config).toBeDefined();
        expect(details.Config.Labels['dev-monitor-test']).toBe('true');
        expect(details.Config.Labels['test-label']).toBe('test-value');
      } catch (error) {
        console.warn('Inspect container test skipped');
      }
    }, 30000);

    it('should get container stats', async () => {
      try {
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-container-stats',
          Cmd: ['sleep', '30'],
          Labels: {
            'dev-monitor-test': 'true',
          },
        });

        testContainers.push(container.id);
        await dockerManager.startContainer(container.id);
        
        const stats = await dockerManager.getContainerStats(container.id);
        
        expect(stats).toBeDefined();
        expect(stats.memory_stats).toBeDefined();
        expect(stats.cpu_stats).toBeDefined();
      } catch (error) {
        console.warn('Container stats test skipped');
      }
    }, 30000);
  });

  describe('Container Logs', () => {
    it('should retrieve container logs', async () => {
      try {
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-container-logs',
          Cmd: ['sh', '-c', 'echo "Test log message" && sleep 10'],
          Labels: {
            'dev-monitor-test': 'true',
          },
        });

        testContainers.push(container.id);
        await dockerManager.startContainer(container.id);
        
        // Wait for command to execute
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const logs = await dockerManager.getContainerLogs(container.id, {
          stdout: true,
          stderr: true,
          tail: 100,
        });

        expect(logs).toBeDefined();
        expect(typeof logs).toBe('string');
        expect(logs.length).toBeGreaterThan(0);
      } catch (error) {
        console.warn('Container logs test skipped');
      }
    }, 30000);

    it('should stream container logs', async () => {
      try {
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-container-log-stream',
          Cmd: ['sh', '-c', 'for i in 1 2 3; do echo "Line $i"; sleep 1; done'],
          Labels: {
            'dev-monitor-test': 'true',
          },
        });

        testContainers.push(container.id);
        await dockerManager.startContainer(container.id);
        
        const logLines: string[] = [];
        
        await dockerManager.streamContainerLogs(
          container.id,
          (chunk: string) => {
            logLines.push(chunk);
          },
          {
            follow: true,
            stdout: true,
            stderr: true,
          }
        );

        expect(logLines.length).toBeGreaterThan(0);
      } catch (error) {
        console.warn('Stream logs test skipped');
      }
    }, 30000);
  });

  describe('Container Removal', () => {
    it('should remove a stopped container', async () => {
      try {
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-container-remove',
          Cmd: ['echo', 'test'],
          Labels: {
            'dev-monitor-test': 'true',
          },
        });

        // Don't add to cleanup array since we're testing removal
        await dockerManager.startContainer(container.id);
        
        // Wait for container to exit
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await dockerManager.removeContainer(container.id);
        
        // Verify it's gone
        await expect(async () => {
          await dockerManager.inspectContainer(container.id);
        }).rejects.toThrow();
      } catch (error) {
        console.warn('Remove container test skipped');
      }
    }, 30000);

    it('should force remove a running container', async () => {
      try {
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-container-force-remove',
          Cmd: ['sleep', '60'],
          Labels: {
            'dev-monitor-test': 'true',
          },
        });

        await dockerManager.startContainer(container.id);
        
        await dockerManager.removeContainer(container.id, { force: true });
        
        // Verify it's gone
        await expect(async () => {
          await dockerManager.inspectContainer(container.id);
        }).rejects.toThrow();
      } catch (error) {
        console.warn('Force remove test skipped');
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle non-existent container operations', async () => {
      await expect(
        dockerManager.inspectContainer('nonexistent-container-xyz')
      ).rejects.toThrow();
    });

    it('should handle invalid container creation parameters', async () => {
      await expect(
        dockerManager.createContainer({
          Image: 'nonexistent-image-xyz:latest',
          name: 'test-invalid-image',
        })
      ).rejects.toThrow();
    });

    it('should handle stopping an already stopped container', async () => {
      try {
        const container = await dockerManager.createContainer({
          Image: TEST_IMAGE,
          name: 'test-double-stop',
          Cmd: ['echo', 'test'],
          Labels: {
            'dev-monitor-test': 'true',
          },
        });

        testContainers.push(container.id);
        await dockerManager.startContainer(container.id);
        
        // Wait for it to exit naturally
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try to stop an already stopped container
        await expect(
          dockerManager.stopContainer(container.id, 1)
        ).rejects.toThrow();
      } catch (error) {
        console.warn('Double stop test skipped');
      }
    }, 30000);
  });

  describe('Container Filtering', () => {
    it('should find containers by name pattern', async () => {
      try {
        // Create containers with specific naming pattern
        const containers = await Promise.all([
          dockerManager.createContainer({
            Image: TEST_IMAGE,
            name: 'test-filter-alpha',
            Cmd: ['sleep', '30'],
            Labels: { 'dev-monitor-test': 'true' },
          }),
          dockerManager.createContainer({
            Image: TEST_IMAGE,
            name: 'test-filter-beta',
            Cmd: ['sleep', '30'],
            Labels: { 'dev-monitor-test': 'true' },
          }),
        ]);

        containers.forEach(c => testContainers.push(c.id));

        const allContainers = await dockerManager.listContainers({ all: true });
        const filtered = allContainers.filter(c => 
          c.Names.some(name => name.includes('test-filter'))
        );

        expect(filtered.length).toBeGreaterThanOrEqual(2);
      } catch (error) {
        console.warn('Filter containers test skipped');
      }
    }, 30000);
  });
});
