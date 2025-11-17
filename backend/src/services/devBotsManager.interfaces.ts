/**
 * DevBotsManager Dependency Interfaces
 *
 * Extracted interfaces for dependency injection to enable testing.
 * All dependencies that were previously instantiated internally
 * are now abstracted behind interfaces.
 */

import type Docker from 'dockerode';
import type { TaskQueueService } from './taskQueue.sqlite.js';
import type { AgentPersonalityManager } from './agentPersonalities.js';
import type { TaskPromptTemplateManager } from './taskPromptTemplates.js';
import type { TaskCreationGuidelinesManager } from './taskCreationGuidelines.js';
import type { WorkspaceSyncManager } from './workspaceSyncManager.js';
import type { DockerManager } from './dockerManager.js';
import type { RetryManager } from './retryManager.js';
// TaskPersistence removed - using SQLite directly
// WorkspaceOrchestrator removed - using container isolation
import type { ScopeControlService } from './scopeControl.service.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { TaskExecutionService } from './taskExecution.service.js';
import type { TaskCompletionService } from './taskCompletion.service.js';
import type { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';
import type { InteractiveSessionService } from './interactiveSession.service.js';
import type { InteractiveSessionOrchestrator } from './interactiveSessionOrchestrator.js';
import type { InteractiveSessionStreamManager } from './interactiveSessionStreamManager.js';
import type { WorkerHealthMonitor } from './workerHealthMonitor.service.js';
import type { TaskCreationService } from './taskCreation.service.js';
import type { StatusAggregationService } from './statusAggregation.service.js';
import type { RetryCoordinationService } from './retryCoordination.service.js';
import type { SystemLifecycleService } from './systemLifecycle.service.js';
import type { SystemInitializationService } from './systemInitialization.service.js';
import type { InteractiveSessionCoordinator } from './interactiveSessionCoordinator.service.js';
import type { CleanupCoordinator } from './cleanupCoordinator.service.js';
import type { InfoQueryService } from './infoQuery.service.js';

/**
 * All dependencies required by DevBotsManager
 */
export interface DevBotsManagerDependencies {
  // Required dependencies
  dockerManager: DockerManager;
  docker: Docker;

  // Core services (initialized in initializeEnhancedServices)
  taskQueue: TaskQueueService;
  taskCreationService: TaskCreationService;
  statusAggregationService: StatusAggregationService;
  retryCoordinationService: RetryCoordinationService;
  agentManager: AgentPersonalityManager;
  templateManager: TaskPromptTemplateManager;
  guidelinesManager: TaskCreationGuidelinesManager;
  workspaceSyncManager: WorkspaceSyncManager;
  retryManager: RetryManager;

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

  // Interactive sessions
  interactiveSessionService: InteractiveSessionService;
  interactiveSessionOrchestrator: InteractiveSessionOrchestrator;
  interactiveSessionStreamManager: InteractiveSessionStreamManager;

  // Worker health monitoring
  workerHealthMonitor: WorkerHealthMonitor;

  // System lifecycle management
  systemLifecycleService: SystemLifecycleService;

  // System initialization
  systemInitializationService: SystemInitializationService;

  // Interactive session coordination
  interactiveSessionCoordinator: InteractiveSessionCoordinator;

  // Cleanup and scope control coordination
  cleanupCoordinator: CleanupCoordinator;

  // Info and query operations
  infoQueryService: InfoQueryService;
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

  // Recovery configuration
  recovery?: {
    enabled?: boolean;
    dryRun?: boolean;
  };
}
