-- Migration 008: PR Review Comments Tracking
-- Purpose: Store and track review comments to verify resolution before merge

CREATE TABLE pr_review_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_number INTEGER NOT NULL,
  comment_id INTEGER NOT NULL,
  file_path TEXT,
  line_number INTEGER,
  body TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  severity TEXT CHECK(severity IN ('blocking', 'suggestion', 'info', 'nitpick')) DEFAULT 'info',
  category TEXT,
  resolved BOOLEAN DEFAULT 0,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  reviewer TEXT,
  is_copilot BOOLEAN DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pr_review_comments_pr ON pr_review_comments(pr_number);
CREATE INDEX IF NOT EXISTS idx_pr_review_comments_fingerprint ON pr_review_comments(fingerprint);
CREATE INDEX IF NOT EXISTS idx_pr_review_comments_resolved ON pr_review_comments(resolved);
CREATE INDEX IF NOT EXISTS idx_pr_review_comments_severity ON pr_review_comments(severity);
CREATE INDEX IF NOT EXISTS idx_pr_review_comments_pr_resolved ON pr_review_comments(pr_number, resolved);
