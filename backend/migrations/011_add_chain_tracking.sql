-- Migration 011: Add chain tracking for PR fix tasks
-- Supports chain-aware task spawning and depth-limited healing
-- See: docs/investigations/PR_SELF_HEALING_EVENT_DRIVEN_DESIGN.md

-- Add chain tracking columns to tasks table
ALTER TABLE tasks ADD COLUMN chain_id TEXT;
ALTER TABLE tasks ADD COLUMN chain_depth INTEGER DEFAULT 0;

-- Create index for efficient chain queries
CREATE INDEX IF NOT EXISTS idx_tasks_chain_id ON tasks(chain_id);

-- Migration complete
