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

// ============================================================================
// Context-Aware Task Submission (Minimal API)
// ============================================================================

export interface MinimalTaskPayload {
  // Required fields (3 only)
  title: string;
  taskType: 'implementation' | 'review' | 'fix' | 'pr-follow-up' | 'analysis';
  intent: string;  // Replaces 'description' and 'documentation'
  
  // Optional overrides (auto-detected if omitted)
  targetFiles?: string[];
  riskLevel?: 'minimal' | 'low' | 'medium' | 'high';
  contextProfiles?: string[];
  desiredOutputs?: string[];
  
  // Chain tracking (system-managed)
  followUpOf?: string;
  chainId?: string;
  
  // Advanced (rarely used)
  assignedAgent?: string;
  priority?: number;
}

export interface TaskAutoDetectionResult {
  detectedFiles: string[];
  inferredRiskLevel: 'minimal' | 'low' | 'medium' | 'high';
  selectedProfiles: string[];
  recommendedOutputs: string[];
  confidence: {
    files: number;       // 0-1
    riskLevel: number;   // 0-1
    profiles: number;    // 0-1
  };
  warnings: string[];
}

export interface ContextBundleVersion {
  bundleId: string;
  cacheKey: string;
  version: string;        // semantic version (e.g., "1.2.0")
  gitCommitHash: string;
  profiles: string[];
  totalBytes: number;
  generatedAt: string;
  expiresAt?: string;
}

export interface ContextEffectivenessMetrics {
  bundleId: string;
  taskId: string;
  profilesProvided: string[];
  filesAccessed: string[];       // Bot reports which files it read
  filesAccessedCount: number;
  effectivenessScore: number;    // 1-5 (bot self-report)
  helpfulFiles: string[];        // Files bot found most useful
  missingContext: string[];      // Info bot needed but didn't have
  taskOutcome: 'success' | 'failure' | 'partial';
  feedbackNotes?: string;
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

export type PhaseStatus = 'ready' | 'running' | 'validating' | 'recovering' | 'complete' | 'blocked';

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
  // Phase system fields
  phaseIndex?: number;
  phaseName?: string;
  phaseStatus?: PhaseStatus;
  phaseAttempts?: number;
}

export interface DevBotsTaskCollections {
  pending: DevBotsTask[];
  active: DevBotsTask[];
  completed: DevBotsTask[];
  failed: DevBotsTask[];
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

export type DevBotsQueueBucket = 'pending' | 'active' | 'completed' | 'failed';

export interface DevBotsQueueItem {
  bucket: DevBotsQueueBucket;
  task: DevBotsTask;
}

export interface DevBotsQueueSummary {
  items: DevBotsQueueItem[];
  counts: {
    pending: number;
    active: number;
    completed: number;
    failed: number;
  };
  lastUpdated: string;
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

/**
 * Bot self-reporting payload
 */
export interface DevBotsReportCompletionPayload {
  /** Whether the task completed successfully (true) or failed (false) */
  success: boolean;
  /** Optional brief summary of what was accomplished or what went wrong */
  summary?: string;
}

/**
 * Response from bot completion reporting endpoint
 */
export interface DevBotsReportCompletionResponse {
  success: boolean;
  message: string;
  taskId: string;
}

export type DevBotsReportCompletionApiResponse = ApiSuccess<DevBotsReportCompletionResponse>;

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
  details?: Record<string, unknown> | unknown[];
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
export type DevBotsQueueResponse = ApiSuccess<DevBotsQueueSummary>;
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

// -----------------------------------------------------------------------------
// Dev-Bots Settings Contracts
// -----------------------------------------------------------------------------

export interface DevBotsSettings {
  modelStrategy: 'alternate' | 'claude-only' | 'codex-only' | 'random';
  maxWorkers: number;
  dryRun: boolean;
  autoCleanup: boolean;
  updatedAt: string;
}

export type DevBotsSettingsResponse = ApiSuccess<DevBotsSettings>;

// -----------------------------------------------------------------------------
// Dev-Bots Intervention Contracts
// -----------------------------------------------------------------------------

export interface DevBotsInterventionResponse {
  message: string;
  taskId?: string;
  chainId?: string;
  timestamp?: string;
}

// Specific response types with appropriate required fields
export interface DevBotsTaskInterventionResponse extends DevBotsInterventionResponse {
  taskId: string; // Required for task-level interventions
}

export interface DevBotsChainInterventionResponse extends DevBotsInterventionResponse {
  chainId: string; // Required for chain-level interventions
}

export interface DevBotsRetryTaskPayload {
  taskId: string;
}

export interface DevBotsSkipTaskPayload {
  taskId: string;
  reason?: string;
}

export interface DevBotsCancelTaskPayload {
  taskId: string;
}

export interface DevBotsQuarantineChainPayload {
  chainId: string;
  reason: string;
}

/**
 * Bot Self-Reporting: Payload for bots to report task completion status
 * POST /api/dev-bots/tasks/:taskId/report-completion
 */
export interface DevBotsReportCompletionPayload {
  /** Whether the task completed successfully (true) or failed (false) */
  success: boolean;
  /** Optional brief summary of what was accomplished or what went wrong */
  summary?: string;
}

/**
 * Response from bot completion reporting endpoint
 */
export interface DevBotsReportCompletionResponse {
  success: boolean;
  message: string;
  taskId: string;
}

export type DevBotsRetryTaskResponse = ApiSuccess<DevBotsTaskInterventionResponse>;
export type DevBotsSkipTaskResponse = ApiSuccess<DevBotsTaskInterventionResponse>;
export type DevBotsCancelTaskResponse = ApiSuccess<DevBotsTaskInterventionResponse>;
export type DevBotsQuarantineChainResponse = ApiSuccess<DevBotsChainInterventionResponse>;

// -----------------------------------------------------------------------------
// Plans System Contracts
// -----------------------------------------------------------------------------

export type PlanType = 'feature' | 'refactor' | 'fix' | 'investigation';
export type PlanPriority = 'p0' | 'p1' | 'p2' | 'p3';
export type PlanStatus = 'planning' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';

export interface PlanScopeBoundaries {
  mustNotChange?: string[];
  mustNotAffect?: string[];
}

export interface Plan {
  id: string;
  title: string;
  description?: string;
  markdown_ref?: string;
  plan_type: PlanType;
  priority: PlanPriority;
  status: PlanStatus;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  cancelled_at?: number;
  created_by?: string;
  assigned_to?: string;
  success_criteria?: string[];
  scope_boundaries?: PlanScopeBoundaries;
  estimated_effort_hours?: number;
  metadata?: Record<string, unknown>;
}

export interface CreatePlanInput {
  title: string;
  description?: string;
  markdown_ref?: string;
  plan_type: PlanType;
  priority: PlanPriority;
  created_by?: string;
  assigned_to?: string;
  success_criteria?: string[];
  scope_boundaries?: PlanScopeBoundaries;
  estimated_effort_hours?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdatePlanInput {
  title?: string;
  description?: string;
  markdown_ref?: string;
  plan_type?: PlanType;
  priority?: PlanPriority;
  assigned_to?: string;
  success_criteria?: string[];
  scope_boundaries?: PlanScopeBoundaries;
  estimated_effort_hours?: number;
  metadata?: Record<string, unknown>;
}

export interface PlanProgress {
  tasksTotal: number;
  tasksCompleted: number;
  tasksPending: number;
  tasksRunning: number;
  tasksFailed: number;
  tasksCancelled: number;
  prsTotal: number;
  prsMerged: number;
  prsOpen: number;
  prsClosed: number;
  prsBlocked: number;
  percentComplete: number;
  estimatedHoursRemaining?: number;
}

export interface PlanChainStatus {
  activeChains: number;
  blockedChains: Array<{
    chainId: string;
    taskId: string;
    blockedReason?: string;
    blockedAt?: number;
  }>;
  escalationNeeded: boolean;
  escalationReason?: string;
}

export interface PlanPRStatus {
  prs: Array<{
    number: number;
    taskId: string;
    status: 'open' | 'closed' | 'merged';
    url?: string;
    branch?: string;
    created_at?: number;
    merged_at?: number;
  }>;
  blockingIssues: string[];
}

export interface PlanTask {
  id: string;
  title: string;
  status: string;
  pr_number?: number;
  chain_id?: string;
  chain_status?: string;
}

export interface PlanDetails extends Plan {
  progress: PlanProgress;
  prStatus: PlanPRStatus;
  chainStatus: PlanChainStatus;
  tasks: PlanTask[];
}

export interface PlanQueryFilters {
  status?: PlanStatus | PlanStatus[];
  priority?: PlanPriority | PlanPriority[];
  plan_type?: PlanType | PlanType[];
  created_by?: string;
  assigned_to?: string;
}

// API Response types
export type PlanResponse = ApiSuccess<Plan>;
export type PlansListResponse = ApiSuccess<Plan[]>;
export type PlanDetailsResponse = ApiSuccess<PlanDetails>;
export type PlanTasksResponse = ApiSuccess<PlanTask[]>;
export type PlanDeleteResponse = ApiSuccess<{ message: string; deleted: boolean }>;
export type PlanCancelResponse = ApiSuccess<Plan>;

// ============================================================================
// Issue Reporting
// ============================================================================

export interface IssueReportRequest {
  timestamp: string;
  traceId?: string;
  sessionId: string;
  route: string;
  userAgent: string;
  description?: string;
  screenshot?: string | null; // base64 data URL
  screenshotError?: string;
  meta?: Record<string, unknown>; // Flexible JSON for any additional context
}

export interface IssueReportResponse {
  issueId: string;
  message: string;
}

export type IssueReportApiResponse = ApiSuccess<IssueReportResponse>;
