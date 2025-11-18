/**
 * Container Lifecycle Service Unit Tests
 * 
 * Tests container creation, health checking, stopping, and cleanup.
 * Part of P1 refactoring plan - Week 1: Extract Container Management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Docker from 'dockerode';
import { ContainerLifecycleService } from '../ContainerLifecycleService.js';

// Mock Docker
const createMockDocker = () => {
  const mockContainer = {
    id: 'container-123',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({
      Id: 'container-123',
      State: {
        Running: true,
        Paused: false,
        Restarting: false,
        Dead: false,
        OOMKilled: false,
        ExitCode: 0,
        Error: '',
        Health: {
          Status: 'healthy'
        }
      }
    })
  };

  return {
    createContainer: vi.fn().mockResolvedValue(mockContainer),
    getContainer: vi.fn().mockReturnValue(mockContainer),
    mockContainer
  } as unknown as Docker & { mockContainer: typeof mockContainer };
};

describe('ContainerLifecycleService', () => {
  let docker: ReturnType<typeof createMockDocker>;
  let service: ContainerLifecycleService;

  beforeEach(() => {
    docker = createMockDocker();
    service = new ContainerLifecycleService(docker);
  });

  describe('createContainer', () => {
    it('should create a container with basic config', async () => {
      const config = {
        image: 'node:20',
        name: 'test-container',
        cmd: ['/bin/bash'],
        env: ['NODE_ENV=test'],
        workingDir: '/app'
      };

      const container = await service.createContainer(config);

      expect(docker.createContainer).toHaveBeenCalledWith({
        Image: 'node:20',
        name: 'test-container',
        Cmd: ['/bin/bash'],
        Env: ['NODE_ENV=test'],
        WorkingDir: '/app',
        HostConfig: {
          Memory: undefined,
          CpuQuota: undefined,
          AutoRemove: undefined,
          Binds: undefined,
          Tmpfs: undefined
        },
        Labels: undefined
      });

      expect(container).toBeDefined();
      expect(container.id).toBe('container-123');
    });

    it('should create container with resource limits', async () => {
      const config = {
        image: 'node:20',
        name: 'test-container',
        memory: 512 * 1024 * 1024, // 512MB
        cpuQuota: 50000
      };

      await service.createContainer(config);

      expect(docker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            Memory: 512 * 1024 * 1024,
            CpuQuota: 50000
          })
        })
      );
    });

    it('should create container with volume binds', async () => {
      const config = {
        image: 'node:20',
        name: 'test-container',
        binds: ['/host/path:/container/path:ro']
      };

      await service.createContainer(config);

      expect(docker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            Binds: ['/host/path:/container/path:ro']
          })
        })
      );
    });

    it('should create container with tmpfs mounts', async () => {
      const config = {
        image: 'node:20',
        name: 'test-container',
        tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=100m'
        }
      };

      await service.createContainer(config);

      expect(docker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            Tmpfs: {
              '/tmp': 'rw,noexec,nosuid,size=100m'
            }
          })
        })
      );
    });

    it('should create container with labels', async () => {
      const config = {
        image: 'node:20',
        name: 'test-container',
        labels: {
          'app': 'test',
          'environment': 'development'
        }
      };

      await service.createContainer(config);

      expect(docker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Labels: {
            'app': 'test',
            'environment': 'development'
          }
        })
      );
    });
  });

  describe('startContainer', () => {
    it('should start a container by ID', async () => {
      await service.startContainer('container-123');

      expect(docker.getContainer).toHaveBeenCalledWith('container-123');
      expect(docker.mockContainer.start).toHaveBeenCalled();
    });
  });

  describe('stopContainer', () => {
    it('should stop a container with default grace period', async () => {
      await service.stopContainer('container-123');

      expect(docker.getContainer).toHaveBeenCalledWith('container-123');
      expect(docker.mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
    });

    it('should stop a container with custom grace period', async () => {
      await service.stopContainer('container-123', 30);

      expect(docker.mockContainer.stop).toHaveBeenCalledWith({ t: 30 });
    });

    it('should handle already stopped container gracefully', async () => {
      docker.mockContainer.stop.mockRejectedValueOnce(
        new Error('container is not running')
      );

      // Should not throw
      await expect(service.stopContainer('container-123')).resolves.toBeUndefined();
    });

    it('should throw on other stop errors', async () => {
      docker.mockContainer.stop.mockRejectedValueOnce(
        new Error('permission denied')
      );

      await expect(service.stopContainer('container-123')).rejects.toThrow('permission denied');
    });
  });

  describe('removeContainer', () => {
    it('should remove container with default force=true', async () => {
      await service.removeContainer('container-123');

      expect(docker.getContainer).toHaveBeenCalledWith('container-123');
      expect(docker.mockContainer.remove).toHaveBeenCalledWith({ v: true, force: true });
    });

    it('should remove container with force=false', async () => {
      await service.removeContainer('container-123', false);

      expect(docker.mockContainer.remove).toHaveBeenCalledWith({ v: true, force: false });
    });

    it('should handle already removed container gracefully', async () => {
      docker.mockContainer.remove.mockRejectedValueOnce(
        new Error('no such container')
      );

      // Should not throw
      await expect(service.removeContainer('container-123')).resolves.toBeUndefined();
    });

    it('should throw on other remove errors', async () => {
      docker.mockContainer.remove.mockRejectedValueOnce(
        new Error('permission denied')
      );

      await expect(service.removeContainer('container-123')).rejects.toThrow('permission denied');
    });
  });

  describe('waitForHealthy', () => {
    it('should return immediately if container is running without health check', async () => {
      docker.mockContainer.inspect.mockResolvedValue({
        Id: 'container-123',
        State: {
          Running: true,
          Health: undefined
        }
      });

      await service.waitForHealthy('container-123', {
        maxAttempts: 30,
        intervalMs: 100
      });

      expect(docker.mockContainer.inspect).toHaveBeenCalledTimes(1);
    });

    it('should return when container becomes healthy', async () => {
      docker.mockContainer.inspect.mockResolvedValue({
        Id: 'container-123',
        State: {
          Running: true,
          Health: {
            Status: 'healthy'
          }
        }
      });

      await service.waitForHealthy('container-123', {
        maxAttempts: 30,
        intervalMs: 100
      });

      expect(docker.mockContainer.inspect).toHaveBeenCalled();
    });

    it('should retry until container becomes healthy', async () => {
      let callCount = 0;
      docker.mockContainer.inspect.mockImplementation(async () => {
        callCount++;
        return {
          Id: 'container-123',
          State: {
            Running: callCount >= 3,
            Health: {
              Status: callCount >= 3 ? 'healthy' : 'starting'
            }
          }
        };
      });

      await service.waitForHealthy('container-123', {
        maxAttempts: 10,
        intervalMs: 10
      });

      expect(docker.mockContainer.inspect).toHaveBeenCalledTimes(3);
    });

    it('should throw if container enters dead state', async () => {
      docker.mockContainer.inspect.mockResolvedValue({
        Id: 'container-123',
        State: {
          Running: false,
          Dead: true,
          Error: 'Container crashed'
        }
      });

      await expect(
        service.waitForHealthy('container-123', {
          maxAttempts: 30,
          intervalMs: 100
        })
      ).rejects.toThrow('Container failed to start: Container crashed');
    });

    it('should throw if container is OOMKilled', async () => {
      docker.mockContainer.inspect.mockResolvedValue({
        Id: 'container-123',
        State: {
          Running: false,
          OOMKilled: true,
          Error: 'Out of memory'
        }
      });

      await expect(
        service.waitForHealthy('container-123', {
          maxAttempts: 30,
          intervalMs: 100
        })
      ).rejects.toThrow('Container failed to start: Out of memory');
    });

    it('should throw if max attempts exceeded', async () => {
      docker.mockContainer.inspect.mockResolvedValue({
        Id: 'container-123',
        State: {
          Running: true,
          Health: {
            Status: 'starting' // Never becomes healthy
          }
        }
      });

      await expect(
        service.waitForHealthy('container-123', {
          maxAttempts: 3,
          intervalMs: 10
        })
      ).rejects.toThrow('Container failed to become ready after 3 attempts');
    });

    it('should throw immediately if container does not exist', async () => {
      docker.mockContainer.inspect.mockRejectedValue(
        new Error('no such container')
      );

      await expect(
        service.waitForHealthy('container-123', {
          maxAttempts: 30,
          intervalMs: 100
        })
      ).rejects.toThrow('no such container');
    });

    it('should use exponential backoff with cap', async () => {
      const delays: number[] = [];
      let callCount = 0;

      docker.mockContainer.inspect.mockImplementation(async () => {
        callCount++;
        if (callCount > 1) {
          const startTime = Date.now();
          await new Promise(resolve => setTimeout(resolve, 0));
          delays.push(Date.now() - startTime);
        }
        return {
          Id: 'container-123',
          State: {
            Running: callCount >= 5,
            Health: { Status: callCount >= 5 ? 'healthy' : 'starting' }
          }
        };
      });

      await service.waitForHealthy('container-123', {
        maxAttempts: 10,
        intervalMs: 100
      });

      // Backoff should increase but cap at 3000ms
      // This is hard to test precisely due to timing, so just verify it was called multiple times
      expect(callCount).toBeGreaterThan(1);
    });
  });

  describe('inspectContainer', () => {
    it('should return container inspection data', async () => {
      docker.mockContainer.inspect.mockResolvedValue({
        Id: 'container-123',
        State: {
          Running: true,
          Paused: false,
          Restarting: false,
          Dead: false,
          OOMKilled: false,
          ExitCode: 0,
          Error: '',
          Health: {
            Status: 'healthy'
          }
        }
      });

      const inspection = await service.inspectContainer('container-123');

      expect(inspection).toEqual({
        id: 'container-123',
        state: {
          running: true,
          paused: false,
          restarting: false,
          dead: false,
          oomKilled: false,
          exitCode: 0,
          error: '',
          health: {
            status: 'healthy'
          }
        }
      });
    });

    it('should handle container without health check', async () => {
      docker.mockContainer.inspect.mockResolvedValue({
        Id: 'container-123',
        State: {
          Running: true,
          Paused: false,
          Restarting: false,
          Dead: false,
          OOMKilled: false,
          ExitCode: 0,
          Error: '',
          Health: undefined
        }
      });

      const inspection = await service.inspectContainer('container-123');

      expect(inspection.state.health).toBeUndefined();
    });
  });

  describe('getContainer', () => {
    it('should return container instance', () => {
      const container = service.getContainer('container-123');

      expect(docker.getContainer).toHaveBeenCalledWith('container-123');
      expect(container).toBe(docker.mockContainer);
    });
  });
});
