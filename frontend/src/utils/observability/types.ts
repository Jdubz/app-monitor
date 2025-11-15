/**
 * Observability types for logging and tracing
 */

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  id: string;
  timestamp: number | string;
  level: LogLevel;
  message: string;
  scope?: string;
  sessionId?: string;
  traceId?: string;
  route?: string;
  userId?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    cause?: unknown;
  };
  metadata?: Record<string, unknown>;
}
