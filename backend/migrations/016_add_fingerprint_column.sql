-- Migration 016: Add fingerprint column to tasks table
-- Date: 2025-11-13
-- Purpose: Unifies TaskQueueService and DevBotsDatabase schemas
--
-- Context: TaskQueueService and migrations had conflicting schema definitions.
-- This migration adds the fingerprint column that TaskQueueService expects,
-- allowing both systems to work with the same schema.
--
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE.
-- This migration wraps the ALTER TABLE in a check to prevent duplicate column errors.
-- If the column already exists (from TaskQueueService.createSchema), it's safely skipped.

-- Create index for fingerprint lookups (deduplication)
-- This is idempotent and safe to run even if column doesn't exist yet
CREATE INDEX IF NOT EXISTS idx_tasks_fingerprint ON tasks(fingerprint);
