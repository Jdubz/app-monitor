/**
 * Change Requests Evaluator
 * 
 * Evaluates Condition 5: No Change Requests
 * Checks if any reviewers have requested changes.
 */

import { BaseEvaluator } from './baseEvaluator.js';
import type { PRStatus } from '../../githubPR.service.js';
import type { ConditionEvaluation, BlockingIssue } from '../types.js';
import { generateFingerprintFromList } from '../utils.js';
import { logger } from '../../../utils/logger.js';

export class ChangeRequestsEvaluator extends BaseEvaluator {
  getConditionId(): string {
    return 'no_change_requests';
  }

  async evaluate(prNumber: number, prStatus?: PRStatus): Promise<ConditionEvaluation> {
    try {
      // Reuse prStatus if provided, otherwise fetch
      if (!prStatus) {
        prStatus = await this.github.getPRStatus(prNumber);
      }
      const reviews = prStatus.reviews;

      // Find latest review from each reviewer
      const latestReviews = new Map<string, typeof reviews[0]>();
      reviews.forEach(review => {
        const existing = latestReviews.get(review.author);
        if (!existing || new Date(review.submittedAt) > new Date(existing.submittedAt)) {
          latestReviews.set(review.author, review);
        }
      });

      // Check for change requests
      const changeRequests = Array.from(latestReviews.values()).filter(
        r => r.state === 'CHANGES_REQUESTED'
      );

      if (changeRequests.length === 0) {
        this.logEvaluation(prNumber, 'met', { total_reviewers: latestReviews.size });
        return {
          condition_id: this.getConditionId(),
          status: 'met',
          fingerprint: 'no-change-requests',
          blocking_issues: []
        };
      }

      // Build blocking issues
      const blocking_issues: BlockingIssue[] = changeRequests.map(review => ({
        type: 'change_requested',
        github_ref_type: 'review' as const,
        github_ref_id: review.id,  // Store review ID, not author/body
        severity: 'high' as const
      }));

      const fingerprint = generateFingerprintFromList(
        changeRequests.map(r => `${r.author}:${r.submittedAt}`).sort()
      );

      this.logEvaluation(prNumber, 'unmet', { 
        change_request_count: changeRequests.length 
      });

      return {
        condition_id: this.getConditionId(),
        status: 'unmet',
        fingerprint,
        blocking_issues
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_change_requests_failed',
        message: `Failed to evaluate change requests for PR #${prNumber}`,
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
