/**
 * Phase 3: Review - Service-Level Integration Test
 *
 * Tests the Review phase validator and orchestrator:
 * - No issues found (advance to Phase 5)
 * - Issues found (route to Phase 4)
 * - Multiple issues with different severities
 * - Fingerprint validation and deduplication
 * - Issue count validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { TaskQueueService } from '../taskQueue.sqlite.js';
import { PhaseOrchestratorService } from '../phaseOrchestrator.service.js';
import { ValidatorRegistry } from '../phaseValidation/ValidatorRegistry.js';
import type { Task } from '../taskQueue.sqlite.js';

describe('Phase 3: Review - Service Level Integration', () => {
  let db: Database.Database;
  let taskQueue: TaskQueueService;
  let orchestrator: PhaseOrchestratorService;
  let validatorRegistry: ValidatorRegistry;
  let taskId: string;

  beforeEach(async () => {
    // Setup in-memory database
    taskQueue = new TaskQueueService(':memory:');
    db = (taskQueue as any).db;

    // Setup services
    orchestrator = new PhaseOrchestratorService(db);
    validatorRegistry = new ValidatorRegistry();

    // Create a test task in Phase 3
    const task = await taskQueue.createTask({
      type: 'implementation',
      title: 'Add validation logic',
      description: 'Implement input validation',
      priority: 1
    });
    taskId = task.id;

    // Advance to Phase 3
    db.prepare('UPDATE tasks SET phase_index = 3, phase_name = ? WHERE id = ?')
      .run('Review', taskId);
  });

  afterEach(() => {
    try {
      vi.restoreAllMocks();
      db?.close();
    } catch (_err) {
      // Ignore cleanup errors
    }
  });

  describe('No Issues - Clean Review', () => {
    it('should pass review with no issues and advance to Phase 5', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const cleanArtifacts = {
        review: {
          issues: [],
          total_issues: 0,
          blocking_issues: 0,
          review_passed: true
        }
      };

      const validation = await validator.validate(task, cleanArtifacts);

      expect(validation.passed).toBe(true);
      expect(validation.errors).toBeUndefined();
      expect(validation.issuesFound).toBe(false);

      // Orchestrator should skip Phase 4 and go to Phase 5
      const transition = orchestrator.determineNextPhase(3, validation);
      expect(transition.toPhase).toBe(5);
      expect(transition.fromPhase).toBe(3);
    });
  });

  describe('Issues Found - Route to Fixes', () => {
    it('should find blocking issues and route to Phase 4', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const issuesArtifacts = {
        review: {
          issues: [
            {
              fingerprint: 'sha256:abc123',
              severity: 'critical' as const,
              file: 'src/validation.ts',
              line: 42,
              description: 'Missing null check before property access',
              blocking: true
            }
          ],
          total_issues: 1,
          blocking_issues: 1,
          review_passed: false
        }
      };

      const validation = await validator.validate(task, issuesArtifacts);

      expect(validation.passed).toBe(true);
      expect(validation.issuesFound).toBe(true);

      // Orchestrator should route to Phase 4 (Fixes)
      const transition = orchestrator.determineNextPhase(3, validation);
      expect(transition.toPhase).toBe(4);
      expect(transition.fromPhase).toBe(3);
    });

    it('should handle multiple issues with different severities', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const multipleIssuesArtifacts = {
        review: {
          issues: [
            {
              fingerprint: 'sha256:issue1',
              severity: 'critical' as const,
              file: 'src/auth.ts',
              line: 15,
              description: 'SQL injection vulnerability',
              blocking: true
            },
            {
              fingerprint: 'sha256:issue2',
              severity: 'major' as const,
              file: 'src/auth.ts',
              line: 28,
              description: 'Hardcoded credentials',
              blocking: true
            },
            {
              fingerprint: 'sha256:issue3',
              severity: 'minor' as const,
              file: 'src/utils.ts',
              line: 102,
              description: 'Unused variable',
              blocking: false
            }
          ],
          total_issues: 3,
          blocking_issues: 2,
          review_passed: false
        }
      };

      const validation = await validator.validate(task, multipleIssuesArtifacts);

      expect(validation.passed).toBe(true);
      expect(validation.issuesFound).toBe(true);
      expect(validation.details?.total_issues).toBe(3);
      expect(validation.details?.blocking_issues).toBe(2);
    });
  });

  describe('Validation Errors', () => {
    it('should reject missing review artifacts', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const invalidArtifacts = {
        stdout: 'Some output',
        stderr: '',
        exitCode: 0
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors![0]).toContain('No review artifacts');
    });

    it('should reject invalid review structure (array instead of object)', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const invalidArtifacts = {
        review: [] as any // Array instead of object
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors![0]).toContain('not a valid JSON object');
    });

    it('should reject missing issues array', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const invalidArtifacts = {
        review: {
          // Missing issues array
          total_issues: 0,
          blocking_issues: 0,
          review_passed: true
        }
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors!.some(e => e.includes('issues array'))).toBe(true);
    });

    it('should reject missing total_issues', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const invalidArtifacts = {
        review: {
          issues: [],
          // Missing total_issues
          blocking_issues: 0,
          review_passed: true
        }
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors!.some(e => e.includes('total_issues'))).toBe(true);
    });

    it('should reject issue count mismatch', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const invalidArtifacts = {
        review: {
          issues: [
            {
              fingerprint: 'sha256:issue1',
              severity: 'major' as const,
              file: 'src/test.ts',
              line: 10,
              description: 'Test issue',
              blocking: false
            }
          ],
          total_issues: 5, // Mismatch! Only 1 issue in array
          blocking_issues: 0,
          review_passed: false
        }
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors!.some(e => e.includes('count mismatch'))).toBe(true);
    });

    it('should reject blocking count mismatch', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const invalidArtifacts = {
        review: {
          issues: [
            {
              fingerprint: 'sha256:issue1',
              severity: 'critical' as const,
              file: 'src/test.ts',
              line: 10,
              description: 'Critical issue',
              blocking: true
            }
          ],
          total_issues: 1,
          blocking_issues: 5, // Mismatch! Only 1 blocking issue
          review_passed: false
        }
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors!.some(e => e.includes('Blocking count mismatch'))).toBe(true);
    });

    it('should reject duplicate fingerprints', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const invalidArtifacts = {
        review: {
          issues: [
            {
              fingerprint: 'sha256:duplicate',
              severity: 'major' as const,
              file: 'src/test.ts',
              line: 10,
              description: 'Issue 1',
              blocking: false
            },
            {
              fingerprint: 'sha256:duplicate', // Duplicate!
              severity: 'minor' as const,
              file: 'src/test.ts',
              line: 20,
              description: 'Issue 2',
              blocking: false
            }
          ],
          total_issues: 2,
          blocking_issues: 0,
          review_passed: false
        }
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors!.some(e => e.includes('Duplicate fingerprint'))).toBe(true);
    });

    it('should reject issue with invalid severity', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const invalidArtifacts = {
        review: {
          issues: [
            {
              fingerprint: 'sha256:issue1',
              severity: 'super-critical' as any, // Invalid severity
              file: 'src/test.ts',
              line: 10,
              description: 'Test issue',
              blocking: false
            }
          ],
          total_issues: 1,
          blocking_issues: 0,
          review_passed: false
        }
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors!.some(e => e.includes('severity'))).toBe(true);
    });
  });

  describe('Fingerprint Management', () => {
    it('should track unique fingerprints', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(3);

      const artifacts = {
        review: {
          issues: [
            {
              fingerprint: 'sha256:unique1',
              severity: 'major' as const,
              file: 'src/a.ts',
              line: 1,
              description: 'Issue 1',
              blocking: true
            },
            {
              fingerprint: 'sha256:unique2',
              severity: 'major' as const,
              file: 'src/b.ts',
              line: 2,
              description: 'Issue 2',
              blocking: true
            },
            {
              fingerprint: 'sha256:unique3',
              severity: 'minor' as const,
              file: 'src/c.ts',
              line: 3,
              description: 'Issue 3',
              blocking: false
            }
          ],
          total_issues: 3,
          blocking_issues: 2,
          review_passed: false
        }
      };

      const validation = await validator.validate(task, artifacts);

      expect(validation.passed).toBe(true);
      expect(validation.details?.fingerprints).toHaveLength(3);
      expect(validation.details?.fingerprints).toContain('sha256:unique1');
      expect(validation.details?.fingerprints).toContain('sha256:unique2');
      expect(validation.details?.fingerprints).toContain('sha256:unique3');
    });
  });
});
