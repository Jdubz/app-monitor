/**
 * DevBot Workspace Manager
 *
 * Handles workspace operations for dev-bot containers:
 * - Repository cloning
 * - Branch checkout
 * - Workspace sync
 * - Git configuration
 */

import Docker from 'dockerode';
import { logger } from '../../utils/logger.js';
import { getRepoCloneScript } from '../dockerConfig.js';

export interface WorkspaceConfig {
  repoUrl: string;
  branch: string;
  workspaceDir: string;
}

export interface CloneOptions {
  depth?: number;
  singleBranch?: boolean;
  recursive?: boolean;
}

/**
 * Manages workspace setup and operations for dev-bot containers
 */
export class DevBotWorkspaceManager {
  constructor(
    private docker: Docker,
    private defaultRepoUrl: string = 'https://github.com/Jdubz/app-monitor.git',
    private defaultWorkspaceDir: string = '/workspace'
  ) {}

  /**
   * Clone repository into container workspace
   *
   * This is the primary method used by both automation workers and interactive sessions.
   * It executes git clone inside the running container for complete isolation.
   */
  async cloneRepository(
    containerId: string,
    branch: string,
    options: {
      repoUrl?: string;
      workspaceDir?: string;
      cloneOptions?: CloneOptions;
    } = {}
  ): Promise<void> {
    const repoUrl = options.repoUrl || this.defaultRepoUrl;
    const workspaceDir = options.workspaceDir || this.defaultWorkspaceDir;

    logger.info({
      category: 'process',
      action: 'cloning_repository_in_container',
      message: `Cloning ${repoUrl} (branch: ${branch}) into container ${containerId}`,
      details: { containerId, repoUrl, branch, workspaceDir },
    });

    const container = this.docker.getContainer(containerId);

    // Use centralized clone script with git config
    const setupScript = getRepoCloneScript(branch, repoUrl);

    try {
      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', setupScript],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: '/',
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
              branch,
              output: output.substring(0, 1000), // First 1000 chars
            },
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
        error,
      });
      throw error;
    }
  }

  /**
   * Execute a custom git command in the container workspace
   */
  async execGitCommand(
    containerId: string,
    gitCommand: string,
    workingDir?: string
  ): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const wd = workingDir || this.defaultWorkspaceDir;

    logger.debug({
      category: 'process',
      action: 'executing_git_command',
      message: `Running git command in container: ${gitCommand}`,
      details: { containerId, command: gitCommand },
    });

    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', gitCommand],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: wd,
    });

    const stream = await exec.start({ Detach: false, Tty: false });

    let output = '';
    stream.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    return output.trim();
  }

  /**
   * Checkout a different branch
   */
  async checkoutBranch(containerId: string, branch: string): Promise<void> {
    logger.info({
      category: 'process',
      action: 'checking_out_branch',
      message: `Checking out branch ${branch} in container ${containerId}`,
    });

    try {
      await this.execGitCommand(containerId, `git fetch origin ${branch}`);
      await this.execGitCommand(containerId, `git checkout ${branch}`);
      await this.execGitCommand(containerId, `git pull origin ${branch}`);

      logger.info({
        category: 'process',
        action: 'branch_checked_out',
        message: `Successfully checked out branch ${branch}`,
      });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'failed_to_checkout_branch',
        message: `Failed to checkout branch ${branch}`,
        error,
      });
      throw error;
    }
  }

  /**
   * Get current git status
   */
  async getGitStatus(containerId: string): Promise<string> {
    return this.execGitCommand(containerId, 'git status --short');
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(containerId: string): Promise<string> {
    return this.execGitCommand(containerId, 'git rev-parse --abbrev-ref HEAD');
  }

  /**
   * Get current commit hash
   */
  async getCurrentCommit(containerId: string): Promise<string> {
    return this.execGitCommand(containerId, 'git rev-parse HEAD');
  }

  /**
   * Create a new branch
   */
  async createBranch(containerId: string, branchName: string): Promise<void> {
    logger.info({
      category: 'process',
      action: 'creating_branch',
      message: `Creating branch ${branchName} in container ${containerId}`,
    });

    await this.execGitCommand(containerId, `git checkout -b ${branchName}`);
  }

  /**
   * Apply uncommitted changes from a patch file
   */
  async applyPatch(containerId: string, patchContent: string): Promise<void> {
    logger.info({
      category: 'process',
      action: 'applying_patch',
      message: `Applying patch in container ${containerId}`,
    });

    // Write patch to temp file and apply
    const patchCmd = `cat > /tmp/changes.patch << 'EOF'
${patchContent}
EOF
git apply /tmp/changes.patch
rm /tmp/changes.patch`;

    await this.execGitCommand(containerId, patchCmd);
  }

  /**
   * Stash current changes
   */
  async stash(containerId: string, message?: string): Promise<void> {
    const stashMsg = message || 'DevBot auto-stash';
    await this.execGitCommand(containerId, `git stash push -m "${stashMsg}"`);
  }

  /**
   * Pop stashed changes
   */
  async stashPop(containerId: string): Promise<void> {
    await this.execGitCommand(containerId, 'git stash pop');
  }

  /**
   * Reset workspace to clean state
   */
  async resetWorkspace(containerId: string, hard: boolean = false): Promise<void> {
    logger.warn({
      category: 'process',
      action: 'resetting_workspace',
      message: `Resetting workspace in container ${containerId} (hard: ${hard})`,
    });

    if (hard) {
      await this.execGitCommand(containerId, 'git reset --hard HEAD');
      await this.execGitCommand(containerId, 'git clean -fd');
    } else {
      await this.execGitCommand(containerId, 'git reset --mixed HEAD');
    }
  }

  /**
   * Verify workspace is ready for work
   */
  async verifyWorkspace(containerId: string): Promise<{
    exists: boolean;
    isGitRepo: boolean;
    branch: string;
    commit: string;
    hasUncommittedChanges: boolean;
  }> {
    const container = this.docker.getContainer(containerId);

    try {
      // Check if workspace directory exists
      const lsExec = await container.exec({
        Cmd: ['/bin/bash', '-c', `test -d ${this.defaultWorkspaceDir} && echo "exists"`],
        AttachStdout: true,
        AttachStderr: true,
      });
      const lsStream = await lsExec.start({ Detach: false, Tty: false });
      let lsOutput = '';
      lsStream.on('data', (chunk: Buffer) => { lsOutput += chunk.toString(); });
      await new Promise(resolve => lsStream.on('end', resolve));

      if (!lsOutput.includes('exists')) {
        return {
          exists: false,
          isGitRepo: false,
          branch: '',
          commit: '',
          hasUncommittedChanges: false,
        };
      }

      // Check if it's a git repo
      const gitCheckExec = await container.exec({
        Cmd: ['/bin/bash', '-c', `cd ${this.defaultWorkspaceDir} && git rev-parse --is-inside-work-tree`],
        AttachStdout: true,
        AttachStderr: true,
      });
      const gitCheckStream = await gitCheckExec.start({ Detach: false, Tty: false });
      let gitCheckOutput = '';
      gitCheckStream.on('data', (chunk: Buffer) => { gitCheckOutput += chunk.toString(); });
      await new Promise(resolve => gitCheckStream.on('end', resolve));

      const isGitRepo = gitCheckOutput.trim() === 'true';

      if (!isGitRepo) {
        return {
          exists: true,
          isGitRepo: false,
          branch: '',
          commit: '',
          hasUncommittedChanges: false,
        };
      }

      // Get git info
      const branch = await this.getCurrentBranch(containerId);
      const commit = await this.getCurrentCommit(containerId);
      const status = await this.getGitStatus(containerId);
      const hasUncommittedChanges = status.length > 0;

      return {
        exists: true,
        isGitRepo: true,
        branch,
        commit,
        hasUncommittedChanges,
      };
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'workspace_verification_failed',
        message: 'Failed to verify workspace',
        error,
      });
      throw error;
    }
  }
}
