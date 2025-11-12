/**
 * DevBotsManager Factory
 *
 * Factory function for creating DevBotsManager with all dependencies.
 * Separates dependency creation from business logic to enable testing.
 */

import path from 'path';
import { ProcessManager } from './processManager.js';
import { TaskQueueService } from './taskQueue.sqlite.js';
import { AgentPersonalityManager } from './agentPersonalities.js';
import { TaskPromptTemplateManager } from './taskPromptTemplates.js';
import { TaskCreationGuidelinesManager } from './taskCreationGuidelines.js';
import { WorkspaceSyncManager } from './workspaceSyncManager.js';
import { DockerManager } from './dockerManager.js';
import { RetryManager, RetryConfig } from './retryManager.js';
// TaskPersistence removed - using SQLite directly
// WorkspaceOrchestrator removed - using container isolation
import { ScopeControlService } from './scopeControl.service.js';
import { EphemeralWorkerService } from './ephemeralWorker.service.js';
import { resolveArtifactsDir } from '../utils/repoPaths.js';
import { TaskExecutionService } from './taskExecution.service.js';
import { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';
import { SimpleFailureRecovery } from './failureRecovery.js';
import { TaskCompletionService } from './taskCompletion.service.js';
import { InteractiveSessionService } from './interactiveSession.service.js';
import { InteractiveSessionOrchestrator } from './interactiveSessionOrchestrator.js';
import { InteractiveSessionStreamManager } from './interactiveSessionStreamManager.js';
import { WorkerHealthMonitor } from './workerHealthMonitor.service.js';
import { TaskCreationService } from './taskCreation.service.js';
import { StatusAggregationService } from './statusAggregation.service.js';
import { RetryCoordinationService } from './retryCoordination.service.js';
import type { DevBotsManagerDependencies, DevBotsManagerConfig } from './devBotsManager.interfaces.js';

/**
 * Create all dependencies for DevBotsManager
 *
 * This is the production factory that creates real implementations
 * of all dependencies. For testing, create custom dependencies.
 */
export async function createDevBotsManagerDependencies(
  processManager: ProcessManager,
  config: DevBotsManagerConfig = {}
): Promise<DevBotsManagerDependencies> {
  // Initialize Docker Manager with validation
  const dockerSocket = config.dockerSocket ?? '/var/run/docker.sock';
  const dockerManager = new DockerManager(dockerSocket);
  const docker = dockerManager.getDocker();

  // Initialize SQLite task queue - use same database as DevBotsDatabase
  const { config: appConfig } = await import('../config.js');
  const taskQueueDbPath = config.taskQueueDbPath ?? appConfig.databasePath;
  const taskQueue = new TaskQueueService(taskQueueDbPath);

  // Register with factory for singleton access
  const { setTaskQueueService } = await import('./taskQueue.factory.js');
  setTaskQueueService(taskQueue);

  // Run recovery system migration
  await taskQueue.runRecoveryMigration();

  // TaskPersistence removed - using SQLite directly

  // Initialize agent personality manager
  const agentManager = new AgentPersonalityManager();

  // Initialize template manager
  const templateManager = new TaskPromptTemplateManager();

  // Initialize guidelines manager
  const guidelinesManager = new TaskCreationGuidelinesManager();

  // Initialize task creation service
  const taskCreationService = new TaskCreationService(taskQueue, guidelinesManager);

  // WorkspaceOrchestrator completely removed - using container isolation instead

  // Note: StatusAggregationService created after ephemeralWorkerService
  // Each bot gets its own fresh repository clone inside the container

  // Initialize workspace sync manager
  const workspaceBaseDir = config.workspaceBaseDir ?? path.resolve(path.join(process.cwd(), '../../'));
  const repositories = config.repositories ?? [
    'job-finder-BE',
    'job-finder-FE',
    'job-finder-shared-types',
    'job-finder-worker'
  ];
  const workspaceSyncManager = new WorkspaceSyncManager({
    baseDir: workspaceBaseDir,
    repositories,
    workers: [],
    conflictStrategy: (config.conflictStrategy === 'manual' ? 'stash' : config.conflictStrategy) ?? 'auto-merge',
  });

  // Initialize retry manager
  const retryConfig: Partial<RetryConfig> = {
    max_retries: config.maxRetries ?? 3,
  };
  const retryManager = new RetryManager(retryConfig);

  // Initialize scope control service
  const scopeControl = new ScopeControlService();

  // Initialize ephemeral worker service
  const ephemeralWorkerService = new EphemeralWorkerService(
    docker,
    dockerManager,
    {
      maxConcurrentWorkers: 2,
      dockerImage: 'dev-bot:latest',
      logsDirectory: './data/logs',
      envPassthroughKeys: [
        'ANTHROPIC_API_KEY',
        'CLAUDE_API_KEY',
        'OPENAI_API_KEY',
        'GITHUB_TOKEN',
        'GIT_AUTHOR_NAME',
        'GIT_AUTHOR_EMAIL',
        'GIT_COMMITTER_NAME',
        'GIT_COMMITTER_EMAIL'
      ]
    }
  );

  // Initialize status aggregation service
  const statusAggregationService = new StatusAggregationService(taskQueue, ephemeralWorkerService);

  // Initialize retry coordination service (callbacks will be set by DevBotsManager)
  const retryCoordinationService = new RetryCoordinationService(
    taskQueue,
    retryManager,
    () => {}, // emit function placeholder, will be bound by DevBotsManager
    async () => {} // assignNextTask placeholder, will be bound by DevBotsManager
  );

  // Initialize task execution service
  const taskExecutionService = new TaskExecutionService(
    taskQueue,
    agentManager,
    templateManager,
    ephemeralWorkerService,
    // TaskPersistence removed
    {
      maxConcurrentWorkers: 2,
      stuckCheckInterval: 60000,
      absoluteMaxDuration: 60 * 60 * 1000,
      artifactsDir: resolveArtifactsDir(),
      recovery: {
        enabled: config.recovery?.enabled ?? true,
        dryRun: config.recovery?.dryRun ?? false
      }
    }
  );

  // Initialize PR workflow orchestrator
  const prWorkflowOrchestrator = new PRWorkflowOrchestrator(taskQueue, {
    enableAutoMerge: config.enablePRAutoMerge ?? true,
    checkTimeoutMs: config.prCheckTimeoutMs ?? 600000,
    monitorPollIntervalMs: config.prMonitorPollIntervalMs ?? 60000
  });

  // Initialize PR monitoring for existing unmerged PRs
  await prWorkflowOrchestrator.initialize();

  const interactiveSessionService = new InteractiveSessionService({
    idleTimeoutMs: 5 * 60 * 1000,
    allowedModels: [
      { provider: 'claude', name: '*' },
      { provider: 'codex', name: '*' },
    ],
  });

  const interactiveSessionOrchestrator = new InteractiveSessionOrchestrator(
    docker,
    {
      dockerImage: 'dev-bot:latest',
      logsDirectory: './data/logs/interactive',
      envPassthroughKeys: [
        'ANTHROPIC_API_KEY',
        'CLAUDE_API_KEY',
        'OPENAI_API_KEY',
        'GITHUB_TOKEN',
        'GIT_AUTHOR_NAME',
        'GIT_AUTHOR_EMAIL',
        'GIT_COMMITTER_NAME',
        'GIT_COMMITTER_EMAIL',
      ],
    },
  );

  const interactiveSessionStreamManager = new InteractiveSessionStreamManager(docker, {
    backlogLimit: 500,
    shellCommand: ['/bin/bash'],
  });

  // Note: SimpleFailureRecovery, TaskCompletionService, and WorkerHealthMonitor require DevBotsManager instance
  // They will be created/initialized after DevBotsManager is instantiated
  // For now, create placeholders that will be replaced
  const recovery = null as unknown as SimpleFailureRecovery; // Will be set by DevBotsManager
  const taskCompletionService = null as unknown as TaskCompletionService; // Will be set by DevBotsManager

  // Create WorkerHealthMonitor (will be given recovery instance by DevBotsManager)
  const workerHealthMonitor = new WorkerHealthMonitor(
    ephemeralWorkerService,
    taskQueue,
    dockerManager,
    scopeControl,
    processManager,
    null, // recovery will be set by DevBotsManager
    () => {} // emit function placeholder, will be bound by DevBotsManager
  );

  return {
    processManager,
    dockerManager,
    docker,
    taskQueue,
    taskCreationService,
    statusAggregationService,
    retryCoordinationService,
    agentManager,
    templateManager,
    guidelinesManager,
    workspaceSyncManager,
    retryManager,
    // WorkspaceOrchestrator removed - using container isolation
    recovery,
    // TaskPersistence removed - using SQLite directly
    scopeControl,
    ephemeralWorkerService,
    taskExecutionService,
    taskCompletionService,
    prWorkflowOrchestrator,
    interactiveSessionService,
    interactiveSessionOrchestrator,
    interactiveSessionStreamManager,
    workerHealthMonitor,
  };
}
