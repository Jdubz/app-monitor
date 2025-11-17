/**
 * Phase 5: Test & Validate Validator
 * 
 * Validates comprehensive test execution and quality gates.
 * This is the most complex validator with multiple validation gates.
 * 
 * Expected artifact structure (from agent output):
 * {
 *   "all_tests_passing": true,
 *   "coverage_delta": 5.2,  // % change on modified files
 *   "test_summary": {
 *     "unit": { "total": 150, "passed": 150, "failed": 0 },
 *     "integration": { "total": 45, "passed": 45, "failed": 0 },
 *     "e2e": { "total": 20, "passed": 20, "failed": 0 }
 *   },
 *   "lint_passing": true,
 *   "type_check_passing": true,
 *   "build_passing": true,
 *   "failures": []  // Empty if all passing
 * }
 * 
 * Internal Loop Logic:
 * - If all_tests_passing === false: Stay in Phase 5, retry (up to 4 attempts)
 * - If all_tests_passing === true: Advance to Phase 6 (Cleanup)
 * 
 * All gates must pass for validation to succeed.
 */

import { logger } from '../../utils/logger.js';
import type { Task } from '../taskQueue.sqlite.js';
import type { 
  PhaseValidator, 
  ValidationResult, 
  PhaseArtifacts,
} from './types.js';

export class Phase5TestValidator implements PhaseValidator {
  readonly phaseIndex = 5;
  readonly phaseName = 'Test & Validate';

  async validate(task: Task, artifacts: PhaseArtifacts): Promise<ValidationResult> {
    const tests = artifacts.tests;

    // Check if test artifacts exist
    if (!tests) {
      return {
        passed: false,
        errors: ['No test artifacts found in agent output'],
        details: { 
          stdout: artifacts.stdout?.substring(0, 500),
          exitCode: artifacts.exitCode 
        },
      };
    }

    // Validate JSON structure (must be object, not null or array)
    if (typeof tests !== 'object' || tests === null || Array.isArray(tests)) {
      return {
        passed: false,
        errors: ['Test artifacts are not a valid JSON object'],
        details: { tests },
      };
    }

    // Validate required fields
    const errors: string[] = [];

    if (typeof tests.all_tests_passing !== 'boolean') {
      errors.push('Missing or invalid all_tests_passing flag');
    }

    if (typeof tests.coverage_delta !== 'number') {
      errors.push('Missing or invalid coverage_delta');
    }

    if (!tests.test_summary || typeof tests.test_summary !== 'object' || Array.isArray(tests.test_summary)) {
      errors.push('Missing or invalid test_summary object');
    }

    if (typeof tests.lint_passing !== 'boolean') {
      errors.push('Missing or invalid lint_passing flag');
    }

    if (typeof tests.type_check_passing !== 'boolean') {
      errors.push('Missing or invalid type_check_passing flag');
    }

    if (typeof tests.build_passing !== 'boolean') {
      errors.push('Missing or invalid build_passing flag');
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        details: { tests },
      };
    }

    // Validate test_summary structure
    const testSummaryErrors: string[] = [];
    const requiredSuites = ['unit', 'integration', 'e2e'];

    for (const suite of requiredSuites) {
      const suiteData = tests.test_summary[suite as keyof typeof tests.test_summary];
      
      if (!suiteData || typeof suiteData !== 'object' || Array.isArray(suiteData)) {
        testSummaryErrors.push(`Missing or invalid ${suite} test suite data`);
        continue;
      }

      if (typeof suiteData.total !== 'number' || suiteData.total < 0) {
        testSummaryErrors.push(`${suite}: Invalid total count`);
      }

      if (typeof suiteData.passed !== 'number' || suiteData.passed < 0) {
        testSummaryErrors.push(`${suite}: Invalid passed count`);
      }

      if (typeof suiteData.failed !== 'number' || suiteData.failed < 0) {
        testSummaryErrors.push(`${suite}: Invalid failed count`);
      }

      // Validate math: passed + failed should equal total
      if (suiteData.total !== undefined && 
          suiteData.passed !== undefined && 
          suiteData.failed !== undefined) {
        if (suiteData.passed + suiteData.failed !== suiteData.total) {
          testSummaryErrors.push(`${suite}: Count mismatch (passed + failed ≠ total)`);
        }
      }
    }

    if (testSummaryErrors.length > 0) {
      return {
        passed: false,
        errors: testSummaryErrors,
        details: { tests },
      };
    }

    // Validate failures array
    if (!Array.isArray(tests.failures)) {
      return {
        passed: false,
        errors: ['Missing or invalid failures array'],
        details: { tests },
      };
    }

    // Calculate total test counts
    const totalTests = 
      tests.test_summary.unit.total +
      tests.test_summary.integration.total +
      tests.test_summary.e2e.total;

    const totalPassed =
      tests.test_summary.unit.passed +
      tests.test_summary.integration.passed +
      tests.test_summary.e2e.passed;

    const totalFailed =
      tests.test_summary.unit.failed +
      tests.test_summary.integration.failed +
      tests.test_summary.e2e.failed;

    // Determine if all gates pass
    const allTestsPassing = tests.all_tests_passing;
    const allGatesPassing = 
      allTestsPassing &&
      tests.lint_passing &&
      tests.type_check_passing &&
      tests.build_passing;

    // Log results
    logger.info({
      category: 'phase',
      action: 'tests_validated',
      message: `Task ${task.id} test phase complete - ${totalPassed}/${totalTests} tests passing`,
      details: {
        taskId: task.id,
        totalTests,
        totalPassed,
        totalFailed,
        coverageDelta: tests.coverage_delta,
        lintPassing: tests.lint_passing,
        typeCheckPassing: tests.type_check_passing,
        buildPassing: tests.build_passing,
        allGatesPassing,
        nextPhase: allGatesPassing ? 6 : 5, // 6 if success, 5 to retry
      },
    });

    return {
      passed: true,
      allTestsPassing: allGatesPassing, // PhaseOrchestrator uses this for routing
      artifacts: tests,
      details: {
        total_tests: totalTests,
        passed_tests: totalPassed,
        failed_tests: totalFailed,
        coverage_delta: tests.coverage_delta,
        lint_passing: tests.lint_passing,
        type_check_passing: tests.type_check_passing,
        build_passing: tests.build_passing,
        all_gates_passing: allGatesPassing,
        failures: tests.failures,
      },
    };
  }
}
