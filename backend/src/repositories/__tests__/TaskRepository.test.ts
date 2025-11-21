/**
 * Task Repository Unit Tests
 * 
 * Tests extracted database operations following Repository pattern.
 * Part of P0 refactoring plan - Week 1: Extract Database Operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TaskRepository } from '../TaskRepository.js';

describe('TaskRepository', () => {
  let db: Database.Database;
  let repository: TaskRepository;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    
    // Create schema mirroring TaskQueueService for unit tests
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        documentation TEXT,
        notes TEXT,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        assigned_at INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        assigned_agent TEXT NOT NULL,
        assigned_worker TEXT,
        agent_type TEXT,
        prompt TEXT,
        output TEXT,
        error TEXT,
        can_retry INTEGER DEFAULT 1,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        timeout_ms INTEGER DEFAULT NULL,
        fingerprint TEXT,
        estimated_hours REAL,
        complexity TEXT,
        exit_code INTEGER,
        files TEXT,
        dependencies TEXT,
        project TEXT,
        timeout INTEGER,
        metadata TEXT,
        context_json TEXT,
        pr_number INTEGER,
        chain_id TEXT,
        chain_depth INTEGER,
        chain_status TEXT,
        blocked_reason TEXT,
        blocked_at INTEGER,
        blocked_by TEXT,
        resumed_by TEXT,
        resumed_at INTEGER,
        phase_index INTEGER DEFAULT 1,
        phase_name TEXT,
        phase_status TEXT,
        phase_attempts INTEGER DEFAULT 1,
        phase_payload TEXT,
        context_bundle_id TEXT,
        context_cache_key TEXT,
        context_profiles TEXT,
        risk_level TEXT,
        task_category TEXT,
        file_patterns TEXT,
        estimated_complexity TEXT
      );

      CREATE TABLE task_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE TABLE task_criteria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        criterion TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE TABLE task_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        reference TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE TABLE task_validation_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        step TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE TABLE task_success_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE TABLE task_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        exit_code INTEGER,
        error TEXT,
        duration_ms INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );
    `);

    repository = new TaskRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a task with required fields', () => {
      const task = repository.create({
        title: 'Test Task',
        description: 'Test description',
        type: 'implementation'
      });

      expect(task.id).toMatch(/^task-implementation-/);
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test description');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe(5);
      expect(task.can_retry).toBe(true);
      expect(task.retry_count).toBe(0);
      expect(task.max_retries).toBe(3);
      expect(task.phase_index).toBe(1);
      expect(task.phase_name).toBe('Planning');
      expect(task.phase_status).toBe('ready');
    });

    it('should create a task with custom ID', () => {
      const customId = 'custom-task-123';
      const task = repository.create({
        id: customId,
        title: 'Custom ID Task'
      });

      expect(task.id).toBe(customId);
    });

    it('should create a task with related data', () => {
      const task = repository.create({
        title: 'Task with Related Data',
        files: ['src/app.ts', 'src/server.ts'],
        acceptance_criteria: ['Must compile', 'Must pass tests'],
        architecture_references: ['docs/architecture.md'],
        validation_steps: ['Run lint', 'Run tests'],
        success_metrics: ['Zero errors', '100% coverage']
      });

      expect(task.files).toEqual(['src/app.ts', 'src/server.ts']);
      expect(task.acceptance_criteria).toEqual(['Must compile', 'Must pass tests']);
      expect(task.architecture_references).toEqual(['docs/architecture.md']);
      expect(task.validation_steps).toEqual(['Run lint', 'Run tests']);
      expect(task.success_metrics).toEqual(['Zero errors', '100% coverage']);
    });

    it('should auto-generate chain_id if not provided', () => {
      const task = repository.create({
        title: 'Chain Test'
      });

      expect(task.chain_id).toBeDefined();
      expect(task.chain_id).toBe(task.id);
    });
  });

  describe('findById', () => {
    it('should find a task by ID', () => {
      const created = repository.create({
        title: 'Findable Task'
      });

      const found = repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe('Findable Task');
    });

    it('should return null for non-existent task', () => {
      const found = repository.findById('non-existent-id');
      expect(found).toBeNull();
    });

    it('should hydrate task with related data', () => {
      const created = repository.create({
        title: 'Task with Files',
        files: ['file1.ts', 'file2.ts']
      });

      const found = repository.findById(created.id);

      expect(found?.files).toEqual(['file1.ts', 'file2.ts']);
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      repository.create({ title: 'Task 1', status: 'pending', priority: 10 });
      repository.create({ title: 'Task 2', status: 'running', priority: 5 });
      repository.create({ title: 'Task 3', status: 'pending', priority: 8 });
    });

    it('should find all tasks without filters', () => {
      const tasks = repository.findAll();
      expect(tasks).toHaveLength(3);
    });

    it('should filter by status', () => {
      const tasks = repository.findAll({ status: 'pending' });
      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => t.status === 'pending')).toBe(true);
    });

    it('should sort by priority DESC, created_at ASC', () => {
      const tasks = repository.findAll({ status: 'pending' });
      expect(tasks[0].title).toBe('Task 1'); // priority 10
      expect(tasks[1].title).toBe('Task 3'); // priority 8
    });

    it('should filter by chain ID', () => {
      const task = repository.create({
        title: 'Chain Task',
        chain_id: 'chain-123'
      });

      const tasks = repository.findAll({ chainId: 'chain-123' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(task.id);
    });

  });

  describe('update', () => {
    it('should update task fields', () => {
      const task = repository.create({
        title: 'Original Title',
        status: 'pending'
      });

      const updated = repository.update(task.id, {
        status: 'running',
        startedAt: Date.now()
      });

      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('running');
      expect(updated?.started_at).toBeDefined();
    });

    it('should return null for non-existent task', () => {
      const updated = repository.update('non-existent', { status: 'running' });
      expect(updated).toBeNull();
    });

    it('should handle empty updates', () => {
      const task = repository.create({
        title: 'No Updates'
      });

      const updated = repository.update(task.id, {});
      expect(updated?.id).toBe(task.id);
    });

    it('should update phase fields', () => {
      const task = repository.create({
        title: 'Phase Task'
      });

      const updated = repository.update(task.id, {
        phaseIndex: 2,
        phaseName: 'Implementation',
        phaseStatus: 'running',
        phaseAttempts: 1
      });

      expect(updated?.phase_index).toBe(2);
      expect(updated?.phase_name).toBe('Implementation');
      expect(updated?.phase_status).toBe('running');
      expect(updated?.phase_attempts).toBe(1);
    });
  });

  describe('delete', () => {
    it('should delete a task and related data', () => {
      const task = repository.create({
        title: 'Delete Me',
        files: ['file1.ts'],
        acceptance_criteria: ['Criterion 1']
      });

      const deleted = repository.delete(task.id);
      expect(deleted).toBe(true);

      const found = repository.findById(task.id);
      expect(found).toBeNull();

      // Verify related data is also deleted
      const files = db.prepare('SELECT * FROM task_files WHERE task_id = ?').all(task.id);
      expect(files).toHaveLength(0);
    });

    it('should return false for non-existent task', () => {
      const deleted = repository.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('findByChainId', () => {
    it('should find all tasks in a chain', () => {
      const chainId = 'chain-test-123';
      
      repository.create({ title: 'Task 1', chain_id: chainId });
      repository.create({ title: 'Task 2', chain_id: chainId });
      repository.create({ title: 'Task 3', chain_id: 'other-chain' });

      const tasks = repository.findByChainId(chainId);
      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => t.chain_id === chainId)).toBe(true);
    });
  });

  describe('findByStatus', () => {
    it('should find all tasks with given status', () => {
      repository.create({ title: 'Pending 1', status: 'pending' });
      repository.create({ title: 'Running 1', status: 'running' });
      repository.create({ title: 'Pending 2', status: 'pending' });

      const pending = repository.findByStatus('pending');
      expect(pending).toHaveLength(2);
      expect(pending.every(t => t.status === 'pending')).toBe(true);
    });
  });

  describe('getExecutions', () => {
    it('should return task execution history', () => {
      const task = repository.create({
        title: 'Executed Task'
      });

      // Insert executions
      const stmt = db.prepare(`
        INSERT INTO task_executions (task_id, worker_id, attempt_number, started_at)
        VALUES (?, ?, ?, ?)
      `);
      
      stmt.run(task.id, 'worker-1', 1, Date.now() - 1000);
      stmt.run(task.id, 'worker-1', 2, Date.now());

      const executions = repository.getExecutions(task.id);
      expect(executions).toHaveLength(2);
      expect(executions[0].attempt_number).toBe(2); // DESC order
      expect(executions[1].attempt_number).toBe(1);
    });
  });

  describe('transaction', () => {
    it('should execute operations in a transaction', () => {
      const result = repository.transaction(() => {
        repository.create({ title: 'Task 1' });
        repository.create({ title: 'Task 2' });
        return 'success';
      });

      expect(result).toBe('success');
      expect(repository.findAll()).toHaveLength(2);
    });

    it('should rollback on error', () => {
      expect(() => {
        repository.transaction(() => {
          repository.create({ title: 'Task 1' });
          throw new Error('Rollback test');
        });
      }).toThrow('Rollback test');

      expect(repository.findAll()).toHaveLength(0);
    });
  });
});
