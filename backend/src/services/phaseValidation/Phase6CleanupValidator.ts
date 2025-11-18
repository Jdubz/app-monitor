/**
 * Phase 6: Cleanup Validator
 * 
 * Validates documentation updates and artifact cleanup.
 * 
 * Expected artifact structure (from agent output):
 * {
 *   "docs_updated": ["docs/api.md", "README.md"],
 *   "docs_deleted": ["docs/deprecated.md"],  // Per DOCUMENTATION_SYSTEM.md
 *   "artifacts_pruned": [".phase-artifacts/phase-1-attempt-1/"],
 *   "changelog_entry": "Added new authentication system"
 * }
 * 
 * Validation:
 * - Ensures documentation changes were made
 * - Validates artifact cleanup occurred
 * - Checks for changelog entry (optional but recommended)
 * 
 * Always advances to Phase 7 (PR Shepherding) on success.
 */

import { logger } from '../../utils/logger.js';
import type { Task } from '../taskQueue.sqlite.js';
import type { 
  PhaseValidator, 
  ValidationResult, 
  PhaseArtifacts,
} from './types.js';

export class Phase6CleanupValidator implements PhaseValidator {
  readonly phaseIndex = 6;
  readonly phaseName = 'Cleanup';

  async validate(task: Task, artifacts: PhaseArtifacts): Promise<ValidationResult> {
    const cleanup = artifacts.cleanup;

    // Check if cleanup artifacts exist
    if (!cleanup) {
      return {
        passed: false,
        errors: ['No cleanup artifacts found in agent output'],
        details: { 
          stdout: artifacts.stdout?.substring(0, 500),
          exitCode: artifacts.exitCode 
        },
      };
    }

    // Validate JSON structure (must be object, not null or array)
    if (typeof cleanup !== 'object' || cleanup === null || Array.isArray(cleanup)) {
      return {
        passed: false,
        errors: ['Cleanup artifacts are not a valid JSON object'],
        details: { cleanup },
      };
    }

    // Validate required fields
    const errors: string[] = [];

    if (!Array.isArray(cleanup.docs_updated)) {
      errors.push('Missing or invalid docs_updated array');
    }

    if (!Array.isArray(cleanup.docs_deleted)) {
      errors.push('Missing or invalid docs_deleted array');
    }

    if (!Array.isArray(cleanup.artifacts_pruned)) {
      errors.push('Missing or invalid artifacts_pruned array');
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        details: { cleanup },
      };
    }

    // Changelog entry is optional but recommended
    const hasChangelog = Boolean(cleanup.changelog_entry && 
                                  typeof cleanup.changelog_entry === 'string' &&
                                  cleanup.changelog_entry.length > 0);

    // Calculate totals
    const totalDocsUpdated = cleanup.docs_updated.length;
    const totalDocsDeleted = cleanup.docs_deleted.length;
    const totalArtifactsPruned = cleanup.artifacts_pruned.length;

    logger.info({
      category: 'phase',
      action: 'cleanup_validated',
      message: `Task ${task.id} cleanup phase complete - ${totalDocsUpdated} docs updated, ${totalDocsDeleted} deleted`,
      details: {
        taskId: task.id,
        docsUpdated: totalDocsUpdated,
        docsDeleted: totalDocsDeleted,
        artifactsPruned: totalArtifactsPruned,
        hasChangelog,
        nextPhase: 7, // Always advance to PR Shepherding
      },
    });

    return {
      passed: true,
      artifacts: cleanup,
      details: {
        docs_updated_count: totalDocsUpdated,
        docs_deleted_count: totalDocsDeleted,
        artifacts_pruned_count: totalArtifactsPruned,
        has_changelog: hasChangelog,
      },
    };
  }
}
