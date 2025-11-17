/**
 * Phase Orchestrator Service Tests
 * 
 * Tests all phase transition logic, loop behavior, and attempt limits.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { PhaseOrchestratorService, type PhaseTransition } from '../phaseOrchestrator.service.js';
import type { ValidationResult } from '../phaseValidation/index.js';
import type { Task } from '../taskQueue.sqlite.js';

describe('PhaseOrchestratorService', () => {
  let db: Database.Database;
  let orchestrator: PhaseOrchestratorService;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create minimal schema
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        assigned_agent TEXT NOT NULL,
        phase_index INTEGER DEFAULT 1,
        phase_name TEXT DEFAULT 'Planning',
        phase_status TEXT DEFAULT 'ready',
        phase_attempts INTEGER DEFAULT 1,
        phase_payload TEXT,
        chain_status TEXT,
        blocked_reason TEXT,
        blocked_at INTEGER,
        completed_at INTEGER
      );

      CREATE TABLE task_stage_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        phase_index INTEGER NOT NULL,
        phase_name TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL,
        artifacts_blob TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        recovery_diagnosis TEXT,
        exit_code INTEGER
      );
    `);

    orchestrator = new PhaseOrchestratorService(db);
  });

  describe('determineNextPhase', () => {
    describe('Phase 1: Planning', () => {
      it('should cancel task if marked obsolete', () => {
        const validation: ValidationResult = {
          passed: false,
          taskObsolete: true,
        };

        const transition = orchestrator.determineNextPhase(1, validation);

        expect(transition.fromPhase).toBe(1);
        expect(transition.toPhase).toBeNull();
        expect(transition.reason).toContain('obsolete');
      });

      it('should retry planning if task realigned', () => {
        const validation: ValidationResult = {
          passed: false,
          taskRealigned: true,
        };

        const transition = orchestrator.determineNextPhase(1, validation);

        expect(transition.fromPhase).toBe(1);
        expect(transition.toPhase).toBe(1);
        expect(transition.resetAttempts).toBe(true);
        expect(transition.reason).toContain('realigned');
      });

      it('should advance to implementation when planning complete', () => {
        const validation: ValidationResult = {
          passed: true,
        };

        const transition = orchestrator.determineNextPhase(1, validation);

        expect(transition.fromPhase).toBe(1);
        expect(transition.toPhase).toBe(2);
        expect(transition.resetAttempts).toBe(true);
      });
    });

    describe('Phase 2: Implementation', () => {
      it('should advance to review after implementation', () => {
        const validation: ValidationResult = {
          passed: true,
        };

        const transition = orchestrator.determineNextPhase(2, validation);

        expect(transition.fromPhase).toBe(2);
        expect(transition.toPhase).toBe(3);
        expect(transition.resetAttempts).toBe(true);
      });
    });

    describe('Phase 3: Review', () => {
      it('should go to fixes when issues found', () => {
        const validation: ValidationResult = {
          passed: false,
          issuesFound: true,
        };

        const transition = orchestrator.determineNextPhase(3, validation);

        expect(transition.fromPhase).toBe(3);
        expect(transition.toPhase).toBe(4);
        expect(transition.resetAttempts).toBe(true);
      });

      it('should go to tests when no issues found', () => {
        const validation: ValidationResult = {
          passed: true,
          issuesFound: false,
        };

        const transition = orchestrator.determineNextPhase(3, validation);

        expect(transition.fromPhase).toBe(3);
        expect(transition.toPhase).toBe(5);
        expect(transition.resetAttempts).toBe(true);
      });
    });

    describe('Phase 4: Fixes', () => {
      it('should always return to review for re-verification', () => {
        const validation: ValidationResult = {
          passed: true,
          allIssuesAddressed: true,
        };

        const transition = orchestrator.determineNextPhase(4, validation);

        expect(transition.fromPhase).toBe(4);
        expect(transition.toPhase).toBe(3);
        expect(transition.resetAttempts).toBe(false); // Maintain attempt counter across loop
        expect(transition.reason).toContain('re-reviewing');
      });
    });

    describe('Phase 5: Test & Validate', () => {
      it('should advance to cleanup when tests pass', () => {
        const validation: ValidationResult = {
          passed: true,
          allTestsPassing: true,
        };

        const transition = orchestrator.determineNextPhase(5, validation);

        expect(transition.fromPhase).toBe(5);
        expect(transition.toPhase).toBe(6);
        expect(transition.resetAttempts).toBe(true);
      });

      it('should stay in phase 5 when tests fail (internal loop)', () => {
        const validation: ValidationResult = {
          passed: false,
          allTestsPassing: false,
        };

        const transition = orchestrator.determineNextPhase(5, validation);

        expect(transition.fromPhase).toBe(5);
        expect(transition.toPhase).toBe(5); // Internal loop
        expect(transition.resetAttempts).toBe(false);
      });
    });

    describe('Phase 6: Cleanup', () => {
      it('should advance to PR shepherding', () => {
        const validation: ValidationResult = {
          passed: true,
        };

        const transition = orchestrator.determineNextPhase(6, validation);

        expect(transition.fromPhase).toBe(6);
        expect(transition.toPhase).toBe(7);
        expect(transition.resetAttempts).toBe(true);
      });
    });

    describe('Phase 7: PR Shepherding', () => {
      it('should complete when all gates pass', () => {
        const validation: ValidationResult = {
          passed: true,
          allGatesPassing: true,
        };

        const transition = orchestrator.determineNextPhase(7, validation);

        expect(transition.fromPhase).toBe(7);
        expect(transition.toPhase).toBe(7);
        expect(transition.reason).toContain('complete');
      });

      it('should stay in phase when gates not passing', () => {
        const validation: ValidationResult = {
          passed: false,
          allGatesPassing: false,
        };

        const transition = orchestrator.determineNextPhase(7, validation);

        expect(transition.fromPhase).toBe(7);
        expect(transition.toPhase).toBe(7);
        expect(transition.reason).toContain('Waiting');
      });
    });
  });

  describe('advancePhase', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO tasks (id, type, title, status, created_at, assigned_agent, phase_index, phase_name, phase_attempts)
        VALUES ('test-task', 'implementation', 'Test Task', 'running', ${Date.now()}, 'claude', 1, 'Planning', 1)
      `).run();
    });

    it('should advance task from planning to implementation', () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      const validation: ValidationResult = { passed: true };

      orchestrator.advancePhase(task, validation);

      const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      expect(updated.phase_index).toBe(2);
      expect(updated.phase_name).toBe('Implementation');
      expect(updated.phase_attempts).toBe(1); // Reset on phase change
      expect(updated.phase_status).toBe('ready');
    });

    it('should cancel task when planning marks it obsolete', () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      const validation: ValidationResult = {
        passed: false,
        taskObsolete: true,
      };

      orchestrator.advancePhase(task, validation);

      const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      expect(updated.status).toBe('cancelled');
      expect(updated.phase_status).toBe('complete');
      expect(updated.completed_at).toBeGreaterThan(0);
    });

    it('should maintain attempt counter during Phase 3↔4 loop', () => {
      // Set task to Phase 4
      db.prepare(`
        UPDATE tasks SET phase_index = 4, phase_name = 'Fixes', phase_attempts = 2
        WHERE id = 'test-task'
      `).run();

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      const validation: ValidationResult = { passed: true };

      orchestrator.advancePhase(task, validation);

      const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      expect(updated.phase_index).toBe(3); // Back to Review
      expect(updated.phase_attempts).toBe(3); // Incremented, not reset
    });

    it('should increment attempt counter during Phase 5 internal loop', () => {
      // Set task to Phase 5
      db.prepare(`
        UPDATE tasks SET phase_index = 5, phase_name = 'Test & Validate', phase_attempts = 1
        WHERE id = 'test-task'
      `).run();

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      const validation: ValidationResult = {
        passed: false,
        allTestsPassing: false,
      };

      orchestrator.advancePhase(task, validation);

      const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      expect(updated.phase_index).toBe(5); // Stay in Phase 5
      expect(updated.phase_attempts).toBe(2); // Incremented
    });
  });

  describe('recordStageRun', () => {
    it('should insert stage run record', () => {
      const stageRun = {
        task_id: 'test-task',
        phase_index: 1,
        phase_name: 'Planning',
        attempt: 1,
        status: 'success' as const,
        artifacts_blob: JSON.stringify({ test: 'data' }),
        created_at: Date.now(),
        completed_at: Date.now(),
        exit_code: 0,
      };

      const id = orchestrator.recordStageRun(stageRun);

      expect(id).toBeGreaterThan(0);

      const record = db.prepare('SELECT * FROM task_stage_runs WHERE id = ?').get(id);
      expect(record).toMatchObject({
        task_id: 'test-task',
        phase_index: 1,
        attempt: 1,
        status: 'success',
      });
    });
  });

  describe('checkAttemptLimits', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO tasks (id, type, title, status, created_at, assigned_agent, phase_index, phase_name, phase_attempts)
        VALUES ('test-task', 'implementation', 'Test Task', 'running', ${Date.now()}, 'claude', 3, 'Review', 1)
      `).run();
    });

    it('should return false when under limit', () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      expect(orchestrator.checkAttemptLimits(task)).toBe(false);
    });

    it('should block chain when max attempts reached', () => {
      db.prepare(`
        UPDATE tasks SET phase_attempts = 4 WHERE id = 'test-task'
      `).run();

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      expect(orchestrator.checkAttemptLimits(task)).toBe(true);

      const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task') as Task;
      expect(updated.phase_status).toBe('blocked');
      expect(updated.chain_status).toBe('blocked');
      expect(updated.blocked_reason).toContain('exceeded 4 attempts');
      expect(updated.blocked_at).toBeGreaterThan(0);
    });
  });

  describe('getPhaseHistory', () => {
    it('should return all stage runs for a task', () => {
      // Insert stage runs
      orchestrator.recordStageRun({
        task_id: 'test-task',
        phase_index: 1,
        phase_name: 'Planning',
        attempt: 1,
        status: 'success',
        created_at: Date.now(),
      });

      orchestrator.recordStageRun({
        task_id: 'test-task',
        phase_index: 2,
        phase_name: 'Implementation',
        attempt: 1,
        status: 'success',
        created_at: Date.now(),
      });

      const history = orchestrator.getPhaseHistory('test-task');

      expect(history).toHaveLength(2);
      expect(history[0].phase_index).toBe(1);
      expect(history[1].phase_index).toBe(2);
    });
  });

  describe('static methods', () => {
    it('should return correct phase name', () => {
      expect(PhaseOrchestratorService.getPhaseName(1)).toBe('Planning');
      expect(PhaseOrchestratorService.getPhaseName(3)).toBe('Review');
      expect(PhaseOrchestratorService.getPhaseName(7)).toBe('PR Shepherding');
    });

    it('should return all phase names', () => {
      const names = PhaseOrchestratorService.getAllPhaseNames();
      expect(Object.keys(names)).toHaveLength(7);
      expect(names[4]).toBe('Test Coverage & Validation');
      expect(names[5]).toBe('Cleanup & Docs');
    });
  });
});
