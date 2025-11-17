-- Migration 026: Phase System for Task Processing
-- Date: 2025-11-17
-- Purpose: Replace legacy REVIEW/FIX child task system with 7-phase pipeline
-- See: docs/technicalDesigns/task-processing-stage-implementation-roadmap.md
--
-- Changes:
--   1. Add phase tracking columns to tasks table
--   2. Create task_stage_runs table for historical phase execution tracking
--   3. Remove legacy queue_stage and original_task_id columns (child task system)
--
-- Phase System Overview:
--   Phase 1: Planning - Validate task relevance
--   Phase 2: Implementation - Write code, create PR
--   Phase 3: Review - Identify issues with fingerprints
--   Phase 4: Fixes - Correct issues from review
--   Phase 5: Test Coverage & Validation - Write tests, run suite
--   Phase 6: Cleanup & Docs - Update documentation
--   Phase 7: PR Shepherding - Monitor merge gates, auto-merge

-- Add phase tracking columns to tasks table
ALTER TABLE tasks ADD COLUMN phase_index INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN phase_name TEXT DEFAULT 'Planning';
ALTER TABLE tasks ADD COLUMN phase_status TEXT DEFAULT 'ready' 
  CHECK(phase_status IN ('ready', 'running', 'validating', 'recovering', 'complete', 'blocked'));
ALTER TABLE tasks ADD COLUMN phase_attempts INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN phase_payload TEXT; -- JSON for phase-specific state and partial progress

-- Create indexes for phase queries
CREATE INDEX IF NOT EXISTS idx_tasks_phase_index ON tasks(phase_index);
CREATE INDEX IF NOT EXISTS idx_tasks_phase_status ON tasks(phase_status);
CREATE INDEX IF NOT EXISTS idx_tasks_phase_index_status ON tasks(phase_index, phase_status);

-- Create task_stage_runs table for historical tracking
-- Records every phase execution attempt with validation results and artifacts
CREATE TABLE IF NOT EXISTS task_stage_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  phase_index INTEGER NOT NULL,
  phase_name TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'recovered', 'blocked')),
  artifacts_blob TEXT, -- JSON structured data (planning output, review issues, test results, etc.)
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  recovery_diagnosis TEXT, -- JSON recovery agent response if recovery was triggered
  exit_code INTEGER,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Indexes for stage runs queries
CREATE INDEX IF NOT EXISTS idx_stage_runs_task ON task_stage_runs(task_id, phase_index);
CREATE INDEX IF NOT EXISTS idx_stage_runs_status ON task_stage_runs(status);
CREATE INDEX IF NOT EXISTS idx_stage_runs_created ON task_stage_runs(created_at DESC);

-- Remove legacy child task columns (REVIEW/FIX system being replaced)
-- Note: SQLite doesn't support DROP COLUMN directly, but we can ignore these columns
-- They will be removed in a future cleanup migration after full system verification
-- For now, document them as deprecated:
--   - queue_stage (replaced by phase_index + phase_status)
--   - original_task_id (no more child tasks - all phases within single task)

-- Backfill phase data for existing tasks
-- Default all existing tasks to Phase 1 (Planning) with ready status
UPDATE tasks 
SET 
  phase_index = 1,
  phase_name = 'Planning',
  phase_status = CASE 
    WHEN status IN ('completed', 'failed', 'cancelled', 'timeout') THEN 'complete'
    WHEN status IN ('running', 'active', 'assigned') THEN 'running'
    ELSE 'ready'
  END,
  phase_attempts = 1
WHERE phase_index IS NULL;

-- Migration complete
