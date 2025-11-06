-- Migration 002: Tasks Table
-- Creates persistent storage for task queue
-- Based on TaskSchema from backend/src/types/taskSchema.ts

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) >= 1 AND length(title) <= 200),
  description TEXT,
  documentation TEXT,
  notes TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'assigned', 'active', 'completed', 'failed', 'retrying')),
  created_at TEXT NOT NULL,
  assigned_worker TEXT,
  assigned_agent TEXT NOT NULL,
  assigned_at TEXT,
  completed_at TEXT,
  output TEXT,
  error TEXT,
  exit_code INTEGER,
  prompt TEXT,
  files TEXT, -- JSON array
  dependencies TEXT, -- JSON array
  project TEXT,
  priority INTEGER DEFAULT 5 CHECK(priority >= 0 AND priority <= 10),
  retry_count INTEGER DEFAULT 0 CHECK(retry_count >= 0),
  max_retries INTEGER DEFAULT 3 CHECK(max_retries >= 0),
  timeout INTEGER,
  metadata TEXT, -- JSON object
  context_json TEXT -- Added for TC-1 context support
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_worker ON tasks(assigned_worker);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority DESC, created_at);
