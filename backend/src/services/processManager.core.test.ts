/**
 * Process Manager Core Tests
 * 
 * Based on test scenarios from docs/plans/test-scenarios-by-repository.md
 * Covers service start/stop, port conflicts, Docker management, and error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ProcessManager } from './processManager.js';
import { services } from '../config.js';
import { logger } from '../utils/logger.js';
import { checkPortsAvailable, getPortInfo } from '../utils/portCheck.js';
import { isPortInUse, stopDockerContainer, getDockerContainerInfo } from '../utils/portManager.js';
import { spawn } from 'child_process';
import * as fs from 'fs';

// Mock all dependencies
vi.mock('../utils/logger.js');
vi.mock('../utils/portCheck.js');
vi.mock('../utils/portManager.js');
vi.mock('child_process');
vi.mock('fs');

describe('ProcessManager Core Functionality', () => {
  let processManager: ProcessManager;
  let mockSpawn: any;
  let mockFs: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock spawn
    mockSpawn = vi.mocked(spawn);
    mockSpawn.mockReturnValue({
      pid: 12345,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      kill: vi.fn(),
      exitCode: null
    } as any);

    // Mock fs
    mockFs = vi.mocked(fs);
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.createWriteStream.mockReturnValue({
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn()
    } as any);

    // Mock port utilities
    vi.mocked(checkPortsAvailable).mockResolvedValue({ available: true, busyPorts: [] });
    vi.mocked(getPortInfo).mockResolvedValue({ port: 5000, pid: null, process: null });
    vi.mocked(isPortInUse).mockResolvedValue(false);
    vi.mocked(stopDockerContainer).mockResolvedValue({ success: true });
    vi.mocked(getDockerContainerInfo).mockResolvedValue(null);

    // Mock logger
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});
    vi.mocked(logger.debug).mockImplementation(() => {});

    // Mock process.exit to prevent tests from exiting
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    processManager = new ProcessManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Service Start/Stop Lifecycle', () => {
    it('should start service with correct configuration', async () => {
      // Given: Service configuration
      const serviceName = 'job-finder-backend';
      const config = services[serviceName];

      // When: Service is started
      const result = await processManager.startService(serviceName);

      // Then: Process is spawned with correct parameters
      expect(mockSpawn).toHaveBeenCalled();
      const spawnCall = mockSpawn.mock.calls[0];
      expect(spawnCall[0]).toBe(config.command);
      expect(spawnCall[1]).toEqual(config.args);
      expect(spawnCall[2].cwd).toBe(config.cwd);
      expect(spawnCall[2].env).toEqual(expect.objectContaining({
        NODE_ENV: 'test'  // In test environment, NODE_ENV is 'test' not 'development'
      }));

      // And: Status is returned
      expect(result).toBeDefined();
      expect(result.name).toBe(serviceName);
      expect(result.status).toBe('running');
      expect(result.pid).toBe(12345);
    });

    it('should stop service with graceful shutdown', async () => {
      // Given: Service is running
      const serviceName = 'job-finder-backend';
      const mockProcess = {
        pid: 12345,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        kill: vi.fn(),
        exitCode: null
      } as any;

      mockSpawn.mockReturnValue(mockProcess);
      await processManager.startService(serviceName);

      // When: Service is stopped
      const result = await processManager.stopService(serviceName);

      // Then: SIGTERM is sent
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(result.status).toBe('stopped');
    });

    it('should restart service (stop then start)', async () => {
      // Given: Service is running
      const serviceName = 'job-finder-backend';
      const mockProcess = {
        pid: 12345,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        kill: vi.fn(),
        exitCode: null
      } as any;

      mockSpawn.mockReturnValue(mockProcess);
      await processManager.startService(serviceName);

      // When: Service is restarted
      const result = await processManager.restartService(serviceName);

      // Then: Service is stopped and started
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockSpawn).toHaveBeenCalledTimes(2); // Once for start, once for restart
      expect(result.status).toBe('running');
    });

    it('should handle service already running', async () => {
      // Given: Service is already running
      const serviceName = 'job-finder-backend';
      await processManager.startService(serviceName);

      // When: Start is attempted again
      const result = await processManager.startService(serviceName);

      // Then: Warning is logged and existing status is returned
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('already running')
        })
      );
      expect(result.status).toBe('running');
    });
  });

  describe('Port Management', () => {
    it('should check ports before starting service', async () => {
      // Given: Service with required ports
      const serviceName = 'job-finder-backend';
      const config = services[serviceName];

      // When: Service is started
      await processManager.startService(serviceName);

      // Then: Ports are checked
      expect(checkPortsAvailable).toHaveBeenCalledWith(config.ports);
    });

    it('should handle port conflicts', async () => {
      // Given: Ports are busy
      vi.mocked(checkPortsAvailable).mockResolvedValue({
        available: false,
        busyPorts: [5001, 4000]
      });

      const serviceName = 'job-finder-backend';

      // When: Service start is attempted
      await expect(processManager.startService(serviceName))
        .rejects.toThrow('Cannot start Job Finder Backend');

      // Then: Service is not started
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should clear conflicting ports when required', async () => {
      // Given: Ports are busy but service requires them
      vi.mocked(checkPortsAvailable).mockResolvedValue({
        available: false,
        busyPorts: [5001]
      });

      vi.mocked(isPortInUse).mockResolvedValue(true);
      vi.mocked(stopDockerContainer).mockResolvedValue({ success: true });

      const serviceName = 'job-finder-backend';

      // When: Service start is attempted
      await processManager.startService(serviceName);

      // Then: Conflicting processes are stopped
      expect(stopDockerContainer).toHaveBeenCalled();
    });

    it('should find alternative port when possible', async () => {
      // Given: Primary port is busy but alternative is available
      vi.mocked(checkPortsAvailable)
        .mockResolvedValueOnce({ available: false, busyPorts: [5001] })
        .mockResolvedValueOnce({ available: true, busyPorts: [] });

      const serviceName = 'job-finder-frontend';

      // When: Service start is attempted
      const result = await processManager.startService(serviceName);

      // Then: Service starts with alternative port
      expect(result.status).toBe('running');
    });
  });

  describe('Docker Container Management', () => {
    it('should start Docker containers', async () => {
      // Given: Docker service configuration
      const serviceName = 'job-finder-worker';

      // When: Docker service is started
      const result = await processManager.startService(serviceName);

      // Then: Container is created and started
      expect(result.status).toBe('running');
      expect(result.dockerContainer).toBeDefined();
    });

    it('should stop Docker containers gracefully', async () => {
      // Given: Docker container is running
      const serviceName = 'job-finder-worker';

      await processManager.startService(serviceName);

      // When: Container is stopped
      const result = await processManager.stopService(serviceName);

      // Then: Container is stopped gracefully
      expect(result.status).toBe('stopped');
    });

    it('should handle Docker container failures', async () => {
      // Given: Docker operation fails
      const serviceName = 'job-finder-worker';
      mockSpawn.mockImplementation(() => {
        throw new Error('Docker error');
      });

      // When: Docker service start is attempted
      await expect(processManager.startService(serviceName))
        .rejects.toThrow('Docker error');

      // Then: Error is logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Failed to start service')
        })
      );
    });
  });

  describe('Process Monitoring', () => {
    it('should track process status', async () => {
      // Given: Service is started
      const serviceName = 'job-finder-backend';
      await processManager.startService(serviceName);

      // When: Status is checked
      const status = await processManager.getServiceStatus(serviceName);

      // Then: Status is tracked correctly
      expect(status).toBeDefined();
      expect(status.name).toBe(serviceName);
      expect(status.status).toBe('running');
      expect(status.pid).toBe(12345);
    });

    it('should detect process crashes', async () => {
      // Given: Service is running
      const serviceName = 'job-finder-backend';
      const mockProcess = {
        pid: 12345,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            // Simulate crash after a delay
            setTimeout(() => callback(1), 100);
          }
        }),
        once: vi.fn(),
        removeListener: vi.fn(),
        kill: vi.fn(),
        exitCode: null
      } as any;

      mockSpawn.mockReturnValue(mockProcess);
      await processManager.startService(serviceName);

      // When: Process crashes
      await new Promise(resolve => setTimeout(resolve, 150));

      // Then: Status is updated
      const status = await processManager.getServiceStatus(serviceName);
      expect(status.status).toBe('error');
      expect(status.error).toBeDefined();
    });

    it('should track process uptime', async () => {
      // Given: Service is started
      const serviceName = 'job-finder-backend';
      const startTime = Date.now();
      
      await processManager.startService(serviceName);

      // When: Status is checked after delay
      await new Promise(resolve => setTimeout(resolve, 100));
      const status = await processManager.getServiceStatus(serviceName);

      // Then: Uptime is calculated
      expect(status.uptime).toBeGreaterThan(0);
      expect(status.startedAt).toBeGreaterThanOrEqual(startTime);
    });
  });

  describe('Log Management', () => {
    it('should create log files for services', async () => {
      // Given: Service is started
      const serviceName = 'job-finder-backend';

      // When: Service is started
      await processManager.startService(serviceName);

      // Then: Log directory is created
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true }
      );

      // And: Log file stream is created
      expect(mockFs.createWriteStream).toHaveBeenCalled();
    });

    it('should capture process output', async () => {
      // Given: Service with output
      const serviceName = 'job-finder-backend';
      const mockProcess = {
        pid: 12345,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        kill: vi.fn(),
        exitCode: null
      } as any;

      mockSpawn.mockReturnValue(mockProcess);
      await processManager.startService(serviceName);

      // When: Process emits output
      const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
        call => call[0] === 'data'
      )?.[1];

      if (stdoutCallback) {
        stdoutCallback(Buffer.from('Test output\n'));
      }

      // Then: Output is captured
      expect(mockProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should limit log lines to prevent memory issues', async () => {
      // Given: Service with many log lines
      const serviceName = 'job-finder-backend';
      const mockProcess = {
        pid: 12345,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        kill: vi.fn(),
        exitCode: null
      } as any;

      mockSpawn.mockReturnValue(mockProcess);
      await processManager.startService(serviceName);

      // When: Many log lines are emitted
      const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
        call => call[0] === 'data'
      )?.[1];

      if (stdoutCallback) {
        // Emit more than maxLogLines
        for (let i = 0; i < 1500; i++) {
          stdoutCallback(Buffer.from(`Log line ${i}\n`));
        }
      }

      // Then: Log lines are limited
      const status = await processManager.getServiceStatus(serviceName);
      expect(status.logs?.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Error Handling', () => {
    it('should handle service start failures', async () => {
      // Given: Service start fails
      const serviceName = 'job-finder-backend';
      mockSpawn.mockImplementation(() => {
        throw new Error('Start failed');
      });

      // When: Service start is attempted
      await expect(processManager.startService(serviceName))
        .rejects.toThrow('Start failed');

      // Then: Error is logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Failed to start service')
        })
      );
    });

    it('should handle service stop failures', async () => {
      // Given: Service is running but stop fails
      const serviceName = 'job-finder-backend';
      const mockProcess = {
        pid: 12345,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        kill: vi.fn().mockImplementation(() => {
          throw new Error('Stop failed');
        }),
        exitCode: null
      } as any;

      mockSpawn.mockReturnValue(mockProcess);
      await processManager.startService(serviceName);

      // When: Service stop is attempted
      await expect(processManager.stopService(serviceName))
        .rejects.toThrow('Stop failed');
    });

    it('should handle invalid service names', async () => {
      // Given: Invalid service name
      const serviceName = 'invalid-service';

      // When: Service start is attempted
      await expect(processManager.startService(serviceName))
        .rejects.toThrow('Service "invalid-service" not found');

      // Then: Error is thrown
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should cleanup all processes on exit', async () => {
      // Given: Multiple services running
      const serviceName1 = 'job-finder-backend';
      const serviceName2 = 'job-finder-frontend';

      const mockProcess1 = {
        pid: 12345,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        kill: vi.fn(),
        exitCode: null
      } as any;

      const mockProcess2 = {
        pid: 12346,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        kill: vi.fn(),
        exitCode: null
      } as any;

      mockSpawn
        .mockReturnValueOnce(mockProcess1)
        .mockReturnValueOnce(mockProcess2);

      await processManager.startService(serviceName1);
      await processManager.startService(serviceName2);

      // When: Cleanup is triggered
      await processManager.cleanupAll();

      // Then: All processes are killed
      expect(mockProcess1.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockProcess2.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle cleanup errors gracefully', async () => {
      // Given: Process with kill error
      const serviceName = 'job-finder-backend';
      const mockProcess = {
        pid: 12345,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        kill: vi.fn().mockImplementation(() => {
          throw new Error('Kill failed');
        }),
        exitCode: null
      } as any;

      mockSpawn.mockReturnValue(mockProcess);
      await processManager.startService(serviceName);

      // When: Cleanup is attempted
      await expect(processManager.cleanupAll()).resolves.not.toThrow();

      // Then: Error is logged but cleanup continues
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Failed to cleanup process')
        })
      );
    });
  });

  describe('Status Reporting', () => {
    it('should return all service statuses', async () => {
      // Given: Multiple services
      const serviceName1 = 'job-finder-backend';
      const serviceName2 = 'job-finder-frontend';

      await processManager.startService(serviceName1);
      await processManager.startService(serviceName2);

      // When: All statuses are requested
      const statuses = await processManager.getAllStatuses();

      // Then: All service statuses are returned (at least the 2 we started)
      expect(statuses.length).toBeGreaterThanOrEqual(2);
      expect(statuses.find(s => s.name === serviceName1)).toBeDefined();
      expect(statuses.find(s => s.name === serviceName2)).toBeDefined();
    });

    it('should include Docker container status', async () => {
      // Given: Docker service
      const serviceName = 'job-finder-worker';
      vi.mocked(getDockerContainerInfo).mockResolvedValue({
        name: 'test-container',
        status: 'running',
        containerId: 'abc123'
      });

      await processManager.startService(serviceName);

      // When: Status is checked
      const status = await processManager.getServiceStatus(serviceName);

      // Then: Docker container info is included
      expect(status.dockerContainer).toBeDefined();
      expect(status.dockerContainer?.name).toBe('test-container');
      expect(status.dockerContainer?.status).toBe('running');
    });
  });
});