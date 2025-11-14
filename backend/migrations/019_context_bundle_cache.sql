-- Context Bundle Cache Table
-- Stores cached context bundles for dev-bot tasks

CREATE TABLE IF NOT EXISTS context_bundle_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bundle_id TEXT NOT NULL UNIQUE,
  cache_key TEXT NOT NULL UNIQUE,
  task_type TEXT NOT NULL,
  profiles TEXT NOT NULL,  -- JSON array
  mount_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT NOT NULL,
  bundle_data TEXT NOT NULL,  -- JSON blob
  CONSTRAINT valid_task_type CHECK (task_type IN ('implementation', 'fix', 'review', 'deployment', 'pr-follow-up', 'analysis'))
);

-- Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_context_bundle_cache_key ON context_bundle_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_context_bundle_id ON context_bundle_cache(bundle_id);
CREATE INDEX IF NOT EXISTS idx_context_bundle_task_type ON context_bundle_cache(task_type);
CREATE INDEX IF NOT EXISTS idx_context_bundle_expires_at ON context_bundle_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_context_bundle_last_accessed ON context_bundle_cache(last_accessed_at);
