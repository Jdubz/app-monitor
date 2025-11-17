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
import { getArtifactStorage } from './artifactStorage.service.js';
import Database from 'better-sqlite3';

export interface PhaseExecutionResult {
  success: boolean;
  nextPhase: number | null; // null means task cancelled
  validationPassed: boolean;
  errors?: string[];
  artifacts?: Record<string, unknown>;
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
    const phaseIndex = task.phase_index ?? 1;
    const attempt = task.phase_attempts ?? 1;

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

      // Step 2: Store file artifacts if any
      const storage = getArtifactStorage();
      const artifactFiles = artifacts.files;
      if (artifactFiles && artifactFiles.size > 0) {
        await storage.storeFiles({ 
          taskId: task.id, 
          phaseIndex, 
          attempt 
        }, artifactFiles);
      }

      // Step 3: Get validator for this phase
      const registry = getValidatorRegistry();
      const validator = registry.getValidator(phaseIndex);

      // Step 4: Validate artifacts
      const validationResult = await validator.validate(task, artifacts);

      // Step 5: Record stage run in database
      const stageRunId = this.orchestrator.recordStageRun({
        task_id: task.id,
        phase_index: phaseIndex,
        phase_name: task.phase_name ?? `Phase ${phaseIndex}`,
        attempt,
        status: validationResult.passed ? 'success' : 'failed',
        artifacts_blob: validationResult.artifacts ? JSON.stringify(validationResult.artifacts) : undefined,
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

      // Step 6: If validation failed, return early
      if (!validationResult.passed) {
        return {
          success: false,
          nextPhase: phaseIndex, // Stay in current phase for retry
          validationPassed: false,
          errors: validationResult.errors,
          artifacts: validationResult.artifacts,
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
   * Get current phase statistics for a task.
   */
  getPhaseStats(taskId: string) {
    return this.orchestrator.getPhaseStats(taskId);
  }
}

// Singleton factory (requires DB instance)
export function createPhaseExecutionService(db: Database.Database): PhaseExecutionService {
  return new PhaseExecutionService(db);
}
