/**
 * WIP Commits Evaluator
 *
 * Evaluates Condition 8: No WIP Commits
 * Checks if the PR contains work-in-progress commit messages that should be squashed/cleaned up.
 *
 * Detects patterns like:
 * - wip, work in progress
 * - fixup! (git rebase fixup commits)
 * - squash! (git rebase squash commits)
 * - tmp, temp, temporary
 * - debug, debugging
 */

import { BaseEvaluator } from './baseEvaluator.js';
import type { PRStatus } from '../../githubPR.service.js';
import type { ConditionEvaluation } from '../types.js';
import { logger } from '../../../utils/logger.js';

export class WIPCommitsEvaluator extends BaseEvaluator {
  // WIP patterns to detect (case-insensitive)
  private readonly WIP_PATTERNS = [
    /\bwip\b/i,
    /work in progress/i,
    /^fixup!/i,
    /^squash!/i,
    /\btmp\b/i,
    /\btemp\b/i,
    /\btemporary\b/i,
    /\bdebug/i,
    /\bdebugging\b/i,
    /remove later/i,
    /delete me/i,
    /\btodo\s*:/i  // TODO: commits that are placeholders
  ];

  getConditionId(): string {
    return 'no_wip_commits';
  }

  async evaluate(prNumber: number, prStatus?: PRStatus): Promise<ConditionEvaluation> {
    try {
      // Reuse prStatus if provided, otherwise fetch
      if (!prStatus) {
        prStatus = await this.github.getPRStatus(prNumber);
      }

      // If no commits data available, we can't evaluate
      if (!prStatus.commits || prStatus.commits.length === 0) {
        this.logEvaluation(prNumber, 'not_ready', {
          reason: 'no_commits_data'
        });
        return {
          condition_id: this.getConditionId(),
          status: 'not_ready',
          fingerprint: 'no-commits-data',
          blocking_issues: []
        };
      }

      // Check each commit for WIP patterns
      const wipCommits: Array<{ sha: string; message: string; pattern: string }> = [];

      for (const commit of prStatus.commits) {
        for (const pattern of this.WIP_PATTERNS) {
          if (pattern.test(commit.message)) {
            wipCommits.push({
              sha: commit.sha,
              message: commit.message,
              pattern: pattern.source
            });
            break; // Only record first match per commit
          }
        }
      }

      if (wipCommits.length === 0) {
        this.logEvaluation(prNumber, 'met', {
          totalCommits: prStatus.commits.length
        });
        return {
          condition_id: this.getConditionId(),
          status: 'met',
          fingerprint: 'no-wip-commits',
          blocking_issues: []
        };
      }

      // Found WIP commits - gate should fail
      const wipPatternNames = [...new Set(wipCommits.map(c => {
        const msg = c.message.toLowerCase();
        if (/\bwip\b/i.test(msg)) return 'wip';
        if (/work in progress/i.test(msg)) return 'work in progress';
        if (/^fixup!/i.test(msg)) return 'fixup';
        if (/^squash!/i.test(msg)) return 'squash';
        if (/\btmp\b/i.test(msg)) return 'tmp';
        if (/\btemp\b/i.test(msg) || /temporary/i.test(msg)) return 'temp';
        if (/debug/i.test(msg)) return 'debug';
        return 'other';
      }))];

      this.logEvaluation(prNumber, 'unmet', {
        wipCommitCount: wipCommits.length,
        totalCommits: prStatus.commits.length,
        patterns: wipPatternNames
      });

      return {
        condition_id: this.getConditionId(),
        status: 'unmet',
        fingerprint: `wip-commits-${wipPatternNames.join('-')}`,
        blocking_issues: [{
          type: `wip_commits_${wipPatternNames.join('_')}`,
          severity: 'medium'
        }]
      };
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'evaluate_wip_commits_failed',
        message: `Failed to evaluate WIP commits for PR #${prNumber}`,
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
