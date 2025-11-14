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

// -----------------------------------------------------------------------------
// Dev-Bots Contracts
// -----------------------------------------------------------------------------

export type DevBotsTaskStatus = 'pending' | 'assigned' | 'active' | 'completed' | 'failed';

export interface DevBotsTaskScope {
  type: string;
  boundaries: {
    maxChanges: number;
    forbiddenActions: string[];
    maxNewLines: number;
  };
  validation: {
    forbiddenPatterns: string[];
    allowedPatterns: string[];
  };
}

export interface DevBotsTask {
  id: string;
  type: string;
  description: string;
  status: DevBotsTaskStatus;
  createdAt: string;
  assignedWorker?: string;
  assignedAgent: string;
  assignedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
  exitCode?: number;
  prompt?: string;
  files?: string[];
  dependencies?: string[];
  project?: string;
  priority?: number;
  retryCount?: number;
  maxRetries?: number;
  canRetry?: boolean;
  scope?: DevBotsTaskScope;
  isEmergency?: boolean;
  documentation?: string;
  acceptanceCriteria?: string;
  notes?: string;
  environment?: string;
  repository?: string;
  summary?: string;
  chainId?: string;
  scopeViolations?: Array<{ type: string; severity: string }>;
  isPeriodicCleanup?: boolean;
}

export interface DevBotsTaskCollections {
  pending: DevBotsTask[];
  active: DevBotsTask[];
  completed: DevBotsTask[];
}

export interface DevBotsWorkerStatus {
  id: string;
  status: 'idle' | 'busy' | 'stopped';
  lastSeen: number;
  onboardingComplete?: boolean;
  lastOnboardingCheck?: number;
  currentTask?: string;
  personality?: DevBotsAgentPersonality;
}

export interface DevBotsStatus {
  systemStatus: 'running' | 'stopped' | 'error';
  workers: Record<string, DevBotsWorkerStatus>;
  queueSize: number;
  activeTasks: number;
  uptime: number;
  workerCount: number;
  maxWorkers: number;
  activeWorkerTypes: string[];
  availableWorkerTypes: string[];
  tasks: DevBotsTaskCollections;
}

export interface DevBotsScopeViolation {
  taskId: string;
  violations: Array<{
    type: string;
    severity: string;
  }>;
}

export interface DevBotsCleanupStatus {
  schedules: string[];
  recentTasks: DevBotsTask[];
  totalCleanupTasks: number;
}

export type DevBotsTrackedTaskType = 'implementation' | 'testing' | 'documentation';

export interface DevBotsAgentMetrics {
  total: number;
  completed: number;
  failed: number;
  success_rate: number;
  avg_duration_ms?: number;
}

export type DevBotsAgentTaskTypeBreakdown = Record<DevBotsTrackedTaskType, DevBotsAgentMetrics>;

export interface DevBotsAgentComparison {
  claude: DevBotsAgentMetrics;
  codex: DevBotsAgentMetrics;
  task_type_breakdown: {
    claude: DevBotsAgentTaskTypeBreakdown;
    codex: DevBotsAgentTaskTypeBreakdown;
  };
}

export interface DevBotsAgentPersonality {
  id: string;
  name: string;
  role: string;
  description: string;
  specialties: string[];
  expertise: {
    primary: string[];
    secondary: string[];
    tools: string[];
  };
  personality: {
    communicationStyle: 'formal' | 'casual' | 'technical' | 'collaborative';
    approach: 'methodical' | 'creative' | 'analytical' | 'pragmatic';
    focus: 'quality' | 'speed' | 'innovation' | 'reliability';
  };
  taskPreferences: {
    preferredTypes: string[];
    avoidedTypes: string[];
    complexityRange: 'simple' | 'medium' | 'complex' | 'any';
  };
}

export interface DevBotsTaskTemplate {
  id: string;
  name: string;
  description: string;
  taskTypes: string[];
  agentTypes: string[];
  template: string;
  variables: string[];
  validationRules: string[];
}

export interface DevBotsWorkspaceSyncStatus {
  isRunning: boolean;
  syncInProgress: boolean;
  lastSyncTime?: string;
  baseDir: string;
  repositories: string[];
  workers: string[];
  conflictStrategy: string;
}

export interface DevBotsWorkspaceSyncResult {
  successful: Array<{ worker?: string; repo: string; action: string }>;
  conflicts: Array<{ worker: string; repo: string; path: string; timestamp: string; strategy: string; status?: string }>;
  errors: Array<{ worker?: string; repo: string; error: string }>;
  skipped: Array<{ worker?: string; repo: string; reason: string }>;
}

export interface DevBotsInteractiveSessionModelOption {
  provider: string;
  model: string;
  displayName: string;
  description?: string;
  default?: boolean;
}

export interface DevBotsInteractiveStreamDescriptor {
  sessionId: string;
  url: string;
  token?: string;
}

export interface DevBotsInteractiveSessionState {
  session: DevBotsInteractiveSession | null;
  availableModels: DevBotsInteractiveSessionModelOption[];
  heartbeatIntervalSeconds: number;
  idleTimeoutSeconds: number;
  stream?: DevBotsInteractiveStreamDescriptor;
  warnings?: string[];
}

// -----------------------------------------------------------------------------
// Dev-Bots Interactive Session Contracts
// -----------------------------------------------------------------------------

export type DevBotsInteractiveSessionStatus =
  | 'starting'
  | 'running'
  | 'disconnecting'
  | 'terminating'
  | 'ended'
  | 'error';

export interface DevBotsInteractiveSessionContextSnapshot {
  summary?: string;
  lastCommand?: string;
  touchedFiles?: string[];
  pendingDiffPaths?: string[];
  notes?: string;
  [key: string]: unknown;
}

export interface DevBotsInteractiveSession {
  id: string;
  ownerEmail: string;
  modelProvider: string;
  modelName: string;
  status: DevBotsInteractiveSessionStatus;
  containerId?: string;
  startedAt: string;
  lastUserActivityAt?: string;
  lastAgentActivityAt?: string;
  lastHeartbeatAt?: string;
  idleTimeoutSeconds: number;
  idleDeadline?: string;
  reconnectDeadline?: string;
  endedAt?: string;
  terminationReason?: string;
  contextSnapshot?: DevBotsInteractiveSessionContextSnapshot | null;
  logPath?: string;
  metadata?: Record<string, unknown>;
}

export interface DevBotsInteractiveSessionResponsePayload {
  session: DevBotsInteractiveSession | null;
  message?: string;
  warnings?: string[];
}

export type DevBotsInteractiveSessionResponse = ApiSuccess<DevBotsInteractiveSessionResponsePayload>;

export interface DevBotsInteractiveSessionStartPayload {
  modelProvider: string;
  modelName: string;
  metadata?: Record<string, unknown>;
  resume?: boolean;
}

export interface DevBotsInteractiveSessionInputPayload {
  data: string;
}

export interface DevBotsInteractiveHeartbeatPayload {
  sessionId: string;
  source?: 'user' | 'agent';
}

export interface DevBotsInteractiveInterruptPayload {
  sessionId: string;
  reason?: string;
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

export type HealthCheckApiResponse = ApiSuccess<HealthCheckResponse>;

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

export type DevBotsStatusResponse = ApiSuccess<DevBotsStatus>;
export type DevBotsTasksResponse = ApiSuccess<DevBotsTask[]>;
export type DevBotsScopeViolationsResponse = ApiSuccess<DevBotsScopeViolation[]>;
export type DevBotsCleanupStatusResponse = ApiSuccess<DevBotsCleanupStatus>;
export type DevBotsAgentsResponse = ApiSuccess<{ agents: DevBotsAgentPersonality[] }>;
export type DevBotsAgentComparisonResponse = ApiSuccess<{ comparison: DevBotsAgentComparison }>;
export type DevBotsTemplatesResponse = ApiSuccess<{ templates: DevBotsTaskTemplate[] }>;
export type DevBotsMessageResponse = ApiSuccess<{ message: string }>;
export type DevBotsWorkspaceSyncStatusResponse = ApiSuccess<DevBotsWorkspaceSyncStatus>;
export type DevBotsWorkspaceSyncResultResponse = ApiSuccess<DevBotsWorkspaceSyncResult>;
export type DevBotsInteractiveSessionStateResponse = ApiSuccess<DevBotsInteractiveSessionState>;
export type DevBotsInteractiveSessionInputResponse = ApiSuccess<{ accepted: boolean }>;
