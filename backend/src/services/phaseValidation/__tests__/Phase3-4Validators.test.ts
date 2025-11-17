/**
 * Phase 3 & 4 Validator Tests (Review/Fixes Loop)
 */

import { describe, it, expect } from 'vitest';
import { Phase3ReviewValidator } from '../Phase3ReviewValidator.js';
import { Phase4FixesValidator } from '../Phase4FixesValidator.js';
import type { Task } from '../../taskQueue.sqlite.js';
import type { PhaseArtifacts } from '../types.js';

describe('Phase3ReviewValidator', () => {
  const validator = new Phase3ReviewValidator();
  const mockTask: Task = {
    id: 'test-task-3',
    type: 'implementation',
    title: 'Test Task',
    status: 'running',
    created_at: Date.now(),
    assigned_agent: 'claude',
    priority: 5,
    can_retry: true,
    retry_count: 0,
    max_retries: 3,
    timeout_ms: null,
  } as Task;

  it('should have correct phase metadata', () => {
    expect(validator.phaseIndex).toBe(3);
    expect(validator.phaseName).toBe('Review');
  });

  it('should fail when no review artifacts exist', async () => {
    const artifacts: PhaseArtifacts = {
      stdout: 'Some output',
      exitCode: 0,
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('No review artifacts found in agent output');
  });

  it('should fail when review is null', async () => {
    const artifacts: PhaseArtifacts = {
      review: null as any,
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Review artifacts are not a valid JSON object');
  });

  it('should fail when review is an array', async () => {
    const artifacts: PhaseArtifacts = {
      review: [] as any,
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Review artifacts are not a valid JSON object');
  });

  it('should fail when required fields are missing', async () => {
    const artifacts: PhaseArtifacts = {
      review: {
        issues: [],
        // Missing total_issues, blocking_issues, review_passed
      } as any,
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('should fail when issues is not an array', async () => {
    const artifacts: PhaseArtifacts = {
      review: {
        issues: 'not-an-array' as any,
        total_issues: 0,
        blocking_issues: 0,
        review_passed: true,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Missing or invalid issues array');
  });

  it('should fail when issue has invalid fields', async () => {
    const artifacts: PhaseArtifacts = {
      review: {
        issues: [
          {
            fingerprint: 'sha256:abc123',
            severity: 'invalid' as any, // Invalid severity
            file: 'test.ts',
            line: 42,
            description: 'Test issue',
            blocking: true,
          },
        ],
        total_issues: 1,
        blocking_issues: 1,
        review_passed: false,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors?.some(e => e.includes('severity'))).toBe(true);
  });

  it('should fail when fingerprints are duplicated', async () => {
    const artifacts: PhaseArtifacts = {
      review: {
        issues: [
          {
            fingerprint: 'sha256:duplicate',
            severity: 'major',
            file: 'test.ts',
            line: 42,
            description: 'Issue 1',
            blocking: true,
          },
          {
            fingerprint: 'sha256:duplicate', // Duplicate!
            severity: 'minor',
            file: 'test2.ts',
            line: 10,
            description: 'Issue 2',
            blocking: false,
          },
        ],
        total_issues: 2,
        blocking_issues: 1,
        review_passed: false,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors?.some(e => e.includes('Duplicate fingerprint'))).toBe(true);
  });

  it('should fail when counts do not match', async () => {
    const artifacts: PhaseArtifacts = {
      review: {
        issues: [
          {
            fingerprint: 'sha256:abc123',
            severity: 'critical',
            file: 'test.ts',
            line: 42,
            description: 'Critical issue',
            blocking: true,
          },
        ],
        total_issues: 5, // Mismatch!
        blocking_issues: 1,
        review_passed: false,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors?.some(e => e.includes('count mismatch'))).toBe(true);
  });

  it('should validate clean review (no issues)', async () => {
    const artifacts: PhaseArtifacts = {
      review: {
        issues: [],
        total_issues: 0,
        blocking_issues: 0,
        review_passed: true,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.issuesFound).toBe(false); // Should route to Phase 5
    expect(result.details?.total_issues).toBe(0);
  });

  it('should validate review with issues found', async () => {
    const artifacts: PhaseArtifacts = {
      review: {
        issues: [
          {
            fingerprint: 'sha256:abc123',
            severity: 'critical',
            file: 'backend/src/auth.ts',
            line: 42,
            description: 'Unsafe password comparison',
            blocking: true,
          },
          {
            fingerprint: 'sha256:def456',
            severity: 'minor',
            file: 'backend/src/utils.ts',
            line: 15,
            description: 'Missing error handling',
            blocking: false,
          },
        ],
        total_issues: 2,
        blocking_issues: 1,
        review_passed: false,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.issuesFound).toBe(true); // Should route to Phase 4
    expect(result.details?.total_issues).toBe(2);
    expect(result.details?.blocking_issues).toBe(1);
  });
});

describe('Phase4FixesValidator', () => {
  const validator = new Phase4FixesValidator();
  const mockTask: Task = {
    id: 'test-task-4',
    type: 'implementation',
    title: 'Test Task',
    status: 'running',
    created_at: Date.now(),
    assigned_agent: 'claude',
    priority: 5,
    can_retry: true,
    retry_count: 0,
    max_retries: 3,
    timeout_ms: null,
  } as Task;

  it('should have correct phase metadata', () => {
    expect(validator.phaseIndex).toBe(4);
    expect(validator.phaseName).toBe('Fixes');
  });

  it('should fail when no fixes artifacts exist', async () => {
    const artifacts: PhaseArtifacts = {
      stdout: 'Some output',
      exitCode: 0,
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('No fixes artifacts found in agent output');
  });

  it('should fail when fixes is null or array', async () => {
    const artifacts1: PhaseArtifacts = { fixes: null as any };
    const artifacts2: PhaseArtifacts = { fixes: [] as any };

    const result1 = await validator.validate(mockTask, artifacts1);
    const result2 = await validator.validate(mockTask, artifacts2);

    expect(result1.passed).toBe(false);
    expect(result2.passed).toBe(false);
  });

  it('should fail when fix has missing fields', async () => {
    const artifacts: PhaseArtifacts = {
      fixes: {
        fixes_applied: [
          {
            fingerprint: 'sha256:abc123',
            resolution: 'Fixed the issue',
            files_modified: [], // Empty!
            commits: ['abc123'],
          },
        ],
        unresolved_fingerprints: [],
        all_issues_addressed: true,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors?.some(e => e.includes('files_modified'))).toBe(true);
  });

  it('should fail when duplicate fixes for same fingerprint', async () => {
    const artifacts: PhaseArtifacts = {
      fixes: {
        fixes_applied: [
          {
            fingerprint: 'sha256:duplicate',
            resolution: 'Fix 1',
            files_modified: ['test.ts'],
            commits: ['abc123'],
          },
          {
            fingerprint: 'sha256:duplicate', // Duplicate!
            resolution: 'Fix 2',
            files_modified: ['test.ts'],
            commits: ['def456'],
          },
        ],
        unresolved_fingerprints: [],
        all_issues_addressed: true,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors?.some(e => e.includes('Duplicate fix'))).toBe(true);
  });

  it('should fail when fingerprint in both fixed and unresolved', async () => {
    const artifacts: PhaseArtifacts = {
      fixes: {
        fixes_applied: [
          {
            fingerprint: 'sha256:conflict',
            resolution: 'Fixed it',
            files_modified: ['test.ts'],
            commits: ['abc123'],
          },
        ],
        unresolved_fingerprints: ['sha256:conflict'], // Conflict!
        all_issues_addressed: false,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors?.some(e => e.includes('both fixes_applied and unresolved'))).toBe(true);
  });

  it('should validate partial fixes (not all addressed)', async () => {
    const artifacts: PhaseArtifacts = {
      fixes: {
        fixes_applied: [
          {
            fingerprint: 'sha256:abc123',
            resolution: 'Fixed password comparison',
            files_modified: ['backend/src/auth.ts'],
            commits: ['abc123def'],
          },
        ],
        unresolved_fingerprints: ['sha256:def456'],
        all_issues_addressed: false, // Not done yet
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.allIssuesAddressed).toBe(false); // Should stay in Phase 4
    expect(result.details?.fixes_count).toBe(1);
    expect(result.details?.unresolved_count).toBe(1);
  });

  it('should validate all fixes addressed (ready for re-review)', async () => {
    const artifacts: PhaseArtifacts = {
      fixes: {
        fixes_applied: [
          {
            fingerprint: 'sha256:abc123',
            resolution: 'Fixed password comparison',
            files_modified: ['backend/src/auth.ts'],
            commits: ['abc123def'],
          },
          {
            fingerprint: 'sha256:def456',
            resolution: 'Added error handling',
            files_modified: ['backend/src/utils.ts'],
            commits: ['def456abc'],
          },
        ],
        unresolved_fingerprints: [],
        all_issues_addressed: true, // All done!
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.allIssuesAddressed).toBe(true); // Should go to Phase 3 for re-review
    expect(result.details?.fixes_count).toBe(2);
    expect(result.details?.unresolved_count).toBe(0);
  });
});
