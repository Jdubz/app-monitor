import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskContextService } from './taskContext.service.js';
import { getDatabase, closeDatabase } from './database.js';
import type {
  TaskCreationContext,
  TaskExecutionContext,
} from '../types/taskContext.js';
import * as fs from 'fs';
import * as path from 'path';

describe('TaskContextService', () => {
  let service: TaskContextService;
  const testDbPath = path.join(__dirname, '..', '..', 'data', 'test-task-context.db');

  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create new service instance
    service = new TaskContextService();

    // Create dummy tasks in the tasks table to satisfy foreign key constraint
    const db = getDatabase();
    const connection = db.getConnection();

    // Insert test tasks for foreign key constraints
    const taskIds = ['task-test-001', 'task-test-002', 'task-test-003', 'task-test-004', 'task-test-005', 'task-test-006', 'task-test-007', 'task-test-008', 'task-test-009', 'task-test-010'];

    for (const taskId of taskIds) {
      connection.prepare(`
        INSERT OR IGNORE INTO tasks (
          id, type, title, status, priority, created_at, assigned_agent
        ) VALUES (?, 'test', 'Test Task', 'pending', 5, ?, 'test-agent')
      `).run(taskId, Date.now());
    }
  });

  afterEach(() => {
    // Close database connection
    closeDatabase();

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

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

      expect(() => service.storeTaskCreationContext(taskId, context)).not.toThrow();
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

      service.storeTaskCreationContext(taskId, context);
      const retrieved = service.getTaskCreationContext(taskId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.workTarget).toBe('dev-monitor');
      expect(retrieved?.targetBranch).toBe('main');
      expect(retrieved?.affectedFiles).toEqual(['src/test.ts', 'src/utils.ts']);
      expect(retrieved?.environment.gitSha).toBe('def456');
    });

    it('should return null for non-existent task creation context', () => {
      const retrieved = service.getTaskCreationContext('non-existent-task');
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

      service.storeTaskCreationContext(taskId, context);
      const retrieved = service.getTaskCreationContext(taskId);

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

      expect(() => service.storeTaskExecutionContext(runId, taskId, context)).not.toThrow();
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

      service.storeTaskExecutionContext(runId, taskId, context);
      const retrieved = service.getTaskExecutionContext(runId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.taskId).toBe(taskId);
      expect(retrieved?.workerId).toBe('worker-002');
      expect(retrieved?.status).toBe('success');
      expect(retrieved?.exitCode).toBe(0);
      expect(retrieved?.commitSha).toBe('xyz789');
      expect(retrieved?.durationMs).toBe(2700000);
    });

    it('should return null for non-existent task execution context', () => {
      const retrieved = service.getTaskExecutionContext('non-existent-run');
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

      service.storeTaskExecutionContext(runId, taskId, context);
      const retrieved = service.getTaskExecutionContext(runId);

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

      service.storeTaskExecutionContext(runId, taskId, context);
      const retrieved = service.getTaskExecutionContext(runId);

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

      service.storeTaskCreationContext(taskId, context1);

      // Second store should throw or handle gracefully
      expect(() => service.storeTaskCreationContext(taskId, context2)).toThrow();
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

      expect(() => service.storeTaskCreationContext(taskId, largeContext)).not.toThrow();
      const retrieved = service.getTaskCreationContext(taskId);
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

      service.storeTaskExecutionContext(runId, taskId, context);
      const retrieved = service.getTaskExecutionContext(runId);

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
