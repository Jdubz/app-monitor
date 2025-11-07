/**
 * TaskCompletionService
 *
 * Handles the final lifecycle stage of ephemeral worker tasks:
 * - Token usage tracking
 * - Quality gate validation
 * - Workspace sealing and commit pushing
 * - Patch artifact creation for failed tasks
 * - Task status updates and persistence
 * - Worker cleanup orchestration
 */

import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import type { EphemeralWorker } from './ephemeralWorker.service.js';
import type { WorkspaceOrchestrator, PushCoordinator } from './workspaceOrchestrator.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { TaskPersistence } from './taskPersistence.js';
import { getTokenTrackingService } from './tokenTracking.js';
import { getQualityGateValidator, type QualityValidationResult } from './qualityGates.js';
import { extractPRInfo, isValidPRInfo } from '../utils/prExtractor.js';

export interface TaskCompletionServiceConfig {
  /**
   * Whether to run quality gate validation before pushing
   */
  enableQualityGates: boolean;
  /**
   * Optional callback for PR registration after task completion
   */
  onPRCreated?: (task: Task) => void;
}

/**
 * Service for handling task completion and failure
 */
export class TaskCompletionService {
  private readonly config: TaskCompletionServiceConfig;

  constructor(
    private readonly workspaceOrchestrator: WorkspaceOrchestrator,
    private readonly ephemeralWorkerService: EphemeralWorkerService,
    private readonly taskPersistence: TaskPersistence,
    private readonly pushCoordinator: PushCoordinator,
    private readonly emit: (event: string, data: any) => void,
    config: Partial<TaskCompletionServiceConfig> = {}
  ) {
    this.config = {
      enableQualityGates: config.enableQualityGates ?? true,
    };
  }

  /**
   * Complete task in ephemeral worker
   */
  async completeEphemeralTask(
    worker: EphemeralWorker,
    output: string,
    errorOutput: string,
    exitCode: number,
    onAssignNext: () => Promise<void>
  ): Promise<void> {
    worker.status = 'completing';

    const task = worker.task;
    task.output = output;
    task.error = errorOutput;

    this.extractAndRecordTokenUsage(task, output);
    this.extractAndRecordPRInfo(task, output);

    const workspacePath = worker.workspace.hostPath;
    let qualityValidation: QualityValidationResult | undefined;
    let shouldPush = exitCode === 0;

    if (shouldPush && this.config.enableQualityGates) {
      qualityValidation = await this.runQualityGateValidation(task, workspacePath);
      shouldPush = qualityValidation.passed;
    }

    let finalStatus: 'completed' | 'failed' = exitCode === 0 ? 'completed' : 'failed';
    let failureReason: string | undefined;

    if (shouldPush) {
      const sealResult = await this.workspaceOrchestrator.sealWorkspace(worker.workspace, {
        taskId: task.id,
        taskTitle: task.title,
        pushCoordinator: this.pushCoordinator
      });

      if (sealResult.status === 'success' || sealResult.status === 'noop') {
        finalStatus = 'completed';
        if (sealResult.commitSha) {
          const commitNote = `Pushed commit ${sealResult.commitSha} to staging from workspace ${worker.workspace.id}`;
          task.notes = task.notes ? `${task.notes}\n${commitNote}` : commitNote;
        }
      } else {
        finalStatus = 'failed';
        failureReason = sealResult.message || `Failed to push changes (${sealResult.status})`;
        if (sealResult.patchPath) {
          failureReason = `${failureReason}. Patch saved at ${sealResult.patchPath}`;
        }
      }
    } else {
      finalStatus = 'failed';
      failureReason =
        exitCode !== 0
          ? `Task exited with code ${exitCode}`
          : qualityValidation && !qualityValidation.passed
          ? 'Quality gates failed'
          : 'Task did not meet push requirements';

      const patchPath = this.workspaceOrchestrator.createPatchArtifact(worker.workspace);
      if (patchPath) {
        failureReason = `${failureReason}. Workspace patch saved at ${patchPath}`;
      }
    }

    task.status = finalStatus;
    task.completed_at = Date.now();

    if (failureReason) {
      task.error = [task.error, failureReason].filter(Boolean).join('\n');
      task.can_retry = true;
    }

    // Save to persistence (task already updated in SQLite)
    this.taskPersistence.saveCompletedTasks([task]);

    await this.ephemeralWorkerService.destroyWorker(worker.id);

    if (finalStatus === 'completed') {
      logger.info({
        category: 'process',
        action: 'task_completed_worker_task_id',
        message: `Task completed: ${task.id}`
      });
    } else {
      logger.warn({
        category: 'process',
        action: 'task_failed_to_push',
        message: `Task ${task.id} finished with status ${finalStatus}`,
        details: { failureReason }
      });
    }

    const activeWorkers = Array.from(this.ephemeralWorkerService.getAllWorkers().values()).filter(
      workerInfo => workerInfo.status !== 'destroyed'
    );
    logger.info({
      category: 'process',
      action: 'active_workers_after_completion',
      message: `Active workers after completion: ${activeWorkers.length} (${activeWorkers
        .map(w => w.id)
        .join(', ')})`
    });

    await onAssignNext();
  }

  /**
   * Fail task in ephemeral worker
   */
  async failEphemeralTask(
    worker: EphemeralWorker,
    error: Error | { message: string },
    onAssignNext: () => Promise<void>
  ): Promise<void> {
    worker.status = 'completing';

    // Update task
    worker.task.status = 'failed';
    worker.task.completed_at = Date.now();
    const baseError = error instanceof Error ? error.message : String(error);
    let failureMessage = baseError;
    const patchPath = this.workspaceOrchestrator.createPatchArtifact(worker.workspace);
    if (patchPath) {
      failureMessage = `${baseError}\nWorkspace patch saved at ${patchPath}`;
    }
    worker.task.error = failureMessage;
    worker.task.can_retry = true;

    // Save to persistence (task already updated in SQLite)
    this.taskPersistence.saveCompletedTasks([worker.task]);

    // Destroy container
    await this.ephemeralWorkerService.destroyWorker(worker.id);

    logger.error({
      category: 'process',
      action: 'task_failed_worker_task_id',
      message: `Task failed: ${worker.task.id}`,
      error: error
    });

    // Log current worker status for debugging
    const activeWorkers = Array.from(this.ephemeralWorkerService.getAllWorkers().values()).filter(
      worker => worker.status !== 'destroyed'
    );
    logger.info({
      category: 'process',
      action: 'active_workers_after_failure',
      message: `Active workers after failure: ${activeWorkers.length} (${activeWorkers.map(w => w.id).join(', ')})`
    });

    // Try to assign next task
    await onAssignNext();
  }

  /**
   * Extract and record token usage from task output
   */
  private extractAndRecordTokenUsage(task: Task, output: string): void {
    try {
      const tokenTracking = getTokenTrackingService();

      // Try to extract token usage from output
      // Format: "Input tokens: 1234, Output tokens: 567"
      const inputMatch = output.match(/Input tokens?:\s*(\d+)/i);
      const outputMatch = output.match(/Output tokens?:\s*(\d+)/i);

      if (inputMatch && outputMatch) {
        const inputTokens = parseInt(inputMatch[1], 10);
        const outputTokens = parseInt(outputMatch[1], 10);

        // Determine provider from task or default to 'claude'
        const provider = task.assigned_agent?.includes('codex') ? 'codex' : 'claude';

        tokenTracking.recordUsage({
          provider,
          model: task.assigned_agent || 'unknown',
          taskId: task.id,
          inputTokens,
          outputTokens
        });

        logger.info({
          category: 'token-tracking',
          action: 'recorded_token_usage',
          message: `Recorded token usage for task ${task.id}`,
          details: { provider, inputTokens, outputTokens }
        });
      }
    } catch (error) {
      logger.error({
        category: 'token-tracking',
        action: 'failed_to_extract_tokens',
        message: 'Failed to extract and record token usage',
        error
      });
    }
  }

  /**
   * Run quality gate validation on a completed task
   */
  private async runQualityGateValidation(task: Task, workspacePath: string): Promise<QualityValidationResult> {
    try {
      const qualityGates = getQualityGateValidator();

      // Determine project name from task
      const project = (task as any).project || 'unknown';

      logger.info({
        category: 'quality-gates',
        action: 'validation_started',
        message: `Starting quality gate validation for task ${task.id}`,
        details: { project, workspacePath }
      });

      // Run validation
      const validationResult: QualityValidationResult = await qualityGates.validateTask(
        task.id,
        workspacePath,
        project
      );

      logger.info({
        category: 'quality-gates',
        action: 'validation_completed',
        message: `Quality gate validation completed for task ${task.id}`,
        details: {
          passed: validationResult.passed,
          overallScore: validationResult.overallScore,
          gatesPassed: validationResult.gates.filter(g => g.passed).length,
          gatesTotal: validationResult.gates.length
        }
      });

      // Emit event for UI updates
      this.emit('quality_validation_completed', {
        taskId: task.id,
        result: validationResult
      });

      // If quality gates failed, log warning
      if (!validationResult.passed) {
        logger.warn({
          category: 'quality-gates',
          action: 'validation_failed',
          message: `Quality gates failed for task ${task.id}`,
          details: {
            failedGates: validationResult.gates.filter(g => !g.passed).map(g => g.gate)
          }
        });
      }

      return validationResult;
    } catch (error) {
      logger.error({
        category: 'quality-gates',
        action: 'validation_error',
        message: `Error running quality gate validation for task ${task.id}`,
        error
      });

      // Return a failed validation result instead of throwing
      return {
        taskId: task.id,
        passed: false,
        overallScore: 0,
        gates: [],
        duration: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Extract and record PR information from task output
   */
  private extractAndRecordPRInfo(task: Task, output: string): void {
    try {
      // Try to extract PR information from output
      const prInfo = extractPRInfo(output);

      if (isValidPRInfo(prInfo)) {
        // Update task with PR information
        task.pr_number = prInfo.number;
        task.pr_url = prInfo.url;
        task.pr_branch = prInfo.branch;
        task.pr_status = 'pending_checks';
        task.pr_created_at = Date.now();

        logger.info({
          category: 'pr-workflow',
          action: 'pr_info_extracted',
          message: `Extracted PR information for task ${task.id}`,
          details: {
            pr_number: prInfo.number,
            pr_url: prInfo.url,
            pr_branch: prInfo.branch
          }
        });

        // Notify PR monitor if callback is configured
        if (this.config.onPRCreated) {
          this.config.onPRCreated(task);
        }
      } else {
        logger.debug({
          category: 'pr-workflow',
          action: 'no_pr_info_found',
          message: `No valid PR information found in output for task ${task.id}`
        });
      }
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'failed_to_extract_pr_info',
        message: 'Failed to extract and record PR information',
        error
      });
    }
  }
}
