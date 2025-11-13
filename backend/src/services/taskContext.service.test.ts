import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTaskContextService, resetTaskContextService } from './taskContext.service.js';
import { getDatabase, closeDatabase } from './database.js';
import type {
  TaskCreationContext,
  TaskExecutionContext,
} from '../types/taskContext.js';

describe('TaskContextService', () => {

  beforeEach(() => {
    // Reset singleton before each test
    resetTaskContextService();

    // Get database connection
    const db = getDatabase();
    const connection = db.getConnection();

    // Clean up any existing test data from all context tables
    // Wrap in try-catch since tables might not exist yet
    try {
      connection.prepare('DELETE FROM task_creation_context WHERE task_id LIKE ?').run('task-test-%');
    } catch (error) {
      // Table might not exist yet, ignore error
    }
    
    try {
      connection.prepare('DELETE FROM task_execution_context WHERE run_id LIKE ?').run('run-%');
    } catch (error) {
      // Table might not exist yet, ignore error
    }
    
    try {
      connection.prepare('DELETE FROM tasks WHERE id LIKE ?').run('task-test-%');
    } catch (error) {
      // Table might not exist yet, ignore error
    }

    // Also clean up task_automation_runs table data (migration 004)
    try {
      connection.prepare('DELETE FROM task_automation_runs WHERE task_id LIKE ?').run('task-test-%');
    } catch (error) {
      // Table might not exist yet, ignore error
    }

    // Insert test tasks for foreign key constraints
    const taskIds = ['task-test-001', 'task-test-002', 'task-test-003', 'task-test-004', 'task-test-005', 'task-test-006', 'task-test-007', 'task-test-008', 'task-test-009', 'task-test-010'];

    // Create tasks table if it doesn't exist (normally created by TaskQueueService)
    try {
      connection.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL,
          priority INTEGER DEFAULT 5,
          created_at INTEGER NOT NULL,
          assigned_agent TEXT
        )
      `);
    } catch (error) {
      // Ignore if table already exists
    }

    for (const taskId of taskIds) {
      connection.prepare(`
        INSERT OR REPLACE INTO tasks (
          id, type, title, status, priority, created_at, assigned_agent
        ) VALUES (?, 'test', 'Test Task', 'pending', 5, ?, 'test-agent')
      `).run(taskId, Date.now());
    }
  });

  afterEach(() => {
    // Clean up test data
    const db = getDatabase();
    const connection = db.getConnection();

    // Wrap in try-catch since tables might not exist
    try {
      connection.prepare('DELETE FROM task_creation_context WHERE task_id LIKE ?').run('task-test-%');
    } catch (error) {
      // Table might not exist, ignore error
    }
    
    try {
      connection.prepare('DELETE FROM task_execution_context WHERE run_id LIKE ?').run('run-%');
    } catch (error) {
      // Table might not exist, ignore error
    }
    
    try {
      connection.prepare('DELETE FROM tasks WHERE id LIKE ?').run('task-test-%');
    } catch (error) {
      // Table might not exist, ignore error
    }

    // Clean up task_automation_runs if table exists
    try {
      connection.prepare('DELETE FROM task_automation_runs WHERE task_id LIKE ?').run('task-test-%');
    } catch (error) {
      // Table might not exist, ignore error
    }

    // Close database connection
    closeDatabase();
  });

  // ============================================================================
  // Tests for Automation Run Data (migration 004: task_automation_runs)
  // ============================================================================

  describe('Automation Run Data', () => {
    describe('getTaskAutomationRuns', () => {
      it('should return all automation runs for a task ordered by started_at DESC', () => {
        const db = getDatabase();
        const connection = db.getConnection();

        // Ensure task exists
        const taskId = 'task-test-001';

        // Insert test automation runs
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

        const stmt = connection.prepare(`
          INSERT INTO task_automation_runs (run_id, task_id, started_at, status, exit_code)
          VALUES (?, ?, ?, ?, ?)
        `);

        runs.forEach(run => {
          stmt.run(run.run_id, run.task_id, run.started_at, run.status, run.exit_code);
        });

        const result = getTaskContextService().getTaskAutomationRuns(taskId);

        expect(result).toHaveLength(3);
        // Should be ordered by started_at DESC
        expect(result[0].run_id).toBe('run-2'); // Most recent
        expect(result[1].run_id).toBe('run-1');
        expect(result[2].run_id).toBe('run-3'); // Oldest
      });

      it('should return empty array when no runs exist for task', () => {
        const result = getTaskContextService().getTaskAutomationRuns('non-existent-task');
        expect(result).toEqual([]);
      });

      it('should only return runs for the specified task', () => {
        const db = getDatabase();
        const connection = db.getConnection();

        const stmt = connection.prepare(`
          INSERT INTO task_automation_runs (run_id, task_id, started_at, status)
          VALUES (?, ?, ?, ?)
        `);

        stmt.run('run-1', 'task-test-001', '2025-11-10T10:00:00Z', 'success');
        stmt.run('run-2', 'task-test-002', '2025-11-10T11:00:00Z', 'success');

        const result = getTaskContextService().getTaskAutomationRuns('task-test-001');

        expect(result).toHaveLength(1);
        expect(result[0].run_id).toBe('run-1');
        expect(result[0].task_id).toBe('task-test-001');
      });
    });

    describe('getAutomationRun', () => {
      it('should return a specific automation run by run_id', () => {
        const db = getDatabase();
        const connection = db.getConnection();

        const testRun = {
          run_id: 'run-123',
          task_id: 'task-test-003',
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

        const stmt = connection.prepare(`
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

        const result = getTaskContextService().getAutomationRun('run-123');

        expect(result).not.toBeNull();
        expect(result?.run_id).toBe('run-123');
        expect(result?.task_id).toBe('task-test-003');
        expect(result?.worker_id).toBe('worker-1');
        expect(result?.status).toBe('success');
        expect(result?.exit_code).toBe(0);
        expect(result?.duration_ms).toBe(1800000);
        expect(result?.test_passed).toBe(10);
        expect(result?.lint_warnings).toBe(2);
      });

      it('should return null when run does not exist', () => {
        const result = getTaskContextService().getAutomationRun('non-existent-run');
        expect(result).toBeNull();
      });
    });

    describe('getLatestAutomationRun', () => {
      it('should return the most recent automation run for a task', () => {
        const db = getDatabase();
        const connection = db.getConnection();
        const taskId = 'task-test-001';

        const stmt = connection.prepare(`
          INSERT INTO task_automation_runs (run_id, task_id, started_at, status)
          VALUES (?, ?, ?, ?)
        `);

        stmt.run('run-1', taskId, '2025-11-10T09:00:00Z', 'success');
        stmt.run('run-2', taskId, '2025-11-10T11:00:00Z', 'failed');
        stmt.run('run-3', taskId, '2025-11-10T10:00:00Z', 'success');

        const result = getTaskContextService().getLatestAutomationRun(taskId);

        expect(result).not.toBeNull();
        expect(result?.run_id).toBe('run-2'); // Most recent
        expect(result?.started_at).toBe('2025-11-10T11:00:00Z');
      });

      it('should return null when no runs exist for task', () => {
        const result = getTaskContextService().getLatestAutomationRun('non-existent-task');
        expect(result).toBeNull();
      });

      it('should return the single run when only one exists', () => {
        const db = getDatabase();
        const connection = db.getConnection();
        const taskId = 'task-test-002';

        const stmt = connection.prepare(`
          INSERT INTO task_automation_runs (run_id, task_id, started_at, status)
          VALUES (?, ?, ?, ?)
        `);

        stmt.run('run-only', taskId, '2025-11-10T10:00:00Z', 'success');

        const result = getTaskContextService().getLatestAutomationRun(taskId);

        expect(result).not.toBeNull();
        expect(result?.run_id).toBe('run-only');
      });
    });

    describe('Edge cases', () => {
      it('should handle runs with null values correctly', () => {
        const db = getDatabase();
        const connection = db.getConnection();

        const stmt = connection.prepare(`
          INSERT INTO task_automation_runs
          (run_id, task_id, started_at, status, worker_id, container_id,
           completed_at, duration_ms, exit_code, failure_reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          'run-nulls', 'task-test-001', '2025-11-10T10:00:00Z', 'noop',
          null, null, null, null, null, null
        );

        const result = getTaskContextService().getAutomationRun('run-nulls');

        expect(result).not.toBeNull();
        expect(result?.worker_id).toBeNull();
        expect(result?.container_id).toBeNull();
        expect(result?.completed_at).toBeNull();
        expect(result?.duration_ms).toBeNull();
        expect(result?.exit_code).toBeNull();
        expect(result?.failure_reason).toBeNull();
      });

      it('should handle runs with JSON fields', () => {
        const db = getDatabase();
        const connection = db.getConnection();

        const qualityValidation = { passed: true, score: 95 };
        const resourceUsage = { cpu: 50, memory: 1024 };
        const tokenUsage = { input: 100, output: 200 };
        const containerMeta = { image: 'node:18', platform: 'linux/amd64' };

        const stmt = connection.prepare(`
          INSERT INTO task_automation_runs
          (run_id, task_id, started_at, status, quality_validation_json,
           resource_usage_json, token_usage_json, container_meta_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          'run-json', 'task-test-001', '2025-11-10T10:00:00Z', 'success',
          JSON.stringify(qualityValidation),
          JSON.stringify(resourceUsage),
          JSON.stringify(tokenUsage),
          JSON.stringify(containerMeta)
        );

        const result = getTaskContextService().getAutomationRun('run-json');

        expect(result).not.toBeNull();
        expect(result?.quality_validation_json).toBe(JSON.stringify(qualityValidation));
        expect(result?.resource_usage_json).toBe(JSON.stringify(resourceUsage));
        expect(result?.token_usage_json).toBe(JSON.stringify(tokenUsage));
        expect(result?.container_meta_json).toBe(JSON.stringify(containerMeta));
      });

      it('should handle failed runs with failure_reason', () => {
        const db = getDatabase();
        const connection = db.getConnection();

        const stmt = connection.prepare(`
          INSERT INTO task_automation_runs
          (run_id, task_id, started_at, completed_at, status, exit_code, failure_reason)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          'run-failed', 'task-test-001', '2025-11-10T10:00:00Z',
          '2025-11-10T10:05:00Z', 'failed', 1,
          'Build failed: TypeScript compilation errors'
        );

        const result = getTaskContextService().getAutomationRun('run-failed');

        expect(result).not.toBeNull();
        expect(result?.status).toBe('failed');
        expect(result?.exit_code).toBe(1);
        expect(result?.failure_reason).toBe('Build failed: TypeScript compilation errors');
      });
    });
  });

  // ============================================================================
  // Tests for Task Creation & Execution Context (migration 009)
  // ============================================================================

  describe('Task Creation Context', () => {
    it('should store task creation context successfully', () => {
      const taskId = 'task-test-001';
      const context: TaskCreationContext = {
        environment: {
          appVersion: '1.0.0',
          gitSha: 'abc123',
          buildTime: '2025-11-10T00:00:00Z',
          nodeVersion: '20.0.0',
        },
        clientMeta: {
          timestamp: '2025-11-10T00:00:00Z',
          platform: 'linux',
        },
        workTarget: 'dev-monitor',
        targetBranch: 'main',
      };

      expect(() => getTaskContextService().storeTaskCreationContext(taskId, context)).not.toThrow();
    });

    it('should retrieve stored task creation context', () => {
      const taskId = 'task-test-002';
      const context: TaskCreationContext = {
        environment: {
          appVersion: '1.0.0',
          gitSha: 'def456',
          buildTime: '2025-11-10T00:00:00Z',
        },
        clientMeta: {
          timestamp: '2025-11-10T00:00:00Z',
        },
        workTarget: 'dev-monitor',
        targetBranch: 'main',
        affectedFiles: ['src/test.ts', 'src/utils.ts'],
      };

      getTaskContextService().storeTaskCreationContext(taskId, context);
      const retrieved = getTaskContextService().getTaskCreationContext(taskId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.workTarget).toBe('dev-monitor');
      expect(retrieved?.targetBranch).toBe('main');
      expect(retrieved?.affectedFiles).toEqual(['src/test.ts', 'src/utils.ts']);
      expect(retrieved?.environment.gitSha).toBe('def456');
    });

    it('should return null for non-existent task creation context', () => {
      const retrieved = getTaskContextService().getTaskCreationContext('non-existent-task');
      expect(retrieved).toBeNull();
    });

    it('should handle context with optional fields', () => {
      const taskId = 'task-test-003';
      const context: TaskCreationContext = {
        environment: {
          appVersion: '1.0.0',
          gitSha: null,
          buildTime: null,
          dockerImage: 'node:20-alpine',
        },
        workTarget: 'dev-monitor',
        targetBranch: 'feature/test',
        screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANS',
        appState: {
          userId: '123',
          sessionActive: true,
        },
      };

      getTaskContextService().storeTaskCreationContext(taskId, context);
      const retrieved = getTaskContextService().getTaskCreationContext(taskId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.screenshot).toBe('data:image/png;base64,iVBORw0KGgoAAAANS');
      expect(retrieved?.appState?.userId).toBe('123');
      expect(retrieved?.appState?.sessionActive).toBe(true);
    });
  });

  describe('Task Execution Context', () => {
    it('should store task execution context successfully', () => {
      const runId = 'run-001';
      const taskId = 'task-test-004';
      const context: TaskExecutionContext = {
        taskId,
        runId,
        workerId: 'worker-001',
        startedAt: '2025-11-10T10:00:00Z',
        completedAt: '2025-11-10T10:30:00Z',
        durationMs: 1800000,
        exitCode: 0,
        status: 'success',
      };

      expect(() => getTaskContextService().storeTaskExecutionContext(runId, taskId, context)).not.toThrow();
    });

    it('should retrieve stored task execution context', () => {
      const runId = 'run-002';
      const taskId = 'task-test-005';
      const context: TaskExecutionContext = {
        taskId,
        runId,
        workerId: 'worker-002',
        startedAt: '2025-11-10T11:00:00Z',
        completedAt: '2025-11-10T11:45:00Z',
        durationMs: 2700000,
        exitCode: 0,
        status: 'success',
        commitSha: 'xyz789',
      };

      getTaskContextService().storeTaskExecutionContext(runId, taskId, context);
      const retrieved = getTaskContextService().getTaskExecutionContext(runId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.taskId).toBe(taskId);
      expect(retrieved?.workerId).toBe('worker-002');
      expect(retrieved?.status).toBe('success');
      expect(retrieved?.exitCode).toBe(0);
      expect(retrieved?.commitSha).toBe('xyz789');
      expect(retrieved?.durationMs).toBe(2700000);
    });

    it('should return null for non-existent task execution context', () => {
      const retrieved = getTaskContextService().getTaskExecutionContext('non-existent-run');
      expect(retrieved).toBeNull();
    });

    it('should handle failed task execution context', () => {
      const runId = 'run-003';
      const taskId = 'task-test-006';
      const context: TaskExecutionContext = {
        taskId,
        runId,
        workerId: 'worker-003',
        startedAt: '2025-11-10T12:00:00Z',
        completedAt: '2025-11-10T12:05:00Z',
        durationMs: 300000,
        exitCode: 1,
        status: 'failed',
        failureReason: 'Build failed due to syntax error',
        buildOutput: {
          command: 'npm run build',
          exitCode: 1,
          duration: 60000,
          errors: [
            {
              file: 'src/index.ts',
              line: 42,
              column: 10,
              message: 'Unexpected token',
              severity: 'error',
            },
          ],
        },
      };

      getTaskContextService().storeTaskExecutionContext(runId, taskId, context);
      const retrieved = getTaskContextService().getTaskExecutionContext(runId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.status).toBe('failed');
      expect(retrieved?.exitCode).toBe(1);
      expect(retrieved?.failureReason).toBe('Build failed due to syntax error');
      expect(retrieved?.buildOutput?.errors?.length).toBe(1);
      expect(retrieved?.buildOutput?.errors?.[0].message).toBe('Unexpected token');
    });

    it('should handle context with test results and coverage', () => {
      const runId = 'run-004';
      const taskId = 'task-test-007';
      const context: TaskExecutionContext = {
        taskId,
        runId,
        workerId: 'worker-004',
        startedAt: '2025-11-10T13:00:00Z',
        completedAt: '2025-11-10T13:20:00Z',
        durationMs: 1200000,
        exitCode: 0,
        status: 'success',
        testResults: {
          passed: 45,
          failed: 0,
          skipped: 2,
          total: 47,
          durationMs: 15000,
          coverage: {
            lines: 85.5,
            statements: 87.2,
            branches: 80.3,
            functions: 90.1,
          },
        },
        lintResults: {
          errors: 0,
          warnings: 3,
          fixable: 2,
        },
      };

      getTaskContextService().storeTaskExecutionContext(runId, taskId, context);
      const retrieved = getTaskContextService().getTaskExecutionContext(runId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.testResults?.passed).toBe(45);
      expect(retrieved?.testResults?.coverage?.lines).toBe(85.5);
      expect(retrieved?.lintResults?.warnings).toBe(3);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle storing the same task creation context twice (update)', () => {
      const taskId = 'task-test-008';
      const context1: TaskCreationContext = {
        environment: {
          appVersion: '1.0.0',
          gitSha: 'aaa111',
          buildTime: null,
        },
        workTarget: 'dev-monitor',
        targetBranch: 'main',
      };

      const context2: TaskCreationContext = {
        environment: {
          appVersion: '1.0.1',
          gitSha: 'bbb222',
          buildTime: null,
        },
        workTarget: 'dev-monitor',
        targetBranch: 'staging',
      };

      getTaskContextService().storeTaskCreationContext(taskId, context1);

      // Second store should throw or handle gracefully
      expect(() => getTaskContextService().storeTaskCreationContext(taskId, context2)).toThrow();
    });

    it('should handle large context objects', () => {
      const taskId = 'task-test-009';
      const largeContext: TaskCreationContext = {
        environment: {
          appVersion: '1.0.0',
          gitSha: 'large-context',
          buildTime: null,
        },
        workTarget: 'dev-monitor',
        targetBranch: 'main',
        recentLogs: Array.from({ length: 200 }, (_, i) => ({
          level: 'info' as const,
          message: `Log entry ${i}`,
          timestamp: new Date().toISOString(),
        })),
        recentApiCalls: Array.from({ length: 50 }, (_, i) => ({
          id: `api-${i}`,
          method: 'GET',
          url: `https://api.example.com/endpoint/${i}`,
          startedAt: new Date().toISOString(),
          ok: true,
          traceId: null,
        })),
      };

      expect(() => getTaskContextService().storeTaskCreationContext(taskId, largeContext)).not.toThrow();
      const retrieved = getTaskContextService().getTaskCreationContext(taskId);
      expect(retrieved?.recentLogs?.length).toBe(200);
      expect(retrieved?.recentApiCalls?.length).toBe(50);
    });

    it('should handle execution context with all optional fields populated', () => {
      const runId = 'run-005';
      const taskId = 'task-test-010';
      const context: TaskExecutionContext = {
        taskId,
        runId,
        workerId: 'worker-005',
        containerMeta: {
          containerId: 'container-123',
          imageSha: 'sha256:abc123',
          cpuLimit: '2',
          memoryLimitMB: 2048,
          workspacePath: '/workspace',
          hostOS: 'linux',
        },
        startedAt: '2025-11-10T14:00:00Z',
        completedAt: '2025-11-10T14:30:00Z',
        durationMs: 1800000,
        commands: [
          {
            command: 'npm install',
            cwd: '/workspace',
            exitCode: 0,
            stdout: 'Dependencies installed',
            stderr: '',
            durationMs: 30000,
            timestamp: '2025-11-10T14:05:00Z',
          },
        ],
        fileOperations: [
          {
            path: 'src/index.ts',
            operation: 'write',
            linesBefore: 100,
            linesAfter: 120,
            timestamp: '2025-11-10T14:10:00Z',
          },
        ],
        gitOperations: [
          {
            command: 'git commit',
            commitSha: 'commit-abc',
            branch: 'feature/test',
            filesChanged: 5,
            timestamp: '2025-11-10T14:25:00Z',
          },
        ],
        buildOutput: {
          command: 'npm run build',
          exitCode: 0,
          duration: 60000,
        },
        testResults: {
          passed: 50,
          failed: 0,
          skipped: 0,
          total: 50,
          durationMs: 20000,
        },
        lintResults: {
          errors: 0,
          warnings: 0,
          fixable: 0,
        },
        qualityValidation: {
          passed: true,
          buildPassed: true,
          testsPassed: true,
          lintPassed: true,
          typeCheckPassed: true,
        },
        artifacts: [
          {
            type: 'log',
            path: '/logs/task.log',
            sizeBytes: 1024,
            createdAt: '2025-11-10T14:30:00Z',
          },
        ],
        resourceUsage: {
          peakMemoryMB: 512,
          cpuTimeSeconds: 120,
          diskUsageMB: 100,
        },
        tokenUsage: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          inputTokens: 5000,
          outputTokens: 2000,
          estimatedCost: 0.15,
        },
        exitCode: 0,
        status: 'success',
        commitSha: 'final-commit-xyz',
      };

      getTaskContextService().storeTaskExecutionContext(runId, taskId, context);
      const retrieved = getTaskContextService().getTaskExecutionContext(runId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.containerMeta?.containerId).toBe('container-123');
      expect(retrieved?.commands?.length).toBe(1);
      expect(retrieved?.fileOperations?.length).toBe(1);
      expect(retrieved?.gitOperations?.length).toBe(1);
      expect(retrieved?.artifacts?.length).toBe(1);
      expect(retrieved?.resourceUsage?.peakMemoryMB).toBe(512);
      expect(retrieved?.tokenUsage?.inputTokens).toBe(5000);
    });
  });
});
