/**
 * Context System Centralized Logger
 *
 * Provides consistent logging across all context system components
 * with structured error messages, severity levels, and context metadata.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  component: string;
  operation?: string;
  cacheKey?: string;
  profile?: string;
  bundleId?: string;
  [key: string]: any;
}

export class ContextLogger {
  private static instance: ContextLogger;
  private logLevel: LogLevel;
  private enableTimestamps: boolean;

  private constructor() {
    this.logLevel = (process.env.CONTEXT_LOG_LEVEL as LogLevel) || 'info';
    this.enableTimestamps = process.env.CONTEXT_LOG_TIMESTAMPS !== 'false';
  }

  static getInstance(): ContextLogger {
    if (!ContextLogger.instance) {
      ContextLogger.instance = new ContextLogger();
    }
    return ContextLogger.instance;
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext, error?: Error): void {
    this.log('warn', message, context, error);
  }

  /**
   * Log an error message
   */
  error(message: string, context?: LogContext, error?: Error): void {
    this.log('error', message, context, error);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const parts: string[] = [];

    // Timestamp
    if (this.enableTimestamps) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    // Log level
    parts.push(`[${level.toUpperCase()}]`);

    // Component and operation
    if (context) {
      if (context.component) {
        parts.push(`[${context.component}]`);
      }
      if (context.operation) {
        parts.push(`<${context.operation}>`);
      }
    }

    // Message
    parts.push(message);

    // Additional context
    if (context) {
      const { component, operation, ...additionalContext } = context;

      if (Object.keys(additionalContext).length > 0) {
        parts.push(JSON.stringify(additionalContext));
      }
    }

    // Error details
    if (error) {
      parts.push(`Error: ${error.message}`);
      if (error.stack && level === 'error') {
        parts.push(`\nStack: ${error.stack}`);
      }
    }

    const logMessage = parts.join(' ');

    // Output to appropriate stream
    switch (level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'debug':
      case 'info':
      default:
        console.log(logMessage);
        break;
    }
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }
}

/**
 * Convenience function to get logger instance
 */
export function getContextLogger(): ContextLogger {
  return ContextLogger.getInstance();
}
