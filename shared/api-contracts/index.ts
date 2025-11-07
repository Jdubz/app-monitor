export type ServiceStatus = "running" | "stopped" | "starting" | "stopping" | "error";

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

export interface DockerContainerInfo {
  name: string;
  status: "running" | "stopped" | "exited" | "unknown";
  workerStatus?: "running" | "idle" | "stopped" | "unknown";
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

export type CloudLogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";

export interface CloudLogMetadata {
  trace?: string;
  spanId?: string;
  resource?: Record<string, unknown>;
  labels?: Record<string, string>;
  severity?: string;
  insertId?: string;
  logName?: string;
  [key: string]: unknown;
}

export interface ParsedCloudLog {
  id: string;
  service: string;
  timestamp: number;
  level: CloudLogLevel;
  message: string;
  metadata: CloudLogMetadata;
  raw: unknown;
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

export interface CloudLogsRequest {
  environment: string;
  service: string;
  severity?: string;
  limit?: number;
  startTime?: string;
  endTime?: string;
  customFilter?: string;
}

export interface CloudLogsQuery {
  environment: string;
  service: string;
  severity?: string;
  limit?: number;
  timeRange?: {
    start: Date;
    end: Date;
  };
  customFilter?: string;
}

export interface CloudLogsResponse {
  environment: string;
  service: string;
  count: number;
  logs: ParsedCloudLog[];
}

export interface TokenBudget {
  provider: string;
  dailyLimit: number;
  costPerMillionInput: number;
  costPerMillionOutput: number;
  warningThreshold: number;
}

export interface TokenUsageSummary {
  provider: string;
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  requestCount: number;
  estimatedCost: number;
  budgetLimit: number;
  percentUsed: number;
  warningTriggered: boolean;
  limitExceeded: boolean;
}

export interface QualityGateResult {
  gate: string;
  passed: boolean;
  score: number;
  duration: number;
  output?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface QualityValidationResult {
  taskId: string;
  passed: boolean;
  overallScore: number;
  gates: QualityGateResult[];
  duration: number;
  timestamp: string;
}

export interface QualityGateConfig {
  name: string;
  enabled: boolean;
  required: boolean;
  weight: number;
  timeout: number;
}

export interface QualityGateStatus {
  status: string;
  totalGates: number;
  enabledGates: number;
  requiredGates: number;
  timestamp: string;
}

export interface TokenBudgetUpdatePayload {
  message: string;
  budget: TokenBudget;
}

export interface TokenSummariesPayload {
  summaries: TokenUsageSummary[];
}

export interface TokenCanUsePayload {
  provider: string;
  canUse: boolean;
  remainingTokens: number;
}

export interface TokenRemainingPayload {
  provider: string;
  remaining: number;
  limit: number;
  used: number;
  percentUsed: number;
}

export interface QualityGateUpdatePayload {
  message: string;
  config: QualityGateConfig;
}

export interface QualityGateResetPayload {
  message: string;
  configs: Record<string, QualityGateConfig>;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

export type LogSourcesResponse = ApiSuccess<LogSource[]>;

export type HealthCheckApiResponse = ApiSuccess<HealthCheckResponse>;
export type ServicesStatusResponse = ApiSuccess<ProcessInfo[]>;
export type ServiceStatusResponse = ApiSuccess<ProcessInfo>;
export type ServiceActionResponse = ApiSuccess<ProcessInfo>;
export type PortStatusesResponse = ApiSuccess<PortStatusMap>;
export type PortKillApiResponse = ApiSuccess<PortKillResponse>;
export type EnvironmentsApiResponse = ApiSuccess<EnvironmentsResponse>;
export type EnvironmentServicesApiResponse = ApiSuccess<EnvironmentServicesResponse>;
export type ServiceLogsApiResponse = ApiSuccess<ServiceLogsResponse>;
export type CloudLogsApiResponse = ApiSuccess<CloudLogsResponse>;
export type CloudLoggingStatusApiResponse = ApiSuccess<CloudLoggingStatus>;
export type LogConfigResponse = ApiSuccess<Record<string, unknown>>;
export type LogReloadResponse = ApiSuccess<{ message: string }>;

export type TokenSummariesResponse = ApiSuccess<TokenSummariesPayload>;
export type TokenSummaryResponse = ApiSuccess<TokenUsageSummary>;
export type TokenBudgetResponse = ApiSuccess<TokenBudget>;
export type TokenBudgetUpdateResponse = ApiSuccess<TokenBudgetUpdatePayload>;
export type TokenCanUseResponse = ApiSuccess<TokenCanUsePayload>;
export type TokenRemainingResponse = ApiSuccess<TokenRemainingPayload>;
export type TokenResetResponse = ApiSuccess<{ message: string }>;
export type QualityGateConfigsResponse = ApiSuccess<Record<string, QualityGateConfig>>;
export type QualityGateConfigResponse = ApiSuccess<QualityGateConfig>;
export type QualityGateUpdateResponse = ApiSuccess<QualityGateUpdatePayload>;
export type QualityGateValidationResponse = ApiSuccess<QualityValidationResult>;
export type QualityGateResetResponse = ApiSuccess<QualityGateResetPayload>;
export type QualityGateStatusResponse = ApiSuccess<QualityGateStatus>;
export type DockerInfoResponse = ApiSuccess<DockerContainerInfo>;
export type DockerActionResponse = ApiSuccess<{ message: string }>;
