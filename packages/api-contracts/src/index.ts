export type ServiceStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error';

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

export interface DockerContainerInfo {
  name: string;
  status: 'running' | 'stopped' | 'exited' | 'unknown';
  workerStatus?: 'running' | 'idle' | 'stopped' | 'unknown';
  containerId?: string;
}

export interface ProcessInfo {
  name: string;
  displayName: string;
  status: ServiceStatus;
  pid?: number;
  ports?: number[];
  uptime?: number;
  error?: string;
  startedAt?: number;
  dockerContainer?: DockerContainerInfo;
}

export interface LogSource {
  id: string;
  name: string;
  format: string;
  parser: string;
  color: string;
  displayOrder: number;
  path: string;
}

export interface CloudService {
  name: string;
  displayName: string;
  description: string;
  logFilter?: string;
}

export interface CloudLoggingStatus {
  available: boolean;
  message: string;
}

export interface EnvironmentDefinition {
  name: string;
  displayName: string;
  projectId: string;
  services: CloudService[];
  readOnly?: boolean;
}

export type EnvironmentsResponse = Record<string, EnvironmentDefinition>;

export type EnvironmentServicesResponse = CloudService[];

export interface ServiceLogsResponse {
  serviceName: string;
  logs: string[];
}

export interface PortInfo {
  port: number;
  pid: number | null;
  inUse: boolean;
}

export type PortStatusMap = Record<string, PortInfo[]>;

export interface PortKillResponse {
  success: boolean;
  message: string;
  port: number;
  pid?: number | null;
  wasInUse: boolean;
}
