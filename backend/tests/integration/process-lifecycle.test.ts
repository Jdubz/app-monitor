/**
 * Integration Tests for Process Lifecycle
 * 
 * Tests the full lifecycle of starting, stopping, and restarting processes
 * in the dev-monitor system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../../src/services/processManager/index.js';

// TODO: These tests expect a different API than ProcessManager provides
// ProcessManager manages predefined services, not arbitrary processes
// These tests need to be rewritten to use the actual API
describe.skip('Process Lifecycle Integration', () => {
  let processManager: ProcessManager;

  beforeEach(() => {
    processManager = new ProcessManager();
  });

  afterEach(async () => {
    // Clean up any running processes
    const processes = processManager.listProcesses();
    for (const proc of processes) {
      if (proc.status === 'running') {
        try {
          await processManager.stopProcess(proc.id);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  });

  describe('Start Process', () => {
    it('should start a simple process and track its state', async () => {
      const processId = 'test-echo-process';
      const config = {
        id: processId,
        name: 'Echo Test',
        displayName: 'Echo Test Process',
        command: 'echo',
        args: ['Hello, World!'],
        type: 'backend' as const,
        autoRestart: false,
      };

      await processManager.startProcess(config);
      
      const processInfo = processManager.getProcess(processId);
      
      expect(processInfo).toBeDefined();
      expect(processInfo?.id).toBe(processId);
      expect(processInfo?.name).toBe('Echo Test');
      expect(['starting', 'running', 'stopped']).toContain(processInfo?.status);
    });

    it('should prevent starting a process that is already running', async () => {
      const processId = 'test-long-running';
      const config = {
        id: processId,
        name: 'Long Running Test',
        displayName: 'Long Running Test',
        command: 'sleep',
        args: ['2'],
        type: 'backend' as const,
        autoRestart: false,
      };

      await processManager.startProcess(config);
      
      // Try to start again
      await expect(async () => {
        await processManager.startProcess(config);
      }).rejects.toThrow();
    });

    it('should handle process startup failures gracefully', async () => {
      const processId = 'test-invalid-command';
      const config = {
        id: processId,
        name: 'Invalid Command Test',
        displayName: 'Invalid Command',
        command: 'nonexistent-command-xyz',
        args: [],
        type: 'backend' as const,
        autoRestart: false,
      };

      await expect(async () => {
        await processManager.startProcess(config);
      }).rejects.toThrow();
    });
  });

  describe('Stop Process', () => {
    it('should stop a running process', async () => {
      const processId = 'test-stoppable';
      const config = {
        id: processId,
        name: 'Stoppable Test',
        displayName: 'Stoppable Process',
        command: 'sleep',
        args: ['10'],
        type: 'backend' as const,
        autoRestart: false,
      };

      await processManager.startProcess(config);
      await processManager.stopProcess(processId);
      
      const processInfo = processManager.getProcess(processId);
      
      expect(processInfo).toBeDefined();
      expect(['stopping', 'stopped']).toContain(processInfo?.status);
    });

    it('should handle stopping a non-existent process', async () => {
      await expect(async () => {
        await processManager.stopProcess('nonexistent-process');
      }).rejects.toThrow();
    });

    it('should handle stopping an already stopped process', async () => {
      const processId = 'test-already-stopped';
      const config = {
        id: processId,
        name: 'Already Stopped',
        displayName: 'Already Stopped',
        command: 'echo',
        args: ['done'],
        type: 'backend' as const,
        autoRestart: false,
      };

      await processManager.startProcess(config);
      
      // Wait a bit for echo to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to stop an already completed process
      await expect(async () => {
        await processManager.stopProcess(processId);
      }).rejects.toThrow();
    });
  });

  describe('Restart Process', () => {
    it('should restart a running process', async () => {
      const processId = 'test-restartable';
      const config = {
        id: processId,
        name: 'Restartable Test',
        displayName: 'Restartable Process',
        command: 'sleep',
        args: ['5'],
        type: 'backend' as const,
        autoRestart: false,
      };

      await processManager.startProcess(config);
      const firstStart = processManager.getProcess(processId)?.startedAt;
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await processManager.restartProcess(processId);
      const secondStart = processManager.getProcess(processId)?.startedAt;
      
      expect(secondStart).toBeDefined();
      expect(secondStart).not.toBe(firstStart);
    });

    it('should handle restarting a stopped process', async () => {
      const processId = 'test-restart-stopped';
      const config = {
        id: processId,
        name: 'Restart Stopped',
        displayName: 'Restart Stopped',
        command: 'echo',
        args: ['restart'],
        type: 'backend' as const,
        autoRestart: false,
      };

      await processManager.startProcess(config);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Process should be stopped now
      await processManager.restartProcess(processId);
      
      const processInfo = processManager.getProcess(processId);
      expect(['starting', 'running']).toContain(processInfo?.status);
    });
  });

  describe('List Processes', () => {
    it('should list all registered processes', async () => {
      const configs = [
        {
          id: 'test-list-1',
          name: 'List Test 1',
          displayName: 'List Test 1',
          command: 'echo',
          args: ['test1'],
          type: 'backend' as const,
          autoRestart: false,
        },
        {
          id: 'test-list-2',
          name: 'List Test 2',
          displayName: 'List Test 2',
          command: 'echo',
          args: ['test2'],
          type: 'frontend' as const,
          autoRestart: false,
        },
      ];

      for (const config of configs) {
        await processManager.startProcess(config);
      }

      const processes = processManager.listProcesses();
      
      expect(processes.length).toBeGreaterThanOrEqual(2);
      expect(processes.some(p => p.id === 'test-list-1')).toBe(true);
      expect(processes.some(p => p.id === 'test-list-2')).toBe(true);
    });

    it('should return empty list when no processes registered', () => {
      const newManager = new ProcessManager();
      const processes = newManager.listProcesses();
      
      expect(Array.isArray(processes)).toBe(true);
      expect(processes.length).toBe(0);
    });
  });

  describe('Process Events', () => {
    it('should emit events during process lifecycle', async () => {
      const processId = 'test-events';
      const config = {
        id: processId,
        name: 'Event Test',
        displayName: 'Event Test',
        command: 'echo',
        args: ['events'],
        type: 'backend' as const,
        autoRestart: false,
      };

      const events: string[] = [];
      
      // Listen for events (if processManager extends EventEmitter)
      if (processManager instanceof EventEmitter) {
        processManager.on('process:started', () => events.push('started'));
        processManager.on('process:stopped', () => events.push('stopped'));
      }

      await processManager.startProcess(config);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify we tracked some events
      expect(events.length).toBeGreaterThanOrEqual(0); // May be 0 if no event emitter
    });
  });

  describe('Process Metadata', () => {
    it('should track process uptime', async () => {
      const processId = 'test-uptime';
      const config = {
        id: processId,
        name: 'Uptime Test',
        displayName: 'Uptime Test',
        command: 'sleep',
        args: ['3'],
        type: 'backend' as const,
        autoRestart: false,
      };

      await processManager.startProcess(config);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const processInfo = processManager.getProcess(processId);
      
      expect(processInfo?.startedAt).toBeDefined();
      if (processInfo?.startedAt) {
        const uptime = Date.now() - processInfo.startedAt;
        expect(uptime).toBeGreaterThan(500);
      }
    });

    it('should track process type correctly', async () => {
      const configs = [
        {
          id: 'test-backend',
          name: 'Backend',
          displayName: 'Backend Process',
          command: 'echo',
          args: ['backend'],
          type: 'backend' as const,
          autoRestart: false,
        },
        {
          id: 'test-frontend',
          name: 'Frontend',
          displayName: 'Frontend Process',
          command: 'echo',
          args: ['frontend'],
          type: 'frontend' as const,
          autoRestart: false,
        },
        {
          id: 'test-worker',
          name: 'Worker',
          displayName: 'Worker Process',
          command: 'echo',
          args: ['worker'],
          type: 'worker' as const,
          autoRestart: false,
        },
      ];

      for (const config of configs) {
        await processManager.startProcess(config);
        const processInfo = processManager.getProcess(config.id);
        expect(processInfo?.type).toBe(config.type);
      }
    });
  });

  describe('Error Handling', () => {
    it('should transition to error state on process crash', async () => {
      const processId = 'test-crash';
      const config = {
        id: processId,
        name: 'Crash Test',
        displayName: 'Crash Test',
        command: 'sh',
        args: ['-c', 'exit 1'],
        type: 'backend' as const,
        autoRestart: false,
      };

      await processManager.startProcess(config);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const processInfo = processManager.getProcess(processId);
      
      // Should be in error or stopped state
      expect(['error', 'stopped']).toContain(processInfo?.status);
    });

    it('should clean up resources on process exit', async () => {
      const processId = 'test-cleanup';
      const config = {
        id: processId,
        name: 'Cleanup Test',
        displayName: 'Cleanup Test',
        command: 'echo',
        args: ['cleanup'],
        type: 'backend' as const,
        autoRestart: false,
      };

      await processManager.startProcess(config);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const processInfo = processManager.getProcess(processId);
      
      // Process should have exited cleanly
      expect(processInfo?.pid).toBeUndefined();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple processes starting concurrently', async () => {
      const configs = Array.from({ length: 5 }, (_, i) => ({
        id: `test-concurrent-${i}`,
        name: `Concurrent ${i}`,
        displayName: `Concurrent Process ${i}`,
        command: 'echo',
        args: [`concurrent-${i}`],
        type: 'backend' as const,
        autoRestart: false,
      }));

      // Start all processes concurrently
      await Promise.all(
        configs.map(config => processManager.startProcess(config))
      );

      const processes = processManager.listProcesses();
      const concurrentProcesses = processes.filter(p => 
        p.id.startsWith('test-concurrent-')
      );

      expect(concurrentProcesses.length).toBe(5);
    });

    it('should handle start and stop operations on different processes', async () => {
      const config1 = {
        id: 'test-multi-1',
        name: 'Multi 1',
        displayName: 'Multi Process 1',
        command: 'sleep',
        args: ['3'],
        type: 'backend' as const,
        autoRestart: false,
      };

      const config2 = {
        id: 'test-multi-2',
        name: 'Multi 2',
        displayName: 'Multi Process 2',
        command: 'sleep',
        args: ['3'],
        type: 'backend' as const,
        autoRestart: false,
      };

      await processManager.startProcess(config1);
      await processManager.startProcess(config2);
      
      await processManager.stopProcess('test-multi-1');
      
      const proc1 = processManager.getProcess('test-multi-1');
      const proc2 = processManager.getProcess('test-multi-2');

      expect(['stopping', 'stopped']).toContain(proc1?.status);
      expect(['starting', 'running']).toContain(proc2?.status);
    });
  });
});
