/**
 * Phase 5, 6, 7 Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { Phase5TestValidator } from '../Phase5TestValidator.js';
import { Phase6CleanupValidator } from '../Phase6CleanupValidator.js';
import { Phase7PRShepherdingValidator } from '../Phase7PRShepherdingValidator.js';
import type { Task } from '../../taskQueue.sqlite.js';
import type { PhaseArtifacts } from '../types.js';

const mockTask: Task = {
  id: 'test-task-5',
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

describe('Phase5TestValidator', () => {
  const validator = new Phase5TestValidator();

  it('should have correct phase metadata', () => {
    expect(validator.phaseIndex).toBe(5);
    expect(validator.phaseName).toBe('Test & Validate');
  });

  it('should fail when no test artifacts exist', async () => {
    const artifacts: PhaseArtifacts = { stdout: 'output', exitCode: 0 };
    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('No test artifacts found in agent output');
  });

  it('should fail when test artifacts is null or array', async () => {
    const artifacts1: PhaseArtifacts = { tests: null as any };
    const artifacts2: PhaseArtifacts = { tests: [] as any };

    const result1 = await validator.validate(mockTask, artifacts1);
    const result2 = await validator.validate(mockTask, artifacts2);

    expect(result1.passed).toBe(false);
    expect(result2.passed).toBe(false);
  });

  it('should fail when test counts do not add up', async () => {
    const artifacts: PhaseArtifacts = {
      tests: {
        all_tests_passing: true,
        coverage_delta: 5.0,
        test_summary: {
          unit: { total: 10, passed: 7, failed: 2 }, // 7+2=9, not 10!
          integration: { total: 5, passed: 5, failed: 0 },
          e2e: { total: 3, passed: 3, failed: 0 },
        },
        lint_passing: true,
        type_check_passing: true,
        build_passing: true,
        failures: [],
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors?.some(e => e.includes('Count mismatch'))).toBe(true);
  });

  it('should validate all tests passing', async () => {
    const artifacts: PhaseArtifacts = {
      tests: {
        all_tests_passing: true,
        coverage_delta: 8.5,
        test_summary: {
          unit: { total: 150, passed: 150, failed: 0 },
          integration: { total: 45, passed: 45, failed: 0 },
          e2e: { total: 20, passed: 20, failed: 0 },
        },
        lint_passing: true,
        type_check_passing: true,
        build_passing: true,
        failures: [],
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.allTestsPassing).toBe(true); // Should advance to Phase 6
    expect(result.details?.total_tests).toBe(215);
    expect(result.details?.passed_tests).toBe(215);
  });

  it('should handle failing tests (internal loop)', async () => {
    const artifacts: PhaseArtifacts = {
      tests: {
        all_tests_passing: false,
        coverage_delta: 3.0,
        test_summary: {
          unit: { total: 150, passed: 148, failed: 2 },
          integration: { total: 45, passed: 45, failed: 0 },
          e2e: { total: 20, passed: 18, failed: 2 },
        },
        lint_passing: true,
        type_check_passing: true,
        build_passing: true,
        failures: [
          { suite: 'unit', test: 'auth.test.ts', error: 'Expected 200, got 401' },
          { suite: 'unit', test: 'user.test.ts', error: 'Timeout' },
          { suite: 'e2e', test: 'login.e2e.ts', error: 'Button not found' },
          { suite: 'e2e', test: 'signup.e2e.ts', error: 'Form validation failed' },
        ],
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.allTestsPassing).toBe(false); // Should stay in Phase 5
    expect(result.details?.failed_tests).toBe(4);
  });

  it('should fail if lint not passing', async () => {
    const artifacts: PhaseArtifacts = {
      tests: {
        all_tests_passing: true,
        coverage_delta: 5.0,
        test_summary: {
          unit: { total: 10, passed: 10, failed: 0 },
          integration: { total: 5, passed: 5, failed: 0 },
          e2e: { total: 3, passed: 3, failed: 0 },
        },
        lint_passing: false, // Lint failing!
        type_check_passing: true,
        build_passing: true,
        failures: [],
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.allTestsPassing).toBe(false); // Not all gates passing
  });
});

describe('Phase6CleanupValidator', () => {
  const validator = new Phase6CleanupValidator();

  it('should have correct phase metadata', () => {
    expect(validator.phaseIndex).toBe(6);
    expect(validator.phaseName).toBe('Cleanup');
  });

  it('should fail when no cleanup artifacts exist', async () => {
    const artifacts: PhaseArtifacts = { stdout: 'output' };
    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('No cleanup artifacts found in agent output');
  });

  it('should validate cleanup with changelog', async () => {
    const artifacts: PhaseArtifacts = {
      cleanup: {
        docs_updated: ['README.md', 'docs/api.md'],
        docs_deleted: ['docs/deprecated.md'],
        artifacts_pruned: ['.phase-artifacts/phase-1-attempt-1/'],
        changelog_entry: 'Added new authentication system',
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.details?.docs_updated_count).toBe(2);
    expect(result.details?.docs_deleted_count).toBe(1);
    expect(result.details?.has_changelog).toBe(true);
  });

  it('should validate cleanup without changelog', async () => {
    const artifacts: PhaseArtifacts = {
      cleanup: {
        docs_updated: [],
        docs_deleted: [],
        artifacts_pruned: ['.phase-artifacts/'],
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.details?.has_changelog).toBe(false);
  });
});

describe('Phase7PRShepherdingValidator', () => {
  const validator = new Phase7PRShepherdingValidator();

  it('should have correct phase metadata', () => {
    expect(validator.phaseIndex).toBe(7);
    expect(validator.phaseName).toBe('PR Shepherding');
  });

  it('should fail when missing gate', async () => {
    const artifacts: PhaseArtifacts = {
      prShepherding: {
        merge_gates: {
          base_branch_updated: true,
          no_merge_conflicts: true,
          // Missing other gates!
        } as any,
        all_gates_passing: false,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors?.some(e => e.includes('missing'))).toBe(true);
  });

  it('should fail when all_gates_passing inconsistent with actual gates', async () => {
    const artifacts: PhaseArtifacts = {
      prShepherding: {
        merge_gates: {
          base_branch_updated: true,
          no_merge_conflicts: false, // Failing!
          review_comments_resolved: true,
          change_requests_addressed: true,
          ci_checks_passing: true,
          copilot_review_complete: true,
          task_verification_passed: true,
          final_validation_clean: true,
        },
        all_gates_passing: true, // Inconsistent!
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors?.some(e => e.includes('only 7/8'))).toBe(true);
  });

  it('should validate all gates passing', async () => {
    const artifacts: PhaseArtifacts = {
      prShepherding: {
        merge_gates: {
          base_branch_updated: true,
          no_merge_conflicts: true,
          review_comments_resolved: true,
          change_requests_addressed: true,
          ci_checks_passing: true,
          copilot_review_complete: true,
          task_verification_passed: true,
          final_validation_clean: true,
        },
        all_gates_passing: true,
        auto_merge_triggered: true,
        merge_sha: 'abc123def456',
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.allGatesPassing).toBe(true); // Task complete!
    expect(result.details?.passing_gates).toBe(8);
    expect(result.details?.is_merged).toBe(true);
  });

  it('should handle some gates not passing', async () => {
    const artifacts: PhaseArtifacts = {
      prShepherding: {
        merge_gates: {
          base_branch_updated: true,
          no_merge_conflicts: true,
          review_comments_resolved: false, // Not resolved yet
          change_requests_addressed: false, // Pending
          ci_checks_passing: true,
          copilot_review_complete: true,
          task_verification_passed: true,
          final_validation_clean: true,
        },
        all_gates_passing: false,
        auto_merge_triggered: false,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.allGatesPassing).toBe(false); // Stay in Phase 7
    expect(result.details?.passing_gates).toBe(6);
  });
});
