/**
 * Integration Tests for Plans API Routes
 *
 * Tests the plan management API endpoints including validation,
 * authentication, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import Database from 'better-sqlite3';
import { createPlansRoutes } from '../dev-bots/plans.routes.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, 'plans-routes-test.db');
const TEST_API_KEY = 'test-api-key-123';

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

  // Create tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      plan_id TEXT,
      chain_status TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_plan_id ON tasks(plan_id) WHERE plan_id IS NOT NULL;
  `);
}

// Mock requireApiKey middleware
const mockRequireApiKey = (req: any, res: any, next: any) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== TEST_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

describe('Plans API Routes', () => {
  let app: Express;
  let db: Database.Database;

  beforeEach(() => {
    cleanupTestDb();
    db = new Database(TEST_DB_PATH);
    setupTestSchema(db);

    app = express();
    app.use(express.json());

    const plansRouter = createPlansRoutes(db);
    app.use('/api/dev-bots/plans', mockRequireApiKey, plansRouter);
  });

  afterEach(() => {
    db.close();
    cleanupTestDb();
  });

  describe('POST /api/dev-bots/plans', () => {
    it('should create a plan with required fields', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans')
        .set('x-api-key', TEST_API_KEY)
        .send({
          title: 'Test Plan',
          plan_type: 'feature',
          priority: 'p0',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.title).toBe('Test Plan');
      expect(response.body.data.plan_type).toBe('feature');
      expect(response.body.data.priority).toBe('p0');
      expect(response.body.data.status).toBe('planning');
    });

    it('should create a plan with all optional fields', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans')
        .set('x-api-key', TEST_API_KEY)
        .send({
          title: 'Comprehensive Plan',
          description: 'Detailed description',
          markdown_ref: 'docs/plans/test.md',
          plan_type: 'refactor',
          priority: 'p1',
          created_by: 'jdubz',
          assigned_to: 'backend-team',
          success_criteria: ['Criterion 1', 'Criterion 2'],
          scope_boundaries: {
            mustNotChange: ['API'],
            mustNotAffect: ['DB'],
          },
          estimated_effort_hours: 40,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.description).toBe('Detailed description');
      expect(response.body.data.success_criteria).toEqual(['Criterion 1', 'Criterion 2']);
      expect(response.body.data.estimated_effort_hours).toBe(40);
    });

    it('should reject request without title', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans')
        .set('x-api-key', TEST_API_KEY)
        .send({
          plan_type: 'feature',
          priority: 'p0',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('title');
    });

    it('should reject request with invalid plan_type', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans')
        .set('x-api-key', TEST_API_KEY)
        .send({
          title: 'Test Plan',
          plan_type: 'invalid',
          priority: 'p0',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject request with invalid priority', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans')
        .set('x-api-key', TEST_API_KEY)
        .send({
          title: 'Test Plan',
          plan_type: 'feature',
          priority: 'invalid',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject request without API key', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans')
        .send({
          title: 'Test Plan',
          plan_type: 'feature',
          priority: 'p0',
        });

      expect(response.status).toBe(401);
    });

    it('should reject request with too long title', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans')
        .set('x-api-key', TEST_API_KEY)
        .send({
          title: 'A'.repeat(201), // Max is 200
          plan_type: 'feature',
          priority: 'p0',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('title');
    });

    it('should reject request with negative estimated hours', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans')
        .set('x-api-key', TEST_API_KEY)
        .send({
          title: 'Test Plan',
          plan_type: 'feature',
          priority: 'p0',
          estimated_effort_hours: -10,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('hours');
    });
  });

  describe('GET /api/dev-bots/plans', () => {
    beforeEach(() => {
      // Insert test data
      db.prepare(`
        INSERT INTO plans (id, title, plan_type, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('plan-1', 'P0 Feature', 'feature', 'p0', 'in_progress', Date.now());

      db.prepare(`
        INSERT INTO plans (id, title, plan_type, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('plan-2', 'P1 Refactor', 'refactor', 'p1', 'planning', Date.now());

      db.prepare(`
        INSERT INTO plans (id, title, plan_type, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('plan-3', 'P0 Fix', 'fix', 'p0', 'completed', Date.now());
    });

    it('should list all plans', async () => {
      const response = await request(app)
        .get('/api/dev-bots/plans')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
    });

    it('should filter plans by status', async () => {
      const response = await request(app)
        .get('/api/dev-bots/plans?status=in_progress')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe('plan-1');
    });

    it('should filter plans by priority', async () => {
      const response = await request(app)
        .get('/api/dev-bots/plans?priority=p0')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it('should filter plans by plan_type', async () => {
      const response = await request(app)
        .get('/api/dev-bots/plans?plan_type=refactor')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe('plan-2');
    });

    it('should filter by multiple criteria', async () => {
      const response = await request(app)
        .get('/api/dev-bots/plans?priority=p0&status=completed')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe('plan-3');
    });

    it('should reject request without API key', async () => {
      const response = await request(app).get('/api/dev-bots/plans');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/dev-bots/plans/:planId', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO plans (id, title, plan_type, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('plan-1', 'Test Plan', 'feature', 'p0', 'in_progress', Date.now());
    });

    it('should get plan by ID', async () => {
      const response = await request(app)
        .get('/api/dev-bots/plans/plan-1')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('plan-1');
      expect(response.body.data.title).toBe('Test Plan');
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(app)
        .get('/api/dev-bots/plans/non-existent')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /api/dev-bots/plans/:planId', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO plans (id, title, plan_type, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('plan-1', 'Original Title', 'feature', 'p0', 'planning', Date.now());
    });

    it('should update plan metadata', async () => {
      const response = await request(app)
        .patch('/api/dev-bots/plans/plan-1')
        .set('x-api-key', TEST_API_KEY)
        .send({
          title: 'Updated Title',
          description: 'New description',
          priority: 'p1',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Updated Title');
      expect(response.body.data.description).toBe('New description');
      expect(response.body.data.priority).toBe('p1');
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(app)
        .patch('/api/dev-bots/plans/non-existent')
        .set('x-api-key', TEST_API_KEY)
        .send({
          title: 'New Title',
        });

      expect(response.status).toBe(404);
    });

    it('should reject invalid update data', async () => {
      const response = await request(app)
        .patch('/api/dev-bots/plans/plan-1')
        .set('x-api-key', TEST_API_KEY)
        .send({
          priority: 'invalid',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/dev-bots/plans/:planId', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO plans (id, title, plan_type, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('plan-1', 'Plan to Delete', 'feature', 'p0', 'planning', Date.now());
    });

    it('should delete a plan', async () => {
      const response = await request(app)
        .delete('/api/dev-bots/plans/plan-1')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify plan is deleted
      const check = await request(app)
        .get('/api/dev-bots/plans/plan-1')
        .set('x-api-key', TEST_API_KEY);

      expect(check.status).toBe(404);
    });

    it('should return 200 even for non-existent plan', async () => {
      const response = await request(app)
        .delete('/api/dev-bots/plans/non-existent')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/dev-bots/plans/:planId/cancel', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO plans (id, title, plan_type, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('plan-1', 'Plan to Cancel', 'feature', 'p0', 'in_progress', Date.now());
    });

    it('should cancel a plan', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans/plan-1/cancel')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('cancelled');
      expect(response.body.data.cancelled_at).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans/non-existent/cancel')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/dev-bots/plans/:planId/tasks', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO plans (id, title, plan_type, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('plan-1', 'Plan with Tasks', 'feature', 'p0', 'in_progress', Date.now());

      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('task-1', 'Task 1', 'completed', 'plan-1', Date.now());

      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('task-2', 'Task 2', 'running', 'plan-1', Date.now());
    });

    it('should get tasks for a plan', async () => {
      const response = await request(app)
        .get('/api/dev-bots/plans/plan-1/tasks')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.map((t: any) => t.id)).toContain('task-1');
      expect(response.body.data.map((t: any) => t.id)).toContain('task-2');
    });

    it('should return empty array for plan with no tasks', async () => {
      db.prepare(`
        INSERT INTO plans (id, title, plan_type, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('plan-2', 'Empty Plan', 'feature', 'p0', 'planning', Date.now());

      const response = await request(app)
        .get('/api/dev-bots/plans/plan-2/tasks')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(app)
        .get('/api/dev-bots/plans/non-existent/tasks')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/dev-bots/plans/:planId/update-status', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO plans (id, title, plan_type, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('plan-1', 'Plan to Update', 'feature', 'p0', 'planning', Date.now());

      db.prepare(`
        INSERT INTO tasks (id, title, status, plan_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('task-1', 'Running Task', 'running', 'plan-1', Date.now());
    });

    it('should update plan status based on tasks', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans/plan-1/update-status')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('in_progress'); // Computed from task
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans/non-existent/update-status')
        .set('x-api-key', TEST_API_KEY);

      expect(response.status).toBe(404);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans')
        .set('x-api-key', TEST_API_KEY)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    it('should handle missing Content-Type header', async () => {
      const response = await request(app)
        .post('/api/dev-bots/plans')
        .set('x-api-key', TEST_API_KEY)
        .send({
          title: 'Test',
          plan_type: 'feature',
          priority: 'p0',
        });

      expect(response.status).toBe(201); // Should still work
    });
  });
});
