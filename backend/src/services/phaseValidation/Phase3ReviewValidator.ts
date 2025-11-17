/**
 * Phase 3: Review Validator
 * 
 * Validates review phase artifacts to determine if code issues exist.
 * Uses fingerprint-based deduplication to track issues across iterations.
 * 
 * Expected artifact structure (from agent output):
 * {
 *   "issues": [
 *     {
 *       "fingerprint": "sha256:abc123...",
 *       "severity": "critical" | "major" | "minor",
 *       "file": "path/to/file.ts",
 *       "line": 42,
 *       "description": "Issue description",
 *       "blocking": true | false
 *     }
 *   ],
 *   "total_issues": 5,
 *   "blocking_issues": 2,
 *   "review_passed": false
 * }
 * 
 * Fingerprints are SHA256 hashes of (file + line + description) to uniquely
 * identify issues across review iterations.
 */

import { logger } from '../../utils/logger.js';
import type { Task } from '../taskQueue.sqlite.js';
import type { 
  PhaseValidator, 
  ValidationResult, 
  PhaseArtifacts,
} from './types.js';

export class Phase3ReviewValidator implements PhaseValidator {
  readonly phaseIndex = 3;
  readonly phaseName = 'Review';

  async validate(task: Task, artifacts: PhaseArtifacts): Promise<ValidationResult> {
    const review = artifacts.review;

    // Check if review artifacts exist
    if (!review) {
      return {
        passed: false,
        errors: ['No review artifacts found in agent output'],
        details: { 
          stdout: artifacts.stdout?.substring(0, 500),
          exitCode: artifacts.exitCode 
        },
      };
    }

    // Validate JSON structure (must be object, not null or array)
    if (typeof review !== 'object' || review === null || Array.isArray(review)) {
      return {
        passed: false,
        errors: ['Review artifacts are not a valid JSON object'],
        details: { review },
      };
    }

    // Validate required fields
    const errors: string[] = [];

    if (!Array.isArray(review.issues)) {
      errors.push('Missing or invalid issues array');
    }

    if (typeof review.total_issues !== 'number') {
      errors.push('Missing or invalid total_issues count');
    }

    if (typeof review.blocking_issues !== 'number') {
      errors.push('Missing or invalid blocking_issues count');
    }

    if (typeof review.review_passed !== 'boolean') {
      errors.push('Missing or invalid review_passed flag');
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        details: { review },
      };
    }

    // Validate each issue has required fields
    const issueErrors: string[] = [];
    const fingerprints = new Set<string>();

    for (let i = 0; i < review.issues.length; i++) {
      const issue = review.issues[i];
      
      if (!issue.fingerprint || typeof issue.fingerprint !== 'string') {
        issueErrors.push(`Issue ${i}: Missing or invalid fingerprint`);
      } else {
        // Check for duplicate fingerprints
        if (fingerprints.has(issue.fingerprint)) {
          issueErrors.push(`Issue ${i}: Duplicate fingerprint ${issue.fingerprint}`);
        }
        fingerprints.add(issue.fingerprint);
      }

      if (!issue.severity || !['critical', 'major', 'minor'].includes(issue.severity)) {
        issueErrors.push(`Issue ${i}: Missing or invalid severity (must be critical, major, or minor)`);
      }

      if (!issue.file || typeof issue.file !== 'string') {
        issueErrors.push(`Issue ${i}: Missing or invalid file path`);
      }

      if (typeof issue.line !== 'number' || issue.line < 1) {
        issueErrors.push(`Issue ${i}: Missing or invalid line number`);
      }

      if (!issue.description || typeof issue.description !== 'string') {
        issueErrors.push(`Issue ${i}: Missing or invalid description`);
      }

      if (typeof issue.blocking !== 'boolean') {
        issueErrors.push(`Issue ${i}: Missing or invalid blocking flag`);
      }
    }

    if (issueErrors.length > 0) {
      return {
        passed: false,
        errors: issueErrors,
        details: { review },
      };
    }

    // Validate counts match
    if (review.issues.length !== review.total_issues) {
      return {
        passed: false,
        errors: [`Issue count mismatch: found ${review.issues.length} issues but total_issues is ${review.total_issues}`],
        details: { review },
      };
    }

    const actualBlockingCount = review.issues.filter(i => i.blocking).length;
    if (actualBlockingCount !== review.blocking_issues) {
      return {
        passed: false,
        errors: [`Blocking count mismatch: found ${actualBlockingCount} blocking issues but blocking_issues is ${review.blocking_issues}`],
        details: { review },
      };
    }

    // Determine next phase based on review results
    const issuesFound = review.total_issues > 0;

    logger.info({
      category: 'phase',
      action: 'review_validated',
      message: `Task ${task.id} review phase complete - ${review.total_issues} issues found (${review.blocking_issues} blocking)`,
      details: {
        taskId: task.id,
        totalIssues: review.total_issues,
        blockingIssues: review.blocking_issues,
        reviewPassed: review.review_passed,
        nextPhase: issuesFound ? 4 : 5,
      },
    });

    return {
      passed: true,
      issuesFound, // PhaseOrchestrator uses this to route to Phase 4 or Phase 5
      artifacts: review,
      details: {
        total_issues: review.total_issues,
        blocking_issues: review.blocking_issues,
        review_passed: review.review_passed,
        fingerprints: Array.from(fingerprints),
      },
    };
  }
}
