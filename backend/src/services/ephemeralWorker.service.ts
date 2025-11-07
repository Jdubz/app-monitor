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
import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import type { AgentPersonality } from './agentPersonalities.js';
import type { DockerManager } from './dockerManager.js';
import type { WorkspaceOrchestrator, WorkspaceContext } from './workspaceOrchestrator.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface EphemeralWorker {
  id: string;
  containerId: string;
  agent: AgentPersonality;
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
  private readonly workspaceOrchestrator: WorkspaceOrchestrator;

  constructor(
    docker: Docker,
    dockerManager: DockerManager,
    workspaceOrchestrator: WorkspaceOrchestrator,
    config: Partial<EphemeralWorkerServiceConfig> = {}
  ) {
    this.docker = docker;
    this.dockerManager = dockerManager;
    this.workspaceOrchestrator = workspaceOrchestrator;

    this.config = {
      maxConcurrentWorkers: config.maxConcurrentWorkers ?? 2,
      dockerImage: config.dockerImage ?? 'claude-worker:latest',
      logsDirectory: config.logsDirectory ?? './data/logs',
      envPassthroughKeys: config.envPassthroughKeys ?? [
        'ANTHROPIC_API_KEY',
        'CLAUDE_API_KEY',
        'OPENAI_API_KEY',
        'GITHUB_TOKEN',
        'GIT_AUTHOR_NAME',
        'GIT_AUTHOR_EMAIL',
        'GIT_COMMITTER_NAME',
        'GIT_COMMITTER_EMAIL'
      ]
    };
  }

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
  async createWorker(task: Task, agent: AgentPersonality): Promise<EphemeralWorker> {
    const activeWorkers = this.getActiveWorkers();

    if (activeWorkers.length >= this.config.maxConcurrentWorkers) {
      throw new Error('Maximum concurrent dev-bots are already active');
    }

    // No git branch creation - work directly on staging
    const workspaceId = `${agent.id}-${task.id}-${Date.now()}`;
    const workerId = `bot-${agent.id}-${Date.now()}`;
    const containerName = `dev-bot-${workerId}`;

    try {
      // Ensure we're on staging branch (no new branch creation)
      const repoRoot = process.cwd();
      const baseBranch = 'staging';  // Always work from staging branch
      await this.execGitCommand(['checkout', baseBranch], repoRoot);
      await this.execGitCommand(['pull', 'origin', baseBranch], repoRoot);

      // Prepare host-side resources
      const hostLogsDir = this.getHostLogsDir();
      if (!fs.existsSync(hostLogsDir)) {
        fs.mkdirSync(hostLogsDir, { recursive: true });
      }

      // Setup minimal binds - only for logs and credentials
      const binds: string[] = [
        `${hostLogsDir}:/app/logs:rw`
      ];

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

      const envVars = [
        `AGENT_ID=${agent.id}`,
        `AGENT_NAME=${agent.name}`,
        `TASK_ID=${task.id}`,
        `WORKER_ID=${workerId}`,
        `WORKSPACE_BRANCH=staging`,
        `WORKSPACE_ID=${workspaceId}`
      ];

      for (const key of this.config.envPassthroughKeys) {
        const value = process.env[key];
        if (value && value.length > 0) {
          envVars.push(`${key}=${value}`);
        }
      }

      // Create container (not started yet)
      const container = await this.docker.createContainer({
        Image: this.config.dockerImage,
        name: containerName,
        Cmd: ['/bin/bash', '-c', 'tail -f /dev/null'],
        Env: envVars,
        WorkingDir: `/workspace`,
        HostConfig: {
          Memory: 512 * 1024 * 1024,
          CpuQuota: 50000,
          AutoRemove: true,
          Binds: binds,
          Tmpfs: {
            '/home/worker/.claude': 'uid=1001,gid=1001'  // Writable temp for Claude CLI
          }
        },
        Labels: {
          'claude.worker.id': workerId,
          'claude.agent.id': agent.id,
          'claude.task.id': task.id,
          'claude.workspace.id': workspaceId
        }
      });

      // Start the container FIRST so we can exec commands
      await container.start();

      // Wait for container to be fully running before exec commands
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Copy workspace INTO container using tar (container must be running for chown)
      await this.copyWorkspaceToContainer(container.id, repoRoot);

      await this.initializeWorkerLogFile(workerId);

      const workspace = {
        id: workspaceId,
        hostPath: '', // No host path - workspace is inside container only
        branchName: 'staging', // Always work on staging
        mirrorPath: '', // No mirror
        createdAt: new Date().toISOString()
      };

      const ephemeralWorker: EphemeralWorker = {
        id: workerId,
        containerId: container.id,
        agent,
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

  /**
   * Copy workspace directory into container using tar pipe
   * Mimics imagineer's approach for efficient workspace copying
   */
  private async copyWorkspaceToContainer(containerId: string, repoRoot: string): Promise<void> {
    const { spawn } = await import('child_process');
    logger.info({
      category: 'process',
      action: 'copying_workspace_to_container',
      message: `Copying workspace from ${repoRoot} into container ${containerId}`
    });

    // Create /workspace directory in container first
    try {
      logger.info({
        category: 'process',
        action: 'creating_workspace_directory',
        message: `Creating /workspace directory in container ${containerId}`
      });

      const container = this.docker.getContainer(containerId);
      const createDirExec = await container.exec({
        Cmd: ['/bin/bash', '-c', 'mkdir -p /workspace && chown -R worker:worker /workspace'],
        AttachStdout: true,
        AttachStderr: true
      });

      const createDirStream = await createDirExec.start({ Detach: false, Tty: false });
      await new Promise((resolve, reject) => {
        createDirStream.on('end', resolve);
        createDirStream.on('error', reject);
      });
    } catch (mkdirError) {
      logger.error({
        category: 'process',
        action: 'failed_to_create_workspace_directory',
        message: `Failed to create workspace directory in container ${containerId}:`,
        error: mkdirError
      });
      throw mkdirError;
    }

    return new Promise((resolve, reject) => {
      // Create tar archive of workspace excluding node_modules, .git, etc.
      const tar = spawn('tar', [
        '-czf', '-', // Create gzip tar to stdout
        '--exclude=node_modules',
        '--exclude=.git',
        '--exclude=dist',
        '--exclude=build',
        '--exclude=coverage',
        '--exclude=.next',
        '--exclude=.cache',
        '-C', repoRoot,  // Change to repo root
        '.'              // Archive everything in current directory
      ]);

      // Pipe tar output directly to Docker container /workspace
      const dockerCp = spawn('docker', [
        'cp', '-', `${containerId}:/workspace`
      ]);

      tar.stdout.pipe(dockerCp.stdin);

      let tarError = '';
      let dockerError = '';

      tar.stderr.on('data', (data) => {
        tarError += data.toString();
      });

      dockerCp.stderr.on('data', (data) => {
        dockerError += data.toString();
      });

      tar.on('error', (error) => {
        logger.error({
          category: 'process',
          action: 'tar_process_error',
          message: `Tar process error: ${error.message}`
        });
        reject(error);
      });

      dockerCp.on('error', (error) => {
        logger.error({
          category: 'process',
          action: 'docker_cp_process_error',
          message: `Docker cp process error: ${error.message}`
        });
        reject(error);
      });

      dockerCp.on('close', (code) => {
        if (code !== 0) {
          const errorMsg = `Docker cp failed with code ${code}. Tar errors: ${tarError}. Docker errors: ${dockerError}`;
          logger.error({
            category: 'process',
            action: 'docker_cp_failed',
            message: errorMsg
          });
          reject(new Error(errorMsg));
        } else {
          logger.info({
            category: 'process',
            action: 'workspace_copied_successfully',
            message: `Workspace copied to container ${containerId} successfully`
          });
          resolve();
        }
      });
    });
  }

  /**
   * Initialize worker-specific log file
   */
  private async initializeWorkerLogFile(workerId: string): Promise<void> {
    try {
      const sanitizedId = workerId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const logDir = this.getHostLogsDir();
      const logFilePath = path.join(logDir, `${sanitizedId}.log`);

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const timestamp = new Date().toISOString();
      const header = `=== Dev-Bot Worker Log ===\nWorker ID: ${workerId}\nInitialized: ${timestamp}\n===========================\n\n`;

      fs.writeFileSync(logFilePath, header, 'utf8');

      logger.info({
        category: 'process',
        action: 'initialized_worker_log_file',
        message: `Initialized log file for worker ${workerId} at ${logFilePath}`
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_initialize_worker_log_file',
        message: `Failed to initialize log file for worker ${workerId}:`,
        error: error
      });
    }
  }

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
    try {
      worker.status = 'running';

      const container = this.docker.getContainer(worker.containerId);

      // Determine log file path per worker
      const sanitizedId = worker.id.replace(/[^a-zA-Z0-9-_]/g, '_');
      const logFile = `/app/logs/${sanitizedId}.log`;

      // Generate task execution command with logging
      const executionCommand = this.generateTaskExecutionCommandWithLogging(worker.task, worker.agent, logFile);

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
        const chunk = data.toString();
        if (chunk.startsWith('1:')) {
          output += chunk.substring(2);
        } else if (chunk.startsWith('2:')) {
          errorOutput += chunk.substring(2);
        }
      });

      // Wait for execution to complete
      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

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
   * Generate task execution command with worker-specific logging
   * Uses imagineer's pattern: copy credentials from temp mount, then run Claude
   */
  private generateTaskExecutionCommandWithLogging(task: Task, agent: AgentPersonality, logFile: string): string {
    // Escape the prompt for shell execution (single quotes to preserve special chars)
    const escapedPrompt = (task.prompt || task.description || task.title)
      .replace(/'/g, "'\\''");  // Escape single quotes for shell

    // Create a wrapper command that logs to the worker-specific file
    // Following imagineer's pattern: copy credentials then run Claude
    const wrapperCommand = [
      'echo "=== Worker Task Execution Started ===" >> ' + logFile,
      'echo "Timestamp: $(date)" >> ' + logFile,
      'echo "Worker: ' + agent.name + '" >> ' + logFile,
      'echo "Task: ' + task.title + '" >> ' + logFile,
      'echo "=====================================" >> ' + logFile,
      // Copy credentials from temp mount to .claude directory (imagineer pattern)
      'cp /tmp/host-creds.json /home/worker/.claude/.credentials.json',
      'echo "Claude credentials: $(test -f ~/.claude/.credentials.json && echo found || echo missing)" >> ' + logFile,
      // Run Claude with JSON output (imagineer pattern)
      `claude --print --dangerously-skip-permissions --output-format json --workingDirectory /workspace '${escapedPrompt}' 2>&1 | tee -a ` + logFile,
      'CLAUDE_EXIT=$?',
      'echo "=== Worker Task Execution Completed ===" >> ' + logFile,
      'echo "Exit Code: $CLAUDE_EXIT" >> ' + logFile,
      'echo "=======================================" >> ' + logFile,
      'exit $CLAUDE_EXIT'
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
      const container = this.docker.getContainer(worker.containerId);

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

      // Stop container if running
      try {
        await container.stop({ t: 10 }); // 10 second grace period
      } catch (error) {
        // Container might already be stopped
        logger.warn({
          category: 'process',
          action: 'container_already_stopped',
          message: `Container ${worker.containerId} already stopped or error stopping:`,
          details: { error }
        });
      }

      // Remove container (includes volumes with AutoRemove: true)
      await container.remove({ v: true, force: true });

      worker.status = 'destroyed';
      worker.destroyedAt = new Date().toISOString();

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

    // Cleanup workspace
    try {
      await this.workspaceOrchestrator.cleanupWorkspace(worker.workspace);
    } catch (cleanupError) {
      logger.warn({
        category: 'process',
        action: 'workspace_cleanup_failed',
        message: `Workspace cleanup failed for worker ${workerId}`,
        error: cleanupError
      });
    }
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
          const container = docker.getContainer(containerInfo.Id);

          // Force kill if running
          if (containerInfo.State === 'running') {
            logger.info({
              category: 'process',
              action: 'force_killing_stuck_container',
              message: `Force killing container ${containerInfo.Id.substring(0, 12)} for stuck task ${taskId}`
            });
            await container.kill();
          }

          // Remove container
          await container.remove({ force: true });

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
}
