import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskContextService } from './taskContext.service.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

describe('TaskContextService', () => {
  let service: TaskContextService;
  let testDbPath: string;
  let testDb: Database.Database;

  beforeEach(() => {
    // Create a temporary database for testing
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-context-test-'));
    testDbPath = path.join(tmpDir, 'test-db.sqlite');

    service = new TaskContextService(testDbPath);
    testDb = new Database(testDbPath);

    // Create the task_automation_runs table
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS task_automation_runs (
        run_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        worker_id TEXT,
        container_id TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER,
        exit_code INTEGER,
        status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'noop')),
        failure_reason TEXT,
        commit_sha TEXT,
        branch TEXT,
        quality_passed INTEGER,
        quality_validation_json TEXT,
        resource_usage_json TEXT,
        token_usage_json TEXT,
        container_meta_json TEXT,
        build_exit_code INTEGER,
        test_passed INTEGER,
        test_failed INTEGER,
        test_skipped INTEGER,
        lint_errors INTEGER,
        lint_warnings INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterEach(() => {
    // Clean up test database
    testDb.close();
    const tmpDir = path.dirname(testDbPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getTaskAutomationRuns', () => {
    it('should return all automation runs for a task ordered by started_at DESC', () => {
      // Insert test data
      const taskId = 'task-123';
      const runs = [
        {
          run_id: 'run-1',
          task_id: taskId,
          started_at: '2025-11-10T10:00:00Z',
          status: 'success',
          exit_code: 0
        },
        {
          run_id: 'run-2',
          task_id: taskId,
          started_at: '2025-11-10T11:00:00Z',
          status: 'failed',
          exit_code: 1
        },
        {
          run_id: 'run-3',
          task_id: taskId,
          started_at: '2025-11-10T09:00:00Z',
          status: 'success',
          exit_code: 0
        }
      ];

      const stmt = testDb.prepare(`
        INSERT INTO task_automation_runs (run_id, task_id, started_at, status, exit_code)
        VALUES (?, ?, ?, ?, ?)
      `);

      runs.forEach(run => {
        stmt.run(run.run_id, run.task_id, run.started_at, run.status, run.exit_code);
      });

      const result = service.getTaskAutomationRuns(taskId);

      expect(result).toHaveLength(3);
      // Should be ordered by started_at DESC
      expect(result[0].run_id).toBe('run-2'); // Most recent
      expect(result[1].run_id).toBe('run-1');
      expect(result[2].run_id).toBe('run-3'); // Oldest
    });

    it('should return empty array when no runs exist for task', () => {
      const result = service.getTaskAutomationRuns('non-existent-task');
      expect(result).toEqual([]);
    });

    it('should only return runs for the specified task', () => {
      const stmt = testDb.prepare(`
        INSERT INTO task_automation_runs (run_id, task_id, started_at, status)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run('run-1', 'task-123', '2025-11-10T10:00:00Z', 'success');
      stmt.run('run-2', 'task-456', '2025-11-10T11:00:00Z', 'success');

      const result = service.getTaskAutomationRuns('task-123');

      expect(result).toHaveLength(1);
      expect(result[0].run_id).toBe('run-1');
      expect(result[0].task_id).toBe('task-123');
    });
  });

  describe('getAutomationRun', () => {
    it('should return a specific automation run by run_id', () => {
      const testRun = {
        run_id: 'run-123',
        task_id: 'task-456',
        worker_id: 'worker-1',
        container_id: 'container-abc',
        started_at: '2025-11-10T10:00:00Z',
        completed_at: '2025-11-10T10:30:00Z',
        duration_ms: 1800000,
        exit_code: 0,
        status: 'success',
        failure_reason: null,
        commit_sha: 'abc123def456',
        branch: 'feature/test',
        quality_passed: 1,
        build_exit_code: 0,
        test_passed: 10,
        test_failed: 0,
        test_skipped: 1,
        lint_errors: 0,
        lint_warnings: 2
      };

      const stmt = testDb.prepare(`
        INSERT INTO task_automation_runs
        (run_id, task_id, worker_id, container_id, started_at, completed_at,
         duration_ms, exit_code, status, commit_sha, branch, quality_passed,
         build_exit_code, test_passed, test_failed, test_skipped,
         lint_errors, lint_warnings)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        testRun.run_id, testRun.task_id, testRun.worker_id, testRun.container_id,
        testRun.started_at, testRun.completed_at, testRun.duration_ms,
        testRun.exit_code, testRun.status, testRun.commit_sha, testRun.branch,
        testRun.quality_passed, testRun.build_exit_code, testRun.test_passed,
        testRun.test_failed, testRun.test_skipped, testRun.lint_errors,
        testRun.lint_warnings
      );

      const result = service.getAutomationRun('run-123');

      expect(result).not.toBeNull();
      expect(result?.run_id).toBe('run-123');
      expect(result?.task_id).toBe('task-456');
      expect(result?.worker_id).toBe('worker-1');
      expect(result?.status).toBe('success');
      expect(result?.exit_code).toBe(0);
      expect(result?.duration_ms).toBe(1800000);
      expect(result?.test_passed).toBe(10);
      expect(result?.lint_warnings).toBe(2);
    });

    it('should return null when run does not exist', () => {
      const result = service.getAutomationRun('non-existent-run');
      expect(result).toBeNull();
    });
  });

  describe('getLatestAutomationRun', () => {
    it('should return the most recent automation run for a task', () => {
      const taskId = 'task-123';
      const stmt = testDb.prepare(`
        INSERT INTO task_automation_runs (run_id, task_id, started_at, status)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run('run-1', taskId, '2025-11-10T09:00:00Z', 'success');
      stmt.run('run-2', taskId, '2025-11-10T11:00:00Z', 'failed');
      stmt.run('run-3', taskId, '2025-11-10T10:00:00Z', 'success');

      const result = service.getLatestAutomationRun(taskId);

      expect(result).not.toBeNull();
      expect(result?.run_id).toBe('run-2'); // Most recent
      expect(result?.started_at).toBe('2025-11-10T11:00:00Z');
    });

    it('should return null when no runs exist for task', () => {
      const result = service.getLatestAutomationRun('non-existent-task');
      expect(result).toBeNull();
    });

    it('should return the single run when only one exists', () => {
      const taskId = 'task-single';
      const stmt = testDb.prepare(`
        INSERT INTO task_automation_runs (run_id, task_id, started_at, status)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run('run-only', taskId, '2025-11-10T10:00:00Z', 'success');

      const result = service.getLatestAutomationRun(taskId);

      expect(result).not.toBeNull();
      expect(result?.run_id).toBe('run-only');
    });
  });

  describe('Database initialization', () => {
    it('should create data directory if it does not exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-context-init-'));
      const nonExistentPath = path.join(tmpDir, 'nested', 'path', 'test.db');

      // Directory should not exist yet
      const dataDir = path.dirname(nonExistentPath);
      expect(fs.existsSync(dataDir)).toBe(false);

      // Service should create the directory
      new TaskContextService(nonExistentPath);

      // Directory should now exist
      expect(fs.existsSync(dataDir)).toBe(true);

      // Clean up
      const db = new Database(nonExistentPath);
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should use WAL mode for better concurrency', () => {
      const result = testDb.pragma('journal_mode', { simple: true });
      expect(result).toBe('wal');
    });
  });

  describe('Edge cases', () => {
    it('should handle runs with null values correctly', () => {
      const stmt = testDb.prepare(`
        INSERT INTO task_automation_runs
        (run_id, task_id, started_at, status, worker_id, container_id,
         completed_at, duration_ms, exit_code, failure_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        'run-nulls', 'task-123', '2025-11-10T10:00:00Z', 'noop',
        null, null, null, null, null, null
      );

      const result = service.getAutomationRun('run-nulls');

      expect(result).not.toBeNull();
      expect(result?.worker_id).toBeNull();
      expect(result?.container_id).toBeNull();
      expect(result?.completed_at).toBeNull();
      expect(result?.duration_ms).toBeNull();
      expect(result?.exit_code).toBeNull();
      expect(result?.failure_reason).toBeNull();
    });

    it('should handle runs with JSON fields', () => {
      const qualityValidation = { passed: true, score: 95 };
      const resourceUsage = { cpu: 50, memory: 1024 };
      const tokenUsage = { input: 100, output: 200 };
      const containerMeta = { image: 'node:18', platform: 'linux/amd64' };

      const stmt = testDb.prepare(`
        INSERT INTO task_automation_runs
        (run_id, task_id, started_at, status, quality_validation_json,
         resource_usage_json, token_usage_json, container_meta_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        'run-json', 'task-123', '2025-11-10T10:00:00Z', 'success',
        JSON.stringify(qualityValidation),
        JSON.stringify(resourceUsage),
        JSON.stringify(tokenUsage),
        JSON.stringify(containerMeta)
      );

      const result = service.getAutomationRun('run-json');

      expect(result).not.toBeNull();
      expect(result?.quality_validation_json).toBe(JSON.stringify(qualityValidation));
      expect(result?.resource_usage_json).toBe(JSON.stringify(resourceUsage));
      expect(result?.token_usage_json).toBe(JSON.stringify(tokenUsage));
      expect(result?.container_meta_json).toBe(JSON.stringify(containerMeta));
    });

    it('should handle failed runs with failure_reason', () => {
      const stmt = testDb.prepare(`
        INSERT INTO task_automation_runs
        (run_id, task_id, started_at, completed_at, status, exit_code, failure_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        'run-failed', 'task-123', '2025-11-10T10:00:00Z',
        '2025-11-10T10:05:00Z', 'failed', 1,
        'Build failed: TypeScript compilation errors'
      );

      const result = service.getAutomationRun('run-failed');

      expect(result).not.toBeNull();
      expect(result?.status).toBe('failed');
      expect(result?.exit_code).toBe(1);
      expect(result?.failure_reason).toBe('Build failed: TypeScript compilation errors');
    });
  });
});
