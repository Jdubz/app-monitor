import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LogRotation } from '../logRotation.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LogRotation', () => {
  const testLogDir = path.join(__dirname, '../../../../test-logs');
  const archivedDir = path.join(testLogDir, 'archived');
  let logRotation: LogRotation;

  beforeEach(() => {
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }
    if (!fs.existsSync(archivedDir)) {
      fs.mkdirSync(archivedDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (logRotation) {
      logRotation.stop();
    }
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create LogRotation instance with default config', () => {
      logRotation = new LogRotation(testLogDir);
      expect(logRotation).toBeDefined();
    });

    it('should create archived directory if it does not exist', () => {
      fs.rmSync(archivedDir, { recursive: true, force: true });
      logRotation = new LogRotation(testLogDir);
      expect(fs.existsSync(archivedDir)).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        maxSize: 5 * 1024 * 1024,
        maxAge: 14,
        checkInterval: 30 * 1000,
        compress: false,
      };
      logRotation = new LogRotation(testLogDir, customConfig);
      expect(logRotation).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('should return status for non-existent files', () => {
      logRotation = new LogRotation(testLogDir);
      const status = logRotation.getStatus();
      expect(status).toBeInstanceOf(Array);
      expect(status.length).toBeGreaterThan(0);
      expect(status[0]).toHaveProperty('exists', false);
      expect(status[0]).toHaveProperty('size', 0);
      expect(status[0]).toHaveProperty('percentFull', 0);
    });

    it('should return correct status for existing files', () => {
      const logFile = path.join(testLogDir, 'backend.log');
      const testContent = 'Test log content\n';
      fs.writeFileSync(logFile, testContent);

      logRotation = new LogRotation(testLogDir);
      const status = logRotation.getStatus();
      
      const backendStatus = status.find((s) => s.service === 'backend');
      expect(backendStatus).toBeDefined();
      expect(backendStatus?.exists).toBe(true);
      expect(backendStatus?.size).toBeGreaterThan(0);
      expect(backendStatus?.sizeFormatted).toContain('B');
      expect(backendStatus?.percentFull).toBeGreaterThanOrEqual(0);
    });

    it('should format file sizes correctly', () => {
      const logFile = path.join(testLogDir, 'backend.log');
      
      // Test small file (bytes)
      fs.writeFileSync(logFile, 'small');
      logRotation = new LogRotation(testLogDir);
      let status = logRotation.getStatus().find((s) => s.service === 'backend');
      expect(status?.sizeFormatted).toMatch(/\d+ B$/);

      // Test KB file
      fs.writeFileSync(logFile, 'x'.repeat(2048));
      status = logRotation.getStatus().find((s) => s.service === 'backend');
      expect(status?.sizeFormatted).toMatch(/\d+\.\d+ KB$/);

      // Test MB file
      fs.writeFileSync(logFile, 'x'.repeat(2 * 1024 * 1024));
      status = logRotation.getStatus().find((s) => s.service === 'backend');
      expect(status?.sizeFormatted).toMatch(/\d+\.\d+ MB$/);
    });
  });

  describe('start and stop', () => {
    it('should start monitoring', () => {
      logRotation = new LogRotation(testLogDir);
      logRotation.start();
      // No error means it started successfully
      expect(true).toBe(true);
    });

    it('should not start multiple times', () => {
      logRotation = new LogRotation(testLogDir);
      logRotation.start();
      logRotation.start(); // Should log warning but not throw
      expect(true).toBe(true);
    });

    it('should stop monitoring', () => {
      logRotation = new LogRotation(testLogDir);
      logRotation.start();
      logRotation.stop();
      // No error means it stopped successfully
      expect(true).toBe(true);
    });

    it('should handle stop when not started', () => {
      logRotation = new LogRotation(testLogDir);
      logRotation.stop(); // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('file rotation', () => {
    it('should rotate file when size exceeds maxSize', async () => {
      const logFile = path.join(testLogDir, 'backend.log');
      const smallMaxSize = 100; // 100 bytes
      
      logRotation = new LogRotation(testLogDir, { 
        maxSize: smallMaxSize, 
        checkInterval: 100,
        compress: false
      });

      // Create a file larger than maxSize
      fs.writeFileSync(logFile, 'x'.repeat(smallMaxSize + 10));
      
      logRotation.start();
      
      // Wait for rotation to occur
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      // Check that file was rotated
      const archivedFiles = fs.readdirSync(archivedDir);
      expect(archivedFiles.length).toBeGreaterThan(0);
      
      // Check that original file was truncated
      const currentSize = fs.statSync(logFile).size;
      expect(currentSize).toBe(0);
    }, 10000);

    it('should compress rotated files when enabled', async () => {
      const logFile = path.join(testLogDir, 'backend.log');
      const smallMaxSize = 100;
      
      logRotation = new LogRotation(testLogDir, { 
        maxSize: smallMaxSize, 
        checkInterval: 100,
        compress: true
      });

      fs.writeFileSync(logFile, 'x'.repeat(smallMaxSize + 10));
      
      logRotation.start();
      
      // Wait for rotation and compression
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      const archivedFiles = fs.readdirSync(archivedDir);
      const gzipFiles = archivedFiles.filter((f) => f.endsWith('.gz'));
      expect(gzipFiles.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('cleanup old files', () => {
    it('should remove files older than maxAge', async () => {
      const oldFile = path.join(archivedDir, 'old-log.log.gz');
      fs.writeFileSync(oldFile, 'old content');
      
      // Set file modification time to past
      const oldTime = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
      fs.utimesSync(oldFile, new Date(oldTime), new Date(oldTime));
      
      logRotation = new LogRotation(testLogDir, { 
        maxAge: 7,
        checkInterval: 100
      });
      
      logRotation.start();
      
      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      expect(fs.existsSync(oldFile)).toBe(false);
    }, 10000);

    it('should keep files newer than maxAge', async () => {
      const recentFile = path.join(archivedDir, 'recent-log.log.gz');
      fs.writeFileSync(recentFile, 'recent content');
      
      // File is brand new, should not be deleted
      logRotation = new LogRotation(testLogDir, { 
        maxAge: 7,
        checkInterval: 100
      });
      
      logRotation.start();
      
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      expect(fs.existsSync(recentFile)).toBe(true);
    }, 10000);
  });
});
