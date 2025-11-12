/**
 * Comments Evaluator
 * 
 * Evaluates Condition 2: Comments Resolved
 * Checks if all review comments are resolved (excluding nitpicks).
 */

import { BaseEvaluator } from './baseEvaluator.js';
import type { ConditionEvaluation, BlockingIssue } from '../types.js';
import { generateFingerprintFromList } from '../utils.js';
import { logger } from '../../../utils/logger.js';

export class CommentsEvaluator extends BaseEvaluator {
  getConditionId(): string {
    return 'comments_resolved';
  }

  async evaluate(prNumber: number): Promise<ConditionEvaluation> {
    try {
      // Query GitHub directly for unresolved comments
      const hasUnresolved = await this.github.hasUnresolvedComments(prNumber);
      
      if (!hasUnresolved) {
        this.logEvaluation(prNumber, 'met', { unresolved_count: 0 });
        return {
          condition_id: this.getConditionId(),
          status: 'met',
          fingerprint: 'no-unresolved-comments',
          blocking_issues: []
        };
      }

      // Get details of unresolved comments
      const unresolvedThreads = await this.github.getUnresolvedComments(prNumber);
      
      // Filter out nitpicks
      const blockingThreads = unresolvedThreads.filter(thread => 
        thread.comments.length > 0 && 
        !/\[nitpick\]|\[nit\]/i.test(thread.comments[0].body)
      );

      if (blockingThreads.length === 0) {
        this.logEvaluation(prNumber, 'met', { 
          nitpick_count: unresolvedThreads.length 
        });
        return {
          condition_id: this.getConditionId(),
          status: 'met',
          fingerprint: 'only-nitpicks',
          blocking_issues: []
        };
      }

      // Build blocking issues from threads (store only references, not GitHub data)
      const blocking_issues: BlockingIssue[] = blockingThreads.map(thread => {
        const firstComment = thread.comments[0];
        return {
          type: 'unresolved_comment',
          github_ref_type: 'comment' as const,
          github_ref_id: firstComment.id,  // Store comment ID, not body
          severity: 'high' as const
        };
      });

      // Generate fingerprint from comment bodies
      const fingerprint = generateFingerprintFromList(
        blockingThreads.map(t => t.comments[0].body).sort()
      );

      this.logEvaluation(prNumber, 'unmet', {
        comment_count: blockingThreads.length,
        nitpick_count: unresolvedThreads.length - blockingThreads.length
      });

      return {
        condition_id: this.getConditionId(),
        status: 'unmet',
        fingerprint,
        blocking_issues,
        metadata: { 
          comment_count: blockingThreads.length,
          nitpick_count: unresolvedThreads.length - blockingThreads.length
        }
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_comments_failed',
        message: `Failed to evaluate comments for PR #${prNumber}`,
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
