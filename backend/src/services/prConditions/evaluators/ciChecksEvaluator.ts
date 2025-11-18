/**
 * CI Checks Evaluator
 * 
 * Evaluates Condition 1: CI Checks Passing
 * Checks if all CI/CD checks are passing for the PR.
 */

import { BaseEvaluator } from './baseEvaluator.js';
import type { PRStatus } from '../../githubPR.service.js';
import type { ConditionEvaluation, BlockingIssue } from '../types.js';
import { generateFingerprintFromList } from '../utils.js';
import { logger } from '../../../utils/logger.js';

export class CIChecksEvaluator extends BaseEvaluator {
  getConditionId(): string {
    return 'ci_checks_passing';
  }

  async evaluate(prNumber: number, prStatus?: PRStatus): Promise<ConditionEvaluation> {
    try {
      // Reuse prStatus if provided, otherwise fetch
      if (!prStatus) {
        prStatus = await this.github.getPRStatus(prNumber);
      }
      const checks = prStatus.checks;

      // Find failing checks
      const failingChecks = checks.filter(check =>
        check.status === 'failure' || check.status === 'error'
      );

      // Find pending checks
      const pendingChecks = checks.filter(check =>
        check.status === 'pending'
      );

      // If there are pending checks, return not_ready
      if (pendingChecks.length > 0) {
        this.logEvaluation(prNumber, 'not_ready', {
          pending_count: pendingChecks.length,
          total_checks: checks.length
        });
        return {
          condition_id: this.getConditionId(),
          status: 'not_ready',
          fingerprint: 'checks-pending',
          blocking_issues: []
        };
      }

      if (failingChecks.length === 0) {
        // All checks passing
        this.logEvaluation(prNumber, 'met', { total_checks: checks.length });
        return {
          condition_id: this.getConditionId(),
          status: 'met',
          fingerprint: 'all-checks-passing',
          blocking_issues: []
        };
      }

      // Build blocking issues (store only references, not GitHub data)
      const blocking_issues: BlockingIssue[] = failingChecks.map(check => {
        // Prefer check.id (if available), fallback to check.name
        // Log warning when falling back to name for better debugging
        if (!check.id) {
          logger.warn({
            category: 'pr-workflow',
            action: 'check_id_missing',
            message: `Check "${check.name}" has no ID, using name as reference`,
            details: { check_name: check.name }
          });
        }
        return {
          type: 'failing_check',
          github_ref_type: 'check_run' as const,
          github_ref_id: check.id || check.name,
          severity: 'high' as const
        };
      });

      // Generate fingerprint from failing check names
      const fingerprint = generateFingerprintFromList(
        failingChecks.map(c => c.name).sort()
      );

      this.logEvaluation(prNumber, 'unmet', {
        failing_count: failingChecks.length,
        total_checks: checks.length
      });

      return {
        condition_id: this.getConditionId(),
        status: 'unmet',
        fingerprint,
        blocking_issues,
        metadata: { failing_checks: failingChecks }
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_ci_checks_failed',
        message: `Failed to evaluate CI checks for PR #${prNumber}`,
        error
      });

      return {
        condition_id: this.getConditionId(),
        status: 'not_ready',
        fingerprint: 'evaluation-error',
        blocking_issues: [{
          type: 'evaluation_error',
          severity: 'high'
        }]
      };
    }
  }
}
