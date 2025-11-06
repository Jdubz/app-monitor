-- Migration 004: Task Context & Automation Run Tracking
-- Add rich diagnostic context capture for dev-bot automation
-- Adapted from imagineer's bug report pattern for task-first execution

-- ============================================================================
-- Task Context (extends existing tasks table)
-- ============================================================================

-- Add context_json column to existing tasks table
ALTER TABLE tasks ADD COLUMN context_json TEXT;

-- ============================================================================
-- Task Automation Runs
-- Tracks every dev-bot execution attempt with full telemetry
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_automation_runs (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  worker_id TEXT,
  container_id TEXT,

  -- Timestamps
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,

  -- Exit status
  exit_code INTEGER,
  status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'noop')),
  failure_reason TEXT,

  -- Git result
  commit_sha TEXT,
  branch TEXT,

  -- Quality validation
  quality_passed BOOLEAN,
  quality_validation_json TEXT,

  -- Resource usage
  resource_usage_json TEXT,

  -- Token tracking
  token_usage_json TEXT,

  -- Container metadata
  container_meta_json TEXT,

  -- Build/test/lint results (denormalized for quick queries)
  build_exit_code INTEGER,
  test_passed INTEGER,
  test_failed INTEGER,
  test_skipped INTEGER,
  lint_errors INTEGER,
  lint_warnings INTEGER,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_task ON task_automation_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON task_automation_runs(status);
CREATE INDEX IF NOT EXISTS idx_automation_runs_started ON task_automation_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_worker ON task_automation_runs(worker_id);

-- ============================================================================
-- Shell Commands Executed (per run)
-- Captures full command trail for debugging
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,

  -- Command details
  command TEXT NOT NULL,
  cwd TEXT,
  exit_code INTEGER,
  duration_ms INTEGER,

  -- Output (truncated to reasonable size)
  stdout_truncated TEXT,
  stderr_truncated TEXT,

  -- Timestamp
  timestamp TEXT NOT NULL,

  FOREIGN KEY (run_id) REFERENCES task_automation_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_commands_run ON task_commands(run_id);
CREATE INDEX IF NOT EXISTS idx_commands_timestamp ON task_commands(timestamp);

-- ============================================================================
-- File Operations (per run)
-- Tracks all file reads/writes/edits/deletes
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_file_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,

  -- File details
  path TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('read', 'write', 'edit', 'delete')),

  -- Change metrics
  lines_before INTEGER,
  lines_after INTEGER,
  diff_path TEXT, -- reference to stored diff file

  -- Timestamp
  timestamp TEXT NOT NULL,

  FOREIGN KEY (run_id) REFERENCES task_automation_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_file_ops_run ON task_file_operations(run_id);
CREATE INDEX IF NOT EXISTS idx_file_ops_path ON task_file_operations(path);
CREATE INDEX IF NOT EXISTS idx_file_ops_operation ON task_file_operations(operation);

-- ============================================================================
-- Git Operations (per run)
-- Tracks git commits, pushes, checkouts, etc.
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_git_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,

  -- Git command details
  command TEXT NOT NULL,
  commit_sha TEXT,
  branch TEXT,
  files_changed INTEGER,

  -- Timestamp
  timestamp TEXT NOT NULL,

  FOREIGN KEY (run_id) REFERENCES task_automation_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_git_ops_run ON task_git_operations(run_id);
CREATE INDEX IF NOT EXISTS idx_git_ops_commit ON task_git_operations(commit_sha);

-- ============================================================================
-- Artifacts (logs, patches, reports per run/task)
-- References files stored in logs/dev-bots/<task_id>/<run_id>/
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,

  -- Artifact details
  type TEXT NOT NULL CHECK(type IN ('patch', 'log', 'screenshot', 'report', 'session_summary')),
  path TEXT NOT NULL, -- relative to project root or absolute
  size_bytes INTEGER,

  -- Metadata
  description TEXT,
  mime_type TEXT,

  -- Timestamp
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (run_id) REFERENCES task_automation_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artifacts_run ON task_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_task ON task_artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON task_artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_created ON task_artifacts(created_at DESC);

-- ============================================================================
-- Build Outputs (denormalized for quick access)
-- Full details stored in artifacts, key metrics here for queries
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_build_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,

  -- Build details
  command TEXT NOT NULL,
  exit_code INTEGER NOT NULL,
  duration_ms INTEGER,

  -- Error summary
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,

  -- Full output stored as artifact, truncated preview here
  output_preview TEXT,

  -- Timestamp
  timestamp TEXT NOT NULL,

  FOREIGN KEY (run_id) REFERENCES task_automation_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_build_outputs_run ON task_build_outputs(run_id);
CREATE INDEX IF NOT EXISTS idx_build_outputs_exit_code ON task_build_outputs(exit_code);

-- ============================================================================
-- Test Results (denormalized for dashboards)
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,

  -- Test summary
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  duration_ms INTEGER,

  -- Coverage (optional)
  coverage_lines REAL,
  coverage_statements REAL,
  coverage_branches REAL,
  coverage_functions REAL,

  -- Timestamp
  timestamp TEXT NOT NULL,

  FOREIGN KEY (run_id) REFERENCES task_automation_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_test_results_run ON task_test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_test_results_failed ON task_test_results(failed);

-- ============================================================================
-- Analytics Views
-- ============================================================================

-- Automation success rate by task type
CREATE VIEW IF NOT EXISTS v_automation_success_by_type AS
SELECT
  t.type,
  COUNT(*) as total_runs,
  SUM(CASE WHEN tar.status = 'success' THEN 1 ELSE 0 END) as successful_runs,
  ROUND(100.0 * SUM(CASE WHEN tar.status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
  AVG(tar.duration_ms) as avg_duration_ms,
  SUM(CASE WHEN tar.token_usage_json IS NOT NULL THEN 1 ELSE 0 END) as runs_with_tokens
FROM tasks t
JOIN task_automation_runs tar ON t.id = tar.task_id
GROUP BY t.type
ORDER BY total_runs DESC;

-- Recent automation runs with task details
CREATE VIEW IF NOT EXISTS v_recent_automation_runs AS
SELECT
  tar.run_id,
  tar.task_id,
  t.title as task_title,
  t.type as task_type,
  tar.worker_id,
  tar.status,
  tar.exit_code,
  tar.started_at,
  tar.completed_at,
  tar.duration_ms,
  tar.commit_sha,
  tar.quality_passed,
  (SELECT COUNT(*) FROM task_artifacts WHERE run_id = tar.run_id) as artifact_count,
  (SELECT COUNT(*) FROM task_file_operations WHERE run_id = tar.run_id) as files_modified
FROM task_automation_runs tar
JOIN tasks t ON tar.task_id = t.id
ORDER BY tar.started_at DESC
LIMIT 100;

-- Task retry statistics
CREATE VIEW IF NOT EXISTS v_task_retry_stats AS
SELECT
  task_id,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_attempts,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_attempts,
  MIN(started_at) as first_attempt,
  MAX(started_at) as last_attempt,
  AVG(duration_ms) as avg_duration_ms
FROM task_automation_runs
GROUP BY task_id
HAVING total_attempts > 1
ORDER BY total_attempts DESC;
