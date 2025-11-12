-- Migration 012: Staged Queue System
-- Adds queue_stage and chain_status for chain-aware scheduling
-- See: docs/technicalDesigns/staged-task-queue-implementation-plan.md

-- Add queue_stage enum
ALTER TABLE tasks ADD COLUMN queue_stage TEXT 
  CHECK(queue_stage IN ('implementation', 'followup')) 
  DEFAULT 'implementation';

-- Add chain_status enum
ALTER TABLE tasks ADD COLUMN chain_status TEXT 
  CHECK(chain_status IN ('pending', 'active', 'blocked', 'closed')) 
  DEFAULT 'pending';

-- Add blocked reason for human intervention
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;
ALTER TABLE tasks ADD COLUMN blocked_at INTEGER;
ALTER TABLE tasks ADD COLUMN blocked_by TEXT;

-- Create indexes for staged queue queries
CREATE INDEX IF NOT EXISTS idx_tasks_queue_stage ON tasks(queue_stage);
CREATE INDEX IF NOT EXISTS idx_tasks_chain_status ON tasks(chain_status);
CREATE INDEX IF NOT EXISTS idx_tasks_queue_stage_status ON tasks(queue_stage, status, priority DESC, created_at);

-- Create partial index for active chain counting (more efficient)
CREATE INDEX IF NOT EXISTS idx_tasks_active_chains ON tasks(chain_id, chain_status) 
  WHERE chain_status IN ('pending', 'active');

-- Backfill logic for existing tasks
UPDATE tasks 
SET 
  queue_stage = CASE 
    WHEN original_task_id IS NULL AND (is_repair_bot IS NULL OR is_repair_bot = 0) THEN 'implementation'
    ELSE 'followup'
  END,
  chain_id = CASE 
    -- Implementation tasks: chain_id = id
    WHEN chain_id IS NULL AND original_task_id IS NULL THEN id
    -- Follow-up tasks: inherit chain_id from original task
    WHEN chain_id IS NULL AND original_task_id IS NOT NULL THEN (
      SELECT COALESCE(chain_id, id) FROM tasks t WHERE t.id = tasks.original_task_id
    )
    -- Already has chain_id, keep it
    ELSE chain_id
  END,
  chain_status = CASE
    -- Completed/failed tasks: closed
    WHEN status IN ('completed', 'failed', 'cancelled', 'timeout') THEN 'closed'
    -- Active/pending tasks: mark as active
    WHEN status IN ('pending', 'assigned', 'active', 'retrying') THEN 'active'
    -- Default to pending
    ELSE 'pending'
  END
WHERE queue_stage IS NULL OR chain_id IS NULL OR chain_status IS NULL;

-- Migration complete
