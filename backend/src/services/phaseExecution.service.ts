/**
 * Phase Execution Service
 * 
 * High-level service that orchestrates phase execution:
 * 1. Extracts artifacts from container
 * 2. Validates artifacts using appropriate validator
 * 3. Records stage run in database
 * 4. Determines next phase via orchestrator
 * 5. Updates task with new phase
 * 
 * This is the main integration point between all phase system components.
 */

import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import { PhaseOrchestratorService } from './phaseOrchestrator.service.js';
import { getValidatorRegistry } from './phaseValidation/index.js';
import { getArtifactExtractor } from './artifactExtractor.service.js';
import { getRecoveryService } from './recoveryAgent.service.js';
import { MAX_PHASE_ATTEMPTS } from './phaseConstants.js';
import Database from 'better-sqlite3';

export interface PhaseExecutionResult {
  success: boolean;
  nextPhase: number | null; // null means task cancelled/blocked
  validationPassed: boolean;
  recoveryAttempted?: boolean;
  recoverySucceeded?: boolean;
  isSystemBlocked?: boolean; // If true, pause ALL task processing globally
  errors?: string[];
  artifacts?: unknown;
}

export class PhaseExecutionService {
  private orchestrator: PhaseOrchestratorService;
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.orchestrator = new PhaseOrchestratorService(db);
  }

  /**
   * Execute full phase validation and transition workflow.
   * 
   * @param task - The task being executed
   * @param containerId - Docker container ID with artifacts
   * @returns Phase execution result with next phase information
   */
  async executePhaseWorkflow(task: Task, containerId: string): Promise<PhaseExecutionResult> {
    const phaseIndex = task.phase_index;
    const attempt = task.phase_attempts;

    logger.info({
      category: 'phase',
      action: 'phase_workflow_start',
      message: `Starting phase workflow for task ${task.id} phase ${phaseIndex}`,
      details: {
        taskId: task.id,
        phaseIndex,
        phaseName: task.phase_name,
        attempt,
        containerId,
      },
    });

    try {
      // Step 1: Extract artifacts from container
      const extractor = getArtifactExtractor();
      const artifacts = await extractor.extractArtifacts({
        containerId,
        phaseIndex,
        attempt,
      });

      // Step 2: Get validator for this phase
      const registry = getValidatorRegistry();
      const validator = registry.getValidator(phaseIndex);

      // Step 3: Validate artifacts
      const validationResult = await validator.validate(task, artifacts);

      // Step 5: Record stage run in database
      const stageRunId = this.orchestrator.recordStageRun({
        task_id: task.id,
        phase_index: phaseIndex,
        phase_name: task.phase_name,
        attempt,
        status: validationResult.passed ? 'success' : 'failed',
        artifacts_blob: JSON.stringify(artifacts),
        created_at: Date.now(),
        completed_at: Date.now(),
        exit_code: artifacts.exitCode,
      });

      logger.info({
        category: 'phase',
        action: 'validation_complete',
        message: `Validation ${validationResult.passed ? 'passed' : 'failed'} for task ${task.id} phase ${phaseIndex}`,
        details: {
          taskId: task.id,
          phaseIndex,
          validationPassed: validationResult.passed,
          stageRunId,
          errors: validationResult.errors,
        },
      });

      // Step 6: If validation failed, check for max attempts first
      if (!validationResult.passed) {
        // Check if we've reached max attempts in Phase 3 (Review)
        // If so, transition to Phase 4 (Fixes) instead of attempting recovery
        if (phaseIndex === 3 && attempt >= MAX_PHASE_ATTEMPTS) {
          logger.warn({
            category: 'phase',
            action: 'max_attempts_transition',
            message: `Task ${task.id} reached max attempts in Phase 3, transitioning to Phase 4 (Fixes)`,
            details: {
              taskId: task.id,
              phaseIndex,
              attempt,
            },
          });

          return {
            success: false,
            nextPhase: 4, // Move to fixes phase
            validationPassed: false,
            errors: validationResult.errors,
            artifacts,
          };
        }

        // Attempt recovery if available
        const recoveryService = getRecoveryService();
        const canRecover = recoveryService && typeof recoveryService.executeRecovery === 'function';

        if (canRecover) {
          logger.info({
            category: 'phase',
            action: 'recovery_attempt',
            message: `Attempting recovery for task ${task.id} phase ${phaseIndex}`,
            details: {
              taskId: task.id,
              phaseIndex,
              validationErrors: validationResult.errors,
            },
          });

          const recoveryResult = await recoveryService.executeRecovery(
            task,
            containerId,
            validationResult
          );

          // Update stage run with recovery status
          this.orchestrator.updateStageRunWithRecovery(
            stageRunId,
            JSON.stringify(recoveryResult),
            recoveryResult.success ? 'success' : 'failed'
          );

          if (recoveryResult.success) {
            logger.info({
              category: 'phase',
              action: 'recovery_success',
              message: `Recovery successful for task ${task.id}`,
              details: {
                taskId: task.id,
                diagnosis: recoveryResult.diagnosis,
              },
            });

            return {
              success: false,
              nextPhase: phaseIndex, // Stay in current phase for retry
              validationPassed: false,
              recoveryAttempted: true,
              recoverySucceeded: true,
              errors: validationResult.errors,
              artifacts,
            };
          }
        }

        // Validation failed, no recovery or recovery failed - stay in current phase
        return {
          success: false,
          nextPhase: phaseIndex, // Stay in current phase for retry
          validationPassed: false,
          errors: validationResult.errors,
          artifacts,
        };
      }

      // Step 7: Determine next phase via orchestrator
      const transition = this.orchestrator.determineNextPhase(phaseIndex, validationResult);

      // Step 8: Check attempt limits before advancing
      if (transition.toPhase !== null && transition.toPhase === phaseIndex) {
        // Staying in same phase (retry) - check attempt limits
        const limitReached = this.orchestrator.checkAttemptLimits(task);
        if (limitReached) {
          return {
            success: false,
            nextPhase: null, // Task blocked
            validationPassed: true,
            errors: ['Maximum retry attempts reached'],
          };
        }
      }

      // Step 9: Advance to next phase
      this.orchestrator.advancePhase(task, validationResult);

      logger.info({
        category: 'phase',
        action: 'phase_workflow_complete',
        message: `Phase workflow complete for task ${task.id}`,
        details: {
          taskId: task.id,
          fromPhase: transition.fromPhase,
          toPhase: transition.toPhase,
          reason: transition.reason,
        },
      });

      return {
        success: true,
        nextPhase: transition.toPhase,
        validationPassed: true,
        artifacts: validationResult.artifacts,
      };

    } catch (error) {
      logger.error({
        category: 'phase',
        action: 'phase_workflow_error',
        message: `Phase workflow failed for task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          taskId: task.id,
          phaseIndex,
          error,
        },
      });

      return {
        success: false,
        nextPhase: phaseIndex, // Stay in current phase
        validationPassed: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Get phase history for a task.
   */
  getPhaseHistory(taskId: string) {
    return this.orchestrator.getPhaseHistory(taskId);
  }

  /**
   * Get current phase for a task.
   */
  getCurrentPhase(taskId: string) {
    return this.orchestrator.getCurrentPhase(taskId);
  }
}

// Singleton factory (requires DB instance)
export function createPhaseExecutionService(db: Database.Database): PhaseExecutionService {
  return new PhaseExecutionService(db);
}
