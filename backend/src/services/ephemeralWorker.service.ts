/**
 * Ephemeral Worker Service
 *
 * Extracted from DevBotsManager to handle ephemeral Docker container
 * lifecycle and task execution using the imagineer-style pattern:
 * - Create container
 * - Copy workspace into container
 * - Execute task with Claude CLI
 * - Collect results
 * - Destroy container
 *
 * This service manages the complete lifecycle of ephemeral workers from
 * creation through execution to destruction.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type Docker from 'dockerode';
import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import type { AgentPersonality } from './agentPersonalities.js';
import type { DockerManager } from './dockerManager.js';
// WorkspaceOrchestrator removed - we use Docker cp for file systems, not git mirrors
import * as DockerConfig from './dockerConfig.js';
import { getLogPaths } from './workTargetDocumentation.js';
import { getGitHubPRService, type GitHubPRService } from './githubPR.service.js';
import { ContextBundleGenerator } from './context/index.js';
import { ValidatorRegistry } from './phaseValidation/ValidatorRegistry.js';
import { ArtifactExtractorService } from './artifactExtractor.service.js';
import { PhaseOrchestratorService } from './phaseOrchestrator.service.js';
import { RecoveryAgentService } from './recoveryAgent.service.js';
import type { ValidationResult } from './phaseValidation/types.js';
import { getConnectionManager } from './connectionManager.js';
import { CONTAINER_MEMORY_LIMIT_BYTES, CONTAINER_CPU_QUOTA, WORKER_UID_GID } from '../constants/containers.js';
import { DEFAULT_EPHEMERAL_WORKER_CONFIG } from '../config/defaults.js';
import { ContainerLifecycleService } from './ContainerLifecycleService.js';
import { WorkerLogService } from './WorkerLogService.js';
import { ContextDeliveryService } from './ContextDeliveryService.js';

export interface WorkspaceContext {
  id: string;
  branchName: string;
  createdAt: string;
}

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface EphemeralWorker {
  id: string;
  containerId: string;
  agent: AgentPersonality;
  agentCliType: 'claude' | 'codex' | 'gemini'; // Which CLI tool is used
  task: Task;
  status: 'starting' | 'running' | 'completing' | 'completed' | 'failed' | 'destroyed';
  createdAt: string;
  completedAt?: string;
  destroyedAt?: string;
  workspace: WorkspaceContext;
}

export interface TaskExecutionResult {
  success: boolean;
  output?: string;
  errorOutput?: string;
  exitCode?: number;
  error?: Error;
}

/**
 * Phase completion result including validation and extracted context.
 * Returned by completePhaseExecution() to provide both validation status
 * and git context for persistence by the orchestration layer.
 */
export interface PhaseCompletionResult extends ValidationResult {
  /** Git branch name extracted from container (if available) */
  gitBranch?: string;
}

export interface EphemeralWorkerServiceConfig {
  maxConcurrentWorkers: number;
  dockerImage: string;
  logsDirectory: string;
  envPassthroughKeys: string[];
}

// ============================================================================
// Ephemeral Worker Service
// ============================================================================

export class EphemeralWorkerService {
  private ephemeralWorkers = new Map<string, EphemeralWorker>();
  private readonly config: EphemeralWorkerServiceConfig;
  private readonly docker: Docker;
  private readonly dockerManager: DockerManager;
  private readonly githubPR: GitHubPRService;
  private readonly contextGenerator: ContextBundleGenerator;
  private readonly validatorRegistry: ValidatorRegistry;
  private readonly artifactExtractor: ArtifactExtractorService;
  private readonly phaseOrchestrator: PhaseOrchestratorService;
  private readonly recoveryAgent: RecoveryAgentService;
  private readonly containerLifecycle: ContainerLifecycleService; // Container management (extracted)
  private readonly workerLog: WorkerLogService; // Log management (extracted)
  private readonly contextDelivery: ContextDeliveryService; // Context delivery (extracted)
  private logStreams = new Map<string, fs.WriteStream>(); // TODO: Remove after full migration to WorkerLogService
  private readonly devBotsLogPath: string;

  constructor(
    docker: Docker,
    dockerManager: DockerManager,
    config: Partial<EphemeralWorkerServiceConfig> = {},
    db: Database.Database,  // Required - ensures consistent database connection
    contextGenerator?: ContextBundleGenerator  // Optional for DI/testing
  ) {
    this.docker = docker;
    this.githubPR = getGitHubPRService();
    this.dockerManager = dockerManager;
    this.contextGenerator = contextGenerator || new ContextBundleGenerator();
    this.validatorRegistry = new ValidatorRegistry();
    this.artifactExtractor = new ArtifactExtractorService();
    this.phaseOrchestrator = new PhaseOrchestratorService(db);  // Use injected database instance
    this.recoveryAgent = new RecoveryAgentService();
    this.containerLifecycle = new ContainerLifecycleService(docker); // Initialize container lifecycle service

    // Dev-bots consolidated log file for real-time monitoring
    const devBotsLogDir = path.join(process.cwd(), 'dev-bots', 'logs');
    this.devBotsLogPath = path.join(devBotsLogDir, 'dev-bots.log');
    
    // Initialize log service with consolidated log
    this.workerLog = new WorkerLogService({
      logsDirectory: devBotsLogDir,
      consolidatedLogPath: this.devBotsLogPath
    });

    // Initialize context delivery service
    this.contextDelivery = new ContextDeliveryService(docker, contextGenerator);

    // Merge provided config with defaults
    this.config = { ...DEFAULT_EPHEMERAL_WORKER_CONFIG, ...config };
  }

  /**
   * Ensure dev-bots log directory exists
   */
  // ==========================================================================
  // Worker Tracking & Limits
  // ==========================================================================

  /**
   * Get all active workers (not destroyed)
   */
  getActiveWorkers(): EphemeralWorker[] {
    return Array.from(this.ephemeralWorkers.values()).filter(
      worker => worker.status !== 'destroyed'
    );
  }

  /**
   * Get worker by ID
   */
  getWorker(workerId: string): EphemeralWorker | undefined {
    return this.ephemeralWorkers.get(workerId);
  }

  /**
   * Get all workers
   */
  getAllWorkers(): Map<string, EphemeralWorker> {
    return this.ephemeralWorkers;
  }

  /**
   * Clear all worker tracking (typically on system shutdown)
   */
  clearAllWorkers(): void {
    this.ephemeralWorkers.clear();
  }

  /**
   * Infer CLI type from agent personality ID (fallback logic)
   * Checks agent.id for common patterns to determine which CLI to use
   */
  private inferCliTypeFromAgent(agent: AgentPersonality): 'claude' | 'codex' | 'gemini' {
    const agentId = agent.id.toLowerCase();

    if (agentId.includes('gemini') || agentId.startsWith('gemini')) {
      return 'gemini';
    } else if (agentId.includes('codex') || agentId.startsWith('codex')) {
      return 'codex';
    } else {
      // Default to claude for all other agents
      return 'claude';
    }
  }

  /**
   * Check if we can create a new worker (under concurrency limit)
   */
  canCreateWorker(): boolean {
    return this.getActiveWorkers().length < this.config.maxConcurrentWorkers;
  }

  // ==========================================================================
  // Worker Creation & Initialization
  // ==========================================================================

  /**
   * Create a new ephemeral Docker container for a task
   * Uses imagineer-style approach: create container, copy workspace in, then start
   */
  async createWorker(
    task: Task,
    agent: AgentPersonality,
    agentCliType?: 'claude' | 'codex' | 'gemini'
  ): Promise<EphemeralWorker> {
    const activeWorkers = this.getActiveWorkers();

    if (activeWorkers.length >= this.config.maxConcurrentWorkers) {
      throw new Error('Maximum concurrent dev-bots are already active');
    }

    // Determine CLI tool to use (intelligent selection or fallback to agent.id)
    const cliType = agentCliType || this.inferCliTypeFromAgent(agent);

    // No git branch creation - work directly on staging
    const workspaceId = `${cliType}-${agent.id}-${task.id}-${Date.now()}`;
    const workerId = `bot-${cliType}-${agent.id}-${Date.now()}`;
    const containerName = `dev-bot-${workerId}`;

    logger.info({
      category: 'process',
      action: 'worker_cli_type_selected',
      message: `Using ${cliType} CLI for task ${task.id}`,
      details: {
        taskId: task.id,
        agentId: agent.id,
        cliType,
        intelligentSelection: !!agentCliType
      }
    });

    try {
      // Determine branch to work on - default to staging
      const baseBranch = 'staging';

      logger.info({
        category: 'process',
        action: 'base_branch_selected',
        message: `Task will work on branch: ${baseBranch}`,
        details: {
          taskId: task.id,
          branch: baseBranch
        }
      });

      // Container will clone fresh repository internally
      logger.info({
        category: 'process',
        action: 'container_isolation',
        message: `Container will clone fresh repo and checkout ${baseBranch} internally`,
        details: {
          taskId: task.id,
          baseBranch,
          note: 'Fixed: No longer switching branches in shared filesystem'
        }
      });

      // Prepare host-side resources
      const hostLogsDir = this.getHostLogsDir();
      if (!fs.existsSync(hostLogsDir)) {
        fs.mkdirSync(hostLogsDir, { recursive: true });
      }

      // Setup minimal binds - only for logs and credentials
      const binds: string[] = [
        `${hostLogsDir}:/app/logs:rw`
      ];

      // Mount work-target specific log directories for troubleshooting
      // Default to 'dev-bots' work target for all tasks
      const workTarget = 'dev-bots';
      const logPaths = getLogPaths(workTarget);
      for (const logPath of logPaths) {
        if (fs.existsSync(logPath.hostPath)) {
          binds.push(`${logPath.hostPath}:${logPath.containerPath}:${logPath.mode || 'ro'}`);
          logger.info({
            category: 'process',
            action: 'work_target_log_mounted',
            message: `Mounting ${logPath.description} for work target: ${workTarget}`,
            details: { hostPath: logPath.hostPath, containerPath: logPath.containerPath }
          });
        }
      }

      const homeDir = os.homedir();

      // Mount Claude credentials file to temp location (will be copied inside container)
      // Try both .credentials.json (newer) and credentials.json (older)
      const claudeCredentialsNew = path.join(homeDir, '.claude', '.credentials.json');
      const claudeCredentialsOld = path.join(homeDir, '.claude', 'credentials.json');
      const claudeCredentials = fs.existsSync(claudeCredentialsNew) ? claudeCredentialsNew : claudeCredentialsOld;

      if (fs.existsSync(claudeCredentials)) {
        // Mount to temp location - will be copied to .claude directory by shell command
        binds.push(`${claudeCredentials}:/tmp/host-creds.json:ro`);
        logger.info({
          category: 'process',
          action: 'claude_credentials_mounted',
          message: `Mounting Claude credentials from: ${claudeCredentials}`
        });
      } else {
        logger.warn({
          category: 'process',
          action: 'claude_credentials_not_found',
          message: 'Claude credentials file not found, container may not authenticate'
        });
      }

      const gitCredentials = path.join(homeDir, '.git-credentials');
      if (fs.existsSync(gitCredentials)) {
        binds.push(`${gitCredentials}:/home/worker/.git-credentials:ro`);
      }

      const sshDir = path.join(homeDir, '.ssh');
      if (fs.existsSync(sshDir)) {
        binds.push(`${sshDir}:/home/worker/.ssh:ro`);
      }

      // Mount GitHub CLI config for gh pr create
      const ghConfigDir = path.join(homeDir, '.config', 'gh');
      const ghConfigExists = fs.existsSync(ghConfigDir);
      
      if (ghConfigExists) {
        // Mount as read-write in case gh CLI needs to update state files
        binds.push(`${ghConfigDir}:/home/node/.config/gh:rw`);
        logger.info({
          category: 'process',
          action: 'gh_config_mounted',
          message: `Mounting GitHub CLI config from: ${ghConfigDir}`,
          details: {
            homeDir,
            ghConfigDir,
            hostsFile: fs.existsSync(path.join(ghConfigDir, 'hosts.yml')),
            configFile: fs.existsSync(path.join(ghConfigDir, 'config.yml')),
            mountBind: `${ghConfigDir}:/home/node/.config/gh:rw`,
            containerHome: '/home/node',  // This is set via HOME env var
            hasGithubToken: !!process.env.GITHUB_TOKEN,
            hasGhToken: !!process.env.GH_TOKEN
          }
        });
      } else {
        logger.error({
          category: 'process',
          action: 'gh_config_not_found',
          message: `GitHub CLI config not found at ${ghConfigDir}. PR creation will fail!`,
          details: {
            homeDir,
            ghConfigDir,
            expectedPath: path.join(homeDir, '.config', 'gh'),
            hint: 'Run: gh auth login'
          }
        });
      }

      // Validate GITHUB_TOKEN before creating container
      const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      if (!githubToken) {
        // If gh config exists, warn but proceed; otherwise fail
        if (!ghConfigExists) {
          logger.error({
            category: 'system',
            action: 'missing_github_token_and_config',
            message: 'GITHUB_TOKEN (or GH_TOKEN) is not set and GitHub CLI config not found. Authentication will fail.',
            details: {
              taskId: task.id,
              hasGithubToken: !!process.env.GITHUB_TOKEN,
              hasGhToken: !!process.env.GH_TOKEN,
              ghConfigDir
            }
          });
          throw new Error('Missing GITHUB_TOKEN (or GH_TOKEN) and GitHub CLI config directory. Cannot proceed with task execution.');
        } else {
          logger.warn({
            category: 'system',
            action: 'missing_github_token_but_config_present',
            message: 'GITHUB_TOKEN (or GH_TOKEN) is not set, but GitHub CLI config is present. Proceeding; authentication may succeed via config.',
            details: {
              taskId: task.id,
              hasGithubToken: !!process.env.GITHUB_TOKEN,
              hasGhToken: !!process.env.GH_TOKEN,
              ghConfigDir
            }
          });
        }
      }

      const envVars = [
        `AGENT_ID=${agent.id}`,
        `AGENT_NAME=${agent.name}`,
        `TASK_ID=${task.id}`,
        `WORKER_ID=${workerId}`,
        `WORKSPACE_BRANCH=${baseBranch}`,
        `WORKSPACE_ID=${workspaceId}`,
        `HOME=/home/node`,  // Explicitly set HOME for gh CLI to find config
        // Context management environment variables
        ...(task.context_bundle_id ? [`CONTEXT_BUNDLE_ID=${task.context_bundle_id}`] : []),
        ...(task.context_cache_key ? [`CONTEXT_CACHE_KEY=${task.context_cache_key}`] : []),
        ...(task.context_profiles ? [`CONTEXT_PROFILES=${JSON.stringify(task.context_profiles)}`] : []),
        ...(task.risk_level ? [`TASK_RISK_LEVEL=${task.risk_level}`] : [])
      ];
      
      // Only add GITHUB_TOKEN if it exists to avoid empty env var
      if (githubToken) {
        envVars.push(`GITHUB_TOKEN=${githubToken}`);
      }
      
      // Also add GH_TOKEN for gh CLI fallback authentication
      if (githubToken) {
        envVars.push(`GH_TOKEN=${githubToken}`);
      }

      for (const key of this.config.envPassthroughKeys) {
        const value = process.env[key];
        if (value && value.length > 0) {
          envVars.push(`${key}=${value}`);
        }
      }

      // Create and start container using ContainerLifecycleService
      const container = await this.containerLifecycle.createContainer({
        image: this.config.dockerImage,
        name: containerName,
        cmd: ['/bin/bash', '-c', 'tail -f /dev/null'],
        env: envVars,
        workingDir: `/workspace`,
        memory: CONTAINER_MEMORY_LIMIT_BYTES,
        cpuQuota: CONTAINER_CPU_QUOTA,
        autoRemove: true,
        binds: binds,
        tmpfs: {
          '/home/worker/.claude': WORKER_UID_GID,  // Writable temp for Claude CLI (matches node user)
          '/home/worker/.gemini': WORKER_UID_GID,  // Writable temp for Gemini CLI (matches node user)
          '/home/worker/.codex': WORKER_UID_GID    // Writable temp for Codex CLI (matches node user)
        },
        labels: {
          'claude.worker.id': workerId,
          'claude.agent.id': agent.id,
          'claude.task.id': task.id,
          'claude.workspace.id': workspaceId
        }
      });

      // Start the container
      await this.containerLifecycle.startContainer(container.id);

      // Wait for container to be fully running and healthy
      await this.containerLifecycle.waitForHealthy(container.id, {
        maxAttempts: 30,
        intervalMs: 100
      });

      // Clone fresh repository inside container for complete isolation
      await this.cloneFreshRepoInContainer(container.id, baseBranch);

      // Copy context bundle into container using ContextDeliveryService
      await this.contextDelivery.copyContextBundleToContainer(container.id, task);

      // Initialize worker log file using WorkerLogService
      await this.workerLog.initializeWorkerLogFile(workerId);

      const workspace: WorkspaceContext = {
        id: workspaceId,
        branchName: 'staging', // Always work on staging
        createdAt: new Date().toISOString()
      };

      const ephemeralWorker: EphemeralWorker = {
        id: workerId,
        containerId: container.id,
        agent,
        agentCliType: cliType,
        task,
        status: 'starting',
        createdAt: new Date().toISOString(),
        workspace
      };

      this.ephemeralWorkers.set(workerId, ephemeralWorker);

      logger.info({
        category: 'process',
        action: 'created_ephemeral_worker',
        message: `Created ephemeral worker ${workerId} with container ${container.id}`
      });

      return ephemeralWorker;

    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_create_ephemeral_worker',
        message: `Failed to create ephemeral worker ${workerId}:`,
        error: error
      });
      throw error;
    }
  }

  // copyWorkspaceToContainer method removed - using cloneFreshRepoInContainer instead

  /**
   * Execute Git command
   */
  private async execGitCommand(args: string[], cwd: string): Promise<string> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const git = spawn('git', args, { cwd });
      let stdout = '';
      let stderr = '';

      git.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      git.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      git.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Git command failed: ${args.join(' ')}\n${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      git.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Wait for container to be fully running and healthy before executing commands
   * Implements exponential backoff to avoid overwhelming the Docker daemon
   *
   * @param containerId Container ID to check
   * @param options Configuration for health check polling
   * @throws Error if container fails to become ready within max attempts
   */
  /**
   * Clone fresh repository inside container for complete isolation
   * Each bot gets its own independent copy of the repository
   */
  private async cloneFreshRepoInContainer(containerId: string, baseBranch: string): Promise<void> {
    logger.info({
      category: 'process',
      action: 'cloning_fresh_repo_in_container',
      message: `Cloning fresh repository in container ${containerId} on branch ${baseBranch}`
    });

    const container = this.docker.getContainer(containerId);

    // Use centralized repository clone script
    const setupScript = DockerConfig.getRepoCloneScript(baseBranch);

    try {
      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', setupScript],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: '/'
      });

      const stream = await exec.start({ Detach: false, Tty: false });

      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', () => {
          logger.info({
            category: 'process',
            action: 'repository_cloned',
            message: 'Repository successfully cloned in container',
            details: {
              containerId,
              baseBranch,
              output: output.substring(0, 1000) // Log first 1000 chars of output
            }
          });
          resolve();
        });
        stream.on('error', reject);
      });

    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_clone_repository',
        message: `Failed to clone repository in container ${containerId}`,
        error: error
      });
      throw error;
    }
  }

  /**
   * Copy context bundle into container using docker cp
   * Uses tar-fs to create tar stream from bundle directory
   */
  /**
   * Get host logs directory
   */
  private getHostLogsDir(): string {
    return path.resolve(this.config.logsDirectory);
  }

  // ==========================================================================
  // Task Execution
  // ==========================================================================

  /**
   * Execute task in ephemeral worker container
   */
  async executeTask(worker: EphemeralWorker): Promise<TaskExecutionResult> {
    let logStream: fs.WriteStream | null = null;

    try {
      worker.status = 'running';

      const container = this.docker.getContainer(worker.containerId);

      // Create log stream for real-time monitoring using WorkerLogService
      logStream = this.workerLog.createLogStream({
        id: worker.id,
        agentId: worker.agent.id,
        taskId: worker.task.id,
        taskTitle: worker.task.title
      });

      // Determine log file path per worker
      const sanitizedId = worker.id.replace(/[^a-zA-Z0-9-_]/g, '_');
      const logFile = `/app/logs/${sanitizedId}.log`;

      // Generate task execution command with logging
      const executionCommand = this.generateTaskExecutionCommandWithLogging(
        worker.task,
        worker.agent,
        worker.agentCliType,
        logFile
      );

      // Execute task in container
      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', executionCommand],
        AttachStdout: true,
        AttachStderr: true
      });

      const stream = await exec.start({
        Detach: false,
        Tty: false
      });

      let output = '';
      let errorOutput = '';

      stream.on('data', (data: Buffer) => {
        // Write raw data to log file for real-time monitoring
        if (logStream && !logStream.destroyed) {
          logStream.write(data);
        }

        // Parse Docker multiplexed stream format
        // Docker uses 8-byte header: [stream_type, 0, 0, 0, size (4 bytes big-endian)]
        let buffer = data;
        while (buffer.length > 0) {
          if (buffer.length < 8) {
            // Not enough data for header, treat remaining as plain text
            output += buffer.toString();
            break;
          }

          const streamType = buffer[0];
          const payloadLength = buffer.readUInt32BE(4);
          
          if (buffer.length < 8 + payloadLength) {
            // Incomplete payload, treat as plain text
            output += buffer.toString();
            break;
          }

          const payload = buffer.slice(8, 8 + payloadLength);
          const chunk = payload.toString();
          
          if (streamType === 1) {
            // stdout
            output += chunk;
          } else if (streamType === 2) {
            // stderr
            errorOutput += chunk;
          } else {
            // Unknown stream type, default to stdout
            output += chunk;
          }
          
          buffer = buffer.slice(8 + payloadLength);
        }
      });

      // Wait for execution to complete
      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      // Close log stream
      if (logStream && !logStream.destroyed) {
        logStream.end();
      }

      // Get exit code
      const inspect = await exec.inspect();
      const exitCode = inspect.ExitCode || 0;

      // Update worker status
      worker.status = exitCode === 0 ? 'completed' : 'failed';
      worker.completedAt = new Date().toISOString();

      return {
        success: exitCode === 0,
        output,
        errorOutput,
        exitCode
      };

    } catch (error) {
      // Close log stream on error
      if (logStream && !logStream.destroyed) {
        logStream.write(`\nERROR: ${error instanceof Error ? error.message : String(error)}\n`);
        logStream.end();
      }

      logger.error({
        category: 'process',
        action: 'task_execution_failed',
        message: `Task execution failed for worker ${worker.id}:`,
        error: error
      });

      worker.status = 'failed';
      worker.completedAt = new Date().toISOString();

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Complete phase execution with validation and recovery
   * This is the NEW phase-aware completion flow that:
   * 1. Extracts artifacts from container
   * 2. Extracts git branch name for context preservation
   * 3. Runs phase validation
   * 4. Handles recovery if validation fails
   * 5. Only destroys container after validation/recovery complete
   *
   * @param worker - Ephemeral worker
   * @param output - Task execution output
   * @param errorOutput - Task execution error output
   * @param exitCode - Task execution exit code
   * @returns Phase completion result (validation + git branch)
   */
  async completePhaseExecution(
    worker: EphemeralWorker,
    output: string,
    errorOutput: string,
    exitCode: number
  ): Promise<PhaseCompletionResult> {
    const task = worker.task;
    const containerId = worker.containerId;

    logger.info({
      category: 'phase',
      action: 'phase_completion_start',
      message: `Starting phase completion for task ${task.id}, phase ${task.phase_index}`,
      details: {
        taskId: task.id,
        phaseIndex: task.phase_index,
        phaseName: task.phase_name,
        exitCode,
      },
    });

    // Emit phase:started event
    const connManager = getConnectionManager();
    if (connManager) {
      connManager.broadcastToAll('phase:started', {
        taskId: task.id,
        phaseIndex: task.phase_index,
        phaseName: task.phase_name,
        attempt: task.phase_attempts,
      });
    }

    try {
      // Step 1: Extract artifacts from container BEFORE validation
      logger.info({
        category: 'phase',
        action: 'extracting_artifacts',
        message: `Extracting artifacts from container ${containerId}`,
      });

      const artifacts = await this.artifactExtractor.extractArtifacts({
        containerId,
        phaseIndex: task.phase_index,
        attempt: task.phase_attempts,
      });

      logger.info({
        category: 'phase',
        action: 'artifacts_extracted',
        message: `Artifacts extracted for task ${task.id}`,
        details: {
          artifactTypes: Object.keys(artifacts).filter(
            (k) => artifacts[k as keyof typeof artifacts] && !['stdout', 'stderr', 'exitCode'].includes(k)
          ),
        },
      });

      // Step 1.5: Extract git branch name for context preservation
      const gitBranch = await this.extractGitBranch(containerId);

      // Step 2: Run phase validation
      logger.info({
        category: 'phase',
        action: 'validating_phase',
        message: `Validating phase ${task.phase_index} for task ${task.id}`,
      });

      // Emit phase:validating event
      if (connManager) {
        connManager.broadcastToAll('phase:validating', {
          taskId: task.id,
          phaseIndex: task.phase_index,
        });
      }

      const validator = this.validatorRegistry.getValidator(task.phase_index);
      let validation = await validator.validate(task, artifacts);

      logger.info({
        category: 'phase',
        action: 'validation_complete',
        message: `Phase validation ${validation.passed ? 'PASSED' : 'FAILED'} for task ${task.id}`,
        details: {
          passed: validation.passed,
          errors: validation.errors,
          warnings: validation.warnings,
        },
      });

      // Emit phase:validation_failed or phase:validation_passed event
      if (connManager) {
        if (!validation.passed) {
          connManager.broadcastToAll('phase:validation_failed', {
            taskId: task.id,
            phaseIndex: task.phase_index,
            errors: validation.errors,
          });
        }
      }

      // Step 3: Record stage run in database
      const stageRunId = this.phaseOrchestrator.recordStageRun({
        task_id: task.id,
        phase_index: task.phase_index,
        phase_name: task.phase_name,
        attempt: task.phase_attempts,
        status: validation.passed ? 'success' : 'failed',
        artifacts_blob: validation.artifacts ? JSON.stringify(validation.artifacts) : undefined,
        created_at: Date.now(),
        completed_at: Date.now(),
        exit_code: exitCode,
      });

      logger.info({
        category: 'phase',
        action: 'stage_run_recorded',
        message: `Recorded stage run ${stageRunId} for task ${task.id}`,
        details: {
          stageRunId,
          taskId: task.id,
          phaseIndex: task.phase_index,
          status: validation.passed ? 'success' : 'failed',
        },
      });

      // Step 4: Handle validation failure with recovery
      if (!validation.passed) {
        logger.warn({
          category: 'phase',
          action: 'validation_failed',
          message: `Phase ${task.phase_index} validation failed, initiating recovery`,
          details: {
            taskId: task.id,
            phaseIndex: task.phase_index,
            errors: validation.errors,
          },
        });

        // Emit phase:recovering event
        if (connManager) {
          connManager.broadcastToAll('phase:recovering', {
            taskId: task.id,
            phaseIndex: task.phase_index,
          });
        }

        // Run recovery agent in same container
        const recoveryResult = await this.recoveryAgent.executeRecovery(
          task,
          containerId,
          validation,
          task.phase_attempts
        );

        logger.info({
          category: 'phase',
          action: 'recovery_complete',
          message: `Recovery ${recoveryResult.success ? 'succeeded' : 'failed'} for task ${task.id}`,
          details: {
            category: recoveryResult.category,
            shouldRetry: recoveryResult.shouldRetry,
            contextUpdated: recoveryResult.contextUpdated,
            isSystemBlocked: recoveryResult.isSystemBlocked,
          },
        });

        // Enrich validation result with recovery information
        // Add recovery info to validation result (immutably)
        validation = {
          ...validation,
          recovery: {
            attempted: true,
            success: recoveryResult.success,
            category: recoveryResult.category,
            diagnosis: recoveryResult.diagnosis,
          },
        };

        // Update stage run with recovery diagnosis
        this.phaseOrchestrator.updateStageRunWithRecovery(
          stageRunId,
          JSON.stringify(recoveryResult),
          recoveryResult.success ? 'success' : 'failed'
        );
      }

      // Step 5: Advance phase if validation passed
      if (validation.passed) {
        const transition = this.phaseOrchestrator.advancePhase(task, validation);
        
        logger.info({
          category: 'phase',
          action: 'phase_advanced',
          message: `Task ${task.id} advanced from phase ${transition.fromPhase} to ${transition.toPhase}`,
          details: {
            taskId: task.id,
            fromPhase: transition.fromPhase,
            toPhase: transition.toPhase,
            reason: transition.reason,
          },
        });

        // Emit phase:completed event
        if (connManager) {
          connManager.broadcastToAll('phase:completed', {
            taskId: task.id,
            phaseIndex: transition.fromPhase,
            nextPhase: transition.toPhase,
            reason: transition.reason,
          });
        }
      }

      // Return validation result with git branch for persistence by orchestration layer
      return {
        ...validation,
        gitBranch
      };

    } catch (error) {
      logger.error({
        category: 'phase',
        action: 'phase_completion_error',
        message: `Error during phase completion for task ${task.id}`,
        error,
      });

      // Return failed validation on error (no git branch on error path)
      return {
        passed: false,
        errors: [
          `Phase completion error: ${error instanceof Error ? error.message : String(error)}`
        ],
      };
    }
  }

  /**
   * Extract git branch name from container.
   * This is a lightweight operation that only extracts the branch NAME (not content).
   *
   * @param containerId - Docker container ID
   * @returns Branch name or undefined if extraction fails
   * @private
   */
  private async extractGitBranch(containerId: string): Promise<string | undefined> {
    try {
      const Docker = (await import('dockerode')).default;
      const docker = new Docker();
      const container = docker.getContainer(containerId);

      const branchExec = await container.exec({
        Cmd: ['git', 'branch', '--show-current'],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: '/workspace'
      });

      const branchStream = await branchExec.start({ hijack: true, stdin: false });

      let branchOutput = '';
      await new Promise<void>((resolve) => {
        branchStream.on('data', (chunk: Buffer) => {
          branchOutput += chunk.toString();
        });
        branchStream.on('end', () => resolve());
      });

      // Parse git output (strip Docker stream headers and whitespace)
      const gitBranch = branchOutput.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();

      if (gitBranch) {
        logger.debug({
          category: 'phase',
          action: 'git_branch_extracted',
          message: `Extracted git branch "${gitBranch}" from container`,
          details: { containerId, gitBranch }
        });
        return gitBranch;
      }

      return undefined;
    } catch (error) {
      logger.warn({
        category: 'phase',
        action: 'git_branch_extraction_failed',
        message: `Failed to extract git branch: ${error instanceof Error ? error.message : String(error)}`,
        details: { containerId, error }
      });
      return undefined;
    }
  }

  /**
   * Generate task execution command with worker-specific logging
   *
   * Note: Model versions are determined by CLI defaults, not explicitly specified:
   * - claude CLI → claude-3-5-sonnet-20241022 (default)
   * - codex CLI → gpt-5.1-codex (default)
   * - gemini CLI → Gemini 2.5 Pro (default)
   *
   * This ensures automatic updates when CLI packages are upgraded.
   */
  private generateTaskExecutionCommandWithLogging(
    task: Task,
    agent: AgentPersonality,
    cliType: 'claude' | 'codex' | 'gemini',
    logFile: string
  ): string {
    // Escape the prompt for shell execution (single quotes to preserve special chars)
    const escapedPrompt = (task.prompt || task.description || task.title)
      .replace(/'/g, "'\\''");  // Escape single quotes for shell

    let agentCommand: string;
    if (cliType === 'gemini') {
      // Gemini does not support working directory flag (no --cd or --workingDirectory)
      agentCommand = `gemini --print --dangerously-skip-permissions --output-format json '${escapedPrompt}' 2>&1 | tee -a ` + logFile;
    } else if (cliType === 'codex') {
      // Codex uses 'exec' subcommand for non-interactive mode (not --print)
      // Uses --cd for working directory (not --workingDirectory)
      // Uses --dangerously-bypass-approvals-and-sandbox (codex exec does NOT support --ask-for-approval)
      // Note: codex exec does NOT support --output-format flag as of v5.1 - outputs text by default
      // See cliFlags.ts line 113 and Codex CLI documentation for details
      agentCommand = `codex exec --cd /workspace --dangerously-bypass-approvals-and-sandbox '${escapedPrompt}' 2>&1 | tee -a ` + logFile;
    } else {
      // Claude does not support working directory flag (no --cd or --workingDirectory)
      agentCommand = `claude --print --dangerously-skip-permissions --output-format json '${escapedPrompt}' 2>&1 | tee -a ` + logFile;
    }

    // Create a wrapper command that logs to the worker-specific file
    // Following imagineer's pattern: copy credentials then run agent CLI
    // Set up credentials based on CLI type
    let credentialSetup: string[];
    if (cliType === 'gemini') {
      credentialSetup = [
        'cp /tmp/host-creds.json /home/worker/.gemini/.credentials.json',
        'echo "Gemini credentials: $(test -f ~/.gemini/.credentials.json && echo found || echo missing)" >> ' + logFile
      ];
    } else if (cliType === 'codex') {
      credentialSetup = [
        'cp /tmp/host-creds.json /home/worker/.codex/.credentials.json',
        'echo "Codex credentials: $(test -f ~/.codex/.credentials.json && echo found || echo missing)" >> ' + logFile
      ];
    } else {
      credentialSetup = [
        'cp /tmp/host-creds.json /home/worker/.claude/.credentials.json',
        'echo "Claude credentials: $(test -f ~/.claude/.credentials.json && echo found || echo missing)" >> ' + logFile
      ];
    }

    const wrapperCommand = [
      'echo "=== Worker Task Execution Started ===" >> ' + logFile,
      'echo "Timestamp: $(date)" >> ' + logFile,
      'echo "Worker: ' + agent.name + '" >> ' + logFile,
      'echo "Task: ' + task.title + '" >> ' + logFile,
      'echo "=====================================" >> ' + logFile,
      // Copy credentials from temp mount to appropriate agent directory
      ...credentialSetup,
      // Run agent CLI with JSON output (imagineer pattern)
      agentCommand,
      'AGENT_EXIT=$?',
      'echo "=== Worker Task Execution Completed ===" >> ' + logFile,
      'echo "Exit Code: $AGENT_EXIT" >> ' + logFile,
      'echo "=======================================" >> ' + logFile,
      'exit $AGENT_EXIT'
    ].join(' && ');

    logger.info({
      category: 'process',
      action: 'generated_task_execution_command',
      message: `Generated task execution command with logging: ${wrapperCommand.substring(0, 100)}...`
    });

    return wrapperCommand;
  }

  // ==========================================================================
  // Worker Cleanup & Destruction
  // ==========================================================================

  /**
   * Destroy ephemeral worker container
   */
  async destroyWorker(workerId: string): Promise<void> {
    const worker = this.ephemeralWorkers.get(workerId);
    if (!worker) return;

    try {
      // Get container logs before destruction for debugging
      try {
        const logs = await this.dockerManager.getContainerLogs(worker.containerId, 50);
        if (logs) {
          logger.info({
            category: 'process',
            action: 'container_logs_retrieved',
            message: `Container ${worker.containerId} logs (last 50 lines):\n${logs}`
          });
        }
      } catch (logError) {
        logger.warn({
          category: 'process',
          action: 'could_not_retrieve_logs',
          message: `Could not retrieve logs for container ${worker.containerId}:`,
          details: { logError }
        });
      }

      // Stop and remove container using ContainerLifecycleService
      await this.containerLifecycle.stopContainer(worker.containerId, 10);
      await this.containerLifecycle.removeContainer(worker.containerId, true);

      worker.status = 'destroyed';
      worker.destroyedAt = new Date().toISOString();

      // Close log stream if it exists using WorkerLogService
      await this.workerLog.closeLogStream(workerId);

      // Remove from ephemeral workers map
      this.ephemeralWorkers.delete(workerId);

      logger.info({
        category: 'process',
        action: 'destroyed_ephemeral_worker',
        message: `Destroyed ephemeral worker ${workerId} and cleaned up resources`
      });

    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_destroy_ephemeral_worker',
        message: `Failed to destroy ephemeral worker ${workerId}:`,
        error: error
      });
      throw error;
    }

    // Note: No workspace cleanup needed - workspace is inside the Docker container
    // which is automatically removed via AutoRemove: true in container config
  }

  /**
   * Destroy all workers (typically on system shutdown)
   */
  async destroyAllWorkers(): Promise<void> {
    const workerIds = Array.from(this.ephemeralWorkers.keys());

    for (const workerId of workerIds) {
      try {
        await this.destroyWorker(workerId);
      } catch (error) {
        logger.error({
          category: 'process',
          action: 'failed_to_destroy_worker_on_shutdown',
          message: `Failed to destroy worker ${workerId} during shutdown:`,
          error: error
        });
      }
    }

    this.ephemeralWorkers.clear();
  }

  /**
   * Cleanup stuck task containers by task ID
   */
  async cleanupStuckTaskContainers(taskId: string): Promise<void> {
    try {
      const docker = this.docker;

      // List all containers (including stopped) with this task ID in name
      const containers = await docker.listContainers({ all: true });
      const taskContainers = containers.filter(c =>
        c.Names.some(name => name.includes(taskId))
      );

      for (const containerInfo of taskContainers) {
        try {
          // Remove container using ContainerLifecycleService
          await this.containerLifecycle.removeContainer(containerInfo.Id, true);

          logger.info({
            category: 'process',
            action: 'stuck_container_removed',
            message: `Removed container ${containerInfo.Id.substring(0, 12)} for task ${taskId}`
          });

        } catch (error) {
          logger.error({
            category: 'process',
            action: 'container_cleanup_error',
            message: `Error cleaning up container ${containerInfo.Id.substring(0, 12)}: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }

    } catch (error) {
      logger.error({
        category: 'process',
        action: 'container_list_error',
        message: `Failed to list containers for cleanup: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  // populateWorkspaceFromRepo removed - using cloneFreshRepoInContainer directly

  /**
   * Shutdown service and cleanup all resources
   * Called on process termination to ensure no resource leaks
   */
  async shutdown(): Promise<void> {
    logger.info({
      category: 'process',
      action: 'ephemeral_worker_service_shutdown',
      message: `Shutting down EphemeralWorkerService (${this.workerLog.getActiveStreamCount()} log streams, ${this.ephemeralWorkers.size} workers)`
    });

    // Shutdown WorkerLogService (closes all streams)
    await this.workerLog.shutdown();

    // Destroy all remaining workers
    const workerDestroyPromises: Promise<void>[] = [];
    for (const [workerId] of this.ephemeralWorkers.entries()) {
      workerDestroyPromises.push(
        this.destroyWorker(workerId).catch(error => {
          logger.error({
            category: 'process',
            action: 'worker_cleanup_failed',
            message: `Failed to destroy worker ${workerId} during shutdown`,
            error: { message: error.message }
          });
        })
      );
    }

    await Promise.all(workerDestroyPromises);

    logger.info({
      category: 'process',
      action: 'ephemeral_worker_service_shutdown_complete',
      message: 'EphemeralWorkerService shutdown complete'
    });
  }
}
