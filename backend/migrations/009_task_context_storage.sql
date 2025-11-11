-- Migration 009: Task Context Storage Tables
-- Stores task creation and execution context for diagnostic purposes

-- ============================================================================
-- Task Creation Context
-- Captures environment, client metadata, and diagnostic breadcrumbs at task creation time
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_creation_context (
  task_id TEXT PRIMARY KEY,
  context_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_creation_context_created ON task_creation_context(created_at DESC);

-- ============================================================================
-- Task Execution Context
-- Captures full execution trail including commands, file operations, and test results
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_execution_context (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  context_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_execution_context_task ON task_execution_context(task_id);
CREATE INDEX IF NOT EXISTS idx_task_execution_context_created ON task_execution_context(created_at DESC);
