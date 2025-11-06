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

// Service & Panel Types
export type LocalService = string;

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
export type PanelLayoutType =
  | 'single'
  | 'horizontal'
  | 'vertical'
  | 'main-sidebar'
  | 'quad'
  | string;

export type LogSource = string;

export interface PanelConfig {
  id: string;
  source: LogSource;
  paused: boolean;
  showMetadata: boolean;
  searchText: string;
  selectedServices: LocalService[];
  selectedLevels: DevMonitorLogLevel[];
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
