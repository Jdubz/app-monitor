/**
 * Phase 4: Fixes Validator
 * 
 * Validates that fixes were applied for issues identified in Phase 3.
 * Matches fixes to review issues using fingerprints.
 * 
 * Expected artifact structure (from agent output):
 * {
 *   "fixes_applied": [
 *     {
 *       "fingerprint": "sha256:abc123...",  // Must match Phase 3 issue
 *       "resolution": "Description of fix applied",
 *       "files_modified": ["path/to/file.ts"],
 *       "commits": ["abc123def"]
 *     }
 *   ],
 *   "unresolved_fingerprints": ["sha256:xyz789..."],
 *   "all_issues_addressed": false
 * }
 * 
 * Critical Logic:
 * - Phase 4 ALWAYS returns to Phase 3 for re-review (per PhaseOrchestrator)
 * - The all_issues_addressed flag is informational only
 * - Attempt counter is maintained across the Phase 3↔4 loop
 * 
 * This validator does NOT verify if fixes actually work - that's Phase 3's job.
 */

import { logger } from '../../utils/logger.js';
import type { Task } from '../taskQueue.sqlite.js';
import type { 
  PhaseValidator, 
  ValidationResult, 
  PhaseArtifacts,
} from './types.js';

export class Phase4FixesValidator implements PhaseValidator {
  readonly phaseIndex = 4;
  readonly phaseName = 'Fixes';

  async validate(task: Task, artifacts: PhaseArtifacts): Promise<ValidationResult> {
    const fixes = artifacts.fixes;

    // Check if fixes artifacts exist
    if (!fixes) {
      return {
        passed: false,
        errors: ['No fixes artifacts found in agent output'],
        details: { 
          stdout: artifacts.stdout?.substring(0, 500),
          exitCode: artifacts.exitCode 
        },
      };
    }

    // Validate JSON structure (must be object, not null or array)
    if (typeof fixes !== 'object' || fixes === null || Array.isArray(fixes)) {
      return {
        passed: false,
        errors: ['Fixes artifacts are not a valid JSON object'],
        details: { fixes },
      };
    }

    // Validate required fields
    const errors: string[] = [];

    if (!Array.isArray(fixes.fixes_applied)) {
      errors.push('Missing or invalid fixes_applied array');
    }

    if (!Array.isArray(fixes.unresolved_fingerprints)) {
      errors.push('Missing or invalid unresolved_fingerprints array');
    }

    if (typeof fixes.all_issues_addressed !== 'boolean') {
      errors.push('Missing or invalid all_issues_addressed flag');
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        details: { fixes },
      };
    }

    // Validate each fix has required fields
    const fixErrors: string[] = [];
    const fixFingerprints = new Set<string>();

    for (let i = 0; i < fixes.fixes_applied.length; i++) {
      const fix = fixes.fixes_applied[i];
      
      if (!fix.fingerprint || typeof fix.fingerprint !== 'string') {
        fixErrors.push(`Fix ${i}: Missing or invalid fingerprint`);
      } else {
        // Check for duplicate fingerprints (same issue fixed twice)
        if (fixFingerprints.has(fix.fingerprint)) {
          fixErrors.push(`Fix ${i}: Duplicate fix for fingerprint ${fix.fingerprint}`);
        }
        fixFingerprints.add(fix.fingerprint);
      }

      if (!fix.resolution || typeof fix.resolution !== 'string') {
        fixErrors.push(`Fix ${i}: Missing or invalid resolution description`);
      }

      if (!Array.isArray(fix.files_modified) || fix.files_modified.length === 0) {
        fixErrors.push(`Fix ${i}: Missing or empty files_modified array`);
      }

      if (!Array.isArray(fix.commits) || fix.commits.length === 0) {
        fixErrors.push(`Fix ${i}: Missing or empty commits array`);
      }
    }

    if (fixErrors.length > 0) {
      return {
        passed: false,
        errors: fixErrors,
        details: { fixes },
      };
    }

    // Validate fingerprint consistency
    // All unresolved fingerprints should not appear in fixes_applied
    for (const unresolvedFp of fixes.unresolved_fingerprints) {
      if (fixFingerprints.has(unresolvedFp)) {
        errors.push(`Fingerprint ${unresolvedFp} is in both fixes_applied and unresolved_fingerprints`);
      }
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        details: { fixes },
      };
    }

    // Determine routing
    // CRITICAL: Phase 4 ALWAYS returns to Phase 3 for re-review (per PhaseOrchestrator)
    // The all_issues_addressed flag is informational for logging/debugging only
    const allIssuesAddressed = fixes.all_issues_addressed;

    logger.info({
      category: 'phase',
      action: 'fixes_validated',
      message: `Task ${task.id} fixes phase complete - ${fixes.fixes_applied.length} fixes applied, ${fixes.unresolved_fingerprints.length} unresolved`,
      details: {
        taskId: task.id,
        fixesApplied: fixes.fixes_applied.length,
        unresolvedCount: fixes.unresolved_fingerprints.length,
        allIssuesAddressed,
        nextPhase: 3, // Always return to Phase 3 for re-review
      },
    });

    return {
      passed: true,
      allIssuesAddressed, // PhaseOrchestrator uses this for routing
      artifacts: fixes,
      details: {
        fixes_count: fixes.fixes_applied.length,
        unresolved_count: fixes.unresolved_fingerprints.length,
        all_addressed: allIssuesAddressed,
      },
    };
  }
}
