/**
 * DevBot Utilities - Modular Container Creation & Management
 *
 * This module provides reusable, composable utilities for creating and managing
 * dev-bot containers. Supports multiple use cases:
 * - Automation workers (queue-based task execution)
 * - Interactive sessions (manual debugging)
 * - Script runners, test execution, etc.
 *
 * Architecture:
 * - DevBotContainerBuilder: Fluent API for building containers
 * - DevBotWorkspaceManager: Repository cloning and git operations
 * - DevBotCredentialsManager: Secure credential mounting
 * - DevBotContainerLifecycle: Start, stop, monitor, cleanup
 *
 * @example
 * ```typescript
 * // Create an automation worker
 * const builder = DevBotContainerPresets.automationWorker(workerId, taskId, agentId);
 * const credentials = new DevBotCredentialsManager();
 * const { volumes, warnings } = credentials.discoverCredentials();
 *
 * volumes.forEach(v => builder.volume(v.hostPath, v.containerPath, v.mode));
 * builder.envFromObject(credentials.getPassthroughEnv(['ANTHROPIC_API_KEY']));
 *
 * const container = await builder.create(docker);
 *
 * // Start and setup workspace
 * const lifecycle = new DevBotContainerLifecycle(docker);
 * await lifecycle.start(container.id);
 *
 * const workspace = new DevBotWorkspaceManager(docker);
 * await workspace.cloneRepository(container.id, 'staging');
 * ```
 */

export {
  DevBotContainerBuilder,
  DevBotContainerPresets,
  type ContainerLabels,
  type VolumeMount,
  type TmpfsMount,
  type ContainerResources,
  type DevBotContainerConfig,
} from './DevBotContainerBuilder';

export {
  DevBotWorkspaceManager,
  type WorkspaceConfig,
  type CloneOptions,
} from './DevBotWorkspaceManager';

export {
  DevBotCredentialsManager,
  type CredentialMounts,
} from './DevBotCredentialsManager';

export {
  DevBotContainerLifecycle,
  type ContainerHealth,
  type ContainerStats,
} from './DevBotContainerLifecycle';
