-- Migration 009: PR Condition States for Continuous Self-Healing
-- Purpose: Track PR condition state machine for intelligent task spawning

CREATE TABLE IF NOT EXISTS pr_condition_states (
  pr_number INTEGER PRIMARY KEY,

  -- State JSON blob (stores entire PRConditionState object)
  state_json TEXT NOT NULL,

  -- Timestamps
  last_evaluated INTEGER NOT NULL,
  last_updated INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- Quick flags for queries
  merge_eligible BOOLEAN NOT NULL DEFAULT 0,

  -- Individual condition statuses (for indexing/quick queries)
  ci_checks_passing BOOLEAN NOT NULL DEFAULT 0,
  comments_resolved BOOLEAN NOT NULL DEFAULT 0,
  no_merge_conflicts BOOLEAN NOT NULL DEFAULT 0,
  branch_updated BOOLEAN NOT NULL DEFAULT 0,
  no_change_requests BOOLEAN NOT NULL DEFAULT 0,
  task_verification BOOLEAN NOT NULL DEFAULT 0,
  copilot_review_completed BOOLEAN NOT NULL DEFAULT 0,
  final_validation_passed BOOLEAN NOT NULL DEFAULT 0,

  -- Active task tracking (for quick lookups)
  has_active_tasks BOOLEAN NOT NULL DEFAULT 0,
  active_task_count INTEGER NOT NULL DEFAULT 0,

  -- Validation state tracking
  validation_attempts INTEGER NOT NULL DEFAULT 0,
  last_validation_score INTEGER, -- 0-100
  human_escalation_triggered BOOLEAN NOT NULL DEFAULT 0
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pr_condition_states_merge_eligible
  ON pr_condition_states(merge_eligible) WHERE merge_eligible = 1;

CREATE INDEX IF NOT EXISTS idx_pr_condition_states_has_active_tasks
  ON pr_condition_states(has_active_tasks) WHERE has_active_tasks = 1;

CREATE INDEX IF NOT EXISTS idx_pr_condition_states_last_evaluated
  ON pr_condition_states(last_evaluated);

CREATE INDEX IF NOT EXISTS idx_pr_condition_states_escalated
  ON pr_condition_states(human_escalation_triggered) WHERE human_escalation_triggered = 1;

-- Composite index for finding PRs ready for validation
CREATE INDEX IF NOT EXISTS idx_pr_condition_states_validation_ready
  ON pr_condition_states(
    ci_checks_passing,
    comments_resolved,
    no_merge_conflicts,
    branch_updated,
    no_change_requests,
    task_verification,
    copilot_review_completed,
    final_validation_passed
  ) WHERE
    ci_checks_passing = 1
    AND comments_resolved = 1
    AND no_merge_conflicts = 1
    AND branch_updated = 1
    AND no_change_requests = 1
    AND task_verification = 1
    AND copilot_review_completed = 1
    AND final_validation_passed = 0;
