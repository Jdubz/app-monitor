-- Migration 023: Frontend Logs Table
-- Stores frontend logs in SQLite for fast querying (replaces file I/O)
-- Used by issue triage service for log correlation

CREATE TABLE IF NOT EXISTS frontend_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('trace', 'debug', 'info', 'warn', 'error', 'fatal')),
  message TEXT NOT NULL,
  scope TEXT,
  traceId TEXT,
  sessionId TEXT NOT NULL,
  route TEXT,
  userId TEXT,
  data TEXT, -- JSON string
  errorName TEXT,
  errorMessage TEXT,
  errorStack TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for fast log searching by issue triage service
CREATE INDEX IF NOT EXISTS idx_frontend_logs_timestamp ON frontend_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_frontend_logs_traceId ON frontend_logs(traceId);
CREATE INDEX IF NOT EXISTS idx_frontend_logs_sessionId ON frontend_logs(sessionId);
CREATE INDEX IF NOT EXISTS idx_frontend_logs_level ON frontend_logs(level);
CREATE INDEX IF NOT EXISTS idx_frontend_logs_session_time ON frontend_logs(sessionId, timestamp);

-- Composite index for issue triage queries (timestamp range + sessionId/traceId)
CREATE INDEX IF NOT EXISTS idx_frontend_logs_triage ON frontend_logs(timestamp, sessionId, traceId);
