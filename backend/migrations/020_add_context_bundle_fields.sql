-- Migration 020: Add Context Bundle Fields to Tasks Table
-- Date: 2025-11-14
-- Purpose: Add context bundle reference fields to enable context-aware task execution
--
-- Background:
--   Context management system (Phase 1 complete) generates context bundles
--   from YAML recipes. Tasks need to reference these bundles for:
--   1. Context bundle ID and cache key for retrieval
--   2. List of context profiles included in the bundle
--   3. Risk level classification for agent eligibility
--
-- Fields Added:
--   - context_bundle_id: UUID of the generated context bundle
--   - context_cache_key: Git hash-based cache key for bundle lookup
--   - context_profiles: JSON array of profile names (e.g., ["scope-control", "pr-workflow"])
--   - risk_level: Task risk classification (minimal|low|medium|high)
--
-- Related Tables:
--   - context_bundle_cache (migration 019): Stores generated bundles
--   - task_creation_context (migration 009): Stores creation-time diagnostic context
--
-- Integration Points:
--   - TaskCreationService: Generates bundles and populates these fields
--   - EphemeralWorkerService: Mounts bundles using context_bundle_id
--   - TaskPromptTemplateManager: Generates prompts using context_profiles

-- Add context bundle reference fields
ALTER TABLE tasks ADD COLUMN context_bundle_id TEXT;
ALTER TABLE tasks ADD COLUMN context_cache_key TEXT;
ALTER TABLE tasks ADD COLUMN context_profiles TEXT; -- JSON array
ALTER TABLE tasks ADD COLUMN risk_level TEXT 
  CHECK(risk_level IN ('minimal', 'low', 'medium', 'high'));

-- Create indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_tasks_context_bundle_id ON tasks(context_bundle_id);
CREATE INDEX IF NOT EXISTS idx_tasks_context_cache_key ON tasks(context_cache_key);
CREATE INDEX IF NOT EXISTS idx_tasks_risk_level ON tasks(risk_level);

-- Foreign key constraint (soft reference - bundles may be cleaned up)
-- No explicit FK constraint since bundles can be cache-evicted
-- Tasks remain valid even if bundle is no longer cached
