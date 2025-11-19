/**
 * Phase Orchestrator Service
 * 
 * Core phase state machine for the 7-phase task processing pipeline.
 * Manages phase transitions, loop logic, and attempt limits.
 * 
 * Phase Flow:
 *   1. Planning → 2. Implementation → 3. Review ↔ 4. Fixes → 5. Test & Validate → 6. Cleanup → 7. PR Shepherding
 * 
 * Special Loops:
 *   - Phase 3↔4: Review/Fix loop (max 4 iterations across phases)
 *   - Phase 5: Internal test loop (max 4 iterations within same phase)
 * 
 * See: docs/technicalDesigns/task-processing-stage-implementation-roadmap.md
 */

import { logger } from '../utils/logger.js';
import type { Task } from './taskQueue.sqlite.js';
import type { ValidationResult } from './phaseValidation/index.js';
import Database from 'better-sqlite3';
import { PHASE_NAMES, MAX_PHASE_ATTEMPTS, getPhaseNameByIndex } from './phaseConstants.js';

export interface PhaseTransition {
  fromPhase: number;
  toPhase: number | null; // null = cancel task
  resetAttempts: boolean;
  reason: string;
}

export interface StageRun {
  id?: number;
  task_id: string;
  phase_index: number;
  phase_name: string;
  attempt: number;
  status: 'success' | 'failed' | 'recovered' | 'blocked';
  artifacts_blob?: string; // JSON
  created_at: number;
  completed_at?: number;
  recovery_diagnosis?: string; // JSON
  exit_code?: number;
}


export class PhaseOrchestratorService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Determine the next phase based on current phase and validation result.
   * Implements the state machine logic for phase transitions.
   */
  determineNextPhase(currentPhase: number, validation: ValidationResult): PhaseTransition {
    // Phase 1: Planning - Check for early termination
    if (currentPhase === 1) {
      if (validation.taskObsolete) {
        return {
          fromPhase: 1,
          toPhase: null, // Cancel task
          resetAttempts: false,
          reason: 'Task marked obsolete by planning phase',
        };
      }
      
      if (validation.taskRealigned) {
        return {
          fromPhase: 1,
          toPhase: 1, // Stay in planning, will update prompt
          resetAttempts: true,
          reason: 'Task realigned - needs re-planning with updated context',
        };
      }
      
      // Normal progression to implementation
      return {
        fromPhase: 1,
        toPhase: 2,
        resetAttempts: true,
        reason: 'Planning complete',
      };
    }

    // Phase 2: Implementation - Always go to Review
    if (currentPhase === 2) {
      return {
        fromPhase: 2,
        toPhase: 3,
        resetAttempts: true,
        reason: 'Implementation complete - proceeding to review',
      };
    }

    // Phase 3: Review - Branch based on issues found
    if (currentPhase === 3) {
      // Check for issues either via issuesFound flag or passed === false
      const hasIssues = validation.issuesFound === true || validation.passed === false;

      if (hasIssues) {
        return {
          fromPhase: 3,
          toPhase: 4,
          resetAttempts: true, // Start fresh fix attempts
          reason: 'Issues found in review - proceeding to fixes',
        };
      } else {
        return {
          fromPhase: 3,
          toPhase: 5,
          resetAttempts: true,
          reason: 'Review passed - no issues found',
        };
      }
    }

    // Phase 4: Fixes - Return to Phase 3 if all issues addressed, stay in Phase 4 otherwise
    if (currentPhase === 4) {
      // Check if all issues have been addressed (either explicitly or via passed flag)
      const allIssuesAddressed = validation.allIssuesAddressed === true || validation.passed === true;

      if (allIssuesAddressed) {
        return {
          fromPhase: 4,
          toPhase: 3,
          resetAttempts: false, // Maintain attempt counter across loop
          reason: 'Fixes applied - re-reviewing to verify',
        };
      } else {
        return {
          fromPhase: 4,
          toPhase: 4,
          resetAttempts: false, // Stay in same phase
          reason: 'Not all issues addressed - retry fixes',
        };
      }
    }

    // Phase 5: Test & Validate - Internal loop logic
    if (currentPhase === 5) {
      // Check if tests are passing (either via allTestsPassing flag or allGatesPassing or passed)
      const testsPassing = validation.allTestsPassing === true ||
                          validation.allGatesPassing === true ||
                          validation.passed === true;

      if (testsPassing) {
        return {
          fromPhase: 5,
          toPhase: 6,
          resetAttempts: true,
          reason: 'All tests passing - proceeding to cleanup',
        };
      } else {
        return {
          fromPhase: 5,
          toPhase: 5, // Stay in same phase
          resetAttempts: false, // Increment attempts within phase
          reason: 'Tests failing - retry within Phase 5',
        };
      }
    }

    // Phase 6: Cleanup - Always go to PR Shepherding
    if (currentPhase === 6) {
      return {
        fromPhase: 6,
        toPhase: 7,
        resetAttempts: true,
        reason: 'Cleanup complete - proceeding to PR shepherding',
      };
    }

    // Phase 7: PR Shepherding - Check merge gates
    if (currentPhase === 7) {
      if (validation.allGatesPassing || validation.passed === true) {
        return {
          fromPhase: 7,
          toPhase: 7, // Stay in phase 7 (task will be marked complete elsewhere)
          resetAttempts: false,
          reason: 'All merge gates passing - task complete',
        };
      } else {
        return {
          fromPhase: 7,
          toPhase: 7, // Stay in phase, continue monitoring
          resetAttempts: false,
          reason: 'Waiting for merge gates to pass',
        };
      }
    }

    // Should never reach here
    throw new Error(`Invalid phase: ${currentPhase}`);
  }

  /**
   * Advance task to next phase based on validation result.
   * Updates task record and returns transition details.
   */
  advancePhase(task: Task, validation: ValidationResult): PhaseTransition {
    const transition = this.determineNextPhase(task.phase_index ?? 1, validation);

    logger.info({
      category: 'phase',
      action: 'phase_transition',
      message: `Task ${task.id} transitioning from phase ${transition.fromPhase} to ${transition.toPhase}`,
      details: {
        taskId: task.id,
        fromPhase: transition.fromPhase,
        toPhase: transition.toPhase,
        reason: transition.reason,
      },
    });

    // Handle task cancellation
    if (transition.toPhase === null) {
      this.db.prepare(`
        UPDATE tasks 
        SET status = 'cancelled', 
            phase_status = 'complete',
            completed_at = ?
        WHERE id = ?
      `).run(Date.now(), task.id);

      return transition;
    }

    // Handle phase advancement
    const newAttempts = transition.resetAttempts ? 1 : (task.phase_attempts ?? 1) + 1;
    const newPhaseName = getPhaseNameByIndex(transition.toPhase);

    this.db.prepare(`
      UPDATE tasks
      SET phase_index = ?,
          phase_name = ?,
          phase_attempts = ?,
          phase_status = 'ready',
          phase_payload = NULL
      WHERE id = ?
    `).run(transition.toPhase, newPhaseName, newAttempts, task.id);

    logger.debug({
      category: 'phase',
      action: 'phase_payload_cleared_on_advance',
      message: `Cleared phase_payload for task ${task.id} when advancing to phase ${transition.toPhase}`,
      details: { taskId: task.id, newPhase: transition.toPhase }
    });

    return transition;
  }

  /**
   * Record a phase execution attempt in task_stage_runs table.
   * Maintains historical record of all phase executions.
   */
  recordStageRun(stageRun: Omit<StageRun, 'id'>): number {
    const result = this.db.prepare(`
      INSERT INTO task_stage_runs (
        task_id, phase_index, phase_name, attempt, status,
        artifacts_blob, created_at, completed_at, recovery_diagnosis, exit_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      stageRun.task_id,
      stageRun.phase_index,
      stageRun.phase_name,
      stageRun.attempt,
      stageRun.status,
      stageRun.artifacts_blob ?? null,
      stageRun.created_at,
      stageRun.completed_at ?? null,
      stageRun.recovery_diagnosis ?? null,
      stageRun.exit_code ?? null
    );

    logger.info({
      category: 'phase',
      action: 'stage_run_recorded',
      message: `Recorded stage run for task ${stageRun.task_id} phase ${stageRun.phase_index} attempt ${stageRun.attempt}`,
      details: {
        taskId: stageRun.task_id,
        phaseIndex: stageRun.phase_index,
        attempt: stageRun.attempt,
        status: stageRun.status,
      },
    });

    return result.lastInsertRowid as number;
  }

  /**
   * Update a stage run with recovery diagnosis and status.
   * Called when recovery agent completes its diagnosis.
   */
  updateStageRunWithRecovery(stageRunId: number, recoveryDiagnosis: string, status: 'success' | 'failed' = 'success'): void {
    // DB constraint only allows: 'pending', 'running', 'success', 'failed', 'skipped'
    // Recovery successful = 'success', recovery failed = 'failed'
    this.db.prepare(`
      UPDATE task_stage_runs
      SET recovery_diagnosis = ?,
          status = ?,
          completed_at = ?
      WHERE id = ?
    `).run(recoveryDiagnosis, status, Date.now(), stageRunId);

    logger.info({
      category: 'phase',
      action: 'stage_run_recovery_updated',
      message: `Updated stage run ${stageRunId} with recovery diagnosis`,
      details: {
        stageRunId,
        status,
      },
    });
  }

  /**
   * Check if task has exceeded attempt limits for current phase.
   * Returns true if should escalate to human intervention.
   */
  checkAttemptLimits(task: Task): boolean {
    const attempts = task.phase_attempts ?? 1;

    if (attempts >= MAX_PHASE_ATTEMPTS) {
      logger.warn({
        category: 'phase',
        action: 'attempt_limit_reached',
        message: `Task ${task.id} reached max attempts (${MAX_PHASE_ATTEMPTS}) for phase ${task.phase_index}`,
        details: {
          taskId: task.id,
          phaseIndex: task.phase_index,
          phaseName: task.phase_name,
          attempts,
        },
      });

      // Block the task's chain
      this.db.prepare(`
        UPDATE tasks
        SET status = 'blocked',
            phase_status = 'blocked',
            blocked_reason = ?,
            blocked_at = ?,
            chain_status = 'blocked'
        WHERE id = ?
      `).run(
        `Phase ${task.phase_index} (${task.phase_name}) exceeded ${MAX_PHASE_ATTEMPTS} attempts`,
        Date.now(),
        task.id
      );

      return true;
    }

    return false;
  }

  /**
   * Get phase statistics for a task.
   * Returns history of phase executions from task_stage_runs.
   */
  getPhaseHistory(taskId: string): StageRun[] {
    return this.db.prepare(`
      SELECT * FROM task_stage_runs
      WHERE task_id = ?
      ORDER BY phase_index ASC, attempt ASC
    `).all(taskId) as StageRun[];
  }

  /**
   * Get current phase information for a task.
   */
  getCurrentPhase(taskId: string): { phase_index: number; phase_name: string; phase_attempts: number } | null {
    const result = this.db.prepare(`
      SELECT phase_index, phase_name, phase_attempts
      FROM tasks
      WHERE id = ?
    `).get(taskId) as { phase_index: number; phase_name: string; phase_attempts: number } | undefined;

    return result ?? null;
  }

  /**
   * Get phase name from index.
   */
  static getPhaseName(phaseIndex: number): string {
    try {
      return getPhaseNameByIndex(phaseIndex);
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Get all phase names.
   */
  static getAllPhaseNames(): Record<number, string> {
    return { ...PHASE_NAMES };
  }
}
