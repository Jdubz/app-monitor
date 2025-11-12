/**
 * Branch Update Evaluator
 * 
 * Evaluates Condition 4: Branch Updated
 * Checks if the PR branch is up-to-date with the base branch.
 */

import { BaseEvaluator } from './baseEvaluator.js';
import type { PRStatus } from '../../githubPR.service.js';
import type { ConditionEvaluation } from '../types.js';
import { logger } from '../../../utils/logger.js';

export class BranchUpdateEvaluator extends BaseEvaluator {
  getConditionId(): string {
    return 'branch_updated';
  }

  async evaluate(prNumber: number, prStatus?: PRStatus): Promise<ConditionEvaluation> {
    try {
      // Reuse prStatus if provided, otherwise fetch
      if (!prStatus) {
        prStatus = await this.github.getPRStatus(prNumber);
      }

      // GitHub returns mergeStateStatus in UPPERCASE
      const mergeState = (prStatus.mergeable_state || '').toUpperCase();

      // Check if branch is behind base
      if (mergeState === 'BEHIND') {
        this.logEvaluation(prNumber, 'unmet', { merge_state: mergeState });
        return {
          condition_id: this.getConditionId(),
          status: 'unmet',
          fingerprint: 'behind-base',
          blocking_issues: [{
            type: 'branch_behind',
            severity: 'medium'
          }]
        };
      }

      // Check for clean/unstable states (up-to-date)
      if (mergeState === 'CLEAN' || mergeState === 'UNSTABLE') {
        this.logEvaluation(prNumber, 'met', { merge_state: mergeState });
        return {
          condition_id: this.getConditionId(),
          status: 'met',
          fingerprint: 'up-to-date',
          blocking_issues: []
        };
      }

      // Unknown or blocked state - not ready yet
      this.logEvaluation(prNumber, 'not_ready', { merge_state: mergeState });
      return {
        condition_id: this.getConditionId(),
        status: 'not_ready',
        fingerprint: `state-${mergeState.toLowerCase() || 'unknown'}`,
        blocking_issues: []
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_branch_update_failed',
        message: `Failed to evaluate branch update for PR #${prNumber}`,
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
