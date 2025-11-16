/**
 * Unit Tests for PlansService
 *
 * Tests all CRUD operations and business logic for managing plans.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PlansService } from '../plans.service.js';
import type { CreatePlanInput } from '../../types/plan.js';




function setupTestSchema(db: Database.Database) {
  // Create plans table matching migration 021
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      markdown_ref TEXT,
      plan_type TEXT NOT NULL CHECK(plan_type IN ('feature', 'refactor', 'fix', 'investigation')),
      priority TEXT NOT NULL CHECK(priority IN ('p0', 'p1', 'p2', 'p3')),
      status TEXT NOT NULL CHECK(status IN ('planning', 'in_progress', 'blocked', 'completed', 'cancelled')),
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      cancelled_at INTEGER,
      created_by TEXT,
      assigned_to TEXT,
      success_criteria TEXT,
      scope_boundaries TEXT,
      estimated_effort_hours INTEGER,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
    CREATE INDEX IF NOT EXISTS idx_plans_priority ON plans(priority);
    CREATE INDEX IF NOT EXISTS idx_plans_type ON plans(plan_type);
  `);

  // Create tasks table for getPlanTasks tests
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      plan_id TEXT,
      chain_status TEXT,
      chain_id TEXT,
      pr_number INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_plan_id ON tasks(plan_id) WHERE plan_id IS NOT NULL;
  `);
}

describe('PlansService', () => {
  let db: Database.Database;
  let service: PlansService;

  beforeEach(() => {    db = new Database(':memory:');
    setupTestSchema(db);
    service = new PlansService(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch (err) {
      // Ignore close errors in tests
    }
  });

  describe('createPlan', () => {
    it('should create a plan with required fields only', () => {
      const input: CreatePlanInput = {
        title: 'Test Plan',
        plan_type: 'feature',
        priority: 'p0',
      };

      const plan = service.createPlan(input);

      expect(plan.id).toMatch(/^plan-[a-f0-9-]+$/);
      expect(plan.title).toBe('Test Plan');
      expect(plan.plan_type).toBe('feature');
      expect(plan.priority).toBe('p0');
      expect(plan.status).toBe('planning');
      expect(plan.created_at).toBeGreaterThan(0);
      expect(plan.description).toBeUndefined();
      expect(plan.created_by).toBeUndefined();
    });

    it('should create a plan with all optional fields', () => {
      const input: CreatePlanInput = {
        title: 'Full Plan',
        plan_type: 'refactor',
        priority: 'p1',
        description: 'A comprehensive plan',
        markdown_ref: 'docs/plans/full-plan.md',
        created_by: 'ai-agent',
        assigned_to: 'engineering',
        success_criteria: ['Improve performance', 'Reduce complexity'],
        scope_boundaries: {
          mustNotChange: ['Public API'],
          mustNotAffect: ['Database schema'],
        },
        estimated_effort_hours: 20,
        metadata: { custom: 'value' },
      };

      const plan = service.createPlan(input);

      expect(plan.title).toBe('Full Plan');
      expect(plan.description).toBe('A comprehensive plan');
      expect(plan.markdown_ref).toBe('docs/plans/full-plan.md');
      expect(plan.created_by).toBe('ai-agent');
      expect(plan.assigned_to).toBe('engineering');
      expect(plan.success_criteria).toEqual(['Improve performance', 'Reduce complexity']);
      expect(plan.scope_boundaries).toEqual({
        mustNotChange: ['Public API'],
        mustNotAffect: ['Database schema'],
      });
      expect(plan.estimated_effort_hours).toBe(20);
      expect(plan.metadata).toEqual({ custom: 'value' });
    });

    it('should create plans with different types', () => {
      const types = ['feature', 'refactor', 'fix', 'investigation'] as const;

      types.forEach((type) => {
        const plan = service.createPlan({
          title: `${type} plan`,
          plan_type: type,
          priority: 'p2',
        });

        expect(plan.plan_type).toBe(type);
      });
    });

    it('should create plans with different priorities', () => {
      const priorities = ['p0', 'p1', 'p2', 'p3'] as const;

      priorities.forEach((priority) => {
        const plan = service.createPlan({
          title: `${priority} plan`,
          plan_type: 'feature',
          priority,
        });

        expect(plan.priority).toBe(priority);
      });
    });
  });

  describe('getPlan', () => {
    it('should retrieve an existing plan', () => {
      const created = service.createPlan({
        title: 'Retrievable Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      const retrieved = service.getPlan(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe('Retrievable Plan');
    });

    it('should return null for non-existent plan', () => {
      const plan = service.getPlan('plan-nonexistent');

      expect(plan).toBeNull();
    });

    it('should correctly parse JSON fields', () => {
      const created = service.createPlan({
        title: 'Plan with JSON',
        plan_type: 'feature',
        priority: 'p0',
        success_criteria: ['Criteria 1', 'Criteria 2'],
        scope_boundaries: {
          mustNotChange: ['File A'],
          mustNotAffect: ['Service B'],
        },
        metadata: { key: 'value' },
      });

      const retrieved = service.getPlan(created.id);

      expect(retrieved?.success_criteria).toEqual(['Criteria 1', 'Criteria 2']);
      expect(retrieved?.scope_boundaries).toEqual({
        mustNotChange: ['File A'],
        mustNotAffect: ['Service B'],
      });
      expect(retrieved?.metadata).toEqual({ key: 'value' });
    });

    it('should handle corrupted JSON gracefully', () => {
      // Manually insert a plan with invalid JSON
      db.prepare(`
        INSERT INTO plans (id, title, plan_type, priority, status, created_at, success_criteria)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('plan-corrupted', 'Corrupted Plan', 'feature', 'p0', 'planning', Date.now(), 'invalid-json');

      const plan = service.getPlan('plan-corrupted');

      expect(plan).toBeDefined();
      expect(plan?.success_criteria).toBeUndefined(); // Invalid JSON should be ignored
    });
  });

  describe('updatePlan', () => {
    it('should update plan title', () => {
      const created = service.createPlan({
        title: 'Original Title',
        plan_type: 'feature',
        priority: 'p0',
      });

      const updated = service.updatePlan(created.id, { title: 'Updated Title' });

      expect(updated?.title).toBe('Updated Title');
      expect(updated?.id).toBe(created.id);
    });

    it('should update multiple fields', () => {
      const created = service.createPlan({
        title: 'Original Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      const updated = service.updatePlan(created.id, {
        title: 'Updated Plan',
        description: 'New description',
        priority: 'p1',
        estimated_effort_hours: 15,
      });

      expect(updated?.title).toBe('Updated Plan');
      expect(updated?.description).toBe('New description');
      expect(updated?.priority).toBe('p1');
      expect(updated?.estimated_effort_hours).toBe(15);
    });

    it('should update success criteria', () => {
      const created = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
        success_criteria: ['Old criterion'],
      });

      const updated = service.updatePlan(created.id, {
        success_criteria: ['New criterion 1', 'New criterion 2'],
      });

      expect(updated?.success_criteria).toEqual(['New criterion 1', 'New criterion 2']);
    });

    it('should update scope boundaries', () => {
      const created = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      const updated = service.updatePlan(created.id, {
        scope_boundaries: {
          mustNotChange: ['API'],
          mustNotAffect: ['DB'],
        },
      });

      expect(updated?.scope_boundaries).toEqual({
        mustNotChange: ['API'],
        mustNotAffect: ['DB'],
      });
    });

    it('should return null for non-existent plan', () => {
      const updated = service.updatePlan('plan-nonexistent', { title: 'New Title' });

      expect(updated).toBeNull();
    });

    it('should return existing plan when no updates provided', () => {
      const created = service.createPlan({
        title: 'Unchanged Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      const updated = service.updatePlan(created.id, {});

      expect(updated?.id).toBe(created.id);
      expect(updated?.title).toBe('Unchanged Plan');
    });
  });

  describe('deletePlan', () => {
    it('should delete an existing plan', () => {
      const created = service.createPlan({
        title: 'To Delete',
        plan_type: 'feature',
        priority: 'p0',
      });

      const deleted = service.deletePlan(created.id);

      expect(deleted).toBe(true);
      expect(service.getPlan(created.id)).toBeNull();
    });

    it('should return false when deleting non-existent plan', () => {
      const deleted = service.deletePlan('plan-nonexistent');

      expect(deleted).toBe(false);
    });

    it('should not affect tasks linked to the plan', () => {
      const created = service.createPlan({
        title: 'Plan with Tasks',
        plan_type: 'feature',
        priority: 'p0',
      });

      // Insert a task linked to the plan
      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('task-1', 'Task 1', 'pending', created.id, Date.now());

      service.deletePlan(created.id);

      // Task should still exist
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('task-1');
      expect(task).toBeDefined();
    });
  });

  describe('cancelPlan', () => {
    it('should cancel a plan', () => {
      const created = service.createPlan({
        title: 'To Cancel',
        plan_type: 'feature',
        priority: 'p0',
      });

      const cancelled = service.cancelPlan(created.id);

      expect(cancelled?.status).toBe('cancelled');
      expect(cancelled?.cancelled_at).toBeGreaterThan(0);
    });

    it('should return null for non-existent plan', () => {
      const cancelled = service.cancelPlan('plan-nonexistent');

      expect(cancelled).toBeNull();
    });

    it('should preserve other plan fields when cancelling', () => {
      const created = service.createPlan({
        title: 'Plan to Cancel',
        plan_type: 'feature',
        priority: 'p0',
        description: 'Test description',
      });

      const cancelled = service.cancelPlan(created.id);

      expect(cancelled?.title).toBe('Plan to Cancel');
      expect(cancelled?.description).toBe('Test description');
      expect(cancelled?.plan_type).toBe('feature');
      expect(cancelled?.priority).toBe('p0');
    });
  });

  describe('listPlans', () => {
    beforeEach(() => {
      // Create test plans
      service.createPlan({
        title: 'Feature P0',
        plan_type: 'feature',
        priority: 'p0',
        created_by: 'ai-agent',
      });

      service.createPlan({
        title: 'Refactor P1',
        plan_type: 'refactor',
        priority: 'p1',
        created_by: 'developer',
      });

      service.createPlan({
        title: 'Fix P2',
        plan_type: 'fix',
        priority: 'p2',
        assigned_to: 'team-a',
      });
    });

    it('should list all plans when no filters', () => {
      const plans = service.listPlans();

      expect(plans).toHaveLength(3);
    });

    it('should filter by status', () => {
      // Update one plan to in_progress
      const plans = service.listPlans();
      db.prepare("UPDATE plans SET status = 'in_progress' WHERE id = ?").run(plans[0].id);

      const filtered = service.listPlans({ status: 'in_progress' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe('in_progress');
    });

    it('should filter by multiple statuses', () => {
      const plans = service.listPlans();
      db.prepare("UPDATE plans SET status = 'in_progress' WHERE id = ?").run(plans[0].id);
      db.prepare("UPDATE plans SET status = 'completed' WHERE id = ?").run(plans[1].id);

      const filtered = service.listPlans({ status: ['in_progress', 'completed'] });

      expect(filtered).toHaveLength(2);
    });

    it('should filter by priority', () => {
      const filtered = service.listPlans({ priority: 'p0' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Feature P0');
    });

    it('should filter by multiple priorities', () => {
      const filtered = service.listPlans({ priority: ['p0', 'p1'] });

      expect(filtered).toHaveLength(2);
    });

    it('should filter by plan type', () => {
      const filtered = service.listPlans({ plan_type: 'feature' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].plan_type).toBe('feature');
    });

    it('should filter by multiple plan types', () => {
      const filtered = service.listPlans({ plan_type: ['feature', 'refactor'] });

      expect(filtered).toHaveLength(2);
    });

    it('should filter by created_by', () => {
      const filtered = service.listPlans({ created_by: 'ai-agent' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].created_by).toBe('ai-agent');
    });

    it('should filter by assigned_to', () => {
      const filtered = service.listPlans({ assigned_to: 'team-a' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].assigned_to).toBe('team-a');
    });

    it('should combine multiple filters', () => {
      const filtered = service.listPlans({
        plan_type: 'feature',
        priority: 'p0',
        created_by: 'ai-agent',
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Feature P0');
    });

    it('should sort by priority then created_at desc', () => {
      // Create plans with same priority at different times
      service.createPlan({
        title: 'Second P0',
        plan_type: 'feature',
        priority: 'p0',
      });

      const filtered = service.listPlans({ priority: 'p0' });

      expect(filtered).toHaveLength(2);
      expect(filtered[0].title).toBe('Second P0'); // More recent
      expect(filtered[1].title).toBe('Feature P0'); // Older
    });
  });

  describe('getPlanTasks', () => {
    it('should return empty array for plan with no tasks', () => {
      const plan = service.createPlan({
        title: 'Empty Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      const tasks = service.getPlanTasks(plan.id);

      expect(tasks).toEqual([]);
    });

    it('should return tasks linked to a plan', () => {
      const plan = service.createPlan({
        title: 'Plan with Tasks',
        plan_type: 'feature',
        priority: 'p0',
      });

      // Insert tasks
      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('task-1', 'Task 1', 'pending', plan.id, Date.now());

      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('task-2', 'Task 2', 'in_progress', plan.id, Date.now() + 1000);

      const tasks = service.getPlanTasks(plan.id);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe('task-1');
      expect(tasks[1].id).toBe('task-2');
    });

    it('should include PR and chain information', () => {
      const plan = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, pr_number, chain_id, chain_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('task-1', 'Task with PR', 'in_progress', plan.id, 123, 'chain-1', 'running', Date.now());

      const tasks = service.getPlanTasks(plan.id);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].pr_number).toBe(123);
      expect(tasks[0].chain_id).toBe('chain-1');
      expect(tasks[0].chain_status).toBe('running');
    });

    it('should only return tasks for the specified plan', () => {
      const plan1 = service.createPlan({
        title: 'Plan 1',
        plan_type: 'feature',
        priority: 'p0',
      });

      const plan2 = service.createPlan({
        title: 'Plan 2',
        plan_type: 'feature',
        priority: 'p0',
      });

      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('task-1', 'Task 1', 'pending', plan1.id, Date.now());

      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('task-2', 'Task 2', 'pending', plan2.id, Date.now());

      const tasks = service.getPlanTasks(plan1.id);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
    });

    it('should sort tasks by created_at ascending', () => {
      const plan = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      const now = Date.now();

      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('task-3', 'Task 3', 'pending', plan.id, now + 2000);

      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('task-1', 'Task 1', 'pending', plan.id, now);

      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('task-2', 'Task 2', 'pending', plan.id, now + 1000);

      const tasks = service.getPlanTasks(plan.id);

      expect(tasks[0].id).toBe('task-1');
      expect(tasks[1].id).toBe('task-2');
      expect(tasks[2].id).toBe('task-3');
    });
  });

  describe('updatePlanStatus', () => {
    it('should update plan status', () => {
      const plan = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      service.updatePlanStatus(plan.id, 'in_progress');

      const updated = service.getPlan(plan.id);
      expect(updated?.status).toBe('in_progress');
    });

    it('should set started_at when transitioning to in_progress', () => {
      const plan = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      expect(plan.started_at).toBeUndefined();

      service.updatePlanStatus(plan.id, 'in_progress');

      const updated = service.getPlan(plan.id);
      expect(updated?.started_at).toBeGreaterThan(0);
    });

    it('should not update started_at if already set', () => {
      const plan = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      service.updatePlanStatus(plan.id, 'in_progress');
      const firstUpdate = service.getPlan(plan.id);
      const firstStartedAt = firstUpdate?.started_at;

      // Update to blocked then back to in_progress
      service.updatePlanStatus(plan.id, 'blocked');
      service.updatePlanStatus(plan.id, 'in_progress');

      const secondUpdate = service.getPlan(plan.id);
      expect(secondUpdate?.started_at).toBe(firstStartedAt);
    });

    it('should set completed_at when transitioning to completed', () => {
      const plan = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      service.updatePlanStatus(plan.id, 'completed');

      const updated = service.getPlan(plan.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.completed_at).toBeGreaterThan(0);
    });

    it('should update status to blocked', () => {
      const plan = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
      });

      service.updatePlanStatus(plan.id, 'in_progress');
      service.updatePlanStatus(plan.id, 'blocked');

      const updated = service.getPlan(plan.id);
      expect(updated?.status).toBe('blocked');
    });
  });

  describe('edge cases', () => {
    it('should handle plans with very long titles', () => {
      const longTitle = 'A'.repeat(1000);
      const plan = service.createPlan({
        title: longTitle,
        plan_type: 'feature',
        priority: 'p0',
      });

      expect(plan.title).toBe(longTitle);
    });

    it('should handle plans with empty string description', () => {
      const plan = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
        description: '',
      });

      expect(plan.description).toBe('');
    });

    it('should handle large metadata objects', () => {
      const largeMetadata = {
        data: Array(100).fill({ key: 'value', nested: { deep: 'object' } }),
      };

      const plan = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
        metadata: largeMetadata,
      });

      const retrieved = service.getPlan(plan.id);
      expect(retrieved?.metadata).toEqual(largeMetadata);
    });

    it('should handle zero estimated effort hours', () => {
      const plan = service.createPlan({
        title: 'Plan',
        plan_type: 'feature',
        priority: 'p0',
        estimated_effort_hours: 0,
      });

      expect(plan.estimated_effort_hours).toBe(0);
    });
  });
});
