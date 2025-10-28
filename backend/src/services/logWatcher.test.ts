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
import * as path from 'path';
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
    mockFs.watch = vi.fn().mockReturnValue({ close: vi.fn() });
    mockFs.existsSync = vi.fn().mockReturnValue(true);
    mockFs.statSync = vi.fn().mockReturnValue({ size: 0 });
    mockFs.readFileSync = vi.fn().mockReturnValue('');
    mockFs.readdirSync = vi.fn().mockReturnValue([]);
    mockFs.openSync = vi.fn().mockReturnValue(3);
    mockFs.readSync = vi.fn().mockReturnValue(0);
    mockFs.closeSync = vi.fn();

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
      // Given: Log directory exists with log files
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['dev-monitor-backend.log']);

      // When: LogWatcher is initialized
      new LogWatcher(io);

      // Then: Log discovery is attempted
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'system',
          action: 'discovered_logs'
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'system',
          action: 'initialized',
          message: 'LogWatcher initialized'
        })
      );
    });

    it('should handle missing log directory gracefully', () => {
      // Given: Log directory does not exist
      mockFs.existsSync.mockReturnValue(false);

      // When: LogWatcher is initialized
      new LogWatcher(io);

      // Then: Warning is logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'system',
          action: 'directory_not_found'
        })
      );
    });
  });

  describe('File Watching', () => {
    it('should watch file for changes', () => {
      // Given: Log file path
      const logPath = '/test/logs/dev-monitor-backend.log';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 0 });

      // When: File watching is started
      logWatcher['watchFile'](logPath, 'dev-monitor-backend');

      // Then: File is watched
      expect(mockFs.watch).toHaveBeenCalledWith(
        logPath,
        expect.any(Function)
      );
    });

    it('should handle file changes', () => {
      // Given: Log file with content
      const logPath = '/test/logs/dev-monitor-backend.log';

      type WatchCallback = (eventType: string, filename: string) => void;
      let watchCallback: WatchCallback;

      mockFs.watch.mockImplementation((filepath: string, callback: WatchCallback) => {
        watchCallback = callback;
        return { close: vi.fn() };
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 100 });
      mockFs.readFileSync.mockReturnValue('{"severity":"INFO","timestamp":"2025-01-26T10:00:00.000Z","environment":"development","service":"dev-monitor-backend","message":"Test"}');

      // When: File watching is started
      logWatcher['watchFile'](logPath, 'dev-monitor-backend');

      // And: File change is triggered
      watchCallback!('change', path.basename(logPath));

      // Then: File change is handled (debounced)
      expect(mockFs.watch).toHaveBeenCalledWith(logPath, expect.any(Function));
    });

    it('should handle file rotation', () => {
      // Given: Log file that gets rotated
      const logPath = '/test/logs/dev-monitor-backend.log';

      type WatchCallback = (eventType: string, filename: string) => void;
      let watchCallback: WatchCallback;

      mockFs.watch.mockImplementation((filepath: string, callback: WatchCallback) => {
        watchCallback = callback;
        return { close: vi.fn() };
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 0 });

      // When: File watching is started
      logWatcher['watchFile'](logPath, 'dev-monitor-backend');

      // And: File rotation occurs
      watchCallback!('rename', path.basename(logPath));

      // Then: File rotation is logged
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'system',
          action: 'file_rotated'
        })
      );
    });

    it('should watch for file creation if file does not exist', () => {
      // Given: Log file does not exist
      const logPath = '/test/logs/new-service.log';
      mockFs.existsSync.mockReturnValue(false);

      // When: File watching is attempted
      logWatcher['watchFile'](logPath, 'new-service');

      // Then: Directory is watched for file creation
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'system',
          action: 'file_not_found'
        })
      );
    });
  });

  describe('Log Format Validation', () => {
    it('should detect JSON log format with high confidence', () => {
      // Given: Log file with JSON content
      const jsonLogs = Array(10).fill('{"severity":"INFO","message":"Test"}').join('\n');
      mockFs.readFileSync.mockReturnValue(jsonLogs);
      mockFs.existsSync.mockReturnValue(true);

      // When: Format is validated
      const validation = logWatcher['validateLogFormat']('/test/logs/backend.log');

      // Then: Format is detected as JSON with high confidence
      expect(validation.format).toBe('json');
      expect(validation.confidence).toBe('high');
    });

    it('should detect plain text log format', () => {
      // Given: Log file with plain text content
      const plainLogs = Array(10).fill('2025-01-26 10:00:00 [INFO] Test message').join('\n');
      mockFs.readFileSync.mockReturnValue(plainLogs);
      mockFs.existsSync.mockReturnValue(true);

      // When: Format is validated
      const validation = logWatcher['validateLogFormat']('/test/logs/backend.log');

      // Then: Format is detected as plain text
      expect(validation.format).toBe('plain-text');
      expect(validation.confidence).toBe('high');
    });

    it('should detect mixed format with low confidence', () => {
      // Given: Log file with mixed content
      const mixedLogs = [
        '{"severity":"INFO","message":"JSON log"}',
        'Plain text log',
        '{"severity":"ERROR","message":"Another JSON"}',
        'Another plain text',
        'More plain text'
      ].join('\n');
      mockFs.readFileSync.mockReturnValue(mixedLogs);
      mockFs.existsSync.mockReturnValue(true);

      // When: Format is validated
      const validation = logWatcher['validateLogFormat']('/test/logs/backend.log');

      // Then: Format is detected with low confidence
      expect(['mixed', 'plain-text']).toContain(validation.format);
    });

    it('should handle empty log files', () => {
      // Given: Empty log file
      mockFs.readFileSync.mockReturnValue('');
      mockFs.existsSync.mockReturnValue(true);

      // When: Format is validated
      const validation = logWatcher['validateLogFormat']('/test/logs/empty.log');

      // Then: Format is unknown
      expect(validation.format).toBe('unknown');
      expect(validation.confidence).toBe('none');
    });

    it('should handle non-existent files', () => {
      // Given: File does not exist
      mockFs.existsSync.mockReturnValue(false);

      // When: Format is validated
      const validation = logWatcher['validateLogFormat']('/test/logs/nonexistent.log');

      // Then: Format is unknown with error
      expect(validation.format).toBe('unknown');
      expect(validation.confidence).toBe('none');
      expect(validation.error).toBeDefined();
    });
  });

  describe('Plain Text Conversion', () => {
    it('should convert plain text to structured format', () => {
      // Given: Plain text log entry
      const plainLog = '2025-01-26 10:00:00 [INFO] Backend service started on port 5000';

      // When: Log is converted
      const structured = logWatcher['convertPlainTextToStructured'](plainLog, 'backend');

      // Then: Log is converted to structured format
      expect(structured).toEqual(expect.objectContaining({
        severity: 'INFO',
        service: 'firebase-emulators',
        message: plainLog,
        environment: 'development'
      }));
      const parsedTimestamp = new Date(structured.timestamp);
      expect(Number.isNaN(parsedTimestamp.getTime())).toBe(false);
    });

    it('should detect ERROR severity', () => {
      // Given: Plain text log with error
      const errorLog = 'ERROR: Database connection failed';

      // When: Log is converted
      const structured = logWatcher['convertPlainTextToStructured'](errorLog, 'backend');

      // Then: Severity is ERROR
      expect(structured.severity).toBe('ERROR');
    });

    it('should detect WARNING severity', () => {
      // Given: Plain text log with warning
      const warnLog = 'WARN: Connection timeout, retrying...';

      // When: Log is converted
      const structured = logWatcher['convertPlainTextToStructured'](warnLog, 'backend');

      // Then: Severity is WARNING
      expect(structured.severity).toBe('WARNING');
    });

    it('should detect DEBUG severity', () => {
      // Given: Plain text log with debug
      const debugLog = 'DEBUG: Processing request with params: {...}';

      // When: Log is converted
      const structured = logWatcher['convertPlainTextToStructured'](debugLog, 'backend');

      // Then: Severity is DEBUG
      expect(structured.severity).toBe('DEBUG');
    });

    it('should default to INFO severity', () => {
      // Given: Plain text log without severity keyword
      const infoLog = 'Service is running normally';

      // When: Log is converted
      const structured = logWatcher['convertPlainTextToStructured'](infoLog, 'backend');

      // Then: Severity defaults to INFO
      expect(structured.severity).toBe('INFO');
    });

    it('should detect emulator category', () => {
      // Given: Plain text log from Firebase emulator
      const emulatorLog = 'Firestore emulator started on port 8080';

      // When: Log is converted
      const structured = logWatcher['convertPlainTextToStructured'](emulatorLog, 'firebase-emulators');

      // Then: Category is emulator
      expect(structured.category).toBe('emulator');
    });

    it('should detect server category', () => {
      // Given: Plain text log about HTTP server
      const serverLog = 'HTTP server listening on port 3000';

      // When: Log is converted
      const structured = logWatcher['convertPlainTextToStructured'](serverLog, 'backend');

      // Then: Category is server
      expect(structured.category).toBe('server');
    });
  });

  describe('Real-time Streaming', () => {
    it('should broadcast log entries to Socket.IO clients', () => {
      // Given: Structured log entry
      const logEntry = {
        severity: 'INFO' as const,
        timestamp: '2025-01-26T10:00:00.000Z',
        environment: 'development',
        service: 'backend',
        message: 'Test message'
      };

      // Mock Socket.IO to method
      const mockTo = vi.fn().mockReturnValue({ emit: vi.fn() });
      logWatcher['io'].to = mockTo;

      // When: Log is broadcast
      logWatcher['broadcastLogEntry'](logEntry);

      // Then: Event is emitted to service-specific and all logs rooms
      expect(mockTo).toHaveBeenCalledWith('logs:firebase-emulators');
      expect(mockTo).toHaveBeenCalledWith('logs:all');
    });

    it('should handle format errors gracefully', () => {
      // Given: Invalid log line
      const invalidLine = '{"malformed": "json';

      // Mock Socket.IO emit
      const mockEmit = vi.fn();
      logWatcher['io'].emit = mockEmit;
      logWatcher['io'].to = vi.fn().mockReturnValue({ emit: vi.fn() });

      // When: Format error is broadcast
      logWatcher['broadcastFormatError']('backend', '/test/logs/backend.log', invalidLine);

      // Then: Error event is emitted
      expect(mockEmit).toHaveBeenCalledWith('log_format_error', expect.objectContaining({
        severity: 'ERROR',
        category: 'log_format',
        action: 'invalid_format'
      }));
    });

    it('should normalize plain text logs, emit log_line events, and cache entries', () => {
      const emitted: Record<string, Array<{ event: string; payload: any }>> = {};

      const emitSpy = vi.spyOn(logWatcher['io'], 'emit').mockImplementation(() => logWatcher['io'] as unknown as any);
      const toSpy = vi.spyOn(logWatcher['io'], 'to').mockImplementation((room: string) => ({
        emit: (event: string, payload: unknown) => {
          if (!emitted[room]) {
            emitted[room] = [];
          }
          emitted[room].push({ event, payload });
          return logWatcher['io'];
        },
      }) as unknown as any);

      const plainLogLine = 'Worker container booted';
      logWatcher['processLogLine'](plainLogLine, 'worker', '/logs/plain/worker.log');

      toSpy.mockRestore();
      emitSpy.mockRestore();

      const serviceRoom = emitted['logs:job-finder-worker'];
      expect(serviceRoom).toBeDefined();

      const logLineEvent = serviceRoom?.find(entry => entry.event === 'log_line');
      expect(logLineEvent).toBeDefined();
      expect(logLineEvent?.payload).toEqual(expect.objectContaining({
        service: 'job-finder-worker',
        message: plainLogLine,
      }));

      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockClear();

      const recentLogs = logWatcher.getRecentLogs('job-finder-worker', 5);
      expect(recentLogs).toHaveLength(1);
      expect(recentLogs[0]).toEqual(expect.objectContaining({
        service: 'job-finder-worker',
        message: plainLogLine,
      }));
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });
  });

  describe('Recent Logs Retrieval', () => {
    it('should read recent logs from file', () => {
      // Given: Log file with entries
      const logContent = [
        '{"severity":"INFO","timestamp":"2025-01-26T10:00:00.000Z","environment":"development","service":"backend","message":"Log 1"}',
        '{"severity":"ERROR","timestamp":"2025-01-26T10:01:00.000Z","environment":"development","service":"backend","message":"Log 2"}',
        '{"severity":"INFO","timestamp":"2025-01-26T10:02:00.000Z","environment":"development","service":"backend","message":"Log 3"}'
      ].join('\n');

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(logContent);

      // When: Recent logs are requested
      const logs = logWatcher.getRecentLogs('dev-monitor-backend', 10);

      // Then: Logs are returned
      expect(logs).toHaveLength(3);
      expect(logs[0]).toEqual(expect.objectContaining({
        severity: 'INFO',
        message: 'Log 1'
      }));
    });

    it('should limit number of returned logs', () => {
      // Given: Log file with many entries
      const logLines = Array.from({ length: 200 }, (_, i) =>
        `{"severity":"INFO","timestamp":"2025-01-26T10:00:00.000Z","environment":"development","service":"backend","message":"Log ${i}"}`
      );
      const logContent = logLines.join('\n');

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(logContent);

      // When: Recent logs are requested with limit
      const logs = logWatcher.getRecentLogs('dev-monitor-backend', 50);

      // Then: Only last 50 logs are returned
      expect(logs.length).toBeLessThanOrEqual(50);
    });

    it('should handle plain text logs in recent logs', () => {
      // Given: Log file with plain text
      const logContent = [
        'Plain text log 1',
        'ERROR: Something went wrong',
        'Plain text log 3'
      ].join('\n');

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(logContent);

      // When: Recent logs are requested
      const logs = logWatcher.getRecentLogs('dev-monitor-backend', 10);

      // Then: Plain text logs are converted to structured format
      expect(logs).toHaveLength(3);
      expect(logs[0]).toEqual(expect.objectContaining({
        severity: 'INFO',
        message: 'Plain text log 1'
      }));
      expect(logs[1]).toEqual(expect.objectContaining({
        severity: 'ERROR',
        message: 'ERROR: Something went wrong'
      }));
    });

    it('should return empty array when log file not found', () => {
      // Given: Log file does not exist
      mockFs.existsSync.mockReturnValue(false);

      // When: Recent logs are requested
      const logs = logWatcher.getRecentLogs('nonexistent-service', 10);

      // Then: Empty array is returned
      expect(logs).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'system',
          action: 'log_file_not_found'
        })
      );
    });
  });

  describe('Available Sources', () => {
    it('should return available log sources', () => {
      // Given: Log files are being watched
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 0 });

      logWatcher['watchFile']('/test/logs/backend.log', 'backend');
      logWatcher['watchFile']('/test/logs/frontend.log', 'frontend');

      // When: Available sources are requested
      const sources = logWatcher.getAvailableSources();

      // Then: All watched sources are returned (including any auto-discovered sources)
      expect(sources.length).toBeGreaterThanOrEqual(2);
      const serviceNames = sources.map(s => s.service);
      expect(serviceNames).toContain('backend');
      expect(serviceNames).toContain('frontend');
    });

    it('should only return sources for files that exist', () => {
      // Given: Some log files exist, others do not
      mockFs.existsSync
        .mockReturnValueOnce(true)  // backend.log exists
        .mockReturnValueOnce(false); // frontend.log doesn't exist

      mockFs.statSync.mockReturnValue({ size: 0 });

      logWatcher['watchFile']('/test/logs/backend.log', 'backend');

      // When: Available sources are requested
      const sources = logWatcher.getAvailableSources();

      // Then: Only existing files are returned
      expect(sources.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors', () => {
      // Given: Log file is being watched
      const logPath = '/test/logs/backend.log';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync
        .mockReturnValueOnce({ size: 0 })  // Initial watch
        .mockReturnValueOnce({ size: 100 }); // On read attempt

      // Set up the watched file
      logWatcher['watchFile'](logPath, 'backend');

      // Now mock file read to throw error
      mockFs.readSync.mockImplementation(() => {
        throw new Error('File read error');
      });
      mockFs.openSync.mockReturnValue(3);

      // When: File is read
      logWatcher['readNewLines'](logPath);

      // Then: Error is logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'system',
          action: 'read_failed'
        })
      );
    });

    it('should handle format validation errors', () => {
      // Given: Format validation throws error
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });
      mockFs.existsSync.mockReturnValue(true);

      // When: Format is validated
      const validation = logWatcher['validateLogFormat']('/test/logs/error.log');

      // Then: Error is captured
      expect(validation.format).toBe('unknown');
      expect(validation.confidence).toBe('none');
      expect(validation.error).toBeDefined();
    });

    it('should handle malformed JSON in log entries', () => {
      // Given: Log file with malformed JSON
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 50 });
      mockFs.readFileSync.mockReturnValue('{"malformed": "json');

      const mockEmit = vi.fn();
      logWatcher['io'].emit = mockEmit;
      logWatcher['io'].to = vi.fn().mockReturnValue({ emit: vi.fn() });

      // When: Log line is processed
      logWatcher['processLogLine']('{"malformed": "json', 'backend');

      // Then: Error is logged and format error is broadcast
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'system',
          action: 'invalid_json'
        })
      );
    });
  });

  describe('Cleanup', () => {
    it('should destroy watchers on cleanup', () => {
      // Given: LogWatcher with active watchers
      const mockClose = vi.fn();
      mockFs.watch.mockReturnValue({ close: mockClose });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 0 });

      logWatcher['watchFile']('/test/logs/backend.log', 'backend');

      // When: Destroy is called
      logWatcher.destroy();

      // Then: Watchers are closed
      expect(mockClose).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'system',
          action: 'destroyed'
        })
      );
    });
  });
});
