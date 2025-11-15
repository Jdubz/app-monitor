/**
 * Unit Tests for PlanStatusUpdater
 *
 * Tests the event-driven status update functionality that keeps
 * plan status synchronized with task, PR, and chain events.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PlanStatusUpdater } from '../planStatusUpdater.service.js';
import { PlansService } from '../plans.service.js';
import { PlanProgressCalculator } from '../planProgressCalculator.service.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, 'plan-status-updater-test.db');

function cleanupTestDb() {
  [TEST_DB_PATH, TEST_DB_PATH + '-shm', TEST_DB_PATH + '-wal'].forEach((file) => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
}

function setupTestSchema(db: Database.Database) {
  // Create plans table
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      plan_type TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );
  `);

  // Create tasks table
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

function insertPlan(db: Database.Database, plan: { id: string; title: string; status?: string }) {
  db.prepare(`
    INSERT INTO plans (id, title, plan_type, priority, status, created_at)
    VALUES (?, ?, 'feature', 'p0', ?, ?)
  `).run(plan.id, plan.title, plan.status || 'planning', Date.now());
}

function insertTask(
  db: Database.Database,
  task: {
    id: string;
    title: string;
    status: string;
    plan_id?: string;
    chain_status?: string;
    chain_id?: string;
    pr_number?: number;
  }
) {
  db.prepare(`
    INSERT INTO tasks (id, title, status, plan_id, chain_status, chain_id, pr_number, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.title,
    task.status,
    task.plan_id || null,
    task.chain_status || null,
    task.chain_id || null,
    task.pr_number || null,
    Date.now()
  );
}

function getPlanStatus(db: Database.Database, planId: string): string | undefined {
  const row = db.prepare('SELECT status FROM plans WHERE id = ?').get(planId) as any;
  return row?.status;
}

describe('PlanStatusUpdater', () => {
  let db: Database.Database;
  let plansService: PlansService;
  let progressCalculator: PlanProgressCalculator;
  let statusUpdater: PlanStatusUpdater;

  beforeEach(() => {
    cleanupTestDb();
    db = new Database(TEST_DB_PATH);
    setupTestSchema(db);
    plansService = new PlansService(db);
    progressCalculator = new PlanProgressCalculator(db);
    statusUpdater = new PlanStatusUpdater(db, plansService, progressCalculator);
  });

  afterEach(() => {
    db.close();
    cleanupTestDb();
  });

  describe('onTaskCreated', () => {
    it('should transition plan from planning to in_progress when first task created', async () => {
      insertPlan(db, { id: 'plan-1', title: 'New Plan', status: 'planning' });
      insertTask(db, { id: 'task-1', title: 'First Task', status: 'pending', plan_id: 'plan-1' });

      await statusUpdater.onTaskCreated('task-1');

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('in_progress');
    });

    it('should not change status if task has no plan_id', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Plan', status: 'planning' });
      insertTask(db, { id: 'task-1', title: 'Standalone Task', status: 'pending' });

      await statusUpdater.onTaskCreated('task-1');

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('planning'); // Unchanged
    });

    it('should not change status if plan already in_progress', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Active Plan', status: 'in_progress' });
      insertTask(db, { id: 'task-1', title: 'New Task', status: 'pending', plan_id: 'plan-1' });

      await statusUpdater.onTaskCreated('task-1');

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('in_progress'); // No change
    });

    it('should handle non-existent task gracefully', async () => {
      await expect(statusUpdater.onTaskCreated('non-existent')).resolves.not.toThrow();
    });
  });

  describe('onTaskStatusChange', () => {
    it('should update plan to completed when all tasks completed', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Almost Done', status: 'in_progress' });
      insertTask(db, { id: 'task-1', title: 'Task 1', status: 'completed', plan_id: 'plan-1' });
      insertTask(db, { id: 'task-2', title: 'Task 2', status: 'running', plan_id: 'plan-1' });

      // Update task-2 to completed
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('completed', 'task-2');

      await statusUpdater.onTaskStatusChange('task-2');

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('completed');
    });

    it('should keep plan in_progress if some tasks still pending', async () => {
      insertPlan(db, { id: 'plan-1', title: 'In Progress', status: 'in_progress' });
      insertTask(db, { id: 'task-1', title: 'Task 1', status: 'completed', plan_id: 'plan-1' });
      insertTask(db, { id: 'task-2', title: 'Task 2', status: 'pending', plan_id: 'plan-1' });

      await statusUpdater.onTaskStatusChange('task-1');

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('in_progress');
    });

    it('should not update status if task has no plan_id', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Plan', status: 'in_progress' });
      insertTask(db, { id: 'task-1', title: 'Standalone Task', status: 'completed' });

      await statusUpdater.onTaskStatusChange('task-1');

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('in_progress'); // Unchanged
    });

    it('should handle non-existent task gracefully', async () => {
      await expect(statusUpdater.onTaskStatusChange('non-existent')).resolves.not.toThrow();
    });
  });

  describe('onPRMerged', () => {
    it('should update plan status when PR merged', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Plan with PR', status: 'in_progress' });
      insertTask(db, { id: 'task-1', title: 'Task 1', status: 'completed', plan_id: 'plan-1', pr_number: 123 });
      insertTask(db, { id: 'task-2', title: 'Task 2', status: 'pending', plan_id: 'plan-1' });

      await statusUpdater.onPRMerged(123);

      // Status should still be in_progress because task-2 is pending
      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('in_progress');
    });

    it('should update to completed if PR merge completes last task', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Last PR', status: 'in_progress' });
      insertTask(db, { id: 'task-1', title: 'Task 1', status: 'completed', plan_id: 'plan-1' });
      insertTask(db, { id: 'task-2', title: 'Task 2', status: 'completed', plan_id: 'plan-1', pr_number: 123 });

      await statusUpdater.onPRMerged(123);

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('completed');
    });

    it('should handle PR not linked to any task', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Plan', status: 'in_progress' });

      await expect(statusUpdater.onPRMerged(999)).resolves.not.toThrow();

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('in_progress'); // Unchanged
    });
  });

  describe('onChainBlocked', () => {
    it('should update plan to blocked when chain blocked', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Plan with Chain', status: 'in_progress' });
      insertTask(db, {
        id: 'task-1',
        title: 'Task 1',
        status: 'running',
        plan_id: 'plan-1',
        chain_id: 'chain-1',
        chain_status: 'active',
      });

      // Update chain to blocked
      db.prepare('UPDATE tasks SET chain_status = ? WHERE id = ?').run('blocked', 'task-1');

      await statusUpdater.onChainBlocked('chain-1');

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('blocked');
    });

    it('should not change status if chain not linked to any plan', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Plan', status: 'in_progress' });

      await expect(statusUpdater.onChainBlocked('non-existent-chain')).resolves.not.toThrow();

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('in_progress');
    });

    it('should handle chain linked to multiple tasks', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Plan', status: 'in_progress' });
      insertTask(db, {
        id: 'task-1',
        title: 'Task 1',
        status: 'running',
        plan_id: 'plan-1',
        chain_id: 'chain-1',
        chain_status: 'active',
      });
      insertTask(db, {
        id: 'task-2',
        title: 'Task 2',
        status: 'running',
        plan_id: 'plan-1',
        chain_id: 'chain-1',
        chain_status: 'active',
      });

      // Block both tasks
      db.prepare('UPDATE tasks SET chain_status = ? WHERE chain_id = ?').run('blocked', 'chain-1');

      await statusUpdater.onChainBlocked('chain-1');

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('blocked');
    });
  });

  describe('onChainUnblocked', () => {
    it('should update plan from blocked to in_progress when chain unblocked', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Blocked Plan', status: 'blocked' });
      insertTask(db, {
        id: 'task-1',
        title: 'Task 1',
        status: 'running',
        plan_id: 'plan-1',
        chain_id: 'chain-1',
        chain_status: 'blocked',
      });

      // Unblock chain
      db.prepare('UPDATE tasks SET chain_status = ? WHERE id = ?').run('active', 'task-1');

      await statusUpdater.onChainUnblocked('chain-1');

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('in_progress');
    });

    it('should remain blocked if other chains still blocked', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Multi-Chain Plan', status: 'blocked' });
      insertTask(db, {
        id: 'task-1',
        title: 'Task 1',
        status: 'running',
        plan_id: 'plan-1',
        chain_id: 'chain-1',
        chain_status: 'active',
      });
      insertTask(db, {
        id: 'task-2',
        title: 'Task 2',
        status: 'running',
        plan_id: 'plan-1',
        chain_id: 'chain-2',
        chain_status: 'blocked',
      });

      await statusUpdater.onChainUnblocked('chain-1');

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('blocked'); // Still blocked due to chain-2
    });

    it('should handle chain not linked to any plan', async () => {
      await expect(statusUpdater.onChainUnblocked('non-existent-chain')).resolves.not.toThrow();
    });
  });

  describe('updateAllPlanStatuses', () => {
    it('should update all plans with tasks', async () => {
      // Plan 1: Should be in_progress
      insertPlan(db, { id: 'plan-1', title: 'Plan 1', status: 'planning' });
      insertTask(db, { id: 'task-1', title: 'Task 1', status: 'running', plan_id: 'plan-1' });

      // Plan 2: Should be completed
      insertPlan(db, { id: 'plan-2', title: 'Plan 2', status: 'in_progress' });
      insertTask(db, { id: 'task-2', title: 'Task 2', status: 'completed', plan_id: 'plan-2' });

      // Plan 3: Should be blocked
      insertPlan(db, { id: 'plan-3', title: 'Plan 3', status: 'in_progress' });
      insertTask(db, {
        id: 'task-3',
        title: 'Task 3',
        status: 'running',
        plan_id: 'plan-3',
        chain_status: 'blocked',
      });

      await statusUpdater.updateAllPlanStatuses();

      expect(getPlanStatus(db, 'plan-1')).toBe('in_progress');
      expect(getPlanStatus(db, 'plan-2')).toBe('completed');
      expect(getPlanStatus(db, 'plan-3')).toBe('blocked');
    });

    it('should handle plans with no tasks', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Empty Plan', status: 'in_progress' });

      await statusUpdater.updateAllPlanStatuses();

      const status = getPlanStatus(db, 'plan-1');
      expect(status).toBe('planning'); // Reset to planning when no tasks
    });

    it('should handle empty database', async () => {
      await expect(statusUpdater.updateAllPlanStatuses()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully in onTaskCreated', async () => {
      db.close(); // Force database error

      await expect(statusUpdater.onTaskCreated('task-1')).resolves.not.toThrow();
    });

    it('should handle database errors gracefully in onTaskStatusChange', async () => {
      db.close();

      await expect(statusUpdater.onTaskStatusChange('task-1')).resolves.not.toThrow();
    });

    it('should handle database errors gracefully in updateAllPlanStatuses', async () => {
      db.close();

      await expect(statusUpdater.updateAllPlanStatuses()).resolves.not.toThrow();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete task lifecycle', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Lifecycle Plan', status: 'planning' });

      // Create first task - should transition to in_progress
      insertTask(db, { id: 'task-1', title: 'Task 1', status: 'pending', plan_id: 'plan-1' });
      await statusUpdater.onTaskCreated('task-1');
      expect(getPlanStatus(db, 'plan-1')).toBe('in_progress');

      // Create second task
      insertTask(db, { id: 'task-2', title: 'Task 2', status: 'pending', plan_id: 'plan-1' });
      await statusUpdater.onTaskCreated('task-2');
      expect(getPlanStatus(db, 'plan-1')).toBe('in_progress');

      // Complete first task
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('completed', 'task-1');
      await statusUpdater.onTaskStatusChange('task-1');
      expect(getPlanStatus(db, 'plan-1')).toBe('in_progress'); // Still one pending

      // Complete second task
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('completed', 'task-2');
      await statusUpdater.onTaskStatusChange('task-2');
      expect(getPlanStatus(db, 'plan-1')).toBe('completed');
    });

    it('should handle chain blocking and unblocking', async () => {
      insertPlan(db, { id: 'plan-1', title: 'Chain Plan', status: 'in_progress' });
      insertTask(db, {
        id: 'task-1',
        title: 'Task 1',
        status: 'running',
        plan_id: 'plan-1',
        chain_id: 'chain-1',
        chain_status: 'active',
      });

      // Block chain
      db.prepare('UPDATE tasks SET chain_status = ? WHERE id = ?').run('blocked', 'task-1');
      await statusUpdater.onChainBlocked('chain-1');
      expect(getPlanStatus(db, 'plan-1')).toBe('blocked');

      // Unblock chain
      db.prepare('UPDATE tasks SET chain_status = ? WHERE id = ?').run('active', 'task-1');
      await statusUpdater.onChainUnblocked('chain-1');
      expect(getPlanStatus(db, 'plan-1')).toBe('in_progress');

      // Complete task
      db.prepare('UPDATE tasks SET status = ?, chain_status = ? WHERE id = ?').run(
        'completed',
        'closed',
        'task-1'
      );
      await statusUpdater.onTaskStatusChange('task-1');
      expect(getPlanStatus(db, 'plan-1')).toBe('completed');
    });
  });
});
