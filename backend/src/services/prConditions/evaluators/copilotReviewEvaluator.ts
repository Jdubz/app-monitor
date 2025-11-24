/**
 * Copilot Review Evaluator
 * 
 * Evaluates Condition 7: Copilot Review Completed
 * Checks if GitHub Copilot has reviewed the PR and no unresolved Copilot comments remain.
 */

import { BaseEvaluator } from './baseEvaluator.js';
import type { PRStatus } from '../../githubPR.service.js';
import type { ConditionEvaluation } from '../types.js';
import { generateFingerprintFromList } from '../utils.js';
import { logger } from '../../../utils/logger.js';

const AI_REVIEW_BOT_PATTERNS = ['copilot', 'github-advanced-security', 'gemini', 'code-assist', 'gemini-code-assist', 'google'];

export class CopilotReviewEvaluator extends BaseEvaluator {
  getConditionId(): string {
    return 'copilot_review_completed';
  }

  async evaluate(prNumber: number, prStatus?: PRStatus): Promise<ConditionEvaluation> {
    try {
      // Reuse prStatus if provided, otherwise fetch
      if (!prStatus) {
        prStatus = await this.github.getPRStatus(prNumber);
      }
      
      // Check for formal Copilot reviews
      const isAiReviewer = (author: string) =>
        AI_REVIEW_BOT_PATTERNS.some(pattern => author.toLowerCase().includes(pattern));

      const copilotReviews = prStatus.reviews.filter(review => isAiReviewer(review.author));

      // Check for Copilot review comments (inline code suggestions)
      const copilotComments = prStatus.comments.filter(comment => isAiReviewer(comment.author));

      // If Copilot left comments, check if they're unresolved using GitHub API
      if (copilotComments.length > 0) {
        const unresolvedThreads = await this.github.getUnresolvedComments(prNumber);
        const copilotUnresolved = unresolvedThreads.filter(thread =>
          thread.comments.length > 0 &&
          isAiReviewer(thread.comments[0].author)
        );

        if (copilotUnresolved.length > 0) {
          this.logEvaluation(prNumber, 'unmet', { 
            unresolved_copilot_comments: copilotUnresolved.length 
          });
          return {
            condition_id: this.getConditionId(),
            status: 'unmet',
            fingerprint: generateFingerprintFromList(copilotUnresolved.map(t => t.comments[0].body)),
            blocking_issues: copilotUnresolved.map(thread => ({
              type: 'copilot_review_comment',
              github_ref_type: 'comment' as const,
              github_ref_id: thread.comments[0].id,  // Store comment ID, not body
              severity: 'high' as const
            }))
          };
        }
      }

      // If Copilot submitted formal review, check its state
      if (copilotReviews.length > 0) {
        const latestReview = copilotReviews[copilotReviews.length - 1];
        if (latestReview.state === 'CHANGES_REQUESTED') {
          this.logEvaluation(prNumber, 'unmet', { 
            copilot_review_state: 'CHANGES_REQUESTED' 
          });
          return {
            condition_id: this.getConditionId(),
            status: 'unmet',
            fingerprint: 'copilot-requested-changes',
            blocking_issues: [{
              type: 'copilot_changes_requested',
              github_ref_type: 'review' as const,
              github_ref_id: latestReview.id,  // Store review ID, not body
              severity: 'high'
            }]
          };
        }
        
        this.logEvaluation(prNumber, 'met', { 
          copilot_review_state: latestReview.state 
        });
        return {
          condition_id: this.getConditionId(),
          status: 'met',
          fingerprint: 'copilot-reviewed',
          blocking_issues: []
        };
      }

      // No AI interaction yet - condition unmet (will be time-limited in prConditionState.service)
      this.logEvaluation(prNumber, 'unmet', { 
        reason: 'awaiting-ai-review' 
      });
      return {
        condition_id: this.getConditionId(),
        status: 'unmet',
        fingerprint: 'awaiting-ai-review',
        blocking_issues: [{
          type: 'copilot_review_pending',
          severity: 'medium'
        }]
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_copilot_review_failed',
        message: `Failed to evaluate Copilot review for PR #${prNumber}`,
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
