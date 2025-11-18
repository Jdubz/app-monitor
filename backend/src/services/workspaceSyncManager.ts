import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface SyncOptions {
  dryRun?: boolean;
  verbose?: boolean;
  conflictStrategy?: 'auto-merge' | 'stash' | 'abort';
  baseDir?: string;
  repositories?: string[];
  workers?: string[];
}

export interface SyncResult {
  successful: Array<{
    worker?: string;
    repo: string;
    action: string;
  }>;
  conflicts: Array<{
    worker: string;
    repo: string;
    path: string;
    timestamp: string;
    strategy: string;
    status?: string;
  }>;
  errors: Array<{
    worker?: string;
    repo: string;
    error: string;
  }>;
  skipped: Array<{
    worker?: string;
    repo: string;
    reason: string;
  }>;
}

export interface SyncReport {
  timestamp: string;
  baseDir: string;
  repositories: string[];
  workers: string[];
  conflictStrategy: string;
  results: SyncResult;
  summary: {
    total: number;
    successful: number;
    conflicts: number;
    errors: number;
    skipped: number;
  };
}

export class WorkspaceSyncManager extends EventEmitter {
  private baseDir: string;
  private repositories: string[];
  private workers: string[];
  private conflictStrategy: 'auto-merge' | 'stash' | 'abort';
  private isRunning: boolean = false;
  private lastSyncTime?: Date;
  private syncInProgress: boolean = false;

  constructor(options: SyncOptions = {}) {
    super();
    
    this.baseDir = options.baseDir || path.resolve(path.join(process.cwd(), '../../'));
    this.repositories = options.repositories || [
      'job-finder-BE',
      'job-finder-FE',
      'job-finder-shared-types',
      'job-finder-worker'
    ];
    this.workers = options.workers || ['bot-a', 'bot-b'];
    this.conflictStrategy = options.conflictStrategy || 'auto-merge';
    
    logger.info({
      category: 'process',
      action: 'workspace_sync_manager_initialized',
      message: 'WorkspaceSyncManager initialized',
      details: {
        baseDir: this.baseDir,
        repositories: this.repositories,
        workers: this.workers,
        conflictStrategy: this.conflictStrategy
      }
    });
  }

  /**
   * Sync all workspaces before task execution
   */
  async syncAllWorkspaces(options: SyncOptions = {}): Promise<SyncResult> {
    if (this.syncInProgress) {
      logger.warn({
      category: 'process',
      action: 'sync_already_in_progress_skipping',
      message: 'Sync already in progress, skipping'
    });
      return { successful: [], conflicts: [], errors: [], skipped: [] };
    }

    this.syncInProgress = true;
    this.emit('syncStarted');

    try {
      logger.info({
      category: 'process',
      action: 'starting_workspace_synchronization',
      message: 'Starting workspace synchronization...'
    });
      
      const syncOptions = {
        ...options,
        baseDir: this.baseDir,
        repositories: this.repositories,
        workers: this.workers,
        conflictStrategy: this.conflictStrategy
      };

      const result = await this.executeSync(syncOptions);
      
      this.lastSyncTime = new Date();
      this.emit('syncCompleted', result);
      
      logger.info({
        category: 'process',
        action: 'workspace_sync_completed',
        message: 'Workspace synchronization completed',
        details: {
          successful: result.successful.length,
          conflicts: result.conflicts.length,
          errors: result.errors.length,
          skipped: result.skipped.length
        }
      });

      return result;
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'workspace_synchronization_failed',
      message: 'Workspace synchronization failed:',
      error: error
    });
      this.emit('syncFailed', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Execute the synchronization process
   */
  private async executeSync(options: SyncOptions): Promise<SyncResult> {
    const result: SyncResult = {
      successful: [],
      conflicts: [],
      errors: [],
      skipped: []
    };

    // First, sync main repositories
    await this.syncMainRepositories(options, result);
    
    // Then sync worker workspaces
    for (const worker of this.workers) {
      await this.syncWorkerWorkspaces(worker, options, result);
    }

    return result;
  }

  /**
   * Sync main repositories with remote staging
   */
  private async syncMainRepositories(options: SyncOptions, result: SyncResult): Promise<void> {
    logger.info({
      category: 'process',
      action: 'syncing_main_repositories_with_remote_staging',
      message: 'Syncing main repositories with remote staging...'
    });
    
    for (const repo of this.repositories) {
      const repoPath = path.join(this.baseDir, repo);
      
      if (!fs.existsSync(repoPath)) {
        logger.warn({
      category: 'process',
      action: 'repository_repo_not_found_skipping',
      message: `Repository ${repo} not found, skipping...`
    });
        result.skipped.push({ repo, reason: 'Repository not found' });
        continue;
      }

      try {
        await this.syncMainRepository(repo, repoPath, options);
        result.successful.push({ repo, action: 'synced' });
      } catch (error) {
        logger.error({
      category: 'process',
      action: 'failed_to_sync_repo',
      message: `Failed to sync ${repo}:`,
      error: error
    });
        result.errors.push({ repo, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  /**
   * Sync a single main repository
   */
  private async syncMainRepository(repoName: string, repoPath: string, options: SyncOptions): Promise<void> {
    logger.info({
      category: 'process',
      action: 'syncing_reponame',
      message: `Syncing ${repoName}...`
    });
    
    const commands = [
      'git fetch origin',
      'git checkout staging',
      'git pull origin staging'
    ];

    if (options.dryRun) {
      logger.info({
      category: 'process',
      action: 'would_execute',
      message: `Would execute: ${commands.join(' && ')}`
    });
      return;
    }

    try {
      execSync(commands.join(' && '), { 
        stdio: options.verbose ? 'inherit' : 'pipe',
        cwd: repoPath 
      });
      logger.info({
      category: 'process',
      action: 'reponame_synced_successfully',
      message: `${repoName} synced successfully`
    });
    } catch (error) {
      throw new Error(`Git sync failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sync all workspaces for a specific bot
   */
  private async syncWorkerWorkspaces(workerName: string, options: SyncOptions, result: SyncResult): Promise<void> {
    logger.info({
      category: 'process',
      action: 'syncing_workername_workspaces',
      message: `Syncing ${workerName} workspaces...`
    });

    const workerDir = path.join(this.baseDir, 'app-monitor/dev-bots/volumes', workerName);

    if (!fs.existsSync(workerDir)) {
      logger.warn({
      category: 'process',
      action: 'worker_directory_workerdir_not_found_skipping',
      message: `Worker directory ${workerDir} not found, skipping...`
    });
      result.skipped.push({ worker: workerName, repo: workerName, reason: 'Worker directory not found' });
      return;
    }

    // For direct staging workflow, ensure worker is on staging branch
    try {
      this.executeGitCommand(workerDir, 'git checkout staging', options);
      this.executeGitCommand(workerDir, 'git pull origin staging', options);
      logger.info({
      category: 'process',
      action: 'workername_synced_to_latest_staging',
      message: `${workerName} synced to latest staging`
    });
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'sync_worker_failed',
        message: `Failed to sync ${workerName} to staging`,
        error
      });
      result.errors.push({
        worker: workerName,
        repo: 'staging',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    for (const repo of this.repositories) {
      const repoPath = path.join(workerDir, repo);

      if (!fs.existsSync(repoPath)) {
        logger.warn({
      category: 'process',
      action: 'worktree_repo_not_found_for_workername_skipping',
      message: `Repository ${repo} not found for ${workerName}, skipping...`
    });
        result.skipped.push({
          worker: workerName,
          repo,
          reason: 'Repository not found'
        });
        continue;
      }

      try {
        await this.syncWorkerWorktree(workerName, repo, repoPath, options);
        result.successful.push({
          worker: workerName,
          repo,
          action: 'synced'
        });
      } catch (error) {
        logger.error({
      category: 'process',
      action: 'failed_to_sync_workername_repo',
      message: `Failed to sync ${workerName}/${repo}:`,
      error: error
    });

        if (error instanceof Error && error.message.includes('merge conflict')) {
          result.conflicts.push({
            worker: workerName,
            repo,
            path: repoPath,
            timestamp: new Date().toISOString(),
            strategy: this.conflictStrategy,
            status: 'unresolved'
          });
        } else {
          result.errors.push({
            worker: workerName,
            repo,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  /**
   * Sync a single bot repository with staging (Direct Staging Workflow)
   */
  private async syncWorkerWorktree(
    workerName: string,
    repoName: string,
    repoPath: string,
    options: SyncOptions
  ): Promise<void> {
    logger.info({
      category: 'process',
      action: 'syncing_workername_reponame',
      message: `Syncing ${workerName}/${repoName}...`
    });
    
    try {
      // Check current status
      const status = this.getGitStatus(repoPath);

      if (status.hasUncommittedChanges) {
        logger.warn({
      category: 'process',
      action: 'uncommitted_changes_detected_in_workername_reponam',
      message: `Uncommitted changes detected in ${workerName}/${repoName}`
    });
        await this.handleUncommittedChanges(workerName, repoName, repoPath, status, options);
      }

      // Fetch latest changes
      this.executeGitCommand(repoPath, 'git fetch origin', options);

      // Ensure we're on staging branch (Direct Staging Workflow)
      this.executeGitCommand(repoPath, 'git checkout staging', options);

      // Pull latest staging changes
      this.executeGitCommand(repoPath, 'git pull origin staging', options);

      logger.info({
      category: 'process',
      action: 'workername_reponame_synced_successfully',
      message: `${workerName}/${repoName} synced successfully`
    });
      
    } catch (error) {
      logger.error({
      category: 'process',
      action: 'failed_to_sync_workername_reponame',
      message: `Failed to sync ${workerName}/${repoName}:`,
      error: error
    });
      throw error;
    }
  }


  /**
   * Get git status for a repository
   */
  private getGitStatus(repoPath: string): { hasUncommittedChanges: boolean; changes: Array<{ status: string; file: string }> } {
    try {
      const statusOutput = execSync('git status --porcelain', { 
        cwd: repoPath, 
        encoding: 'utf8' 
      });
      
      const hasUncommittedChanges = statusOutput.trim().length > 0;
      const changes = statusOutput.trim().split('\n').filter(line => line.length > 0);
      
      return {
        hasUncommittedChanges,
        changes: changes.map(line => ({
          status: line.substring(0, 2),
          file: line.substring(3)
        }))
      };
    } catch (_error) {
      return { hasUncommittedChanges: false, changes: [] };
    }
  }

  /**
   * Handle uncommitted changes before sync
   */
  private async handleUncommittedChanges(
    workerName: string,
    repoName: string,
    repoPath: string,
    status: { hasUncommittedChanges: boolean; changes: Array<{ status: string; file: string }> },
    options: SyncOptions
  ): Promise<void> {
    logger.info({
      category: 'process',
      action: 'found_status_changes_length_uncommitted_changes_in',
      message: `Found ${status.changes.length} uncommitted changes in ${workerName}/${repoName}`
    });

    if (this.conflictStrategy === 'stash') {
      // Stash changes
      this.executeGitCommand(repoPath, 'git stash push -m "Auto-stash before sync"', options);
      logger.info({
      category: 'process',
      action: 'stashed_changes_in_workername_reponame',
      message: `Stashed changes in ${workerName}/${repoName}`
    });
    } else if (this.conflictStrategy === 'abort') {
      throw new Error('Uncommitted changes found and abort strategy is set');
    } else {
      // Auto-merge strategy: commit changes first
      this.executeGitCommand(repoPath, 'git add .', options);
      this.executeGitCommand(repoPath, `git commit -m "Auto-commit before sync: ${new Date().toISOString()}"`, options);
      logger.info({
      category: 'process',
      action: 'committed_changes_in_workername_reponame',
      message: `Committed changes in ${workerName}/${repoName}`
    });
    }
  }


  /**
   * Handle merge conflicts
   */
  private async handleMergeConflict(
    workerName: string,
    repoName: string,
    repoPath: string,
    error: Error,
    options: SyncOptions
  ): Promise<void> {
    logger.warn({
      category: 'process',
      action: 'handling_merge_conflict_in_workername_reponame',
      message: `Handling merge conflict in ${workerName}/${repoName}...`
    });

    if (this.conflictStrategy === 'auto-merge') {
      // Try to auto-resolve conflicts
      const resolved = await this.autoResolveConflicts(repoPath);
      if (resolved) {
        this.executeGitCommand(repoPath, 'git add .', options);
        this.executeGitCommand(repoPath, 'git commit -m "Auto-resolved merge conflicts"', options);
        logger.info({
      category: 'process',
      action: 'auto_resolved_conflicts_in_workername_reponame',
      message: `Auto-resolved conflicts in ${workerName}/${repoName}`
    });
      } else {
        logger.error({
          category: 'process',
          action: 'auto_resolve_failed',
          message: `Could not auto-resolve conflicts in ${workerName}/${repoName}`
        });
        throw new Error('merge conflict');
      }
    } else if (this.conflictStrategy === 'stash') {
      // Abort merge and stash bot changes
      this.executeGitCommand(repoPath, 'git merge --abort', options);
      this.executeGitCommand(repoPath, 'git stash push -m "Stashed due to merge conflict"', options);
      // Then try to merge staging
      this.executeGitCommand(repoPath, 'git merge origin/staging --no-ff -m "Sync with staging (after stash)"', options);
      logger.info({
      category: 'process',
      action: 'stashed_conflicting_changes_in_workername_reponame',
      message: `Stashed conflicting changes in ${workerName}/${repoName}`
    });
    } else {
      // Abort merge
      this.executeGitCommand(repoPath, 'git merge --abort', options);
      logger.warn({
      category: 'process',
      action: 'aborted_merge_in_workername_reponame',
      message: `Aborted merge in ${workerName}/${repoName}`
    });
      throw new Error('merge conflict');
    }
  }

  /**
   * Attempt to auto-resolve merge conflicts
   */
  private async autoResolveConflicts(repoPath: string): Promise<boolean> {
    try {
      // Get list of conflicted files
      const conflictFiles = execSync('git diff --name-only --diff-filter=U', {
        cwd: repoPath,
        encoding: 'utf8'
      }).trim().split('\n').filter(line => line.length > 0);

      if (conflictFiles.length === 0) {
        return true; // No conflicts to resolve
      }

      logger.info({
      category: 'process',
      action: 'found_conflictfiles_length_conflicted_files',
      message: `Found ${conflictFiles.length} conflicted files`
    });

      let allResolved = true;

      for (const file of conflictFiles) {
        const resolved = await this.resolveFileConflict(repoPath, file);
        if (!resolved) {
          allResolved = false;
          logger.error({
            category: 'process',
            action: 'auto_resolve_file_failed',
            message: `Could not auto-resolve conflict in ${file}`
          });
        } else {
          logger.info({
      category: 'process',
      action: 'auto_resolved_conflict_in_file',
      message: `Auto-resolved conflict in ${file}`
    });
        }
      }

      return allResolved;
    } catch (error) {
      logger.error({
        category: 'process',
        action: 'auto_resolution_error',
        message: 'Error during auto-resolution',
        error
      });
      return false;
    }
  }

  /**
   * Resolve conflict in a specific file
   */
  private async resolveFileConflict(repoPath: string, filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(repoPath, filePath);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Simple conflict resolution strategies
      if (this.isSimpleConflict(content)) {
        const resolvedContent = this.resolveSimpleConflict(content);
        fs.writeFileSync(fullPath, resolvedContent);
        return true;
      }

      // For complex conflicts, try to prefer staging changes
      if (this.canPreferStaging(content)) {
        const resolvedContent = this.preferStagingChanges(content);
        fs.writeFileSync(fullPath, resolvedContent);
        return true;
      }

      return false;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Check if conflict is simple (just whitespace or comments)
   */
  private isSimpleConflict(content: string): boolean {
    const conflictRegex = /<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> [^\n]+/gs;
    const matches = content.match(conflictRegex);
    
    if (!matches) return false;
    
    for (const match of matches) {
      const parts = match.split('\n=======\n');
      if (parts.length !== 2) continue;
      
      const headPart = parts[0].replace(/<<<<<<< HEAD\n/, '').trim();
      const stagingPart = parts[1].replace(/\n>>>>>>> [^\n]+/, '').trim();
      
      // Check if differences are only whitespace or comments
      const headNormalized = headPart.replace(/\s+/g, ' ').replace(/\/\/.*$/gm, '').trim();
      const stagingNormalized = stagingPart.replace(/\s+/g, ' ').replace(/\/\/.*$/gm, '').trim();
      
      if (headNormalized !== stagingNormalized) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Resolve simple conflicts by taking the longer version
   */
  private resolveSimpleConflict(content: string): string {
    const conflictRegex = /<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> [^\n]+/gs;
    
    return content.replace(conflictRegex, (match, headPart, stagingPart) => {
      const headTrimmed = headPart.trim();
      const stagingTrimmed = stagingPart.trim();
      
      // Take the longer version (usually more complete)
      return headTrimmed.length >= stagingTrimmed.length ? headTrimmed : stagingTrimmed;
    });
  }

  /**
   * Check if we can prefer staging changes
   */
  private canPreferStaging(content: string): boolean {
    // This is a simplified check - in practice, you might want more sophisticated logic
    const conflictRegex = /<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> [^\n]+/gs;
    const matches = content.match(conflictRegex);
    
    if (!matches) return false;
    
    // For now, we'll prefer staging for most cases
    // You could add more sophisticated logic here
    return true;
  }

  /**
   * Prefer staging changes in conflict resolution
   */
  private preferStagingChanges(content: string): string {
    const conflictRegex = /<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> [^\n]+/gs;
    
    return content.replace(conflictRegex, (match, headPart, stagingPart) => {
      return stagingPart.trim();
    });
  }

  /**
   * Execute a git command
   */
  private executeGitCommand(repoPath: string, command: string, options: SyncOptions): void {
    if (options.dryRun) {
      logger.info({
      category: 'process',
      action: 'would_execute_command',
      message: `Would execute: ${command}`
    });
      return;
    }

    try {
      execSync(command, {
        cwd: repoPath,
        stdio: options.verbose ? 'inherit' : 'pipe'
      });
    } catch (error) {
      throw new Error(`Git command failed: ${command} - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate a sync report
   */
  generateSyncReport(results: SyncResult): SyncReport {
    return {
      timestamp: new Date().toISOString(),
      baseDir: this.baseDir,
      repositories: this.repositories,
      workers: this.workers,
      conflictStrategy: this.conflictStrategy,
      results,
      summary: {
        total: results.successful.length + 
               results.conflicts.length + 
               results.errors.length + 
               results.skipped.length,
        successful: results.successful.length,
        conflicts: results.conflicts.length,
        errors: results.errors.length,
        skipped: results.skipped.length
      }
    };
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    isRunning: boolean;
    syncInProgress: boolean;
    lastSyncTime?: Date;
    baseDir: string;
    repositories: string[];
    workers: string[];
    conflictStrategy: string;
  } {
    return {
      isRunning: this.isRunning,
      syncInProgress: this.syncInProgress,
      lastSyncTime: this.lastSyncTime,
      baseDir: this.baseDir,
      repositories: this.repositories,
      workers: this.workers,
      conflictStrategy: this.conflictStrategy
    };
  }

  /**
   * Update configuration
   */
  updateConfig(options: Partial<SyncOptions>): void {
    if (options.baseDir) this.baseDir = options.baseDir;
    if (options.repositories) this.repositories = options.repositories;
    if (options.workers) this.workers = options.workers;
    if (options.conflictStrategy) this.conflictStrategy = options.conflictStrategy;
    
    logger.info({
      category: 'process',
      action: 'workspacesyncmanager_configuration_updated',
      message: 'WorkspaceSyncManager configuration updated',
      details: { options }
    });
  }
}


