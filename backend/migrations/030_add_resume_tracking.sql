-- Migration 030: Add Resume Tracking Columns
-- Created: 2025-01-19
-- Purpose: Add audit trail columns for task resume functionality
--
-- Adds resumed_by and resumed_at columns to track who manually resumed
-- a blocked task and when. This provides full audit trail for the
-- blocking/resume workflow.

-- Add resumed_by column to track who manually resumed the task
ALTER TABLE tasks ADD COLUMN resumed_by TEXT;

-- Add resumed_at column to track when the task was resumed
ALTER TABLE tasks ADD COLUMN resumed_at INTEGER;

-- No index needed - these columns are only queried when fetching specific tasks,
-- not used for filtering or sorting in queries
