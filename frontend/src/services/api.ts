/**
 * Centralized API Service
 * 
 * Refactored to use the centralized ApiClient.
 * Replaces scattered axios calls with consistent patterns.
 */

import type { ApiClient } from './ApiClient';
import type {
  HealthCheckResponse,
  ProcessInfo,
  LogSource as ContractLogSource,
  PortStatusMap,
  ServiceLogsResponse,
  PortKillResponse,
  EnvironmentsResponse,
  CloudService,
} from '@app-monitor/api-contracts';
import { CloudService, ParsedCloudLog, CloudLoggingStatus } from '../types/log.types';

type LogSource = ContractLogSource;
export type PortStatuses = PortStatusMap;

// Health check endpoint
const API_CLIENT_SYMBOL = '__APP_MONITOR_API_CLIENT__';

const getApiClient = async (): Promise<ApiClient> => {
  const globalClient = (globalThis as Record<string, unknown>)[API_CLIENT_SYMBOL];
  if (globalClient) {
    return globalClient as ApiClient;
  }

  const module = await import('./ApiClient');
  const client = module.apiClient;
  (globalThis as Record<string, unknown>)[API_CLIENT_SYMBOL] = client;
  return client;
};

export const healthCheck = async (): Promise<HealthCheckResponse> => {
  const client = await getApiClient();
  return client.get<HealthCheckResponse>('/health');
};

// Service control endpoints
export const getAllStatuses = async (): Promise<ProcessInfo[]> => {
  const client = await getApiClient();
  return client.get<ProcessInfo[]>('/services/status');
};

export const getServiceStatus = async (serviceName: string): Promise<ProcessInfo> => {
  const client = await getApiClient();
  return client.get<ProcessInfo>(`/services/${serviceName}/status`);
};

export const startService = async (serviceName: string): Promise<ProcessInfo> => {
  const client = await getApiClient();
  return client.post<ProcessInfo>(`/services/${serviceName}/start`);
};

export const stopService = async (serviceName: string, graceful: boolean = true): Promise<ProcessInfo> => {
  const client = await getApiClient();
  return client.post<ProcessInfo>(
    `/services/${serviceName}/stop`,
    {},
    { params: { graceful } }
  );
};

export const restartService = async (serviceName: string, graceful: boolean = true): Promise<ProcessInfo> => {
  const client = await getApiClient();
  return client.post<ProcessInfo>(
    `/services/${serviceName}/restart`,
    {},
    { params: { graceful } }
  );
};

export const killService = async (serviceName: string): Promise<ProcessInfo> => {
  const client = await getApiClient();
  return client.post<ProcessInfo>(`/services/${serviceName}/kill`);
};

export const getServiceLogs = async (serviceName: string, lines: number = 100): Promise<ServiceLogsResponse> => {
  const client = await getApiClient();
  return client.get<ServiceLogsResponse>(
    `/logs/services/${serviceName}/logs`,
    { params: { lines } }
  );
};

// Cloud logs endpoints
export const getEnvironments = async (): Promise<EnvironmentsResponse> => {
  const client = await getApiClient();
  return client.get<EnvironmentsResponse>('/environments');
};

export const getEnvironmentServices = async (environment: string): Promise<CloudService[]> => {
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

export const getCloudLogs = async (params: GetCloudLogsParams): Promise<{ environment: string; service: string; count: number; logs: ParsedCloudLog[] }> => {
  const { environment, service, ...queryParams } = params;
  const client = await getApiClient();
  return client.get<{ environment: string; service: string; count: number; logs: ParsedCloudLog[] }>(
    `/logs/cloud/${environment}/${service}`,
    { params: queryParams }
  );
};

export const checkCloudLoggingStatus = async (): Promise<CloudLoggingStatus> => {
  const client = await getApiClient();
  return client.get<CloudLoggingStatus>('/logs/cloud/status');
};

export const getLogSources = async (): Promise<LogSource[]> => {
  const client = await getApiClient();
  const response = await client.get<{ success: boolean; data: LogSource[] }>('/logs/sources');
  return response.data;
};

// Port management endpoints
export const getPortStatuses = async (): Promise<PortStatuses> => {
  const client = await getApiClient();
  return client.get<PortStatuses>('/ports/status');
};

export const killPortProcess = async (port: number): Promise<PortKillResponse> => {
  const client = await getApiClient();
  return client.post<PortKillResponse>('/ports/' + port + '/kill');
};

export const handleApiError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
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
  getPortStatuses,
  killPortProcess,
  handleApiError,
  // Add HTTP methods for components that need them
  get: async <T>(url: string, config?: Parameters<ApiClient['get']>[1]) =>
    (await getApiClient()).get<T>(url, config),
  post: async <T>(url: string, data?: Parameters<ApiClient['post']>[1], config?: Parameters<ApiClient['post']>[2]) =>
    (await getApiClient()).post<T>(url, data, config),
  put: async <T>(url: string, data?: Parameters<ApiClient['put']>[1], config?: Parameters<ApiClient['put']>[2]) =>
    (await getApiClient()).put<T>(url, data, config),
  delete: async <T>(url: string, config?: Parameters<ApiClient['delete']>[1]) =>
    (await getApiClient()).delete<T>(url, config),
};
