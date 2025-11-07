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
import { TaskPersistence, TaskStorageConfig } from './taskPersistence.js';
import { WorkspaceOrchestrator } from './workspaceOrchestrator.js';
import { ScopeControlService } from './scopeControl.service.js';
import { EphemeralWorkerService } from './ephemeralWorker.service.js';
import { TaskExecutionService } from './taskExecution.service.js';
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

  // Initialize SQLite task queue
  const taskQueueDbPath = config.taskQueueDbPath ?? './data/tasks/queue.db';
  const taskQueue = new TaskQueueService(taskQueueDbPath);

  // Run recovery system migration
  await taskQueue.runRecoveryMigration();

  // Initialize legacy task persistence (for migration only)
  const storageConfig: TaskStorageConfig = {
    storagePath: config.taskStoragePath ?? './data/tasks',
    backupPath: config.taskBackupPath ?? './data/backups',
    maxBackups: config.maxBackups ?? 10,
    autoSave: config.autoSave ?? true,
    saveInterval: config.saveInterval ?? 30000, // 30 seconds
  };
  const taskPersistence = new TaskPersistence(storageConfig);

  // Initialize agent personality manager
  const agentManager = new AgentPersonalityManager();

  // Initialize template manager
  const templateManager = new TaskPromptTemplateManager();

  // Initialize guidelines manager
  const guidelinesManager = new TaskCreationGuidelinesManager();

  // Initialize workspace orchestrator for dynamic workspaces
  const workspaceOrchestrator = new WorkspaceOrchestrator();
  if (typeof workspaceOrchestrator.initialize === 'function') {
    workspaceOrchestrator.initialize();
  }

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
    workspaceOrchestrator,
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

  // Initialize task execution service
  const taskExecutionService = new TaskExecutionService(
    taskQueue,
    agentManager,
    templateManager,
    workspaceOrchestrator,
    ephemeralWorkerService,
    taskPersistence,
    {
      maxConcurrentWorkers: 2,
      stuckCheckInterval: 60000,
      absoluteMaxDuration: 60 * 60 * 1000,
      artifactsDir: './dev-bots/artifacts'
    }
  );

  // Note: SimpleFailureRecovery and TaskCompletionService require DevBotsManager instance
  // They will be created after DevBotsManager is instantiated
  // For now, create placeholders that will be replaced
  const recovery = null as any; // Will be set by DevBotsManager
  const taskCompletionService = null as any; // Will be set by DevBotsManager

  return {
    processManager,
    dockerManager,
    docker,
    taskQueue,
    agentManager,
    templateManager,
    guidelinesManager,
    workspaceSyncManager,
    retryManager,
    workspaceOrchestrator,
    recovery,
    taskPersistence,
    scopeControl,
    ephemeralWorkerService,
    taskExecutionService,
    taskCompletionService,
  };
}
