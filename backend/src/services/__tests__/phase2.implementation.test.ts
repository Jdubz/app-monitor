/**
 * Phase 2: Implementation - Service-Level Integration Test
 *
 * Tests the Implementation phase validator and orchestrator:
 * - Valid PR creation
 * - Invalid PR metadata
 * - Missing required fields
 * - Branch and commit validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { TaskQueueService } from '../taskQueue.sqlite.js';
import { PhaseOrchestratorService } from '../phaseOrchestrator.service.js';
import { ValidatorRegistry } from '../phaseValidation/ValidatorRegistry.js';
import type { Task } from '../taskQueue.sqlite.js';

describe('Phase 2: Implementation - Service Level Integration', () => {
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

    // Create a test task in Phase 2
    const task = await taskQueue.createTask({
      type: 'implementation',
      title: 'Add authentication feature',
      description: 'Implement JWT authentication',
      priority: 1
    });
    taskId = task.id;

    // Advance to Phase 2
    db.prepare('UPDATE tasks SET phase_index = 2, phase_name = ? WHERE id = ?')
      .run('Implementation', taskId);
  });

  afterEach(() => {
    try {
      vi.restoreAllMocks();
      db?.close();
    } catch (_err) {
      // Ignore cleanup errors
    }
  });

  describe('Valid Implementation', () => {
    it('should validate successful PR creation', async () => {
      // Given: Task in Phase 2
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      expect(task.phase_index).toBe(2);
      expect(task.phase_name).toBe('Implementation');

      // When: Get validator for Phase 2
      const validator = validatorRegistry.getValidator(2);
      expect(validator).toBeDefined();

      // Valid implementation artifacts
      const validArtifacts = {
        implementation: {
          pr_number: 456,
          pr_url: 'https://github.com/owner/repo/pull/456',
          branch_name: 'feature/auth-implementation',
          commits: 5,
          files_changed: ['src/auth/jwt.ts', 'src/auth/middleware.ts', 'tests/auth.test.ts']
        }
      };

      // Execute validator
      const validation = await validator.validate(task, validArtifacts);

      // Then: Validator should pass
      expect(validation.passed).toBe(true);
      expect(validation.errors).toBeUndefined();
      expect(validation.artifacts).toBeDefined();
      expect(validation.artifacts.pr_number).toBe(456);

      // When: Determine next phase
      const transition = orchestrator.determineNextPhase(2, validation);

      // Then: Orchestrator should transition to Phase 3 (Review)
      expect(transition.toPhase).toBe(3);
      expect(transition.fromPhase).toBe(2);
      expect(transition.resetAttempts).toBe(true);
      expect(transition.reason).toContain('review');
    });

    it('should accept implementation with minimal files changed', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(2);

      const minimalArtifacts = {
        implementation: {
          pr_number: 123,
          pr_url: 'https://github.com/owner/repo/pull/123',
          branch_name: 'hotfix/typo-fix',
          commits: 1,
          files_changed: ['README.md']
        }
      };

      const validation = await validator.validate(task, minimalArtifacts);

      expect(validation.passed).toBe(true);
      expect(validation.artifacts.commits).toBe(1);
    });
  });

  describe('Invalid Implementation', () => {
    it('should reject missing implementation artifacts', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(2);

      // Missing implementation object
      const invalidArtifacts = {
        stdout: 'Some output',
        stderr: '',
        exitCode: 0
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors!.length).toBeGreaterThan(0);
      expect(validation.errors![0]).toContain('No implementation artifacts');
    });

    it('should reject missing pr_number', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(2);

      const invalidArtifacts = {
        implementation: {
          // Missing pr_number
          pr_url: 'https://github.com/owner/repo/pull/456',
          branch_name: 'feature/auth',
          commits: 3
        }
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors!.some(e => e.includes('pr_number'))).toBe(true);
    });

    it('should reject missing pr_url', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(2);

      const invalidArtifacts = {
        implementation: {
          pr_number: 456,
          // Missing pr_url
          branch_name: 'feature/auth',
          commits: 3
        }
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors!.some(e => e.includes('pr_url'))).toBe(true);
    });

    it('should reject missing branch_name', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(2);

      const invalidArtifacts = {
        implementation: {
          pr_number: 456,
          pr_url: 'https://github.com/owner/repo/pull/456',
          // Missing branch_name
          commits: 3
        }
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors!.some(e => e.includes('branch_name'))).toBe(true);
    });

    it('should reject zero or missing commits', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(2);

      const invalidArtifacts = {
        implementation: {
          pr_number: 456,
          pr_url: 'https://github.com/owner/repo/pull/456',
          branch_name: 'feature/auth',
          commits: 0 // No commits!
        }
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors!.some(e => e.includes('commit'))).toBe(true);
    });

    it('should reject invalid pr_number type', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(2);

      const invalidArtifacts = {
        implementation: {
          pr_number: '456' as any, // String instead of number
          pr_url: 'https://github.com/owner/repo/pull/456',
          branch_name: 'feature/auth',
          commits: 3
        }
      };

      const validation = await validator.validate(task, invalidArtifacts);

      expect(validation.passed).toBe(false);
      expect(validation.errors!.some(e => e.includes('pr_number'))).toBe(true);
    });
  });

  describe('Orchestrator Integration', () => {
    it('should always advance to Phase 3 after successful implementation', async () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
      const validator = validatorRegistry.getValidator(2);

      const artifacts = {
        implementation: {
          pr_number: 789,
          pr_url: 'https://github.com/owner/repo/pull/789',
          branch_name: 'feature/new-feature',
          commits: 10
        }
      };

      const validation = await validator.validate(task, artifacts);
      const transition = orchestrator.determineNextPhase(2, validation);

      expect(transition.toPhase).toBe(3);
      expect(transition.fromPhase).toBe(2);
      expect(transition.resetAttempts).toBe(true);
    });
  });
});
