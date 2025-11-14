# Integrated Planning System - Technical Design

**Date:** 2025-11-14
**Status:** Design Phase
**Priority:** P1 - High Value

---

## Problem Statement

**Current State**: Plans exist as markdown files in `docs/plans/` that get out of date between creation and deletion. No way to track:
- Which tasks belong to which plan
- Actual plan progress vs documented progress
- Blockers that emerge during implementation
- Plan status integrated with task queue and PR workflow

**Impact**:
- Plans say "80% complete" but actual status unknown without manual audit
- No visibility into plan progress in the app UI
- Documentation lifecycle (plan → implement → delete) loses historical context
- Cannot prioritize work across multiple active plans

**Goal**: Create a planning system that:
1. **Never gets out of date** - Status derived from actual task/PR state
2. **Integrates with existing workflow** - Task queue, PR tracking, chain tracking
3. **Follows design philosophy** - Event-driven, database as source of truth, minimalist UI
4. **Enables prioritization** - See all active plans and their real-time status

---

## Solution Overview

### Core Concept: Database-Backed Plans with Task Linking

Plans become **first-class entities** in the SQLite database, linked to tasks via `task.parent_initiative` field (already exists). Plan status is **computed automatically** from task statuses.

```
Plan (DB record)
├─ Implementation Tasks (linked via parent_initiative)
│  ├─ Task A (pending)
│  ├─ Task B (running) → spawns chain
│  └─ Task C (completed) → PR merged
├─ PR Status (aggregated from task PRs)
└─ Computed Metrics
   ├─ Progress: 66% (2/3 tasks complete)
   ├─ Status: IN_PROGRESS
   └─ Blockers: Task B chain blocked (escalated)
```

**Key Innovation**: Status is **derived**, never manually updated. Plans can't get out of date because they reflect real task/PR/chain state.

---

## Database Schema

### New Table: `plans`

```sql
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  markdown_ref TEXT,              -- Optional reference to markdown doc in docs/plans/

  -- Categorization
  plan_type TEXT NOT NULL,        -- 'feature', 'refactor', 'fix', 'investigation'
  priority TEXT NOT NULL,         -- 'p0', 'p1', 'p2', 'p3'

  -- Lifecycle
  status TEXT NOT NULL,           -- COMPUTED: 'planning', 'in_progress', 'blocked', 'completed', 'cancelled'
  created_at INTEGER NOT NULL,
  started_at INTEGER,             -- When first task started
  completed_at INTEGER,           -- When all tasks completed
  cancelled_at INTEGER,

  -- Ownership & tracking
  created_by TEXT,                -- User who created plan
  assigned_to TEXT,               -- Team/person responsible

  -- Goals & scope
  success_criteria TEXT,          -- JSON array of criteria
  scope_boundaries TEXT,          -- JSON object: {mustNotChange, mustNotAffect}
  estimated_effort_hours INTEGER,

  -- Metadata
  metadata TEXT                   -- JSON for extensibility
);

CREATE INDEX idx_plans_status ON plans(status);
CREATE INDEX idx_plans_priority ON plans(priority);
CREATE INDEX idx_plans_type ON plans(plan_type);
```

### Enhanced Task Table (Already Has Most Fields)

Existing fields used:
- `parent_initiative` → Plan ID (rename to `plan_id` for clarity)
- `chain_id`, `chain_status` → Already tracked
- `pr_number`, `followup_tasks` → Already tracked
- `blockers`, `risks` → Already tracked

New computed field:
- `plan_contribution` → What % of plan this task represents (computed)

---

## Plan Status Computation (Event-Driven)

### Status Derivation Rules

Plan status is **computed on-demand** from task states:

```typescript
function computePlanStatus(plan: Plan, tasks: Task[]): PlanStatus {
  if (tasks.length === 0) return 'planning';

  const taskStatuses = tasks.map(t => t.status);

  // Blocked: Any task has blocked chain
  if (tasks.some(t => t.chain_status === 'blocked')) {
    return 'blocked';
  }

  // Completed: All tasks completed/cancelled
  if (taskStatuses.every(s => s === 'completed' || s === 'cancelled')) {
    return 'completed';
  }

  // In Progress: At least one task running/active
  if (taskStatuses.some(s => s === 'running' || s === 'pending')) {
    return 'in_progress';
  }

  return 'planning';
}
```

### Progress Calculation

```typescript
interface PlanProgress {
  tasksTotal: number;
  tasksCompleted: number;
  tasksPending: number;
  tasksRunning: number;
  tasksFailed: number;

  prsTotal: number;
  prsMerged: number;
  prsOpen: number;
  prsBlocked: number;

  chainsActive: number;
  chainsBlocked: number;

  percentComplete: number;      // tasksCompleted / tasksTotal
  estimatedHoursRemaining: number;
}
```

---

## Integration with Existing Systems

### 1. Task Queue Integration

**Create Task with Plan Link**:
```typescript
await taskQueue.createTask({
  title: "Implement agent selection logic",
  plan_id: "plan-agent-selection-2025",  // Link to plan
  type: "implementation",
  // ... other fields
});
```

**Query Tasks by Plan**:
```typescript
const planTasks = await taskQueue.getTasksByPlan(planId);
const planProgress = computePlanProgress(plan, planTasks);
```

### 2. PR Tracking Integration

Plans automatically track PR status via linked tasks:

```typescript
interface PlanPRStatus {
  prs: Array<{
    number: number;
    taskId: string;
    status: 'open' | 'merged' | 'closed';
    mergeGatesStatus: PRMergeGateStatus;  // From existing PR workflow
    chainStatus: ChainStats;               // From existing chain tracker
  }>;

  blockingIssues: string[];  // Aggregated from all PR merge gates
}
```

### 3. Chain Tracking Integration

Plans inherit chain blocking from tasks:

```typescript
interface PlanChainStatus {
  activeChains: number;
  blockedChains: BlockedChain[];  // From existing ChainTrackerService

  // Alert when chains blocked
  escalationNeeded: boolean;
  escalationReason: string;
}
```

---

## API Endpoints

### Plan Management

```typescript
// Create plan (human-initiated or from markdown)
POST /api/dev-bots/plans
{
  title: "Agent Selection System",
  description: "Implement intelligent agent routing",
  plan_type: "feature",
  priority: "p0",
  success_criteria: ["Codex stops failing at code edits", "Claude only for implementation"],
  markdown_ref: "docs/plans/INTELLIGENT_AGENT_SELECTION.md"
}

// Get plan with computed status
GET /api/dev-bots/plans/:id
→ {
  id, title, description,
  status: "in_progress",  // COMPUTED
  progress: {
    tasksTotal: 5,
    tasksCompleted: 2,
    percentComplete: 40,
    // ... full progress object
  },
  tasks: [...],
  prs: [...],
  chains: {...}
}

// List all plans
GET /api/dev-bots/plans?status=in_progress&priority=p0
→ [{ id, title, status, progress, ... }]

// Update plan (metadata only - status is computed)
PATCH /api/dev-bots/plans/:id
{
  priority: "p1",
  assigned_to: "backend-team"
}

// Cancel plan
POST /api/dev-bots/plans/:id/cancel
```

### Task Creation with Plan Link

```typescript
POST /api/dev-bots/tasks
{
  title: "Implement TaskClassifier",
  plan_id: "plan-agent-selection-2025",  // AUTO-LINK to plan
  // ... rest of task fields
}
```

---

## UI Components

### 1. Plans Panel (New)

Minimalist panel following design philosophy:

```
┌─ ACTIVE PLANS ─────────────────────────────┐
│ 🔴 P0: Agent Selection         40% │ 2/5   │ ← Priority, progress, task count
│    └─ 🚫 Chain blocked: Task B              │ ← Blocker alert
│                                              │
│ 🟡 P1: Context Management      85% │ 17/20 │
│    └─ ✅ PR #234 merged                     │ ← Recent success
│                                              │
│ 🟢 P2: Frontend Polish         0%  │ 0/3   │
│    └─ ⏸️  Planning (no tasks started)       │
└──────────────────────────────────────────────┘
```

**Features**:
- Status derived from tasks/PRs/chains (never stale)
- Click to expand task list
- One-click "Create Task for Plan"
- Blocker alerts surface immediately

### 2. Plan Detail View

```
┌─ Agent Selection System (P0) ────────────────┐
│ Status: IN PROGRESS (40%)                     │
│ Progress: 2/5 tasks │ 1 PR merged │ 1 blocked │
│                                                │
│ BLOCKERS:                                      │
│ • Task B chain blocked (4 fix attempts)       │
│   → Escalated for manual review               │
│                                                │
│ TASKS:                                         │
│ ✅ Task A: TaskClassifier (PR #230 merged)    │
│ 🔄 Task B: AgentSelector (chain blocked)      │
│ ⏳ Task C: Copilot delegation (pending)       │
│ ⏳ Task D: Integration tests (pending)        │
│ ⏳ Task E: Documentation (pending)            │
│                                                │
│ [Create New Task]  [Mark Plan Complete]       │
└────────────────────────────────────────────────┘
```

### 3. Task Detail Enhancement

Add plan context to existing task view:

```
┌─ Task: Implement AgentSelector ───────────────┐
│ Plan: Agent Selection System (P0)             │ ← NEW: Plan link
│ Contribution: 20% of plan completion          │ ← NEW: Impact
│ ...                                            │
└────────────────────────────────────────────────┘
```

---

## Event-Driven Updates

Plan status updates automatically on these events:

| Event | Trigger | Update |
|-------|---------|--------|
| Task completed | `TaskCompletionService` | Recompute plan progress |
| PR merged | `PRMonitor` webhook | Update PR count, check if plan complete |
| Chain blocked | `ChainTrackerService` | Set plan status to blocked |
| Task created | `TaskCreationService` | Link to plan, update task count |
| Chain unblocked | Manual intervention | Clear blocked status |

**Implementation**: Add `PlanStatusUpdater` service that subscribes to these events.

---

## Migration Strategy

### Phase 1: Schema & Backend (1 week)

1. **Database Migration**
   - Create `plans` table
   - Rename `parent_initiative` → `plan_id` (backward compatible)
   - Add indexes

2. **Core Services**
   - `PlansService`: CRUD operations, status computation
   - `PlanProgressCalculator`: Derive metrics from tasks/PRs/chains
   - `PlanStatusUpdater`: Event-driven status updates

3. **API Endpoints**
   - Plan management endpoints
   - Enhance task creation to accept `plan_id`
   - Plan query/filter endpoints

### Phase 2: UI Integration (3-4 days)

1. **Plans Panel Component**
   - List active plans with real-time status
   - Click to expand/collapse task list
   - Create task for plan

2. **Plan Detail View**
   - Full plan status, progress, blockers
   - Task list with links
   - Plan editing (metadata only)

3. **Task Form Enhancement**
   - Dropdown to select plan
   - Show plan context when selected

### Phase 3: Markdown Sync (2 days)

1. **Markdown Import**
   - Parse existing plan markdown files
   - Create plan records from structured content
   - Link to original markdown for reference

2. **Markdown Export** (optional)
   - Generate plan markdown from DB
   - Useful for documentation/handoff

### Phase 4: Historical Plans (Future)

- Archive completed plans (separate table or status)
- Plan analytics (not in minimalist UI, API only)
- Plan templates

---

## Success Criteria

1. **Never Out of Date**: Plan status computed from task/PR/chain state (not manually updated)
2. **Event-Driven**: Status updates automatically on task/PR/chain events
3. **Minimalist UI**: Plans panel shows status, blockers, progress only (no analytics dashboard)
4. **Database as Source of Truth**: SQLite stores plan state, UI derives from DB
5. **Integrated Workflow**: Plans visible in task creation, task detail, queue panel

---

## Example: Migrating "Dev-Bot Pipeline Completion Plan"

### Before (Markdown)
```markdown
# Dev-Bot Pipeline Completion Plan
**Status:** ~80-85% Complete (manually updated)
**Tasks:**
- ✅ Core Infrastructure (done)
- ❌ Database Schema (missing)
- ❌ Artifact System (20% done)
```

### After (Database)
```sql
INSERT INTO plans VALUES (
  'plan-devbot-pipeline-2025',
  'Dev-Bot Pipeline Completion',
  'Complete missing pieces of dev-bot automation pipeline',
  'docs/plans/DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md',
  'feature',
  'p0',
  'in_progress',  -- COMPUTED from task statuses
  1699564800,     -- created_at
  1699565000,     -- started_at (when first task started)
  NULL,           -- completed_at (not done)
  NULL,           -- cancelled_at
  'jdubz',
  'backend-team',
  '["All dev-bots can execute tasks", "Artifacts properly logged", "Analytics API working"]',
  '{"mustNotChange": ["task queue", "PR workflow"]}',
  40,             -- estimated hours
  '{}'
);

-- Link existing/new tasks
UPDATE tasks SET plan_id = 'plan-devbot-pipeline-2025'
WHERE title LIKE '%artifact%' OR title LIKE '%database schema%';

-- Query real-time status
SELECT * FROM v_plan_status WHERE id = 'plan-devbot-pipeline-2025';
→ {
  status: "in_progress",
  progress: {
    tasksTotal: 12,
    tasksCompleted: 9,
    tasksPending: 2,
    tasksRunning: 1,
    percentComplete: 75,  -- ACTUAL computed status, not manually updated!
  }
}
```

**Result**: Plan status is **always accurate** because it's computed from actual task state, not manually maintained markdown.

---

## Backward Compatibility

- Existing `parent_initiative` field works as `plan_id`
- Tasks without `plan_id` still work (standalone tasks)
- Existing task queue, PR workflow, chain tracking unchanged
- Plans are optional (don't need plan for every task)

---

## Future Enhancements (Not P1)

1. **Plan Templates**: Reusable plan structures for common work
2. **Plan Dependencies**: Plan A blocks Plan B
3. **Plan Analytics API**: Success rates, velocity, MTTR (API only, not UI)
4. **Plan Approval Workflow**: Require approval before starting plan
5. **Plan Cost Tracking**: Actual vs estimated effort

---

## References

- **Existing Task Queue**: `backend/src/services/taskQueue.sqlite.ts`
- **Chain Tracking**: `backend/src/services/chainTracker.service.ts`
- **PR Workflow**: `docs/technicalDesigns/pr-self-healing-and-resilience.md`
- **Master Design Intent**: `docs/architecture/master-design-intent.md`
- **Current Plans**: `docs/plans/DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md`

---

**Next Steps**: Approve design, then start Phase 1 (schema + backend services).
