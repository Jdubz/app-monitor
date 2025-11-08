CREATE TABLE IF NOT EXISTS interactive_sessions (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  status TEXT NOT NULL,
  container_id TEXT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_user_activity_at TIMESTAMP,
  last_agent_activity_at TIMESTAMP,
  ended_at TIMESTAMP,
  termination_reason TEXT,
  context_snapshot TEXT,
  log_path TEXT,
  metadata TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interactive_sessions_status ON interactive_sessions(status);
CREATE INDEX IF NOT EXISTS idx_interactive_sessions_owner ON interactive_sessions(owner_email);
