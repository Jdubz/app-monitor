/**
 * Phase 7: PR Shepherding Validator
 * 
 * Validates all merge gates for PR readiness.
 * This is the final phase before task completion.
 * 
 * Expected artifact structure (from agent output):
 * {
 *   "merge_gates": {
 *     "base_branch_updated": true,
 *     "no_merge_conflicts": true,
 *     "review_comments_resolved": true,
 *     "change_requests_addressed": true,
 *     "ci_checks_passing": true,
 *     "copilot_review_complete": true,
 *     "task_verification_passed": true,
 *     "final_validation_clean": true
 *   },
 *   "all_gates_passing": true,
 *   "auto_merge_triggered": false,
 *   "merge_sha": "abc123def"  // Only if merged
 * }
 * 
 * Routing Logic:
 * - If all_gates_passing === true: Task complete (mark as done)
 * - If all_gates_passing === false: Stay in Phase 7, monitor gates
 * 
 * This phase may run multiple times as it monitors gate status.
 */

import { logger } from '../../utils/logger.js';
import type { Task } from '../taskQueue.sqlite.js';
import type { 
  PhaseValidator, 
  ValidationResult, 
  PhaseArtifacts,
  PRShepherdingArtifacts 
} from './types.js';

export class Phase7PRShepherdingValidator implements PhaseValidator {
  readonly phaseIndex = 7;
  readonly phaseName = 'PR Shepherding';

  async validate(task: Task, artifacts: PhaseArtifacts): Promise<ValidationResult> {
    const prShepherding = artifacts.prShepherding;

    // Check if PR shepherding artifacts exist
    if (!prShepherding) {
      return {
        passed: false,
        errors: ['No PR shepherding artifacts found in agent output'],
        details: { 
          stdout: artifacts.stdout?.substring(0, 500),
          exitCode: artifacts.exitCode 
        },
      };
    }

    // Validate JSON structure (must be object, not null or array)
    if (typeof prShepherding !== 'object' || prShepherding === null || Array.isArray(prShepherding)) {
      return {
        passed: false,
        errors: ['PR shepherding artifacts are not a valid JSON object'],
        details: { prShepherding },
      };
    }

    // Validate required fields
    const errors: string[] = [];

    if (!prShepherding.merge_gates || typeof prShepherding.merge_gates !== 'object') {
      errors.push('Missing or invalid merge_gates object');
    }

    if (typeof prShepherding.all_gates_passing !== 'boolean') {
      errors.push('Missing or invalid all_gates_passing flag');
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        details: { prShepherding },
      };
    }

    // Validate individual merge gates
    const gateErrors: string[] = [];
    const requiredGates = [
      'base_branch_updated',
      'no_merge_conflicts',
      'review_comments_resolved',
      'change_requests_addressed',
      'ci_checks_passing',
      'copilot_review_complete',
      'task_verification_passed',
      'final_validation_clean',
    ];

    for (const gate of requiredGates) {
      const gateValue = prShepherding.merge_gates[gate as keyof typeof prShepherding.merge_gates];
      
      if (typeof gateValue !== 'boolean') {
        gateErrors.push(`Gate '${gate}' is missing or not a boolean`);
      }
    }

    if (gateErrors.length > 0) {
      return {
        passed: false,
        errors: gateErrors,
        details: { prShepherding },
      };
    }

    // Count passing and failing gates
    const gates = prShepherding.merge_gates;
    const gateStatus = {
      base_branch_updated: gates.base_branch_updated,
      no_merge_conflicts: gates.no_merge_conflicts,
      review_comments_resolved: gates.review_comments_resolved,
      change_requests_addressed: gates.change_requests_addressed,
      ci_checks_passing: gates.ci_checks_passing,
      copilot_review_complete: gates.copilot_review_complete,
      task_verification_passed: gates.task_verification_passed,
      final_validation_clean: gates.final_validation_clean,
    };

    const passingGates = Object.values(gateStatus).filter(v => v === true).length;
    const totalGates = Object.keys(gateStatus).length;
    const allGatesPassing = prShepherding.all_gates_passing;

    // Verify consistency
    if (allGatesPassing && passingGates !== totalGates) {
      return {
        passed: false,
        errors: [`all_gates_passing is true but only ${passingGates}/${totalGates} gates are passing`],
        details: { prShepherding, gateStatus },
      };
    }

    // Check for merge info
    const isMerged = Boolean(prShepherding.merge_sha);
    const autoMergeTriggered = Boolean(prShepherding.auto_merge_triggered);

    logger.info({
      category: 'phase',
      action: 'pr_shepherding_validated',
      message: `Task ${task.id} PR shepherding - ${passingGates}/${totalGates} gates passing`,
      details: {
        taskId: task.id,
        passingGates,
        totalGates,
        allGatesPassing,
        isMerged,
        autoMergeTriggered,
        mergeSha: prShepherding.merge_sha,
        gateStatus,
      },
    });

    return {
      passed: true,
      allGatesPassing, // PhaseOrchestrator uses this to determine task completion
      artifacts: prShepherding,
      details: {
        passing_gates: passingGates,
        total_gates: totalGates,
        all_gates_passing: allGatesPassing,
        is_merged: isMerged,
        auto_merge_triggered: autoMergeTriggered,
        gate_status: gateStatus,
      },
    };
  }
}
