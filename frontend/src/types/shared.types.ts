// Local type definitions (formerly from @jsdubzw/job-finder-shared-types)
// This file replaces the external dependency with local definitions

// Log Types
export type DevMonitorLogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export interface DevMonitorLogLine {
  id: string;
  timestamp: number;
  level: DevMonitorLogLevel;
  service: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface LogHistory {
  serviceName: string; // Note: property name is serviceName, not service
  logs: DevMonitorLogLine[];
}

// Service Types
export type LocalService =
  | 'app-monitor-backend'
  | 'dev-monitor-backend' // legacy name
  | 'app-monitor-frontend'
  | 'frontend-dev'
  | 'firebase-emulators'
  | 'python-worker'
  | 'dev-bot-a'
  | 'dev-bot-b'
  | 'all';

export interface Service {
  name: string;
  displayName: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error';
  pid?: number;
  ports?: number[];
  uptime?: number;
}

export interface PortStatus {
  port: number;
  inUse: boolean;
  pid?: number;
  processName?: string;
}

// Script Types
export interface Script {
  id: string;
  name: string;
  description?: string;
  command: string;
  args?: string[];
  cwd?: string;
}

export interface ScriptExecution {
  id: string;
  scriptId: string;
  startedAt: number;
  completedAt?: number;
  exitCode?: number;
  status: 'running' | 'completed' | 'failed' | 'killed';
  output?: string;
  error?: string;
}

export interface ScriptExecutionSummary {
  id: string;
  scriptId: string;
  scriptName: string;
  startedAt: number;
  completedAt?: number;
  exitCode?: number;
  status: 'running' | 'completed' | 'failed' | 'killed';
  duration?: number;
}

// Health Check Types
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: number;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail';
      message?: string;
    };
  };
}

// Panel Types
export type PanelLayoutType = '1-panel' | '2-panel-vertical' | '2-panel-horizontal' | '3-panel' | '4-panel';

export type LogSource =
  | { type: 'local'; service: LocalService }
  | { type: 'cloud'; environment: string; service: string };

export interface PanelConfig {
  id: string;
  source: LogSource;
  filters?: {
    levels?: DevMonitorLogLevel[];
    searchText?: string;
  };
}

export interface SavedPanelLayout {
  name: string;
  layoutType: PanelLayoutType;
  panels: PanelConfig[];
  createdAt: string;
  updatedAt?: string;
}
