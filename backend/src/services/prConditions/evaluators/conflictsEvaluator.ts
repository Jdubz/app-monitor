/**
 * Merge Conflicts Evaluator
 * 
 * Evaluates Condition 3: No Merge Conflicts
 * Checks if the PR branch has merge conflicts with the base branch.
 */

import { BaseEvaluator } from './baseEvaluator.js';
import type { PRStatus } from '../../githubPR.service.js';
import type { ConditionEvaluation } from '../types.js';
import { logger } from '../../../utils/logger.js';

export class ConflictsEvaluator extends BaseEvaluator {
  getConditionId(): string {
    return 'no_merge_conflicts';
  }

  async evaluate(prNumber: number, prStatus?: PRStatus): Promise<ConditionEvaluation> {
    try {
      // Reuse prStatus if provided, otherwise fetch
      if (!prStatus) {
        prStatus = await this.github.getPRStatus(prNumber);
      }

      if (prStatus.mergeable === 'MERGEABLE') {
        this.logEvaluation(prNumber, 'met', { mergeable: true });
        return {
          condition_id: this.getConditionId(),
          status: 'met',
          fingerprint: 'mergeable',
          blocking_issues: []
        };
      }

      if (prStatus.mergeable === 'CONFLICTING') {
        this.logEvaluation(prNumber, 'unmet', { mergeable: false });
        return {
          condition_id: this.getConditionId(),
          status: 'unmet',
          fingerprint: 'has-conflicts',
          blocking_issues: [{
            type: 'merge_conflicts',
            github_ref_type: 'conflict' as const,
            severity: 'high'
          }]
        };
      }

      // UNKNOWN state
      this.logEvaluation(prNumber, 'not_ready', { 
        mergeable: prStatus.mergeable 
      });
      return {
        condition_id: this.getConditionId(),
        status: 'not_ready',
        fingerprint: 'unknown-mergeable-state',
        blocking_issues: []
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_conflicts_failed',
        message: `Failed to evaluate merge conflicts for PR #${prNumber}`,
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
