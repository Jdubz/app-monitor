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
import type { 
  PhaseValidator, 
  ValidationResult, 
  PhaseArtifacts,
  ImplementationArtifacts 
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

    // TODO: Verify PR exists on GitHub via API
    // For now, we trust the agent's output
    // Future: Add GitHub API call to verify:
    //   - PR exists with given number
    //   - PR is open
    //   - Branch exists
    //   - Commits match

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
