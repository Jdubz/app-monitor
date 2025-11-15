# Multi-Phase Plan System with Task Batches

**Date:** 2025-11-14
**Status:** Design Complete - Ready for Implementation
**Owner:** Admin Bot (Interactive Tab)

---

## Overview

A **file-first, event-driven planning system** where development plans evolve through phases, culminating in pre-formatted task batches that can be submitted incrementally to the autonomous dev-bot queue.

**Core Innovation:** Plans are living documents that progress from rough ideas to fully-researched, task-ready execution plans, managed collaboratively by the admin bot and human users.

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
