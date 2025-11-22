import { EventEmitter } from 'events';
import type {
  ProcessInfo,
  ParsedCloudLog,
  DevBotsStatus,
  DevBotsCleanupStatus,
  DevBotsScopeViolation,
  DevBotsAgentComparison,
  DevBotsAgentPersonality,
  DevBotsInteractiveSessionModelOption,
} from '@app-monitor/api-contracts';
import type { Task, TaskExecution, QueueMetrics } from '../../src/services/taskQueue.sqlite.js';
import type { ServiceConfig } from '../../src/config.js';

const baseProcess: ProcessInfo = {
  name: 'dev-monitor-backend',
  displayName: 'Dev Monitor Backend',
  status: 'running',
  pid: 4242,
  ports: [4000],
  uptime: 120000,
};

const baseTask: Task = {
  id: 'task-123',
  type: 'implementation',
  title: 'Stabilize server startup',
  description: 'Ensure the backend server can start reliably by improving integration coverage.',
  documentation:
    'Ensure the backend server can start reliably by improving integration coverage and adding necessary mocks to dependency graph.',
  status: 'pending',
  priority: 1,
  created_at: Date.now(),
  assigned_agent: 'backend',
  assigned_worker: 'worker-1',
  agent_type: 'claude',
  prompt: 'Do the needful',
  output: '',
  error: undefined,
  can_retry: true,
  retry_count: 0,
  max_retries: 3,
  timeout_ms: null,
  fingerprint: 'fp-123',
  estimated_hours: 1,
  complexity: 'medium',
  files: ['src/server.ts'],
  dependencies: [],
  acceptance_criteria: ['Server starts with mocks', 'Integration tests cover endpoints'],
  architecture_references: [],
  validation_steps: [],
  success_metrics: [],
  is_repair_bot: false,
  retryStrategy: undefined,
  notes: 'Test note',
  pr_number: 42,
  pr_url: 'https://github.com/org/repo/pull/42',
  pr_branch: 'feature/testing',
  pr_status: 'pending_checks',
  pr_checks_status: 'pending',
  pr_review_status: 'no_reviews',
  pr_created_at: Date.now(),
};

const baseExecution: TaskExecution = {
  id: 1,
  task_id: baseTask.id,
  worker_id: 'worker-1',
  attempt_number: 1,
  started_at: Date.now() - 10000,
  ended_at: Date.now() - 5000,
  duration_ms: 5000,
  exit_code: 0,
  error: null,
};

const queueMetrics: QueueMetrics = {
  pending: 1,
  running: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  timeout: 0,
  total: 1,
  avg_completion_time_ms: 5000,
  oldest_pending_age_ms: 1000,
};

const cloudLogs: ParsedCloudLog[] = [
  {
    id: 'log-1',
    service: 'backend',
    timestamp: Date.now(),
    level: 'INFO',
    message: 'Integration log line',
    metadata: {},
    raw: {},
  },
];

const devBotsStatus: DevBotsStatus = {
  systemStatus: 'running',
  workers: {
    'worker-1': {
      id: 'worker-1',
      status: 'idle',
      lastSeen: Date.now(),
      onboardingComplete: true,
      reconnectCount: 0,
    },
  },
  queueSize: 1,
  activeTasks: 0,
  uptime: 60000,
  workerCount: 1,
  maxWorkers: 2,
  activeWorkerTypes: ['claude'],
  availableWorkerTypes: ['claude', 'codex'],
  tasks: {
    pending: [baseTask],
    active: [],
    blocked: [],
    completed: [],
    failed: [],
  },
};

const devBotsCleanupStatus: DevBotsCleanupStatus = {
  schedules: ['nightly'],
  recentTasks: [],
  totalCleanupTasks: 0,
};

const agentComparison: DevBotsAgentComparison = {
  claude: { total: 1, completed: 1, failed: 0, success_rate: 100 },
  codex: { total: 0, completed: 0, failed: 0, success_rate: 0 },
  task_type_breakdown: {
    claude: {
      implementation: { total: 1, completed: 1, failed: 0, success_rate: 100 },
      testing: { total: 0, completed: 0, failed: 0, success_rate: 0 },
      documentation: { total: 0, completed: 0, failed: 0, success_rate: 0 },
    },
    codex: {
      implementation: { total: 0, completed: 0, failed: 0, success_rate: 0 },
      testing: { total: 0, completed: 0, failed: 0, success_rate: 0 },
      documentation: { total: 0, completed: 0, failed: 0, success_rate: 0 },
    },
  },
};

const scopeViolations: DevBotsScopeViolation[] = [
  {
    taskId: baseTask.id,
    violations: [{ type: 'files', severity: 'warning' }],
  },
];

const interactiveSession = {
  id: 'session-1',
  ownerEmail: 'operator@example.com',
  modelProvider: 'claude',
  modelName: '3-opus',
  status: 'running',
  containerId: 'abc123',
  startedAt: new Date().toISOString(),
  lastUserActivityAt: new Date().toISOString(),
  lastAgentActivityAt: new Date().toISOString(),
  endedAt: undefined,
  terminationReason: undefined,
  contextSnapshot: null,
  logPath: '/tmp/logs/session-1.log',
  metadata: {},
};

const interactiveModels: DevBotsInteractiveSessionModelOption[] = [
  {
    provider: 'claude',
    model: '3-opus',
    displayName: 'Claude 3 Opus',
    description: 'High capability model',
    default: true,
  },
];

export class MockProcessManager extends EventEmitter {
  private statuses: Record<string, ProcessInfo> = { [baseProcess.name]: structuredClone(baseProcess) };

  async getAllStatuses(): Promise<ProcessInfo[]> {
    return Object.values(this.statuses).map((status) => ({ ...status }));
  }

  async getServiceStatus(serviceName: string): Promise<ProcessInfo> {
    const status = this.statuses[serviceName];
    if (!status) {
      throw new Error(`Service "${serviceName}" not found`);
    }
    return { ...status };
  }

  async startService(serviceName: string): Promise<ProcessInfo> {
    const status = await this.getServiceStatus(serviceName);
    status.status = 'running';
    this.statuses[serviceName] = status;
    return status;
  }

  async stopService(serviceName: string): Promise<ProcessInfo> {
    const status = await this.getServiceStatus(serviceName);
    status.status = 'stopped';
    this.statuses[serviceName] = status;
    return status;
  }

  async killService(serviceName: string): Promise<ProcessInfo> {
    return this.stopService(serviceName);
  }

  async restartService(serviceName: string): Promise<ProcessInfo> {
    await this.stopService(serviceName);
    return this.startService(serviceName);
  }

  getLogWatcher() {
    return {
      getRecentLogs: (_serviceName: string, _lines: number) => [
        { message: 'Log line A' },
        { details: { message: 'Log line B' } },
      ],
    };
  }

  // Task submission API required by routes
  getTaskQueue() {
    return {
      getDatabase: () => ({} as never),
    };
  }
}

export class MockCloudLogging {
  private environments = {
    production: {
      name: 'production',
      displayName: 'Production',
      projectId: 'project-id',
      services: [
        { name: 'backend', displayName: 'Backend', description: 'API service' },
      ],
    },
  };

  getEnvironments() {
    return this.environments;
  }

  getServicesForEnvironment(environment: string) {
    const env = this.environments[environment];
    if (!env) {
      throw new Error('Environment not found');
    }
    return env.services;
  }

  async getLogs(): Promise<ParsedCloudLog[]> {
    return cloudLogs;
  }

  isAvailable(): boolean {
    return true;
  }
}

export class MockLogRotation {
  private running = false;

  start() {
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  getStatus() {
    return {
      running: this.running,
      managedFiles: ['backend.log'],
    };
  }
}

export class MockLogStreamer {
  constructor(
    _io: unknown,
    _processManager: MockProcessManager,
    _cloudLogging: MockCloudLogging,
    _logSourceManager: MockLogSourceManager,
  ) {}
}

export class MockLogSourceManager {
  private config = [
    {
      id: 'backend',
      name: 'Backend Logs',
      format: 'json',
      parser: 'json',
      color: '#fff',
      displayOrder: 1,
      path: '/tmp/backend.log',
    },
  ];

  async loadConfig() {
    return this.config;
  }

  getEnabledSources() {
    return this.config;
  }

  resolveLogPath(source: { path: string }) {
    return source.path;
  }

  getConfig() {
    return this.config;
  }

  getConfigJSON() {
    return this.config;
  }

  async reloadConfig() {
    return this.config;
  }
}

class MockTaskQueue {
  getTasksWithUnmergedPRs() {
    return [baseTask];
  }

  getTasksByStatus(status: string) {
    if (status === 'completed') {
      return [baseTask];
    }
    return [];
  }

  getDatabase() {
    return {} as never;
  }

  setPRSyncService(_prSyncService: any): void {
    // Mock implementation - no-op for tests
  }
}

class MockPRWorkflowOrchestrator {
  getStatus() {
    return { monitoring: true, monitoredCount: 1 };
  }

  getMonitoredPRs() {
    return [
      {
        taskId: baseTask.id,
        prNumber: 42,
        prUrl: baseTask.pr_url!,
        prBranch: baseTask.pr_branch!,
        status: 'monitoring',
        lastChecked: Date.now(),
        checkCount: 1,
        issuesFound: [],
      },
    ];
  }

  async recoverFromArtifacts() {
    return {
      prInfoRecovered: 1,
      inspectedArtifacts: 1,
    };
  }
}

class MockDockerManager {
  async inspectContainer(_containerId: string) {
    return {
      State: {
        Status: 'running',
      },
    };
  }

  getDocker() {
    // Return a minimal mock Docker instance for terminal handler
    return {
      getContainer: (_containerId: string) => ({
        exec: async () => ({
          start: async () => ({
            on: () => {},
            write: () => {},
            destroy: () => {},
          }),
          resize: async () => {},
        }),
      }),
    } as any;
  }
}

export class MockDevBotsManager extends EventEmitter {
  private status = structuredClone(devBotsStatus);
  private metrics = { ...queueMetrics };
  private executions = [baseExecution];
  private taskQueue = new MockTaskQueue();
  private orchestrator = new MockPRWorkflowOrchestrator();
  private dockerManager = new MockDockerManager();
  private interactiveSession: typeof interactiveSession | null = { ...interactiveSession };

  async getSystemStatus() {
    return structuredClone(this.status);
  }

  isHealthy() {
    return true;
  }



  async getTasks() {
    return structuredClone(this.status.tasks);
  }

  getQueueMetrics() {
    return { ...this.metrics };
  }

  getTask(taskId: string) {
    return taskId === baseTask.id ? structuredClone(baseTask) : null;
  }

  getTaskExecutions(_taskId: string) {
    return [...this.executions];
  }

  getTaskDurationStats() {
    return { avgMs: 5000 };
  }

  getAgentComparisonMetrics() {
    return structuredClone(agentComparison);
  }

  manuallyTimeoutTask(_taskId: string, _reason: string) {}

  validateTaskData() {
    return { valid: true, warnings: [] };
  }

  async addTask(taskData: {
    type?: string;
    title?: string;
    description?: string;
    documentation?: string;
    acceptanceCriteria?: string[] | string;
    files?: string[];
  }, _options?: { submission?: boolean }) {
    const acceptanceCriteria = Array.isArray(taskData.acceptanceCriteria)
      ? taskData.acceptanceCriteria
      : typeof taskData.acceptanceCriteria === 'string'
      ? [taskData.acceptanceCriteria]
      : structuredClone(baseTask.acceptance_criteria);

    const newTask: Task = {
      ...structuredClone(baseTask),
      id: `task-${Date.now()}`,
      type: taskData.type ?? baseTask.type,
      title: taskData.title ?? baseTask.title,
      description: taskData.description ?? taskData.documentation ?? baseTask.description,
      documentation: taskData.documentation ?? baseTask.documentation,
      files: taskData.files ?? structuredClone(baseTask.files),
      acceptance_criteria: acceptanceCriteria,
      created_at: Date.now(),
      status: 'pending',
    };

    this.status.tasks.pending = [newTask, ...this.status.tasks.pending];
    this.status.queueSize = this.status.tasks.pending.length;
    this.metrics.pending = this.status.tasks.pending.length;
    this.metrics.total = Math.max(this.metrics.total, this.status.tasks.pending.length);

    return {
      task: newTask,
      validation: {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
      },
    };
  }

  async assignNextTask() {
    return;
  }

  getAgentPersonalities(): DevBotsAgentPersonality[] {
    return [
      {
        id: 'agent-backend',
        name: 'Backend Specialist',
        role: 'Engineer',
        description: 'Handles backend tasks',
        specialties: ['node', 'sql'],
        expertise: { primary: ['node'], secondary: ['devops'], tools: ['docker'] },
        personality: {
          communicationStyle: 'technical',
          approach: 'methodical',
          focus: 'reliability',
        },
        taskPreferences: {
          preferredTypes: ['implementation'],
          avoidedTypes: [],
          complexityRange: 'medium',
        },
      },
    ];
  }

  getValidAgents() {
    return ['backend', 'frontend'];
  }

  getTaskTemplates() {
    return [
      {
        id: 'template-1',
        name: 'Bug fix',
        description: 'Template for bug fixes',
        taskTypes: ['bug'],
        agentTypes: ['backend'],
        template: 'Fix bug',
        variables: [],
        validationRules: [],
      },
    ];
  }

  getTaskGuidelines() {
    return { implementation: ['Write tests'] };
  }

  getTaskExample() {
    return { title: 'Example task', steps: [] };
  }

  getTaskChecklist() {
    return { items: ['Write code', 'Add tests'] };
  }

  getValidProjects() {
    return ['dev-monitor'];
  }

  exportTasks() {
    return;
  }

  importTasks() {
    return;
  }

  completeWorkerOnboarding() {
    return;
  }

  getWorkspaceSyncStatus() {
    return {
      isRunning: false,
      syncInProgress: false,
      lastSyncTime: new Date().toISOString(),
      baseDir: '/tmp',
      repositories: ['dev-monitor'],
      workers: ['worker-1'],
      conflictStrategy: 'theirs',
    };
  }

  async triggerWorkspaceSync() {
    return { success: true };
  }

  async getDockerStatus() {
    return { healthy: true, containers: [] };
  }

  async revalidateDockerEnvironment() {
    return { success: true };
  }

  async cleanupOrphanedResources() {
    return { success: true };
  }

  getCleanupStatus() {
    return devBotsCleanupStatus;
  }

  async triggerCleanup() {
    return { success: true };
  }

  getScopeViolations() {
    return scopeViolations;
  }

  async triggerEmergencyRecovery() {
    return { success: true };
  }

  getPRWorkflowOrchestrator() {
    return this.orchestrator;
  }

  getTaskQueue() {
    return this.taskQueue;
  }

  getDockerManager() {
    return this.dockerManager;
  }

  getContainerHealth() {
    return { containers: [] };
  }

  getCleanupStatusSummary() {
    return devBotsCleanupStatus;
  }

  getTaskDurationStatsSummary() {
    return this.getTaskDurationStats();
  }

  getAllowedInteractiveModels() {
    return interactiveModels.map((model) => ({
      provider: model.provider,
      name: model.model,
      displayName: model.displayName,
      description: model.description,
      default: model.default,
    }));
  }

  getInteractiveIdleTimeoutMs() {
    return 5 * 60 * 1000;
  }

  getActiveInteractiveSession() {
    return this.interactiveSession;
  }

  getInteractiveSession(sessionId: string) {
    return this.interactiveSession && this.interactiveSession.id === sessionId
      ? this.interactiveSession
      : null;
  }

  async launchInteractiveSession() {
    this.interactiveSession = { ...interactiveSession };
  }

  async endInteractiveSession(_sessionId: string) {
    this.interactiveSession = null;
  }

  sendInteractiveInput() {
    return { accepted: true };
  }

  recordInteractiveActivity() {
    return;
  }

  sendInteractiveSignal() {
    return;
  }

  getInteractiveSessionManager() {
    // Return a minimal mock session manager for terminal handler event wiring
    return new EventEmitter();
  }
}

export interface MockServerDependencies {
  processManager: MockProcessManager;
  cloudLogging: MockCloudLogging;
  devBotsManager: MockDevBotsManager;
  logRotation: MockLogRotation;
  logStreamer: MockLogStreamer;
  logSourceManager: MockLogSourceManager;
  services: typeof import('../../src/config.js').services;
}

export function buildMockServerDependencies(): MockServerDependencies {
  const processManager = new MockProcessManager();
  const cloudLogging = new MockCloudLogging();
  const logSourceManager = new MockLogSourceManager();
  return {
    processManager,
    cloudLogging,
    devBotsManager: new MockDevBotsManager(),
    logRotation: new MockLogRotation(),
    logStreamer: new MockLogStreamer({}, processManager, cloudLogging, logSourceManager),
    logSourceManager,
    services: {
      'dev-monitor-backend': {
        displayName: 'Dev Monitor Backend',
        command: 'npm',
        args: ['run', 'dev'],
        cwd: '.',
        ports: [4000],
        requirePorts: false,
        env: {},
      } as ServiceConfig,
    },
  };
}
