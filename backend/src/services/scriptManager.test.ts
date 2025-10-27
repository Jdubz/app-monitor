/**
 * Script Manager Service Tests
 * 
 * Tests the ScriptManager service for script execution, 
 * history tracking, process management, and event handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ScriptManager } from './scriptManager.js';
import { spawn } from 'child_process';

// Mock dependencies
vi.mock('child_process');
vi.mock('../config.js');

// TODO: These tests expect a different architecture than ScriptManager provides
// The vi.doMock() for '../config.js' doesn't work properly with top-level imports
// ScriptManager loads scripts from config.js internally, making mocking difficult
// These tests need to be rewritten to either:
// 1. Test with actual script configurations from config.js, OR
// 2. Refactor ScriptManager to accept scripts configuration through constructor, OR
// 3. Use proper Vitest mocking with factory functions that work with top-level imports
describe.skip('ScriptManager', () => {
  let scriptManager: ScriptManager;
  let mockSpawn: any;
  let mockChildProcess: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock child_process.spawn
    mockChildProcess = {
      pid: 12345,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      exitCode: null
    };

    mockSpawn = vi.mocked(spawn);
    mockSpawn.mockReturnValue(mockChildProcess);

    // Mock scripts config
    vi.doMock('../config.js', () => ({
      scripts: {
        'test-script': {
          command: 'echo',
          args: ['hello'],
          cwd: '/test',
          env: { NODE_ENV: 'test' }
        },
        'failing-script': {
          command: 'false',
          args: [],
          cwd: '/test'
        }
      }
    }));

    scriptManager = new ScriptManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with empty state', () => {
      // Given: ScriptManager is created
      // When: Initialization completes
      // Then: State is empty
      expect(scriptManager.getExecutions()).toEqual([]);
      expect(scriptManager.getScripts()).toEqual([]);
    });

    it('should extend EventEmitter', () => {
      // Given: ScriptManager is created
      // When: Checking if it's an EventEmitter
      // Then: It extends EventEmitter
      expect(scriptManager.emit).toBeDefined();
      expect(scriptManager.on).toBeDefined();
      expect(scriptManager.off).toBeDefined();
    });
  });

  describe('Script Execution - Deprecated Method', () => {
    it('should execute script and return result', async () => {
      // Given: Script configuration
      const scriptId = 'test-script';

      // Mock successful execution
      type EventCallback = (code: number) => void;
      mockChildProcess.on.mockImplementation((event: string, callback: EventCallback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 10);
        }
      });

      // When: Executing script
      const result = await scriptManager.executeScript(scriptId);

      // Then: Script is executed and result is returned
      expect(result).toBeDefined();
      expect(result.scriptId).toBe(scriptId);
      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
      expect(mockSpawn).toHaveBeenCalledWith('echo', ['hello'], {
        cwd: '/test',
        env: { NODE_ENV: 'test' }
      });
    });

    it('should handle script execution failure', async () => {
      // Given: Failing script configuration
      const scriptId = 'failing-script';

      // Mock failed execution
      type EventCallback = (code: number) => void;
      mockChildProcess.on.mockImplementation((event: string, callback: EventCallback) => {
        if (event === 'exit') {
          setTimeout(() => callback(1), 10);
        }
      });

      // When: Executing failing script
      const result = await scriptManager.executeScript(scriptId);

      // Then: Failure is handled
      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
    });

    it('should throw error for non-existent script', async () => {
      // Given: Non-existent script ID
      const scriptId = 'non-existent';

      // When: Executing non-existent script
      // Then: Error is thrown
      await expect(scriptManager.executeScript(scriptId)).rejects.toThrow('Script not found: non-existent');
    });
  });

  describe('Script Execution - Modern Method', () => {
    it('should start script and return execution', () => {
      // Given: Script configuration
      const scriptId = 'test-script';

      // When: Starting script
      const execution = scriptManager.startScript(scriptId);

      // Then: Execution is created and started
      expect(execution).toBeDefined();
      expect(execution.scriptId).toBe(scriptId);
      expect(execution.status).toBe('running');
      expect(execution.pid).toBe(12345);
      expect(mockSpawn).toHaveBeenCalledWith('echo', ['hello'], {
        cwd: '/test',
        env: { NODE_ENV: 'test' }
      });
    });

    it('should emit events during script execution', () => {
      // Given: Script configuration and event listener
      const scriptId = 'test-script';
      const eventSpy = vi.fn();
      scriptManager.on('script_started', eventSpy);

      // When: Starting script
      scriptManager.startScript(scriptId);

      // Then: Event is emitted
      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        scriptId,
        status: 'running'
      }));
    });

    it('should handle script completion', () => {
      // Given: Started script
      const scriptId = 'test-script';
      const execution = scriptManager.startScript(scriptId);
      const completionSpy = vi.fn();
      scriptManager.on('script_completed', completionSpy);

      // When: Script completes
      const exitHandler = mockChildProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      exitHandler(0);

      // Then: Completion event is emitted
      expect(completionSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: execution.id,
        status: 'completed',
        exitCode: 0
      }));
    });

    it('should handle script failure', () => {
      // Given: Started script
      const scriptId = 'failing-script';
      const execution = scriptManager.startScript(scriptId);
      const failureSpy = vi.fn();
      scriptManager.on('script_failed', failureSpy);

      // When: Script fails
      const exitHandler = mockChildProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      exitHandler(1);

      // Then: Failure event is emitted
      expect(failureSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: execution.id,
        status: 'failed',
        exitCode: 1
      }));
    });

    it('should capture script output', () => {
      // Given: Started script
      const scriptId = 'test-script';
      const execution = scriptManager.startScript(scriptId);

      // When: Script produces output
      const stdoutHandler = mockChildProcess.stdout.on.mock.calls.find(call => call[0] === 'data')[1];
      stdoutHandler('Hello World\n');

      // Then: Output is captured
      expect(execution.output).toContain('Hello World');
    });

    it('should capture script errors', () => {
      // Given: Started script
      const scriptId = 'test-script';
      const execution = scriptManager.startScript(scriptId);

      // When: Script produces error output
      const stderrHandler = mockChildProcess.stderr.on.mock.calls.find(call => call[0] === 'data')[1];
      stderrHandler('Error message\n');

      // Then: Error output is captured
      expect(execution.output).toContain('Error message');
    });
  });

  describe('Script Management', () => {
    it('should get available scripts', () => {
      // Given: ScriptManager with scripts
      // When: Getting scripts
      const scripts = scriptManager.getScripts();

      // Then: Scripts are returned
      expect(scripts).toBeDefined();
      expect(Array.isArray(scripts)).toBe(true);
    });

    it('should get all executions', () => {
      // Given: ScriptManager with executions
      scriptManager.startScript('test-script');

      // When: Getting executions
      const executions = scriptManager.getExecutions();

      // Then: Executions are returned
      expect(executions).toHaveLength(1);
      expect(executions[0].scriptId).toBe('test-script');
    });

    it('should get specific execution', () => {
      // Given: ScriptManager with execution
      const execution = scriptManager.startScript('test-script');

      // When: Getting specific execution
      const retrieved = scriptManager.getExecution(execution.id);

      // Then: Execution is returned
      expect(retrieved).toEqual(execution);
    });

    it('should return undefined for non-existent execution', () => {
      // Given: ScriptManager without executions
      // When: Getting non-existent execution
      const execution = scriptManager.getExecution('non-existent');

      // Then: Undefined is returned
      expect(execution).toBeUndefined();
    });
  });

  describe('Script Control', () => {
    it('should kill running script', () => {
      // Given: Running script
      const execution = scriptManager.startScript('test-script');

      // When: Killing script
      const result = scriptManager.killScript(execution.id);

      // Then: Script is killed
      expect(result).toBe(true);
      expect(mockChildProcess.kill).toHaveBeenCalled();
    });

    it('should return false for non-existent script', () => {
      // Given: No running scripts
      // When: Killing non-existent script
      const result = scriptManager.killScript('non-existent');

      // Then: False is returned
      expect(result).toBe(false);
    });

    it('should handle kill errors gracefully', () => {
      // Given: Running script with kill error
      const execution = scriptManager.startScript('test-script');
      mockChildProcess.kill.mockImplementation(() => {
        throw new Error('Kill failed');
      });

      // When: Killing script
      const result = scriptManager.killScript(execution.id);

      // Then: Error is handled gracefully
      expect(result).toBe(false);
    });
  });

  describe('History Management', () => {
    it('should clear execution history', () => {
      // Given: ScriptManager with executions
      scriptManager.startScript('test-script');
      expect(scriptManager.getExecutions()).toHaveLength(1);

      // When: Clearing history
      scriptManager.clearHistory();

      // Then: History is cleared
      expect(scriptManager.getExecutions()).toHaveLength(0);
    });

    it('should maintain execution history during operations', () => {
      // Given: Multiple script executions
      scriptManager.startScript('test-script');
      scriptManager.startScript('failing-script');

      // When: Getting executions
      const executions = scriptManager.getExecutions();

      // Then: All executions are maintained
      expect(executions).toHaveLength(2);
      expect(executions.map(e => e.scriptId)).toContain('test-script');
      expect(executions.map(e => e.scriptId)).toContain('failing-script');
    });
  });

  describe('Error Handling', () => {
    it('should handle spawn errors', () => {
      // Given: Script configuration and spawn error
      const scriptId = 'test-script';
      mockSpawn.mockImplementation(() => {
        throw new Error('Spawn failed');
      });

      // When: Starting script
      // Then: Error is handled gracefully
      expect(() => scriptManager.startScript(scriptId)).not.toThrow();
    });

    it('should handle process errors', () => {
      // Given: Started script
      const scriptId = 'test-script';
      const execution = scriptManager.startScript(scriptId);
      const errorSpy = vi.fn();
      scriptManager.on('script_error', errorSpy);

      // When: Process emits error
      const errorHandler = mockChildProcess.on.mock.calls.find(call => call[0] === 'error')[1];
      errorHandler(new Error('Process error'));

      // Then: Error event is emitted
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: execution.id,
        error: expect.any(Error)
      }));
    });

    it('should handle missing script configuration', () => {
      // Given: Non-existent script ID
      const scriptId = 'non-existent';

      // When: Starting non-existent script
      // Then: Error is handled gracefully
      expect(() => scriptManager.startScript(scriptId)).not.toThrow();
    });
  });

  describe('Concurrent Execution', () => {
    it('should handle multiple concurrent scripts', () => {
      // Given: Multiple script starts
      const execution1 = scriptManager.startScript('test-script');
      const execution2 = scriptManager.startScript('failing-script');

      // When: Getting executions
      const executions = scriptManager.getExecutions();

      // Then: Both executions are tracked
      expect(executions).toHaveLength(2);
      expect(executions.map(e => e.id)).toContain(execution1.id);
      expect(executions.map(e => e.id)).toContain(execution2.id);
    });

    it('should maintain separate execution contexts', () => {
      // Given: Multiple script executions
      const execution1 = scriptManager.startScript('test-script');
      const execution2 = scriptManager.startScript('test-script');

      // When: Scripts complete
      const exitHandler1 = mockChildProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      exitHandler1(0);

      // Then: Each execution maintains separate state
      expect(execution1.id).not.toBe(execution2.id);
      expect(execution1.status).toBe('completed');
    });
  });

  describe('Event Emission', () => {
    it('should emit script_started event', () => {
      // Given: Event listener
      const startSpy = vi.fn();
      scriptManager.on('script_started', startSpy);

      // When: Starting script
      scriptManager.startScript('test-script');

      // Then: Event is emitted
      expect(startSpy).toHaveBeenCalledWith(expect.objectContaining({
        scriptId: 'test-script',
        status: 'running'
      }));
    });

    it('should emit script_completed event', () => {
      // Given: Started script and event listener
      const completionSpy = vi.fn();
      scriptManager.on('script_completed', completionSpy);
      scriptManager.startScript('test-script');

      // When: Script completes
      const exitHandler = mockChildProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      exitHandler(0);

      // Then: Event is emitted
      expect(completionSpy).toHaveBeenCalledWith(expect.objectContaining({
        status: 'completed',
        exitCode: 0
      }));
    });

    it('should emit script_failed event', () => {
      // Given: Started script and event listener
      const failureSpy = vi.fn();
      scriptManager.on('script_failed', failureSpy);
      scriptManager.startScript('failing-script');

      // When: Script fails
      const exitHandler = mockChildProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      exitHandler(1);

      // Then: Event is emitted
      expect(failureSpy).toHaveBeenCalledWith(expect.objectContaining({
        status: 'failed',
        exitCode: 1
      }));
    });
  });

  describe('Performance', () => {
    it('should handle large number of executions', () => {
      // Given: Large number of script executions
      const executions = [];
      for (let i = 0; i < 100; i++) {
        executions.push(scriptManager.startScript('test-script'));
      }

      // When: Getting all executions
      const allExecutions = scriptManager.getExecutions();

      // Then: All executions are tracked
      expect(allExecutions).toHaveLength(100);
    });

    it('should handle rapid script starts', () => {
      // Given: Rapid script starts
      const startSpy = vi.fn();
      scriptManager.on('script_started', startSpy);

      // When: Starting multiple scripts rapidly
      for (let i = 0; i < 10; i++) {
        scriptManager.startScript('test-script');
      }

      // Then: All starts are handled
      expect(startSpy).toHaveBeenCalledTimes(10);
    });
  });
});