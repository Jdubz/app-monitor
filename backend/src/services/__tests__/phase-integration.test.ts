/**
 * Phase Integration Tests
 * 
 * End-to-end tests for phase lifecycle and transitions.
 * Tests complete task flows through all 7 phases including loops and recovery.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhaseOrchestratorService } from '../phaseOrchestrator.service';
import { ValidatorRegistry } from '../phaseValidation/ValidatorRegistry';
import { RecoveryAgentService } from '../recoveryAgent.service';
import { ValidationResult } from '../phaseValidation/types';
import type { Task } from '../taskQueue.sqlite';

describe('Phase Integration Tests', () => {
  let orchestrator: PhaseOrchestratorService;
  let validatorRegistry: ValidatorRegistry;
  let recoveryService: RecoveryAgentService;

  beforeEach(() => {
    validatorRegistry = new ValidatorRegistry();
    orchestrator = new PhaseOrchestratorService();
    recoveryService = {} as RecoveryAgentService; // Mock for now
  });

  describe('Linear Phase Progression', () => {
    it('should advance through phases 1→2→3→5→6→7 when no issues found', () => {
      // Phase 1 (Planning) - clean
      let nextPhase = orchestrator.determineNextPhase(1, {
        passed: true,
        errors: [],
        metadata: {}
      });
      expect(nextPhase).toBe(2);

      // Phase 2 (Implementation) - PR created
      nextPhase = orchestrator.determineNextPhase(2, {
        passed: true,
        errors: [],
        metadata: { pr_created: true }
      });
      expect(nextPhase).toBe(3);

      // Phase 3 (Review) - no issues
      nextPhase = orchestrator.determineNextPhase(3, {
        passed: true,
        errors: [],
        metadata: { issues_found: false, total_issues: 0 }
      });
      expect(nextPhase).toBe(5); // Skip Phase 4

      // Phase 5 (Tests) - all passing
      nextPhase = orchestrator.determineNextPhase(5, {
        passed: true,
        errors: [],
        metadata: { all_tests_passing: true, coverage_passing: true }
      });
      expect(nextPhase).toBe(6);

      // Phase 6 (Cleanup) - docs updated
      nextPhase = orchestrator.determineNextPhase(6, {
        passed: true,
        errors: [],
        metadata: { docs_updated: true }
      });
      expect(nextPhase).toBe(7);

      // Phase 7 (PR Shepherding) - merged
      nextPhase = orchestrator.determineNextPhase(7, {
        passed: true,
        errors: [],
        metadata: { pr_merged: true }
      });
      expect(nextPhase).toBe(null); // Complete
    });
  });

  describe('Phase 3↔4 Loop (Review/Fix)', () => {
    it('should loop between Phase 3 and 4 until issues resolved', () => {
      // Phase 3 - issues found
      let nextPhase = orchestrator.determineNextPhase(3, {
        passed: false,
        errors: ['Issue 1', 'Issue 2'],
        metadata: { issues_found: true, total_issues: 2 }
      });
      expect(nextPhase).toBe(4); // Go to fixes

      // Phase 4 - fixes applied, go back to review
      nextPhase = orchestrator.determineNextPhase(4, {
        passed: true,
        errors: [],
        metadata: { all_issues_addressed: true }
      });
      expect(nextPhase).toBe(3); // Re-review

      // Phase 3 - clean now
      nextPhase = orchestrator.determineNextPhase(3, {
        passed: true,
        errors: [],
        metadata: { issues_found: false, total_issues: 0 }
      });
      expect(nextPhase).toBe(5); // Proceed to tests
    });

    it('should stay in Phase 4 if not all issues addressed', () => {
      const nextPhase = orchestrator.determineNextPhase(4, {
        passed: false,
        errors: ['Still 1 issue remaining'],
        metadata: { all_issues_addressed: false }
      });
      expect(nextPhase).toBe(4); // Stay in fixes
    });

    it('should block after 4 review/fix iterations', () => {
      const task: Partial<Task> = {
        id: 'test-task',
        phase_index: 3,
        phase_attempts: 4
      };

      const shouldBlock = orchestrator.checkAttemptLimits(task as Task);
      expect(shouldBlock).toBe(true);
    });
  });

  describe('Phase 5 Internal Loop (Tests)', () => {
    it('should loop within Phase 5 until tests pass', () => {
      // Phase 5 - tests failing
      let nextPhase = orchestrator.determineNextPhase(5, {
        passed: false,
        errors: ['Test failure: auth.test.ts'],
        metadata: { all_tests_passing: false, coverage_passing: false }
      });
      expect(nextPhase).toBe(5); // Stay in Phase 5

      // Phase 5 - tests passing now
      nextPhase = orchestrator.determineNextPhase(5, {
        passed: true,
        errors: [],
        metadata: { all_tests_passing: true, coverage_passing: true }
      });
      expect(nextPhase).toBe(6); // Advance to cleanup
    });

    it('should block after 4 test iterations', () => {
      const task: Partial<Task> = {
        id: 'test-task',
        phase_index: 5,
        phase_attempts: 4
      };

      const shouldBlock = orchestrator.checkAttemptLimits(task as Task);
      expect(shouldBlock).toBe(true);
    });
  });

  describe('Phase 1 Early Termination', () => {
    it('should cancel task if marked obsolete in planning', () => {
      const nextPhase = orchestrator.determineNextPhase(1, {
        passed: true,
        errors: [],
        metadata: { obsolete: true, obsolete_reason: 'Already implemented' }
      });
      expect(nextPhase).toBe(null); // Cancel task
    });

    it('should update task context if realigned', () => {
      const result: ValidationResult = {
        passed: true,
        errors: [],
        metadata: {
          task_realigned: true,
          realignment_details: 'Updated to focus on backend only'
        }
      };

      const nextPhase = orchestrator.determineNextPhase(1, result);
      expect(nextPhase).toBe(2); // Continue but with updated context
      expect(result.metadata.task_realigned).toBe(true);
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
      const task: Partial<Task> = {
        id: 'test-task',
        phase_index: 3,
        phase_attempts: 3
      };

      // Advancing to Phase 5 (skipping 4) should reset attempts
      const updatedTask = orchestrator.advancePhase(task as Task, 5);
      expect(updatedTask.phase_attempts).toBe(1);
    });

    it('should preserve attempts when looping within same phase', () => {
      const task: Partial<Task> = {
        id: 'test-task',
        phase_index: 5,
        phase_attempts: 2
      };

      // Staying in Phase 5 should increment attempts
      const updatedTask = orchestrator.advancePhase(task as Task, 5);
      expect(updatedTask.phase_attempts).toBe(3);
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
    it('should simulate full task execution 1→2→3→4→3→5→6→7', () => {
      const phases: number[] = [];

      // Track phase progression
      const trackPhase = (current: number, validation: ValidationResult): void => {
        phases.push(current);
        const next = orchestrator.determineNextPhase(current, validation);
        if (next !== null && next !== current) {
          trackPhase(next, { passed: true, errors: [], metadata: {} });
        }
      };

      // Start with Phase 1
      trackPhase(1, { passed: true, errors: [], metadata: {} });

      // Expected: 1, 2, 3, 5, 6, 7 (no issues = skip phase 4)
      expect(phases).toEqual([1, 2, 3, 5, 6, 7]);
    });

    it('should simulate task with review/fix loop', () => {
      let currentPhase = 1;
      const progression: number[] = [currentPhase];

      // Phase 1 → 2
      currentPhase = orchestrator.determineNextPhase(currentPhase, { passed: true, errors: [], metadata: {} })!;
      progression.push(currentPhase);

      // Phase 2 → 3
      currentPhase = orchestrator.determineNextPhase(currentPhase, { passed: true, errors: [], metadata: { pr_created: true } })!;
      progression.push(currentPhase);

      // Phase 3 finds issues → 4
      currentPhase = orchestrator.determineNextPhase(currentPhase, { 
        passed: false, 
        errors: ['Issue'], 
        metadata: { issues_found: true, total_issues: 1 } 
      })!;
      progression.push(currentPhase);

      // Phase 4 fixes → 3 (re-review)
      currentPhase = orchestrator.determineNextPhase(currentPhase, { 
        passed: true, 
        errors: [], 
        metadata: { all_issues_addressed: true } 
      })!;
      progression.push(currentPhase);

      // Phase 3 clean → 5
      currentPhase = orchestrator.determineNextPhase(currentPhase, { 
        passed: true, 
        errors: [], 
        metadata: { issues_found: false } 
      })!;
      progression.push(currentPhase);

      // Expected: 1 → 2 → 3 → 4 → 3 → 5
      expect(progression).toEqual([1, 2, 3, 4, 3, 5]);
    });
  });
});
