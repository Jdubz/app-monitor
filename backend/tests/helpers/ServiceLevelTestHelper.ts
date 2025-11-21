/**
 * ServiceLevelTestHelper - Service-level integration test helper
 *
 * Provides utilities for testing backend services by calling methods directly
 * rather than via HTTP endpoints. This approach:
 * - Tests ALL backend logic (validators, orchestrator, recovery, etc.)
 * - Mocks ONLY expensive operations (container artifacts, GitHub API)
 * - Verifies database state directly
 * - Runs fast without HTTP overhead
 *
 * Key Difference from DevBotSimulator:
 * - DevBotSimulator: Calls /simulate-phase-progression → Direct SQL (bypasses all code)
 * - ServiceLevelTestHelper: Calls service methods directly → Tests all code
 */

import { vi } from 'vitest';
import type Database from 'better-sqlite3';
import type { DevBotsManager } from '../../src/services/devBotsManager.js';
import type { EphemeralWorkerService } from '../../src/services/ephemeralWorker.service.js';
import type { Task } from '../../src/services/taskQueue.sqlite.js';
import type { EphemeralWorker } from '../../src/services/ephemeralWorker.service.js';
import type { PhaseCompletionResult } from '../../src/services/phaseOrchestrator.service.js';

/**
 * Phase-specific artifact structures
 */
export interface PhaseArtifacts {
  // Common fields
  stdout?: string;
  stderr?: string;
  exitCode?: number;

  // Phase 1: Planning
  planning?: {
    obsolete: boolean;
    obsolete_reason?: string;
    task_realigned: boolean;
    realignment_details?: string;
    architecture_notes: string;
    estimated_complexity: 'low' | 'medium' | 'high';
    dependencies?: string[];
  };

  // Phase 2: Implementation
  implementation?: {
    pr_number: number;
    pr_url: string;
    branch_name: string;
    commits: number;
    files_changed?: string[];
  };

  // Phase 3: Review
  review?: {
    issues: Array<{
      fingerprint: string;
      severity: 'critical' | 'major' | 'minor';
      file: string;
      line: number;
      description: string;
      blocking: boolean;
    }>;
    total_issues: number;
    blocking_issues: number;
    review_passed: boolean;
  };

  // Phase 4: Fixes
  fixes?: {
    fixes_applied: Array<{
      fingerprint: string;
      resolution: string;
      files_modified: string[];
      commits: string[];
    }>;
    unresolved_fingerprints: string[];
    all_issues_addressed: boolean;
  };

  // Phase 5: Test & Validation
  tests?: {
    all_tests_passing: boolean;
    coverage_delta: number;
    test_summary: {
      unit: { total: number; passed: number; failed: number };
      integration: { total: number; passed: number; failed: number };
      e2e: { total: number; passed: number; failed: number };
    };
    lint_passing: boolean;
    type_check_passing: boolean;
    build_passing: boolean;
    failures: string[];
  };

  // Phase 6: Cleanup
  cleanup?: {
    docs_updated: string[];
    docs_deleted: string[];
    artifacts_pruned: string[];
    changelog_entry?: string;
  };

  // Phase 7: PR Shepherding
  prShepherding?: {
    merge_gates: {
      base_branch_updated: boolean;
      no_merge_conflicts: boolean;
      review_comments_resolved: boolean;
      change_requests_addressed: boolean;
      ci_checks_passing: boolean;
      copilot_review_complete: boolean;
      task_verification_passed: boolean;
      final_validation_clean: boolean;
    };
    all_gates_passing: boolean;
    auto_merge_triggered?: boolean;
    merge_sha?: string;
  };
}

export interface TaskCreationPayload {
  type: string;
  title: string;
  description?: string;
  files?: string[];
  priority?: number;
  assigned_agent?: string;
}

/**
 * ServiceLevelTestHelper - Helper for testing services directly
 */
export class ServiceLevelTestHelper {
  constructor(
    private db: Database.Database,
    private devBotsManager: DevBotsManager,
    private ephemeralWorkerService: EphemeralWorkerService
  ) {}

  /**
   * Create task via service method
   */
  async createTask(payload: TaskCreationPayload): Promise<string> {
    const task = await this.devBotsManager.getTaskQueue().createTask(payload);
    return task.id;
  }

  /**
   * Execute phase with mocked artifacts but REAL backend logic
   *
   * CRITICAL: This calls service method directly which triggers:
   * - Real artifact extraction (mocked)
   * - Real phase validator
   * - Real recovery agent logic
   * - Real phase orchestrator
   * - Real database updates via services
   */
  async executePhase(
    taskId: string,
    mockArtifacts: PhaseArtifacts
  ): Promise<PhaseCompletionResult> {
    // Mock artifact extraction
    vi.spyOn(this.ephemeralWorkerService['artifactExtractor'], 'extractArtifacts')
      .mockResolvedValue(mockArtifacts as any);

    // Get task from DB
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Create mock worker
    const mockWorker: EphemeralWorker = {
      id: `test-worker-${Date.now()}`,
      containerId: `mock-container-${Date.now()}`,
      agent: {
        name: 'test-agent',
        persona: 'implementation',
        systemPrompt: 'Test agent',
        temperature: 0.7,
        maxTokens: 4000
      },
      agentCliType: 'claude',
      task,
      status: 'running',
      workspace: {
        hostPath: '/test',
        containerPath: '/workspace',
        gitBranch: task.branch || 'main',
        gitCommitSha: 'test-sha'
      }
    };

    // Call REAL service method (no HTTP, no new endpoints)
    const result = await this.ephemeralWorkerService.completePhaseExecution(
      mockWorker,
      mockArtifacts.stdout || '',
      mockArtifacts.stderr || '',
      mockArtifacts.exitCode || 0
    );

    return result;
  }

  /**
   * Get task from database
   */
  getTaskFromDB(taskId: string): Task | undefined {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined;
  }

  /**
   * Get stage runs for a task
   */
  getStageRuns(taskId: string): any[] {
    return this.db.prepare(`
      SELECT *
      FROM task_stage_runs
      WHERE task_id = ?
      ORDER BY created_at ASC
    `).all(taskId) as any[];
  }

  /**
   * Get latest stage run for a specific phase
   */
  getLatestStageRun(taskId: string, phaseIndex: number): any | undefined {
    return this.db.prepare(`
      SELECT *
      FROM task_stage_runs
      WHERE task_id = ? AND phase_index = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(taskId, phaseIndex) as any | undefined;
  }

  /**
   * Verify that a phase validator actually executed
   */
  async verifyValidatorExecuted(taskId: string, phaseIndex: number): Promise<boolean> {
    const stageRun = this.getLatestStageRun(taskId, phaseIndex);

    if (!stageRun) {
      return false;
    }

    // Validator must have set status and extracted artifacts
    return stageRun.status !== null && stageRun.artifacts_blob !== null;
  }

  /**
   * Generate default artifacts for a phase
   */
  generateArtifacts(phaseIndex: number, options: Partial<PhaseArtifacts> = {}): PhaseArtifacts {
    const defaults: Record<number, PhaseArtifacts> = {
      1: {
        // Planning
        planning: {
          obsolete: false,
          task_realigned: false,
          architecture_notes: 'Implement using TDD approach with comprehensive testing. Will use existing service patterns and integrate with current architecture.',
          estimated_complexity: 'medium',
          dependencies: []
        },
        stdout: 'Planning complete\n',
        stderr: '',
        exitCode: 0
      },
      2: {
        // Implementation
        implementation: {
          pr_number: 123,
          pr_url: 'https://github.com/owner/repo/pull/123',
          branch_name: 'task-implementation-abc123',
          commits: 3,
          files_changed: ['src/feature.ts', 'src/feature.test.ts']
        },
        stdout: 'Implementation complete\nPR created: #123\n',
        stderr: '',
        exitCode: 0
      },
      3: {
        // Review (no issues)
        review: {
          issues: [],
          total_issues: 0,
          blocking_issues: 0,
          review_passed: true
        },
        stdout: 'Review complete - no issues found\n',
        stderr: '',
        exitCode: 0
      },
      4: {
        // Fixes
        fixes: {
          fixes_applied: [],
          unresolved_fingerprints: [],
          all_issues_addressed: true
        },
        stdout: 'No fixes needed - all issues resolved\n',
        stderr: '',
        exitCode: 0
      },
      5: {
        // Test & Validation
        tests: {
          all_tests_passing: true,
          coverage_delta: 5.2,
          test_summary: {
            unit: { total: 150, passed: 150, failed: 0 },
            integration: { total: 45, passed: 45, failed: 0 },
            e2e: { total: 20, passed: 20, failed: 0 }
          },
          lint_passing: true,
          type_check_passing: true,
          build_passing: true,
          failures: []
        },
        stdout: 'All tests passing\nCoverage delta: +5.2%\n',
        stderr: '',
        exitCode: 0
      },
      6: {
        // Cleanup
        cleanup: {
          docs_updated: ['docs/api.md', 'README.md'],
          docs_deleted: [],
          artifacts_pruned: ['.phase-artifacts/phase-1-attempt-1/'],
          changelog_entry: 'Added new feature with comprehensive testing'
        },
        stdout: 'Cleanup complete\n2 docs updated\n',
        stderr: '',
        exitCode: 0
      },
      7: {
        // PR Shepherding
        prShepherding: {
          merge_gates: {
            base_branch_updated: true,
            no_merge_conflicts: true,
            review_comments_resolved: true,
            change_requests_addressed: true,
            ci_checks_passing: true,
            copilot_review_complete: true,
            task_verification_passed: true,
            final_validation_clean: true
          },
          all_gates_passing: true,
          auto_merge_triggered: false,
          merge_sha: 'abc123def456'
        },
        stdout: 'All merge gates passing\nPR ready for merge\n',
        stderr: '',
        exitCode: 0
      }
    };

    return {
      ...defaults[phaseIndex],
      ...options
    };
  }

  /**
   * Execute all 7 phases sequentially
   */
  async executeFullLifecycle(
    taskId: string,
    options: {
      injectReviewIssues?: boolean;
      coverage?: number;
    } = {}
  ): Promise<PhaseCompletionResult[]> {
    const results: PhaseCompletionResult[] = [];

    // Phase 1: Planning
    results.push(await this.executePhase(taskId, this.generateArtifacts(1)));

    // Phase 2: Implementation
    results.push(await this.executePhase(taskId, this.generateArtifacts(2)));

    // Phase 3: Review
    const reviewArtifacts = options.injectReviewIssues
      ? this.generateArtifacts(3, {
          review: {
            issues: [{
              fingerprint: 'test-issue-123',
              severity: 'major',
              file: 'src/feature.ts',
              line: 42,
              description: 'Missing error handling',
              blocking: true
            }],
            total_issues: 1,
            blocking_issues: 1,
            review_passed: false
          }
        })
      : this.generateArtifacts(3);
    results.push(await this.executePhase(taskId, reviewArtifacts));

    // Phase 4: Fixes (if issues found)
    if (options.injectReviewIssues) {
      results.push(await this.executePhase(taskId, this.generateArtifacts(4, {
        fixes: {
          fixes_applied: [{
            fingerprint: 'test-issue-123',
            resolution: 'Added error handling',
            files_modified: ['src/feature.ts'],
            commits: ['abc123']
          }],
          unresolved_fingerprints: [],
          all_issues_addressed: true
        }
      })));

      // Re-review (no issues this time)
      results.push(await this.executePhase(taskId, this.generateArtifacts(3)));
    }

    // Phase 5: Test & Validation
    results.push(await this.executePhase(taskId, this.generateArtifacts(5, {
      tests: {
        all_tests_passing: true,
        coverage_delta: options.coverage || 5.2,
        test_summary: {
          unit: { total: 150, passed: 150, failed: 0 },
          integration: { total: 45, passed: 45, failed: 0 },
          e2e: { total: 20, passed: 20, failed: 0 }
        },
        lint_passing: true,
        type_check_passing: true,
        build_passing: true,
        failures: []
      }
    })));

    // Phase 6: Cleanup
    results.push(await this.executePhase(taskId, this.generateArtifacts(6)));

    // Phase 7: PR Shepherding
    results.push(await this.executePhase(taskId, this.generateArtifacts(7)));

    return results;
  }
}
