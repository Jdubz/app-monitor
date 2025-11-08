// Log types - re-export from local shared types

import type {
  DevMonitorLogLine,
  DevMonitorLogLevel,
  LogHistory,
  LocalService,
} from './shared.types';
import type {
  EnvironmentDefinition,
  CloudService as SharedCloudService,
  CloudLoggingStatus as SharedCloudLoggingStatus,
} from '@app-monitor/api-contracts';

// Re-export all types
export type { DevMonitorLogLine, DevMonitorLogLevel, LogHistory, LocalService };

// Type aliases for convenience
export type LogLine = DevMonitorLogLine;
export type LogLevel = DevMonitorLogLevel;

// Filter types
export interface LogFilters {
  services: string[];
  levels: LogLevel[];
  searchText: string;
  timeRange?: { start: number; end: number };
}

// Cloud logs types (these remain frontend-specific)
export interface ParsedCloudLog {
  id: string;
  service: string;
  timestamp: number;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  metadata: {
    trace?: string;
    spanId?: string;
    resource?: Record<string, unknown>;
    labels?: Record<string, string>;
    severity?: string;
    insertId?: string;
    logName?: string;
    [key: string]: unknown;
  };
  raw: unknown;
}

export interface CloudLogHistory {
  environment: string;
  service: string;
  logs: ParsedCloudLog[];
}

export type Environment = EnvironmentDefinition;

export type CloudService = SharedCloudService;

export type CloudLoggingStatus = SharedCloudLoggingStatus;
