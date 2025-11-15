-- Migration 022: Issues Table
-- Creates storage for user-reported issues and autonomous triage
-- Integrates with existing task queue for bugfix task creation

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  sessionId TEXT,
  traceId TEXT,
  route TEXT,
  userAgent TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending',
  taskId TEXT,
  fingerprint TEXT,
  severity TEXT,
  errorMessage TEXT,
  component TEXT,
  created TEXT NOT NULL,
  resolved TEXT,
  resolution TEXT,
  prNumber INTEGER
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_trace ON issues(traceId);
CREATE INDEX IF NOT EXISTS idx_timestamp ON issues(timestamp);
CREATE INDEX IF NOT EXISTS idx_fingerprint ON issues(fingerprint);
CREATE INDEX IF NOT EXISTS idx_created ON issues(created);

-- Issue occurrences table for deduplication tracking
CREATE TABLE IF NOT EXISTS issue_occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issueId TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  sessionId TEXT,
  FOREIGN KEY (issueId) REFERENCES issues(id)
);

CREATE INDEX IF NOT EXISTS idx_occurrence_issue ON issue_occurrences(issueId);
CREATE INDEX IF NOT EXISTS idx_occurrence_timestamp ON issue_occurrences(timestamp);
