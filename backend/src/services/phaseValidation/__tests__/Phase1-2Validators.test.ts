/**
 * Phase 1 & 2 Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { Phase1PlanningValidator } from '../Phase1PlanningValidator.js';
import { Phase2ImplementationValidator } from '../Phase2ImplementationValidator.js';
import type { Task } from '../../taskQueue.sqlite.js';
import type { PhaseArtifacts } from '../types.js';

describe('Phase1PlanningValidator', () => {
  const validator = new Phase1PlanningValidator();
  const mockTask: Task = {
    id: 'test-task-1',
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

  it('should have correct phase metadata', () => {
    expect(validator.phaseIndex).toBe(1);
    expect(validator.phaseName).toBe('Planning');
  });

  it('should fail when no planning artifacts exist', async () => {
    const artifacts: PhaseArtifacts = {
      stdout: 'Some output',
      exitCode: 0,
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('No planning artifacts found in agent output');
  });

  it('should fail when planning artifacts are not an object', async () => {
    const artifacts: PhaseArtifacts = {
      planning: 'invalid' as any,
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Planning artifacts are not a valid JSON object');
  });

  it('should handle obsolete tasks', async () => {
    const artifacts: PhaseArtifacts = {
      planning: {
        obsolete: true,
        obsolete_reason: 'Feature already implemented',
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.taskObsolete).toBe(true);
    expect(result.details?.obsolete_reason).toBe('Feature already implemented');
  });

  it('should handle task realignment', async () => {
    const artifacts: PhaseArtifacts = {
      planning: {
        task_realigned: true,
        realignment_details: 'Need to refocus on backend changes only',
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.taskRealigned).toBe(true);
    expect(result.details?.realignment_details).toBe('Need to refocus on backend changes only');
  });

  it('should fail when required fields are missing', async () => {
    const artifacts: PhaseArtifacts = {
      planning: {
        obsolete: false,
        task_realigned: false,
        // Missing architecture_notes and estimated_complexity
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Missing architecture_notes in planning output');
    expect(result.errors).toContain('Missing or invalid estimated_complexity (must be low, medium, or high)');
  });

  it('should validate successful planning with all fields', async () => {
    const artifacts: PhaseArtifacts = {
      planning: {
        obsolete: false,
        task_realigned: false,
        dependencies: ['task-123', 'task-456'],
        architecture_notes: 'Implement new auth service using JWT',
        estimated_complexity: 'medium',
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.taskObsolete).toBeUndefined();
    expect(result.taskRealigned).toBeUndefined();
    expect(result.details?.complexity).toBe('medium');
    expect(result.details?.dependencies).toEqual(['task-123', 'task-456']);
  });

  it('should fail when planning artifacts is null', async () => {
    const artifacts: PhaseArtifacts = {
      planning: null as any,
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('No planning artifacts found in agent output');
  });

  it('should fail when planning artifacts is an array', async () => {
    const artifacts: PhaseArtifacts = {
      planning: [] as any,
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Planning artifacts are not a valid JSON object');
  });
});

describe('Phase2ImplementationValidator', () => {
  const validator = new Phase2ImplementationValidator();
  const mockTask: Task = {
    id: 'test-task-2',
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

  it('should have correct phase metadata', () => {
    expect(validator.phaseIndex).toBe(2);
    expect(validator.phaseName).toBe('Implementation');
  });

  it('should fail when no implementation artifacts exist', async () => {
    const artifacts: PhaseArtifacts = {
      stdout: 'Some output',
      exitCode: 0,
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('No implementation artifacts found in agent output');
  });

  it('should fail when pr_number is missing', async () => {
    const artifacts: PhaseArtifacts = {
      implementation: {
        pr_url: 'https://github.com/test/repo/pull/123',
        branch_name: 'feature/test',
        commits: 3,
      } as any,
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Missing or invalid pr_number');
  });

  it('should fail when commits is zero', async () => {
    const artifacts: PhaseArtifacts = {
      implementation: {
        pr_number: 123,
        pr_url: 'https://github.com/test/repo/pull/123',
        branch_name: 'feature/test',
        commits: 0,
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('No commits found - at least 1 commit required');
  });

  it('should validate successful implementation with all fields', async () => {
    const artifacts: PhaseArtifacts = {
      implementation: {
        pr_number: 456,
        pr_url: 'https://github.com/test/repo/pull/456',
        branch_name: 'feature/auth-system',
        commits: 5,
        files_changed: ['backend/src/auth.ts', 'backend/src/middleware/auth.ts'],
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.details?.pr_number).toBe(456);
    expect(result.details?.branch_name).toBe('feature/auth-system');
    expect(result.artifacts).toMatchObject({
      pr_number: 456,
      commits: 5,
    });
  });

  it('should handle missing files_changed gracefully', async () => {
    const artifacts: PhaseArtifacts = {
      implementation: {
        pr_number: 789,
        pr_url: 'https://github.com/test/repo/pull/789',
        branch_name: 'feature/test',
        commits: 2,
        // files_changed is optional
      },
    };

    const result = await validator.validate(mockTask, artifacts);

    expect(result.passed).toBe(true);
    expect(result.artifacts).toHaveProperty('files_changed');
    expect((result.artifacts as any).files_changed).toEqual([]);
  });
});
