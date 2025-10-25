/**
 * Centralized API Service
 * 
 * Refactored to use the centralized ApiClient.
 * Replaces scattered axios calls with consistent patterns.
 */

import { apiClient } from './ApiClient';
import { ProcessInfo } from '../types/service.types';
import { Environment, CloudService, ParsedCloudLog, CloudLoggingStatus } from '../types/log.types';
import { Script, ScriptExecution, ScriptExecutionSummary } from '../types/script.types';

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

// Health check endpoint
export const healthCheck = async (): Promise<HealthCheckResponse> => {
  return apiClient.get<HealthCheckResponse>('/health');
};

// Service control endpoints
export const getAllStatuses = async (): Promise<ProcessInfo[]> => {
  return apiClient.get<ProcessInfo[]>('/services/status');
};

export const getServiceStatus = async (serviceName: string): Promise<ProcessInfo> => {
  return apiClient.get<ProcessInfo>(`/services/${serviceName}/status`);
};

export const startService = async (serviceName: string): Promise<ProcessInfo> => {
  return apiClient.post<ProcessInfo>(`/services/${serviceName}/start`);
};

export const stopService = async (serviceName: string, graceful: boolean = true): Promise<ProcessInfo> => {
  return apiClient.post<ProcessInfo>(
    `/services/${serviceName}/stop`,
    {},
    { params: { graceful } }
  );
};

export const restartService = async (serviceName: string, graceful: boolean = true): Promise<ProcessInfo> => {
  return apiClient.post<ProcessInfo>(
    `/services/${serviceName}/restart`,
    {},
    { params: { graceful } }
  );
};

export const killService = async (serviceName: string): Promise<ProcessInfo> => {
  return apiClient.post<ProcessInfo>(`/services/${serviceName}/kill`);
};

export const getServiceLogs = async (serviceName: string, lines: number = 100): Promise<{ serviceName: string; logs: string[] }> => {
  return apiClient.get<{ serviceName: string; logs: string[] }>(
    `/services/${serviceName}/logs`,
    { params: { lines } }
  );
};

// Cloud logs endpoints
export const getEnvironments = async (): Promise<Record<string, Environment>> => {
  return apiClient.get<Record<string, Environment>>('/environments');
};

export const getEnvironmentServices = async (environment: string): Promise<CloudService[]> => {
  return apiClient.get<CloudService[]>(`/environments/${environment}/services`);
};

export interface GetCloudLogsParams {
  environment: string;
  service: string;
  severity?: string;
  limit?: number;
  startTime?: string;
  endTime?: string;
}

export const getCloudLogs = async (params: GetCloudLogsParams): Promise<{ environment: string; service: string; count: number; logs: ParsedCloudLog[] }> => {
  const { environment, service, ...queryParams } = params;
  return apiClient.get<{ environment: string; service: string; count: number; logs: ParsedCloudLog[] }>(
    `/logs/cloud/${environment}/${service}`,
    { params: queryParams }
  );
};

export const checkCloudLoggingStatus = async (): Promise<CloudLoggingStatus> => {
  return apiClient.get<CloudLoggingStatus>('/logs/cloud/status');
};

// Log sources endpoint (dynamically discovered log files)
export interface LogSource {
  service: string;
  filename: string;
  filepath: string;
  format: string;
  formatConfidence: string;
  watching: boolean;
}

export const getLogSources = async (): Promise<LogSource[]> => {
  const response = await apiClient.get<{ count: number; sources: LogSource[] }>('/logs/sources');
  return response.sources;
};

// Script management endpoints
export const getScripts = async (): Promise<Script[]> => {
  const response = await apiClient.get<{ count: number; scripts: Script[] }>('/scripts');
  return response.scripts;
};

export const executeScript = async (scriptId: string): Promise<{ success: boolean; execution: { id: string; scriptId: string; status: string; startTime: Date } }> => {
  return apiClient.post<{ success: boolean; execution: { id: string; scriptId: string; status: string; startTime: Date } }>(
    `/scripts/${scriptId}/execute`
  );
};

export const getExecutions = async (): Promise<ScriptExecutionSummary[]> => {
  const response = await apiClient.get<{ count: number; executions: ScriptExecutionSummary[] }>('/scripts/executions');
  return response.executions;
};

export const getExecution = async (executionId: string): Promise<ScriptExecution> => {
  return apiClient.get<ScriptExecution>(`/scripts/executions/${executionId}`);
};

export const killScript = async (executionId: string): Promise<{ success: boolean; message: string }> => {
  return apiClient.post<{ success: boolean; message: string }>(`/scripts/executions/${executionId}/kill`);
};

export const clearScriptHistory = async (): Promise<{ success: boolean; message: string }> => {
  return apiClient.delete<{ success: boolean; message: string }>('/scripts/executions');
};

// Port management endpoints
export interface PortInfo {
  port: number;
  pid: number | null;
  inUse: boolean;
}

export interface PortStatuses {
  [serviceName: string]: PortInfo[];
}

export const getPortStatuses = async (): Promise<PortStatuses> => {
  return apiClient.get<PortStatuses>('/ports/status');
};

export const killPortProcess = async (port: number): Promise<{ success: boolean; message: string; port: number; pid?: number; wasInUse: boolean }> => {
  return apiClient.post<{ success: boolean; message: string; port: number; pid?: number; wasInUse: boolean }>(
    `/ports/${port}/kill`
  );
};

// Error handling utility
export const handleApiError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
};

// Re-export the apiClient for direct use if needed
export { apiClient };

// Export everything as a namespace for components that use `api.method()`
export const api = {
  healthCheck,
  getAllStatuses,
  getServiceStatus,
  startService,
  stopService,
  restartService,
  killService,
  getServiceLogs,
  getEnvironments,
  getEnvironmentServices,
  getCloudLogs,
  checkCloudLoggingStatus,
  getLogSources,
  getScripts,
  executeScript,
  getExecutions,
  getExecution,
  killScript,
  clearScriptHistory,
  getPortStatuses,
  killPortProcess,
  handleApiError,
  // Add HTTP methods for components that need them
  get: apiClient.get.bind(apiClient),
  post: apiClient.post.bind(apiClient),
  put: apiClient.put.bind(apiClient),
  delete: apiClient.delete.bind(apiClient),
};