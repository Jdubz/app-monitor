/**
 * LogWatcher - Real-time log file monitoring
 *
 * Watches centralized log files and streams structured JSON log entries
 * to connected clients via Socket.IO.
 *
 * Features:
 * - Watches /logs/*.log files for changes
 * - Parses structured JSON log entries
 * - Streams to Socket.IO clients in real-time
 * - Handles file rotation and recreation
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve logs directory relative to this file (services -> src -> backend -> dev-monitor -> root -> logs)
const DEFAULT_LOG_DIR = path.resolve(__dirname, '../../../../logs');


type LogSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
interface StructuredLogEntry {
  severity: LogSeverity;
  timestamp: string;
  environment: string;
  service: string;
  category?: string;
  action?: string;
  message?: string;
  details?: Record<string, any>;
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
  userId?: string;
  requestId?: string;
  http?: {
    method?: string;
    url?: string;
    statusCode?: number;
  };
  sessionId?: string;
}

interface WatchedFile {
  filepath: string;
  service: string;
  position: number;
  watcher?: fs.FSWatcher;
  format?: 'json' | 'plain-text' | 'mixed' | 'unknown';
  formatConfidence?: 'high' | 'low' | 'none';
}

interface LogFormatValidation {
  format: 'json' | 'plain-text' | 'mixed' | 'unknown';
  confidence: 'high' | 'low' | 'none';
  error?: string;
}

interface LogSource {
  service: string;
  filename: string;
  filepath: string;
  format: string;
  formatConfidence: string;
  watching: boolean;
}

export class LogWatcher {
  private io: SocketIOServer;
  private watchedFiles: Map<string, WatchedFile> = new Map();
  private logDir: string;
  private readDebounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(io: SocketIOServer, logDir?: string) {
    this.io = io;
    // Default to /logs directory in repository root
    this.logDir = logDir || DEFAULT_LOG_DIR;

    this.initializeWatchers();
    logger.info({ category: 'system', action: 'initialized', message: 'LogWatcher initialized', details: { logDir: this.logDir } });
  }

  /**
   * Initialize file watchers for all log files
   * Dynamically discovers all .log files in the logs directory
   */
  private initializeWatchers(): void {
    const logFiles = this.discoverLogFiles();

    for (const { filepath, service } of logFiles) {
      this.watchFile(filepath, service);
    }

    logger.info({
      category: 'system',
      action: 'discovered_logs',
      message: `Discovered ${logFiles.length} log file(s)`,
      details: { count: logFiles.length, files: logFiles.map(f => ({ service: f.service, file: path.basename(f.filepath) })) },
    });
  }

  /**
   * Dynamically discover log files in the logs directory
   * ONLY streams dev-monitor backend logs, uses file reads for external services
   */
  private discoverLogFiles(): Array<{ filepath: string; service: string }> {
    const logFiles: Array<{ filepath: string; service: string }> = [];

    try {
      // Ensure log directory exists
      if (!fs.existsSync(this.logDir)) {
        logger.warn({
          category: 'system',
          action: 'directory_not_found',
          message: `Log directory not found: ${this.logDir}`,
        });
        return logFiles;
      }

      // ONLY watch dev-monitor backend logs for streaming
      // External service logs are read-only (no streaming)
      const devMonitorLogFile = path.join(this.logDir, 'dev-monitor-backend.log');
      if (fs.existsSync(devMonitorLogFile)) {
        logFiles.push({ filepath: devMonitorLogFile, service: 'dev-monitor-backend' });
      }

      // Note: External service logs (frontend, worker, firebase-emulators) are available
      // via getRecentLogs() for file-based reading, but not streamed in real-time
      logger.info({
        category: 'system',
        action: 'log_discovery',
        message: 'Only dev-monitor-backend logs will be streamed. External service logs use file reads only.',
        details: { streamingService: 'dev-monitor-backend', fileBasedServices: ['frontend', 'worker', 'firebase-emulators'] }
      });

    } catch (error) {
      logger.error({
        category: 'system',
        action: 'discovery_failed',
        message: `Failed to discover log files in: ${this.logDir}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }

    return logFiles;
  }

  /**
   * Infer service name from log filename
   * Maps filename to human-readable service name
   */
  private inferServiceFromFilename(filename: string): string {
    // Remove .log extension
    const baseName = filename.replace('.log', '');

    // Map known filenames to service names
    const serviceMap: Record<string, string> = {
      'frontend': 'frontend-dev',
      'worker': 'python-worker',
      'dev-monitor-backend': 'dev-monitor-backend',
      'firebase-emulators': 'firebase-emulators',
    };

    return serviceMap[baseName] || baseName;
  }

  /**
   * Validate log file format (JSON vs plain text)
   * Checks the first 10 lines to determine format
   */
  private validateLogFormat(filepath: string): LogFormatValidation {
    try {
      if (!fs.existsSync(filepath)) {
        return { format: 'unknown', confidence: 'none', error: 'File does not exist' };
      }

      const content = fs.readFileSync(filepath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim().length > 0).slice(0, 10);

      if (lines.length === 0) {
        return { format: 'unknown', confidence: 'none', error: 'File is empty' };
      }

      let jsonCount = 0;
      let plainTextCount = 0;

      for (const line of lines) {
        try {
          JSON.parse(line);
          jsonCount++;
        } catch {
          plainTextCount++;
        }
      }

      // Determine format based on majority
      if (jsonCount > plainTextCount) {
        return { format: 'json', confidence: jsonCount === lines.length ? 'high' : 'low' };
      } else if (plainTextCount > jsonCount) {
        return { format: 'plain-text', confidence: plainTextCount === lines.length ? 'high' : 'low' };
      } else {
        return { format: 'mixed', confidence: 'low' };
      }
    } catch (error) {
      return {
        format: 'unknown',
        confidence: 'none',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get all available log sources with their metadata
   * Public method for API endpoint
   * Only returns sources for files that actually exist
   */
  public getAvailableSources(): LogSource[] {
    const sources: LogSource[] = [];

    for (const [filepath, watched] of this.watchedFiles.entries()) {
      // Only include sources for files that actually exist
      if (fs.existsSync(filepath)) {
        sources.push({
          service: watched.service,
          filename: path.basename(filepath),
          filepath: filepath,
          format: watched.format || 'unknown',
          formatConfidence: watched.formatConfidence || 'none',
          watching: !!watched.watcher,
        });
      }
    }

    return sources;
  }

  /**
   * Watch a specific log file for changes
   */
  private watchFile(filepath: string, service: string): void {
    // Ensure file exists
    if (!fs.existsSync(filepath)) {
      logger.info({
        category: 'system',
        action: 'file_not_found',
        message: `Log file not found, will watch for creation: ${filepath}`,
      });
      // File doesn't exist yet, watch directory for creation
      this.watchForFileCreation(filepath, service);
      return;
    }

    // Validate log format
    const formatValidation = this.validateLogFormat(filepath);

    // Get current file size
    const stats = fs.statSync(filepath);
    const position = stats.size;

    // Create watcher
    const watcher = fs.watch(filepath, (eventType) => {
      if (eventType === 'change') {
        this.handleFileChange(filepath);
      } else if (eventType === 'rename') {
        // File was deleted/moved (rotation)
        logger.info({
          category: 'system',
          action: 'file_rotated',
          message: `Log file rotated: ${filepath}`,
        });
        this.watchForFileCreation(filepath, service);
      }
    });

    // Store watched file metadata with format info
    this.watchedFiles.set(filepath, {
      filepath,
      service,
      position,
      watcher,
      format: formatValidation.format,
      formatConfidence: formatValidation.confidence,
    });

    // Log format validation result and suggest fixes
    if (formatValidation.format === 'plain-text') {
      logger.warn({
        category: 'system',
        action: 'plain_text_format',
        message: `Log file is in plain text format (expected JSON): ${filepath}`,
        details: {
          service,
          format: formatValidation.format,
          confidence: formatValidation.confidence,
          suggestion: 'Move plain text logs to /logs/plain/ directory for automatic conversion',
        },
      });
    } else if (formatValidation.format === 'mixed' || formatValidation.format === 'unknown') {
      logger.warn({
        category: 'system',
        action: 'invalid_format',
        message: `Log file has inconsistent or unknown format: ${filepath}`,
        details: {
          service,
          format: formatValidation.format,
          confidence: formatValidation.confidence,
          suggestion: 'Ensure log files contain only JSON or move to /logs/plain/ for plain text',
        },
      });
    }

    logger.info({
      category: 'system',
      action: 'watching_file',
      message: `Watching log file: ${filepath}`,
      details: { service, position, format: formatValidation.format, confidence: formatValidation.confidence },
    });
  }

  /**
   * Watch directory for file creation
   */
  private watchForFileCreation(filepath: string, service: string): void {
    const dirname = path.dirname(filepath);
    const filename = path.basename(filepath);

    // Watch directory for file creation
    const dirWatcher = fs.watch(dirname, (eventType, changedFile) => {
      if (eventType === 'rename' && changedFile === filename) {
        // File was created
        if (fs.existsSync(filepath)) {
          logger.info({
            category: 'system',
            action: 'file_created',
            message: `Log file created: ${filepath}`,
          });
          dirWatcher.close();
          this.watchFile(filepath, service);
        }
      }
    });

    // Store temporary watcher
    this.watchedFiles.set(filepath, {
      filepath,
      service,
      position: 0,
      watcher: dirWatcher,
    });
  }

  /**
   * Handle file change event
   */
  private handleFileChange(filepath: string): void {
    // Debounce reads to avoid excessive I/O
    const existingTimer = this.readDebounceTimers.get(filepath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.readNewLines(filepath);
      this.readDebounceTimers.delete(filepath);
    }, 100); // 100ms debounce

    this.readDebounceTimers.set(filepath, timer);
  }

  /**
   * Read new lines from log file since last position
   */
  private readNewLines(filepath: string): void {
    const watched = this.watchedFiles.get(filepath);
    if (!watched) return;

    try {
      const stats = fs.statSync(filepath);
      const currentSize = stats.size;

      // Check if file was truncated (rotation)
      if (currentSize < watched.position) {
        logger.info({
          category: 'system',
          action: 'file_truncated',
          message: `Log file truncated: ${filepath}`,
        });
        watched.position = 0;
      }

      // No new data
      if (currentSize === watched.position) {
        return;
      }

      // Read new data
      const buffer = Buffer.alloc(currentSize - watched.position);
      const fd = fs.openSync(filepath, 'r');
      fs.readSync(fd, buffer, 0, buffer.length, watched.position);
      fs.closeSync(fd);

      // Update position
      watched.position = currentSize;

      // Parse and broadcast lines
      const content = buffer.toString('utf-8');
      const lines = content.split('\n').filter((line) => line.trim().length > 0);

      for (const line of lines) {
        this.processLogLine(line, watched.service, filepath);
      }
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'read_failed',
        message: `Failed to read log file: ${filepath}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Process and broadcast a single log line
   * Handles both JSON structured logs and plain text logs
   */
  private processLogLine(line: string, service: string, filepath?: string): void {
    // Check if this is from the plain text logs directory
    const isPlainTextLog = filepath?.includes('/plain/') ?? false;

    if (isPlainTextLog) {
      // Convert plain text to structured format
      const entry: StructuredLogEntry = this.convertPlainTextToStructured(line, service);
      this.broadcastLogEntry(entry);
    } else {
      try {
        // Parse as structured JSON log entry
        const entry: StructuredLogEntry = JSON.parse(line);

        // Validate required fields
        if (!entry.severity || !entry.timestamp || !entry.message) {
          logger.warn({
            category: 'system',
            action: 'invalid_log',
            message: 'Log entry missing required fields',
            details: { service, line: line.substring(0, 100) },
          });
          return;
        }

        // Broadcast to Socket.IO clients
        this.broadcastLogEntry(entry);
      } catch (error) {
        // Not valid JSON - log error and broadcast to UI
        logger.error({
          category: 'system',
          action: 'invalid_json',
          message: `Failed to parse log entry as JSON for service: ${service}`,
          details: { line: line.substring(0, 100) },
          error: error instanceof Error ? error : new Error(String(error)),
        });

        // Broadcast format error to UI
        this.broadcastFormatError(service, filepath || 'unknown', line);
      }
    }
  }

  /**
   * Convert plain text log line to structured format
   */
  private convertPlainTextToStructured(line: string, service: string): StructuredLogEntry {
    // Detect severity from line content
    let severity: LogSeverity = 'INFO';
    const lowerLine = line.toLowerCase();

    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('fatal')) {
      severity = 'ERROR';
    } else if (lowerLine.includes('warn') || lowerLine.includes('warning')) {
      severity = 'WARNING';
    } else if (lowerLine.includes('debug')) {
      severity = 'DEBUG';
    }

    // Detect category from content
    let category = 'system';
    if (lowerLine.includes('emulator') || lowerLine.includes('firestore') || lowerLine.includes('firebase')) {
      category = 'emulator';
    } else if (lowerLine.includes('http') || lowerLine.includes('server')) {
      category = 'server';
    }

    // Detect action from content
    let action = 'log';
    if (lowerLine.includes('start')) {
      action = 'starting';
    } else if (lowerLine.includes('stop') || lowerLine.includes('shutdown')) {
      action = 'stopping';
    } else if (lowerLine.includes('ready') || lowerLine.includes('listening')) {
      action = 'ready';
    } else if (lowerLine.includes('error')) {
      action = 'error';
    }

    return {
      severity,
      timestamp: new Date().toISOString(),
      environment: 'development',
      service,
      category,
      action,
      message: line,
    };
  }

  /**
   * Broadcast structured log entry to all subscribed clients
   */
  private broadcastLogEntry(entry: StructuredLogEntry): void {
    const service = entry.service;

    // Broadcast to service-specific room
    this.io.to(`logs:${service}`).emit('structured_log', entry);

    // Broadcast to "all logs" room
    this.io.to('logs:all').emit('structured_log', entry);
  }

  /**
   * Broadcast log format error to UI
   */
  private broadcastFormatError(service: string, filepath: string, invalidLine: string): void {
    const errorEntry: StructuredLogEntry = {
      severity: 'ERROR',
      timestamp: new Date().toISOString(),
      environment: 'development',
      service: 'dev-monitor-backend',
      category: 'log_format',
      action: 'invalid_format',
      message: `Invalid JSON in log file for service "${service}"`,
      details: {
        affectedService: service,
        filepath: filepath,
        invalidLine: invalidLine.substring(0, 200),
        suggestion: `Log file at ${filepath} must contain valid JSON. Move plain text logs to /logs/plain/ directory.`,
      },
    };

    // Broadcast to service-specific room
    this.io.to(`logs:${service}`).emit('structured_log', errorEntry);
    // Broadcast to "all logs" room
    this.io.to('logs:all').emit('structured_log', errorEntry);
    // Also broadcast as format error event
    this.io.emit('log_format_error', errorEntry);
  }

  /**
   * Get recent log entries from a file (file-based reading for external services)
   */
  public getRecentLogs(service: string, lines: number = 100): StructuredLogEntry[] {
    // Map service names to log file names
    const serviceNameMap: Record<string, string> = {
      'python-worker': 'worker',
      'frontend-dev': 'frontend',
      'firebase-emulators': 'firebase-emulators',
      'dev-monitor-backend': 'dev-monitor-backend',
    };
    
    const logFileName = serviceNameMap[service] || service;
    
    // Try multiple possible log file locations
    const possiblePaths = [
      path.join(this.logDir, `${logFileName}.log`),
      path.join(this.logDir, 'plain', `${logFileName}.log`),
      path.join(this.logDir, `${logFileName}-dev.log`),
    ];

    for (const filepath of possiblePaths) {
      if (fs.existsSync(filepath)) {
        try {
          // Read entire file
          const content = fs.readFileSync(filepath, 'utf-8');
          const allLines = content.split('\n').filter((line) => line.trim().length > 0);

          // Get last N lines
          const recentLines = allLines.slice(-lines);

          // Parse entries (JSON or convert plain text)
          const entries: StructuredLogEntry[] = [];
          for (const line of recentLines) {
            try {
              // Try to parse as JSON first
              const entry = JSON.parse(line);
              entries.push(entry);
            } catch {
              // Convert plain text to structured format
              const structuredEntry = this.convertPlainTextToStructured(line, service);
              entries.push(structuredEntry);
            }
          }

          logger.info({
            category: 'system',
            action: 'file_read_success',
            message: `Successfully read ${entries.length} log entries from file`,
            details: { service, filepath, entryCount: entries.length }
          });

          return entries;
        } catch (error) {
          logger.error({
            category: 'system',
            action: 'read_history_failed',
            message: `Failed to read log history: ${filepath}`,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    }

    // No log file found for this service
    logger.warn({
      category: 'system',
      action: 'log_file_not_found',
      message: `No log file found for service: ${service}`,
      details: { service, searchedPaths: possiblePaths }
    });

    return [];
  }

  /**
   * Clean up watchers
   */
  public destroy(): void {
    for (const [filepath, watched] of this.watchedFiles.entries()) {
      if (watched.watcher) {
        watched.watcher.close();
      }
    }
    this.watchedFiles.clear();

    for (const timer of this.readDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.readDebounceTimers.clear();

    logger.info({ category: 'system', action: 'destroyed', message: 'LogWatcher destroyed' });
  }
}
