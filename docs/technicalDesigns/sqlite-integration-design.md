# sqlite-integration Technical Design

**Source Plan:** docs/plans/sqlite-integration.md
**Status:** Mostly Complete
**Outstanding Focus:** Finish /dev-bots/tasks/completed endpoint + regression suite.

## Objectives
- Finish /dev-bots/tasks/completed endpoint + regression suite.

## Plan Snapshot

# SQLite Queue Integration Plan

## Current Status

✅ **COMPLETED**:
- SQLite queue service implementation (`taskQueue.sqlite.ts`)
- Migration script (`taskQueue.migration.ts`)
- Conservative timeout strategy
- Comprehensive documentation
- DevBotsManager + task execution flow now delegate to `TaskQueueService` (`backend/src/services/devBotsManager.ts`, `backend/src/services/taskExecution.service.ts`)

🔄 **IN PROGRESS**:
- Queue-aware `/dev-bots/tasks/completed` response (see TODO in `backend/src/routes/dev-bots.routes.ts:1004`)

⏳ **PENDING**:
- Final API regression tests covering the queue-backed routes
- Integration test harness that exercises the Vitest + TaskQueue happy-path end to end

---

## Integration Steps

### Phase 1: Preparation ✅ DONE

1. ✅ Implement TaskQueueService with SQLite
2. ✅ Create migration script
3. ✅ Document timeout handling strategy
4. ✅ Add queue service initialization to DevBotsManager

### Phase 2: DevBotsManager Refactoring (IN PROGRESS)

The DevBotsManager needs significant refactoring to use the queue service instead of in-memory arrays. Here's what needs to change:

#### Current State (Lines 564-570):
```typescript
// Task management
private taskQueue: Task[] = [];
private activeTasks = new Map<string, Task>();
private completedTasks: Task[] = [];
private taskIdCounter = 1;


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
