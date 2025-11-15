-- Migration 021: Plans Table for AI Agent-Managed Planning System
-- Date: 2025-11-14
-- Purpose: Add database-backed planning system with automatic status computation
--
-- Background:
--   AI agents create implementation plans based on user feature requirements.
--   Plans link to tasks via plan_id, and status is computed automatically from
--   task/PR/chain states, ensuring plans never get out of date.
--
-- Core Concept:
--   - Plans are first-class entities tracking multi-task initiatives
--   - Tasks link to plans via plan_id (renamed from parent_initiative for clarity)
--   - Plan status is COMPUTED from task statuses (never manually updated)
--   - Progress metrics aggregated from linked tasks, PRs, and chains
--
-- Integration Points:
--   - TaskQueueService: Tasks link to plans via plan_id field
--   - PRMonitor: PR status contributes to plan progress calculation
--   - ChainTrackerService: Blocked chains set plan status to 'blocked'
--   - PlansService: CRUD operations and status computation
--   - PlanProgressCalculator: Real-time metrics from task/PR/chain state
--
-- Related Tables:
--   - tasks: Links to plans via plan_id (added below)
--   - task_executions: Execution history contributes to effort tracking
--   - pr_condition_states: PR merge gate status affects plan blockers

-- Create plans table
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  markdown_ref TEXT,              -- Optional reference to docs/plans/*.md

  -- Categorization
  plan_type TEXT NOT NULL CHECK(plan_type IN ('feature', 'refactor', 'fix', 'investigation')),
  priority TEXT NOT NULL CHECK(priority IN ('p0', 'p1', 'p2', 'p3')),

  -- Lifecycle (status is COMPUTED, stored for query performance)
  status TEXT NOT NULL CHECK(status IN ('planning', 'in_progress', 'blocked', 'completed', 'cancelled')),
  created_at INTEGER NOT NULL,
  started_at INTEGER,             -- When first task started
  completed_at INTEGER,           -- When all tasks completed
  cancelled_at INTEGER,

  -- Ownership & tracking
  created_by TEXT,                -- User or AI agent who created plan
  assigned_to TEXT,               -- Team/person responsible

  -- Goals & scope (JSON storage)
  success_criteria TEXT,          -- JSON array of success criteria
  scope_boundaries TEXT,          -- JSON object: {mustNotChange, mustNotAffect}
  estimated_effort_hours INTEGER,

  -- Metadata
  metadata TEXT                   -- JSON for extensibility
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_priority ON plans(priority);
CREATE INDEX IF NOT EXISTS idx_plans_type ON plans(plan_type);
CREATE INDEX IF NOT EXISTS idx_plans_created_at ON plans(created_at);
CREATE INDEX IF NOT EXISTS idx_plans_status_priority ON plans(status, priority);

-- Add plan_id column to tasks table (replaces parent_initiative concept)
-- Note: This table is managed by TaskQueueService and may not exist in all test contexts
-- The column addition will be handled by TaskQueueService inline migration if tasks table exists
-- This migration is primarily for creating the plans table itself

-- Foreign key constraint (soft reference - plans can be deleted)
-- No explicit FK constraint to allow plan deletion without cascading task deletion
-- Tasks remain valid standalone even if plan is deleted
