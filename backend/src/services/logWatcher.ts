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
import type { LogSourceManager } from './logSourceManager.js';
import { ShutdownStateManager } from './shutdownStateManager.js';
import { getDatabase } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve logs directory relative to this file (services -> src -> backend -> dev-monitor -> root -> logs)
const DEFAULT_LOG_DIR = path.resolve(__dirname, '../../../../logs');
const DEFAULT_MAX_RECENT_ENTRIES = 500;

type LogSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
type DevMonitorLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface DevMonitorLogLine {
  id: string;
  service: string;
  timestamp: number;
  level: DevMonitorLogLevel;
  message: string;
  raw: string;
}

interface LogWatcherOptions {
  logDir?: string;
  logSourceManager?: LogSourceManager;
  maxRecentEntries?: number;
}

const SERVICE_ALIAS_MAP: Record<string, string> = {
  'backend': 'firebase-emulators',
  'firebase': 'firebase-emulators',
  'job-finder-backend': 'firebase-emulators',
  'frontend': 'frontend-dev',
  'frontend_dev': 'frontend-dev',
  'job-finder-frontend': 'frontend-dev',
  'app-monitor-frontend': 'frontend-dev',
  'worker': 'job-finder-worker',
  'queue_worker': 'job-finder-worker',
  'python-worker': 'job-finder-worker',
  'dev-monitor': 'dev-monitor-backend',
  'dev': 'dev-monitor-backend',
  'app-monitor-backend': 'dev-monitor-backend',
};

const SERVICE_FILE_CANDIDATES: Record<string, string[]> = {
  'firebase-emulators': ['backend', 'firebase-emulators'],
  'frontend-dev': ['frontend', 'job-finder-frontend'],
  'job-finder-worker': ['worker', 'queue_worker', 'job-finder-worker'],
  'dev-monitor-backend': ['dev-monitor-backend', 'dev'],
};

const PLAIN_LOG_DIR_NAME = 'plain';

// Export for use in other services
export interface StructuredLogEntry {
  severity: LogSeverity;
  timestamp: string;
  environment: string;
  service: string;
  category?: string;
  action?: string;
  message?: string;
  details?: Record<string, unknown>;
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

interface WatchedLogSource {
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
  private logSourceManager?: LogSourceManager;
  private recentEntries: Map<string, StructuredLogEntry[]> = new Map();
  private maxRecentEntries: number;
  private logIdCounter = 0;
  private shutdownStateManager: ShutdownStateManager;

  constructor(io: SocketIOServer, options: LogWatcherOptions = {}) {
    this.io = io;
    const { logDir, logSourceManager, maxRecentEntries } = options;
    // Default to /logs directory in repository root
    this.logDir = logDir || DEFAULT_LOG_DIR;
    this.logSourceManager = logSourceManager;
    this.maxRecentEntries = maxRecentEntries ?? DEFAULT_MAX_RECENT_ENTRIES;
    this.shutdownStateManager = new ShutdownStateManager(getDatabase());

    this.initializeWatchers();

    // Restore file positions on startup
    this.restoreFilePositions();

    logger.info({
      category: 'system',
      action: 'initialized',
      message: 'LogWatcher initialized',
      details: {
        logDir: this.logDir,
        hasLogSourceManager: Boolean(this.logSourceManager),
        maxRecentEntries: this.maxRecentEntries,
      },
    });
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
   * Streams all discovered logs including configured sources and plain-text mirrors
   */
  private discoverLogFiles(): Array<{ filepath: string; service: string }> {
    const logFiles: Array<{ filepath: string; service: string }> = [];
    const seenPaths = new Set<string>();

    const addLogFile = (filepath: string, serviceCandidate: string) => {
      const resolvedPath = path.resolve(filepath);
      const parentDir = path.dirname(resolvedPath);

      if (!fs.existsSync(parentDir)) {
        logger.warn({
          category: 'system',
          action: 'log_directory_missing',
          message: `Skipping log file because parent directory is missing`,
          details: { filepath: resolvedPath },
        });
        return;
      }

      if (seenPaths.has(resolvedPath)) {
        return;
      }

      const normalizedService = this.normalizeServiceName(serviceCandidate);
      seenPaths.add(resolvedPath);
      logFiles.push({ filepath: resolvedPath, service: normalizedService });
    };

    const scanDirectory = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.log')) {
            const baseName = entry.name.replace(/\.log$/i, '');
            const service = this.inferServiceFromFilename(baseName);
            addLogFile(path.join(dir, entry.name), service);
          } else if (entry.isDirectory()) {
            const childDir = path.join(dir, entry.name);
            if (entry.name === PLAIN_LOG_DIR_NAME) {
              scanDirectory(childDir);
            }
          }
        }
      } catch (error) {
        logger.warn({
          category: 'system',
          action: 'directory_scan_failed',
          message: `Failed to scan logs directory: ${dir}`,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    };

    if (!fs.existsSync(this.logDir)) {
      logger.warn({
        category: 'system',
        action: 'directory_not_found',
        message: `Log directory not found: ${this.logDir}`,
      });
      return logFiles;
    }

    scanDirectory(this.logDir);

    if (this.logSourceManager) {
      try {
        const sources = this.logSourceManager.getEnabledSources();
        for (const source of sources) {
          const resolvedPath = this.logSourceManager.resolveLogPath(source);
          const serviceId = source.id || source.name || source.path;
          addLogFile(resolvedPath, serviceId);
        }
      } catch (error) {
        logger.warn({
          category: 'system',
          action: 'log_source_manager_unavailable',
          message: 'Failed to load configured log sources',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
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
      'backend': 'firebase-emulators',
      'frontend': 'frontend-dev',
      'frontend-dev': 'frontend-dev',
      'worker': 'job-finder-worker',
      'queue_worker': 'job-finder-worker',
      'job-finder-worker': 'job-finder-worker',
      'dev-monitor-backend': 'dev-monitor-backend',
      'dev-monitor': 'dev-monitor-backend',
      'dev': 'dev-monitor-backend',
      'firebase-emulators': 'firebase-emulators',
    };

    const mapped = serviceMap[baseName] || baseName;
    return this.normalizeServiceName(mapped);
  }

  /**
   * Normalize service names to the identifiers used by the UI
   */
  private normalizeServiceName(service: string): string {
    if (!service) {
      return 'unknown';
    }

    const aliasKey = service.toLowerCase();
    return SERVICE_ALIAS_MAP[aliasKey] || service;
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
  public getAvailableSources(): WatchedLogSource[] {
    const sources: WatchedLogSource[] = [];

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
        this.recentEntries.delete(watched.service);
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
    const normalizedService = this.normalizeServiceName(service);

    if (isPlainTextLog) {
      // Convert plain text to structured format
      const entry: StructuredLogEntry = this.convertPlainTextToStructured(line, normalizedService);
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

        entry.service = this.normalizeServiceName(entry.service || normalizedService);
        entry.severity = entry.severity.toUpperCase() as LogSeverity;

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
    const normalizedService = this.normalizeServiceName(service);

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
      service: normalizedService,
      category,
      action,
      message: line,
    };
  }

  /**
   * Broadcast structured log entry to all subscribed clients
   */
  private broadcastLogEntry(entry: StructuredLogEntry): void {
    const normalizedService = this.normalizeServiceName(entry.service);
    const normalizedSeverity = (entry.severity || 'INFO').toUpperCase() as LogSeverity;
    const timestamp = entry.timestamp || new Date().toISOString();

    const normalizedEntry: StructuredLogEntry = {
      ...entry,
      service: normalizedService,
      severity: normalizedSeverity,
      timestamp,
    };

    this.cacheLogEntry(normalizedEntry);
    const logLine = this.convertStructuredToLogLine(normalizedEntry);

    // Broadcast to service-specific room
    this.io.to(`logs:${normalizedService}`).emit('structured_log', normalizedEntry);
    this.io.to(`logs:${normalizedService}`).emit('log_line', logLine);

    // Broadcast to "all logs" room
    this.io.to('logs:all').emit('structured_log', normalizedEntry);
    this.io.to('logs:all').emit('log_line', logLine);
  }

  /**
   * Cache recent log entries for quick history retrieval
   */
  private cacheLogEntry(entry: StructuredLogEntry): void {
    const service = entry.service;
    const existing = this.recentEntries.get(service) ?? [];
    existing.push(entry);

    if (existing.length > this.maxRecentEntries) {
      existing.splice(0, existing.length - this.maxRecentEntries);
    }

    this.recentEntries.set(service, existing);
  }

  /**
   * Convert a structured log entry to the Dev Monitor line format
   */
  private convertStructuredToLogLine(entry: StructuredLogEntry): DevMonitorLogLine {
    const timestampMs = Number.isNaN(new Date(entry.timestamp).getTime())
      ? Date.now()
      : new Date(entry.timestamp).getTime();

    let message = entry.message;
    if (!message && entry.details) {
      if (typeof entry.details.message === 'string') {
        message = entry.details.message;
      } else {
        message = JSON.stringify(entry.details);
      }
    }

    return {
      id: `${entry.service}-${this.logIdCounter++}`,
      service: entry.service,
      timestamp: timestampMs,
      level: this.mapSeverityToLevel(entry.severity),
      message: message || 'Log entry',
      raw: JSON.stringify(entry),
    };
  }

  /**
   * Map structured log severity to Dev Monitor log level
   */
  private mapSeverityToLevel(severity: string): DevMonitorLogLevel {
    switch ((severity || '').toUpperCase()) {
      case 'ERROR':
        return 'ERROR';
      case 'WARNING':
      case 'WARN':
        return 'WARN';
      case 'DEBUG':
        return 'DEBUG';
      default:
        return 'INFO';
    }
  }

  /**
   * Broadcast log format error to UI
   */
  private broadcastFormatError(service: string, filepath: string, invalidLine: string): void {
    const normalizedService = this.normalizeServiceName(service);
    const errorEntry: StructuredLogEntry = {
      severity: 'ERROR',
      timestamp: new Date().toISOString(),
      environment: 'development',
      service: normalizedService,
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

    this.cacheLogEntry(errorEntry);
    const logLine = this.convertStructuredToLogLine(errorEntry);

    // Broadcast to service-specific room
    this.io.to(`logs:${normalizedService}`).emit('structured_log', errorEntry);
    this.io.to(`logs:${normalizedService}`).emit('log_line', logLine);
    // Broadcast to "all logs" room
    this.io.to('logs:all').emit('structured_log', errorEntry);
    this.io.to('logs:all').emit('log_line', logLine);
    // Also broadcast as format error event
    this.io.emit('log_format_error', errorEntry);
  }

  /**
   * Get recent log entries from a file (file-based reading for external services)
   */
  public getRecentLogs(service: string, lines: number = 100): StructuredLogEntry[] {
    const normalizedService = this.normalizeServiceName(service);

    const cached = this.recentEntries.get(normalizedService);
    if (cached && cached.length > 0) {
      return cached.slice(-lines);
    }

    const candidateBases = SERVICE_FILE_CANDIDATES[normalizedService] ?? [normalizedService];
    const possiblePaths: string[] = [];

    for (const base of candidateBases) {
      possiblePaths.push(path.join(this.logDir, `${base}.log`));
      possiblePaths.push(path.join(this.logDir, PLAIN_LOG_DIR_NAME, `${base}.log`));
      possiblePaths.push(path.join(this.logDir, `${base}-dev.log`));
    }

    for (const filepath of possiblePaths) {
      if (!fs.existsSync(filepath)) {
        continue;
      }

      try {
        const content = fs.readFileSync(filepath, 'utf-8');
        const allLines = content.split('\n').filter((line) => line.trim().length > 0);
        const recentLines = allLines.slice(-lines);
        const entries: StructuredLogEntry[] = [];
        const isPlainLog = filepath.includes(`${path.sep}${PLAIN_LOG_DIR_NAME}${path.sep}`);

        for (const line of recentLines) {
          if (!line) continue;

          if (isPlainLog) {
            const structuredEntry = this.convertPlainTextToStructured(line, normalizedService);
            entries.push(structuredEntry);
            continue;
          }

          try {
            const parsed: StructuredLogEntry = JSON.parse(line);
            const normalizedEntry: StructuredLogEntry = {
              ...parsed,
              service: this.normalizeServiceName(parsed.service || normalizedService),
              severity: (parsed.severity || 'INFO').toUpperCase() as LogSeverity,
              timestamp: parsed.timestamp || new Date().toISOString(),
            };
            entries.push(normalizedEntry);
          } catch {
            const structuredEntry = this.convertPlainTextToStructured(line, normalizedService);
            entries.push(structuredEntry);
          }
        }

        logger.info({
          category: 'system',
          action: 'file_read_success',
          message: `Read ${entries.length} log entries from file`,
          details: { service: normalizedService, filepath, entryCount: entries.length },
        });

        if (entries.length > 0) {
          const trimmed = entries.slice(-this.maxRecentEntries);
          this.recentEntries.set(normalizedService, trimmed);
        }

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

    logger.warn({
      category: 'system',
      action: 'log_file_not_found',
      message: `No log file found for service: ${normalizedService}`,
      details: { service: normalizedService, searchedPaths: possiblePaths },
    });

    return [];
  }

  /**
   * Restore file read positions from database
   */
  private async restoreFilePositions(): Promise<void> {
    try {
      const positions = await this.shutdownStateManager.restoreLogFilePositions();

      for (const [filePath, position] of positions.entries()) {
        const watchedFile = this.watchedFiles.get(filePath);
        if (watchedFile) {
          watchedFile.position = position;
          logger.info({
            category: 'system',
            action: 'file_position_restored',
            message: 'File position restored from previous session',
            details: { filePath, position }
          });
        }
      }
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'file_position_restore_failed',
        message: 'Failed to restore file positions',
        error
      });
    }
  }

  /**
   * Get current file positions for persistence
   */
  public getFilePositions(): Map<string, number> {
    const positions = new Map<string, number>();

    for (const [filePath, watchedFile] of this.watchedFiles.entries()) {
      positions.set(filePath, watchedFile.position);
    }

    return positions;
  }

  /**
   * Clean up watchers
   */
  public destroy(): void {
    for (const [, watched] of this.watchedFiles.entries()) {
      if (watched.watcher) {
        watched.watcher.close();
      }
    }
    this.watchedFiles.clear();

    for (const timer of this.readDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.readDebounceTimers.clear();
    this.recentEntries.clear();
    this.logIdCounter = 0;

    logger.info({ category: 'system', action: 'destroyed', message: 'LogWatcher destroyed' });
  }
}
