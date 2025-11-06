/**
 * Integration Tests for Process Lifecycle
 *
 * Tests the full lifecycle of starting, stopping, and restarting services
 * in the dev-monitor system using the actual ProcessManager API.
 *
 * Note: These tests mock child_process.spawn to avoid actually spawning processes
 * and causing system resource issues during test runs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessManager } from '../../src/services/processManager/index.js';
import { logger } from '../../src/utils/logger.js';
import { EventEmitter } from 'events';

// Mock logger to avoid noise in tests
vi.mock('../../src/utils/logger.js');

// Mock child_process to avoid spawning real processes
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock port utilities
vi.mock('../../src/utils/portCheck.js', () => ({
  checkPortsAvailable: vi.fn().mockResolvedValue({ available: true, busyPorts: [] }),
  getPortInfo: vi.fn().mockResolvedValue({ port: 5000, pid: null, process: null }),
}));

vi.mock('../../src/utils/portManager.js', () => ({
  isPortInUse: vi.fn().mockResolvedValue(false),
  stopDockerContainer: vi.fn().mockResolvedValue({ success: true }),
  getDockerContainerInfo: vi.fn().mockResolvedValue(null),
}));

// Mock fs for log files
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn().mockReturnValue({
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    }),
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(''),
  },
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn().mockReturnValue({
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  }),
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue(''),
}));

describe('Process Lifecycle Integration', () => {
  let processManager: ProcessManager;
  let mockSpawn: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock logger
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});
    vi.mocked(logger.debug).mockImplementation(() => {});

    // Setup spawn mock
    const { spawn } = await import('child_process');
    mockSpawn = vi.mocked(spawn);

    // Create a mock child process
    const mockProcess = new EventEmitter() as any;
    mockProcess.pid = 12345;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn();
    mockProcess.exitCode = null;

    mockSpawn.mockReturnValue(mockProcess);

    processManager = new ProcessManager();
  });

  afterEach(async () => {
    // Clean up any running services
    try {
      const services = await processManager.getAllStatuses();
      for (const service of services) {
        if (service.status === 'running') {
          try {
            await processManager.stopService(service.name);
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      }

      // Remove all event listeners to prevent memory leaks
      processManager.removeAllListeners();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Start Service', () => {
    it('should start a service and track its state', async () => {
      const serviceName = 'job-finder-backend';

      const result = await processManager.startService(serviceName);

      expect(result).toBeDefined();
      expect(result.name).toBe(serviceName);
      expect(['starting', 'running']).toContain(result.status);

      // Verify we can get the status
      const status = await processManager.getServiceStatus(serviceName);
      expect(status).toBeDefined();
      expect(status.name).toBe(serviceName);
    });

    it('should handle starting a service that is already running', async () => {
      const serviceName = 'job-finder-backend';

      await processManager.startService(serviceName);

      // Try to start again - should warn but not error
      const result = await processManager.startService(serviceName);

      expect(result).toBeDefined();
      expect(result.status).toBe('running');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('already running'),
        })
      );
    });

    it('should handle invalid service names gracefully', async () => {
      const serviceName = 'nonexistent-service-xyz';

      await expect(processManager.startService(serviceName)).rejects.toThrow(
        'Service "nonexistent-service-xyz" not found'
      );
    });
  });

  describe('Stop Service', () => {
    it('should stop a running service', async () => {
      const serviceName = 'job-finder-backend';

      await processManager.startService(serviceName);
      const result = await processManager.stopService(serviceName);

      expect(result).toBeDefined();
      expect(result.name).toBe(serviceName);
      expect(['stopping', 'stopped']).toContain(result.status);
    });

    it('should handle stopping a non-existent service', async () => {
      await expect(
        processManager.stopService('nonexistent-service')
      ).rejects.toThrow('Service "nonexistent-service" not found');
    });

    it('should handle stopping an already stopped service', async () => {
      const serviceName = 'job-finder-backend';

      await processManager.startService(serviceName);
      await processManager.stopService(serviceName);

      // Try to stop again - should throw error
      await expect(processManager.stopService(serviceName)).rejects.toThrow(
        'not running'
      );
    });
  });

  describe('Restart Service', () => {
    it('should restart a running service', async () => {
      const serviceName = 'job-finder-backend';

      await processManager.startService(serviceName);
      const firstStatus = await processManager.getServiceStatus(serviceName);
      const firstStart = firstStatus.startedAt;

      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await processManager.restartService(serviceName);
      const secondStatus = await processManager.getServiceStatus(serviceName);
      const secondStart = secondStatus.startedAt;

      expect(result).toBeDefined();
      expect(result.status).toBe('running');
      expect(secondStart).toBeDefined();
      expect(secondStart).not.toBe(firstStart);
      expect(secondStart).toBeGreaterThan(firstStart || 0);
    });

    it('should handle restarting a stopped service', async () => {
      const serviceName = 'job-finder-backend';

      await processManager.startService(serviceName);
      await processManager.stopService(serviceName);

      // Service is now stopped, try to restart
      const result = await processManager.restartService(serviceName);

      expect(result).toBeDefined();
      expect(['starting', 'running']).toContain(result.status);
    });
  });

  describe('List Services', () => {
    it('should list all service statuses', async () => {
      const serviceNames = ['job-finder-backend', 'job-finder-frontend'];

      for (const serviceName of serviceNames) {
        await processManager.startService(serviceName);
      }

      const statuses = await processManager.getAllStatuses();

      expect(statuses.length).toBeGreaterThanOrEqual(2);
      expect(statuses.some((s) => s.name === 'job-finder-backend')).toBe(true);
      expect(statuses.some((s) => s.name === 'job-finder-frontend')).toBe(true);
    });

    it('should return statuses even when no services are running', async () => {
      const newManager = new ProcessManager();
      const statuses = await newManager.getAllStatuses();

      expect(Array.isArray(statuses)).toBe(true);
      // Should return all configured services with their current status
      expect(statuses.length).toBeGreaterThan(0);
    });
  });

  describe('Service Events', () => {
    it('should emit events during service lifecycle', async () => {
      const serviceName = 'job-finder-backend';

      const events: string[] = [];

      // ProcessManager extends EventEmitter
      processManager.on('process:started', (data) => {
        events.push(`started:${data?.name || 'unknown'}`);
      });
      processManager.on('process:stopped', (data) => {
        events.push(`stopped:${data?.name || 'unknown'}`);
      });

      await processManager.startService(serviceName);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await processManager.stopService(serviceName);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify we tracked events
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Service Metadata', () => {
    it('should track service uptime', async () => {
      const serviceName = 'job-finder-backend';

      await processManager.startService(serviceName);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const serviceInfo = await processManager.getServiceStatus(serviceName);

      expect(serviceInfo.startedAt).toBeDefined();
      if (serviceInfo.startedAt) {
        const uptime = Date.now() - serviceInfo.startedAt;
        expect(uptime).toBeGreaterThan(50);
      }
      expect(serviceInfo.uptime).toBeDefined();
      expect(serviceInfo.uptime).toBeGreaterThan(0);
    });

    it('should include service display name and metadata', async () => {
      const serviceName = 'job-finder-backend';

      await processManager.startService(serviceName);

      const serviceInfo = await processManager.getServiceStatus(serviceName);

      expect(serviceInfo.name).toBe(serviceName);
      expect(serviceInfo.displayName).toBeDefined();
      expect(serviceInfo.displayName).toBeTruthy();
      expect(serviceInfo.pid).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      const serviceName = 'job-finder-backend';

      await processManager.startService(serviceName);

      // Service is running, verify status
      const serviceInfo = await processManager.getServiceStatus(serviceName);
      expect(['running', 'starting']).toContain(serviceInfo.status);
    });

    it('should clean up resources on service stop', async () => {
      const serviceName = 'job-finder-backend';

      await processManager.startService(serviceName);
      await processManager.stopService(serviceName);

      const serviceInfo = await processManager.getServiceStatus(serviceName);

      // Process should have stopped cleanly
      expect(serviceInfo.status).toBe('stopped');
      expect(serviceInfo.pid).toBeUndefined();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple services starting concurrently', async () => {
      const serviceNames = ['job-finder-backend', 'job-finder-frontend', 'job-finder-worker'];

      // Start all services concurrently
      await Promise.all(
        serviceNames.map((name) => processManager.startService(name))
      );

      const statuses = await processManager.getAllStatuses();
      const startedServices = statuses.filter((s) =>
        serviceNames.includes(s.name)
      );

      expect(startedServices.length).toBe(3);
      startedServices.forEach((service) => {
        expect(['starting', 'running']).toContain(service.status);
      });
    });

    it('should handle start and stop operations on different services', async () => {
      const service1 = 'job-finder-backend';
      const service2 = 'job-finder-frontend';

      await processManager.startService(service1);
      await processManager.startService(service2);

      await processManager.stopService(service1);

      const status1 = await processManager.getServiceStatus(service1);
      const status2 = await processManager.getServiceStatus(service2);

      expect(['stopping', 'stopped']).toContain(status1.status);
      expect(['starting', 'running']).toContain(status2.status);
    });
  });
});
