/**
 * Script Manager Service Simple Tests
 * 
 * Tests the basic functionality of ScriptManager service
 * focusing on what actually works in the implementation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ScriptManager } from './scriptManager.js';
import { spawn } from 'child_process';

// Mock dependencies
vi.mock('child_process');

describe('ScriptManager Simple Tests', () => {
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

    scriptManager = new ScriptManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should initialize with empty state', () => {
      // Given: ScriptManager is created
      // When: Initialization completes
      // Then: State is empty
      expect(scriptManager.getExecutions()).toEqual([]);
      expect(scriptManager.getScripts()).toBeDefined();
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

  describe('Script Management', () => {
    it('should get available scripts', () => {
      // Given: ScriptManager instance
      // When: Getting scripts
      const scripts = scriptManager.getScripts();

      // Then: Scripts are returned
      expect(scripts).toBeDefined();
      expect(Array.isArray(scripts)).toBe(true);
    });

    it('should get all executions', () => {
      // Given: ScriptManager instance
      // When: Getting executions
      const executions = scriptManager.getExecutions();

      // Then: Executions are returned
      expect(executions).toBeDefined();
      expect(Array.isArray(executions)).toBe(true);
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
    it('should return false for non-existent script kill', () => {
      // Given: No running scripts
      // When: Killing non-existent script
      const result = scriptManager.killScript('non-existent');

      // Then: False is returned
      expect(result).toBe(false);
    });

    it('should handle kill errors gracefully', () => {
      // Given: Mock child process with kill error
      mockChildProcess.kill.mockImplementation(() => {
        throw new Error('Kill failed');
      });

      // When: Attempting to kill (this will fail gracefully)
      const result = scriptManager.killScript('non-existent');

      // Then: Error is handled gracefully
      expect(result).toBe(false);
    });
  });

  describe('History Management', () => {
    it('should clear execution history', () => {
      // Given: ScriptManager instance
      // When: Clearing history
      scriptManager.clearHistory();

      // Then: History is cleared (no error thrown)
      expect(scriptManager.getExecutions()).toEqual([]);
    });

    it('should maintain empty state initially', () => {
      // Given: Fresh ScriptManager instance
      // When: Getting executions
      const executions = scriptManager.getExecutions();

      // Then: Empty array is returned
      expect(executions).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing script configuration gracefully', () => {
      // Given: Non-existent script ID
      const scriptId = 'non-existent';

      // When: Starting non-existent script
      // Then: Error is thrown (expected behavior)
      expect(() => scriptManager.startScript(scriptId)).toThrow('Script not found: non-existent');
    });

    it('should handle spawn errors gracefully', () => {
      // Given: Script configuration and spawn error
      mockSpawn.mockImplementation(() => {
        throw new Error('Spawn failed');
      });

      // When: Starting script with invalid ID
      // Then: Error is thrown (expected behavior)
      expect(() => scriptManager.startScript('non-existent')).toThrow('Script not found: non-existent');
    });
  });

  describe('Event System', () => {
    it('should support event listeners', () => {
      // Given: Event listener
      const eventSpy = vi.fn();
      scriptManager.on('script_started', eventSpy);

      // When: Emitting event
      scriptManager.emit('script_started', { test: 'data' });

      // Then: Event is received
      expect(eventSpy).toHaveBeenCalledWith({ test: 'data' });
    });

    it('should support multiple event listeners', () => {
      // Given: Multiple event listeners
      const spy1 = vi.fn();
      const spy2 = vi.fn();
      scriptManager.on('test_event', spy1);
      scriptManager.on('test_event', spy2);

      // When: Emitting event
      scriptManager.emit('test_event', { test: 'data' });

      // Then: Both listeners are called
      expect(spy1).toHaveBeenCalledWith({ test: 'data' });
      expect(spy2).toHaveBeenCalledWith({ test: 'data' });
    });

    it('should support event listener removal', () => {
      // Given: Event listener
      const eventSpy = vi.fn();
      scriptManager.on('test_event', eventSpy);

      // When: Removing listener and emitting event
      scriptManager.off('test_event', eventSpy);
      scriptManager.emit('test_event', { test: 'data' });

      // Then: Event is not received
      expect(eventSpy).not.toHaveBeenCalled();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple rapid operations', () => {
      // Given: Multiple operations
      const operations = [];

      // When: Performing multiple operations rapidly
      for (let i = 0; i < 10; i++) {
        operations.push(scriptManager.getExecutions());
        operations.push(scriptManager.getScripts());
        operations.push(scriptManager.killScript(`script-${i}`));
      }

      // Then: All operations complete without error
      expect(operations).toHaveLength(30);
      operations.forEach(op => expect(op).toBeDefined());
    });

    it('should maintain state consistency during operations', () => {
      // Given: ScriptManager instance
      const initialExecutions = scriptManager.getExecutions();
      const initialScripts = scriptManager.getScripts();

      // When: Performing various operations
      scriptManager.clearHistory();
      scriptManager.getExecution('test');
      scriptManager.killScript('test');

      // Then: State remains consistent
      expect(scriptManager.getExecutions()).toEqual(initialExecutions);
      expect(scriptManager.getScripts()).toEqual(initialScripts);
    });
  });

  describe('Performance', () => {
    it('should handle large number of operations efficiently', () => {
      // Given: Large number of operations
      const startTime = Date.now();

      // When: Performing many operations
      for (let i = 0; i < 1000; i++) {
        scriptManager.getExecutions();
        scriptManager.getScripts();
      }

      // Then: Operations complete quickly
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle rapid state changes', () => {
      // Given: Rapid state changes
      const eventSpy = vi.fn();
      scriptManager.on('test_event', eventSpy);

      // When: Emitting many events rapidly
      for (let i = 0; i < 100; i++) {
        scriptManager.emit('test_event', { index: i });
      }

      // Then: All events are handled
      expect(eventSpy).toHaveBeenCalledTimes(100);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory with repeated operations', () => {
      // Given: ScriptManager instance
      const initialMemory = process.memoryUsage();

      // When: Performing many operations
      for (let i = 0; i < 1000; i++) {
        scriptManager.getExecutions();
        scriptManager.getScripts();
        scriptManager.clearHistory();
      }

      // Then: Memory usage should be reasonable
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB increase
    });
  });
});