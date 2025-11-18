/**
 * Shared types for PR Condition evaluation system
 */

export type ConditionStatus = 'met' | 'unmet' | 'not_ready';

export interface ConditionState {
  status: ConditionStatus;
  issue_fingerprint: string;
  blocking_issues: BlockingIssue[];
  last_checked: number;
}

/**
 * BlockingIssue - Reference to a GitHub issue that blocks PR merge
 *
 * NOTE: This structure does NOT store GitHub data directly (per design principle:
 * "Any information available from GitHub should NOT be stored in our DB").
 * Instead, it stores references (IDs) that can be used to fetch data from GitHub on-demand.
 */
export interface BlockingIssue {
  type: string;  // e.g., 'unresolved_comment', 'failing_check', 'merge_conflicts'
  github_ref_type?: 'comment' | 'check_run' | 'review' | 'conflict';  // Type of GitHub entity
  github_ref_id?: number | string;  // GitHub entity ID (comment_id, check_run_id, etc.)
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export interface ActiveFixTask {
  task_id: string;
  created_at: number;
  issue_fingerprint: string;
}

export interface PRConditionState {
  pr_number: number;
  last_evaluated: number;
  last_updated: number;
  merge_eligible: boolean;

  // 8 conditions - using both new names (for E2E tests) and old names (for backward compat)
  conditions: {
    // New names (E2E test expectations)
    branch_updated: ConditionState;
    no_conflicts: ConditionState;
    ci_checks_passing: ConditionState;
    required_approvals: ConditionState;
    task_verification: ConditionState;
    copilot_review: ConditionState;
    final_validation_passed: ConditionState;
    no_wip_commits: ConditionState;
    // Old names (backward compatibility - optional)
    comments_resolved?: ConditionState;
    no_merge_conflicts?: ConditionState;
    no_change_requests?: ConditionState;
    copilot_review_completed?: ConditionState;
  };

  // Active fix tasks indexed by condition_id
  active_fix_tasks: {
    [condition_id: string]: ActiveFixTask[];
  };

  // Final validation state
  final_validation_state: {
    validation_attempts: number;
    last_validation_score: number; // 0-100
    validation_history: ValidationAttempt[];
    human_escalation_triggered: boolean;
  };

  // Audit trail
  condition_history: ConditionChange[];
}

export interface ValidationAttempt {
  attempt_number: number;
  timestamp: number;
  score: number;
  issues_found: ValidationIssue[];
  task_id?: string;
}

export interface ValidationIssue {
  category: 'accuracy' | 'entropy' | 'redundancy' | 'scope_creep' | 'requirements' | 'code_quality';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface ConditionChange {
  condition_id: string;
  timestamp: number;
  old_status: ConditionStatus;
  new_status: ConditionStatus;
  old_fingerprint: string;
  new_fingerprint: string;
  reason: string;
}

export interface ConditionEvaluation {
  condition_id: string;
  status: ConditionStatus;
  fingerprint: string;
  blocking_issues: BlockingIssue[];
  metadata?: Record<string, unknown>;
}
