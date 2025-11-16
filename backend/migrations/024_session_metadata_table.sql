-- Migration 024: Session Metadata Table
-- Stores frontend session metadata (user agent, viewport, etc.)
-- Used by frontend logging service to track session context

CREATE TABLE IF NOT EXISTS session_metadata (
  sessionId TEXT PRIMARY KEY,
  userAgent TEXT NOT NULL,
  viewportWidth INTEGER NOT NULL,
  viewportHeight INTEGER NOT NULL,
  startTime TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_session_metadata_startTime ON session_metadata(startTime);
