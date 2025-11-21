/**
 * Phase 1: Planning - Simple Service-Level Integration Test
 *
 * Simplified proof-of-concept test that demonstrates:
 * - Direct service method calls (no HTTP)
 * - Mocking ONLY artifact extraction
 * - Testing ALL backend logic (validators, orchestrator)
 * - Direct database verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { TaskQueueService } from '../taskQueue.sqlite.js';
import { PhaseOrchestratorService } from '../phaseOrchestrator.service.js';
import { ValidatorRegistry } from '../phaseValidation/ValidatorRegistry.js';
import type { Task } from '../taskQueue.sqlite.js';

describe('Phase 1: Planning - Simple Integration', () => {
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

    // Create a test task
    const task = await taskQueue.createTask({
      type: 'implementation',
      title: 'Test implementation task',
      description: 'Test task for Phase 1 validation',
      priority: 1
    });
    taskId = task.id;
  });

  afterEach(() => {
    try {
      vi.restoreAllMocks();
      // Properly close database to avoid segfaults
      if (db && db.open) {
        db.close();
      }
    } catch (err) {
      // Database might already be closed
      console.warn('Database cleanup warning:', err);
    }
  });

  it('should execute Phase 1 validator and orchestrator', async () => {
    // Given: Task in Phase 1
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
    expect(task.phase_index).toBe(1);
    expect(task.phase_name).toBe('Planning');

    // When: Get validator for Phase 1
    const validator = validatorRegistry.getValidator(1);
    expect(validator).toBeDefined();

    // Mock artifacts - using correct format for Phase1PlanningValidator
    const mockArtifacts = {
      planning: {
        obsolete: false,
        task_realigned: false,
        architecture_notes: 'Implement using TDD approach with comprehensive testing',
        estimated_complexity: 'medium' as const,
        dependencies: []
      }
    };

    // Execute validator
    const validation = await validator.validate(task, mockArtifacts);

    // Then: Validator should pass
    expect(validation.passed).toBe(true);
    expect(validation.errors).toBeUndefined(); // No errors field when passed

    // When: Determine next phase
    const transition = orchestrator.determineNextPhase(1, validation);

    // Then: Orchestrator should transition to Phase 2
    expect(transition.toPhase).toBe(2);
    expect(transition.fromPhase).toBe(1);
    expect(transition.resetAttempts).toBe(true);
  });

  it('should reject invalid plan and return errors', async () => {
    // Given: Task in Phase 1
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;

    // When: Get validator
    const validator = validatorRegistry.getValidator(1);

    // Invalid artifacts (missing required fields)
    const invalidArtifacts = {
      planning: {
        obsolete: false,
        task_realigned: false,
        architecture_notes: '',  // Empty - INVALID
        estimated_complexity: 'medium' as const
      }
    };

    // Execute validator
    const validation = await validator.validate(task, invalidArtifacts);

    // Then: Validator should fail
    expect(validation.passed).toBe(false);
    expect(validation.errors).toBeDefined();
    expect(validation.errors!.length).toBeGreaterThan(0);
  });

  it('should handle orchestrator blocking after max attempts', () => {
    // Given: Task with 4 attempts (max)
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
    task.phase_attempts = 4;

    // When: Check if should block
    const shouldBlock = orchestrator.checkAttemptLimits(task);

    // Then: Should block
    expect(shouldBlock).toBe(true);

    // Verify database was updated
    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
    expect(updatedTask.status).toBe('blocked');
    expect(updatedTask.phase_status).toBe('blocked');
    expect(updatedTask.blocked_reason).toContain('exceeded');
  });
});
