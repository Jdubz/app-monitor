# 7-Phase Task Processing System Architecture

**Purpose:** Complete architecture of the phase-based task lifecycle system that replaced child task chains.

**Status:** Production (v0.3.0) - Active since 2025-11-17

**Related:**
- `task-queue-architecture.md` - Database schema and queue management
- `dev-bots-architecture.md` - Execution layer and agent selection
- `master-design-intent.md` - Core philosophy

---

## Overview

The **7-Phase System** is a state machine that guides tasks from planning through PR merge. Each task progresses through discrete phases with validation gates, automatic recovery, and loop capabilities for iterative work (review/fix cycles, test iterations).

### Key Principles

1. **Single Task Entity** - No child tasks, all phases within one task record
2. **Validation Gates** - Phase cannot advance until validator confirms completion
3. **Automatic Recovery** - Failures trigger recovery agent diagnosis
4. **Phase Loops** - Review↔Fixes loop, Test phase has internal loop
5. **Concurrency = Chains** - Phase progression doesn't increase concurrency

---

## Phase Pipeline

### Phase Definitions

| Phase | Name | Purpose | Validator | Max Attempts | Loop | Blocking |
|-------|------|---------|-----------|--------------|------|----------|
| **1** | Planning | Validate task relevance, gather requirements | `PlanningPhaseValidator` | 4 | ❌ Linear | ✅ Can cancel task |
| **2** | Implementation | Write code, create PR | `ImplementationPhaseValidator` | 4 | ❌ Linear | ❌ |
| **3** | Review | Identify code issues with fingerprints | `ReviewPhaseValidator` | 4 | ✅ → Phase 4 | ❌ |
| **4** | Fixes | Correct issues from review | `FixesPhaseValidator` | 4 | ✅ → Phase 3 | ❌ |
| **5** | Test Coverage & Validation | Write tests, run suite, fix failures | `TestPhaseValidator` | 4 | ✅ Internal | ❌ |
| **6** | Cleanup & Docs | Update docs, prune artifacts | `CleanupPhaseValidator` | 4 | ❌ Linear | ❌ |
| **7** | PR Shepherding | Monitor merge gates, auto-merge | `PRShepherdingPhaseValidator` | ∞ | ✅ Until merged | ❌ |

---

## Phase Status State Machine

### Status Values

```typescript
type PhaseStatus = 
  | 'ready'      // Phase can start execution
  | 'running'    // Phase in progress (bot executing)
  | 'validating' // Validator checking completion
  | 'recovering' // Recovery agent diagnosing failure
  | 'complete'   // Phase passed validation, can advance
  | 'blocked';   // Max attempts reached, needs human intervention
```

### State Transitions

```
ready → running → validating → complete → [next phase ready]
              ↓         ↓
              ↓    recovering → running (retry)
              ↓              ↓
              └──────────────┴→ blocked (max attempts)
```

---

## Database Schema

### Task Table Columns

```sql
-- Phase System Fields (added in migration 026)
ALTER TABLE tasks ADD COLUMN phase_index INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN phase_name TEXT DEFAULT 'Planning';
ALTER TABLE tasks ADD COLUMN phase_status TEXT DEFAULT 'ready';
ALTER TABLE tasks ADD COLUMN phase_attempts INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN phase_payload TEXT; -- JSON for phase-specific state

-- Indexes for phase queries
CREATE INDEX idx_tasks_phase_status ON tasks(phase_index, phase_status);
CREATE INDEX idx_tasks_phase_ready ON tasks(phase_status) WHERE phase_status = 'ready';
```

### Historical Tracking

**Table:** `task_stage_runs`

```sql
CREATE TABLE task_stage_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  stage_number INTEGER NOT NULL,
  stage_name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success' | 'failed' | 'blocked'
  
  -- Execution tracking
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  duration_ms INTEGER,
  
  -- Artifacts
  artifacts TEXT, -- JSON array of {type, path, size, hash}
  
  -- Recovery
  recovery_attempted BOOLEAN DEFAULT 0,
  recovery_diagnosis TEXT, -- JSON RecoveryDiagnosis
  
  -- Metadata
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_stage_runs_task ON task_stage_runs(task_id, stage_number);
CREATE INDEX idx_stage_runs_status ON task_stage_runs(status);
```

---

## Phase Orchestration

### Orchestrator Service

**File:** `backend/src/services/phaseOrchestrator.service.ts`

**Responsibilities:**
1. Execute current phase (bot invocation)
2. Run phase validator after execution
3. Handle validation results (advance, loop, recover, block)
4. Update task state and historical records
5. WebSocket event emission for real-time UI

### Execution Flow

```typescript
async executePhase(task: Task): Promise<void> {
  // 1. Mark phase as running
  await updateTaskPhaseStatus(task.id, 'running');
  emit('phase:started', { taskId, phase: task.phase_index });

  // 2. Execute phase with bot
  const result = await executeBotForPhase(task);

  // 3. Mark phase as validating
  await updateTaskPhaseStatus(task.id, 'validating');
  emit('phase:validating', { taskId, phase: task.phase_index });

  // 4. Run validator
  const validator = getValidator(task.phase_index);
  const validation = await validator.validate(task, result);

  // 5. Handle validation result
  if (validation.passed) {
    await advancePhase(task, validation);
  } else if (task.phase_attempts < MAX_ATTEMPTS) {
    await retryPhaseWithRecovery(task, validation);
  } else {
    await blockPhase(task, validation);
  }
}
```

---

## Phase Validators

### Validator Interface

```typescript
interface PhaseValidator {
  readonly phaseName: string;
  readonly phaseIndex: number;
  
  /**
   * Validate phase completion
   * @returns ValidationResult with passed/failed + optional next phase override
   */
  validate(task: Task, executionResult: ExecutionResult): Promise<ValidationResult>;
}

interface ValidationResult {
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
  
  // Optional phase routing
  nextPhase?: number; // Override default advancement (for loops)
  shouldBlock?: boolean; // Force blocking even if attempts remain
}
```

### Validator Implementations

**Phase 1: Planning Validator**
- ✅ Task is actionable (not obsolete/duplicate)
- ✅ Requirements gathered (acceptance criteria defined)
- ✅ Architecture references identified
- ❌ Can cancel task if obsolete (sets task status to 'cancelled')

**Phase 2: Implementation Validator**
- ✅ PR created with code changes
- ✅ Files match expected scope
- ✅ No scope creep detected
- ✅ Commits follow conventions

**Phase 3: Review Validator**
- ✅ Issues identified and fingerprinted
- ✅ No critical blocking issues (if found → Phase 4)
- ✅ All issues have resolution plans
- **Loop Logic:** `issues.length > 0 ? nextPhase = 4 : nextPhase = 5`

**Phase 4: Fixes Validator**
- ✅ All flagged issues addressed
- ✅ Changes committed to PR
- ✅ No new scope introduced
- **Loop Logic:** Always returns `nextPhase = 3` (re-review)

**Phase 5: Test Validator**
- ✅ Test coverage ≥ 80% (or waived)
- ✅ All tests passing
- ✅ No test failures in recent runs
- **Internal Loop:** Stays in Phase 5 until tests pass

**Phase 6: Cleanup Validator**
- ✅ Documentation updated
- ✅ Temporary artifacts removed
- ✅ PR description accurate
- ✅ No dead code introduced

**Phase 7: PR Shepherding Validator**
- ✅ All merge gates passing
- ✅ PR approved (if required)
- ✅ CI checks green
- ✅ PR merged successfully
- **Completion:** Closes chain when PR merged

---

## Phase Loops

### Review ↔ Fixes Loop (Phases 3-4)

```
Phase 3: Review
  ├─ No issues found → Advance to Phase 5
  └─ Issues found
      ├─ Phase 4: Fix issues
      └─ Return to Phase 3 (re-review)
           ├─ Issues resolved → Advance to Phase 5
           └─ New issues OR unresolved → Phase 4 again
                └─ [Loop continues until clean or max attempts]
```

**Loop Limit:** Combined attempts across Phase 3 + Phase 4 ≤ 8 (4 each)

**Blocking Condition:** If 8 attempts exhausted and issues remain → Block chain

---

### Test Phase Internal Loop (Phase 5)

```
Phase 5: Test Coverage & Validation
  ├─ Write tests (if coverage < 80%)
  ├─ Run test suite
  ├─ Tests fail?
  │   ├─ Fix test failures (internal loop)
  │   └─ Re-run tests (stay in Phase 5)
  └─ Tests pass → Advance to Phase 6
```

**Implementation:** Phase 5 validator returns `nextPhase = 5` when tests fail, allowing bot to fix and retry within the same phase.

**Loop Limit:** `phase_attempts ≤ 4` (total retries in Phase 5)

---

## Recovery System

### Recovery Agent Integration

**File:** `backend/src/services/recoveryAgent.service.ts`

**Trigger:** Phase validation fails

**Process:**
1. Phase validator detects failure
2. Orchestrator marks phase as `recovering`
3. Recovery agent analyzes:
   - Execution logs
   - Validation failure details
   - Task context
   - Previous attempts
4. Recovery agent produces diagnosis:
   ```typescript
   interface RecoveryDiagnosis {
     issueType: 'scope_creep' | 'test_failure' | 'merge_conflict' | 'infra' | 'unknown';
     rootCause: string;
     suggestedFix: string;
     confidence: 'low' | 'medium' | 'high';
     shouldRetry: boolean;
     shouldBlock: boolean;
   }
   ```
5. Orchestrator updates `task_stage_runs` with diagnosis
6. If `shouldRetry`, increment `phase_attempts` and retry
7. If `shouldBlock`, mark phase as `blocked`

---

## Concurrency Control

### Phase Progression ≠ New Chains

**Key Insight:** Phases are execution stages within a single task chain.

```typescript
// Task belongs to chain
interface Task {
  id: string;
  chain_id: string;        // UUID - same throughout all phases
  chain_depth: number;     // 0 for original task
  
  phase_index: number;     // Current phase (1-7)
  phase_status: PhaseStatus;
}

// Chain concurrency limit
const maxConcurrentChains = 3; // From config.devBots.maxWorkers

// Active chains count
const activeChains = db.query(`
  SELECT COUNT(DISTINCT chain_id) 
  FROM tasks 
  WHERE chain_status = 'active'
`);

// Can start new chain?
const canStartNewChain = activeChains < maxConcurrentChains;
```

**Example:**

```
Active Chains (3 max):
┌────────────────────────────────────┐
│ Chain A: task-001 @ Phase 5       │ ← Slot 1/3
│ Chain B: task-002 @ Phase 3↔4     │ ← Slot 2/3
│ Chain C: task-003 @ Phase 7       │ ← Slot 3/3
└────────────────────────────────────┘

Queued Tasks:
- task-004 (can't start - no chain slots)
- task-005 (can't start - no chain slots)
```

**Phase advancement within a chain does NOT consume additional concurrency slots.**

---

## WebSocket Events

### Real-Time Phase Updates

**Events Emitted:**

```typescript
// Phase lifecycle
socket.emit('phase:started', {
  taskId: string;
  phase: number;
  phaseName: string;
  timestamp: number;
});

socket.emit('phase:validating', {
  taskId: string;
  phase: number;
  timestamp: number;
});

socket.emit('phase:completed', {
  taskId: string;
  phase: number;
  phaseName: string;
  nextPhase: number;
  timestamp: number;
});

socket.emit('phase:recovering', {
  taskId: string;
  phase: number;
  diagnosis: RecoveryDiagnosis;
  timestamp: number;
});

socket.emit('phase:blocked', {
  taskId: string;
  phase: number;
  reason: string;
  timestamp: number;
});
```

**Frontend Integration:**
- Live phase progress indicators
- Phase history timeline
- Recovery diagnosis display
- Auto-refresh on phase updates

---

## API Endpoints

### Phase Management

```typescript
// Get task phase status
GET /api/dev-bots/tasks/:taskId/phase
Response: {
  phase_index: number;
  phase_name: string;
  phase_status: PhaseStatus;
  phase_attempts: number;
  phase_payload?: Record<string, unknown>;
}

// Get phase history
GET /api/dev-bots/tasks/:taskId/phase-history
Response: {
  stages: StageRun[];
  total_duration_ms: number;
  loop_iterations: {
    review_fix: number; // Phase 3↔4 loops
    test: number;       // Phase 5 internal loops
  };
}

// Force phase advancement (admin)
POST /api/dev-bots/tasks/:taskId/phase/advance
Body: { override_validation: boolean; }
Response: { success: boolean; new_phase: number; }

// Unblock phase (admin)
POST /api/dev-bots/tasks/:taskId/phase/unblock
Response: { success: boolean; phase_status: 'ready'; }
```

---

## Migration from Legacy System

### What Changed

**Before (Child Task System):**
```
Implementation Task (parent)
  ├─ REVIEW Task (child)
  ├─ FIX Task (child)
  ├─ REVIEW Task (child)
  ├─ FIX Task (child)
  └─ COMPLETE Task (child)
```

**After (Phase System):**
```
Task (single entity)
  ├─ Phase 1: Planning (complete)
  ├─ Phase 2: Implementation (complete)
  ├─ Phase 3: Review (complete) ─┐
  ├─ Phase 4: Fixes (complete)   │ (loop)
  ├─ Phase 3: Review (complete) ─┘
  ├─ Phase 5: Test (running)
  ├─ Phase 6: Cleanup (ready)
  └─ Phase 7: PR Shepherding (ready)
```

### Backward Compatibility

**Legacy Columns (Deprecated):**
- `queue_stage` - No longer used (phase system replaces this)
- `original_task_id` - No longer used (no child tasks)

**Migration Strategy:**
- New tasks created with `phase_index = 1`
- Old tasks continue with legacy system until completion
- No automatic migration of in-flight tasks

---

## Phase Metrics & Observability

### Metrics API

```typescript
// Phase completion rates
GET /api/metrics/phases
Response: {
  phase_1_success_rate: 95.2,
  phase_2_success_rate: 88.1,
  phase_3_4_loop_avg: 1.8,  // Avg review/fix iterations
  phase_5_retry_avg: 1.2,    // Avg test retries
  blocked_rate: 2.1,
  avg_total_duration_ms: 1800000 // 30 minutes
}

// Phase bottlenecks
GET /api/metrics/phases/bottlenecks
Response: {
  slowest_phase: 5,          // Test phase
  avg_duration_phase_5: 600000, // 10 minutes
  common_failures: [
    { phase: 3, reason: 'scope_creep', count: 12 },
    { phase: 5, reason: 'test_failures', count: 8 }
  ]
}
```

### Logging

**Structured Log Format:**
```typescript
logger.info({
  category: 'phase',
  action: 'transition',
  message: 'Phase completed, advancing',
  details: {
    taskId,
    fromPhase: 3,
    toPhase: 4,
    reason: 'issues_found',
    issueCount: 5,
    attemptNumber: 2
  }
});
```

---

## Testing Strategy

### Unit Tests

**Validators:** Each validator has 100% test coverage
- Happy path (validation passes)
- Failure path (validation fails)
- Loop logic (Phase 3→4→3, Phase 5 internal)
- Edge cases (empty results, malformed data)

**Orchestrator:**
- Phase execution flow
- State transitions
- Recovery integration
- WebSocket emission

### Integration Tests

**Phase Pipeline:**
- Complete task lifecycle (Phases 1-7)
- Review/fix loop iterations
- Test phase retry logic
- Blocking conditions

**Database:**
- Phase state persistence
- Historical tracking
- Concurrent phase updates

---

## Future Enhancements

### Planned (Not Implemented)

1. **Phase Templates** - Pre-configured phase sequences for different task types
2. **Phase Parallelization** - Run independent phases concurrently (e.g., docs + tests)
3. **Custom Validators** - User-defined validation logic per task
4. **Phase Timeouts** - Auto-fail phases exceeding time limits
5. **Phase Rollback** - Undo phase advancement if subsequent phase fails

---

## Related Documentation

- **`task-queue-architecture.md`** - Database schema, queue management
- **`dev-bots-architecture.md`** - Execution layer, agent selection
- **`docs/technicalDesigns/error-detection-and-recovery-design.md`** - Recovery agent details
- **`docs/analysis/COMPREHENSIVE_IMPLEMENTATION_AUDIT.md`** - Implementation audit results

---

**Last Updated:** 2025-11-17  
**Status:** Production Active (v0.3.0)  
**Next Review:** Q1 2026 (after 3 months of production usage)
