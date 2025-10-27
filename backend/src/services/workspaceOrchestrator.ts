import { EventEmitter } from 'events';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

function findNearestGitRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (!fs.existsSync(path.join(current, '.git'))) {
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate git repository root from ${startDir}`);
    }
    current = parent;
  }

  return current;
}

export interface WorkspaceOrchestratorConfig {
  repoRoot?: string;
  branch?: string;
  devBotsRoot?: string;
  mirrorPath?: string;
  workspaceRoot?: string;
  artifactsRoot?: string;
  gitUserName?: string;
  gitUserEmail?: string;
}

export interface WorkspaceContext {
  id: string;
  hostPath: string;
  branchName: string;
  mirrorPath: string;
  createdAt: string;
}

export interface WorkspaceSealOptions {
  taskId: string;
  taskTitle: string;
  pushCoordinator: PushCoordinator;
}

export interface WorkspaceSealResult {
  status: 'success' | 'noop' | 'conflict' | 'error';
  commitSha?: string;
  branchName: string;
  patchPath?: string;
  message?: string;
}

export class PushCoordinator {
  private queue: Promise<void> = Promise.resolve();

  enqueue<T>(handler: () => Promise<T>): Promise<T> {
    const task = this.queue.then(handler, handler);
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }
}

export class WorkspaceOrchestrator extends EventEmitter {
  private readonly repoRoot: string;
  private readonly branch: string;
  private readonly mirrorPath: string;
  private readonly workspaceRoot: string;
  private readonly artifactsRoot: string;
  private readonly gitUserName: string;
  private readonly gitUserEmail: string;
  private remoteUrl?: string;

  constructor(config: WorkspaceOrchestratorConfig = {}) {
    super();

    this.repoRoot = config.repoRoot
      ? path.resolve(config.repoRoot)
      : findNearestGitRoot(process.cwd());
    this.branch = config.branch || 'staging';
    const devBotsRoot = config.devBotsRoot || path.resolve(process.cwd(), '../dev-bots');
    this.mirrorPath = config.mirrorPath || path.join(devBotsRoot, 'mirror');
    this.workspaceRoot = config.workspaceRoot || path.join(devBotsRoot, 'workspaces');
    this.artifactsRoot = config.artifactsRoot || path.join(devBotsRoot, 'artifacts');
    this.gitUserName = config.gitUserName || 'DevBot';
    this.gitUserEmail = config.gitUserEmail || 'devbot@local';
  }

  initialize(): void {
    this.ensureDirectory(this.workspaceRoot);
    this.ensureDirectory(this.artifactsRoot);
    this.ensureMirror();
  }

  createWorkspace(taskId: string, agentId: string): WorkspaceContext {
    this.ensureMirror();

    const workspaceId = `${agentId}-${taskId}-${Date.now()}`;
    const hostPath = path.join(this.workspaceRoot, workspaceId);

    this.ensureDirectory(this.workspaceRoot);

    const cloneSource = this.mirrorPath;
    const branchName = `bots/${taskId}-${Date.now()}`;

    execFileSync(
      'git',
      ['clone', '--quiet', '--local', '--branch', this.branch, cloneSource, hostPath],
      { stdio: 'inherit' }
    );

    this.configureRepository(hostPath);
    execFileSync('git', ['checkout', '-B', branchName], { cwd: hostPath, stdio: 'inherit' });

    const context: WorkspaceContext = {
      id: workspaceId,
      hostPath,
      branchName,
      mirrorPath: this.mirrorPath,
      createdAt: new Date().toISOString()
    };

    logger.info({
      category: 'workspace',
      action: 'workspace_created',
      message: `Workspace ${workspaceId} created for task ${taskId}`,
      details: { hostPath, branchName }
    });

    this.emit('workspace_created', context);

    return context;
  }

  async sealWorkspace(
    context: WorkspaceContext,
    options: WorkspaceSealOptions
  ): Promise<WorkspaceSealResult> {
    const gitStatus = execFileSync('git', ['status', '--porcelain'], { cwd: context.hostPath })
      .toString()
      .trim();

    if (!gitStatus) {
      logger.info({
        category: 'workspace',
        action: 'workspace_no_changes',
        message: `No changes detected for workspace ${context.id}`
      });
      return { status: 'noop', branchName: context.branchName };
    }

    this.ensureGitIdentity(context.hostPath);
    execFileSync('git', ['add', '-A'], { cwd: context.hostPath, stdio: 'inherit' });

    const sanitizedTitle = options.taskTitle.replace(/[\r\n]+/g, ' ').slice(0, 120);
    const commitMessage = `bot: ${sanitizedTitle} (${options.taskId})`;

    execFileSync('git', ['commit', '-m', commitMessage], {
      cwd: context.hostPath,
      stdio: 'inherit'
    });

    return options.pushCoordinator.enqueue(async () => {
      try {
        execFileSync('git', ['fetch', 'origin', this.branch], {
          cwd: context.hostPath,
          stdio: 'inherit'
        });
        execFileSync('git', ['rebase', `origin/${this.branch}`], {
          cwd: context.hostPath,
          stdio: 'inherit'
        });
      } catch (error) {
        try {
          execFileSync('git', ['rebase', '--abort'], {
            cwd: context.hostPath,
            stdio: 'ignore'
          });
        } catch (abortError) {
          logger.warn({
            category: 'workspace',
            action: 'workspace_rebase_abort_failed',
            message: 'Failed to abort rebase after conflict',
            error: abortError
          });
        }

        const patchPath = this.createPatchArtifact(context);
        logger.error({
          category: 'workspace',
          action: 'workspace_rebase_conflict',
          message: `Rebase conflict for workspace ${context.id}`,
          error,
          details: { patchPath }
        });

        return {
          status: 'conflict',
          branchName: context.branchName,
          patchPath,
          message: 'Rebase conflict while preparing push to staging'
        };
      }

      try {
        execFileSync('git', ['push', 'origin', `HEAD:${this.branch}`], {
          cwd: context.hostPath,
          stdio: 'inherit'
        });

        const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: context.hostPath
        })
          .toString()
          .trim();

        logger.info({
          category: 'workspace',
          action: 'workspace_pushed',
          message: `Workspace ${context.id} pushed to ${this.branch}`,
          details: { commitSha }
        });

        this.emit('workspace_pushed', { context, commitSha });

        return {
          status: 'success',
          branchName: context.branchName,
          commitSha
        };
      } catch (error) {
        const patchPath = this.createPatchArtifact(context);
        logger.error({
          category: 'workspace',
          action: 'workspace_push_failed',
          message: `Failed to push workspace ${context.id}`,
          error,
          details: { patchPath }
        });

        return {
          status: 'error',
          branchName: context.branchName,
          patchPath,
          message: error instanceof Error ? error.message : String(error)
        };
      }
    });
  }

  cleanupWorkspace(context: WorkspaceContext): void {
    try {
      if (fs.existsSync(context.hostPath)) {
        fs.rmSync(context.hostPath, { recursive: true, force: true });
      }
      this.emit('workspace_cleaned', context);
    } catch (error) {
      logger.warn({
        category: 'workspace',
        action: 'workspace_cleanup_failed',
        message: `Failed to clean workspace ${context.id}`,
        error
      });
    }
  }

  private ensureMirror(): void {
    if (!fs.existsSync(this.mirrorPath)) {
      this.ensureDirectory(path.dirname(this.mirrorPath));
      const cloneArgs = ['clone', '--quiet', '--branch', this.branch, this.repoRoot, this.mirrorPath];

      try {
        execFileSync('git', cloneArgs, { stdio: 'inherit' });
      } catch (error) {
        if (fs.existsSync(this.mirrorPath)) {
          logger.warn({
            category: 'workspace',
            action: 'mirror_clone_race',
            message: 'Mirror clone race detected; using existing mirror',
            error
          });
        } else {
          logger.warn({
            category: 'workspace',
            action: 'mirror_clone_retry_remote',
            message: 'Local mirror clone failed; falling back to remote clone',
            error
          });
          execFileSync(
            'git',
            ['clone', '--quiet', '--branch', this.branch, this.getRemoteUrl(), this.mirrorPath],
            { stdio: 'inherit' }
          );
        }
      }

      this.configureRepository(this.mirrorPath);
      logger.info({
        category: 'workspace',
        action: 'mirror_created',
        message: `Mirror created at ${this.mirrorPath}`
      });
      return;
    }

    execFileSync('git', ['fetch', 'origin'], { cwd: this.mirrorPath, stdio: 'inherit' });
    execFileSync('git', ['checkout', this.branch], { cwd: this.mirrorPath, stdio: 'inherit' });
    execFileSync('git', ['reset', '--hard', `origin/${this.branch}`], {
      cwd: this.mirrorPath,
      stdio: 'inherit'
    });
  }

  private configureRepository(repoPath: string): void {
    const remoteUrl = this.getRemoteUrl();

    execFileSync('git', ['remote', 'set-url', 'origin', remoteUrl], {
      cwd: repoPath,
      stdio: 'inherit'
    });
    execFileSync('git', ['config', 'user.name', this.gitUserName], {
      cwd: repoPath,
      stdio: 'inherit'
    });
    execFileSync('git', ['config', 'user.email', this.gitUserEmail], {
      cwd: repoPath,
      stdio: 'inherit'
    });
  }

  private ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private ensureGitIdentity(repoPath: string): void {
    execFileSync('git', ['config', 'user.name', this.gitUserName], {
      cwd: repoPath,
      stdio: 'inherit'
    });
    execFileSync('git', ['config', 'user.email', this.gitUserEmail], {
      cwd: repoPath,
      stdio: 'inherit'
    });
  }

  private getRemoteUrl(): string {
    if (!this.remoteUrl) {
      this.remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: this.repoRoot })
        .toString()
        .trim();
    }
    return this.remoteUrl;
  }

  public createPatchArtifact(context: WorkspaceContext): string {
    const filename = `${context.id}-${Date.now()}.patch`;
    const patchPath = path.join(this.artifactsRoot, filename);

    let patchCreated = false;

    try {
      const patch = execFileSync('git', ['format-patch', `origin/${this.branch}`, '--stdout'], {
        cwd: context.hostPath
      });
      fs.writeFileSync(patchPath, patch);
      patchCreated = true;
    } catch (error) {
      logger.warn({
        category: 'workspace',
        action: 'patch_creation_format_failed',
        message: `format-patch failed for workspace ${context.id}, attempting diff fallback`,
        error
      });

      try {
        const diff = execFileSync('git', ['diff'], { cwd: context.hostPath });
        fs.writeFileSync(patchPath, diff);
        patchCreated = true;
      } catch (diffError) {
        logger.error({
          category: 'workspace',
          action: 'patch_creation_failed',
          message: `Failed to create diff for workspace ${context.id}`,
          error: diffError
        });
      }
    }

    if (!patchCreated) {
      fs.writeFileSync(
        patchPath,
        `# Workspace ${context.id} had no diff available at ${new Date().toISOString()}\n`
      );
    }

    return patchPath;
  }
}
