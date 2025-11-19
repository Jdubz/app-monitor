-- Migration 029: Add recovery_diagnosis column to task_stage_runs
-- Date: 2025-11-19
-- Purpose: Fix schema mismatch from migration 026
--
-- Background:
--   Migration 026 created task_stage_runs table with recovery_diagnosis column,
--   but production database had table created by TaskQueueService.createSchema()
--   BEFORE the recovery_diagnosis column was added to createSchema().
--
--   The "CREATE TABLE IF NOT EXISTS" in migration 026 was silently skipped
--   because the table already existed, leaving production with old schema.
--
-- This migration adds the missing column to existing production databases.
-- For fresh databases, migration 026 already creates the column, so this
-- migration will fail with "duplicate column" error, which is expected and safe.

-- Attempt to add recovery_diagnosis column
-- This will:
--   - Succeed on databases missing the column (production hotfix)
--   - Fail on databases that already have it (safe - no-op)
--   - Fail on fresh databases created from migration 026 (safe - column exists)

-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- We handle this gracefully in the migration manager by catching the error
ALTER TABLE task_stage_runs ADD COLUMN recovery_diagnosis TEXT;

-- Migration complete
-- Note: Error "duplicate column name" is expected and safe if column exists
