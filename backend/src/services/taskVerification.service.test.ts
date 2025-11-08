import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TaskVerificationService } from './taskVerification.service.js';
import type { Task } from './taskQueue.sqlite.js';
import { execSync } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('TaskVerificationService', () => {
  let service: TaskVerificationService;
  let mockTask: Task;

  beforeEach(() => {
    service = new TaskVerificationService();
    mockTask = {
      id: 'test-task-123',
      type: 'implementation',
      title: 'Test Task',
      description: 'Test task description',
      status: 'running',
      priority: 1,
      created_at: Date.now(),
      assigned_agent: 'test-agent',
      can_retry: true,
      retry_count: 0,
      max_retries: 3,
      timeout_ms: null,
      acceptance_criteria: [
        'Add new authentication endpoint',
        'All tests pass',
        'Documentation updated'
      ]
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Acceptance Criteria Verification', () => {
    it('should verify all acceptance criteria are met', async () => {
      const taskOutput = `
        Created new authentication endpoint at /api/auth/login
        All tests are passing
        README.md documentation has been updated
      `;

      // Mock git commands
      (execSync as any).mockImplementation((cmd: string) => {
        if (cmd.includes('git status')) {
          return 'A  src/api/auth/login.ts\nM  README.md';
        }
        if (cmd.includes('git diff')) {
          return 'M  README.md';
        }
        return '';
      });

      const result = await service.verifyTask(mockTask, '/workspace', taskOutput);

      expect(result.passed).toBe(true);
      expect(result.acceptanceCriteria.allMet).toBe(true);
      expect(result.acceptanceCriteria.metCount).toBe(3);
      expect(result.acceptanceCriteria.percentMet).toBe(100);
    });

    it('should detect unmet acceptance criteria', async () => {
      const taskOutput = 'Created authentication endpoint but tests are failing';

      (execSync as any).mockImplementation(() => '');

      const result = await service.verifyTask(mockTask, '/workspace', taskOutput);

      expect(result.passed).toBe(false);
      expect(result.acceptanceCriteria.allMet).toBe(false);
      expect(result.acceptanceCriteria.metCount).toBeLessThan(3);
    });

    it('should handle tasks without acceptance criteria', async () => {
      const taskWithoutCriteria = { ...mockTask, acceptance_criteria: undefined };

      const result = await service.verifyTask(taskWithoutCriteria, '/workspace', '');

      expect(result.passed).toBe(true);
      expect(result.acceptanceCriteria.allMet).toBe(true);
      expect(result.acceptanceCriteria.criteria).toHaveLength(1);
      expect(result.acceptanceCriteria.criteria[0].text).toBe('Task completed as described');
    });
  });

  describe('Test Coverage Verification', () => {
    it('should parse coverage output and verify threshold', async () => {
      const taskWithTests = {
        ...mockTask,
        files: ['backend/src/auth.ts'],
        testing_requirements: ['Unit tests required']
      };

      const coverageOutput = `
        Coverage summary:
        Statements   : 85.23% ( 234/275 )
        Branches     : 78.45% ( 123/157 )
        Functions    : 82.11% ( 89/108 )
        Lines        : 85.23% ( 234/275 )
      `;

      (execSync as any).mockImplementation((cmd: string) => {
        if (cmd.includes('test:coverage')) {
          return coverageOutput;
        }
        return '';
      });

      const result = await service.verifyTask(taskWithTests, '/workspace', '');

      expect(result.testCoverage).toBeDefined();
      expect(result.testCoverage!.totalCoverage).toBe(85.23);
      expect(result.testCoverage!.meetsThreshold).toBe(true);
      expect(result.testCoverage!.passed).toBe(true);
    });

    it('should fail when coverage is below threshold', async () => {
      const taskWithTests = {
        ...mockTask,
        files: ['backend/src/auth.ts']
      };

      const lowCoverageOutput = `
        Coverage summary:
        Statements   : 65.00% ( 180/275 )
        Branches     : 58.45% ( 92/157 )
        Functions    : 62.11% ( 67/108 )
        Lines        : 65.00% ( 180/275 )
      `;

      (execSync as any).mockImplementation((cmd: string) => {
        if (cmd.includes('test:coverage')) {
          return lowCoverageOutput;
        }
        return '';
      });

      const result = await service.verifyTask(taskWithTests, '/workspace', '');

      expect(result.testCoverage).toBeDefined();
      expect(result.testCoverage!.totalCoverage).toBe(65.00);
      expect(result.testCoverage!.meetsThreshold).toBe(false);
      expect(result.passed).toBe(false);
      expect(result.recommendations).toContain(
        'Increase test coverage by 15.0% to meet 80% threshold'
      );
    });

    it('should handle coverage command failure gracefully', async () => {
      const taskWithTests = {
        ...mockTask,
        files: ['backend/src/auth.ts']
      };

      (execSync as any).mockImplementation((cmd: string) => {
        if (cmd.includes('test:coverage')) {
          throw new Error('Coverage command failed');
        }
        return '';
      });

      const result = await service.verifyTask(taskWithTests, '/workspace', '');

      expect(result.testCoverage).toBeDefined();
      expect(result.testCoverage!.passed).toBe(false);
      expect(result.testCoverage!.totalCoverage).toBe(0);
    });
  });

  describe('Scope Boundary Verification', () => {
    it('should detect mustNotChange violations', async () => {
      const taskWithBoundaries = {
        ...mockTask,
        context_boundaries: {
          mustNotChange: ['database.ts', 'config.ts'],
          mustNotAffect: [],
          integrationPoints: []
        }
      };

      (execSync as any).mockImplementation((cmd: string) => {
        if (cmd.includes('git diff --name-status')) {
          return 'M\tdatabase.ts\nA\tnewfile.ts';
        }
        if (cmd.includes('git ls-files')) {
          return '';
        }
        return '';
      });

      const result = await service.verifyTask(taskWithBoundaries, '/workspace', '');

      expect(result.scopeBoundaries).toBeDefined();
      expect(result.scopeBoundaries!.passed).toBe(false);
      expect(result.scopeBoundaries!.violations).toHaveLength(1);
      expect(result.scopeBoundaries!.violations[0].type).toBe('mustNotChange');
      expect(result.scopeBoundaries!.violations[0].file).toBe('database.ts');
    });

    it('should detect doNotCreate violations', async () => {
      const taskWithRestrictions: any = {
        ...mockTask,
        doNotCreate: ['migrations/', 'tests/']
      };

      (execSync as any).mockImplementation((cmd: string) => {
        if (cmd.includes('git diff --name-status')) {
          return 'A\tmigrations/001_init.sql\nM\tsrc/index.ts';
        }
        if (cmd.includes('git ls-files')) {
          return 'tests/newtest.ts';
        }
        return '';
      });

      const result = await service.verifyTask(taskWithRestrictions, '/workspace', '');

      expect(result.scopeBoundaries).toBeDefined();
      expect(result.scopeBoundaries!.passed).toBe(false);
      expect(result.scopeBoundaries!.violations).toHaveLength(2);

      const migrationViolation = result.scopeBoundaries!.violations.find(
        v => v.file === 'migrations/001_init.sql'
      );
      expect(migrationViolation).toBeDefined();
      expect(migrationViolation!.type).toBe('doNotCreate');
    });

    it('should pass when no boundaries are violated', async () => {
      const taskWithBoundaries = {
        ...mockTask,
        context_boundaries: {
          mustNotChange: ['database.ts'],
          mustNotAffect: ['config/'],
          integrationPoints: []
        }
      };

      (execSync as any).mockImplementation((cmd: string) => {
        if (cmd.includes('git diff --name-status')) {
          return 'M\tsrc/auth.ts\nA\tsrc/newfile.ts';
        }
        if (cmd.includes('git ls-files')) {
          return '';
        }
        return '';
      });

      const result = await service.verifyTask(taskWithBoundaries, '/workspace', '');

      expect(result.scopeBoundaries).toBeDefined();
      expect(result.scopeBoundaries!.passed).toBe(true);
      expect(result.scopeBoundaries!.violations).toHaveLength(0);
    });
  });

  describe('Overall Verification', () => {
    it('should calculate correct overall score', async () => {
      const taskOutput = `
        Created authentication endpoint
        All tests passing
        Documentation updated
        Coverage: 85%
      `;

      (execSync as any).mockImplementation((cmd: string) => {
        if (cmd.includes('git status')) {
          return 'A  src/auth.ts\nM  README.md';
        }
        if (cmd.includes('test:coverage')) {
          return `
            Coverage summary:
            Lines        : 85.00% ( 85/100 )
          `;
        }
        return '';
      });

      const result = await service.verifyTask(mockTask, '/workspace', taskOutput);

      expect(result.overallScore).toBeGreaterThan(80);
      expect(result.passed).toBe(true);
    });

    it('should generate appropriate recommendations', async () => {
      const taskOutput = 'Partial implementation';

      (execSync as any).mockImplementation((cmd: string) => {
        if (cmd.includes('test:coverage')) {
          return `
            Coverage summary:
            Lines        : 60.00% ( 60/100 )
            Branches     : 45.00% ( 45/100 )
          `;
        }
        return '';
      });

      const result = await service.verifyTask(mockTask, '/workspace', taskOutput);

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations!.length).toBeGreaterThan(0);
      expect(result.recommendations!.some(r =>
        r.includes('Increase test coverage')
      )).toBe(true);
      expect(result.recommendations!.some(r =>
        r.includes('branch coverage')
      )).toBe(true);
    });

    it('should handle mixed success and failure conditions', async () => {
      const complexTask = {
        ...mockTask,
        acceptance_criteria: [
          'Feature implemented',
          'Tests pass',
          'Coverage > 80%',
          'Documentation updated'
        ],
        context_boundaries: {
          mustNotChange: ['core.ts'],
          mustNotAffect: [],
          integrationPoints: []
        }
      };

      const taskOutput = `
        Feature implemented successfully
        All tests are passing
        Coverage: 75%
        README updated
      `;

      (execSync as any).mockImplementation((cmd: string) => {
        if (cmd.includes('git diff --name-status')) {
          return 'M\tcore.ts\nM\tREADME.md';
        }
        if (cmd.includes('test:coverage')) {
          return `
            Coverage summary:
            Lines        : 75.00% ( 75/100 )
          `;
        }
        return '';
      });

      const result = await service.verifyTask(complexTask, '/workspace', taskOutput);

      expect(result.passed).toBe(false);
      expect(result.acceptanceCriteria.metCount).toBe(3); // 3 of 4 criteria met
      expect(result.testCoverage!.meetsThreshold).toBe(false);
      expect(result.scopeBoundaries!.passed).toBe(false);
      expect(result.overallScore).toBeLessThan(80);
      expect(result.recommendations!.length).toBeGreaterThan(0);
    });
  });

  describe('Pattern Recognition', () => {
    it('should recognize test passing patterns', async () => {
      const patterns = [
        '✓ 42 tests passed',
        'All tests passing',
        '100 passing',
        'Tests: 50/50 pass'
      ];

      for (const pattern of patterns) {
        const result = await service.verifyTask(
          { ...mockTask, acceptance_criteria: ['Tests pass'] },
          '/workspace',
          pattern
        );

        expect(result.acceptanceCriteria.criteria[0].met).toBe(true);
        expect(result.acceptanceCriteria.criteria[0].evidence).toContain('Test execution detected');
      }
    });

    it('should recognize build success patterns', async () => {
      const patterns = [
        'Build successful',
        'Compiled successfully',
        'Build: success',
        'Build completed without errors'
      ];

      for (const pattern of patterns) {
        const result = await service.verifyTask(
          { ...mockTask, acceptance_criteria: ['Build succeeds'] },
          '/workspace',
          pattern
        );

        expect(result.acceptanceCriteria.criteria[0].met).toBe(true);
        expect(result.acceptanceCriteria.criteria[0].evidence).toContain('Build success detected');
      }
    });
  });
});