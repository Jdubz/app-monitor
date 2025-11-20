-- Migration 031: Remove preferred_agent column from tasks table
--
-- The agent selector is now the sole authority for choosing providers, so the
-- preferred_agent column is obsolete. This migration rebuilds the tasks table
-- without that column while preserving all existing data.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS tasks_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  documentation TEXT,
  notes TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout', 'assigned', 'active', 'retrying', 'blocked')),
  priority INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL,
  assigned_at INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  assigned_agent TEXT NOT NULL,
  assigned_worker TEXT,
  agent_type TEXT CHECK(agent_type IN ('claude', 'codex', 'gemini')),
  prompt TEXT,
  output TEXT,
  error TEXT,
  can_retry INTEGER DEFAULT 1,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT NULL,
  fingerprint TEXT,
  estimated_hours REAL,
  complexity TEXT,
  exit_code INTEGER,
  files TEXT,
  dependencies TEXT,
  project TEXT,
  timeout INTEGER,
  metadata TEXT,
  context_json TEXT,
  pr_number INTEGER,
  chain_id TEXT,
  chain_depth INTEGER,
  chain_status TEXT,
  blocked_reason TEXT,
  blocked_at INTEGER,
  blocked_by TEXT,
  resumed_by TEXT,
  resumed_at INTEGER,
  phase_index INTEGER DEFAULT 1,
  phase_name TEXT,
  phase_status TEXT CHECK(phase_status IN ('ready', 'running', 'validating', 'recovering', 'complete', 'blocked')) DEFAULT 'ready',
  phase_attempts INTEGER DEFAULT 1,
  phase_payload TEXT,
  context_bundle_id TEXT,
  context_cache_key TEXT,
  context_profiles TEXT,
  risk_level TEXT CHECK(risk_level IN ('minimal', 'low', 'medium', 'high')),
  task_category TEXT CHECK(task_category IN ('implementation', 'analysis', 'documentation', 'review', 'planning')),
  file_patterns TEXT,
  estimated_complexity TEXT CHECK(estimated_complexity IN ('simple', 'medium', 'complex'))
);

INSERT INTO tasks_new (
  id, type, title, description, documentation, notes, status, priority,
  created_at, assigned_at, started_at, completed_at, assigned_agent, assigned_worker,
  agent_type, prompt, output, error, can_retry, retry_count, max_retries, timeout_ms,
  fingerprint, estimated_hours, complexity, exit_code, files, dependencies, project,
  timeout, metadata, context_json, pr_number, chain_id, chain_depth, chain_status,
  blocked_reason, blocked_at, blocked_by, resumed_by, resumed_at,
  phase_index, phase_name, phase_status, phase_attempts, phase_payload,
  context_bundle_id, context_cache_key, context_profiles, risk_level,
  task_category, file_patterns, estimated_complexity
)
SELECT
  id, type, title, description, documentation, notes, status, priority,
  created_at, assigned_at, started_at, completed_at, assigned_agent, assigned_worker,
  agent_type, prompt, output, error, can_retry, retry_count, max_retries, timeout_ms,
  fingerprint, estimated_hours, complexity, exit_code, files, dependencies, project,
  timeout, metadata, context_json, pr_number, chain_id, chain_depth, chain_status,
  blocked_reason, blocked_at, blocked_by, resumed_by, resumed_at,
  phase_index, phase_name, phase_status, phase_attempts, phase_payload,
  context_bundle_id, context_cache_key, context_profiles, risk_level,
  task_category, file_patterns, estimated_complexity
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_fingerprint ON tasks(fingerprint);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_worker ON tasks(assigned_worker);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_pr_number ON tasks(pr_number) WHERE pr_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_chain_id ON tasks(chain_id) WHERE chain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_chain_status ON tasks(chain_status) WHERE chain_status IS NOT NULL;

COMMIT;
