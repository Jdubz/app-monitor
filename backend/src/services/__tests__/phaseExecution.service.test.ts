/**
 * Phase Execution Service Unit Tests
 * 
 * Tests the PhaseExecutionService orchestration layer:
 * - Artifact extraction from containers
 * - Phase validation workflows
 * - Recovery agent integration
 * - Next phase determination
 * - Stage run recording
 * - Error handling and edge cases
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PhaseExecutionService, PhaseExecutionResult } from '../phaseExecution.service.js';
import type { Task } from '../taskQueue.sqlite.js';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../artifactExtractor.service.js', () => ({
  getArtifactExtractor: vi.fn(() => ({
    extractArtifacts: vi.fn(),
  })),
}));

vi.mock('../phaseValidation/index.js', () => ({
  getValidatorRegistry: vi.fn(() => ({
    getValidator: vi.fn(),
  })),
}));

vi.mock('../recoveryAgent.service.js', () => ({
  getRecoveryService: vi.fn(() => ({
    attemptRecovery: vi.fn(),
  })),
}));

describe('PhaseExecutionService', () => {
  let db: Database.Database;
  let service: PhaseExecutionService;
  let testDbPath: string;

  beforeEach(() => {
    // Create in-memory database for testing
    testDbPath = ':memory:';
    db = new Database(testDbPath);

    // Initialize task_stage_runs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_stage_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        phase_index INTEGER NOT NULL,
        phase_name TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failed', 'skipped')),
        artifacts_blob TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        exit_code INTEGER
      )
    `);

    service = new PhaseExecutionService(db);
  });

  afterEach(() => {
    db?.close();
    vi.clearAllMocks();
  });

  describe('executePhaseWorkflow', () => {
    it('should execute successful phase workflow with validation pass', async () => {
      // Given: A task in phase 1 (Planning)
      const task: Task = {
        id: 'task-123',
        type: 'feature',
        title: 'Test Task',
        status: 'running',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'claude-sonnet',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        phase_index: 1,
        phase_name: 'Planning',
        phase_status: 'running',
        phase_attempts: 1,
      };

      const containerId = 'container-123';

      // Mock artifact extraction
      const mockArtifactExtractor = {
        extractArtifacts: vi.fn().mockResolvedValue({
          plan: { tasks: [], architecture: [] },
          metadata: { timestamp: Date.now() },
        }),
      };
      const { getArtifactExtractor } = await import('../artifactExtractor.service.js');
      vi.mocked(getArtifactExtractor).mockReturnValue(mockArtifactExtractor as any);

      // Mock validation success
      const mockValidator = {
        validate: vi.fn().mockResolvedValue({
          isValid: true,
          errors: [],
          warnings: [],
          criticalIssues: [],
          recoverable: false,
        }),
      };
      const { getValidatorRegistry } = await import('../phaseValidation/index.js');
      vi.mocked(getValidatorRegistry).mockReturnValue({
        getValidator: vi.fn().mockReturnValue(mockValidator),
      } as any);

      // When: Executing phase workflow
      const result = await service.executePhaseWorkflow(task, containerId);

      // Then: Should succeed and advance to next phase
      expect(result.success).toBe(true);
      expect(result.validationPassed).toBe(true);
      expect(result.nextPhase).toBe(2); // Should advance to Implementation
      expect(result.errors).toBeUndefined();
      expect(mockArtifactExtractor.extractArtifacts).toHaveBeenCalledWith(containerId, 1);
      expect(mockValidator.validate).toHaveBeenCalled();

      // Verify stage run was recorded
      const stageRuns = db.prepare('SELECT * FROM task_stage_runs WHERE task_id = ?').all(task.id);
      expect(stageRuns).toHaveLength(1);
      expect(stageRuns[0].status).toBe('success');
      expect(stageRuns[0].phase_index).toBe(1);
    });

    it('should handle validation failure with recovery', async () => {
      // Given: A task in phase 2 (Implementation)
      const task: Task = {
        id: 'task-456',
        type: 'feature',
        title: 'Test Task',
        status: 'running',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'claude-sonnet',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        phase_index: 2,
        phase_name: 'Implementation',
        phase_status: 'running',
        phase_attempts: 1,
      };

      // Mock artifact extraction
      const mockArtifactExtractor = {
        extractArtifacts: vi.fn().mockResolvedValue({
          code: { files: [] },
        }),
      };
      const { getArtifactExtractor } = await import('../artifactExtractor.service.js');
      vi.mocked(getArtifactExtractor).mockReturnValue(mockArtifactExtractor as any);

      // Mock validation failure (recoverable)
      const mockValidator = {
        validate: vi.fn().mockResolvedValue({
          isValid: false,
          errors: ['Missing test file'],
          warnings: [],
          criticalIssues: [],
          recoverable: true,
        }),
      };
      const { getValidatorRegistry } = await import('../phaseValidation/index.js');
      vi.mocked(getValidatorRegistry).mockReturnValue({
        getValidator: vi.fn().mockReturnValue(mockValidator),
      } as any);

      // Mock recovery success
      const mockRecoveryService = {
        attemptRecovery: vi.fn().mockResolvedValue({
          success: true,
          diagnosis: 'Added missing test file',
          actions: ['create_file'],
        }),
      };
      const { getRecoveryService } = await import('../recoveryAgent.service.js');
      vi.mocked(getRecoveryService).mockReturnValue(mockRecoveryService as any);

      // When: Executing phase workflow
      const result = await service.executePhaseWorkflow(task, 'container-456');

      // Then: Should attempt recovery
      expect(result.recoveryAttempted).toBe(true);
      expect(result.recoverySucceeded).toBe(true);
      expect(mockRecoveryService.attemptRecovery).toHaveBeenCalled();

      // Verify stage run recorded as recovered
      const stageRuns = db.prepare('SELECT * FROM task_stage_runs WHERE task_id = ?').all(task.id);
      expect(stageRuns).toHaveLength(1);
      expect(stageRuns[0].status).toBe('recovered');
    });

    it('should handle validation failure without recovery (retry same phase)', async () => {
      // Given: A task in phase 3 (Review) with attempts remaining
      const task: Task = {
        id: 'task-789',
        type: 'feature',
        title: 'Test Task',
        status: 'running',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'claude-sonnet',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        phase_index: 3,
        phase_name: 'Review',
        phase_status: 'running',
        phase_attempts: 1,
      };

      // Mock validation failure (not recoverable)
      const mockValidator = {
        validate: vi.fn().mockResolvedValue({
          isValid: false,
          errors: ['Code quality issues'],
          warnings: [],
          criticalIssues: [],
          recoverable: false,
        }),
      };
      const { getValidatorRegistry } = await import('../phaseValidation/index.js');
      vi.mocked(getValidatorRegistry).mockReturnValue({
        getValidator: vi.fn().mockReturnValue(mockValidator),
      } as any);

      const mockArtifactExtractor = {
        extractArtifacts: vi.fn().mockResolvedValue({}),
      };
      const { getArtifactExtractor } = await import('../artifactExtractor.service.js');
      vi.mocked(getArtifactExtractor).mockReturnValue(mockArtifactExtractor as any);

      // When: Executing phase workflow
      const result = await service.executePhaseWorkflow(task, 'container-789');

      // Then: Should retry same phase
      expect(result.success).toBe(false);
      expect(result.validationPassed).toBe(false);
      expect(result.nextPhase).toBe(3); // Stay in Review phase
      expect(result.errors).toContain('Code quality issues');
    });

    it('should handle max attempts reached (transition to fix phase)', async () => {
      // Given: A task at max attempts in phase 3 (Review)
      const task: Task = {
        id: 'task-max',
        type: 'feature',
        title: 'Test Task',
        status: 'running',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'claude-sonnet',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        phase_index: 3,
        phase_name: 'Review',
        phase_status: 'running',
        phase_attempts: 4, // Max attempts
      };

      // Mock validation failure
      const mockValidator = {
        validate: vi.fn().mockResolvedValue({
          isValid: false,
          errors: ['Persistent issues'],
          warnings: [],
          criticalIssues: [],
          recoverable: false,
        }),
      };
      const { getValidatorRegistry } = await import('../phaseValidation/index.js');
      vi.mocked(getValidatorRegistry).mockReturnValue({
        getValidator: vi.fn().mockReturnValue(mockValidator),
      } as any);

      const mockArtifactExtractor = {
        extractArtifacts: vi.fn().mockResolvedValue({}),
      };
      const { getArtifactExtractor } = await import('../artifactExtractor.service.js');
      vi.mocked(getArtifactExtractor).mockReturnValue(mockArtifactExtractor as any);

      // When: Executing phase workflow
      const result = await service.executePhaseWorkflow(task, 'container-max');

      // Then: Should transition to Fixes phase
      expect(result.nextPhase).toBe(4); // Move to Fixes phase
    });

    it('should handle critical blocking issues (cancel task)', async () => {
      // Given: A task with critical blocking issue
      const task: Task = {
        id: 'task-blocked',
        type: 'feature',
        title: 'Test Task',
        status: 'running',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'claude-sonnet',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        phase_index: 5,
        phase_name: 'Test & Validate',
        phase_status: 'running',
        phase_attempts: 1,
      };

      // Mock validation with critical issue
      const mockValidator = {
        validate: vi.fn().mockResolvedValue({
          isValid: false,
          errors: ['Build system broken'],
          warnings: [],
          criticalIssues: ['Build system broken'],
          recoverable: false,
        }),
      };
      const { getValidatorRegistry } = await import('../phaseValidation/index.js');
      vi.mocked(getValidatorRegistry).mockReturnValue({
        getValidator: vi.fn().mockReturnValue(mockValidator),
      } as any);

      const mockArtifactExtractor = {
        extractArtifacts: vi.fn().mockResolvedValue({}),
      };
      const { getArtifactExtractor } = await import('../artifactExtractor.service.js');
      vi.mocked(getArtifactExtractor).mockReturnValue(mockArtifactExtractor as any);

      // When: Executing phase workflow
      const result = await service.executePhaseWorkflow(task, 'container-blocked');

      // Then: Should cancel task
      expect(result.success).toBe(false);
      expect(result.nextPhase).toBe(null); // Task cancelled
      expect(result.isSystemBlocked).toBe(true);

      // Verify stage run recorded as blocked
      const stageRuns = db.prepare('SELECT * FROM task_stage_runs WHERE task_id = ?').all(task.id);
      expect(stageRuns).toHaveLength(1);
      expect(stageRuns[0].status).toBe('blocked');
    });

    it('should handle artifact extraction failure', async () => {
      // Given: A task where artifact extraction fails
      const task: Task = {
        id: 'task-extract-fail',
        type: 'feature',
        title: 'Test Task',
        status: 'running',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'claude-sonnet',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        phase_index: 1,
        phase_name: 'Planning',
        phase_status: 'running',
        phase_attempts: 1,
      };

      // Mock artifact extraction failure
      const mockArtifactExtractor = {
        extractArtifacts: vi.fn().mockRejectedValue(new Error('Container not found')),
      };
      const { getArtifactExtractor } = await import('../artifactExtractor.service.js');
      vi.mocked(getArtifactExtractor).mockReturnValue(mockArtifactExtractor as any);

      // When: Executing phase workflow
      const result = await service.executePhaseWorkflow(task, 'bad-container');

      // Then: Should fail gracefully
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Container not found');
    });

    it('should store artifacts in stage_runs table', async () => {
      // Given: A successful phase execution with artifacts
      const task: Task = {
        id: 'task-artifacts',
        type: 'feature',
        title: 'Test Task',
        status: 'running',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'claude-sonnet',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        phase_index: 1,
        phase_name: 'Planning',
        phase_status: 'running',
        phase_attempts: 1,
      };

      const artifacts = {
        plan: { tasks: ['task1', 'task2'], architecture: ['arch1'] },
        metadata: { timestamp: Date.now() },
      };

      const mockArtifactExtractor = {
        extractArtifacts: vi.fn().mockResolvedValue(artifacts),
      };
      const { getArtifactExtractor } = await import('../artifactExtractor.service.js');
      vi.mocked(getArtifactExtractor).mockReturnValue(mockArtifactExtractor as any);

      const mockValidator = {
        validate: vi.fn().mockResolvedValue({
          isValid: true,
          errors: [],
          warnings: [],
          criticalIssues: [],
          recoverable: false,
        }),
      };
      const { getValidatorRegistry } = await import('../phaseValidation/index.js');
      vi.mocked(getValidatorRegistry).mockReturnValue({
        getValidator: vi.fn().mockReturnValue(mockValidator),
      } as any);

      // When: Executing phase workflow
      await service.executePhaseWorkflow(task, 'container-artifacts');

      // Then: Artifacts should be stored in database
      const stageRun = db.prepare('SELECT * FROM task_stage_runs WHERE task_id = ?').get(task.id) as any;
      expect(stageRun).toBeDefined();
      expect(stageRun.artifacts_blob).toBeDefined();
      const storedArtifacts = JSON.parse(stageRun.artifacts_blob);
      expect(storedArtifacts).toEqual(artifacts);
    });

    it('should handle phase 7 completion (final phase)', async () => {
      // Given: A task in final phase (PR Shepherding)
      const task: Task = {
        id: 'task-final',
        type: 'feature',
        title: 'Test Task',
        status: 'running',
        priority: 1,
        created_at: Date.now(),
        assigned_agent: 'claude-sonnet',
        can_retry: true,
        retry_count: 0,
        max_retries: 3,
        timeout_ms: null,
        phase_index: 7,
        phase_name: 'PR Shepherding',
        phase_status: 'running',
        phase_attempts: 1,
      };

      const mockArtifactExtractor = {
        extractArtifacts: vi.fn().mockResolvedValue({ pr: { number: 123 } }),
      };
      const { getArtifactExtractor } = await import('../artifactExtractor.service.js');
      vi.mocked(getArtifactExtractor).mockReturnValue(mockArtifactExtractor as any);

      const mockValidator = {
        validate: vi.fn().mockResolvedValue({
          isValid: true,
          errors: [],
          warnings: [],
          criticalIssues: [],
          recoverable: false,
        }),
      };
      const { getValidatorRegistry } = await import('../phaseValidation/index.js');
      vi.mocked(getValidatorRegistry).mockReturnValue({
        getValidator: vi.fn().mockReturnValue(mockValidator),
      } as any);

      // When: Executing phase workflow
      const result = await service.executePhaseWorkflow(task, 'container-final');

      // Then: Should complete with no next phase
      expect(result.success).toBe(true);
      expect(result.validationPassed).toBe(true);
      expect(result.nextPhase).toBe(null); // Task complete
    });
  });
});
