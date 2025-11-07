/**
 * DevBotsManager Dependency Interfaces
 *
 * Extracted interfaces for dependency injection to enable testing.
 * All dependencies that were previously instantiated internally
 * are now abstracted behind interfaces.
 */

import type Docker from 'dockerode';
import type { ProcessManager } from './processManager.js';
import type { TaskQueueService } from './taskQueue.sqlite.js';
import type { AgentPersonalityManager } from './agentPersonalities.js';
import type { TaskPromptTemplateManager } from './taskPromptTemplates.js';
import type { TaskCreationGuidelinesManager } from './taskCreationGuidelines.js';
import type { WorkspaceSyncManager } from './workspaceSyncManager.js';
import type { DockerManager } from './dockerManager.js';
import type { RetryManager } from './retryManager.js';
import type { TaskPersistence } from './taskPersistence.js';
import type { WorkspaceOrchestrator } from './workspaceOrchestrator.js';
import type { SimpleFailureRecovery } from './failureRecovery.js';
import type { ScopeControlService } from './scopeControl.service.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { TaskExecutionService } from './taskExecution.service.js';
import type { TaskCompletionService } from './taskCompletion.service.js';
import type { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';

/**
 * All dependencies required by DevBotsManager
 */
export interface DevBotsManagerDependencies {
  // Required dependencies
  processManager: ProcessManager;
  dockerManager: DockerManager;
  docker: Docker;

  // Core services (initialized in initializeEnhancedServices)
  taskQueue: TaskQueueService;
  agentManager: AgentPersonalityManager;
  templateManager: TaskPromptTemplateManager;
  guidelinesManager: TaskCreationGuidelinesManager;
  workspaceSyncManager: WorkspaceSyncManager;
  retryManager: RetryManager;
  workspaceOrchestrator: WorkspaceOrchestrator;
  recovery: SimpleFailureRecovery;

  // Legacy/migration support
  taskPersistence: TaskPersistence;

  // Scope control
  scopeControl: ScopeControlService;

  // Ephemeral worker management
  ephemeralWorkerService: EphemeralWorkerService;

  // Task execution coordination
  taskExecutionService: TaskExecutionService;

  // Task completion handling
  taskCompletionService: TaskCompletionService;

  // PR workflow orchestration
  prWorkflowOrchestrator: PRWorkflowOrchestrator;
}

/**
 * Configuration for creating DevBotsManager dependencies
 */
export interface DevBotsManagerConfig {
  // Docker configuration
  dockerSocket?: string;

  // Task queue configuration
  taskQueueDbPath?: string;

  // Task persistence configuration
  taskStoragePath?: string;
  taskBackupPath?: string;
  maxBackups?: number;
  autoSave?: boolean;
  saveInterval?: number;

  // Workspace sync configuration
  workspaceBaseDir?: string;
  repositories?: string[];
  conflictStrategy?: 'auto-merge' | 'manual';

  // Retry configuration
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;

  // PR workflow configuration
  enablePRAutoMerge?: boolean;
  prCheckTimeoutMs?: number;
  prMonitorPollIntervalMs?: number;
}
