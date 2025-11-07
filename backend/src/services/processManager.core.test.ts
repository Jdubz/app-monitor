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
import { EventEmitter } from 'events';

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
  let processKillSpy: ReturnType<typeof vi.spyOn>;
  let processOnSpy: ReturnType<typeof vi.spyOn>;
  let mockProcesses: Map<number, EventEmitter>;
  let nextPid: number;

  const createMockChildProcess = () => {
    const emitter = new EventEmitter();
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();

    const processObject: any = {
      pid: nextPid++,
      stdout,
      stderr,
      kill: vi.fn((signal?: NodeJS.Signals) => {
        setImmediate(() => emitter.emit('exit', 0, signal ?? 'SIGTERM'));
        return true;
      }),
      on: emitter.on.bind(emitter),
      once: emitter.once.bind(emitter),
      removeListener: emitter.removeListener.bind(emitter),
    };

    mockProcesses.set(processObject.pid, emitter);

    // Emit a log line shortly after start so ProcessManager transitions to running
    setImmediate(() => {
      stdout.emit('data', Buffer.from('service booted'));
    });

    return processObject;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcesses = new Map();
    nextPid = 1000;

    processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    processKillSpy = vi
      .spyOn(process, 'kill')
      .mockImplementation((pid: number | string, signal?: NodeJS.Signals) => {
        const numericPid =
          typeof pid === 'number' ? Math.abs(pid) : Math.abs(parseInt(pid, 10));
        const emitter = mockProcesses.get(numericPid);
        if (emitter) {
          setImmediate(() => emitter.emit('exit', 0, signal ?? 'SIGTERM'));
        }
        return true;
      });

    // Mock spawn
    mockSpawn = vi.mocked(spawn);
    mockSpawn.mockImplementation(() => createMockChildProcess());

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

    processManager = new ProcessManager();
  });

  afterEach(() => {
    processKillSpy.mockRestore();
    processOnSpy.mockRestore();
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
      const mockProcess = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProcess);
      await processManager.startService(serviceName);

      const resultPromise = processManager.stopService(serviceName);

      // Simulate the exit event that gracefulStop waits for
      mockProcesses.get(mockProcess.pid)?.emit('exit', 0, 'SIGTERM');
      const result = await resultPromise;

      expect(processKillSpy).toHaveBeenCalledWith(-mockProcess.pid, 'SIGTERM');
      expect(result.status).toBe('stopped');
    });

    it('should restart service (stop then start)', async () => {
      // Given: Service is running
      const serviceName = 'job-finder-backend';
      const mockProcess = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProcess);
      await processManager.startService(serviceName);

      const restartPromise = processManager.restartService(serviceName);
      mockProcesses.get(mockProcess.pid)?.emit('exit', 0, 'SIGTERM');
      const result = await restartPromise;

      expect(processKillSpy).toHaveBeenCalledWith(-mockProcess.pid, 'SIGTERM');
      expect(mockSpawn).toHaveBeenCalledTimes(2);
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

    // Test removed: Port clearing functionality doesn't exist
    // All services have requirePorts: true and throw errors when ports are busy
    // This is the correct behavior - services should fail fast if ports aren't available

    // Test removed: Alternative port fallback doesn't exist
    // All services have requirePorts: true and throw errors when ports are busy
    // There's no alternative port logic - this is intentional for predictable deployments
  });

  // Docker Container Management tests removed
  // job-finder-worker is now Flask-based and runs as a regular Python process
  // Docker-specific logic has been removed from ProcessManager after Flask migration

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

    // Test removed: Log limiting test no longer applicable
    // Logs are now written to files and read via LogWatcher, not exposed via ProcessInfo
    // Internal log limiting still happens (maxLogLines = 1000) but isn't publicly testable
    // See processManager.ts:446 - getServiceLogs removed, logs read from files via LogWatcher
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
      // The actual error message is "Failed to stop ${serviceName}: ${err.message}"
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Failed to stop job-finder-backend')
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

    // Test removed: Docker container status test no longer relevant
    // job-finder-worker is now Flask-based and runs as a regular Python process
    // Docker-specific logic has been removed from ProcessManager
  });
});
