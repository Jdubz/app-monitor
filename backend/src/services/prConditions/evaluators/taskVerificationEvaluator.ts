/**
 * Task Verification Evaluator
 * 
 * Evaluates Condition 6: Task Verification
 * Checks if the associated task has passed verification.
 */

import { BaseEvaluator } from './baseEvaluator.js';
import type { ConditionEvaluation } from '../types.js';
import { logger } from '../../../utils/logger.js';

export class TaskVerificationEvaluator extends BaseEvaluator {
  getConditionId(): string {
    return 'task_verification';
  }

  async evaluate(prNumber: number): Promise<ConditionEvaluation> {
    try {
      // Find the task associated with this PR
      const tasks = await this.taskQueue.findByPRNumber(prNumber);
      const task = tasks[0] || null;

      if (!task) {
        // No task found - this might be a manual PR
        this.logEvaluation(prNumber, 'met', { reason: 'no-task-manual-pr' });
        return {
          condition_id: this.getConditionId(),
          status: 'met',
          fingerprint: 'no-task-manual-pr',
          blocking_issues: []
        };
      }

      // Check if task has verification results
      if (task.verification_passed === true) {
        this.logEvaluation(prNumber, 'met', { 
          task_id: task.id,
          verification_passed: true 
        });
        return {
          condition_id: this.getConditionId(),
          status: 'met',
          fingerprint: 'verification-passed',
          blocking_issues: []
        };
      }

      if (task.verification_passed === false) {
        // Verification failed - task needs rework
        // NOTE: verificationDetails is stored in task.verification_results, not here
        this.logEvaluation(prNumber, 'unmet', { 
          task_id: task.id,
          verification_passed: false 
        });
        return {
          condition_id: this.getConditionId(),
          status: 'unmet',
          fingerprint: 'verification-failed',
          blocking_issues: [{
            type: 'verification_failed',
            severity: 'high',
          }]
        };
      }

      // Verification not yet run or pending
      this.logEvaluation(prNumber, 'not_ready', { 
        task_id: task.id,
        verification_passed: null 
      });
      return {
        condition_id: this.getConditionId(),
        status: 'not_ready',
        fingerprint: 'verification-pending',
        blocking_issues: []
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_task_verification_failed',
        message: `Failed to evaluate task verification for PR #${prNumber}`,
        error
      });

      return {
        condition_id: this.getConditionId(),
        status: 'not_ready',
        fingerprint: 'evaluation-error',
        blocking_issues: []
      };
    }
  }
}
