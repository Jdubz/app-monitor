/**
 * Worker Log Service Unit Tests
 * 
 * Tests log file initialization, stream management, and cleanup.
 * Part of P1 refactoring plan - Week 2: Extract Log Management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WorkerLogService } from '../WorkerLogService.js';

const TEST_LOG_DIR = path.join(process.cwd(), 'test-logs-temp');
const CONSOLIDATED_LOG = path.join(TEST_LOG_DIR, 'consolidated.log');

describe('WorkerLogService', () => {
  let service: WorkerLogService;

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
    
    service = new WorkerLogService({
      logsDirectory: TEST_LOG_DIR,
      consolidatedLogPath: CONSOLIDATED_LOG
    });
  });

  afterEach(async () => {
    // Shutdown service and cleanup
    await service.shutdown();
    
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create log directory if it does not exist', () => {
      expect(fs.existsSync(TEST_LOG_DIR)).toBe(true);
    });

    it('should verify log directory is writable', () => {
      // Should not throw
      expect(() => {
        new WorkerLogService({ logsDirectory: TEST_LOG_DIR });
      }).not.toThrow();
    });

    it('should throw if log directory is not writable', () => {
      const readOnlyDir = path.join(TEST_LOG_DIR, 'readonly');
      fs.mkdirSync(readOnlyDir, { recursive: true });
      fs.chmodSync(readOnlyDir, 0o444); // Read-only

      expect(() => {
        new WorkerLogService({ logsDirectory: readOnlyDir });
      }).toThrow();

      // Cleanup
      fs.chmodSync(readOnlyDir, 0o755);
      fs.rmSync(readOnlyDir, { recursive: true });
    });
  });

  describe('initializeWorkerLogFile', () => {
    it('should create a log file with header', async () => {
      await service.initializeWorkerLogFile('worker-123');

      const logPath = path.join(TEST_LOG_DIR, 'worker-123.log');
      expect(fs.existsSync(logPath)).toBe(true);

      const content = fs.readFileSync(logPath, 'utf8');
      expect(content).toContain('=== Dev-Bot Worker Log ===');
      expect(content).toContain('Worker ID: worker-123');
      expect(content).toContain('Initialized:');
    });

    it('should sanitize worker ID for filesystem', async () => {
      await service.initializeWorkerLogFile('worker@123#test!');

      const logPath = path.join(TEST_LOG_DIR, 'worker_123_test_.log');
      expect(fs.existsSync(logPath)).toBe(true);
    });

    it('should handle filesystem errors', async () => {
      // Create a read-only file where we want to write
      const readOnlyPath = path.join(TEST_LOG_DIR, 'worker-readonly.log');
      fs.writeFileSync(readOnlyPath, 'existing');
      fs.chmodSync(readOnlyPath, 0o444); // Read-only

      try {
        await expect(
          service.initializeWorkerLogFile('worker-readonly')
        ).rejects.toThrow();
      } finally {
        // Cleanup
        fs.chmodSync(readOnlyPath, 0o644);
        fs.unlinkSync(readOnlyPath);
      }
    });
  });

  describe('createLogStream', () => {
    it('should create a write stream with header', () => {
      const worker = {
        id: 'worker-123',
        agentId: 'claude',
        taskId: 'task-456',
        taskTitle: 'Test Task'
      };

      const stream = service.createLogStream(worker);

      expect(stream).toBeDefined();
      expect(stream.writable).toBe(true);
    });

    it('should write header to consolidated log', async () => {
      const worker = {
        id: 'worker-123',
        agentId: 'claude',
        taskId: 'task-456',
        taskTitle: 'Test Task'
      };

      const stream = service.createLogStream(worker);
      
      // Wait for async write
      await new Promise(resolve => setTimeout(resolve, 50));
      stream.end();
      await new Promise(resolve => stream.on('close', resolve));

      const content = fs.readFileSync(CONSOLIDATED_LOG, 'utf8');
      expect(content).toContain('Worker ID: worker-123');
      expect(content).toContain('Agent: claude');
      expect(content).toContain('Task ID: task-456');
      expect(content).toContain('Task: Test Task');
    });

    it('should track stream in internal map', () => {
      const worker = {
        id: 'worker-123',
        agentId: 'claude',
        taskId: 'task-456'
      };

      service.createLogStream(worker);

      expect(service.getActiveStreamCount()).toBe(1);
      expect(service.getLogStream('worker-123')).toBeDefined();
    });

    it('should handle multiple streams', () => {
      const worker1 = { id: 'worker-1', agentId: 'claude', taskId: 'task-1' };
      const worker2 = { id: 'worker-2', agentId: 'gemini', taskId: 'task-2' };

      service.createLogStream(worker1);
      service.createLogStream(worker2);

      expect(service.getActiveStreamCount()).toBe(2);
    });

    it('should remove stream from map on close', async () => {
      const worker = {
        id: 'worker-123',
        agentId: 'claude',
        taskId: 'task-456'
      };

      const stream = service.createLogStream(worker);
      expect(service.getActiveStreamCount()).toBe(1);

      stream.end();
      await new Promise(resolve => stream.on('close', resolve));

      expect(service.getActiveStreamCount()).toBe(0);
    });
  });

  describe('closeLogStream', () => {
    it('should close stream and remove from map', async () => {
      const worker = {
        id: 'worker-123',
        agentId: 'claude',
        taskId: 'task-456'
      };

      service.createLogStream(worker);
      expect(service.getActiveStreamCount()).toBe(1);

      await service.closeLogStream('worker-123');

      expect(service.getActiveStreamCount()).toBe(0);
      expect(service.getLogStream('worker-123')).toBeUndefined();
    });

    it('should handle closing non-existent stream gracefully', async () => {
      // Should not throw
      await expect(service.closeLogStream('non-existent')).resolves.toBeUndefined();
    });

    it('should handle stream errors during close', async () => {
      const worker = {
        id: 'worker-123',
        agentId: 'claude',
        taskId: 'task-456'
      };

      const stream = service.createLogStream(worker);
      
      // Close stream immediately, then try to close again
      await service.closeLogStream('worker-123');

      // Second close should be a no-op (stream already removed)
      await expect(service.closeLogStream('worker-123')).resolves.toBeUndefined();
    });
  });

  describe('getLogStream', () => {
    it('should return stream if exists', () => {
      const worker = {
        id: 'worker-123',
        agentId: 'claude',
        taskId: 'task-456'
      };

      const stream = service.createLogStream(worker);
      const retrieved = service.getLogStream('worker-123');

      expect(retrieved).toBe(stream);
    });

    it('should return undefined if stream does not exist', () => {
      expect(service.getLogStream('non-existent')).toBeUndefined();
    });
  });

  describe('getActiveStreamCount', () => {
    it('should return 0 initially', () => {
      expect(service.getActiveStreamCount()).toBe(0);
    });

    it('should return correct count', () => {
      service.createLogStream({ id: 'w1', agentId: 'claude', taskId: 't1' });
      service.createLogStream({ id: 'w2', agentId: 'gemini', taskId: 't2' });
      service.createLogStream({ id: 'w3', agentId: 'codex', taskId: 't3' });

      expect(service.getActiveStreamCount()).toBe(3);
    });
  });

  describe('getWorkerLogPath', () => {
    it('should return correct log path', () => {
      const path = service.getWorkerLogPath('worker-123');
      expect(path).toContain('worker-123.log');
      expect(path).toContain(TEST_LOG_DIR);
    });

    it('should sanitize worker ID', () => {
      const path = service.getWorkerLogPath('worker@123!');
      expect(path).toContain('worker_123_');
    });
  });

  describe('cleanupOldLogs', () => {
    it('should delete old log files', async () => {
      // Create some old log files
      const oldLog1 = path.join(TEST_LOG_DIR, 'old-worker-1.log');
      const oldLog2 = path.join(TEST_LOG_DIR, 'old-worker-2.log');
      const recentLog = path.join(TEST_LOG_DIR, 'recent-worker.log');

      fs.writeFileSync(oldLog1, 'old log 1');
      fs.writeFileSync(oldLog2, 'old log 2');
      fs.writeFileSync(recentLog, 'recent log');

      // Set old modification time (31 days ago)
      const oldTime = Date.now() - (31 * 24 * 60 * 60 * 1000);
      fs.utimesSync(oldLog1, new Date(oldTime), new Date(oldTime));
      fs.utimesSync(oldLog2, new Date(oldTime), new Date(oldTime));

      const deletedCount = await service.cleanupOldLogs(30);

      expect(deletedCount).toBe(2);
      expect(fs.existsSync(oldLog1)).toBe(false);
      expect(fs.existsSync(oldLog2)).toBe(false);
      expect(fs.existsSync(recentLog)).toBe(true);
    });

    it('should not delete recent log files', async () => {
      const recentLog = path.join(TEST_LOG_DIR, 'recent-worker.log');
      fs.writeFileSync(recentLog, 'recent log');

      const deletedCount = await service.cleanupOldLogs(30);

      expect(deletedCount).toBe(0);
      expect(fs.existsSync(recentLog)).toBe(true);
    });

    it('should ignore non-log files', async () => {
      const txtFile = path.join(TEST_LOG_DIR, 'readme.txt');
      fs.writeFileSync(txtFile, 'not a log');

      // Set old modification time
      const oldTime = Date.now() - (31 * 24 * 60 * 60 * 1000);
      fs.utimesSync(txtFile, new Date(oldTime), new Date(oldTime));

      const deletedCount = await service.cleanupOldLogs(30);

      expect(deletedCount).toBe(0);
      expect(fs.existsSync(txtFile)).toBe(true);
    });

    it('should handle cleanup errors gracefully', async () => {
      // Try to cleanup from non-existent directory
      const badService = new WorkerLogService({
        logsDirectory: path.join(TEST_LOG_DIR, 'non-existent')
      });

      // Should not throw, returns 0
      const deletedCount = await badService.cleanupOldLogs(30);
      expect(deletedCount).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should close all active streams', async () => {
      service.createLogStream({ id: 'w1', agentId: 'claude', taskId: 't1' });
      service.createLogStream({ id: 'w2', agentId: 'gemini', taskId: 't2' });
      service.createLogStream({ id: 'w3', agentId: 'codex', taskId: 't3' });

      expect(service.getActiveStreamCount()).toBe(3);

      await service.shutdown();

      expect(service.getActiveStreamCount()).toBe(0);
    });

    it('should handle errors during shutdown gracefully', async () => {
      const worker = {
        id: 'worker-123',
        agentId: 'claude',
        taskId: 'task-456'
      };

      const stream = service.createLogStream(worker);
      stream.destroy(); // Force error state

      // Should not throw
      await expect(service.shutdown()).resolves.toBeUndefined();
    });

    it('should complete even with no active streams', async () => {
      await expect(service.shutdown()).resolves.toBeUndefined();
    });
  });
});
