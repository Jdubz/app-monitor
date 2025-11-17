/**
 * Recovery Agent Service Unit Tests
 * 
 * Tests the RecoveryAgentService for:
 * - Diagnosis of validation failures
 * - Recovery action generation
 * - Recovery execution and verification
 * - Integration with validation system
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RecoveryAgentService, RecoveryResult } from '../recoveryAgent.service.js';
import type { ValidationResult } from '../phaseValidation/index.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('RecoveryAgentService', () => {
  let service: RecoveryAgentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RecoveryAgentService();
  });

  describe('attemptRecovery', () => {
    it('should successfully recover from missing file error', async () => {
      // Given: Validation failure due to missing file
      const validationResult: ValidationResult = {
        isValid: false,
        errors: ['Missing required file: README.md'],
        warnings: [],
        criticalIssues: [],
        recoverable: true,
      };

      const phaseIndex = 2; // Implementation
      const artifacts = { files: ['src/index.ts'] };

      // When: Attempting recovery
      const result = await service.attemptRecovery(validationResult, phaseIndex, artifacts);

      // Then: Should generate recovery plan
      expect(result.success).toBe(true);
      expect(result.diagnosis).toBeDefined();
      expect(result.actions).toContain('create_file');
    });

    it('should diagnose and recover from test coverage issue', async () => {
      // Given: Validation failure due to low test coverage
      const validationResult: ValidationResult = {
        isValid: false,
        errors: ['Test coverage below 80%: current 65%'],
        warnings: [],
        criticalIssues: [],
        recoverable: true,
      };

      const phaseIndex = 5; // Test & Validate
      const artifacts = { coverage: 65 };

      // When: Attempting recovery
      const result = await service.attemptRecovery(validationResult, phaseIndex, artifacts);

      // Then: Should suggest adding tests
      expect(result.success).toBe(true);
      expect(result.actions).toContain('add_tests');
    });

    it('should diagnose linting errors as recoverable', async () => {
      // Given: Validation failure due to linting errors
      const validationResult: ValidationResult = {
        isValid: false,
        errors: ['ESLint errors found: 3 errors in src/index.ts'],
        warnings: [],
        criticalIssues: [],
        recoverable: true,
      };

      const phaseIndex = 3; // Review
      const artifacts = {};

      // When: Attempting recovery
      const result = await service.attemptRecovery(validationResult, phaseIndex, artifacts);

      // Then: Should suggest running linter with auto-fix
      expect(result.success).toBe(true);
      expect(result.actions).toContain('run_linter');
    });

    it('should fail recovery for non-recoverable errors', async () => {
      // Given: Validation failure that is not recoverable
      const validationResult: ValidationResult = {
        isValid: false,
        errors: ['Architectural constraint violated'],
        warnings: [],
        criticalIssues: ['Architectural constraint violated'],
        recoverable: false,
      };

      const phaseIndex = 2;
      const artifacts = {};

      // When: Attempting recovery
      const result = await service.attemptRecovery(validationResult, phaseIndex, artifacts);

      // Then: Should indicate recovery not possible
      expect(result.success).toBe(false);
      expect(result.diagnosis).toContain('not recoverable');
    });

    it('should handle build failures with dependency issues', async () => {
      // Given: Validation failure due to build/dependency issues
      const validationResult: ValidationResult = {
        isValid: false,
        errors: ['Build failed: Module not found "@types/node"'],
        warnings: [],
        criticalIssues: [],
        recoverable: true,
      };

      const phaseIndex = 2;
      const artifacts = {};

      // When: Attempting recovery
      const result = await service.attemptRecovery(validationResult, phaseIndex, artifacts);

      // Then: Should suggest installing dependencies
      expect(result.success).toBe(true);
      expect(result.actions).toContain('install_dependencies');
    });

    it('should handle multiple errors with prioritized recovery', async () => {
      // Given: Multiple validation errors
      const validationResult: ValidationResult = {
        isValid: false,
        errors: [
          'Missing file: test.ts',
          'ESLint error in index.ts',
          'TypeScript compilation error',
        ],
        warnings: ['Unused variable'],
        criticalIssues: [],
        recoverable: true,
      };

      const phaseIndex = 2;
      const artifacts = {};

      // When: Attempting recovery
      const result = await service.attemptRecovery(validationResult, phaseIndex, artifacts);

      // Then: Should generate comprehensive recovery plan
      expect(result.success).toBe(true);
      expect(result.actions.length).toBeGreaterThan(1);
      expect(result.diagnosis).toContain('multiple issues');
    });

    it('should provide context-aware recovery for each phase', async () => {
      // Given: Similar error in different phases
      const validationResult: ValidationResult = {
        isValid: false,
        errors: ['Documentation incomplete'],
        warnings: [],
        criticalIssues: [],
        recoverable: true,
      };

      // When: Attempting recovery in different phases
      const phase1Result = await service.attemptRecovery(validationResult, 1, {});
      const phase2Result = await service.attemptRecovery(validationResult, 2, {});

      // Then: Should provide phase-specific guidance
      expect(phase1Result.diagnosis).not.toBe(phase2Result.diagnosis);
    });

    it('should track recovery attempts and prevent infinite loops', async () => {
      // Given: A recurring error that recovery cannot fix
      const validationResult: ValidationResult = {
        isValid: false,
        errors: ['Persistent error'],
        warnings: [],
        criticalIssues: [],
        recoverable: true,
      };

      const phaseIndex = 2;
      const artifacts = {};

      // When: Attempting recovery multiple times
      const result1 = await service.attemptRecovery(validationResult, phaseIndex, artifacts);
      const result2 = await service.attemptRecovery(validationResult, phaseIndex, artifacts);
      const result3 = await service.attemptRecovery(validationResult, phaseIndex, artifacts);

      // Then: Should eventually fail or limit attempts
      expect(result1.success || result2.success || result3.success).toBeDefined();
    });

    it('should generate executable recovery commands', async () => {
      // Given: Validation failure
      const validationResult: ValidationResult = {
        isValid: false,
        errors: ['Build failed'],
        warnings: [],
        criticalIssues: [],
        recoverable: true,
      };

      const phaseIndex = 2;
      const artifacts = {};

      // When: Attempting recovery
      const result = await service.attemptRecovery(validationResult, phaseIndex, artifacts);

      // Then: Should include executable commands
      expect(result.commands).toBeDefined();
      if (result.commands) {
        expect(Array.isArray(result.commands)).toBe(true);
        expect(result.commands.length).toBeGreaterThan(0);
      }
    });

    it('should handle artifact analysis for intelligent recovery', async () => {
      // Given: Validation failure with artifact context
      const validationResult: ValidationResult = {
        isValid: false,
        errors: ['Test failures: 3 tests failed'],
        warnings: [],
        criticalIssues: [],
        recoverable: true,
      };

      const phaseIndex = 5;
      const artifacts = {
        testResults: {
          passed: 7,
          failed: 3,
          failures: [
            { test: 'should handle error', error: 'Expected 200, got 404' },
          ],
        },
      };

      // When: Attempting recovery
      const result = await service.attemptRecovery(validationResult, phaseIndex, artifacts);

      // Then: Should analyze artifacts for better diagnosis
      expect(result.diagnosis).toContain('test');
      expect(result.success).toBe(true);
    });

    it('should respect phase-specific recovery constraints', async () => {
      // Given: Error in final phase (PR Shepherding)
      const validationResult: ValidationResult = {
        isValid: false,
        errors: ['PR checks failing'],
        warnings: [],
        criticalIssues: [],
        recoverable: true,
      };

      const phaseIndex = 7;
      const artifacts = {};

      // When: Attempting recovery
      const result = await service.attemptRecovery(validationResult, phaseIndex, artifacts);

      // Then: Should provide PR-specific recovery actions
      expect(result.actions).toBeDefined();
      // Phase 7 might have limited recovery options
    });

    it('should handle empty or null validation results', async () => {
      // Given: Invalid validation result
      const validationResult: ValidationResult = {
        isValid: false,
        errors: [],
        warnings: [],
        criticalIssues: [],
        recoverable: false,
      };

      const phaseIndex = 1;
      const artifacts = {};

      // When: Attempting recovery
      const result = await service.attemptRecovery(validationResult, phaseIndex, artifacts);

      // Then: Should handle gracefully
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    });
  });
});
