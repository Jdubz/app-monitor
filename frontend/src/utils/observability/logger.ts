/**
 * Enhanced Logger with Trace ID Support
 *
 * Minimalist implementation for AI-first debugging.
 * Logs stream to backend as JSONL for grep-based searching.
 */

import type { LogEntry, LogLevel } from './types';

class Logger {
  private static instance: Logger;
  private sessionId: string;
  private logBuffer: LogEntry[] = [];
  private logIdCounter = 0;

  private constructor() {
    this.sessionId = this.generateSessionId();
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateLogId(): string {
    return `log-${this.sessionId}-${++this.logIdCounter}`;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    scope: string,
    data?: Record<string, unknown>,
    error?: Error,
    traceId?: string
  ): LogEntry {
    const entry: LogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      level,
      message,
      scope,
      sessionId: this.sessionId,
      route: window.location.pathname,
      userId: this.getCurrentUserId(),
    };

    if (traceId) {
      entry.traceId = traceId;
    }

    if (data) {
      entry.data = data;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: (error as any).cause,
      };
    }

    return entry;
  }

  private getCurrentUserId(): string | undefined {
    // TODO: Integrate with auth system
    return undefined;
  }

  private log(
    level: LogLevel,
    message: string,
    scope: string,
    dataOrError?: Record<string, unknown> | Error,
    traceId?: string
  ): void {
    const isError = dataOrError instanceof Error;
    const entry = this.createLogEntry(
      level,
      message,
      scope,
      isError ? undefined : dataOrError,
      isError ? dataOrError : undefined,
      traceId
    );

    // Add to buffer for transport
    this.logBuffer.push(entry);

    // Also log to console for development
    if (import.meta.env.DEV) {
      const consoleMethod = level === 'error' || level === 'fatal'
        ? 'error'
        : level === 'warn'
        ? 'warn'
        : 'log';

      console[consoleMethod](
        `[${level.toUpperCase()}] ${scope}: ${message}`,
        entry.data || entry.error || ''
      );
    }

    // Trigger transport if buffer is large
    if (this.logBuffer.length >= 100) {
      this.flush();
    }
  }

  trace(message: string, scope: string, data?: Record<string, unknown>, traceId?: string): void {
    this.log('trace', message, scope, data, traceId);
  }

  debug(message: string, scope: string, data?: Record<string, unknown>, traceId?: string): void {
    this.log('debug', message, scope, data, traceId);
  }

  info(message: string, scope: string, data?: Record<string, unknown>, traceId?: string): void {
    this.log('info', message, scope, data, traceId);
  }

  warn(message: string, scope: string, data?: Record<string, unknown>, traceId?: string): void {
    this.log('warn', message, scope, data, traceId);
  }

  error(message: string, scope: string, error?: Error, data?: Record<string, unknown>, traceId?: string): void {
    const combined = error ? { ...data, error } : data;
    this.log('error', message, scope, error || combined, traceId);
  }

  fatal(message: string, scope: string, error?: Error, data?: Record<string, unknown>, traceId?: string): void {
    const combined = error ? { ...data, error } : data;
    this.log('fatal', message, scope, error || combined, traceId);
  }

  /**
   * Get buffered logs and clear buffer
   */
  flush(): LogEntry[] {
    const logs = [...this.logBuffer];
    this.logBuffer = [];
    return logs;
  }

  /**
   * Get current buffer without clearing
   */
  getBuffer(): LogEntry[] {
    return [...this.logBuffer];
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
