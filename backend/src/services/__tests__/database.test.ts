import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { TokenUsage, FailurePattern } from '../database';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, 'test.db');
const TEST_TASKQUEUE_DB_PATH = path.join(__dirname, 'test-taskqueue.db');

// Skip the native better-sqlite3 backed suite in CI where the addon is unavailable.
const shouldSkipNativeDbSuite =
  process.env.CI === 'true' && process.env.FORCE_NATIVE_DB_TESTS !== '1';

const describeNativeDb = shouldSkipNativeDbSuite ? describe.skip : describe;

type DatabaseModule = typeof import('../database');
type DevBotsDatabaseClass = DatabaseModule['DevBotsDatabase'];
type DevBotsDatabaseInstance = InstanceType<DevBotsDatabaseClass>;

type TaskQueueModule = typeof import('../taskQueue.sqlite');
type TaskQueueServiceClass = TaskQueueModule['TaskQueueService'];
type TaskQueueServiceInstance = InstanceType<TaskQueueServiceClass>;

function cleanupTestDatabaseFiles(): void {
  [TEST_DB_PATH, TEST_TASKQUEUE_DB_PATH].forEach((dbPath) => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    if (fs.existsSync(dbPath + '-shm')) {
      fs.unlinkSync(dbPath + '-shm');
    }
    if (fs.existsSync(dbPath + '-wal')) {
      fs.unlinkSync(dbPath + '-wal');
    }
  });
}

describeNativeDb('DevBotsDatabase', () => {
  let DevBotsDatabaseCtor: DevBotsDatabaseClass;
  let TaskQueueServiceCtor: TaskQueueServiceClass;
  let db: DevBotsDatabaseInstance;
  let taskQueue: TaskQueueServiceInstance;

  beforeAll(async () => {
    const dbModule: DatabaseModule = await import('../database.js');
    DevBotsDatabaseCtor = dbModule.DevBotsDatabase;
    const tqModule: TaskQueueModule = await import('../taskQueue.sqlite.js');
    TaskQueueServiceCtor = tqModule.TaskQueueService;
  });

  beforeEach(() => {
    cleanupTestDatabaseFiles();
    db = new DevBotsDatabaseCtor(TEST_DB_PATH);
    // TaskQueueService only needed for skipped tests
    taskQueue = new TaskQueueServiceCtor(TEST_TASKQUEUE_DB_PATH);
  });

  afterEach(() => {
    (db as DevBotsDatabaseInstance | undefined)?.close?.();
    taskQueue?.close?.();
    cleanupTestDatabaseFiles();
  });

  describe('Database Initialization', () => {
    it('should create database with schema', () => {
      expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
    });

    it('should create migrations table', () => {
      // Test that migrations table exists by trying to query it
      expect(() => {
        const stmt = (db as any).db.prepare('SELECT * FROM migrations');
        stmt.all();
      }).not.toThrow();
    });

    it('should create all required tables', () => {
      // Note: 'tasks', 'task_executions', 'workers' are created by TaskQueueService, not DevBotsDatabase
      // DevBotsDatabase creates supplementary tables only
      const tables = [
        'migrations',
        'token_usage',
        'experiments',
        'batch_approvals',
        'failure_patterns',
        'task_automation_runs'
      ];

      tables.forEach((table) => {
        expect(() => {
          const stmt = (db as any).db.prepare(`SELECT * FROM ${table}`);
          stmt.all();
        }).not.toThrow();
      });
    });

    it('should not reapply migrations on second initialization', () => {
      const initialCountResult = (db as any).db
        .prepare('SELECT COUNT(*) as count FROM migrations')
        .get();
      const initialMigrationCount = initialCountResult.count;

      db.close();

      // Create new database instance with same file
      const db2 = new DevBotsDatabaseCtor(TEST_DB_PATH);

      // Check migrations are not duplicated
      const migrations = (db2 as any).db
        .prepare('SELECT COUNT(*) as count FROM migrations')
        .get();
      expect(migrations.count).toBe(initialMigrationCount);

      db2.close();
    });
  });


  describe('Token Usage', () => {
    it('should record token usage', () => {
      const usage: TokenUsage = {
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        taskId: 'task-1',
        inputTokens: 1000,
        outputTokens: 500,
        costEstimate: 0.015
      };

      db.recordTokenUsage(usage);
      const stats = db.getDailyTokenUsage('claude');

      expect(stats.total_input).toBe(1000);
      expect(stats.total_output).toBe(500);
      expect(stats.request_count).toBe(1);
    });

    it('should aggregate multiple token usage records', () => {
      const usage1: TokenUsage = {
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        inputTokens: 1000,
        outputTokens: 500
      };

      const usage2: TokenUsage = {
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        inputTokens: 2000,
        outputTokens: 1000
      };

      db.recordTokenUsage(usage1);
      db.recordTokenUsage(usage2);

      const stats = db.getDailyTokenUsage('claude');

      expect(stats.total_input).toBe(3000);
      expect(stats.total_output).toBe(1500);
      expect(stats.request_count).toBe(2);
    });

    it('should return zero stats for provider with no usage', () => {
      const stats = db.getDailyTokenUsage('openai');

      expect(stats.total_input).toBe(0);
      expect(stats.total_output).toBe(0);
      expect(stats.request_count).toBe(0);
    });

    it('should handle token usage without task ID', () => {
      const usage: TokenUsage = {
        provider: 'gemini',
        model: 'gemini-pro',
        inputTokens: 500,
        outputTokens: 250
      };

      expect(() => {
        db.recordTokenUsage(usage);
      }).not.toThrow();

      const stats = db.getDailyTokenUsage('gemini');
      expect(stats.total_input).toBe(500);
    });
  });

  describe('Batch Approvals', () => {
    it('should create batch approval', () => {
      const batch = db.createBatchApproval(10);

      expect(batch.approved_count).toBe(10);
      expect(batch.executed_count).toBe(0);
      expect(batch.status).toBe('active');
      expect(batch.id).toBeDefined();
    });

    it('should retrieve batch approval by ID', () => {
      const batch = db.createBatchApproval(5);
      const retrieved = db.getBatchApproval(batch.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.approved_count).toBe(5);
    });

    it('should update batch execution count', () => {
      const batch = db.createBatchApproval(10);

      db.updateBatchExecution(batch.id, 5);
      const updated = db.getBatchApproval(batch.id);

      expect(updated?.executed_count).toBe(5);
    });

    it('should pause batch with reason', () => {
      const batch = db.createBatchApproval(10);

      db.pauseBatch(batch.id, 'task_failed');
      const paused = db.getBatchApproval(batch.id);

      expect(paused?.status).toBe('paused');
      expect(paused?.paused_reason).toBe('task_failed');
    });

    it('should get current active batch', () => {
      db.createBatchApproval(5);
      const batch2 = db.createBatchApproval(10);

      const current = db.getCurrentBatch();

      expect(current).toBeDefined();
      expect(current?.id).toBe(batch2.id);
      expect(current?.approved_count).toBe(10);
    });

    it('should return undefined when no active batch exists', () => {
      const current = db.getCurrentBatch();
      expect(current).toBeUndefined();
    });

    it('should not return paused batches as current', () => {
      const batch = db.createBatchApproval(10);
      db.pauseBatch(batch.id, 'manual_pause');

      const current = db.getCurrentBatch();
      expect(current).toBeUndefined();
    });

    it('should return undefined for non-existent batch ID', () => {
      const retrieved = db.getBatchApproval(999);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Failure Patterns', () => {
    it('should record failure pattern', () => {
      const pattern: FailurePattern = {
        taskId: 'task-1',
        category: 'lint_error',
        pattern: 'Missing semicolon at line 42'
      };

      db.recordFailurePattern(pattern);
      const patterns = db.getFailurePatterns('task-1');

      expect(patterns).toHaveLength(1);
      expect(patterns[0].category).toBe('lint_error');
      expect(patterns[0].pattern).toBe('Missing semicolon at line 42');
    });

    it('should retrieve multiple failure patterns for same task', () => {
      const pattern1: FailurePattern = {
        taskId: 'task-1',
        category: 'lint_error',
        pattern: 'Missing semicolon'
      };

      const pattern2: FailurePattern = {
        taskId: 'task-1',
        category: 'test_failure',
        pattern: 'Test timeout after 5000ms'
      };

      db.recordFailurePattern(pattern1);
      db.recordFailurePattern(pattern2);

      const patterns = db.getFailurePatterns('task-1');

      expect(patterns).toHaveLength(2);
      expect(patterns.map(p => p.category)).toContain('lint_error');
      expect(patterns.map(p => p.category)).toContain('test_failure');
    });

    it('should return empty array for task with no patterns', () => {
      const patterns = db.getFailurePatterns('non-existent-task');
      expect(patterns).toEqual([]);
    });

    it('should include timestamp and resolved status', () => {
      const pattern: FailurePattern = {
        taskId: 'task-1',
        category: 'merge_conflict',
        pattern: 'Conflict in src/index.ts'
      };

      db.recordFailurePattern(pattern);
      const patterns = db.getFailurePatterns('task-1');

      expect(patterns[0].timestamp).toBeDefined();
      expect(patterns[0].resolved).toBe(false);
      expect(patterns[0].id).toBeDefined();
    });

    it('should handle different failure categories', () => {
      const categories = [
        'lint_error',
        'test_failure',
        'merge_conflict',
        'incomplete_solution',
        'scope_creep'
      ];

      categories.forEach((category, index) => {
        db.recordFailurePattern({
          taskId: `task-${index}`,
          category,
          pattern: `Pattern for ${category}`
        });
      });

      categories.forEach((category, index) => {
        const patterns = db.getFailurePatterns(`task-${index}`);
        expect(patterns[0].category).toBe(category);
      });
    });
  });


  describe('Database Close', () => {
    it('should close database connection', () => {
      expect(() => {
        db.close();
      }).not.toThrow();
    });
  });
});
