-- Migration 005: PR-Based Workflow Support
-- Adds fields to support GitHub Pull Request workflow automation

-- Add PR workflow fields to tasks table
ALTER TABLE tasks ADD COLUMN pr_number INTEGER;
ALTER TABLE tasks ADD COLUMN pr_url TEXT;
ALTER TABLE tasks ADD COLUMN pr_branch TEXT;
ALTER TABLE tasks ADD COLUMN pr_status TEXT CHECK(pr_status IN ('creating', 'pending_checks', 'pending_review', 'ready_to_merge', 'merged', 'closed'));
ALTER TABLE tasks ADD COLUMN pr_checks_status TEXT CHECK(pr_checks_status IN ('pending', 'success', 'failure'));
ALTER TABLE tasks ADD COLUMN pr_review_status TEXT CHECK(pr_review_status IN ('no_reviews', 'approved', 'changes_requested', 'commented'));
ALTER TABLE tasks ADD COLUMN pr_created_at INTEGER;
ALTER TABLE tasks ADD COLUMN pr_merged_at INTEGER;

-- Add followup task linking fields
ALTER TABLE tasks ADD COLUMN followup_for_pr INTEGER; -- References a PR number if this task fixes PR issues
ALTER TABLE tasks ADD COLUMN followup_tasks TEXT; -- JSON array of child task IDs created to fix this task's PR issues

-- Create index on PR number for quick lookups
CREATE INDEX IF NOT EXISTS idx_tasks_pr_number ON tasks(pr_number);

-- Create index on PR status for monitoring queries
CREATE INDEX IF NOT EXISTS idx_tasks_pr_status ON tasks(pr_status) WHERE pr_status IS NOT NULL;

-- Create index on followup_for_pr for tracing task chains
CREATE INDEX IF NOT EXISTS idx_tasks_followup_for_pr ON tasks(followup_for_pr) WHERE followup_for_pr IS NOT NULL;
