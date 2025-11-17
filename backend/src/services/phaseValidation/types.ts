/**
 * Phase Validation Framework - Types and Interfaces
 * 
 * Pluggable validation system for all phases.
 * Each phase has a specific validator that checks artifacts and determines next steps.
 * 
 * See: docs/technicalDesigns/task-processing-stage-implementation-roadmap.md
 */

import type { Task } from '../taskQueue.sqlite.js';

/**
 * Result of phase validation.
 * Contains pass/fail status and phase-specific flags for transition logic.
 */
export interface ValidationResult {
  passed: boolean;
  errors?: string[];
  warnings?: string[]; // Non-blocking issues
  
  // Phase-specific results (used by PhaseOrchestrator to determine next phase)
  taskObsolete?: boolean; // Phase 1: Task no longer needed
  taskRealigned?: boolean; // Phase 1: Task needs prompt update
  issuesFound?: boolean; // Phase 3: Review found issues
  allIssuesAddressed?: boolean; // Phase 4: All fixes applied
  allTestsPassing?: boolean; // Phase 5: All validation criteria met
  allGatesPassing?: boolean; // Phase 7: All merge gates passed
  
  // Recovery information (added after recovery attempt)
  recovery?: {
    attempted: boolean;
    success: boolean;
    category: 'retry' | 'context_update' | 'chain_blocked' | 'system_blocked';
    diagnosis: string;
  };
  
  // Additional context
  details?: Record<string, unknown>;
  artifacts?: Record<string, unknown>; // Structured artifacts to store in DB
}

/**
 * Artifacts extracted from container filesystem.
 * These are the raw files/data before validation.
 */
export interface PhaseArtifacts {
  // Common artifacts
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  
  // Container filesystem artifacts
  files?: Map<string, string>; // path -> content
  
  // Structured outputs (from .artifacts/ directory)
  planning?: PlanningArtifacts;
  implementation?: ImplementationArtifacts;
  review?: ReviewArtifacts;
  fixes?: FixesArtifacts;
  tests?: TestArtifacts;
  cleanup?: CleanupArtifacts;
  prShepherding?: PRShepherdingArtifacts;
}

// Phase-specific artifact types
export interface PlanningArtifacts {
  obsolete?: boolean;
  obsolete_reason?: string;
  task_realigned?: boolean;
  realignment_details?: string;
  dependencies?: string[];
  architecture_notes?: string;
  estimated_complexity?: 'low' | 'medium' | 'high';
}

export interface ImplementationArtifacts {
  pr_number?: number;
  pr_url?: string;
  branch_name?: string;
  commits?: number;
  files_changed?: string[];
}

export interface ReviewArtifacts {
  issues: Array<{
    fingerprint: string; // SHA256 of (file + line + description)
    severity: 'critical' | 'major' | 'minor';
    file: string;
    line: number;
    description: string;
    blocking: boolean; // Must be resolved before advancing to Phase 5
  }>;
  total_issues: number;
  blocking_issues: number;
  review_passed: boolean;
}

export interface FixesArtifacts {
  fixes_applied: Array<{
    fingerprint: string; // Matches issue from Phase 3
    resolution: string;
    files_modified: string[];
    commits: string[];
  }>;
  unresolved_fingerprints: string[];
  all_issues_addressed: boolean;
}

export interface TestArtifacts {
  all_tests_passing: boolean;
  coverage_delta: number; // % change on modified files
  test_summary: {
    unit: { total: number; passed: number; failed: number };
    integration: { total: number; passed: number; failed: number };
    e2e: { total: number; passed: number; failed: number };
  };
  lint_passing: boolean;
  type_check_passing: boolean;
  build_passing: boolean;
  failures?: Array<{
    suite: string;
    test: string;
    error: string;
  }>;
}

export interface CleanupArtifacts {
  docs_updated: string[]; // Files updated
  docs_deleted: string[]; // Files deleted per DOCUMENTATION_SYSTEM.md
  artifacts_pruned: string[]; // .phase-artifacts/ cleaned up
  changelog_entry?: string;
}

export interface PRShepherdingArtifacts {
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
}

/**
 * Interface for phase validators.
 * Each phase implements this interface to validate its specific artifacts.
 */
export interface PhaseValidator {
  /**
   * Validate phase execution artifacts.
   * @param task - The task being validated
   * @param artifacts - Extracted artifacts from container/execution
   * @returns ValidationResult with pass/fail and phase-specific flags
   */
  validate(task: Task, artifacts: PhaseArtifacts): Promise<ValidationResult>;
  
  /**
   * Phase index this validator handles (1-7).
   */
  readonly phaseIndex: number;
  
  /**
   * Phase name for logging/debugging.
   */
  readonly phaseName: string;
}
