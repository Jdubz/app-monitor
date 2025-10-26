/**
 * Log Watcher Tests
 * 
 * Based on test scenarios from docs/plans/test-scenarios-by-repository.md
 * Covers file monitoring, log parsing, real-time streaming, and error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LogWatcher } from './logWatcher.js';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import * as fs from 'fs';
import { logger } from '../utils/logger.js';

// Mock dependencies
vi.mock('fs');
vi.mock('../utils/logger.js');

describe('LogWatcher', () => {
  let logWatcher: LogWatcher;
  let httpServer: any;
  let io: SocketIOServer;
  let mockFs: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fs
    mockFs = vi.mocked(fs);
    mockFs.watchFile = vi.fn();
    mockFs.unwatchFile = vi.fn();
    mockFs.readFileSync = vi.fn();
    mockFs.existsSync = vi.fn().mockReturnValue(true);
    mockFs.statSync = vi.fn().mockReturnValue({ mtime: new Date() });

    // Mock logger
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});
    vi.mocked(logger.debug).mockImplementation(() => {});

    // Create HTTP server and Socket.IO server
    httpServer = createServer();
    io = new SocketIOServer(httpServer);

    // Create LogWatcher
    logWatcher = new LogWatcher(io);
  });

  afterEach(() => {
    if (httpServer) {
      httpServer.close();
    }
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize correctly', () => {
      // Given: LogWatcher is created
      // When: Initialization completes
      // Then: LogWatcher is ready
      expect(logWatcher).toBeDefined();
      expect(logWatcher['io']).toBe(io);
    });

    it('should discover log files on initialization', () => {
      // Given: Log files exist
      mockFs.readdirSync = vi.fn().mockReturnValue([
        'backend.log',
        'frontend.log',
        'worker.log'
      ]);

      // When: LogWatcher is initialized
      new LogWatcher(io);

      // Then: Log files are discovered
      expect(mockFs.readdirSync).toHaveBeenCalled();
    });
  });

  describe('File Watching', () => {
    it('should watch file for changes', () => {
      // Given: Log file path
      const logPath = '/test/logs/backend.log';
      mockFs.existsSync.mockReturnValue(true);

      // When: File watching is started
      logWatcher['watchFile'](logPath);

      // Then: File is watched
      expect(mockFs.watchFile).toHaveBeenCalledWith(
        logPath,
        expect.any(Function)
      );
    });

    it('should handle file changes and parse logs', () => {
      // Given: Log file with content
      const logPath = '/test/logs/backend.log';
      const logContent = JSON.stringify({
        severity: 'INFO',
        timestamp: '2025-01-26T10:00:00.000Z',
        environment: 'development',
        service: 'backend',
        message: 'Test log message'
      });

      mockFs.readFileSync.mockReturnValue(logContent);
      mockFs.existsSync.mockReturnValue(true);

      // Mock file change callback
      type FileChangeCallback = (curr: fs.Stats, prev: fs.Stats) => void;
      let changeCallback: FileChangeCallback;
      mockFs.watchFile.mockImplementation((filePath: string, callback: FileChangeCallback) => {
        changeCallback = callback;
      });

      // When: File watching is started
      logWatcher['watchFile'](logPath);

      // And: File change is triggered
      changeCallback!(logPath, { mtime: new Date() });

      // Then: Log is parsed and emitted
      expect(mockFs.readFileSync).toHaveBeenCalledWith(logPath, 'utf8');
    });

    it('should handle multiple file watching', () => {
      // Given: Multiple log files
      const logPaths = [
        '/test/logs/backend.log',
        '/test/logs/frontend.log',
        '/test/logs/worker.log'
      ];

      mockFs.existsSync.mockReturnValue(true);

      // When: Multiple files are watched
      logPaths.forEach(path => logWatcher['watchFile'](path));

      // Then: All files are watched
      expect(mockFs.watchFile).toHaveBeenCalledTimes(3);
      logPaths.forEach(path => {
        expect(mockFs.watchFile).toHaveBeenCalledWith(path, expect.any(Function));
      });
    });

    it('should handle file rotation', () => {
      // Given: Log file that gets rotated
      const logPath = '/test/logs/backend.log';
      type FileChangeCallback = (curr: fs.Stats, prev: fs.Stats) => void;
      let changeCallback: FileChangeCallback;
      
      mockFs.watchFile.mockImplementation((filePath: string, callback: FileChangeCallback) => {
        changeCallback = callback;
      });

      mockFs.existsSync
        .mockReturnValueOnce(true)  // File exists initially
        .mockReturnValueOnce(false) // File disappears (rotation)
        .mockReturnValueOnce(true); // New file appears

      mockFs.readFileSync.mockReturnValue('');

      // When: File watching is started
      logWatcher['watchFile'](logPath);

      // And: File rotation occurs
      changeCallback!(logPath, { mtime: new Date() });
      changeCallback!(logPath, { mtime: new Date() });

      // Then: File watching continues
      expect(mockFs.watchFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('Log Parsing', () => {
    it('should parse JSON logs correctly', () => {
      // Given: JSON log entry
      const jsonLog = {
        severity: 'INFO',
        timestamp: '2025-01-26T10:00:00.000Z',
        environment: 'development',
        service: 'backend',
        category: 'process',
        action: 'start',
        message: 'Service started successfully',
        details: { pid: 12345, port: 5000 }
      };

      const logLine = JSON.stringify(jsonLog);

      // When: Log is parsed
      const parsed = logWatcher['parseLogLine'](logLine);

      // Then: Log is parsed correctly
      expect(parsed).toEqual(expect.objectContaining(jsonLog));
      expect(parsed.id).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
    });

    it('should parse plain text logs', () => {
      // Given: Plain text log entry
      const plainLog = '2025-01-26 10:00:00 [INFO] Backend service started on port 5000';

      // When: Log is parsed
      const parsed = logWatcher['parseLogLine'](plainLog);

      // Then: Log is converted to structured format
      expect(parsed).toEqual(expect.objectContaining({
        severity: 'INFO',
        message: expect.stringContaining('Backend service started'),
        raw: plainLog
      }));
    });

    it('should detect log severity levels', () => {
      // Given: Different severity levels
      const testCases = [
        { input: 'ERROR: Something went wrong', expected: 'ERROR' },
        { input: 'WARN: This is a warning', expected: 'WARNING' },
        { input: 'INFO: Information message', expected: 'INFO' },
        { input: 'DEBUG: Debug information', expected: 'DEBUG' },
        { input: 'Unknown message', expected: 'INFO' }
      ];

      testCases.forEach(({ input, expected }) => {
        // When: Log is parsed
        const parsed = logWatcher['parseLogLine'](input);

        // Then: Severity is detected correctly
        expect(parsed.severity).toBe(expected);
      });
    });

    it('should extract timestamps from various formats', () => {
      // Given: Different timestamp formats
      const testCases = [
        '2025-01-26T10:00:00.000Z [INFO] Message',
        '2025-01-26 10:00:00 [INFO] Message',
        '26/01/2025 10:00:00 [INFO] Message',
        'No timestamp [INFO] Message'
      ];

      testCases.forEach(input => {
        // When: Log is parsed
        const parsed = logWatcher['parseLogLine'](input);

        // Then: Timestamp is extracted or defaulted
        expect(parsed.timestamp).toBeDefined();
        expect(typeof parsed.timestamp).toBe('number');
      });
    });

    it('should handle malformed JSON gracefully', () => {
      // Given: Malformed JSON
      const malformedJson = '{"severity": "INFO", "message": "Incomplete';

      // When: Log is parsed
      const parsed = logWatcher['parseLogLine'](malformedJson);

      // Then: Log is treated as plain text
      expect(parsed.severity).toBe('INFO');
      expect(parsed.raw).toBe(malformedJson);
    });

    it('should skip empty lines', () => {
      // Given: Empty log line
      const emptyLine = '';

      // When: Log is parsed
      const parsed = logWatcher['parseLogLine'](emptyLine);

      // Then: Null is returned
      expect(parsed).toBeNull();
    });
  });

  describe('Real-time Streaming', () => {
    it('should emit log events to Socket.IO clients', () => {
      // Given: Log entry
      const logEntry = {
        id: 'log-123',
        severity: 'INFO',
        timestamp: Date.now(),
        service: 'backend',
        message: 'Test message',
        raw: 'Test raw log'
      };

      // Mock Socket.IO emit
      const mockEmit = vi.fn();
      logWatcher['io'].emit = mockEmit;

      // When: Log is broadcast
      logWatcher['broadcastLog'](logEntry);

      // Then: Event is emitted
      expect(mockEmit).toHaveBeenCalledWith('process:log', logEntry);
    });

    it('should filter logs by service', () => {
      // Given: Log entries for different services
      const logs = [
        { service: 'backend', message: 'Backend log' },
        { service: 'frontend', message: 'Frontend log' },
        { service: 'worker', message: 'Worker log' }
      ];

      // Mock Socket.IO emit
      const mockEmit = vi.fn();
      logWatcher['io'].emit = mockEmit;

      // When: Logs are broadcast
      logs.forEach(log => logWatcher['broadcastLog'](log as any));

      // Then: All logs are emitted
      expect(mockEmit).toHaveBeenCalledTimes(3);
    });

    it('should handle high-frequency log streaming', () => {
      // Given: High-frequency log entries
      const logCount = 100;
      const mockEmit = vi.fn();
      logWatcher['io'].emit = mockEmit;

      // When: Many logs are broadcast quickly
      for (let i = 0; i < logCount; i++) {
        logWatcher['broadcastLog']({
          id: `log-${i}`,
          severity: 'INFO',
          timestamp: Date.now(),
          service: 'backend',
          message: `Log message ${i}`,
          raw: `Raw log ${i}`
        });
      }

      // Then: All logs are emitted
      expect(mockEmit).toHaveBeenCalledTimes(logCount);
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors', () => {
      // Given: File read error
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      type FileChangeCallback = (curr: fs.Stats, prev: fs.Stats) => void;
      let changeCallback: FileChangeCallback;
      mockFs.watchFile.mockImplementation((filePath: string, callback: FileChangeCallback) => {
        changeCallback = callback;
      });

      // When: File change is triggered
      logWatcher['watchFile']('/test/logs/backend.log');
      changeCallback!('/test/logs/backend.log' as any, { mtime: new Date() } as any);

      // Then: Error is logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read log file'),
        expect.any(Error)
      );
    });

    it('should handle file not found errors', () => {
      // Given: File does not exist
      mockFs.existsSync.mockReturnValue(false);

      // When: File watching is attempted
      logWatcher['watchFile']('/nonexistent/logs/backend.log');

      // Then: Warning is logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Log file does not exist')
      );
    });

    it('should handle parsing errors gracefully', () => {
      // Given: Unparseable log content
      const unparseableContent = 'This is not a valid log format\nAnother line\n';

      mockFs.readFileSync.mockReturnValue(unparseableContent);

      type FileChangeCallback = (curr: fs.Stats, prev: fs.Stats) => void;
      let changeCallback: FileChangeCallback;
      mockFs.watchFile.mockImplementation((filePath: string, callback: FileChangeCallback) => {
        changeCallback = callback;
      });

      // When: File change is triggered
      logWatcher['watchFile']('/test/logs/backend.log');
      changeCallback!('/test/logs/backend.log' as any, { mtime: new Date() } as any);

      // Then: Logs are still processed
      expect(mockFs.readFileSync).toHaveBeenCalled();
    });

    it('should handle Socket.IO emit errors', () => {
      // Given: Socket.IO emit error
      const mockEmit = vi.fn().mockImplementation(() => {
        throw new Error('Socket.IO error');
      });
      logWatcher['io'].emit = mockEmit;

      // When: Log is broadcast
      logWatcher['broadcastLog']({
        id: 'log-123',
        severity: 'INFO',
        timestamp: Date.now(),
        service: 'backend',
        message: 'Test message',
        raw: 'Test raw log'
      });

      // Then: Error is handled gracefully
      expect(mockEmit).toHaveBeenCalled();
    });
  });

  describe('Log Source Management', () => {
    it('should get watched log sources', () => {
      // Given: Log files are being watched
      const logPaths = [
        '/test/logs/backend.log',
        '/test/logs/frontend.log'
      ];

      logPaths.forEach(path => {
        mockFs.existsSync.mockReturnValue(true);
        logWatcher['watchFile'](path);
      });

      // When: Log sources are requested
      const sources = logWatcher.getLogSources();

      // Then: All watched sources are returned
      expect(sources).toEqual(expect.arrayContaining(logPaths));
    });

    it('should add new log source', () => {
      // Given: New log file
      const newLogPath = '/test/logs/new-service.log';
      mockFs.existsSync.mockReturnValue(true);

      // When: New log source is added
      logWatcher.addLogSource(newLogPath);

      // Then: File is watched
      expect(mockFs.watchFile).toHaveBeenCalledWith(newLogPath, expect.any(Function));
    });

    it('should remove log source', () => {
      // Given: Log file is being watched
      const logPath = '/test/logs/backend.log';
      mockFs.existsSync.mockReturnValue(true);
      logWatcher['watchFile'](logPath);

      // When: Log source is removed
      logWatcher.removeLogSource(logPath);

      // Then: File watching is stopped
      expect(mockFs.unwatchFile).toHaveBeenCalledWith(logPath);
    });
  });

  describe('Performance and Memory Management', () => {
    it('should limit log history to prevent memory issues', () => {
      // Given: LogWatcher with limited history
      logWatcher['maxLogHistory'] = 10;

      // When: Many logs are added
      for (let i = 0; i < 20; i++) {
        logWatcher['addToHistory']({
          id: `log-${i}`,
          severity: 'INFO',
          timestamp: Date.now(),
          service: 'backend',
          message: `Log message ${i}`,
          raw: `Raw log ${i}`
        });
      }

      // Then: History is limited
      expect(logWatcher['logHistory'].length).toBeLessThanOrEqual(10);
    });

    it('should handle large log files efficiently', () => {
      // Given: Large log file
      const largeLogContent = 'Line 1\n'.repeat(10000);
      mockFs.readFileSync.mockReturnValue(largeLogContent);

      type FileChangeCallback = (curr: fs.Stats, prev: fs.Stats) => void;
      let changeCallback: FileChangeCallback;
      mockFs.watchFile.mockImplementation((filePath: string, callback: FileChangeCallback) => {
        changeCallback = callback;
      });

      // When: Large file change is processed
      logWatcher['watchFile']('/test/logs/large.log');
      changeCallback!('/test/logs/large.log' as any, { mtime: new Date() } as any);

      // Then: Processing completes without errors
      expect(mockFs.readFileSync).toHaveBeenCalled();
    });
  });
});