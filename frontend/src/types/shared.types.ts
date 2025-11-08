// Local type definitions (formerly from @jsdubzw/job-finder-shared-types)
// This file replaces the external dependency with local definitions

import type {
  HealthCheckResponse as ContractHealthCheckResponse,
  PortInfo as ContractPortInfo,
} from '@/types/contracts';

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

export type PortStatus = ContractPortInfo & {
  processName?: string | null;
  command?: string | null;
  startTime?: string | null;
};

// Health Check Types
export type HealthCheckResponse = ContractHealthCheckResponse;

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
