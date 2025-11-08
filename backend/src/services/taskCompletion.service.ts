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
// WorkspaceOrchestrator removed - commit/push happens via Docker exec, not host git operations
import type { WorkspaceContext } from './ephemeralWorker.service.js';

export interface PushCoordinator {
  enqueue<T>(operation: () => Promise<T>): Promise<T>;
}
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';
import type { TaskPersistence } from './taskPersistence.js';
import { getTokenTrackingService } from './tokenTracking.js';
import { getQualityGateValidator, type QualityValidationResult } from './qualityGates.js';
import { extractPRInfo, isValidPRInfo } from '../utils/prExtractor.js';
import { getTaskVerificationService, type TaskVerificationResult } from './taskVerification.service.js';
import { getQualityObservationService, type QualityObservation } from './qualityObservation.service.js';
import { getQualityImprovementTaskGenerator } from './qualityImprovementTaskGenerator.js';
import { getDatabase } from './database.js';

export interface TaskCompletionServiceConfig {
  /**
   * Whether to run quality gate validation before pushing
   */
  enableQualityGates: boolean;
  /**
   * Whether to run comprehensive task verification (acceptance criteria, coverage, scope)
   */
  enableTaskVerification: boolean;
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
    private readonly ephemeralWorkerService: EphemeralWorkerService,
    private readonly taskPersistence: TaskPersistence,
    private readonly pushCoordinator: PushCoordinator,
    private readonly emit: (event: string, data: any) => void,
    config: Partial<TaskCompletionServiceConfig> = {}
  ) {
    this.config = {
      enableQualityGates: config.enableQualityGates ?? true,
      enableTaskVerification: config.enableTaskVerification ?? true,
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
    let taskVerification: TaskVerificationResult | undefined;
    let shouldPush = exitCode === 0;

    // Run comprehensive task verification first (if enabled)
    if (shouldPush && this.config.enableTaskVerification) {
      taskVerification = await this.runTaskVerification(task, workspacePath, output);
      shouldPush = taskVerification.passed;

      // Log verification details
      if (!taskVerification.passed) {
        logger.warn({
          category: 'verification',
          action: 'task_verification_failed',
          message: `Task verification failed for ${task.id}`,
          details: {
            acceptanceCriteriaMet: taskVerification.acceptanceCriteria.percentMet,
            testCoverage: taskVerification.testCoverage?.totalCoverage,
            scopeViolations: taskVerification.scopeBoundaries?.violationCount,
            recommendations: taskVerification.recommendations
          }
        });
      }
    }

    // Run quality gates (if verification passed and quality gates enabled)
    if (shouldPush && this.config.enableQualityGates) {
      qualityValidation = await this.runQualityGateValidation(task, workspacePath);
      shouldPush = qualityValidation.passed;
    }

    let finalStatus: 'completed' | 'failed' = exitCode === 0 ? 'completed' : 'failed';
    let failureReason: string | undefined;

    if (shouldPush) {
      // NOTE: Git commit/push already handled by Claude Code CLI inside the Docker container
      // The CLI automatically commits changes and pushes to the configured branch
      // We just mark the task as completed and extract PR info from the output
      finalStatus = 'completed';

      logger.info({
        category: 'process',
        action: 'task_push_approved',
        message: `Task ${task.id} approved for push - Claude CLI handled git operations`,
        details: {
          taskId: task.id,
          workspaceId: worker.workspace.id
        }
      });
    } else {
      finalStatus = 'failed';
      failureReason =
        exitCode !== 0
          ? `Task exited with code ${exitCode}`
          : taskVerification && !taskVerification.passed
          ? `Task verification failed: ${taskVerification.recommendations?.join('; ') || 'See verification details'}`
          : qualityValidation && !qualityValidation.passed
          ? 'Quality gates failed'
          : 'Task did not meet push requirements';

      // NOTE: Patch creation not possible with Docker cp approach
      // The workspace is inside the container which gets destroyed
      // Task output contains all the changes that were made
      logger.warn({
        category: 'process',
        action: 'task_failed_no_patch',
        message: `Task ${task.id} failed - workspace inside container (no patch artifact)`,
        details: {
          taskId: task.id,
          failureReason
        }
      });
    }

    task.status = finalStatus;
    task.completed_at = Date.now();

    if (failureReason) {
      task.error = [task.error, failureReason].filter(Boolean).join('\n');
      task.can_retry = true;
    }

    // Save to persistence (task already updated in SQLite)
    this.taskPersistence.saveCompletedTasks([task]);

    // Create quality observation and generate improvement tasks (if task completed successfully)
    if (finalStatus === 'completed') {
      await this.createQualityObservationAndImprovements(task, taskVerification, qualityValidation);
    }

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
    // NOTE: No patch artifact with Docker cp approach - workspace inside container
    worker.task.error = baseError;
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
   * Run comprehensive task verification
   */
  private async runTaskVerification(task: Task, workspacePath: string, output: string): Promise<TaskVerificationResult> {
    try {
      const verificationService = getTaskVerificationService();

      logger.info({
        category: 'verification',
        action: 'task_verification_started',
        message: `Starting task verification for ${task.id}`,
        details: {
          taskId: task.id,
          taskTitle: task.title,
          hasAcceptanceCriteria: !!task.acceptance_criteria,
          workspacePath
        }
      });

      // Run comprehensive verification
      const result = await verificationService.verifyTask(task, workspacePath, output);

      // Emit verification result event
      this.emit('task_verification_completed', {
        taskId: task.id,
        result
      });

      // Log summary
      logger.info({
        category: 'verification',
        action: 'task_verification_completed',
        message: `Task verification completed for ${task.id}`,
        details: {
          passed: result.passed,
          overallScore: result.overallScore,
          acceptanceCriteriaMet: `${result.acceptanceCriteria.metCount}/${result.acceptanceCriteria.totalCriteria}`,
          testCoverage: result.testCoverage?.totalCoverage,
          scopeViolations: result.scopeBoundaries?.violationCount
        }
      });

      return result;
    } catch (error) {
      logger.error({
        category: 'verification',
        action: 'task_verification_error',
        message: `Error running task verification for ${task.id}`,
        error
      });

      // Return a failed verification result instead of throwing
      return {
        taskId: task.id,
        passed: false,
        acceptanceCriteria: {
          taskId: task.id,
          criteria: [],
          allMet: false,
          totalCriteria: 0,
          metCount: 0,
          percentMet: 0
        },
        overallScore: 0,
        timestamp: new Date().toISOString(),
        recommendations: ['Task verification failed due to error']
      };
    }
  }

  /**
   * Create quality observation and generate improvement tasks
   */
  private async createQualityObservationAndImprovements(
    task: Task,
    verificationResult?: TaskVerificationResult,
    qualityGateResult?: QualityValidationResult
  ): Promise<void> {
    try {
      const observationService = getQualityObservationService();

      // Create quality observation
      const observation = await observationService.observeQuality(
        task,
        verificationResult,
        qualityGateResult
      );

      // Store observation in database
      const db = getDatabase();
      db.storeQualityObservation(observation);

      logger.info({
        category: 'quality-observation',
        action: 'observation_stored',
        message: `Quality observation stored for task ${task.id}`,
        details: {
          taskId: task.id,
          overallScore: observation.overallScore,
          qualityLevel: observation.qualityLevel,
          opportunitiesCount: observation.improvementOpportunities.length,
          readyForMerge: observation.readyForMerge
        }
      });

      // Generate improvement tasks if needed
      if (observation.improvementOpportunities.length > 0 && !task.is_repair_bot) {
        await this.generateImprovementTasks(task, observation);
      }

      // Emit observation event for UI updates
      this.emit('quality_observation_created', {
        taskId: task.id,
        observation
      });

    } catch (error) {
      logger.error({
        category: 'quality-observation',
        action: 'observation_creation_failed',
        message: `Failed to create quality observation for task ${task.id}`,
        error
      });
      // Don't throw - observation failure shouldn't block task completion
    }
  }

  /**
   * Generate improvement tasks from quality observation
   */
  private async generateImprovementTasks(
    parentTask: Task,
    observation: QualityObservation
  ): Promise<void> {
    try {
      // Get task queue from TaskCompletionService dependencies
      // Note: We need access to taskQueue, but it's not directly available here.
      // For now, we'll get it through the database initialization path.
      // TODO: Consider refactoring to inject taskQueue as dependency

      const { getTaskQueueService } = await import('./taskQueue.factory.js');
      const taskQueue = getTaskQueueService();

      const generator = getQualityImprovementTaskGenerator(taskQueue);

      // Check if we should generate improvements
      if (!generator.shouldGenerateImprovements(parentTask, observation)) {
        logger.debug({
          category: 'quality-improvement',
          action: 'skip_improvement_generation',
          message: `Skipping improvement task generation for ${parentTask.id}`,
          details: { taskId: parentTask.id }
        });
        return;
      }

      // Limit opportunities to top 5
      const limitedOpportunities = {
        ...observation,
        improvementOpportunities: generator.getLimitedOpportunities(observation.improvementOpportunities)
      };

      // Generate improvement tasks
      const generatedTasks = await generator.generateImprovementTasks(
        parentTask,
        limitedOpportunities
      );

      logger.info({
        category: 'quality-improvement',
        action: 'improvement_tasks_generated',
        message: `Generated ${generatedTasks.length} improvement tasks for ${parentTask.id}`,
        details: {
          parentTaskId: parentTask.id,
          tasksGenerated: generatedTasks.length,
          taskIds: generatedTasks.map(t => t.task.id)
        }
      });

      // Emit event for UI updates
      this.emit('improvement_tasks_generated', {
        parentTaskId: parentTask.id,
        tasks: generatedTasks.map(t => t.task),
        observation
      });

    } catch (error) {
      logger.error({
        category: 'quality-improvement',
        action: 'improvement_task_generation_failed',
        message: `Failed to generate improvement tasks for ${parentTask.id}`,
        error
      });
      // Don't throw - improvement task generation failure shouldn't block completion
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
