/**
 * Centralized API Service
 * 
 * Refactored to use the centralized ApiClient.
 * Replaces scattered axios calls with consistent patterns.
 */

import type { ApiClient } from './ApiClient';
import { getApiBaseUrl } from '@/utils/apiBaseUrl';
export { getApiBaseUrl, getApiBasePath } from '@/utils/apiBaseUrl';
import type {
  ApiError,
  ApiSuccess,
  HealthCheckApiResponse,
  HealthCheckResponse,
  DevBotsAgentComparisonResponse,
  DevBotsInteractiveSessionStateResponse,
  DevBotsInteractiveSessionInputResponse,
  DevBotsInteractiveSessionInputPayload,
  DevBotsInteractiveSessionStartPayload,
  DevBotsInteractiveHeartbeatPayload,
  DevBotsInteractiveInterruptPayload,
} from '@/types/contracts';
import type {
  DevBotsAgentComparison,
  DevBotsQueueSummary,
  DevBotsTaskDetail,
  DevBotsSettings,
  DevBotsTaskLogsResponse,
  DevBotsStatus,
  DevBotsInteractiveSessionState,
} from '@/types/dev-bots';

// Health check endpoint
const API_CLIENT_SYMBOL = '__APP_MONITOR_API_CLIENT__';
export type ApiClientAdapter = Pick<ApiClient, 'get' | 'post' | 'put' | 'delete' | 'patch'>;

const setGlobalApiClient = (client: ApiClientAdapter | null) => {
  const scope = globalThis as Record<string, unknown>;
  if (client) {
    scope[API_CLIENT_SYMBOL] = client;
  } else {
    delete scope[API_CLIENT_SYMBOL];
  }
};

export const setApiClientInstance = (client: ApiClientAdapter | null) => {
  setGlobalApiClient(client);
};

export const resetApiClientInstance = () => {
  setGlobalApiClient(null);
};

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

const getApiClient = async (): Promise<ApiClientAdapter> => {
  const globalClient = (globalThis as Record<string, unknown>)[API_CLIENT_SYMBOL];
  if (globalClient) {
    return globalClient as ApiClientAdapter;
  }

  const module = await import('./ApiClient');
  const client = module.apiClient as ApiClientAdapter;
  setGlobalApiClient(client);
  return client;
};

export const healthCheck = async (): Promise<HealthCheckResponse> => {
  const client = await getApiClient();
  const response = await client.get<HealthCheckApiResponse>('/health');
  return ensureApiSuccess(response, 'performing health check');
};

// Dev-Bots endpoints
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

export const getDevBotsInteractiveSession = async (): Promise<DevBotsInteractiveSessionState> => {
  const client = await getApiClient();
  const response = await client.get<DevBotsInteractiveSessionStateResponse>(
    '/dev-bots/interactive/session',
  );
  return ensureApiSuccess(response, 'fetching interactive session state');
};

export const startDevBotsInteractiveSession = async (
  payload: DevBotsInteractiveSessionStartPayload,
): Promise<DevBotsInteractiveSessionState> => {
  const client = await getApiClient();
  const response = await client.post<DevBotsInteractiveSessionStateResponse>(
    '/dev-bots/interactive/session',
    payload,
  );
  return ensureApiSuccess(response, 'starting interactive session');
};

export const endDevBotsInteractiveSession = async (): Promise<DevBotsInteractiveSessionState> => {
  const client = await getApiClient();
  const response = await client.delete<DevBotsInteractiveSessionStateResponse>(
    '/dev-bots/interactive/session',
  );
  return ensureApiSuccess(response, 'ending interactive session');
};

export const sendDevBotsInteractiveInput = async (
  sessionId: string,
  data: string,
): Promise<boolean> => {
  const client = await getApiClient();
  const payload: DevBotsInteractiveSessionInputPayload = { data };
  const response = await client.post<DevBotsInteractiveSessionInputResponse>(
    '/dev-bots/interactive/session/' + sessionId + '/input',
    payload,
  );
  const result = ensureApiSuccess(response, 'sending interactive session input');
  return Boolean(result.accepted);
};

export const sendDevBotsInteractiveInterrupt = async (sessionId: string): Promise<string> => {
  const client = await getApiClient();
  const payload: DevBotsInteractiveInterruptPayload = { sessionId };
  const response = await client.post<ApiSuccess<{ message: string }>>(
    '/dev-bots/interactive/interrupt',
    payload,
  );
  const result = ensureApiSuccess(response, 'interrupting interactive session');
  return result.message;
};

export const sendDevBotsInteractiveHeartbeat = async (
  sessionId: string,
  source: 'user' | 'agent' = 'user',
): Promise<boolean> => {
  const client = await getApiClient();
  const payload: DevBotsInteractiveHeartbeatPayload = { sessionId, source };
  const response = await client.post<ApiSuccess<{ acknowledged: boolean }>>(
    '/dev-bots/interactive/heartbeat',
    payload,
  );
  const result = ensureApiSuccess(response, 'sending interactive session heartbeat');
  return result.acknowledged ?? true;
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

export const getDevBotsInteractiveStreamUrl = (sessionId: string): string => {
  const baseUrl = getApiBaseUrl();
  try {
    const parsed = new URL(baseUrl);
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = parsed.pathname.replace(/\/$/, '');
    const streamPath = '/api/dev-bots/interactive/session/' + sessionId + '/stream';
    const normalizedPath = (basePath || '') + streamPath;
    const ensuredPath = normalizedPath.startsWith('/') ? normalizedPath : '/' + normalizedPath;
    return wsProtocol + '//' + parsed.host + ensuredPath;
  } catch (error) {
    console.warn('[api] Unable to parse API base URL for interactive stream', error);
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return (
      wsProtocol +
      '//' +
      window.location.host +
      '/api/dev-bots/interactive/session/' +
      sessionId +
      '/stream'
    );
  }
};

// Export everything as a namespace for components that use `api.method()`
export const api = {
  healthCheck,
  getDevBotsStatus,
  getDevBotsQueue,
  getDevBotsTaskDetail,
  getDevBotsTaskLogs,
  getDevBotsSettings,
  getDevBotsAgentComparison,
  updateDevBotsSettings,
  getDevBotsInteractiveSession,
  startDevBotsInteractiveSession,
  endDevBotsInteractiveSession,
  sendDevBotsInteractiveInput,
  sendDevBotsInteractiveInterrupt,
  sendDevBotsInteractiveHeartbeat,
  getDevBotsInteractiveStreamUrl,
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
