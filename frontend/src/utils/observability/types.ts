import type { FrontendLogEntry, FrontendLogLevel } from '@app-monitor/api-contracts';

/**
 * Observability types for logging and tracing.
 * These re-export the shared contracts to ensure backend/frontend stay aligned.
 */
export type LogLevel = FrontendLogLevel;
export type LogEntry = FrontendLogEntry;
