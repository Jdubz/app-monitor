-- Migration 028: Create pull_requests table
-- 
-- Creates the pull_requests table to track PR state for chain completion logic.
-- This table stores minimal PR metadata needed by ChainTrackerService.
--
-- References:
-- - ChainTrackerService.closeCompletedChains() joins on tasks.pr_number
-- - Used to determine if chains can be closed when PRs are merged

CREATE TABLE IF NOT EXISTS pull_requests (
  number INTEGER PRIMARY KEY,
  state TEXT NOT NULL CHECK(state IN ('open', 'closed', 'merged')),
  title TEXT,
  url TEXT,
  head_branch TEXT,
  base_branch TEXT,
  check_suite_status TEXT,
  review_decision TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  merged_at INTEGER
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_pull_requests_state ON pull_requests(state);
CREATE INDEX IF NOT EXISTS idx_pull_requests_updated_at ON pull_requests(updated_at);

-- Migration complete: pull_requests table created
