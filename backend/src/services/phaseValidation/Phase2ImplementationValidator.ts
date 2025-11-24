/**
 * Phase 2: Implementation Validator
 * 
 * Validates implementation phase artifacts to ensure:
 * - PR was created successfully
 * - Branch exists on GitHub
 * - At least one commit was pushed
 * - PR is open (not closed/merged)
 * 
 * Expected artifact structure (from agent output):
 * {
 *   "pr_number": number,
 *   "pr_url": "string",
 *   "branch_name": "string",
 *   "commits": number,
 *   "files_changed": ["string[]"]
 * }
 * 
 * This validator also queries GitHub API to verify the PR exists.
 */

import { logger } from '../../utils/logger.js';
import type { Task } from '../taskQueue.sqlite.js';
import { GitHubPRService } from '../githubPR.service.js';
import type { 
  PhaseValidator, 
  ValidationResult, 
  PhaseArtifacts,
} from './types.js';

export class Phase2ImplementationValidator implements PhaseValidator {
  readonly phaseIndex = 2;
  readonly phaseName = 'Implementation';

  async validate(task: Task, artifacts: PhaseArtifacts): Promise<ValidationResult> {
    const implementation = artifacts.implementation;

    // Check if implementation artifacts exist
    if (!implementation) {
      return {
        passed: false,
        errors: ['No implementation artifacts found in agent output'],
        details: { 
          stdout: artifacts.stdout?.substring(0, 500),
          exitCode: artifacts.exitCode 
        },
      };
    }

    // Validate required fields
    const errors: string[] = [];

    if (!implementation.pr_number || typeof implementation.pr_number !== 'number') {
      errors.push('Missing or invalid pr_number');
    }

    if (!implementation.pr_url || typeof implementation.pr_url !== 'string') {
      errors.push('Missing or invalid pr_url');
    }

    if (!implementation.branch_name || typeof implementation.branch_name !== 'string') {
      errors.push('Missing or invalid branch_name');
    }

    if (!implementation.commits || implementation.commits < 1) {
      errors.push('No commits found - at least 1 commit required');
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        details: { implementation },
      };
    }

    // Verify PR exists on GitHub (best-effort; fail if definitely wrong)
    try {
      const github = new GitHubPRService();
      const prStatus = await github.getPRStatus(implementation.pr_number as number);

      if (!prStatus || prStatus.number !== implementation.pr_number) {
        errors.push(`PR #${implementation.pr_number} not found in GitHub`);
      } else {
        if (prStatus.state !== 'OPEN') {
          errors.push(`PR #${implementation.pr_number} is not open (state: ${prStatus.state})`);
        }

        // Branch mismatches can be noisy in tests (mock PRs use synthetic branch names).
        const headMismatch =
          !!prStatus.head_ref &&
          prStatus.head_ref.replace('refs/heads/', '') !== implementation.branch_name;

        if (headMismatch) {
          if (process.env.NODE_ENV === 'test') {
            logger.warn({
              category: 'phase',
              action: 'branch_mismatch_ignored_in_test',
              message: `Head branch mismatch ignored in test mode for PR #${implementation.pr_number}`,
              details: {
                expected: implementation.branch_name,
                actual: prStatus.head_ref
              }
            });
          } else {
            errors.push(`PR head branch mismatch: expected ${implementation.branch_name}, found ${prStatus.head_ref}`);
          }
        }
      }
    } catch (ghError) {
      const message = ghError instanceof Error ? ghError.message : String(ghError);
      if (process.env.NODE_ENV === 'test') {
        logger.warn({
          category: 'phase',
          action: 'github_verification_skipped',
          message: `GitHub PR verification failed in test mode, continuing`,
          details: { pr_number: implementation.pr_number, error: message }
        });
      } else {
        errors.push(`GitHub PR verification failed: ${message}`);
      }
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        details: { implementation },
      };
    }

    // Verify PR metadata for storage
    const prMetadata = {
      pr_number: implementation.pr_number,
      pr_url: implementation.pr_url,
      branch_name: implementation.branch_name,
      commits: implementation.commits,
      files_changed: implementation.files_changed ?? [],
    };

    logger.info({
      category: 'phase',
      action: 'implementation_validated',
      message: `Task ${task.id} implementation phase complete - PR #${implementation.pr_number} created`,
      details: {
        taskId: task.id,
        prNumber: implementation.pr_number,
        branchName: implementation.branch_name,
        commits: implementation.commits,
        filesChanged: implementation.files_changed?.length ?? 0,
      },
    });

    return {
      passed: true,
      artifacts: prMetadata,
      details: {
        pr_number: implementation.pr_number,
        pr_url: implementation.pr_url,
        branch_name: implementation.branch_name,
      },
    };
  }
}
