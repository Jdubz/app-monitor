import { WorkerLogLocator } from './taskLogLocator.js';
import { extractPRInfo, isValidPRInfo } from '../utils/prExtractor.js';
import type { PRInfo } from '../utils/prExtractor.js';
import type { TaskQueueService, Task } from './taskQueue.sqlite.js';
import type { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';
import { logger } from '../utils/logger.js';
import { promises as fs } from 'fs';

export interface RecoveryStats {
  tasksScanned: number;
  prInfoFound: number;
  prInfoRecovered: number;
  errors: number;
  duration: number;
}

/**
 * Service to recover PR information from artifact logs after server crashes
 *
 * This service scans artifact logs for orphaned tasks and extracts PR information
 * that was lost when the server crashed or restarted during task execution.
 */
export class PRArtifactRecoveryService {
  private logLocator: WorkerLogLocator;
  private stats: RecoveryStats = {
    tasksScanned: 0,
    prInfoFound: 0,
    prInfoRecovered: 0,
    errors: 0,
    duration: 0
  };

  constructor(
    private taskQueue: TaskQueueService,
    private prOrchestrator: PRWorkflowOrchestrator
  ) {
    this.logLocator = new WorkerLogLocator();
  }

  /**
   * Main recovery method - scans orphaned tasks and recovers PR info from artifacts
   */
  async recoverOrphanedPRs(): Promise<RecoveryStats> {
    const startTime = Date.now();
    this.resetStats();

    logger.info({
      category: 'recovery',
      action: 'recovery_scan_started',
      message: 'Starting PR recovery scan from artifact logs'
    });

    try {
      // Step 1: Find orphaned tasks
      const orphanedTasks = await this.findOrphanedTasks();
      this.stats.tasksScanned = orphanedTasks.length;

      if (orphanedTasks.length === 0) {
        logger.debug({
          category: 'recovery',
          action: 'no_orphaned_tasks',
          message: 'No orphaned tasks found to recover'
        });
        this.stats.duration = Date.now() - startTime;
        return this.stats;
      }

      logger.info({
        category: 'recovery',
        action: 'orphaned_tasks_found',
        message: `Found ${orphanedTasks.length} orphaned tasks to scan`,
        details: {
          taskIds: orphanedTasks.slice(0, 10).map(t => t.id) // Log first 10
        }
      });

      // Step 2: Attempt recovery for each task
      for (const task of orphanedTasks) {
        await this.recoverTaskPR(task);
      }

      // Step 3: Report results
      this.stats.duration = Date.now() - startTime;

      logger.info({
        category: 'recovery',
        action: 'recovery_scan_completed',
        message: `PR recovery scan completed in ${this.stats.duration}ms`,
        details: { ...this.stats } as Record<string, unknown>
      });

      return this.stats;

    } catch (error) {
      logger.error({
        category: 'recovery',
        action: 'recovery_scan_failed',
        message: 'PR recovery scan failed with error',
        error
      });

      this.stats.errors++;
      this.stats.duration = Date.now() - startTime;
      return this.stats;
    }
  }

  /**
   * Find tasks that might have orphaned PRs
   */
  private async findOrphanedTasks(): Promise<Task[]> {
    // Strategy 1: Failed tasks with orphaned/restart/crash errors
    const orphanedByError = this.taskQueue.findOrphanedTasksByError(24);

    // Strategy 2: Completed tasks that should have PRs but don't
    const completedWithoutPR = this.taskQueue.findCompletedTasksWithoutPR(24);

    // Strategy 3: Tasks with suspicious error patterns
    const suspiciousTasks = this.taskQueue.findSuspiciousFailedTasks(48);

    // Combine and deduplicate
    const allTasks = [...orphanedByError, ...completedWithoutPR, ...suspiciousTasks];
    const uniqueTasks = Array.from(new Map(allTasks.map(t => [t.id, t])).values());

    return uniqueTasks;
  }

  /**
   * Attempt to recover PR info for a single task
   */
  private async recoverTaskPR(task: Task): Promise<void> {
    try {
      // Find stdout artifact for this task
      const descriptor = await this.logLocator.getDescriptor('dev-bots', task.id, 'stdout');

      if (!descriptor) {
        logger.debug({
          category: 'recovery',
          action: 'no_stdout_artifact',
          message: `No stdout artifact found for task ${task.id}`,
          details: { taskId: task.id, title: task.title }
        });
        return;
      }

      // Read the artifact log
      const logContent = await fs.readFile(descriptor.path, 'utf-8');

      // Extract PR info from log
      const prInfo = extractPRInfo(logContent);

      if (prInfo && isValidPRInfo(prInfo)) {
        this.stats.prInfoFound++;

        logger.info({
          category: 'recovery',
          action: 'pr_info_extracted',
          message: `Extracted PR info from artifacts for task ${task.id}`,
          details: {
            taskId: task.id,
            prNumber: prInfo.number,
            prUrl: prInfo.url,
            prBranch: prInfo.branch,
            artifactFile: descriptor.filename,
            artifactSize: descriptor.size
          }
        });

        // Update task with recovered PR info
        await this.updateTaskWithPRInfo(task, prInfo);
        this.stats.prInfoRecovered++;

      } else {
        // Log why we couldn't find PR info
        await this.investigateFailure(task, descriptor, logContent);
      }

    } catch (error) {
      this.stats.errors++;

      logger.error({
        category: 'recovery',
        action: 'task_recovery_failed',
        message: `Failed to recover PR for task ${task.id}`,
        error,
        details: { taskId: task.id, title: task.title }
      });
    }
  }

  /**
   * Update task with recovered PR information
   */
  private async updateTaskWithPRInfo(task: Task, prInfo: PRInfo): Promise<void> {
    // Update task with recovered PR info (only pr_number, PR status not stored)
    await this.taskQueue.updateTask(task.id, {
      pr_number: prInfo.number,
      // If task was failed due to orphaning, mark as completed
      status: task.status === 'failed' ? 'completed' : task.status
    });

    logger.info({
      category: 'recovery',
      action: 'task_updated_with_pr',
      message: `Updated task ${task.id} with recovered PR #${prInfo.number}`,
      details: {
        taskId: task.id,
        prNumber: prInfo.number,
        previousStatus: task.status,
        newStatus: task.status === 'failed' ? 'completed' : task.status
      }
    });

    // Get updated task
    const updatedTask = this.taskQueue.getTask(task.id);
    if (updatedTask) {
      // Webhook-driven monitoring, no registration needed
      logger.info({
        category: 'recovery',
        action: 'pr_registered_for_monitoring',
        message: `PR #${prInfo.number} registered for monitoring`,
        details: {
          taskId: task.id,
          prNumber: prInfo.number,
          prUrl: prInfo.url
        }
      });
    }
  }

  /**
   * Investigate why PR info couldn't be found
   */
  private async investigateFailure(task: Task, descriptor: { path: string; filename: string; size: number }, logContent: string): Promise<void> {
    // Check stderr for clues
    const stderrDescriptor = await this.logLocator.getDescriptor('dev-bots', task.id, 'stderr');

    let stderrSample = '';
    if (stderrDescriptor) {
      try {
        const stderrContent = await fs.readFile(stderrDescriptor.path, 'utf-8');
        stderrSample = stderrContent.substring(0, 500);
      } catch (error) {
        // Ignore read errors for stderr
      }
    }

    // Look for partial PR info
    const hasGitHubUrl = logContent.includes('github.com') && logContent.includes('/pull/');
    const hasPRKeyword = logContent.toLowerCase().includes('pull request');
    const hasBranchInfo = logContent.includes('task-implementation-');

    logger.debug({
      category: 'recovery',
      action: 'no_pr_info_in_artifact',
      message: `No valid PR info found in artifacts for task ${task.id}`,
      details: {
        taskId: task.id,
        title: task.title,
        hasStdout: true,
        hasStderr: !!stderrDescriptor,
        stdoutSize: descriptor.size,
        hasGitHubUrl,
        hasPRKeyword,
        hasBranchInfo,
        stderrSample: stderrSample.substring(0, 200)
      }
    });
  }

  /**
   * Reset statistics for new scan
   */
  private resetStats(): void {
    this.stats = {
      tasksScanned: 0,
      prInfoFound: 0,
      prInfoRecovered: 0,
      errors: 0,
      duration: 0
    };
  }

  /**
   * Get current recovery statistics
   */
  getStats(): RecoveryStats {
    return { ...this.stats };
  }
}