/**
 * DevBotsManager Factory
 *
 * Factory function for creating DevBotsManager with all dependencies.
 * Separates dependency creation from business logic to enable testing.
 */

import { TaskQueueService } from './taskQueue.sqlite.js';
import { AgentPersonalityManager } from './agentPersonalities.js';
import { TaskPromptTemplateManager } from './taskPromptTemplates.js';
import { TaskCreationGuidelinesManager } from './taskCreationGuidelines.js';
import { DockerManager } from './dockerManager.js';
import { RetryManager, RetryConfig } from './retryManager.js';
import { MS_PER_HOUR } from '../constants/timeouts.js';
// WORKER_IDLE_TIMEOUT_MS removed - no longer used after InteractiveSessionManager removal
// TaskPersistence removed - using SQLite directly
// WorkspaceOrchestrator removed - using container isolation
import { ScopeControlService } from './scopeControl.service.js';
import { EphemeralWorkerService } from './ephemeralWorker.service.js';
import { AgentCliCommandBuilder, type AgentCliType } from './agentCliCommandBuilder.js';
import { RecoveryAgentService } from './recoveryAgent.service.js';
import { resolveArtifactsDir, resolveLogsDir } from '../utils/repoPaths.js';
import { TaskExecutionService } from './taskExecution.service.js';
import { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';
import { TaskCompletionService } from './taskCompletion.service.js';
// InteractiveSessionManager import removed - migrated to tmux-based TerminalService
import { WorkerHealthMonitor } from './workerHealthMonitor.service.js';
import { TaskCreationService } from './taskCreation.service.js';
import { StatusAggregationService } from './statusAggregation.service.js';
import { RetryCoordinationService } from './retryCoordination.service.js';
import { SystemLifecycleService } from './systemLifecycle.service.js';
import { SystemInitializationService } from './systemInitialization.service.js';
import { CleanupCoordinator } from './cleanupCoordinator.service.js';
import { InfoQueryService } from './infoQuery.service.js';
import { AgentSelector } from './agentSelector.js';
import { AgentEligibilityServiceImpl } from './agentEligibility.service.js';
import type { DevBotsManagerDependencies, DevBotsManagerConfig } from './devBotsManager.interfaces.js';
import { logger } from '../utils/logger.js';

/**
 * Create all dependencies for DevBotsManager
 *
 * This is the production factory that creates real implementations
 * of all dependencies. For testing, create custom dependencies.
 */
export async function createDevBotsManagerDependencies(
  config: DevBotsManagerConfig = {}
): Promise<DevBotsManagerDependencies> {
  // Initialize Docker Manager with validation
  const dockerSocket = config.dockerSocket ?? '/var/run/docker.sock';
  const dockerManager = new DockerManager(dockerSocket);
  const docker = dockerManager.getDocker();

  const agentEligibilityService = new AgentEligibilityServiceImpl();
  const agentSelector = new AgentSelector(undefined, agentEligibilityService);

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

  // Initialize retry manager
  const retryConfig: Partial<RetryConfig> = {
    max_retries: config.maxRetries ?? 3,
  };
  const retryManager = new RetryManager(retryConfig);

  // Initialize scope control service
  const scopeControl = new ScopeControlService();

  // Initialize intelligent agent tooling shared across services
  const cliCommandBuilder = new AgentCliCommandBuilder();

  (['claude', 'codex', 'gemini'] as AgentCliType[]).forEach(cliType => {
    const inspection = cliCommandBuilder.inspectCliHelp(cliType);
    if (inspection.status === 'missing_binary') {
      logger.warn({
        category: 'automation',
        action: 'agent_cli_missing',
        message: `${cliType} CLI binary not detected in host environment`,
        details: { cliType }
      });
    } else if (inspection.status === 'missing_flags') {
      logger.warn({
        category: 'automation',
        action: 'agent_cli_flags_missing',
        message: `${cliType} CLI help output did not include required flags`,
        details: {
          cliType,
          missingFlags: inspection.missingFlags
        }
      });
    } else if (inspection.status === 'execution_failed') {
      logger.error({
        category: 'automation',
        action: 'agent_cli_help_failed',
        message: `Failed to inspect ${cliType} CLI help`,
        error: inspection.error
      });
    }
  });

  const recoveryAgentService = new RecoveryAgentService({
    agentSelector,
    cliCommandBuilder,
  });

  // Initialize ephemeral worker service
  const ephemeralWorkerService = new EphemeralWorkerService(
    docker,
    dockerManager,
    {
      maxConcurrentWorkers: 2,
      dockerImage: 'dev-bot:latest',
      logsDirectory: resolveLogsDir(),
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
    },
    taskQueue.getDb(), // Pass database instance from TaskQueueService
    undefined,
    {
      recoveryAgentService,
      cliCommandBuilder,
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
    agentSelector,
    {
      maxConcurrentWorkers: 2,
      stuckCheckInterval: 60000,
      absoluteMaxDuration: MS_PER_HOUR,
      artifactsDir: resolveArtifactsDir(),
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

  // InteractiveSessionManager removed - migrated to tmux-based TerminalService
  // Terminal streaming is now handled by TerminalService via Socket.IO events

  // Note: TaskCompletionService and WorkerHealthMonitor require DevBotsManager instance
  // They will be created/initialized after DevBotsManager is instantiated
  // For now, create placeholders that will be replaced
  const taskCompletionService = null as unknown as TaskCompletionService; // Will be set by DevBotsManager

  // Create WorkerHealthMonitor
  const workerHealthMonitor = new WorkerHealthMonitor(
    ephemeralWorkerService,
    taskQueue,
    dockerManager,
    scopeControl,
    null, // processManager removed
    null, // recovery - will be handled by task execution service
    () => {} // emit function placeholder, will be bound by DevBotsManager
  );

  // Create SystemLifecycleService (callbacks will be bound by DevBotsManager)
  const systemLifecycleService = new SystemLifecycleService(
    {
      ephemeralWorkerService,
      workerHealthMonitor,
      // interactiveSessionService removed - migrated to tmux-based TerminalService
      // taskQueueWorker and metricsEmitter will be set dynamically by DevBotsManager
    },
    () => {}, // emit function placeholder
    () => {} // assignNextTask placeholder
  );

  // Create SystemInitializationService (callbacks will be bound by DevBotsManager)
  const systemInitializationService = new SystemInitializationService(
    {
      dockerManager,
      taskQueue,
      taskExecutionService,
      ephemeralWorkerService,
      // interactiveSessionService removed - migrated to tmux-based TerminalService
      systemLifecycleService
    },
    () => {}, // emit function placeholder
    async () => {} // endInteractiveSession placeholder
  );

  // Create CleanupCoordinator
  const cleanupCoordinator = new CleanupCoordinator(
    taskQueue,
    scopeControl,
    async () => {} // assignNextTask placeholder, will be bound by DevBotsManager
  );

  // Create InfoQueryService
  const infoQueryService = new InfoQueryService(
    agentManager,
    templateManager,
    guidelinesManager,
    ephemeralWorkerService,
    2 // maxWorkers from config
  );

  return {
    dockerManager,
    docker,
    taskQueue,
    taskCreationService,
    statusAggregationService,
    retryCoordinationService,
    agentManager,
    templateManager,
    guidelinesManager,
    retryManager,
    // WorkspaceOrchestrator removed - using container isolation
    // Recovery removed - handled by task execution service
    // TaskPersistence removed - using SQLite directly
    scopeControl,
    ephemeralWorkerService,
    taskExecutionService,
    taskCompletionService,
    prWorkflowOrchestrator,
    // interactiveSessionManager removed - migrated to tmux-based TerminalService
    workerHealthMonitor,
    systemLifecycleService,
    systemInitializationService,
    cleanupCoordinator,
    infoQueryService,
  };
}
