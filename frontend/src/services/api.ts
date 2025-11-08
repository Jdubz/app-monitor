/**
 * Centralized API Service
 * 
 * Refactored to use the centralized ApiClient.
 * Replaces scattered axios calls with consistent patterns.
 */

import type { ApiClient } from './ApiClient';
import type {
  ApiError,
  ApiSuccess,
  CloudLogsApiResponse,
  CloudLogsRequest,
  CloudLogsResponse,
  CloudLoggingStatusApiResponse,
  DevBotsAgentComparisonResponse,
  EnvironmentsApiResponse,
  EnvironmentsResponse,
  EnvironmentServicesApiResponse,
  HealthCheckApiResponse,
  HealthCheckResponse,
  LogSource as ContractLogSource,
  LogSourcesResponse,
  PortKillApiResponse,
  PortKillResponse,
  PortStatusesResponse,
  PortStatusMap,
  ProcessInfo,
  ServiceActionResponse,
  ServiceLogsApiResponse,
  ServiceLogsResponse,
  ServiceStatusResponse,
  ServicesStatusResponse,
} from '@/types/contracts';
import type {
  DevBotsAgentComparison,
  DevBotsQueueSummary,
  DevBotsTaskDetail,
  DevBotsSettings,
  DevBotsTaskLogsResponse,
  DevBotsStatus,
} from '@/types/dev-bots';
import type { CloudLoggingStatus, CloudService } from '../types/log.types';

type LogSource = ContractLogSource;
export type PortStatuses = PortStatusMap;

// Health check endpoint
const API_CLIENT_SYMBOL = '__APP_MONITOR_API_CLIENT__';

const ensureApiSuccess = <T>(
  response: ApiSuccess<T> | ApiError | null | undefined,
  context: string,
): T => {
  if (!response || typeof response !== 'object' || !('success' in response)) {
    throw new Error(`Malformed API response while ${context}`);
  }

  if (response.success === true) {
    return response.data;
  }

  throw new Error(response.message || response.error || `Request failed while ${context}`);
};

const isApiErrorPayload = (payload: unknown): payload is ApiError => {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      'success' in (payload as Record<string, unknown>) &&
      (payload as ApiError).success === false &&
      typeof (payload as ApiError).error === 'string',
  );
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isApiEnvelope = (payload: unknown): payload is ApiSuccess<unknown> | ApiError => {
  if (!isPlainObject(payload) || !('success' in payload)) {
    return false;
  }
  return typeof (payload as { success?: unknown }).success === 'boolean';
};

const unwrapApiResponse = <T>(payload: unknown, context?: string): T => {
  if (isApiEnvelope(payload)) {
    if (payload.success === true && 'data' in payload) {
      return payload.data as T;
    }

    const errorPayload = payload as ApiError;
    const errorMessage =
      errorPayload.message ??
      errorPayload.error ??
      'Request failed';
    throw new Error(
      `${context ? `${context}: ` : ''}${errorMessage}`,
    );
  }

  console.error('[api] Unexpected API envelope', { context, payload });
  throw new Error(
    `Malformed API response${context ? ` while ${context}` : ''}`,
  );
};

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
  const response = await client.get<HealthCheckApiResponse>('/health');
  return ensureApiSuccess(response, 'performing health check');
};

// Service control endpoints
export const getAllStatuses = async (): Promise<ProcessInfo[]> => {
  const client = await getApiClient();
  const response = await client.get<ServicesStatusResponse>('/services/status');
  return ensureApiSuccess(response, 'fetching all service statuses');
};

export const getServiceStatus = async (serviceName: string): Promise<ProcessInfo> => {
  const client = await getApiClient();
  const response = await client.get<ServiceStatusResponse>(`/services/${serviceName}/status`);
  return ensureApiSuccess(response, `fetching status for ${serviceName}`);
};

export const startService = async (serviceName: string): Promise<ProcessInfo> => {
  const client = await getApiClient();
  const response = await client.post<ServiceActionResponse>(`/services/${serviceName}/start`);
  return ensureApiSuccess(response, `starting service ${serviceName}`);
};

export const stopService = async (serviceName: string, graceful: boolean = true): Promise<ProcessInfo> => {
  const client = await getApiClient();
  const response = await client.post<ServiceActionResponse>(
    `/services/${serviceName}/stop`,
    {},
    { params: { graceful } }
  );
  return ensureApiSuccess(response, `stopping service ${serviceName}`);
};

export const restartService = async (serviceName: string, graceful: boolean = true): Promise<ProcessInfo> => {
  const client = await getApiClient();
  const response = await client.post<ServiceActionResponse>(
    `/services/${serviceName}/restart`,
    {},
    { params: { graceful } }
  );
  return ensureApiSuccess(response, `restarting service ${serviceName}`);
};

export const killService = async (serviceName: string): Promise<ProcessInfo> => {
  const client = await getApiClient();
  const response = await client.post<ServiceActionResponse>(`/services/${serviceName}/kill`);
  return ensureApiSuccess(response, `killing service ${serviceName}`);
};

export const getServiceLogs = async (serviceName: string, lines: number = 100): Promise<ServiceLogsResponse> => {
  const client = await getApiClient();
  const response = await client.get<ServiceLogsApiResponse>(
    `/logs/services/${serviceName}/logs`,
    { params: { lines } }
  );
  return ensureApiSuccess(response, `fetching logs for ${serviceName}`);
};

// Cloud logs endpoints
export const getEnvironments = async (): Promise<EnvironmentsResponse> => {
  const client = await getApiClient();
  const response = await client.get<EnvironmentsApiResponse>('/environments');
  return ensureApiSuccess(response, 'fetching environments');
};

export const getEnvironmentServices = async (environment: string): Promise<CloudService[]> => {
  const client = await getApiClient();
  const response = await client.get<EnvironmentServicesApiResponse>(`/environments/${environment}/services`);
  return ensureApiSuccess(response, `fetching services for ${environment}`);
};

export const getCloudLogs = async (params: CloudLogsRequest): Promise<CloudLogsResponse> => {
  const { environment, service, ...queryParams } = params;
  const client = await getApiClient();
  const response = await client.get<CloudLogsApiResponse>(
    `/logs/cloud/${environment}/${service}`,
    { params: queryParams }
  );
  return ensureApiSuccess(response, 'fetching cloud logs');
};

export const checkCloudLoggingStatus = async (): Promise<CloudLoggingStatus> => {
  const client = await getApiClient();
  const response = await client.get<CloudLoggingStatusApiResponse>('/logs/cloud/status');
  return ensureApiSuccess(response, 'checking cloud logging status');
};

export const getLogSources = async (): Promise<LogSource[]> => {
  const client = await getApiClient();
  const response = await client.get<LogSourcesResponse>('/logs/sources');
  return ensureApiSuccess(response, 'fetching log sources');
};

export const getDevBotsStatus = async (): Promise<DevBotsStatus> => {
  const client = await getApiClient();
  const response = await client.get<ApiSuccess<DevBotsStatus>>('/dev-bots/status');
  return ensureApiSuccess(response, 'fetching Dev-Bots status');
};

export const getDevBotsQueue = async (): Promise<DevBotsQueueSummary> => {
  const client = await getApiClient();
  const response = await client.get<ApiSuccess<DevBotsQueueSummary>>('/dev-bots/queue');
  return ensureApiSuccess(response, 'fetching Dev-Bots queue');
};

export const getDevBotsTaskDetail = async (taskId: string): Promise<DevBotsTaskDetail> => {
  const client = await getApiClient();
  const response = await client.get<ApiSuccess<DevBotsTaskDetail>>(
    `/dev-bots/tasks/${taskId}/detail`,
  );
  return ensureApiSuccess(response, `fetching Dev-Bots task ${taskId}`);
};

export const getDevBotsTaskLogs = async (
  taskId: string,
): Promise<DevBotsTaskLogsResponse> => {
  const client = await getApiClient();
  const response = await client.get<ApiSuccess<DevBotsTaskLogsResponse>>(
    `/dev-bots/tasks/${taskId}/logs`,
  );
  return ensureApiSuccess(response, `fetching Dev-Bots task logs for ${taskId}`);
};

export const getDevBotsSettings = async (): Promise<DevBotsSettings> => {
  const client = await getApiClient();
  const response = await client.get<ApiSuccess<DevBotsSettings>>('/dev-bots/settings');
  return ensureApiSuccess(response, 'fetching Dev-Bots settings');
};

export const updateDevBotsSettings = async (
  payload: Partial<DevBotsSettings>,
): Promise<DevBotsSettings> => {
  const client = await getApiClient();
  const response = await client.put<ApiSuccess<DevBotsSettings>>('/dev-bots/settings', payload);
  return ensureApiSuccess(response, 'updating Dev-Bots settings');
};

export const getDevBotsAgentComparison = async (): Promise<DevBotsAgentComparison> => {
  const client = await getApiClient();
  const response = await client.get<DevBotsAgentComparisonResponse>('/dev-bots/agent-comparison');
  const data = ensureApiSuccess(response, 'fetching Dev-Bots agent comparison metrics');
  return data.comparison;
};

// Port management endpoints
export const getPortStatuses = async (): Promise<PortStatuses> => {
  const client = await getApiClient();
  const response = await client.get<PortStatusesResponse>('/ports/status');
  return ensureApiSuccess(response, 'fetching port statuses');
};

export const killPortProcess = async (port: number): Promise<PortKillResponse> => {
  const client = await getApiClient();
  const response = await client.post<PortKillApiResponse>(`/ports/${port}/kill`);
  return ensureApiSuccess(response, `killing port ${port}`);
};

export const handleApiError = (error: unknown): string => {
  if (isApiErrorPayload(error)) {
    return error.message || error.error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
};

// Re-export the apiClient for direct use if needed
export const getApiClientInstance = getApiClient;

export const getApiBaseUrl = (): string =>
  (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

export const getApiBasePath = (): string => `${getApiBaseUrl()}/api`;

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
  getDevBotsStatus,
  getDevBotsQueue,
  getDevBotsTaskDetail,
  getDevBotsTaskLogs,
  getDevBotsSettings,
  getDevBotsAgentComparison,
  updateDevBotsSettings,
  getPortStatuses,
  killPortProcess,
  handleApiError,
  // Add HTTP methods for components that need them
  /**
   * Issue a GET request and return the unwrapped data payload from the ApiSuccess envelope.
   */
  get: async <T>(url: string, config?: Parameters<ApiClient['get']>[1]) => {
    const client = await getApiClient();
    const response = await client.get<unknown>(url, config);
    return unwrapApiResponse<T>(response, `GET ${url}`);
  },
  /**
   * Issue a POST request and return the unwrapped data payload from the ApiSuccess envelope.
   */
  post: async <T>(
    url: string,
    data?: Parameters<ApiClient['post']>[1],
    config?: Parameters<ApiClient['post']>[2],
  ) => {
    const client = await getApiClient();
    const response = await client.post<unknown>(url, data, config);
    return unwrapApiResponse<T>(response, `POST ${url}`);
  },
  /**
   * Issue a PUT request and return the unwrapped data payload from the ApiSuccess envelope.
   */
  put: async <T>(
    url: string,
    data?: Parameters<ApiClient['put']>[1],
    config?: Parameters<ApiClient['put']>[2],
  ) => {
    const client = await getApiClient();
    const response = await client.put<unknown>(url, data, config);
    return unwrapApiResponse<T>(response, `PUT ${url}`);
  },
  /**
   * Issue a DELETE request and return the unwrapped data payload from the ApiSuccess envelope.
   */
  delete: async <T>(url: string, config?: Parameters<ApiClient['delete']>[1]) => {
    const client = await getApiClient();
    const response = await client.delete<unknown>(url, config);
    return unwrapApiResponse<T>(response, `DELETE ${url}`);
  },
};
