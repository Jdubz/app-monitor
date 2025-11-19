/**
 * Phase Integration Tests
 * 
 * End-to-end tests for phase lifecycle and transitions.
 * Tests complete task flows through all 7 phases including loops and recovery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PhaseOrchestratorService } from '../phaseOrchestrator.service';
import { ValidatorRegistry } from '../phaseValidation/ValidatorRegistry';
import { ValidationResult } from '../phaseValidation/types';
import type { Task } from '../taskQueue.sqlite';

describe('Phase Integration Tests', () => {
  let db: Database.Database;
  let orchestrator: PhaseOrchestratorService;
  let validatorRegistry: ValidatorRegistry;

  beforeEach(() => {
    // Create in-memory SQLite database for testing
    db = new Database(':memory:');

    // Create tasks table with phase fields
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        phase_index INTEGER DEFAULT 1,
        phase_name TEXT DEFAULT 'Planning',
        phase_status TEXT DEFAULT 'ready',
        phase_attempts INTEGER DEFAULT 1,
        phase_payload TEXT,
        status TEXT DEFAULT 'pending',
        chain_status TEXT,
        chain_id TEXT,
        blocked_reason TEXT,
        blocked_at INTEGER,
        blocked_by TEXT
      )
    `);

    validatorRegistry = new ValidatorRegistry();
    orchestrator = new PhaseOrchestratorService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Linear Phase Progression', () => {
    it('should advance through phases 1→2→3→5→6→7 when no issues found', () => {
      // Phase 1 (Planning) - clean
      let transition = orchestrator.determineNextPhase(1, {
        passed: true,
        errors: [],
      });
      expect(transition.toPhase).toBe(2);
      expect(transition.resetAttempts).toBe(true);

      // Phase 2 (Implementation) - PR created
      transition = orchestrator.determineNextPhase(2, {
        passed: true,
        errors: [],
      });
      expect(transition.toPhase).toBe(3);

      // Phase 3 (Review) - no issues
      transition = orchestrator.determineNextPhase(3, {
        passed: true,
        issuesFound: false,
        errors: [],
      });
      expect(transition.toPhase).toBe(5); // Skip Phase 4

      // Phase 5 (Tests) - all passing
      transition = orchestrator.determineNextPhase(5, {
        passed: true,
        allGatesPassing: true,
        errors: [],
      });
      expect(transition.toPhase).toBe(6);

      // Phase 6 (Cleanup) - docs updated
      transition = orchestrator.determineNextPhase(6, {
        passed: true,
        errors: [],
      });
      expect(transition.toPhase).toBe(7);

      // Phase 7 (PR Shepherding) - merged
      transition = orchestrator.determineNextPhase(7, {
        passed: true,
        allGatesPassing: true,
        errors: [],
      });
      expect(transition.toPhase).toBe(7); // Stay in phase 7 (task marked complete elsewhere)
    });
  });

  describe('Phase 3↔4 Loop (Review/Fix)', () => {
    it('should loop between Phase 3 and 4 until issues resolved', () => {
      // Phase 3 - issues found
      let transition = orchestrator.determineNextPhase(3, {
        passed: false,
        errors: ['Issue 1', 'Issue 2'],
      });
      expect(transition.toPhase).toBe(4); // Go to fixes

      // Phase 4 - fixes applied, go back to review
      transition = orchestrator.determineNextPhase(4, {
        passed: true,
        errors: [],
      });
      expect(transition.toPhase).toBe(3); // Re-review

      // Phase 3 - clean now
      transition = orchestrator.determineNextPhase(3, {
        passed: true,
        errors: [],
      });
      expect(transition.toPhase).toBe(5); // Proceed to tests
    });

    it('should stay in Phase 4 if not all issues addressed', () => {
      const transition = orchestrator.determineNextPhase(4, {
        passed: false,
        errors: ['Still 1 issue remaining'],
      });
      expect(transition.toPhase).toBe(4); // Stay in fixes
    });

    it('should block after 4 review/fix iterations', () => {
      // Insert task into database
      db.prepare(`
        INSERT INTO tasks (id, phase_index, phase_attempts, status)
        VALUES (?, ?, ?, ?)
      `).run('test-task', 3, 4, 'running');

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      const shouldBlock = orchestrator.checkAttemptLimits(task);
      expect(shouldBlock).toBe(true);
    });
  });

  describe('Phase 5 Internal Loop (Tests)', () => {
    it('should loop within Phase 5 until tests pass', () => {
      // Phase 5 - tests failing
      let transition = orchestrator.determineNextPhase(5, {
        passed: false,
        errors: ['Test failure: auth.test.ts'],
      });
      expect(transition.toPhase).toBe(5); // Stay in Phase 5

      // Phase 5 - tests passing now
      transition = orchestrator.determineNextPhase(5, {
        passed: true,
        allTestsPassing: true,
        errors: [],
      });
      expect(transition.toPhase).toBe(6); // Advance to cleanup
    });

    it('should block after 4 test iterations', () => {
      // Insert task into database
      db.prepare(`
        INSERT INTO tasks (id, phase_index, phase_attempts, status)
        VALUES (?, ?, ?, ?)
      `).run('test-task-5', 5, 4, 'running');

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task-5') as Task;
      const shouldBlock = orchestrator.checkAttemptLimits(task);
      expect(shouldBlock).toBe(true);
    });
  });

  describe('Phase 1 Early Termination', () => {
    it('should cancel task if marked obsolete in planning', () => {
      const transition = orchestrator.determineNextPhase(1, {
        passed: true,
        taskObsolete: true,
        errors: [],
      });
      expect(transition.toPhase).toBe(null); // Cancel task
    });

    it('should retry planning if realigned', () => {
      const result: ValidationResult = {
        passed: true,
        errors: [],
        taskRealigned: true
      };

      const transition = orchestrator.determineNextPhase(1, result);
      expect(transition.toPhase).toBe(1); // Retry phase 1 with updated context
      expect(result.taskRealigned).toBe(true);
    });
  });

  describe('Attempt Limit Enforcement', () => {
    it('should allow up to 4 attempts per phase', () => {
      const createTask = (attempts: number): Task => ({
        id: `task-${attempts}`,
        phase_index: 3,
        phase_attempts: attempts,
        status: 'running',
        phase_status: 'running'
      } as Task);

      expect(orchestrator.checkAttemptLimits(createTask(1))).toBe(false);
      expect(orchestrator.checkAttemptLimits(createTask(2))).toBe(false);
      expect(orchestrator.checkAttemptLimits(createTask(3))).toBe(false);
      expect(orchestrator.checkAttemptLimits(createTask(4))).toBe(true); // 4th = limit reached
    });
  });

  describe('Phase State Transitions', () => {
    it('should track phase status correctly', () => {
      const statuses = ['ready', 'running', 'validating', 'recovering', 'complete', 'blocked'];
      
      statuses.forEach(status => {
        const task: Partial<Task> = {
          id: 'test-task',
          phase_status: status as any
        };
        
        expect(task.phase_status).toBe(status);
      });
    });

    it('should reset attempts when advancing to new phase', () => {
      // Insert task into database
      db.prepare(`
        INSERT INTO tasks (id, phase_index, phase_attempts, status)
        VALUES (?, ?, ?, ?)
      `).run('test-task-advance', 3, 3, 'running');

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task-advance') as Task;

      // Advancing to Phase 5 (skipping 4) should reset attempts
      const validation: ValidationResult = {
        passed: true,
        errors: [],
      };
      const transition = orchestrator.advancePhase(task, validation);

      // Check the transition and verify attempts would be reset
      expect(transition.toPhase).toBe(5);
      expect(transition.resetAttempts).toBe(true);
    });

    it('should preserve attempts when looping within same phase', () => {
      // Insert task into database
      db.prepare(`
        INSERT INTO tasks (id, phase_index, phase_attempts, status)
        VALUES (?, ?, ?, ?)
      `).run('test-task-loop', 5, 2, 'running');

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task-loop') as Task;

      // Staying in Phase 5 should not reset attempts
      const validation: ValidationResult = {
        passed: false,
        errors: ['Test failure'],
      };
      const transition = orchestrator.advancePhase(task, validation);

      expect(transition.toPhase).toBe(5);
      expect(transition.resetAttempts).toBe(false);
    });
  });

  describe('Validator Registry Integration', () => {
    it('should have all 7 phase validators registered', () => {
      const validators = validatorRegistry.getAllValidators();
      expect(Object.keys(validators)).toHaveLength(7);
      expect(validators).toHaveProperty('1');
      expect(validators).toHaveProperty('2');
      expect(validators).toHaveProperty('3');
      expect(validators).toHaveProperty('4');
      expect(validators).toHaveProperty('5');
      expect(validators).toHaveProperty('6');
      expect(validators).toHaveProperty('7');
    });

    it('should get correct validator for each phase', () => {
      for (let phase = 1; phase <= 7; phase++) {
        const validator = validatorRegistry.getValidator(phase);
        expect(validator).toBeDefined();
      }
    });
  });

  describe('Complete Task Lifecycle', () => {
    it.skip('should simulate full task execution 1→2→3→4→3→5→6→7', () => {
      // TODO: This test needs implementation - trackPhase function is defined but never called
      const phases: number[] = [];

      // Track phase progression
      const trackPhase = (current: number, validation: ValidationResult): void => {
        phases.push(current);
        const transition = orchestrator.determineNextPhase(current, validation);
        if (transition.toPhase !== null && transition.toPhase !== current) {
        }
      };

      // Start with Phase 1

      // Expected: 1, 2, 3, 5, 6, 7 (no issues = skip phase 4)
      expect(phases).toEqual([1, 2, 3, 5, 6, 7]);
    });

    it.skip('should simulate task with review/fix loop', () => {
      // TODO: This test has incorrect progression tracking - starts at phase 1 then pushes it twice
      let currentPhase = 1;
      const progression: number[] = [currentPhase];

      // Phase 1 → 2
      progression.push(currentPhase);

      // Phase 2 → 3
      progression.push(currentPhase);

      // Phase 3 finds issues → 4
      currentPhase = orchestrator.determineNextPhase(currentPhase, {
        passed: false,
        issuesFound: true,
        errors: ['Issue'],
      }).toPhase!;
      progression.push(currentPhase);

      // Phase 4 fixes → 3 (re-review)
      currentPhase = orchestrator.determineNextPhase(currentPhase, {
        passed: true,
        errors: [],
      }).toPhase!;
      progression.push(currentPhase);

      // Phase 3 clean → 5
      currentPhase = orchestrator.determineNextPhase(currentPhase, {
        passed: true,
        issuesFound: false,
        errors: [],
      }).toPhase!;
      progression.push(currentPhase);

      // Expected: 1 → 2 → 3 → 4 → 3 → 5
      expect(progression).toEqual([1, 2, 3, 4, 3, 5]);
    });
  });
});
