/**
 * Dev-Monitor Structured Logger
 *
 * Modern, clean logging system for dev-monitor backend.
 * Structured JSON logging with console and file output.
 *
 * Usage:
 * ```typescript
 * import { logger } from './utils/logger'
 *
 * logger.info({
 *   category: 'api',
 *   action: 'request',
 *   message: 'Starting service',
 *   details: { serviceName: 'backend' }
 * })
 * ```
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.resolve(__dirname, '../../../logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

type LogLevel = 'debug' | 'info' | 'warning' | 'error';
type LogSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
type LogCategory = 'system' | 'api' | 'process' | 'logs' | 'scripts' | 'cloud' | 'socket' | 'docker';

interface LogEntry {
  category: LogCategory;
  action: string;
  message: string;
  details?: Record<string, unknown>;
}

interface LogEntryWithError extends LogEntry {
  error?: Error | unknown;
}

interface FormattedLogEntry extends LogEntry {
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
}

interface LogOutput extends FormattedLogEntry {
  severity: LogSeverity;
  timestamp: string;
  environment: string;
  service: string;
}

class Logger {
  private logFile: string;
  private isDev: boolean;

  constructor() {
    this.logFile = path.join(LOGS_DIR, 'dev-monitor-backend.log');
    this.isDev = (process.env.NODE_ENV || 'development') === 'development';
  }

  private getSeverity(level: LogLevel): LogSeverity {
    const map: Record<LogLevel, LogSeverity> = {
      debug: 'DEBUG',
      info: 'INFO',
      warning: 'WARNING',
      error: 'ERROR',
    };
    return map[level];
  }

  private getConsoleMethod(level: LogLevel): 'debug' | 'log' | 'warn' | 'error' {
    const map: Record<LogLevel, 'debug' | 'log' | 'warn' | 'error'> = {
      debug: 'debug',
      info: 'log',
      warning: 'warn',
      error: 'error',
    };
    return map[level];
  }

  private formatError(error: Error | unknown): { type: string; message: string; stack?: string } {
    if (error instanceof Error) {
      return {
        type: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    return {
      type: 'UnknownError',
      message: String(error),
    };
  }

  private writeLog(level: LogLevel, entry: FormattedLogEntry): void {
    const logOutput: LogOutput = {
      severity: this.getSeverity(level),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      service: 'dev-monitor-backend',
      ...entry,
    };

    const consoleMethod = this.getConsoleMethod(level);

    if (this.isDev) {
      // Development: Pretty formatted with colors
      const colors: Record<LogLevel, string> = {
        debug: '\x1b[90m', // Gray
        info: '\x1b[36m', // Cyan
        warning: '\x1b[33m', // Yellow
        error: '\x1b[31m', // Red
      };
      const reset = '\x1b[0m';

      console[consoleMethod](
        `${colors[level]}[${logOutput.severity}]${reset} ${logOutput.category}:${logOutput.action} - ${logOutput.message}`,
        logOutput.details || ''
      );

      if (logOutput.error) {
        console[consoleMethod](`  Error: ${logOutput.error.message}`);
        if (logOutput.error.stack) {
          console[consoleMethod](`  ${logOutput.error.stack}`);
        }
      }
    } else {
      // Production: JSON output
      console[consoleMethod](JSON.stringify(logOutput));
    }

    // File output (always JSON)
    try {
      fs.appendFileSync(this.logFile, JSON.stringify(logOutput) + '\n');
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  debug(entry: LogEntry): void {
    this.writeLog('debug', entry);
  }

  info(entry: LogEntry): void {
    this.writeLog('info', entry);
  }

  warn(entry: LogEntry): void {
    this.writeLog('warning', entry);
  }

  error(entry: LogEntryWithError): void {
    const errorEntry: FormattedLogEntry = {
      ...entry,
      error: entry.error ? this.formatError(entry.error) : undefined,
    };
    this.writeLog('error', errorEntry);
  }
}

// Export singleton logger instance
export const logger = new Logger();