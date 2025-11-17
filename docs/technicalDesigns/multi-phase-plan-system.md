# Multi-Phase Plan System with Task Batches

**Date:** 2025-11-14 (Updated: 2025-11-17)
**Status:** Design Complete - Ready for Implementation
**Owner:** Admin Bot (Interactive Tab)

---

## ⚠️ CRITICAL IMPLEMENTATION NOTES

**This is a complete system replacement - not an incremental upgrade:**

1. **NO BACKWARDS COMPATIBILITY** - Existing plan data can be discarded
2. **NO LEGACY CODE** - Delete old implementations immediately, don't leave behind deprecated functions
3. **NO TECHNICAL DEBT** - Clean implementation from scratch, use existing code structure only as reference
4. **DELETE IMMEDIATELY:**
   - Old status values and their handling code
   - Database-first CRUD patterns in services
   - Stub data in frontend components
   - Any manual plan update workflows
5. **AUTONOMY FIRST** - This planning system is the primary human input point. The admin bot drives the workflow, humans provide high-level direction only.

---

## Overview

A **file-first, event-driven planning system** where development plans evolve through phases, culminating in pre-formatted task batches that can be submitted incrementally to the autonomous dev-bot queue.

**Core Innovation:** Plans are living documents that progress from rough ideas to fully-researched, task-ready execution plans, managed **autonomously by the admin bot** with minimal human intervention.

**Autonomy Model:** Humans provide high-level goals ("build a caching layer"), admin bot handles all planning work (research, breakdown, task creation, batch submission). This is the **primary control interface** for the entire system.

---

## Existing Integration Analysis

### ✅ What's Already Integrated (TO LEVERAGE)

1. **Task Completion Hooks** - Location: `taskQueue.sqlite.ts`
   ```typescript
   // Line ~660: Task creation
   if (task.plan_id) {
     planStatusUpdater?.onTaskCreated(task.id)
   }
   
   // Line ~1040: Task completion
   planStatusUpdater?.onTaskStatusChange(taskId)
   
   // Line ~1140: Task failure
   planStatusUpdater?.onTaskStatusChange(taskId)
   ```
   **Action:** KEEP these hooks, extend to call new batch-aware event handlers

2. **Database Schema** - Tables: `plans`, `tasks` with `plan_id` column
   - Index: `idx_tasks_plan_id` for efficient queries
   **Action:** KEEP tables, extend with batch columns in Migration 022

3. **Transaction-Safe Updates** - Pattern in `plans.service.ts`
   - Lifecycle timestamp management (started_at, completed_at)
   **Action:** KEEP pattern, use in new services

### ❌ What's NOT Implemented (Original Implementor Claims)

1. **NO Batch Awareness**
   - Tasks table has NO `batch_id` column
   - No batch-level progress tracking
   - No batch completion events

2. **NO File Integration**
   - Plan status updates ONLY to database
   - No plan file auto-updates
   - No file watcher

3. **NO Event Emissions for Batches**
   - Only internal method calls
   - No `batch:completed` events
   - No `plan:batch_completed` events

### Integration Strategy

**KEEP & EXTEND:**
- Task completion hooks in `taskQueue.sqlite.ts`
- Database transaction patterns
- Lifecycle timestamp management

**DELETE & REPLACE:**
- `plans.service.ts` → `planFileService.ts` + `planDatabaseService.ts`
- `planProgressCalculator.service.ts` → `planBatchTracker.ts`
- `planStatusUpdater.service.ts` → `planEventHandlers.ts`
- `planStatusUpdater.singleton.ts` → Delete (use new event bus pattern)

### Task Completion Tracking: What Changes

**Current Implementation (taskQueue.sqlite.ts):**
```typescript
// LEVERAGE: These hook points already exist and work correctly
async markTaskCompleted(taskId: string) {
  // Transaction updates task status
  const updateTransaction = this.transaction(() => {
    // ... update task status to 'completed' ...
  });
  
  // EXISTING HOOK (KEEP):
  const planStatusUpdater = getPlanStatusUpdater();
  planStatusUpdater?.onTaskStatusChange(taskId);
}
```

**What to LEVERAGE:**
1. ✅ Hook locations in `taskQueue.sqlite.ts`:
   - Line ~660: `createTask()` - calls `onTaskCreated()`
   - Line ~1040: `markTaskCompleted()` - calls `onTaskStatusChange()`
   - Line ~1140: `markTaskFailed()` - calls `onTaskStatusChange()`
2. ✅ Transaction patterns for safe status updates
3. ✅ Database query patterns for getting tasks by plan_id

**What to UPDATE (Extend, Don't Replace):**
```typescript
// In taskQueue.sqlite.ts - EXTEND existing completion handler
async markTaskCompleted(taskId: string) {
  // ... existing transaction code (KEEP) ...
  
  // EXISTING HOOK (KEEP):
  const planStatusUpdater = getPlanStatusUpdater();
  planStatusUpdater?.onTaskStatusChange(taskId);
  
  // NEW: Add batch completion check
  const task = this.getTaskById(taskId);
  if (task?.batch_id) {
    // NEW SERVICE: Check if batch is now complete
    const planEventHandlers = getPlanEventHandlers();
    await planEventHandlers.onTaskCompleted(taskId);
  }
}
```

**What to DELETE:**
1. ❌ `getPlanStatusUpdater()` calls - Replace with new event handler
2. ❌ `planStatusUpdater.service.ts` - Delete entire file
3. ❌ `planStatusUpdater.singleton.ts` - Delete entire file
4. ❌ Direct database updates in old services - Use new file-first flow

**New Service Integration:**
```typescript
// NEW FILE: planEventHandlers.ts
export class PlanEventHandlers {
  async onTaskCompleted(taskId: string) {
    const task = await db.getTask(taskId);
    if (!task.batch_id) return;
    
    // 1. Check if batch complete
    const batchComplete = await this.checkBatchComplete(task.batch_id);
    
    if (batchComplete) {
      // 2. Update batch status in DATABASE ONLY (not file)
      await db.updateBatch(task.batch_id, { 
        status: 'completed',
        completed_at: Date.now()
      });
      
      // 3. NO file updates - file stays immutable after import
      
      // 4. Emit event for UI updates
      eventBus.emit('plan:batch_completed', {
        plan_id: task.plan_id,
        batch_id: task.batch_id
      });
      
      // 5. Check if all batches complete → plan complete
      const allBatchesComplete = await this.checkAllBatchesComplete(task.plan_id);
      if (allBatchesComplete) {
        await db.updatePlan(task.plan_id, { status: 'completed' });
        eventBus.emit('plan:completed', { plan_id: task.plan_id });
      }
    }
  }
  
  private async checkBatchComplete(batchId: string): Promise<boolean> {
    const tasks = await db.getTasksByBatch(batchId);
    return tasks.every(t => 
      t.status === 'completed' || t.status === 'cancelled'
    );
  }
}
```

**Migration 022 - Add batch tracking to tasks:**
```sql
-- Required for batch completion detection
ALTER TABLE tasks ADD COLUMN batch_id TEXT;
CREATE INDEX idx_tasks_batch ON tasks(batch_id) WHERE batch_id IS NOT NULL;
```

### Plan File Immutability After Batch Import

**Critical Design Decision:** Plan files are **append-only** after batch import.

**Rules:**
1. Once a batch is imported to the task queue, that batch section becomes **immutable**
2. Attempting to edit an imported batch fails validation with explicit error
3. Plan file does NOT track completion status - database is the only source for execution state
4. Plan file is for planning only, database tracks execution

**Validation Logic:**

```typescript
// In planValidationService.ts
async validatePlanSave(planId: string, fileContent: string): Promise<ValidationResult> {
  const parsedPlan = parseYAML(fileContent);
  const dbPlan = await db.getPlan(planId);
  
  // Check for modifications to imported batches
  for (const batch of parsedPlan.task_batches) {
    const dbBatch = await db.getBatch(batch.id);
    
    if (dbBatch?.status !== 'pending') {
      // Batch has been imported - check if it was modified
      const originalBatch = await getOriginalBatchFromDB(batch.id);
      
      if (!isDeepEqual(batch, originalBatch)) {
        return {
          valid: false,
          errors: [{
            field: `task_batches.${batch.id}`,
            message: `Batch "${batch.name}" has been imported and cannot be modified`,
            severity: 'error',
            details: `Batch status: ${dbBatch.status}. Once imported, batch definitions are immutable.`,
            suggestion: 'Create a new batch or revert changes to this batch.'
          }]
        };
      }
    }
  }
  
  return { valid: true, errors: [] };
}
```

**Workflow:**

```
1. Admin bot creates plan with 3 batches (all status: pending in file)
2. Admin bot saves plan → validates → persists to DB
3. Human imports batch-1 via UI button
   → Tasks created in queue with batch_id
   → Database: batch-1 status = 'in_progress'
   → Plan file: batch-1 still says 'pending' (file unchanged)
4. Admin bot tries to edit batch-1 tasks in file
5. Admin bot calls save API
   → Validation FAILS: "Batch 'Infrastructure Setup' has been imported and cannot be modified"
   → Save rejected, file changes not persisted
6. Admin bot can still:
   ✅ Add new batches to the plan
   ✅ Edit pending batches (not yet imported)
   ✅ Update plan metadata (description, research notes)
   ❌ Cannot modify imported batches
```

**Database as State Authority:**

```typescript
// Plan file (YAML) - Planning document
task_batches:
  - id: batch-infra
    status: pending  # ← Never changes, even after import
    tasks: [...]

// Database (plan_batches table) - Execution state
{
  id: 'batch-infra',
  status: 'in_progress',  # ← Real state
  submitted_at: 1731850000,
  tasks_completed: 2,
  tasks_total: 3
}
```

**UI Behavior:**

```tsx
// UI reads from DATABASE, not plan file
function BatchCard({ batch }: { batch: BatchFromDatabase }) {
  // Status comes from database
  const status = batch.status; // 'in_progress', 'completed', etc.
  
  // NOT from plan file
  const fileStatus = planFile.task_batches.find(b => b.id === batch.id).status; // Always 'pending'
}
```

**Benefits:**
1. ✅ Plan file remains clean planning document
2. ✅ No file auto-updates on batch completion
3. ✅ Clear separation: file = plan, database = execution
4. ✅ Admin bot can't accidentally modify executing batches
5. ✅ Validation enforces immutability

### File Watcher Service Design

**Architecture:** Smart watcher with selective change marking (Option C)

**Behavior:**
1. File watcher detects ALL file changes
2. Parses YAML to identify which sections changed
3. Checks database to see if changed batches are imported
4. Only marks "unsaved changes" for valid editable sections
5. Validation provides warnings about ignored sections

**Implementation:**

```typescript
// NEW FILE: fileWatcherService.ts
export class FileWatcherService {
  private watchers = new Map<string, FSWatcher>();
  private unsavedChanges = new Map<string, UnsavedChangeInfo>();
  
  async onFileChange(filePath: string) {
    const planId = this.extractPlanId(filePath);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const parsedPlan = parseYAML(fileContent);
    
    // Get current state from database
    const dbPlan = await db.getPlan(planId);
    const dbBatches = await db.getBatchesByPlan(planId);
    
    // Determine what changed and if it's editable
    const changeAnalysis = await this.analyzeChanges(parsedPlan, dbPlan, dbBatches);
    
    if (changeAnalysis.hasEditableChanges) {
      // Mark as unsaved for editable changes only
      this.unsavedChanges.set(planId, {
        detected_at: Date.now(),
        editable_sections: changeAnalysis.editableSections,
        ignored_sections: changeAnalysis.ignoredSections // For warning display
      });
      
      // Emit event for UI indicator
      eventBus.emit('plan:unsaved_changes', {
        plan_id: planId,
        has_unsaved: true,
        ignored_sections: changeAnalysis.ignoredSections
      });
    }
  }
  
  private async analyzeChanges(
    parsedPlan: PlanFile,
    dbPlan: Plan,
    dbBatches: Batch[]
  ): Promise<ChangeAnalysis> {
    const editableSections: string[] = [];
    const ignoredSections: string[] = [];
    
    // Check each batch for changes
    for (const fileBatch of parsedPlan.task_batches) {
      const dbBatch = dbBatches.find(b => b.id === fileBatch.id);
      
      if (!dbBatch) {
        // New batch - editable
        editableSections.push(`task_batches.${fileBatch.id}`);
      } else if (dbBatch.status === 'pending') {
        // Batch not imported yet - editable
        const originalBatch = await this.getOriginalBatchDefinition(dbBatch.id);
        if (!isDeepEqual(fileBatch, originalBatch)) {
          editableSections.push(`task_batches.${fileBatch.id}`);
        }
      } else {
        // Batch already imported - check if modified
        const originalBatch = await this.getOriginalBatchDefinition(dbBatch.id);
        if (!isDeepEqual(fileBatch, originalBatch)) {
          ignoredSections.push(`task_batches.${fileBatch.id} (status: ${dbBatch.status})`);
        }
      }
    }
    
    // Check metadata/markdown changes (always editable)
    if (parsedPlan.markdownBody !== dbPlan.markdown_body) {
      editableSections.push('markdown_body');
    }
    
    return {
      hasEditableChanges: editableSections.length > 0,
      editableSections,
      ignoredSections
    };
  }
}
```

**Validation Response with Warnings:**

```typescript
// POST /api/plans/:planId/save
{
  "success": true,
  "version": 5,
  "saved_sections": [
    "task_batches.batch-new-feature",
    "markdown_body"
  ],
  "warnings": [
    {
      "section": "task_batches.batch-infra",
      "message": "Batch 'Infrastructure Setup' is already imported, it cannot be changed",
      "ignored": true,
      "batch_status": "in_progress"
    },
    {
      "section": "task_batches.batch-middleware", 
      "message": "Batch 'Middleware' is already imported, it cannot be changed",
      "ignored": true,
      "batch_status": "completed"
    }
  ]
}
```

**UI Integration:**

```tsx
function PlanFileEditor({ planId }: { planId: string }) {
  const { unsavedChanges, warnings } = usePlanFileStatus(planId);
  
  return (
    <>
      {/* Unsaved changes indicator */}
      {unsavedChanges?.has_unsaved && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Unsaved changes detected
            {unsavedChanges.ignored_sections?.length > 0 && (
              <div className="mt-2 text-sm">
                Note: Changes to {unsavedChanges.ignored_sections.length} imported batch(es) 
                will be ignored when saved.
              </div>
            )}
          </AlertDescription>
          <Button size="sm" onClick={() => savePlan()}>
            Save Changes
          </Button>
        </Alert>
      )}
      
      {/* Post-save warnings */}
      {warnings?.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>Some changes were ignored</AlertTitle>
          <AlertDescription>
            {warnings.map(w => (
              <div key={w.section}>{w.message}</div>
            ))}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
```

**Benefits:**
1. ✅ Admin bot gets immediate feedback (unsaved changes only for valid edits)
2. ✅ Validation provides clear warnings about ignored sections
3. ✅ No silent data loss - warnings explain what wasn't saved
4. ✅ File watcher is smart enough to reduce noise
5. ✅ UI can show specific guidance about immutable sections

**Summary:**
- File watcher: Smart, selective change detection
- Unsaved changes: Only marked for editable sections
- Validation: Ignores imported batch changes, returns warnings
- UI: Shows clear feedback about what can/cannot be edited

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

### ⚠️ Critical: COMPLETE REPLACEMENT - NO DUAL SYSTEMS

**Principle:** The legacy planning system MUST be completely replaced. We will NOT maintain two planning systems side-by-side.

**Migration Strategy:** Keep database table structure, but DELETE and REWRITE all service logic.

### What to KEEP (Structure Only)

| Component | Status | Action |
|-----------|--------|--------|
| `plans` table | ✅ Keep structure | **Extend** schema with new fields, DROP old data |
| `plan_id` in tasks | ✅ Keep column | **Add** `batch_id` column alongside |
| Database connection patterns | ✅ Keep | Reuse for new file-first services |
| API authentication | ✅ Keep | Reuse auth middleware |

### What to DELETE and REWRITE

| Component | Location | DELETE What | REWRITE How |
|-----------|----------|-------------|-------------|
| `backend/src/types/plan.ts` | Type definitions | Old `Plan` interface | **New** interface with `phase_metadata`, `task_batches`, `dependencies` |
| `backend/src/services/plans.service.ts` | Service class | **ENTIRE FILE** - database-first CRUD | **File-first** service: read/write markdown, backup to DB |
| `backend/src/services/planProgressCalculator.service.ts` | Progress calculator | **ENTIRE FILE** | **New** calculator with batch-level progress |
| `backend/src/services/planStatusUpdater.service.ts` | Status updater | **ENTIRE FILE** | **New** event handlers for batch completion |
| `backend/src/routes/dev-bots/plans.routes.ts` | API routes | All current endpoints | **New** endpoints: validate, submit, batch-submit, restore |
| `backend/src/utils/planValidation.ts` | Validation | Current validation logic | **New** YAML schema validation + dependency checking |
| `frontend/src/components/monitor/tabs/PlansTabContent.tsx` | UI component | **ENTIRE FILE** (stub data, manual controls) | **Minimal** read-only status view for monitoring |

### Files to DELETE Completely (No Replacement Needed)

| File | Reason |
|------|--------|
| `backend/src/services/__tests__/plans.service.test.ts` | Test for old implementation - delete and rewrite |
| `backend/src/services/__tests__/planProgressCalculator.service.test.ts` | Test for old implementation - delete and rewrite |
| `backend/src/services/__tests__/planStatusUpdater.service.test.ts` | Test for old implementation - delete and rewrite |
| `backend/src/routes/__tests__/plans.routes.test.ts` | Test for old API - delete and rewrite |

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

### Batch Import Process & Validation States

**Critical Design Decision:** Plans can be incrementally built and saved. Batches have validation states.

**Batch Validation States:**

```typescript
type BatchValidationState = 
  | 'invalid'      // Has errors (dependency cycles, invalid fields)
  | 'incomplete'   // Missing required task fields
  | 'ready'        // All required fields present, can be imported
  | 'imported'     // Already imported to task queue
```

**Incremental Plan Building:**

```
1. Admin bot creates plan, adds batch-infra with partial info
2. Saves plan → validation returns:
   {
     batches: {
       'batch-infra': { 
         state: 'incomplete',
         missing_fields: ['tasks[0].success_criteria', 'tasks[1].context']
       }
     }
   }
3. Admin bot continues research, fills in missing fields
4. Saves plan → validation returns:
   {
     batches: {
       'batch-infra': { state: 'ready' }
     }
   }
5. Now "Import Batch" button is enabled in UI
```

**Database Storage:**

```sql
-- Plan batches stored as fully-formed task definitions
CREATE TABLE plan_batches (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  name TEXT NOT NULL,
  description TEXT,
  order_num INTEGER,
  validation_state TEXT CHECK(validation_state IN ('invalid', 'incomplete', 'ready', 'imported')),
  
  -- Stored task definitions (JSON array)
  task_definitions TEXT NOT NULL, -- JSON array of complete task specs
  
  -- Execution tracking
  submitted_at INTEGER,
  completed_at INTEGER,
  task_count INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  
  -- Dependencies
  depends_on TEXT -- JSON array of batch IDs
);
```

**Save/Validation Response:**

```typescript
// POST /api/plans/:planId/save
{
  "success": true,
  "version": 3,
  "plan_status": "ready", // Overall: draft | researched | ready | in_progress
  "batches": {
    "batch-infra": {
      "state": "ready",
      "can_import": true,
      "task_count": 3
    },
    "batch-middleware": {
      "state": "incomplete",
      "can_import": false,
      "missing_fields": [
        "tasks[0].success_criteria",
        "tasks[2].estimated_effort_hours"
      ],
      "task_count": 4
    },
    "batch-validation": {
      "state": "invalid",
      "can_import": false,
      "errors": [
        "Circular dependency: batch-validation depends on batch-infra, which depends on batch-validation"
      ]
    }
  }
}
```

**Batch Import Process (Option B variant):**

```typescript
// POST /api/plans/:planId/batches/:batchId/import

async function importBatchToQueue(planId: string, batchId: string) {
  // 1. Get batch from database (already validated and stored)
  const batch = await db.getBatch(batchId);
  
  if (batch.validation_state !== 'ready') {
    throw new Error(`Batch is ${batch.validation_state}, cannot import`);
  }
  
  // 2. Check dependencies satisfied
  const depsReady = await checkBatchDependencies(planId, batchId);
  if (!depsReady) {
    throw new Error('Batch dependencies not satisfied');
  }
  
  // 3. Parse stored task definitions
  const taskDefinitions = JSON.parse(batch.task_definitions);
  
  // 4. Create tasks in queue (copy from plan batch storage)
  const createdTaskIds = [];
  for (const taskDef of taskDefinitions) {
    const task = await taskQueue.createTask({
      ...taskDef,              // All fields from plan (title, success_criteria, context, etc.)
      plan_id: planId,         // Foreign key to plan
      batch_id: batchId,       // Foreign key to batch
      status: 'pending',
      created_at: Date.now()
    });
    createdTaskIds.push(task.id);
  }
  
  // 5. Update batch state
  await db.updateBatch(batchId, {
    validation_state: 'imported',
    submitted_at: Date.now(),
    task_count: createdTaskIds.length
  });
  
  // 6. Update plan status if first batch
  const planBatches = await db.getBatchesByPlan(planId);
  const anyImported = planBatches.some(b => b.validation_state === 'imported');
  if (!anyImported) {
    await db.updatePlan(planId, { status: 'in_progress' });
  }
  
  return {
    success: true,
    batch_id: batchId,
    tasks_created: createdTaskIds.length,
    task_ids: createdTaskIds
  };
}
```

**Task Definition Storage:**

```typescript
// In plan_batches.task_definitions (JSON)
[
  {
    "title": "Deploy Redis cluster (3 nodes)",
    "type": "implementation",
    "agent_preference": "claude",
    "tags": ["infra", "cache", "redis"],
    "estimated_effort_hours": 2,
    "success_criteria": [
      "Redis cluster running on ports 6379-6381",
      "Health checks passing",
      "Cluster mode enabled and verified"
    ],
    "context": "Use existing docker-compose setup. Add Redis cluster with 3 nodes...",
    "priority": 5,
    "max_retries": 3
  },
  {
    "title": "Configure Redis eviction policies",
    // ... full task spec
  }
]
```

**UI "Import Batch" Button Logic:**

```tsx
function canImportBatch(batch: BatchWithValidation): boolean {
  // Must be in 'ready' state
  if (batch.validation_state !== 'ready') return false;
  
  // Dependencies must be satisfied
  if (batch.depends_on?.length > 0) {
    const allDepsImported = batch.depends_on.every(depId => {
      const depBatch = batches.find(b => b.id === depId);
      return depBatch?.validation_state === 'imported' && 
             depBatch?.completed_at !== null;
    });
    if (!allDepsImported) return false;
  }
  
  return true;
}
```

**Benefits:**
1. ✅ Plans can be built incrementally (save incomplete work)
2. ✅ Clear validation states guide admin bot
3. ✅ Tasks are fully formed in DB before import (no parsing at import time)
4. ✅ Import is simple copy operation (fast, reliable)
5. ✅ UI shows clear readiness indicators per batch

### Plan Creation Flow

**Critical Design Decision:** API-first creation with automatic file generation.

**Creation Endpoint:**

```typescript
// POST /api/plans/create
Request: {
  "name": "API Caching Layer"
}

Response: {
  "success": true,
  "plan_id": "plan-abc123def",
  "file_path": "docs/plans/plan-api-caching-layer.md",
  "version": 1
}
```

**Creation Sequence:**

```
1. Human clicks "Create New Plan" in UI (or admin bot calls API)
   → Input: Plan name "API Caching Layer"

2. Backend generates:
   - Plan ID: "plan-{uuid}" (e.g., "plan-abc123def")
   - Filename: "plan-{slugified-name}.md" (e.g., "plan-api-caching-layer.md")
   
3. Backend creates database record:
   {
     id: "plan-abc123def",
     title: "API Caching Layer",
     status: "draft",
     created_at: now,
     created_by: userId or "admin-bot"
   }
   
4. Backend creates plan file:
   docs/plans/plan-api-caching-layer.md
   
5. File watcher detects new file, but sees it matches DB record (no unsaved changes)

6. Admin bot can now edit the file to add research, batches, etc.
```

**Generated File Template:**

```markdown
---
plan:
  id: plan-abc123def
  version: 1
  status: draft
  
  title: "API Caching Layer"
  type: feature  # Will be set during planning
  priority: p1   # Will be set during planning
  
  created_at: 2025-11-17T08:55:00Z
  updated_at: 2025-11-17T08:55:00Z
  created_by: admin-bot
  
  # To be filled in during planning phase
  phase_metadata:
    draft:
      created_at: 2025-11-17T08:55:00Z
      user_request: ""
  
  dependencies:
    blocks_on: []
  
  task_batches: []
---

# Plan: API Caching Layer

## User Request

(Admin bot will fill this in during initial planning)

## Research Findings

(To be added during research phase)

## Task Breakdown

(To be added when breaking down into batches)

## Execution Notes

(To be added during execution)

## Retrospective

(To be added after completion)
```

**Filename Rules:**

```typescript
// Filename generation logic
function generatePlanFilename(planName: string): string {
  const slug = planName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '');     // Trim leading/trailing hyphens
  
  return `plan-${slug}.md`;
}

// Examples:
"API Caching Layer" → "plan-api-caching-layer.md"
"Fix Authentication Bugs" → "plan-fix-authentication-bugs.md"
"Implement User Dashboard v2" → "plan-implement-user-dashboard-v2.md"
```

**Concurrent Creation Handling:**

```typescript
// Multiple plans can be created simultaneously
// Each gets unique UUID-based ID
// Filename conflicts handled by appending suffix

async function createPlan(name: string): Promise<CreatePlanResponse> {
  const planId = `plan-${randomUUID()}`;
  let filename = generatePlanFilename(name);
  
  // Check for filename collision
  let filePath = path.join(plansDir, filename);
  let counter = 1;
  while (fs.existsSync(filePath)) {
    filename = filename.replace('.md', `-${counter}.md`);
    filePath = path.join(plansDir, filename);
    counter++;
  }
  
  // Create DB record
  await db.createPlan({
    id: planId,
    title: name,
    status: 'draft',
    created_at: Date.now()
  });
  
  // Create file from template
  const fileContent = generatePlanTemplate(planId, name);
  await fs.writeFile(filePath, fileContent);
  
  return { planId, filePath, version: 1 };
}
```

**UI Integration:**

```tsx
function CreatePlanDialog() {
  const [planName, setPlanName] = useState('');
  
  async function handleCreate() {
    const response = await api.createPlan({ name: planName });
    
    // Redirect to plan view or interactive tab
    router.push(`/plans/${response.plan_id}`);
    
    // Or notify admin bot
    notify('admin-bot', {
      type: 'plan_created',
      plan_id: response.plan_id,
      message: 'Plan created, ready for you to add details'
    });
  }
  
  return (
    <Dialog>
      <DialogHeader>Create New Plan</DialogHeader>
      <DialogContent>
        <Input 
          placeholder="Plan name (e.g., API Caching Layer)"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
        />
      </DialogContent>
      <DialogFooter>
        <Button onClick={handleCreate}>Create Plan</Button>
      </DialogFooter>
    </Dialog>
  );
}
```

**Admin Bot Workflow After Creation:**

```
1. Human/bot creates plan via API → plan-abc123def created
2. Admin bot receives notification: "Plan plan-abc123def created"
3. Admin bot opens file: docs/plans/plan-api-caching-layer.md
4. Admin bot adds:
   - User request details
   - Initial research findings
   - Phase metadata
5. Admin bot saves → validation returns batch states (all incomplete initially)
6. Admin bot continues iterating until batches are 'ready'
```

**Benefits:**
1. ✅ Clean API-driven creation (UI or bot can use same endpoint)
2. ✅ Unique IDs prevent conflicts
3. ✅ Human-readable filenames for file browser navigation
4. ✅ File watcher knows about new plans immediately (no race conditions)
5. ✅ Template provides structure for admin bot to fill in

**Summary:**
- Creation: POST /api/plans/create with plan name
- ID: Generated UUID-based plan ID
- Filename: Human-readable slug from plan name
- File: Auto-generated from template with minimal structure
- Admin bot fills in details after creation
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

## Implementation Strategy: Clean Slate Approach

### Step 1: DELETE Old Implementation

**Delete these files completely (commit deletion separately for clean history):**

```bash
# Services
rm backend/src/services/plans.service.ts
rm backend/src/services/planProgressCalculator.service.ts
rm backend/src/services/planStatusUpdater.service.ts
rm backend/src/services/planStatusUpdater.singleton.ts

# Tests
rm backend/src/services/__tests__/plans.service.test.ts
rm backend/src/services/__tests__/planProgressCalculator.service.test.ts
rm backend/src/services/__tests__/planStatusUpdater.service.test.ts
rm backend/src/routes/__tests__/plans.routes.test.ts

# Validation
rm backend/src/utils/planValidation.ts

# Routes (will recreate)
rm backend/src/routes/dev-bots/plans.routes.ts

# Frontend (will recreate)
rm frontend/src/components/monitor/tabs/PlansTabContent.tsx
```

### Step 2: Rewrite from Scratch

Create new implementations with file-first architecture:

| New File | Purpose |
|----------|---------|
| `backend/src/services/planFileService.ts` | Read/write plan markdown files (YAML + MD) |
| `backend/src/services/planBackupService.ts` | Database backup and restore |
| `backend/src/services/batchSubmissionService.ts` | Submit task batches to queue |
| `backend/src/services/planValidationService.ts` | Validate YAML schema, dependencies, batches |
| `backend/src/services/planEventHandlers.ts` | Event-driven status updates (batch completion) |
| `backend/src/routes/dev-bots/plans.routes.ts` | NEW API endpoints |
| `frontend/src/components/monitor/tabs/PlansTabContent.tsx` | Minimal read-only monitoring view |

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

### Database as Source of Truth, File as Agent Interface

✅ **Database:** Source of truth for plan state and progress
✅ **Files:** Interface for admin bot to edit plans (`docs/plans/*.md`)
✅ **File Watcher:** Detects changes and marks "unsaved changes"
✅ **Save Action:** Admin bot/human triggers save → validates → persists to DB
❌ **NEVER:** Direct database updates (always edit file → save)

### Admin Bot as Primary Interface (Autonomy First)

✅ **Interactive Tab:** Admin bot is the ONLY interface for plan management
✅ **Direct File Editing:** Bot edits files, validates via API, submits to DB
✅ **Autonomous Workflow:** Bot drives entire lifecycle with minimal human guidance
✅ **Human Input:** High-level goals only ("build a caching layer", "fix auth issues")
❌ **NEVER:** Manual YAML editing by users
❌ **NEVER:** UI forms or controls for plan creation/editing
❌ **NEVER:** Database-first updates (always file → validate → backup to DB)

---

## Autonomy-First Workflow Model

**Core Principle:** Humans provide goals, admin bot researches and plans, human approves execution.

### Human Interaction Pattern

```
Human: "We need a caching layer for the API"

Admin Bot (Planning Phase - Autonomous):
1. Creates plan file: docs/plans/plan-caching-layer.md
2. Researches architecture (reads docs, analyzes code)
3. Writes research findings to plan file (file watcher detects changes)
4. Breaks down into task batches with dependencies
5. Writes fully-detailed, structured tasks (ready for queue import)
6. Saves plan (triggers validation → persists to database)
7. Marks plan as "ready" (waiting for human approval)

Human (Execution Phase - Batch-by-Batch):
8. Reviews plan details in UI
9. Clicks "Import Batch" on first batch (batch-infra)
10. Tasks from batch-infra imported into task queue
11. Waits for batch-infra to complete (automatic monitoring)
12. When complete, "Import Batch" enabled for batch-middleware
13. Clicks "Import Batch" on next batch
14. Repeats until all batches imported and executed

System (Autonomous Execution):
15. Tasks execute from queue
16. Monitors task completion (event-driven)
17. Updates batch status automatically (pending → in_progress → completed)
18. Updates plan progress automatically
19. Marks plan complete when all batches done

Human involvement: Steps 1, 8, 9, 13 (goal, review, approve batches).
```

### Batch Dependency Enforcement

**Blocking Behavior:**

```
Batch A depends_on Batch B
→ Batch A "Import Batch" button disabled until Batch B status === 'completed'
→ Visual indicator shows which batches are blocking
→ System prevents premature execution
```

**Plan-level dependencies also enforced:**

```
Plan X blocks_on Plan Y
→ All batches in Plan X are blocked until Plan Y is 'completed'
→ First batch in Plan X cannot be imported until Plan Y done
```

**No automatic batch progression.** Human must click "Import Batch" for each one.

### File ↔ Database Flow

```
┌─────────────────┐
│  Admin Bot      │
│  edits file     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  File Watcher   │
│  detects change │──────► "Unsaved Changes" indicator
└────────┬────────┘
         │
         │ (bot or human triggers "save")
         ▼
┌─────────────────┐
│  Validation     │
│  - YAML schema  │
│  - Dependencies │
│  - Batch format │
└────────┬────────┘
         │
         ▼
     ┌───┴───┐
     │ Valid?│
     └───┬───┘
         │
    ┌────┴────┐
    │   YES   │
    └────┬────┘
         ▼
┌─────────────────┐
│   Database      │ ◄───── Source of Truth
│   (persisted)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  File Watcher   │
│  clears flag    │──────► "Saved" indicator
└─────────────────┘
```

### Why This Matters

**This is the PRIMARY control interface** for the entire development system:
- Humans provide high-level goals
- Admin bot researches and plans (autonomous)
- Humans review and approve execution (single button click)
- System executes and tracks progress (autonomous)

**Admin bot creates the plan. Human approves it. System executes it.**

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

          context: |
            Create Express middleware that:
            1. Checks Redis for cached response
            2. Returns cached data if available and not expired
            3. Caches response after controller execution
            
            Cache key format: `api:${path}:${hash(queryParams)}`

---

# Markdown Body - Human-Readable Narrative

## Context

Current API response times average 800ms (p95: 1.2s).
User requested: "We need a caching layer for the API"

## Research Findings (Phase: researched)

### Architecture Analysis
- Redis already in stack (used for sessions)
- Express middleware pattern well-established
- Current bottleneck: Database queries on frequently-accessed endpoints

### Key Design Decisions
- Cache key strategy: `${path}:${hash(queryParams)}`
- Eviction policy: LRU
- TTL strategy: Per-endpoint configuration (default 5min, configurable)

## Task Breakdown Summary (Phase: ready)

- **Total Batches:** 3
- **Total Tasks:** 9
- **Estimated Effort:** 14.5 hours
- **Dependencies:** batch-infra → batch-middleware → batch-validation

## Execution Notes (Phase: in_progress)

- Batch 1 (infra) submitted: 2025-11-17T10:00:00Z
- Batch 1 completed: 2025-11-17T12:30:00Z
- Batch 2 (middleware) auto-submitted: 2025-11-17T12:30:05Z

## Retrospective (Phase: completed)

(Populated by admin bot after all batches complete)

### What Worked Well
- Redis clustering provided seamless failover
- Middleware integration was straightforward

### Metrics Achieved
- Cache hit rate: 87%
- p95 latency: 180ms (down from 1200ms)
- Endpoints with most benefit: /api/users, /api/posts

### Lessons for Future Plans
- Start with smaller batch sizes for faster iteration
- Add monitoring before implementing cache (baseline metrics)
```

**Key Simplifications:**
1. Removed complex milestone triggers (auto-progression is simpler via events)
2. Markdown body shows admin bot's working notes, not formal documentation
3. Learning capture is straightforward key-value pairs, not complex metrics system

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

### Hybrid File + Database Architecture

**Primary Workflow:**
- Admin bot (Claude/others) edits files directly via filesystem
- File watcher detects changes, marks as "unsaved"
- API provides validate/save/query operations
- Database is source of truth after save

**Codex Integration Challenge:**
- Codex has non-interactive file editing limitations
- Need specialized interface for Codex to edit plan files
- Research needed: MCP server, streaming API, or custom plugin

### Core API Endpoints

#### Plan Management

```typescript
// Validate plan file (without saving)
POST /api/plans/:planId/validate
Request: { /* optional: file content override */ }
Response: {
  valid: boolean;
  errors: Array<{
    line: number;
    field: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{ ... }>;
}

// Save plan file to database (after validation)
POST /api/plans/:planId/save
Request: { 
  message?: string;  // Optional commit message
}
Response: {
  success: boolean;
  version: number;
  saved_at: number;
  validation_passed: boolean;
}

// List all plans (from database)
GET /api/plans
Query params: ?status=ready&type=feature
Response: {
  plans: Plan[];
  total: number;
}

// Get plan details with progress (from database)
GET /api/plans/:planId
Response: {
  plan: PlanDetails;  // Includes computed progress from tasks
  file_path: string;
  last_saved_at: number;
  has_unsaved_changes: boolean;  // From file watcher
}

// Restore plan from database backup
POST /api/plans/:planId/restore
Request: { version?: number }  // Omit for latest
Response: {
  success: boolean;
  restored_version: number;
  file_updated: boolean;  // Did we write back to file?
}
```

#### Batch Import

```typescript
// Import batch tasks to queue
POST /api/plans/:planId/batches/:batchId/import
Request: { /* empty or optional overrides */ }
Response: {
  success: boolean;
  batch_id: string;
  tasks_created: number;
  task_ids: string[];
  batch_status: 'in_progress';
}

// Check if batch can be imported (dependencies satisfied)
GET /api/plans/:planId/batches/:batchId/can-import
Response: {
  can_import: boolean;
  blocking_batches: Array<{ id: string; name: string; status: string }>;
  blocking_plans: Array<{ id: string; title: string }>;
}
```

#### File Watcher Integration

```typescript
// Internal API (called by file watcher service)
POST /internal/plans/:planId/mark-changed
Request: { file_path: string; changed_at: number }
Response: { success: boolean }

// Internal API (called after successful save)
POST /internal/plans/:planId/clear-changes
Response: { success: boolean }
```

### Codex Integration API (Research & Future Work)

**Problem:** Codex cannot interactively edit files like Claude can.

**Potential Solutions (Requires Research):**

#### Option 1: Streaming Edit API
```typescript
// Codex streams edits as structured operations
POST /api/plans/:planId/edit-stream
Request: Server-Sent Events stream
  event: insert_text
  data: { line: 45, content: "..." }
  
  event: replace_lines
  data: { start: 10, end: 15, content: "..." }
  
  event: done
  data: { complete: true }

Response: Stream acknowledgments
```

#### Option 2: Custom MCP Server
```typescript
// Model Context Protocol server for plan editing
// Codex could use MCP tools to edit plans
tools:
  - plan_read_section
  - plan_update_yaml_field
  - plan_append_batch
  - plan_add_task_to_batch
  - plan_validate
  - plan_save
```

#### Option 3: Structured Edit API
```typescript
// High-level semantic operations instead of raw file editing
POST /api/plans/:planId/operations
Request: {
  operations: [
    { 
      type: 'add_batch',
      data: { name: '...', description: '...', tasks: [...] }
    },
    {
      type: 'update_status',
      data: { status: 'ready' }
    }
  ]
}
Response: { success: boolean; file_updated: boolean }
```

**Action Item:** Research Codex file editing capabilities and MCP server feasibility before finalizing this API.

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

### Phase 3: Submit Batch to Queue (Autonomous)

```bash
# User: "Start executing the plan"

# Admin bot autonomously:
# 1. Check batch dependencies
# 2. Submit first ready batch
curl -X POST $PLANS_API_URL/plan-caching-layer/batches/batch-infra/submit
# → Creates 3 tasks in queue
# → Links tasks to plan via plan_id + batch_id
# → Updates batch status to 'queued'
# → Updates plan status to 'in_progress'

# 3. Monitor for batch completion event
# 4. When batch completes, auto-submit next batch if dependencies met
# 5. Continue until all batches submitted
```

### Phase 4: Autonomous Monitoring & Progression

**Admin bot continuously monitors** (event-driven, not polling):

```typescript
// Bot subscribes to events:
@on('plan:batch_completed')
async handleBatchComplete(planId: string, batchId: string) {
  // Load plan file
  const plan = await planFileService.readPlan(planId);
  
  // Find next ready batches (dependencies satisfied)
  const readyBatches = plan.task_batches.filter(batch => 
    batch.status === 'pending' && 
    batch.depends_on.every(depId => 
      plan.task_batches.find(b => b.id === depId)?.status === 'completed'
    )
  );
  
  // Auto-submit ready batches
  for (const batch of readyBatches) {
    await batchSubmissionService.submitBatch(planId, batch.id);
  }
}
```

**Human involvement:** None. Bot handles progression autonomously.

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

## UI Components - SIMPLIFIED (Review & Approve Model)

**Design Principle:** The admin bot creates plans. Humans review and approve. UI shows status.

### Plans Monitoring & Batch Import View

```tsx
/**
 * PlansTabContent - Plan review and batch-by-batch execution
 * 
 * WORKFLOW: 
 * - Admin bot creates plans with detailed task batches
 * - Human reviews plan
 * - Human imports batches one-by-one (respecting dependencies)
 * - System executes tasks and tracks progress
 */
function PlansTabContent() {
  const { plans, loading } = usePlans(); // Fetch from API
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Plans are created by Admin Bot. Review batches and import to queue when ready.
      </div>

      {plans.map(plan => (
        <Card key={plan.id}>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <CardTitle>{plan.title}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-2 text-sm text-muted-foreground">
                  {plan.task_batches?.length || 0} batches • 
                  {plan.total_tasks || 0} tasks total
                </div>
              </div>
              <Badge variant={getStatusVariant(plan.status)}>
                {plan.status}
              </Badge>
            </div>
          </CardHeader>

          <CardContent>
            {/* Overall progress (for in_progress/completed plans) */}
            {(plan.status === 'in_progress' || plan.status === 'completed') && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Overall Progress</span>
                  <span>{plan.progress.percentComplete}%</span>
                </div>
                <Progress value={plan.progress.percentComplete} />
              </div>
            )}
            
            {/* Batch list with individual import buttons */}
            <div className="space-y-3">
              {plan.task_batches?.map((batch, idx) => {
                const canImport = canImportBatch(plan, batch);
                const blockingBatches = getBlockingBatches(plan, batch);
                
                return (
                  <Card key={batch.id} variant="outline">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">
                              Batch {idx + 1}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {batch.tasks.length} tasks
                            </Badge>
                          </div>
                          <h4 className="font-medium mt-1">{batch.name}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {batch.description}
                          </p>
                        </div>
                        
                        <div className="flex gap-2 items-center">
                          <Badge variant={getBatchStatusVariant(batch.status)}>
                            {batch.status}
                          </Badge>
                          
                          {/* Import button - only active if dependencies met */}
                          {batch.status === 'pending' && (
                            <>
                              {canImport ? (
                                <Button 
                                  size="sm" 
                                  onClick={() => importBatchToQueue(plan.id, batch.id)}
                                >
                                  <Play className="mr-1 h-3 w-3" />
                                  Import Batch
                                </Button>
                              ) : (
                                <Tooltip content={
                                  `Waiting for: ${blockingBatches.map(b => b.name).join(', ')}`
                                }>
                                  <Button size="sm" disabled>
                                    <Lock className="mr-1 h-3 w-3" />
                                    Blocked
                                  </Button>
                                </Tooltip>
                              )}
                            </>
                          )}
                          
                          {/* Progress for active batches */}
                          {batch.status === 'in_progress' && (
                            <span className="text-sm text-muted-foreground">
                              {batch.tasks_completed || 0}/{batch.tasks.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    
                    {/* Expandable task list */}
                    {expandedPlanId === plan.id && (
                      <CardContent className="pt-0">
                        <div className="space-y-1 text-sm">
                          {batch.tasks.map((task, taskIdx) => (
                            <div key={taskIdx} className="flex items-center gap-2 text-muted-foreground">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>{task.title}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
            
            {/* Show/hide task details */}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setExpandedPlanId(
                expandedPlanId === plan.id ? null : plan.id
              )}
            >
              {expandedPlanId === plan.id ? 'Hide' : 'Show'} Task Details
            </Button>
            
            {/* Plan-level dependency warnings */}
            {plan.dependencies?.blocks_on?.length > 0 && (
              <Alert className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This plan is blocked by: {plan.dependencies.blocks_on.map(d => d.id).join(', ')}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Check if a batch can be imported (dependencies satisfied)
 */
function canImportBatch(plan: Plan, batch: TaskBatch): boolean {
  // No dependencies - can import
  if (!batch.depends_on || batch.depends_on.length === 0) {
    return true;
  }
  
  // Check if all dependent batches are completed
  return batch.depends_on.every(depId => {
    const depBatch = plan.task_batches?.find(b => b.id === depId);
    return depBatch?.status === 'completed';
  });
}

/**
 * Get list of batches blocking this batch
 */
function getBlockingBatches(plan: Plan, batch: TaskBatch): TaskBatch[] {
  if (!batch.depends_on) return [];
  
  return batch.depends_on
    .map(depId => plan.task_batches?.find(b => b.id === depId))
    .filter((b): b is TaskBatch => b !== undefined && b.status !== 'completed');
}
```

**Key UI Elements:**
- ✅ Each batch has its own "Import Batch" button
- ✅ Button only enabled when dependencies are satisfied
- ✅ Clear visual indication of blocking batches
- ✅ Expandable task list to review what's in each batch
- ✅ Progress tracking per batch and overall
- ❌ No ability to import entire plan at once (must be batch-by-batch)
- ❌ No manual task editing

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

## Implementation Phases (Clean Slate Rebuild)

### Phase 0: Demolition (0.5 days)

**Delete old implementation completely:**

```bash
# Commit deletions separately for clean git history
git rm backend/src/services/plans.service.ts
git rm backend/src/services/planProgressCalculator.service.ts
git rm backend/src/services/planStatusUpdater.service.ts
git rm backend/src/services/planStatusUpdater.singleton.ts
git rm backend/src/utils/planValidation.ts
git rm backend/src/routes/dev-bots/plans.routes.ts
git rm backend/src/services/__tests__/plans.service.test.ts
git rm backend/src/services/__tests__/planProgressCalculator.service.test.ts
git rm backend/src/services/__tests__/planStatusUpdater.service.test.ts
git rm backend/src/routes/__tests__/plans.routes.test.ts
git rm frontend/src/components/monitor/tabs/PlansTabContent.tsx
git commit -m "feat(plans): delete legacy planning system for clean rebuild"
```

**Clean up database:**
```sql
-- Drop existing plan data (not backwards compatible)
DELETE FROM plans;
```

### Phase 1: Core File System & Types (1.5 days)

**New TypeScript types** (`backend/src/types/plan.ts` - rewrite completely):
- `PlanFile` - Full plan with YAML frontmatter + markdown
- `TaskBatch` - Batch with tasks and dependencies
- `PlanDependency` - blocks_on/enables relationships
- `PhaseMetadata` - Metadata per phase (draft, researched, ready, etc.)
- `PlanFileBackup` - Database backup record

**New services:**
- `planFileService.ts` - Read/write plan markdown files (YAML + MD parsing)
- `planBackupService.ts` - Database backup and restore

**Database migration 022:**
- Extend `plans` table with new fields
- Create `plan_file_backups` table
- Create `plan_batches` table
- Add `batch_id` to tasks table

### Step 2: Validation & Batch Import (2 days)

**New services:**
- `planValidationService.ts` - YAML schema validation, dependency cycle detection
- `batchImportService.ts` - Import batch tasks to queue with dependency checking

**API endpoints** (`backend/src/routes/dev-bots/plans.routes.ts` - rewrite):
- `POST /api/plans/:planId/validate` - Validate plan file
- `POST /api/plans/:planId/save` - Save plan file to database
- `POST /api/plans/:planId/batches/:batchId/import` - Import batch to task queue
- `POST /api/plans/:planId/restore?version=X` - Restore from backup
- `GET /api/plans` - List all plans (from database)
- `GET /api/plans/:planId` - Get plan details with progress
- `GET /api/plans/:planId/batches/:batchId/can-import` - Check if batch ready

**Codex Integration Research:**
- Research MCP server for Codex plan editing
- Prototype streaming edit API
- Document structured edit operations approach

### Phase 3: Event-Driven Automation (2 days)

**New services:**
- `planEventHandlers.ts` - Event handlers for batch completion, auto-progression

**Event flow:**
1. Task completes → check if batch complete
2. Batch completes → update plan file → emit `plan:batch_completed`
3. Event handler → check dependent batches → auto-submit if ready
4. All batches complete → update plan status to `completed`

**Integration:**
- Subscribe to `task:completed` events
- Emit `plan:batch_completed` events
- WebSocket broadcast for UI updates

### Phase 4: Admin Bot Integration (1.5 days)

**Container configuration:**
- Mount `docs/plans/` directory (read-write)
- Add environment variables (`PLANS_DIR`, `PLANS_API_URL`)

**Context document:**
- `docs/context/admin-bot-plan-management.md`
- Plan file format reference
- Workflow examples
- API usage guide

**System prompt addition:**
- Add plan management capabilities to admin bot prompt
- Include plan workflow instructions

### Phase 5: Minimal UI (1 day)

**Frontend** (`frontend/src/components/monitor/tabs/PlansTabContent.tsx` - rewrite):
- Read-only monitoring view
- Plan list with status badges
- Batch progress display
- No controls (admin bot handles everything)

**API client:**
- `frontend/src/services/api.ts` - Add plan API methods
- Custom hook: `usePlans()` - Fetch and subscribe to plan updates

### Phase 6: Testing & Documentation (2 days)

**Tests:**
- File I/O tests (read/write plan files)
- Validation tests (schema, dependencies, cycles)
- Batch submission tests (task creation, linkage)
- Event handler tests (batch completion, auto-progression)
- Integration tests (end-to-end workflow)

**Documentation:**
- Update `docs/README.md` with plans system
- Add examples in `docs/plans/` directory
- Admin bot workflow guide

**Total: 10.5 days**

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

---

## DETAILED IMPLEMENTATION SPECIFICATIONS

### TypeScript Type Definitions

**File:** `backend/src/types/plan.ts` (Complete Rewrite - DELETE old file first)

```typescript
/**
 * Multi-Phase Plan System Types
 * Complete rewrite for file-first, batch-aware planning
 */

// ============================================================================
// Core Plan Types
// ============================================================================

export type PlanStatus = 
  | 'draft'       // Initial creation, gathering requirements
  | 'researched'  // Architecture analyzed, design complete
  | 'ready'       // Broken into batches, ready for execution
  | 'in_progress' // At least one batch imported
  | 'blocked'     // Blocked by dependencies or issues
  | 'completed'   // All batches complete
  | 'cancelled';  // Manually cancelled

export type PlanType = 'feature' | 'refactor' | 'fix' | 'investigation';
export type PlanPriority = 'p0' | 'p1' | 'p2' | 'p3';

export interface Plan {
  id: string;
  title: string;
  description?: string;
  file_path: string;  // Path to plan file
  
  plan_type: PlanType;
  priority: PlanPriority;
  status: PlanStatus;
  
  created_at: number;
  updated_at: number;
  started_at?: number;
  completed_at?: number;
  cancelled_at?: number;
  
  created_by?: string;
  assigned_to?: string;
  
  estimated_effort_hours?: number;
  markdown_body?: string;
  
  // File sync
  has_unsaved_changes?: boolean;
  last_saved_at?: number;
  file_version: number;
}

// ============================================================================
// Batch Types
// ============================================================================

export type BatchValidationState = 
  | 'invalid'      // Has validation errors
  | 'incomplete'   // Missing required fields
  | 'ready'        // Can be imported
  | 'imported';    // Already in task queue

export interface TaskBatch {
  id: string;
  plan_id: string;
  name: string;
  description?: string;
  order_num: number;
  validation_state: BatchValidationState;
  
  task_definitions: TaskDefinition[];
  task_count: number;
  depends_on: string[];
  
  submitted_at?: number;
  completed_at?: number;
  tasks_completed?: number;
}

export interface TaskDefinition {
  title: string;
  type?: 'implementation' | 'analysis' | 'documentation' | 'review';
  description?: string;
  agent_preference?: 'claude' | 'codex' | 'gemini';
  tags?: string[];
  priority?: number;
  estimated_effort_hours?: number;
  max_retries?: number;
  success_criteria?: string[];
  context?: string;
  files?: string[];
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  line?: number;
  details?: string;
  suggestion?: string;
}

export interface PlanValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  batches: Record<string, BatchValidationResult>;
}

export interface BatchValidationResult {
  state: BatchValidationState;
  can_import: boolean;
  missing_fields?: string[];
  errors?: string[];
  task_count: number;
}

// ============================================================================
// Progress Tracking
// ============================================================================

export interface PlanProgress {
  percentComplete: number;
  estimated_hours_remaining?: number;
  batches_total: number;
  batches_ready: number;
  batches_imported: number;
  batches_completed: number;
  tasks_total: number;
  tasks_completed: number;
}

export interface PlanDetails extends Plan {
  batches: TaskBatch[];
  progress: PlanProgress;
}
```


---

### Database Schema (Migration 022)

**File:** `backend/migrations/022_multi_phase_plans.sql`

```sql
-- Migration 022: Multi-Phase Plan System
-- Date: 2025-11-17
-- Purpose: Complete replacement of legacy planning system with batch-aware, file-first design

-- ============================================================================
-- STEP 1: Clean up old data (no backwards compatibility)
-- ============================================================================

DELETE FROM plans;  -- Drop existing plan data

-- ============================================================================
-- STEP 2: Extend plans table
-- ============================================================================

-- Add new columns to existing plans table
ALTER TABLE plans ADD COLUMN file_path TEXT NOT NULL DEFAULT '';
ALTER TABLE plans ADD COLUMN file_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN has_unsaved_changes INTEGER DEFAULT 0;
ALTER TABLE plans ADD COLUMN last_saved_at INTEGER;
ALTER TABLE plans ADD COLUMN markdown_body TEXT;

-- Update CHECK constraint for new status values
-- SQLite doesn't support ALTER CHECK, so we document the new constraint
-- The application layer will enforce: 'draft' | 'researched' | 'ready' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'

-- ============================================================================
-- STEP 3: Create plan_batches table
-- ============================================================================

CREATE TABLE IF NOT EXISTS plan_batches (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  
  -- Batch metadata
  name TEXT NOT NULL,
  description TEXT,
  order_num INTEGER NOT NULL,
  
  -- Validation state
  validation_state TEXT NOT NULL CHECK(validation_state IN ('invalid', 'incomplete', 'ready', 'imported')),
  
  -- Task definitions (stored as JSON array)
  task_definitions TEXT NOT NULL,  -- JSON: TaskDefinition[]
  task_count INTEGER NOT NULL DEFAULT 0,
  
  -- Dependencies
  depends_on TEXT,  -- JSON: string[] (batch IDs)
  
  -- Execution tracking
  submitted_at INTEGER,
  completed_at INTEGER,
  tasks_completed INTEGER DEFAULT 0,
  
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

-- Indexes for plan_batches
CREATE INDEX IF NOT EXISTS idx_plan_batches_plan ON plan_batches(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_batches_validation_state ON plan_batches(validation_state);
CREATE INDEX IF NOT EXISTS idx_plan_batches_order ON plan_batches(plan_id, order_num);

-- ============================================================================
-- STEP 4: Extend tasks table with batch_id
-- ============================================================================

ALTER TABLE tasks ADD COLUMN batch_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_batch ON tasks(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_plan_batch ON tasks(plan_id, batch_id) WHERE plan_id IS NOT NULL AND batch_id IS NOT NULL;

-- ============================================================================
-- STEP 5: Create plan_file_backups table
-- ============================================================================

CREATE TABLE IF NOT EXISTS plan_file_backups (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  
  -- File content snapshot
  content TEXT NOT NULL,
  checksum TEXT NOT NULL,
  
  -- Metadata
  created_at INTEGER NOT NULL,
  created_by TEXT,
  commit_message TEXT,
  
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  UNIQUE(plan_id, version)
);

-- Indexes for file backups
CREATE INDEX IF NOT EXISTS idx_plan_backups_plan ON plan_file_backups(plan_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_plan_backups_created ON plan_file_backups(created_at DESC);

-- ============================================================================
-- STEP 6: Create plan_dependencies table
-- ============================================================================

CREATE TABLE IF NOT EXISTS plan_dependencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT NOT NULL,
  depends_on_plan_id TEXT NOT NULL,
  dependency_type TEXT NOT NULL CHECK(dependency_type IN ('blocks_on', 'enables')),
  rationale TEXT,
  
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  UNIQUE(plan_id, depends_on_plan_id, dependency_type)
);

-- Indexes for dependencies
CREATE INDEX IF NOT EXISTS idx_plan_deps_plan ON plan_dependencies(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_deps_depends_on ON plan_dependencies(depends_on_plan_id);

-- ============================================================================
-- STEP 7: Update existing indexes
-- ============================================================================

-- These may already exist from migration 021, create if not exists
CREATE INDEX IF NOT EXISTS idx_plans_status_priority ON plans(status, priority);
CREATE INDEX IF NOT EXISTS idx_plans_file_path ON plans(file_path);
CREATE INDEX IF NOT EXISTS idx_plans_unsaved_changes ON plans(has_unsaved_changes) WHERE has_unsaved_changes = 1;

-- ============================================================================
-- Migration complete
-- ============================================================================
```


---

### Service Implementation Specifications

#### 1. Plan File Service

**File:** `backend/src/services/planFileService.ts` (NEW)

```typescript
/**
 * Plan File Service
 * Handles reading/writing plan files with YAML frontmatter + Markdown
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import yaml from 'js-yaml';
import { createHash } from 'crypto';

export class PlanFileService {
  private plansDir: string;

  constructor(plansDir: string = 'docs/plans') {
    this.plansDir = path.resolve(plansDir);
  }

  /**
   * Read and parse plan file
   */
  async readPlanFile(planId: string): Promise<PlanFile> {
    const filePath = await this.getPlanFilePath(planId);
    const content = await fs.readFile(filePath, 'utf-8');
    return this.parsePlanFile(content);
  }

  /**
   * Write plan file
   */
  async writePlanFile(planId: string, plan: PlanFile): Promise<void> {
    const filePath = await this.getPlanFilePath(planId);
    const content = this.serializePlanFile(plan);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Create new plan file from template
   */
  async createPlanFile(planId: string, title: string): Promise<string> {
    const filename = this.generateFilename(title);
    const filePath = path.join(this.plansDir, filename);
    
    // Check for collisions
    let finalPath = filePath;
    let counter = 1;
    while (await this.fileExists(finalPath)) {
      finalPath = filePath.replace('.md', `-${counter}.md`);
      counter++;
    }
    
    const template = this.generateTemplate(planId, title);
    await fs.writeFile(finalPath, template, 'utf-8');
    
    return finalPath;
  }

  /**
   * Parse YAML frontmatter + markdown
   */
  private parsePlanFile(content: string): PlanFile {
    const parts = content.split('---\n');
    if (parts.length < 3) {
      throw new Error('Invalid plan file format: missing frontmatter');
    }
    
    const yamlContent = parts[1];
    const markdownBody = parts.slice(2).join('---\n').trim();
    
    const parsed = yaml.load(yamlContent) as any;
    
    return {
      plan: {
        id: parsed.plan.id,
        version: parsed.plan.version || 1,
        status: parsed.plan.status,
        title: parsed.plan.title,
        type: parsed.plan.plan_type,
        priority: parsed.plan.priority,
        created_at: new Date(parsed.plan.created_at).getTime(),
        updated_at: new Date(parsed.plan.updated_at).getTime(),
        created_by: parsed.plan.created_by,
        dependencies: parsed.plan.dependencies,
        task_batches: parsed.plan.task_batches || [],
        phase_metadata: parsed.plan.phase_metadata,
        estimated_effort_hours: parsed.plan.estimated_effort_hours
      },
      markdown_body: markdownBody
    };
  }

  /**
   * Serialize to YAML + markdown
   */
  private serializePlanFile(planFile: PlanFile): string {
    const yamlData = {
      plan: {
        id: planFile.plan.id,
        version: planFile.plan.version,
        status: planFile.plan.status,
        title: planFile.plan.title,
        plan_type: planFile.plan.type,
        priority: planFile.plan.priority,
        created_at: new Date(planFile.plan.created_at).toISOString(),
        updated_at: new Date(planFile.plan.updated_at).toISOString(),
        created_by: planFile.plan.created_by,
        dependencies: planFile.plan.dependencies,
        task_batches: planFile.plan.task_batches,
        phase_metadata: planFile.plan.phase_metadata,
        estimated_effort_hours: planFile.plan.estimated_effort_hours
      }
    };
    
    const yamlContent = yaml.dump(yamlData, {
      indent: 2,
      lineWidth: 100
    });
    
    return `---\n${yamlContent}---\n\n${planFile.markdown_body}`;
  }

  /**
   * Generate filename from title
   */
  private generateFilename(title: string): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `plan-${slug}.md`;
  }

  /**
   * Get file path for plan ID
   */
  private async getPlanFilePath(planId: string): Promise<string> {
    // Find file by reading plan ID from frontmatter
    const files = await fs.readdir(this.plansDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const content = await fs.readFile(path.join(this.plansDir, file), 'utf-8');
      if (content.includes(`id: ${planId}`)) {
        return path.join(this.plansDir, file);
      }
    }
    throw new Error(`Plan file not found for ID: ${planId}`);
  }

  /**
   * Calculate file checksum
   */
  calculateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
```


#### 2. Plan Validation Service

**File:** `backend/src/services/planValidationService.ts` (NEW)

```typescript
/**
 * Plan Validation Service
 * Validates plan files and checks for immutability violations
 */

export class PlanValidationService {
  constructor(
    private db: Database.Database,
    private planFileService: PlanFileService
  ) {}

  /**
   * Validate plan file before save
   */
  async validatePlan(planId: string, fileContent: string): Promise<PlanValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // Parse file
    let parsedPlan: PlanFile;
    try {
      parsedPlan = await this.planFileService.parsePlanFile(fileContent);
    } catch (error) {
      return {
        valid: false,
        errors: [{
          field: 'file',
          message: 'Invalid YAML format',
          severity: 'error',
          details: error instanceof Error ? error.message : String(error)
        }],
        warnings: [],
        batches: {}
      };
    }
    
    // Validate plan ID matches
    if (parsedPlan.plan.id !== planId) {
      errors.push({
        field: 'plan.id',
        message: 'Plan ID mismatch',
        severity: 'error',
        details: `File contains ID ${parsedPlan.plan.id} but expected ${planId}`
      });
    }
    
    // Check for immutability violations (imported batches)
    const immutabilityCheck = await this.checkImmutability(planId, parsedPlan);
    warnings.push(...immutabilityCheck.warnings);
    if (!immutabilityCheck.valid) {
      errors.push(...immutabilityCheck.errors);
    }
    
    // Validate each batch
    const batchResults: Record<string, BatchValidationResult> = {};
    for (const batch of parsedPlan.plan.task_batches) {
      batchResults[batch.id] = await this.validateBatch(batch);
    }
    
    // Check for dependency cycles
    const cycleCheck = this.checkDependencyCycles(parsedPlan.plan.task_batches);
    if (!cycleCheck.valid) {
      errors.push(...cycleCheck.errors);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      batches: batchResults
    };
  }

  /**
   * Check if imported batches were modified (immutability violation)
   */
  private async checkImmutability(planId: string, parsedPlan: PlanFile): Promise<{
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    for (const fileBatch of parsedPlan.plan.task_batches) {
      const dbBatch = await this.db.prepare('SELECT * FROM plan_batches WHERE id = ?').get(fileBatch.id);
      
      if (!dbBatch) continue; // New batch, no violation
      
      if (dbBatch.validation_state !== 'pending' && dbBatch.validation_state !== 'incomplete') {
        // Batch has been imported - check if modified
        const originalDef = JSON.parse(dbBatch.task_definitions);
        
        if (!this.isDeepEqual(fileBatch.tasks, originalDef)) {
          warnings.push({
            section: `task_batches.${fileBatch.id}`,
            message: `Batch "${fileBatch.name}" has been imported and cannot be modified`,
            ignored: true,
            batch_status: dbBatch.validation_state
          });
        }
      }
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate individual batch
   */
  private async validateBatch(batch: any): Promise<BatchValidationResult> {
    const missingFields: string[] = [];
    const errors: string[] = [];
    
    if (!batch.name) missingFields.push('name');
    if (!batch.tasks || batch.tasks.length === 0) {
      missingFields.push('tasks');
    } else {
      // Validate each task
      batch.tasks.forEach((task: any, idx: number) => {
        if (!task.title) missingFields.push(`tasks[${idx}].title`);
        if (!task.success_criteria || task.success_criteria.length === 0) {
          missingFields.push(`tasks[${idx}].success_criteria`);
        }
        if (!task.context) missingFields.push(`tasks[${idx}].context`);
      });
    }
    
    let state: BatchValidationState;
    if (errors.length > 0) {
      state = 'invalid';
    } else if (missingFields.length > 0) {
      state = 'incomplete';
    } else {
      state = 'ready';
    }
    
    return {
      state,
      can_import: state === 'ready',
      missing_fields: missingFields.length > 0 ? missingFields : undefined,
      errors: errors.length > 0 ? errors : undefined,
      task_count: batch.tasks?.length || 0
    };
  }

  /**
   * Check for circular dependencies
   */
  private checkDependencyCycles(batches: any[]): {
    valid: boolean;
    errors: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (batchId: string): boolean => {
      if (recursionStack.has(batchId)) return true;
      if (visited.has(batchId)) return false;
      
      visited.add(batchId);
      recursionStack.add(batchId);
      
      const batch = batches.find(b => b.id === batchId);
      if (batch?.depends_on) {
        for (const depId of batch.depends_on) {
          if (hasCycle(depId)) return true;
        }
      }
      
      recursionStack.delete(batchId);
      return false;
    };
    
    for (const batch of batches) {
      if (hasCycle(batch.id)) {
        errors.push({
          field: `task_batches.${batch.id}.depends_on`,
          message: `Circular dependency detected involving batch "${batch.name}"`,
          severity: 'error'
        });
      }
    }
    
    return { valid: errors.length === 0, errors };
  }

  private isDeepEqual(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}
```


#### 3. Batch Import Service

**File:** `backend/src/services/batchImportService.ts` (NEW)

```typescript
/**
 * Batch Import Service
 * Handles importing batches from plans into the task queue
 */

export class BatchImportService {
  constructor(
    private db: Database.Database,
    private taskQueue: TaskQueueService
  ) {}

  /**
   * Import batch to task queue
   */
  async importBatch(planId: string, batchId: string): Promise<ImportBatchResponse> {
    return this.db.transaction(() => {
      // 1. Get batch from database
      const batch = this.db.prepare('SELECT * FROM plan_batches WHERE id = ? AND plan_id = ?')
        .get(batchId, planId);
      
      if (!batch) {
        throw new Error(`Batch ${batchId} not found`);
      }
      
      if (batch.validation_state !== 'ready') {
        throw new Error(`Batch is ${batch.validation_state}, cannot import`);
      }
      
      // 2. Check dependencies
      if (batch.depends_on) {
        const deps = JSON.parse(batch.depends_on);
        for (const depId of deps) {
          const depBatch = this.db.prepare('SELECT validation_state, completed_at FROM plan_batches WHERE id = ?')
            .get(depId);
          
          if (!depBatch || depBatch.validation_state !== 'imported' || !depBatch.completed_at) {
            throw new Error(`Dependency batch ${depId} not completed`);
          }
        }
      }
      
      // 3. Parse task definitions
      const taskDefinitions = JSON.parse(batch.task_definitions);
      const createdTaskIds: string[] = [];
      
      // 4. Create tasks in queue
      for (const taskDef of taskDefinitions) {
        const task = this.taskQueue.createTask({
          title: taskDef.title,
          type: taskDef.type || 'implementation',
          description: taskDef.description,
          assigned_agent: taskDef.agent_preference || 'claude',
          priority: taskDef.priority || 5,
          estimated_hours: taskDef.estimated_effort_hours,
          max_retries: taskDef.max_retries || 3,
          timeout_ms: taskDef.timeout_ms,
          
          // Success criteria and context
          success_criteria: taskDef.success_criteria,
          prompt: taskDef.context,
          
          // Linkage
          plan_id: planId,
          batch_id: batchId,
          
          // Additional fields
          tags: taskDef.tags,
          files: taskDef.files,
          dependencies: taskDef.dependencies
        });
        
        createdTaskIds.push(task.id);
      }
      
      // 5. Update batch state
      this.db.prepare(`
        UPDATE plan_batches 
        SET validation_state = 'imported',
            submitted_at = ?,
            task_count = ?
        WHERE id = ?
      `).run(Date.now(), createdTaskIds.length, batchId);
      
      // 6. Update plan status if first batch
      const plan = this.db.prepare('SELECT status FROM plans WHERE id = ?').get(planId);
      if (plan.status !== 'in_progress') {
        this.db.prepare('UPDATE plans SET status = ?, started_at = ? WHERE id = ?')
          .run('in_progress', Date.now(), planId);
      }
      
      logger.info({
        category: 'plan',
        action: 'batch_imported',
        message: `Batch ${batch.name} imported to task queue`,
        details: { planId, batchId, tasksCreated: createdTaskIds.length }
      });
      
      return {
        success: true,
        batch_id: batchId,
        tasks_created: createdTaskIds.length,
        task_ids: createdTaskIds,
        batch_status: 'imported'
      };
    });
  }

  /**
   * Check if batch can be imported
   */
  async canImportBatch(planId: string, batchId: string): Promise<{
    can_import: boolean;
    blocking_batches?: string[];
    blocking_plans?: string[];
  }> {
    const batch = this.db.prepare('SELECT * FROM plan_batches WHERE id = ? AND plan_id = ?')
      .get(batchId, planId);
    
    if (!batch) {
      return { can_import: false };
    }
    
    if (batch.validation_state !== 'ready') {
      return { can_import: false };
    }
    
    const blockingBatches: string[] = [];
    
    if (batch.depends_on) {
      const deps = JSON.parse(batch.depends_on);
      for (const depId of deps) {
        const depBatch = this.db.prepare('SELECT name, validation_state, completed_at FROM plan_batches WHERE id = ?')
          .get(depId);
        
        if (!depBatch || depBatch.validation_state !== 'imported' || !depBatch.completed_at) {
          blockingBatches.push(depBatch?.name || depId);
        }
      }
    }
    
    return {
      can_import: blockingBatches.length === 0,
      blocking_batches: blockingBatches.length > 0 ? blockingBatches : undefined
    };
  }
}
```


---

### API Routes Specification

**File:** `backend/src/routes/dev-bots/plans.routes.ts` (COMPLETE REWRITE)

```typescript
/**
 * Plans API Routes
 * Complete rewrite for multi-phase plan system
 */

import { Router, Request, Response } from 'express';
import { requireApiKey } from '../../middleware/auth.js';
import { PlanFileService } from '../../services/planFileService.js';
import { PlanValidationService } from '../../services/planValidationService.js';
import { BatchImportService } from '../../services/batchImportService.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';

export function createPlansRoutes(db: Database.Database, taskQueue: TaskQueueService): Router {
  const router = Router();
  router.use(requireApiKey);
  
  const planFileService = new PlanFileService();
  const validationService = new PlanValidationService(db, planFileService);
  const batchService = new BatchImportService(db, taskQueue);
  
  // ========================================================================
  // Plan Management
  // ========================================================================
  
  /**
   * POST /api/plans/create
   * Create new plan with auto-generated file
   */
  router.post('/create', async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name) {
        return sendError(res, 'Plan name is required', 400);
      }
      
      const planId = `plan-${randomUUID()}`;
      const filePath = await planFileService.createPlanFile(planId, name);
      
      // Create database record
      db.prepare(`
        INSERT INTO plans (id, title, file_path, status, created_at, updated_at, file_version)
        VALUES (?, ?, ?, 'draft', ?, ?, 1)
      `).run(planId, name, filePath, Date.now(), Date.now());
      
      sendSuccess(res, {
        plan_id: planId,
        file_path: filePath,
        version: 1
      }, 201);
    } catch (error) {
      logger.error({ category: 'api', action: 'create_plan_error', error });
      sendError(res, 'Failed to create plan', 500);
    }
  });
  
  /**
   * POST /api/plans/:planId/validate
   * Validate plan file without saving
   */
  router.post('/:planId/validate', async (req: Request, res: Response) => {
    try {
      const { planId } = req.params;
      const fileContent = req.body.content || await planFileService.readPlanFile(planId);
      
      const validationResult = await validationService.validatePlan(planId, fileContent);
      sendSuccess(res, validationResult);
    } catch (error) {
      logger.error({ category: 'api', action: 'validate_plan_error', error });
      sendError(res, 'Validation failed', 500);
    }
  });
  
  /**
   * POST /api/plans/:planId/save
   * Save plan file to database
   */
  router.post('/:planId/save', async (req: Request, res: Response) => {
    try {
      const { planId } = req.params;
      const { message } = req.body;
      
      // Read and validate file
      const fileContent = await planFileService.readPlanFile(planId);
      const validation = await validationService.validatePlan(planId, fileContent);
      
      if (!validation.valid) {
        return sendError(res, 'Validation failed', 400, { errors: validation.errors });
      }
      
      const parsedPlan = await planFileService.parsePlanFile(fileContent);
      const checksum = planFileService.calculateChecksum(fileContent);
      
      db.transaction(() => {
        // Update plan record
        const version = db.prepare('SELECT file_version FROM plans WHERE id = ?').get(planId).file_version + 1;
        
        db.prepare(`
          UPDATE plans SET 
            file_version = ?,
            last_saved_at = ?,
            has_unsaved_changes = 0,
            updated_at = ?,
            markdown_body = ?
          WHERE id = ?
        `).run(version, Date.now(), Date.now(), parsedPlan.markdown_body, planId);
        
        // Save file backup
        db.prepare(`
          INSERT INTO plan_file_backups (id, plan_id, version, content, checksum, created_at, commit_message)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(randomUUID(), planId, version, fileContent, checksum, Date.now(), message);
        
        // Update batches
        for (const batch of parsedPlan.plan.task_batches) {
          const existing = db.prepare('SELECT id FROM plan_batches WHERE id = ?').get(batch.id);
          
          if (!existing) {
            // Insert new batch
            db.prepare(`
              INSERT INTO plan_batches 
              (id, plan_id, name, description, order_num, validation_state, task_definitions, task_count, depends_on)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              batch.id,
              planId,
              batch.name,
              batch.description,
              batch.order_num,
              validation.batches[batch.id].state,
              JSON.stringify(batch.tasks),
              batch.tasks.length,
              JSON.stringify(batch.depends_on || [])
            );
          } else if (validation.batches[batch.id].state === 'ready' || validation.batches[batch.id].state === 'incomplete') {
            // Update only if not imported
            db.prepare(`
              UPDATE plan_batches SET
                name = ?, description = ?, validation_state = ?,
                task_definitions = ?, task_count = ?, depends_on = ?
              WHERE id = ? AND validation_state IN ('invalid', 'incomplete', 'ready')
            `).run(
              batch.name,
              batch.description,
              validation.batches[batch.id].state,
              JSON.stringify(batch.tasks),
              batch.tasks.length,
              JSON.stringify(batch.depends_on || []),
              batch.id
            );
          }
        }
      })();
      
      sendSuccess(res, {
        version,
        saved_at: Date.now(),
        warnings: validation.warnings,
        batches: validation.batches
      });
    } catch (error) {
      logger.error({ category: 'api', action: 'save_plan_error', error });
      sendError(res, 'Save failed', 500);
    }
  });
  
  /**
   * GET /api/plans
   * List all plans
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const plans = db.prepare('SELECT * FROM plans ORDER BY created_at DESC').all();
      sendSuccess(res, { plans });
    } catch (error) {
      sendError(res, 'Failed to list plans', 500);
    }
  });
  
  /**
   * GET /api/plans/:planId
   * Get plan details with progress
   */
  router.get('/:planId', async (req: Request, res: Response) => {
    try {
      const { planId } = req.params;
      const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
      
      if (!plan) {
        return sendError(res, 'Plan not found', 404);
      }
      
      const batches = db.prepare('SELECT * FROM plan_batches WHERE plan_id = ? ORDER BY order_num').all(planId);
      const progress = calculatePlanProgress(planId, batches);
      
      sendSuccess(res, { ...plan, batches, progress });
    } catch (error) {
      sendError(res, 'Failed to get plan', 500);
    }
  });
  
  // ========================================================================
  // Batch Management
  // ========================================================================
  
  /**
   * POST /api/plans/:planId/batches/:batchId/import
   * Import batch to task queue
   */
  router.post('/:planId/batches/:batchId/import', async (req: Request, res: Response) => {
    try {
      const { planId, batchId } = req.params;
      const result = await batchService.importBatch(planId, batchId);
      sendSuccess(res, result);
    } catch (error) {
      logger.error({ category: 'api', action: 'import_batch_error', error });
      sendError(res, error.message || 'Failed to import batch', 400);
    }
  });
  
  /**
   * GET /api/plans/:planId/batches/:batchId/can-import
   * Check if batch can be imported
   */
  router.get('/:planId/batches/:batchId/can-import', async (req: Request, res: Response) => {
    try {
      const { planId, batchId } = req.params;
      const result = await batchService.canImportBatch(planId, batchId);
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 'Failed to check batch import status', 500);
    }
  });
  
  return router;
}
```


---

## Implementation Checklist

### Phase 0: Demolition (0.5 days)
- [ ] Delete old files as specified in deletion list
- [ ] Commit deletions separately: `git commit -m "feat(plans): delete legacy planning system"`
- [ ] Clear existing plan data: `DELETE FROM plans;`

### Phase 1: Core Infrastructure (1.5 days)
- [ ] Run Migration 022 (plan_batches, batch_id, file_backups tables)
- [ ] Implement `backend/src/types/plan.ts` (complete type system)
- [ ] Implement `PlanFileService` (YAML parsing, file I/O)
- [ ] Implement `PlanDatabaseService` (DB operations)
- [ ] Write unit tests for file parsing

### Phase 2: Validation & Import (2 days)
- [ ] Implement `PlanValidationService` (immutability checks, dependency cycles)
- [ ] Implement `BatchImportService` (task queue integration)
- [ ] Implement `FileWatcherService` (smart change detection)
- [ ] Implement API routes (create, save, validate, import)
- [ ] Write integration tests

### Phase 3: Event System (2 days)
- [ ] Implement `PlanEventHandlers` (batch completion, plan completion)
- [ ] Update `taskQueue.sqlite.ts` hooks (add batch_id awareness)
- [ ] Implement WebSocket events for UI updates
- [ ] Test event flow end-to-end

### Phase 4: Admin Bot Integration (1.5 days)
- [ ] Mount `docs/plans/` to admin bot container
- [ ] Add environment variables (PLANS_DIR, PLANS_API_URL)
- [ ] Create `docs/context/admin-bot-plan-management.md`
- [ ] Update admin bot system prompt
- [ ] Test plan creation workflow with admin bot

### Phase 5: UI Implementation (1 day)
- [ ] Rewrite `PlansTabContent.tsx` (remove stubs)
- [ ] Implement `usePlans()` hook
- [ ] Add batch cards with import buttons
- [ ] Add dependency blocking UI
- [ ] Add validation state indicators
- [ ] Test UI with real API

### Phase 6: Testing & Docs (2 days)
- [ ] Write comprehensive test suite
- [ ] Test immutability enforcement
- [ ] Test batch dependency resolution
- [ ] Test concurrent plan creation
- [ ] Update `docs/README.md`
- [ ] Add example plans in `docs/plans/`
- [ ] Create admin bot workflow guide

---

## Success Criteria

**Functional:**
- [ ] Admin bot can create plan via API
- [ ] Admin bot can edit plan file and save
- [ ] Validation detects immutability violations
- [ ] Batches show correct validation states
- [ ] Import buttons only enabled when dependencies met
- [ ] Tasks created in queue with correct batch_id linkage
- [ ] Batch completion triggers progress updates
- [ ] File watcher detects changes and marks unsaved

**Performance:**
- [ ] Plan save < 1 second
- [ ] Batch import < 2 seconds for 10 tasks
- [ ] Validation < 500ms for typical plan
- [ ] File watcher debounce < 100ms

**Quality:**
- [ ] No data loss (file and DB always sync)
- [ ] No race conditions (transaction safety)
- [ ] Clear error messages (validation failures)
- [ ] Comprehensive logging (all operations)

---

## IMPLEMENTATION READY

This document now contains:
- ✅ Complete architectural decisions with rationale
- ✅ Detailed TypeScript type definitions
- ✅ Full database migration SQL
- ✅ Service implementation specifications
- ✅ API route specifications with request/response formats
- ✅ Validation logic details
- ✅ Event system integration points
- ✅ UI component specifications
- ✅ Implementation checklist
- ✅ Testing criteria

**Total estimated effort: 10.5 days**

**Next step:** Assign to dev-bot for implementation using this design as complete specification.


---

## CODEX INTEGRATION RESEARCH - MCP SERVER APPROACH

### Research Summary (2025-11-17)

After comprehensive research into AI agent interfaces and streaming protocols, **Model Context Protocol (MCP)** emerges as the optimal solution for Codex integration with the plan editing system.

### Why MCP?

1. **Industry Standard**: Open standard by Anthropic, adopted by Claude, GitHub Copilot, and major AI platforms
2. **Structured Operations**: Tools instead of raw file access - prevents errors
3. **Universal Compatibility**: Works with Codex, Claude, and any MCP-compatible agent
4. **Security**: Explicit user consent, validated operations, immutability enforcement at tool level
5. **Future-Proof**: Extensible protocol, active ecosystem

### MCP Architecture for Plan Editing

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐         ┌──────────┐
│   Codex /   │         │     MCP     │         │     MCP     │         │   Plan   │
│   Claude /  │ ◄─────► │   Client    │ ◄─────► │   Server    │ ◄─────► │    API   │
│   Agent     │         │             │         │             │         │   / DB   │
└─────────────┘         └─────────────┘         └─────────────┘         └──────────┘
                        JSON-RPC 2.0            stdio/SSE                REST/SQLite
```

### MCP Tools for Plan Editing

```typescript
// MCP Server exposes structured plan editing tools

tools: [
  {
    name: "plan_read",
    description: "Read entire plan file or specific section",
    inputSchema: {
      type: "object",
      properties: {
        plan_id: { type: "string" },
        section: { type: "string", enum: ["all", "yaml", "markdown", "batch"] }
      }
    }
  },
  
  {
    name: "plan_update_field",
    description: "Update a YAML field in plan frontmatter",
    inputSchema: {
      type: "object",
      properties: {
        plan_id: { type: "string" },
        field_path: { type: "string" },  // e.g., "plan.title", "plan.priority"
        value: { type: "any" }
      }
    }
  },
  
  {
    name: "plan_add_batch",
    description: "Add a new task batch to plan",
    inputSchema: {
      type: "object",
      properties: {
        plan_id: { type: "string" },
        batch: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            order_num: { type: "number" },
            depends_on: { type: "array", items: { type: "string" } },
            tasks: { type: "array" }
          }
        }
      }
    }
  },
  
  {
    name: "plan_add_task",
    description: "Add task to specific batch",
    inputSchema: {
      type: "object",
      properties: {
        plan_id: { type: "string" },
        batch_id: { type: "string" },
        task: {
          type: "object",
          properties: {
            title: { type: "string" },
            type: { type: "string" },
            context: { type: "string" },
            success_criteria: { type: "array" },
            estimated_effort_hours: { type: "number" }
          }
        }
      }
    }
  },
  
  {
    name: "plan_validate",
    description: "Validate plan without saving",
    inputSchema: {
      type: "object",
      properties: {
        plan_id: { type: "string" }
      }
    }
  },
  
  {
    name: "plan_save",
    description: "Save plan file to database",
    inputSchema: {
      type: "object",
      properties: {
        plan_id: { type: "string" },
        commit_message: { type: "string" }
      }
    }
  }
]
```

### Implementation Specification

**File:** `backend/src/services/mcpServer/planMcpServer.ts` (NEW)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { z } from "zod";
import { PlanFileService } from "../planFileService.js";
import { PlanValidationService } from "../planValidationService.js";
import Database from "better-sqlite3";

/**
 * MCP Server for Plan Editing
 * Exposes structured tools for AI agents to edit plan files
 */
export class PlanMcpServer {
  private server: McpServer;
  private planFileService: PlanFileService;
  private validationService: PlanValidationService;
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.planFileService = new PlanFileService();
    this.validationService = new PlanValidationService(db, this.planFileService);
    
    this.server = new McpServer({
      name: "app-monitor-plan-editor",
      version: "1.0.0"
    });
    
    this.registerTools();
  }

  private registerTools() {
    // Tool: Read plan
    this.server.tool("plan_read", z.object({
      plan_id: z.string(),
      section: z.enum(["all", "yaml", "markdown", "batch"]).optional()
    }), async ({ plan_id, section = "all" }) => {
      try {
        const planFile = await this.planFileService.readPlanFile(plan_id);
        
        let content: any;
        switch (section) {
          case "yaml":
            content = planFile.plan;
            break;
          case "markdown":
            content = planFile.markdown_body;
            break;
          case "all":
          default:
            content = planFile;
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(content, null, 2) }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });

    // Tool: Update field
    this.server.tool("plan_update_field", z.object({
      plan_id: z.string(),
      field_path: z.string(),
      value: z.any()
    }), async ({ plan_id, field_path, value }) => {
      try {
        const planFile = await this.planFileService.readPlanFile(plan_id);
        
        // Update field using path notation (e.g., "plan.title")
        const pathParts = field_path.split('.');
        let current: any = planFile;
        for (let i = 0; i < pathParts.length - 1; i++) {
          current = current[pathParts[i]];
        }
        current[pathParts[pathParts.length - 1]] = value;
        
        // Write file (doesn't save to DB yet)
        await this.planFileService.writePlanFile(plan_id, planFile);
        
        return {
          content: [{ 
            type: "text", 
            text: `Field ${field_path} updated. Call plan_save to persist.` 
          }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });

    // Tool: Add batch
    this.server.tool("plan_add_batch", z.object({
      plan_id: z.string(),
      batch: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        order_num: z.number(),
        depends_on: z.array(z.string()).optional(),
        tasks: z.array(z.any())
      })
    }), async ({ plan_id, batch }) => {
      try {
        const planFile = await this.planFileService.readPlanFile(plan_id);
        planFile.plan.task_batches.push(batch);
        await this.planFileService.writePlanFile(plan_id, planFile);
        
        return {
          content: [{ 
            type: "text", 
            text: `Batch "${batch.name}" added. Call plan_save to persist.` 
          }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });

    // Tool: Validate
    this.server.tool("plan_validate", z.object({
      plan_id: z.string()
    }), async ({ plan_id }) => {
      try {
        const fileContent = await this.planFileService.readPlanFile(plan_id);
        const validation = await this.validationService.validatePlan(
          plan_id, 
          JSON.stringify(fileContent)
        );
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(validation, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });

    // Tool: Save
    this.server.tool("plan_save", z.object({
      plan_id: z.string(),
      commit_message: z.string().optional()
    }), async ({ plan_id, commit_message }) => {
      try {
        // Trigger save via API (which validates and persists to DB)
        const response = await fetch(`http://localhost:5000/api/plans/${plan_id}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: commit_message })
        });
        
        const result = await response.json();
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("Plan MCP Server started");
  }
}
```

### Deployment Configuration

**File:** `backend/src/services/mcpServer/start-mcp-server.ts`

```typescript
import Database from 'better-sqlite3';
import { PlanMcpServer } from './planMcpServer.js';

const db = new Database('app-monitor.db');
const mcpServer = new PlanMcpServer(db);
mcpServer.start();
```

**Package.json script:**

```json
{
  "scripts": {
    "mcp:start": "node --loader tsx backend/src/services/mcpServer/start-mcp-server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "zod": "^3.22.0"
  }
}
```

### Codex Integration

**Configure Codex to use MCP server:**

```json
// .codex/config.json or Claude Desktop config
{
  "mcpServers": {
    "app-monitor-plans": {
      "command": "npm",
      "args": ["run", "mcp:start"],
      "cwd": "/path/to/app-monitor"
    }
  }
}
```

**Example Codex session:**

```
Human: "Add a new batch for database migrations to plan-caching-layer"

Codex: [Uses plan_read to see current plan]
       [Uses plan_add_batch with batch definition]
       [Uses plan_validate to check]
       [Uses plan_save to persist]
       
       "Added 'Database Migrations' batch with 3 tasks. Plan validated and saved."
```

### Benefits Over Direct File Access

| Aspect | Direct File Edit | MCP Tool Approach |
|--------|------------------|-------------------|
| **Validation** | Manual, error-prone | Automatic, enforced |
| **Immutability** | Must check manually | Enforced at tool level |
| **Multi-agent** | Codex only | Any MCP-compatible agent |
| **Error handling** | Silent failures | Structured error responses |
| **Type safety** | None | Zod schema validation |
| **Audit trail** | File changes only | Tool invocation logs |

### Alternative: Structured Edit API (Fallback)

If MCP proves too complex, fallback to simpler REST endpoint:

```typescript
POST /api/plans/:planId/operations
Request: {
  operations: [
    { type: "add_batch", data: {...} },
    { type: "update_field", data: {...} }
  ]
}
Response: {
  success: boolean,
  results: [...],
  warnings: [...]
}
```

**Estimated effort:** MCP Server: 2-3 days, REST API: 1 day

### Next Steps

1. Install MCP SDK: `npm install @modelcontextprotocol/sdk zod`
2. Implement PlanMcpServer (above specification)
3. Test with Codex CLI
4. Document Codex configuration in `docs/context/admin-bot-plan-management.md`
5. Add to implementation checklist

