/**
 * Final Validation Evaluator
 * 
 * Evaluates Condition 8: Final Validation Passed
 * Runs comprehensive validation once all other conditions are met.
 * Requires validation score >= 80 to pass.
 */

import { BaseEvaluator } from './baseEvaluator.js';
import type { ConditionEvaluation, PRConditionState } from '../types.js';
import { logger } from '../../../utils/logger.js';

export class FinalValidationEvaluator extends BaseEvaluator {
  getConditionId(): string {
    return 'final_validation_passed';
  }

  async evaluate(prNumber: number, _prStatus?: unknown, state?: PRConditionState): Promise<ConditionEvaluation> {
    if (!state) {
      return {
        condition_id: this.getConditionId(),
        status: 'not_ready',
        fingerprint: 'no-state-provided',
        blocking_issues: []
      };
    }

    // Check if all OTHER conditions are met
    const otherConditions = [
      'ci_checks_passing',
      'comments_resolved',
      'no_merge_conflicts',
      'branch_updated',
      'no_change_requests',
      'task_verification',
      'copilot_review_completed'
    ] as const;

    const allOtherMet = otherConditions.every(
      conditionId => state.conditions[conditionId]?.status === 'met'
    );

    if (!allOtherMet) {
      this.logEvaluation(prNumber, 'not_ready', { 
        reason: 'waiting-for-other-conditions' 
      });
      return {
        condition_id: this.getConditionId(),
        status: 'not_ready',
        fingerprint: 'waiting-for-other-conditions',
        blocking_issues: []
      };
    }

    // Check if validation already passed
    if (state.final_validation_state.human_escalation_triggered) {
      this.logEvaluation(prNumber, 'unmet', { 
        reason: 'escalated-to-human' 
      });
      return {
        condition_id: this.getConditionId(),
        status: 'unmet',
        fingerprint: 'escalated-to-human',
        blocking_issues: [{
          type: 'human_review_required',
          severity: 'critical'
        }]
      };
    }

    // Check if validation task exists and passed
    const prTasks = await this.taskQueue.findByPRNumber(prNumber);
    const validationTasks = prTasks.filter(t => t.type === 'pr-validation');
    const latestValidation = validationTasks.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];

    if (latestValidation?.status === 'completed' && latestValidation.verification_passed) {
      // Validation passed
      try {
        const results = JSON.parse(latestValidation.verification_results || '{}');
        const score = results.score || 0;

        const passed = score >= 80;
        this.logEvaluation(prNumber, passed ? 'met' : 'unmet', { 
          validation_score: score,
          validation_task_id: latestValidation.id 
        });

        // NOTE: Validation score is stored in task.verification_results, not here
        return {
          condition_id: this.getConditionId(),
          status: passed ? 'met' : 'unmet',
          fingerprint: passed ? 'validation-passed' : `validation-failed-score-${score}`,
          blocking_issues: passed ? [] : [{
            type: 'validation_failed',
            severity: 'high',
          }],
          metadata: { score, validation_task_id: latestValidation.id }
        };
      } catch {
        // Parse error
        logger.warn({
          category: 'pr-workflow',
          action: 'validation_results_parse_error',
          message: `Failed to parse validation results for PR #${prNumber}`,
          details: { task_id: latestValidation.id }
        });
      }
    }

    // Need validation
    this.logEvaluation(prNumber, 'unmet', { 
      reason: 'validation-needed',
      attempt: state.final_validation_state.validation_attempts 
    });
    return {
      condition_id: this.getConditionId(),
      status: 'unmet',
      fingerprint: `validation-needed-attempt-${state.final_validation_state.validation_attempts}`,
      blocking_issues: [{
        type: 'needs_comprehensive_review',
        severity: 'medium'
      }]
    };
  }
}
