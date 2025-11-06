/**
 * Centralized API Service
 *
 * Refactored to use the centralized ApiClient.
 * Replaces scattered axios calls with consistent patterns.
 */

import type { ApiClient } from "./ApiClient";
import { ProcessInfo } from "../types/service.types";
import {
  Environment,
  CloudService,
  ParsedCloudLog,
  CloudLoggingStatus,
} from "../types/log.types";
import {
  Script,
  ScriptExecution,
  ScriptExecutionSummary,
} from "../types/script.types";

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

// Health check endpoint
const API_CLIENT_SYMBOL = "__APP_MONITOR_API_CLIENT__";

const getApiClient = async (): Promise<ApiClient> => {
  const globalClient = (globalThis as Record<string, unknown>)[
    API_CLIENT_SYMBOL
  ];
  if (globalClient) {
    return globalClient as ApiClient;
  }

  const module = await import("./ApiClient");
  const client = module.apiClient;
  (globalThis as Record<string, unknown>)[API_CLIENT_SYMBOL] = client;
  return client;
};

export const healthCheck = async (): Promise<HealthCheckResponse> => {
  const client = await getApiClient();
  return client.get<HealthCheckResponse>("/health");
};

// Service control endpoints
export const getAllStatuses = async (): Promise<ProcessInfo[]> => {
  const client = await getApiClient();
  return client.get<ProcessInfo[]>("/services/status");
};

export const getServiceStatus = async (
  serviceName: string,
): Promise<ProcessInfo> => {
  const client = await getApiClient();
  return client.get<ProcessInfo>(`/services/${serviceName}/status`);
};

export const startService = async (
  serviceName: string,
): Promise<ProcessInfo> => {
  const client = await getApiClient();
  return client.post<ProcessInfo>(`/services/${serviceName}/start`);
};

export const stopService = async (
  serviceName: string,
  graceful: boolean = true,
): Promise<ProcessInfo> => {
  const client = await getApiClient();
  return client.post<ProcessInfo>(
    `/services/${serviceName}/stop`,
    {},
    { params: { graceful } },
  );
};

export const restartService = async (
  serviceName: string,
  graceful: boolean = true,
): Promise<ProcessInfo> => {
  const client = await getApiClient();
  return client.post<ProcessInfo>(
    `/services/${serviceName}/restart`,
    {},
    { params: { graceful } },
  );
};

export const killService = async (
  serviceName: string,
): Promise<ProcessInfo> => {
  const client = await getApiClient();
  return client.post<ProcessInfo>(`/services/${serviceName}/kill`);
};

export const getServiceLogs = async (
  serviceName: string,
  lines: number = 100,
): Promise<{ serviceName: string; logs: string[] }> => {
  const client = await getApiClient();
  return client.get<{ serviceName: string; logs: string[] }>(
    `/services/${serviceName}/logs`,
    { params: { lines } },
  );
};

// Cloud logs endpoints
export const getEnvironments = async (): Promise<
  Record<string, Environment>
> => {
  const client = await getApiClient();
  return client.get<Record<string, Environment>>("/environments");
};

export const getEnvironmentServices = async (
  environment: string,
): Promise<CloudService[]> => {
  const client = await getApiClient();
  return client.get<CloudService[]>(`/environments/${environment}/services`);
};

export interface GetCloudLogsParams {
  environment: string;
  service: string;
  severity?: string;
  limit?: number;
  startTime?: string;
  endTime?: string;
}

export const getCloudLogs = async (
  params: GetCloudLogsParams,
): Promise<{
  environment: string;
  service: string;
  count: number;
  logs: ParsedCloudLog[];
}> => {
  const { environment, service, ...queryParams } = params;
  const client = await getApiClient();
  return client.get<{
    environment: string;
    service: string;
    count: number;
    logs: ParsedCloudLog[];
  }>(`/logs/cloud/${environment}/${service}`, { params: queryParams });
};

export const checkCloudLoggingStatus =
  async (): Promise<CloudLoggingStatus> => {
    const client = await getApiClient();
    return client.get<CloudLoggingStatus>("/logs/cloud/status");
  };

// Log sources endpoint (dynamically discovered log files)
export interface LogSource {
  id: string;
  name: string;
  format: string;
  parser: string;
  color: string;
  displayOrder: number;
  path: string;
}

export const getLogSources = async (): Promise<LogSource[]> => {
  const client = await getApiClient();
  const response = await client.get<{ success: boolean; data: LogSource[] }>(
    "/logs/sources",
  );
  return response.data;
};

// Script management endpoints
export const getScripts = async (): Promise<Script[]> => {
  const client = await getApiClient();
  const response = await client.get<{ count: number; scripts: Script[] }>(
    "/scripts",
  );
  return response.scripts;
};

export const executeScript = async (
  scriptId: string,
): Promise<{
  success: boolean;
  execution: { id: string; scriptId: string; status: string; startTime: Date };
}> => {
  const client = await getApiClient();
  return client.post<{
    success: boolean;
    execution: {
      id: string;
      scriptId: string;
      status: string;
      startTime: Date;
    };
  }>(`/scripts/${scriptId}/execute`);
};

export const getExecutions = async (): Promise<ScriptExecutionSummary[]> => {
  const client = await getApiClient();
  const response = await client.get<{
    count: number;
    executions: ScriptExecutionSummary[];
  }>("/scripts/executions");
  return response.executions;
};

export const getExecution = async (
  executionId: string,
): Promise<ScriptExecution> => {
  const client = await getApiClient();
  return client.get<ScriptExecution>(`/scripts/executions/${executionId}`);
};

export const killScript = async (
  executionId: string,
): Promise<{ success: boolean; message: string }> => {
  const client = await getApiClient();
  return client.post<{ success: boolean; message: string }>(
    `/scripts/executions/${executionId}/kill`,
  );
};

export const clearScriptHistory = async (): Promise<{
  success: boolean;
  message: string;
}> => {
  const client = await getApiClient();
  return client.delete<{ success: boolean; message: string }>(
    "/scripts/executions",
  );
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
  const client = await getApiClient();
  return client.get<PortStatuses>("/ports/status");
};

export const killPortProcess = async (
  port: number,
): Promise<{
  success: boolean;
  message: string;
  port: number;
  pid?: number;
  wasInUse: boolean;
}> => {
  const client = await getApiClient();
  return client.post<{
    success: boolean;
    message: string;
    port: number;
    pid?: number;
    wasInUse: boolean;
  }>(`/ports/${port}/kill`);
};

// Error handling utility
export const handleApiError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "An unknown error occurred";
};

// Re-export the apiClient for direct use if needed
export const getApiClientInstance = getApiClient;

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
  get: async (...args: Parameters<ApiClient["get"]>) =>
    (await getApiClient()).get(...args),
  post: async (...args: Parameters<ApiClient["post"]>) =>
    (await getApiClient()).post(...args),
  put: async (...args: Parameters<ApiClient["put"]>) =>
    (await getApiClient()).put(...args),
  delete: async (...args: Parameters<ApiClient["delete"]>) =>
    (await getApiClient()).delete(...args),
};
