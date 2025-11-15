# Multi-Phase Plan System with Task Batches

**Date:** 2025-11-14
**Status:** Design Complete - Ready for Implementation
**Owner:** Admin Bot (Interactive Tab)

---

## Overview

A **file-first, event-driven planning system** where development plans evolve through phases, culminating in pre-formatted task batches that can be submitted incrementally to the autonomous dev-bot queue.

**Core Innovation:** Plans are living documents that progress from rough ideas to fully-researched, task-ready execution plans, managed collaboratively by the admin bot and human users.

---

## Existing System Audit

### Current Planning Implementation (Migration 021)

**Already Implemented:**
- ✅ `plans` table in database (migration 021)
- ✅ Basic types: `Plan`, `PlanProgress`, `PlanDetails` (`backend/src/types/plan.ts`)
- ✅ Core services:
  - `PlansService` - CRUD operations
  - `PlanProgressCalculator` - Real-time progress from tasks
  - `PlanStatusUpdater` - Event-driven status updates
- ✅ API routes: `backend/src/routes/dev-bots/plans.routes.ts`
- ✅ Frontend component: `PlansTabContent.tsx` (with stub data)
- ✅ Task integration: `plan_id` column in tasks table
- ✅ Event system: Task completion triggers plan status updates

**Current Status Values:**
```typescript
status: 'planning' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'
```

**What Works Well (Keep & Extend):**
- Event-driven status computation ✅
- Progress calculation from task/PR/chain states ✅
- Database schema for plans ✅
- Task linking via `plan_id` ✅
- API authentication and validation patterns ✅

**What's Missing (Add via This Design):**
- ❌ No multi-phase workflow (draft → researched → ready)
- ❌ No task batches/swimlanes
- ❌ No file-first approach (database-only)
- ❌ No admin bot integration
- ❌ No plan dependencies (blocks_on, enables)
- ❌ No incremental task submission
- ❌ No learning/retrospective capture

---

## Migration Strategy: Refactor, Don't Coexist

### ⚠️ Critical: NO Dual Systems

**Principle:** The legacy planning system MUST be completely replaced. We will NOT maintain two planning systems side-by-side.

### What to KEEP and EXTEND

| Component | Status | Action |
|-----------|--------|--------|
| `plans` table | ✅ Keep | **Extend** with new fields (status values, dependencies, batches) |
| `Plan` TypeScript interface | ✅ Keep | **Extend** with new fields (phase_metadata, task_batches) |
| `PlansService` | ✅ Keep | **Refactor** to handle file-first workflow |
| `PlanProgressCalculator` | ✅ Keep | **Extend** to include batch progress |
| `PlanStatusUpdater` | ✅ Keep | **Extend** to handle batch events |
| `plans.routes.ts` | ✅ Keep | **Add** new endpoints (validate, submit, batch submission) |
| `plan_id` in tasks | ✅ Keep | **Add** `batch_id` column alongside |

### What to REPLACE

| Component | Current Behavior | New Behavior |
|-----------|------------------|--------------|
| Status values | `'planning' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'` | **Replace** with `'draft' | 'researched' | 'ready' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'` |
| Plan creation | Direct API POST with minimal data | **Replace** with admin bot workflow (file edit → validate → submit) |
| Task creation | Manual task creation with `plan_id` | **Replace** with batch submission (pre-formatted tasks) |
| Progress tracking | Task-based only | **Add** batch-level tracking |
| Frontend | `PlansTabContent.tsx` (stub data) | **Replace** with connected component + batch UI |

### What to REMOVE Completely

| Component | Location | Reason for Removal |
|-----------|----------|-------------------|
| Stub data in UI | `frontend/src/components/monitor/tabs/PlansTabContent.tsx:29-86` | **Remove** and connect to real API |
| Database-first assumption | All services | **Replace** with file-first, DB-as-backup |
| Manual plan metadata updates | `PlansService.updatePlan()` | **Replace** with file edit workflow |

---

## Integration Points with Existing Features

### 1. Task Queue Integration

**Existing:** Tasks have `plan_id` column
**New:** Add `batch_id` column

```sql
-- Extend existing tasks table
ALTER TABLE tasks ADD COLUMN batch_id TEXT REFERENCES plan_batches(id);
CREATE INDEX idx_tasks_batch ON tasks(batch_id) WHERE batch_id IS NOT NULL;
```

**Integration:** When batch submitted, create tasks with both `plan_id` and `batch_id`:

```typescript
// NEW: Batch submission creates tasks
POST /api/plans/:planId/batches/:batchId/submit
  → Creates tasks with: { plan_id, batch_id, ...taskSpec }

// EXISTING: Task completion event
task:completed → PlanStatusUpdater checks if batch complete
```

**Prevents Duplication:** Single task table, single linkage mechanism (`plan_id` + `batch_id`).

### 2. Progress Calculation

**Existing:** `PlanProgressCalculator` computes progress from tasks
**New:** Extend to compute batch-level progress

```typescript
// EXTEND existing service
class PlanProgressCalculator {
  // EXISTING: Keep as-is
  calculateProgress(planId: string): PlanProgress { ... }

  // NEW: Add batch progress
  calculateBatchProgress(planId: string, batchId: string): BatchProgress {
    const tasks = this.getPlanTasks(planId).filter(t => t.batch_id === batchId);
    return {
      tasksTotal: tasks.length,
      tasksCompleted: tasks.filter(t => t.status === 'completed').length,
      percentComplete: ...
    };
  }
}
```

**Prevents Duplication:** Reuse existing task aggregation logic, add batch filtering.

### 3. Event System

**Existing:** `task:completed` triggers plan status update
**New:** Add `plan:batch_completed` event

```typescript
// EXISTING event handler (keep)
@on('task:completed')
async onTaskCompleted(event) {
  // Check if batch complete (NEW)
  if (task.batch_id) {
    const batchComplete = await this.checkBatchComplete(task.batch_id);
    if (batchComplete) {
      eventBus.emit('plan:batch_completed', { plan_id, batch_id });
    }
  }

  // Update plan status (EXISTING - keep)
  const newStatus = progressCalculator.computeStatus(planId);
  plansService.updatePlanStatus(planId, newStatus);
}

// NEW event handler
@on('plan:batch_completed')
async onBatchCompleted(event) {
  // Check dependent batches now ready
  // Update plan file
  // Emit notifications
}
```

**Prevents Duplication:** Single event system, add new event types, don't duplicate handlers.

### 4. API Routes

**Existing:** `backend/src/routes/dev-bots/plans.routes.ts`
**New:** Add endpoints to same file

```typescript
// File: backend/src/routes/dev-bots/plans.routes.ts

// EXISTING endpoints (keep)
router.post('/plans', ...)            // Create plan
router.get('/plans', ...)             // List plans
router.get('/plans/:id', ...)         // Get plan details
router.patch('/plans/:id', ...)       // Update plan
router.delete('/plans/:id', ...)      // Delete plan

// NEW endpoints (add to same file)
router.post('/plans/:id/validate', ...)              // Validate plan file
router.post('/plans/:id/submit', ...)                // Submit file to DB
router.post('/plans/:id/batches/:batchId/submit', ...)  // Submit batch to queue
router.post('/plans/:id/restore', ...)               // Restore from backup
```

**Prevents Duplication:** Single routes file, single router registration.

### 5. Frontend Component

**Existing:** `PlansTabContent.tsx` (with stub data)
**New:** Remove stubs, connect to API, add batch UI

```typescript
// REPLACE this file completely
// OLD: Uses STUB_PLANS constant
// NEW: Fetches from API + adds batch management UI

// Keep component structure (ListDetailLayout pattern)
// Remove: STUB_PLANS constant
// Add: API integration (usePlans hook)
// Add: Batch submission UI
```

**Prevents Duplication:** Single component, single tab, replace stubs with real data.

### 6. Database Schema

**Existing:** `plans` table (migration 021)
**New:** Extend in migration 022

```sql
-- Migration 022: Extend Plans for Multi-Phase System

-- 1. Add new status values
-- SQLite doesn't support ALTER CHECK, so we use triggers
CREATE TRIGGER validate_plan_status_extended
BEFORE INSERT ON plans
WHEN NEW.status NOT IN ('draft', 'researched', 'ready', 'in_progress', 'blocked', 'completed', 'cancelled')
BEGIN
  SELECT RAISE(ABORT, 'Invalid plan status');
END;

-- 2. Add new tables (plan_file_backups, plan_batches)
CREATE TABLE plan_file_backups (...);
CREATE TABLE plan_batches (...);

-- 3. Extend tasks table
ALTER TABLE tasks ADD COLUMN batch_id TEXT;
CREATE INDEX idx_tasks_batch ON tasks(batch_id) WHERE batch_id IS NOT NULL;
```

**Prevents Duplication:** Single migration path, extend existing tables, don't create parallel tables.

---

## Components to Remove/Refactor

### Files to REFACTOR (Not Remove)

| File | Current State | Refactoring Required |
|------|---------------|----------------------|
| `backend/src/types/plan.ts` | ✅ Exists | **Extend** with `TaskBatch`, `PlanDependency`, `PhaseMetadata` types |
| `backend/src/services/plans.service.ts` | ✅ Exists | **Refactor** CRUD to file-first workflow (read/write files, backup to DB) |
| `backend/src/services/planProgressCalculator.service.ts` | ✅ Exists | **Extend** with batch progress calculation |
| `backend/src/services/planStatusUpdater.service.ts` | ✅ Exists | **Extend** with batch completion handling |
| `backend/src/routes/dev-bots/plans.routes.ts` | ✅ Exists | **Add** validate/submit/batch endpoints |
| `frontend/src/components/monitor/tabs/PlansTabContent.tsx` | ✅ Exists (stubs) | **Replace** stubs with API, add batch UI |

### Code to REMOVE

| Location | Code to Remove | Reason |
|----------|----------------|--------|
| `PlansTabContent.tsx:29-86` | `const STUB_PLANS: Plan[] = [...]` | **Remove** - No longer needed once API connected |
| `PlansTabContent.tsx:99` | `const [plans] = useState<Plan[]>(STUB_PLANS)` | **Replace** with `const { plans } = usePlans()` |
| Any database-first assumptions | Manual metadata updates | **Replace** with file edit + validate/submit workflow |

### Database Migration Path

**Migration 021** (Existing - Keep):
- ✅ Created `plans` table
- ✅ Added indexes
- ✅ Added `plan_id` to tasks

**Migration 022** (New - Add):
- Add `plan_file_backups` table
- Add `plan_batches` table
- Add `batch_id` column to tasks
- Extend `plans.status` CHECK constraint with new values
- Add triggers for validation

**NO Migration 021B or Parallel Tables:** Single migration path forward.

---

## Preventing Feature Duplication Checklist

- [ ] **Single plans table** - Extend existing, don't create new
- [ ] **Single routes file** - Add endpoints to existing `plans.routes.ts`
- [ ] **Single service layer** - Refactor existing services, don't duplicate
- [ ] **Single event bus** - Add new event types to existing system
- [ ] **Single UI component** - Replace `PlansTabContent.tsx` stubs, don't create new tab
- [ ] **Single task linkage** - Use `plan_id` + `batch_id`, don't create alternate linkage
- [ ] **Single progress calculation** - Extend `PlanProgressCalculator`, don't create new service
- [ ] **Single API client** - Add methods to existing `api.ts`, don't create new client
- [ ] **Remove stub data** - Delete `STUB_PLANS` once API connected
- [ ] **Remove old status values** - Update CHECK constraint, don't support both

---

## Design Principles

### Event-Driven Architecture (No Cron Jobs!)

✅ **DO:** React to events (task_completed, pr_merged, batch_completed)
❌ **NEVER:** Polling, timers, cron jobs, background watchers

### File-First with Database Backup

✅ **Primary:** Plan files in `docs/plans/*.md` (YAML frontmatter + Markdown)
✅ **Backup:** Database stores versioned snapshots for recovery
❌ **NEVER:** Database as primary storage (files are source of truth)

### Admin Bot as Primary Interface

✅ **Interactive Tab:** Specialized admin assistant with pre-loaded context
✅ **Direct File Editing:** Bot edits files, validates via API, submits to DB
❌ **NEVER:** Manual YAML editing by users (admin bot guides the process)

---

## Plan Lifecycle Phases

```
draft → researched → ready → in_progress → completed
  ↓         ↓          ↓           ↓            ↓
Rough    Deep      Broken     Batches    All tasks
idea     research  into       executing  complete
                   batches
```

### Phase Definitions

| Phase | Description | Admin Bot Actions | Outputs |
|-------|-------------|-------------------|---------|
| **draft** | Rough idea captured | Initial planning, context gathering | High-level goals, scope boundaries |
| **researched** | Architecture analyzed | Deep investigation, design decisions | Implementation details, architecture diagrams |
| **ready** | Broken into task batches | Task breakdown, dependency mapping | Pre-formatted tasks ready for queue |
| **in_progress** | Tasks executing | Monitor progress, support dev-bots | Batches submitted incrementally |
| **completed** | All done | Retrospective, learning capture | Metrics, lessons learned for AI |

---

## Plan File Format

### Enhanced Schema with Task Batches

```yaml
---
plan:
  id: plan-caching-layer
  version: 4
  status: ready  # draft | researched | ready | in_progress | completed | cancelled

  # Core metadata
  title: "Implement API caching layer"
  type: feature  # feature | refactor | fix | investigation
  priority: p1   # p0 | p1 | p2 | p3

  created_at: 2025-11-14T12:00:00Z
  updated_at: 2025-11-14T16:00:00Z
  created_by: user@example.com

  # Phase-specific metadata
  phase_metadata:
    draft:
      created_at: 2025-11-14T12:00:00Z
      rough_idea: "API is slow, need caching"
    researched:
      validated_at: 2025-11-14T14:30:00Z
      researched_by: dev-bot-admin
      architecture_documented: true
    ready:
      breakdown_completed_at: 2025-11-14T16:00:00Z
      total_batches: 3
      total_tasks: 9
      estimated_total_hours: 14.5
    in_progress:
      started_at: 2025-11-15T09:00:00Z
      active_batch: batch-middleware

  # Dependencies (blocks/enables other plans)
  dependencies:
    blocks_on:
      - id: plan-redis-infra
        rationale: "Need Redis deployed before caching"
        strength: hard  # hard | soft
    enables:
      - id: plan-mobile-v2
        rationale: "Mobile app needs fast API"
        strength: soft

  # Task batches (swimlanes) - THE KEY ADDITION!
  task_batches:
    # Batch 1: Infrastructure
    - id: batch-infra
      name: "Infrastructure Setup"
      description: "Deploy and configure Redis cluster"
      order: 1
      status: pending  # pending | queued | in_progress | completed | failed
      depends_on: []   # No dependencies, can start immediately

      submitted_at: null
      completed_at: null
      task_ids: []     # Populated when submitted to queue

      tasks:
        - title: "Deploy Redis cluster (3 nodes)"
          type: implementation
          agent_preference: claude
          tags: ["infra", "cache", "redis"]
          estimated_effort_hours: 2

          success_criteria:
            - "Redis cluster running on ports 6379-6381"
            - "Health checks passing"
            - "Cluster mode enabled and verified"

          context: |
            Use existing docker-compose setup. Add Redis cluster
            with 3 nodes for high availability.
            Reference: docs/architecture/data-layer.md

        - title: "Configure Redis eviction policies"
          type: implementation
          tags: ["infra", "cache", "redis"]
          estimated_effort_hours: 1

          success_criteria:
            - "LRU eviction policy configured"
            - "Max memory set to 2GB per node"

          context: |
            Set maxmemory-policy to allkeys-lru.
            Configure maxmemory to 2GB per node.

    # Batch 2: Middleware (depends on batch 1)
    - id: batch-middleware
      name: "Cache Middleware Implementation"
      description: "Build Express middleware for caching"
      order: 2
      status: pending
      depends_on: [batch-infra]  # Can't start until infra complete

      tasks:
        - title: "Create cache middleware layer"
          type: implementation
          tags: ["backend", "cache", "middleware"]
          estimated_effort_hours: 3

          success_criteria:
            - "Middleware intercepts GET requests"
            - "Cache key generation working"
            - "TTL configuration per endpoint"

  # Milestones trigger automated actions
  milestones:
    - id: milestone-batch-infra
      name: "Infrastructure batch completed"
      trigger:
        type: batch_completion
        batch_id: batch-infra
      actions:
        - type: notify
          payload:
            message: "Redis ready, middleware can start"

  # Success criteria (measured after completion)
  success_criteria:
    - metric: "p95_latency"
      target: "<200ms"
      baseline: "800ms"
      measurement: prometheus

  # Learning objectives (for AI improvement)
  learning:
    objectives:
      - "What endpoints benefited most from caching?"
      - "Did Redis clustering improve availability?"
    capture_on_completion:
      - "Final cache hit rate: {metric:cache_hit_rate}"
      - "Latency improvement: {metric:latency_before} → {metric:latency_after}"
---

# Markdown Body - Human-Readable Narrative

## Context

Current API response times average 800ms (p95: 1.2s).

## Research Findings (Status: researched)

### Architecture Analysis
- Redis already in stack (used for sessions)
- Express middleware pattern well-established

### Key Design Decisions
- Cache key strategy: `${path}:${hash(queryParams)}`
- Eviction policy: LRU
- TTL strategy: Per-endpoint configuration

## Task Breakdown Summary

- **Total Batches:** 3
- **Total Tasks:** 9
- **Estimated Effort:** 14.5 hours
- **Dependencies:** batch-infra → batch-middleware → batch-validation

## Retrospective Notes

(Populated after completion for AI learning)
```

---

## Container Configuration (Admin Bot)

### Volume Mounts

**File:** `backend/src/services/interactiveSessionOrchestrator.ts`

```typescript
// Mount plans directory for admin bot
const plansPath = path.join(this.repoRoot, 'docs/plans');
if (fs.existsSync(plansPath)) {
  builder.volume(plansPath, '/workspace/docs/plans', 'rw');
  logger.info({
    category: 'system',
    action: 'plans_directory_mounted',
    message: `Mounted plans directory: ${plansPath}`
  });
}
```

### Environment Variables

```typescript
private buildEnv(session: InteractiveSessionRecord): Record<string, string> {
  return {
    // ... existing vars ...

    // Plan management context
    PLANS_DIR: '/workspace/docs/plans',
    PLANS_API_URL: this.config.productionApiBaseUrl + '/api/plans',
    ADMIN_BOT_MODE: 'true',
  };
}
```

---

## API Endpoints

### 1. Validate Plan

```typescript
POST /api/plans/:planId/validate

Response:
{
  "valid": false,
  "errors": [
    {
      "line": 23,
      "field": "plan.dependencies.blocks_on[0]",
      "message": "Plan 'plan-redis-999' does not exist",
      "suggestion": "Check plan ID or remove from blocks_on array",
      "severity": "error"
    }
  ]
}
```

### 2. Submit Plan (Save Backup)

```typescript
POST /api/plans/:planId/submit
Body: { message: "Completed architecture research" }

Response:
{
  "success": true,
  "version": 4,
  "checksum": "abc123...",
  "message": "Plan submitted and backed up successfully"
}
```

### 3. Submit Task Batch to Queue

```typescript
POST /api/plans/:planId/batches/:batchId/submit

Workflow:
1. Validate batch dependencies met
2. Create tasks in queue (linked to plan via plan_id)
3. Update batch status to 'queued'
4. Update plan status to 'in_progress' if first batch
5. Emit events for tracking

Response:
{
  "success": true,
  "data": {
    "plan_id": "plan-caching-layer",
    "batch_id": "batch-infra",
    "batch_name": "Infrastructure Setup",
    "tasks_created": 3,
    "task_ids": ["task-abc", "task-def", "task-ghi"]
  }
}
```

### 4. Restore from Backup

```typescript
POST /api/plans/:planId/restore
Body: { version?: number }  // Omit for latest

Response:
{
  "success": true,
  "restored_version": 3,
  "restored_at": 1731614000000,
  "checksum": "def456..."
}
```

---

## Event-Driven Progress Tracking

### Event Flow

```
1. Task completed
   ↓
2. Event: task:completed
   ↓
3. Check if batch complete (all tasks done)
   ↓
4. Event: plan:batch_completed
   ↓
5. Check dependent batches (dependencies met?)
   ↓
6. Update plan file (batch status, ready batches)
   ↓
7. Submit to DB (backup with version)
   ↓
8. WebSocket broadcast to UI
   ↓
9. UI shows "Batch X ready to submit"
```

### Event Handlers

```typescript
@on('task:completed')
async onTaskCompleted(event: TaskCompletedEvent) {
  const task = await db.getTask(event.task_id);
  if (!task.plan_id || !task.batch_id) return;

  // Check if batch complete
  const batchTasks = await db.query(`
    SELECT * FROM tasks
    WHERE plan_id = ? AND batch_id = ?
  `, [task.plan_id, task.batch_id]);

  const allComplete = batchTasks.every(t =>
    t.status === 'completed' || t.status === 'cancelled'
  );

  if (allComplete) {
    await this.completeBatch(task.plan_id, task.batch_id);
  }
}

@on('plan:batch_completed')
async completeBatch(planId: string, batchId: string) {
  // 1. Update batch status in plan file
  // 2. Check dependent batches now ready
  // 3. Check if all batches complete
  // 4. Emit plan:batch_completed event
  // 5. Check milestones
}
```

---

## Admin Bot Workflow

### Phase 1: Draft → Researched

```bash
# User: "Research the caching implementation thoroughly"

# Admin bot investigates:
1. Read docs/architecture/
2. Analyze existing codebase
3. Document findings in plan file
4. Update status: researched

# Update plan file
nano docs/plans/plan-caching-layer.md
# Add research findings to markdown body

# Validate
curl -X POST $PLANS_API_URL/plan-caching-layer/validate

# Submit
curl -X POST $PLANS_API_URL/plan-caching-layer/submit \
  -d '{"message": "Completed architecture research"}'
```

### Phase 2: Researched → Ready

```bash
# User: "Break this down into task batches"

# Admin bot creates task_batches in YAML frontmatter
nano docs/plans/plan-caching-layer.md
# Add task_batches with:
# - Infrastructure batch (3 tasks)
# - Middleware batch (4 tasks)
# - Validation batch (2 tasks)

# Update status to ready
sed -i 's/status: researched/status: ready/' docs/plans/plan-caching-layer.md

# Validate batch format
curl -X POST $PLANS_API_URL/plan-caching-layer/batches/batch-infra/validate

# Submit when ready
curl -X POST $PLANS_API_URL/plan-caching-layer/submit \
  -d '{"message": "Plan broken down into 3 batches, ready for execution"}'
```

### Phase 3: Submit Batch to Queue

```bash
# User: "Submit the infrastructure batch"

curl -X POST $PLANS_API_URL/plan-caching-layer/batches/batch-infra/submit
# → Creates 3 tasks in queue
# → Links tasks to plan via plan_id
# → Updates batch status to 'queued'
# → Updates plan status to 'in_progress'
```

### Phase 4: Monitor Progress

```bash
# Check which batches are ready to submit
curl $PLANS_API_URL/plan-caching-layer | \
  jq '.data.task_batches[] | select(.status=="pending") | select(.depends_on | all(. in ready_batch_ids))'

# View overall progress
curl $PLANS_API_URL/plan-caching-layer | jq '.data.progress'
```

---

## Database Schema

### Plans Table

```sql
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  markdown_ref TEXT,  -- Path to plan file

  plan_type TEXT NOT NULL CHECK(plan_type IN ('feature', 'refactor', 'fix', 'investigation')),
  priority TEXT NOT NULL CHECK(priority IN ('p0', 'p1', 'p2', 'p3')),
  status TEXT NOT NULL CHECK(status IN ('draft', 'researched', 'ready', 'in_progress', 'blocked', 'completed', 'cancelled')),

  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  cancelled_at INTEGER,

  created_by TEXT,
  assigned_to TEXT,

  success_criteria TEXT,        -- JSON array
  scope_boundaries TEXT,         -- JSON object
  estimated_effort_hours REAL,

  metadata TEXT                  -- JSON object
);

CREATE INDEX idx_plans_status ON plans(status) WHERE status NOT IN ('completed', 'cancelled');
CREATE INDEX idx_plans_priority ON plans(priority);
```

### Plan File Backups

```sql
CREATE TABLE plan_file_backups (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  version INTEGER NOT NULL,

  content TEXT NOT NULL,      -- Full YAML + markdown
  checksum TEXT NOT NULL,     -- SHA256 for integrity

  created_at INTEGER NOT NULL,
  created_by TEXT,

  UNIQUE(plan_id, version)
);

CREATE INDEX idx_backups_plan_version ON plan_file_backups(plan_id, version DESC);
```

### Plan Batches (Synced from File)

```sql
CREATE TABLE plan_batches (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id),

  name TEXT NOT NULL,
  description TEXT,
  order_num INTEGER,

  status TEXT CHECK(status IN ('pending', 'queued', 'in_progress', 'completed', 'failed')),

  submitted_at INTEGER,
  completed_at INTEGER,

  task_count INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0
);

CREATE INDEX idx_plan_batches_plan ON plan_batches(plan_id);
```

### Tasks Extension

```sql
-- Add to existing tasks table
ALTER TABLE tasks ADD COLUMN plan_id TEXT REFERENCES plans(id);
ALTER TABLE tasks ADD COLUMN batch_id TEXT REFERENCES plan_batches(id);

CREATE INDEX idx_tasks_plan ON tasks(plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX idx_tasks_batch ON tasks(batch_id) WHERE batch_id IS NOT NULL;
```

---

## UI Components

### Batch Management View

```tsx
function PlanBatchesView({ plan }: { plan: PlanDetails }) {
  const batches = plan.task_batches || [];

  const canSubmitBatch = (batch: TaskBatch) => {
    const depsComplete = (batch.depends_on || []).every(depId => {
      const depBatch = batches.find(b => b.id === depId);
      return depBatch?.status === 'completed';
    });

    return batch.status === 'pending' && depsComplete;
  };

  return (
    <div className="space-y-4">
      {batches.map((batch, idx) => (
        <Card key={batch.id}>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>{idx + 1}. {batch.name}</CardTitle>
                <CardDescription>{batch.description}</CardDescription>
              </div>

              <div className="flex gap-2">
                <Badge variant={getBatchStatusVariant(batch.status)}>
                  {batch.status}
                </Badge>

                {canSubmitBatch(batch) && (
                  <Button size="sm" onClick={() => submitBatch(batch.id)}>
                    <Play className="mr-1 h-3 w-3" />
                    Submit to Queue
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="text-sm text-muted-foreground">
              {batch.tasks.length} tasks •
              {batch.tasks.reduce((sum, t) => sum + (t.estimated_effort_hours || 0), 0)}h
            </div>

            {batch.status === 'queued' && (
              <TaskProgressBar taskIds={batch.task_ids} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

---

## Admin Bot Context Document

**File:** `docs/context/admin-bot-plan-management.md`

Comprehensive guide for the admin bot covering:
- Plan file format and schema
- Workflow for each phase transition
- API commands (validate, submit, restore)
- Best practices
- Example sessions
- Troubleshooting

See full document in implementation.

---

## Success Metrics

### Development Velocity
- **Time from idea to task queue:** <2 hours (with admin bot)
- **Task batch submission:** <1 minute per batch
- **Plan phase progression:** Clear checkpoints and validation

### Quality
- **Task validation:** 100% validated before queue submission
- **Dependency tracking:** Zero circular dependencies
- **File integrity:** Automatic backup and restore capability

### Learning
- **Retrospective capture:** 100% of completed plans
- **Metric tracking:** Automated via milestones
- **AI improvement:** Structured data for learning engine

---

## Implementation Phases

### Phase 1: Core Schema & File Management (2 days)
- Database migrations (plans, plan_batches, tasks extension)
- File parsing/serialization utilities
- Backup/restore system

### Phase 2: API Endpoints (2 days)
- Validate endpoint
- Submit endpoint
- Batch submission endpoint
- Restore endpoint

### Phase 3: Event System (2 days)
- Event handlers (task:completed, batch:completed)
- Progress tracking integration
- Milestone checking

### Phase 4: Admin Bot Integration (2 days)
- Container volume mounts
- Context document creation
- CLI prompt injection
- Workflow documentation

### Phase 5: UI Components (2 days)
- Plan batch viewer
- Submit batch controls
- Progress visualization
- Real-time updates (WebSocket)

**Total: 10 days**

---

## Deployment Checklist

- [ ] Database migrations run successfully
- [ ] Plan files directory mounted to admin bot container
- [ ] Context document available at `/workspace/docs/context/`
- [ ] API endpoints validated and tested
- [ ] Event handlers registered
- [ ] UI components integrated
- [ ] Admin bot system prompt includes plan management
- [ ] Documentation complete

---

## Future Enhancements

### Advanced Features (Post-MVP)
- Plan templates for common patterns
- Batch splitting/merging
- Dependency graph visualization
- Automated task generation from architecture analysis
- ML-powered effort estimation

### Integration Points
- GitHub Projects sync
- Slack notifications on batch completion
- Export to roadmap formats (PDF, Gantt chart)
- Calendar integration for milestone dates

---

## Conclusion

This multi-phase plan system provides an **elegant, event-driven workflow** for managing development work. Plans evolve from rough ideas to fully-researched, task-ready execution plans, with the admin bot guiding users through each phase.

**Key Innovations:**
- File-first with database backup (not database-first)
- Pre-formatted task batches (ready for queue)
- Incremental submission (prevent queue flooding)
- Event-driven progress tracking (no polling)
- Admin bot as primary interface (specialized assistant)

**Ready for implementation.**
