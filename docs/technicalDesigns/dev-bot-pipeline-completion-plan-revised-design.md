# DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED Technical Design

**Source Plan:** docs/plans/DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md
**Status:** ~85%
**Outstanding Focus:** Wire session summaries, artifact DB, and Copilot delegation tasks.

## Objectives
- Wire session summaries, artifact DB, and Copilot delegation tasks.

## Plan Snapshot

# Dev-Bot Pipeline - REVISED Path to Completion

**Date:** 2025-11-10T20:06:00Z  
**Current Status:** ~80-85% Complete (agent selection + queue integration landed 2025-11-12)  
**Estimated Time to Complete:** 1-2 weeks (down from 3-4)  
**Reference:** `docs/plans/DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md`

---

## REVISION NOTES

**Previous Assessment:** Incorrectly stated ~30% complete  
**Actual Status:** ~60-70% complete based on deep audit  
**Key Discovery:** Artifact logging, task execution, and failure handling already implemented  
**CRITICAL MISSING (RESOLVED 2025-11-12):** Intelligent agent selection (Codex vs Claude vs Copilot delegation) now handled by `AgentSelector` inside `TaskExecutionService` (`backend/src/services/taskExecution.service.ts:30-120,500-552`). Remaining gaps are artifact linking + Copilot delegation.

---

## ✅ What's ALREADY Implemented (60-70%)

### Core Infrastructure (100%)
- ✅ **DevBotsManager** (1,786 lines) - Task execution orchestration
- ✅ **TaskQueueService** (1,780 lines) - SQLite-based task persistence
- ✅ **TaskExecutionService** - Coordinates full task lifecycle
- ✅ **EphemeralWorkerService** - Docker container management
- ✅ **TaskCompletionService** - Handles task completion
- ✅ **WorkspaceSyncManager** - Git workspace management
- ✅ **DockerManager** - Container orchestration
- ✅ **ProcessManager** - Process lifecycle management

### Artifact System (80% - WORKING!)
- ✅ **Artifact Directory**: `dev-bots/artifacts/` exists and working
- ✅ **Log Capture**: stdout/stderr saved to disk
  - Format: `task-{id}-stdout-{timestamp}.log`
  - Format: `task-{id}-stderr-{timestamp}.log`
  - Evidence: 16+ log files currently in artifacts/
- ✅ **TaskExecutionService Integration**: Logs saved after each run
- ✅ **Path Resolution**: `resolveArtifactsDir()` in `utils/repoPaths.ts`
- ❌ **Missing**: session_summary.json generation
- ❌ **Missing**: Artifact linking in database (no task_artifacts table)


## Requirements
- Refer to the source plan for full requirement breakdown; key deliverables must satisfy the outstanding focus above.

## Architecture Considerations
- Define system boundaries, data flows, and integrations described in the plan.
- Ensure compatibility with the updated master design intent.

## Implementation Steps
1. Review the source plan sections relevant to this feature.
2. Break work into milestones (schema, services, UI, telemetry, etc.).
3. Update dev-monitor visibility and automation hooks as needed.
4. Add automated tests per subsystem.

## Open Questions
- Identify unresolved decisions noted in the plan.
- Capture new questions discovered during implementation.

## Next Actions
- Schedule design review with architecture owners.
- Flesh out detailed sub-designs (schema, API, UI) as required.
- Create execution tickets once this design is ratified.
