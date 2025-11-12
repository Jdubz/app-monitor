-- Webhook Events Queue Table
-- Migration: 2025-11-12-webhook-events-queue
-- Purpose: Durable webhook processing queue with retry logic

CREATE TABLE IF NOT EXISTS webhook_events (
  -- Identity
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,              -- 'pull_request', 'push', 'check_suite', 'check_run', 'pull_request_review'
  delivery_id TEXT NOT NULL UNIQUE,      -- GitHub X-GitHub-Delivery header (prevents duplicates)
  payload TEXT NOT NULL,                 -- JSON payload from GitHub
  signature TEXT,                        -- X-Hub-Signature-256 for audit trail
  
  -- Processing state
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,               -- Unix timestamp ms
  last_error TEXT,                       -- Error message from last attempt
  
  -- Timestamps
  received_at INTEGER NOT NULL,          -- Unix timestamp ms when webhook received
  completed_at INTEGER,                  -- Unix timestamp ms when successfully processed
  
  -- Metadata (for filtering/debugging)
  repository TEXT,                       -- owner/repo from payload
  pr_number INTEGER                      -- If PR-related event
);

-- Index for finding next pending webhook
CREATE INDEX IF NOT EXISTS idx_webhook_events_status 
  ON webhook_events(status, received_at);

-- Index for cleanup of old completed events
CREATE INDEX IF NOT EXISTS idx_webhook_events_completed 
  ON webhook_events(status, completed_at);

-- Index for PR-specific queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_pr 
  ON webhook_events(pr_number, status) 
  WHERE pr_number IS NOT NULL;

-- Index for retry logic (failed events ready to retry)
CREATE INDEX IF NOT EXISTS idx_webhook_events_retry 
  ON webhook_events(status, attempt_count, last_attempt_at)
  WHERE status = 'failed';
