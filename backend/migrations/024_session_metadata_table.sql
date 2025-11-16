-- Migration 024: Session Metadata Table
-- Stores frontend session metadata (user agent, viewport, etc.)
-- Used by frontend logging service to track session context

CREATE TABLE IF NOT EXISTS session_metadata (
  session_id TEXT PRIMARY KEY,
  user_agent TEXT NOT NULL,
  viewport_width INTEGER NOT NULL,
  viewport_height INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_session_metadata_start_time ON session_metadata(start_time);
