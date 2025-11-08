# App-Monitor Architecture Analysis: Recovery Mechanisms & Long-Term Vision

**Analysis Date**: 2025-11-08
**Codebase**: app-monitor (backend)
**Status**: Actively Developed - System Stabilization Phase

---

## Executive Summary

The app-monitor system is a sophisticated automated task execution platform using ephemeral Docker containers with Claude/Codex CLIs. The architecture already includes several sophisticated recovery and resilience patterns built on SQLite-based transactional guarantees. Rather than building new mechanisms, we should extend and optimize the existing patterns.

### Key Findings:
- **Robust Foundation**: Transactional task queue (SQLite) provides atomic operations and strong consistency
- **Two-Stage Recovery System**: Simplified (343 lines), event-driven failure recovery with cleanup→followup pattern
- **Circuit Breaker Pattern**: Docker operations protected with configurable failure thresholds
- **Manual Intervention Design**: No auto-timeouts - complex tasks allowed to run as long as needed
- **State Machine Ready**: Metadata-driven task linking enables sophisticated workflow orchestration
- **Monitoring Ready**: Comprehensive structured logging with 20+ log categories already in place

---

## PART 1: CURRENT RECOVERY MECHANISMS

### 1.1 Simplified Two-Stage Failure Recovery System

**Location**: `backend/src/services/failureRecovery.ts` (343 lines)

**Architecture**:
```
Task Fails → Check Recoverable? → Create Cleanup Task (Stage 1)
                                        ↓
                            Cleanup Completes Successfully?
                                        ↓ Yes
                            Create Followup Task (Stage 2)
                                        ↓
                            Original Goal Achieved
```

**Key Components**:

1. **Failure Detection** (`taskFailureGuards.ts`):
   - 13 predefined failure patterns (CLI incompatibility, missing resources, timeouts, OOM, permission denied, etc.)
   - Pattern matching via regex on stderr/stdout + exit code
   - Categories: `cli_incompatibility`, `resource_not_found`, `permission_denied`, `timeout`, `oom`, `configuration_error`, `system_error`
   - Each pattern includes `suggestedFix` for repair prompts

2. **Recovery Safety Guarantees**:
   - **No Duplicate Repairs**: `hasActiveRepair()` checks for running cleanup/followup before creating new ones
   - **Circular Prevention**: Never attempt recovery on repair bots themselves
   - **Minimal Changes Constraint**: Cleanup tasks limited to <5 files, <100 lines
   - **Protected Files**: Cannot modify package.json, .env, database files
   - **Fail-Safe Followup**: Only created if cleanup completes (status === 'completed')

3. **Recoverable Categories** (hardcoded in `isRecoverable()`):
   - `cli_incompatibility`
   - `missing_resource`
   - `syntax_error`
   - `import_error`
   - `config_error`

4. **Metadata Tracking**:
   ```typescript
   metadata: {
     isRepairBot?: boolean;              // True if this is a repair task
     repairStage?: 'cleanup' | 'followup'; // Which stage
     originalTaskId?: string;             // ID of failed task
     cleanupTaskId?: string;              // ID of cleanup task (followup only)
     originalFailurePattern?: string;     // Error pattern that triggered recovery
     countsTowardsConcurrencyLimit?: boolean; // Queue limit behavior
   }
   ```

5. **Integration Points**:
   - `devBotsManager.ts:836` - Initialize recovery system
   - `devBotsManager.ts:1911-1914` - Hook for followup creation on task completion
   - `devBotsManager.ts:1978-1984` - Attempt recovery when task fails
   - `taskExecution.service.ts:135-212` - `failTaskWithRecovery()` central method

**Configuration**:
```bash
ENABLE_AUTO_RECOVERY=true|false     # Enable/disable (default: false)
RECOVERY_DRY_RUN=true|false          # Log-only mode (default: true)
```

**Logging**:
- All actions logged with `category: 'recovery'`
- Key actions: `cleanup_task_created`, `followup_task_created`, `repair_already_running`, `failure_not_recoverable`, `cleanup_failed_skipping_followup`

---

### 1.2 Task Queue Foundation: SQLite Transactions

**Location**: `backend/src/services/taskQueue.sqlite.ts`

**Key Resilience Features**:

1. **Atomic Task Assignment**:
   - `assignNextTask()` uses transaction to prevent race conditions
   - Single task can only be assigned once
   - No duplicate task processing

2. **Worker Heartbeat Mechanism** (not auto-timeout):
   - `detectStalledWorkers()` - identifies crashed workers via heartbeat
   - Manual intervention via `manuallyTimeoutTask()`
   - No automatic timeouts (complex tasks may legitimately take hours)

3. **ACID Guarantees**:
   - All state changes within `transaction()` wrapper
   - Proper error handling on constraint violations
   - File lock conflict resolution

4. **Manual Intervention Philosophy**:
   - Baseline learning: `getTaskDurationStats()` collects data
   - After 50+ tasks per type/complexity, can enable smart timeouts
   - Operators have `manuallyTimeoutTask()` for infrastructure failures

5. **Task States**:
   ```typescript
   type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
   ```

6. **Execution History**:
   - `assignment_count` tracks requeue attempts
   - `retry_count` and `max_retries` for manual retries
   - Duration tracking: `started_at`, `completed_at`

---

### 1.3 Circuit Breaker Pattern for Docker Operations

**Location**: `backend/src/utils/circuitBreaker.ts`

**Configuration** (in `taskExecution.service.ts`):
```typescript
const circuitBreaker = new CircuitBreaker({
  name: 'docker-execution',
  failureThreshold: 5,        // Open circuit after 5 failures
  resetTimeout: 60000         // Try again after 1 minute
});
```

**States**:
1. **Closed**: Normal operation, requests go through
2. **Open**: Threshold exceeded, fail fast (5 consecutive failures)
3. **Half-Open**: Testing if service recovered (after 1 minute)

**Benefit**: Prevents cascading failures when Docker daemon is down or unresponsive

---

### 1.4 Manual Retry Manager

**Location**: `backend/src/services/retryManager.ts`

**Features**:
- Simple manual retries (no automatic retries)
- Respects `max_retries` and `can_retry` flags
- Stores retry history with reason and error details
- Resets task status to 'pending' for retry
- No exponential backoff (kept simple)

**Limitations**:
- Manual only (not automatic)
- No backoff strategy
- Retry success/failure not tracked automatically

---

### 1.5 Task Execution Flow & Output Capture

**Location**: `backend/src/services/taskExecution.service.ts`

**Execution Pattern** (ephemeral Docker container):
1. **Task Assignment**: Atomic pull from SQLite queue
2. **Agent Selection**: Personality-based (Claude/Codex rotation)
3. **Prompt Generation**: Task context → structured prompt
4. **Container Execution**: Docker run with workspace mounted
5. **Output Capture**: Stdout/stderr captured to files
6. **Failure Detection**: Regex-based pattern matching on output
7. **Recovery Trigger**: If recoverable, create cleanup task

**Output Handling**:
- Standard output → `task.output` field
- Standard error → `task.error` field (if failed)
- Both captured before task.status update
- Logs directory: `./data/logs/` (configurable)

**Failure Point Analysis**:
1. **Container Creation Failed** → Circuit breaker delays retry
2. **Missing CLI in Container** → Immediate failure, recovery unlikely
3. **Invalid Arguments** → Immediate failure, recovery possible (flag fix)
4. **Network Timeout** → Immediate failure, recovery unlikely (depends on type)
5. **Process Killed** → Immediate failure, recovery depends on cause
6. **Agent Not Found** → Fail task immediately, trigger recovery

---

### 1.6 Task Completion Service

**Location**: `backend/src/services/taskCompletion.service.ts`

**Flow**:
1. Update task status to 'completed'
2. Capture output
3. Trigger recovery if needed (cleanup tasks may create followup)
4. Trigger PR workflow if output contains PR info
5. Emit task completion event

**Key Integration**:
- Recovery system listens for cleanup task completion
- Auto-creates followup task on successful cleanup
- PR monitoring system registers created PRs

---

### 1.7 PR Workflow Orchestration

**Location**: `backend/src/services/prWorkflowOrchestrator.service.ts`

**Features**:
- Extracts PR info from bot output
- Registers PR for monitoring (checks, reviews)
- Auto-merge when ready OR creates followup tasks
- Resumes on startup (scans for unmerged PRs)

**State Management**:
- PR status: `creating` → `pending_checks` → `pending_review` → `ready_to_merge` → `merged`
- Check status: `pending` → `success` | `failure`
- Review status: `no_reviews` → `approved` | `changes_requested` | `commented`

---

## PART 2: EXISTING PATTERNS TO EXTEND

### 2.1 Metadata-Driven State Management

**Pattern**: Tasks use `metadata` field for linking and orchestration

**Current Uses**:
- Repair bot identification and linking
- Followup task parentage tracking
- Circular dependency prevention

**Extension Opportunities**:
- Audit trail in metadata (which tasks modified which other tasks)
- Retry reason tracking
- Workspace state snapshots for rollback
- Dependency graphs for parallel execution

---

### 2.2 Event-Driven Architecture

**Pattern**: Task completion handlers trigger downstream actions

**Current Implementations**:
- Task completion → Recovery followup creation
- Task completion → PR workflow orchestration
- Worker startup → Queue polling

**Example from failureRecovery.ts**:
```typescript
// devBotsManager line 1911-1914: Hook for followup task creation on completion
if (metadata?.isRepairBot && metadata?.repairStage === 'cleanup' && status === 'completed') {
  const followup = await this.recovery.createFollowupTask(task);
}
```

**Extension Opportunities**:
- Task lifecycle hooks (pre-execution, post-completion, on-failure)
- Workspace state snapshots triggered on critical events
- Rollback trigger events

---

### 2.3 Workspace Isolation via Docker

**Pattern**: Each task runs in isolated ephemeral container

**Current Approach**:
- Docker `docker run` with workspace mounted via `docker cp`
- Container destroyed after task completion
- No shared state between containers
- Agent rotation (Claude/Codex alternation)

**Benefits**:
- Automatic cleanup (container destroyed)
- No side effects between tasks
- Environment consistency
- Easy to scale

---

### 2.4 Structured Logging System

**Location**: `backend/src/utils/logger.ts`

**Features**:
- Structured JSON logging to file and console
- 20+ categories: `api`, `recovery`, `docker_run`, `process`, `worker`, `pr-workflow`, etc.
- Consistent format: `{category, action, message, details, error, timestamp, severity}`
- Log rotation support
- Cloud logging integration capability

**Current Categories**:
```
api, build, circuit-breaker, cloud, database, docker, lint_error, log_format,
logs, merge_conflict, metrics, mirror_debug, pr-workflow, process, quality,
quality-gates, quality-improvement, quality-observation, recovery, scripts,
socket, system, test, test_failure, token-tracking, utility, verification, workspace
```

---

### 2.5 Database Migrations & Schema Versioning

**Location**: `backend/migrations/` directory

**Current Migrations**:
- 001: Initial schema
- 002: Tasks table
- 003: Documentation only
- 004: Task context tracking
- 005: (Pending) Missing Task interface fields

**Schema Features**:
- Task metadata fields (is_repair_bot, original_task_id, repair_stage)
- PR tracking fields (pr_number, pr_url, pr_branch, pr_status)
- Retry tracking (retry_count, max_retries, can_retry)
- Duration tracking (created_at, started_at, completed_at)
- Rich task data (description, acceptance_criteria, architecture_references, etc.)

---

## PART 3: LONG-TERM VISION & ROADMAP

From `backend/docs/plans/CONSOLIDATED_ROADMAP.md`:

### Phase 1: System Stabilization (Current)
**Status**: In Progress
**Focus**: Get dev-bots running consistently without manual intervention

**Completed**:
- Ephemeral container execution ✅
- Task queue management ✅
- Failure recovery system (simplified) ✅
- PR workflow ✅
- CLI flag compatibility validation ✅

**Remaining**:
- [ ] Task quality improvements (validation warnings)
- [ ] PR tracking schema fix (missing columns)
- [ ] Test coverage improvement

**Success Metrics**:
- Task success rate >80% (currently ~60%)
- Zero invalid agent errors (currently 40%)
- Schema coverage 100% (currently 50%)
- First-attempt success rate >80% (currently ~50%)

---

### Phase 2: Bot Execution Quality
**Goal**: Improve task execution success rate from ~60% to >90%

**Implementation Plan**:

#### Week 1: Validation Layer
- [x] Agent validation (code complete)
- [ ] Task quality validation warnings
- [ ] Files array requirement for technical tasks
- [ ] Description minimum length checks
- [ ] Acceptance criteria specificity checks

#### Week 2: Prompt Enhancement
- [ ] Create `PromptEnhancer` service
- [ ] Step-by-step instruction generator
- [ ] File context inference
- [ ] Acceptance criteria expander
- [ ] Template library for common tasks

#### Week 3: Testing & Metrics
- [ ] Retry failed tasks with enhanced prompts
- [ ] Measure success rate improvement
- [ ] Document best practices
- [ ] Create task creation guidelines

---

### Phase 3: Failure Recovery Optimization
**Status**: Simplified system deployed (73% code reduction)

**Current State**:
- 257 lines (vs. 950 in previous system)
- Event-driven followup creation
- No polling loops
- Simple metadata tracking

**Future Enhancements** (Lower Priority):
1. **Adaptive Recovery**: Learn from successful patterns
2. **Pattern Detection**: Identify recurring failures
3. **Recovery Analytics**: Track success rates by error type
4. **Smart Rollback**: Auto-rollback if followup fails
5. **Recovery Budget**: Limit attempts per task

---

### Phase 4: Database & Performance
**Pending Migrations**:
- [ ] 005: Missing Task interface fields (~30 fields)
- [ ] 006: PR tracking columns (pr_number, pr_url, pr_branch)
- [ ] 007: Performance indexes optimization

**Performance Targets**:
- Task query response: <10ms
- Queue processing: <100ms per cycle
- Container spawn time: <5s
- Log streaming latency: <100ms

---

### Phase 5: Testing Coverage
**Current Coverage**: ~20%
**Critical Paths**: ~40%
**Utils**: ~30%

**Target Coverage** (Q1 2025):
- Overall: 80%+
- Critical paths: 95%+
- Utils: 90%+
- Services: 85%+
- Routes: 80%+

**Test Priorities**:
1. Task execution lifecycle
2. Failure recovery system
3. CLI flag compatibility
4. PR workflow automation
5. Queue management

---

## PART 4: ARCHITECTURAL PATTERNS FOR EXTENSION

### 4.1 Pattern: Metadata-Driven Linking

**Current Use**: Repair bots, PR tracking, followup tasks

**Example Structure**:
```typescript
metadata: {
  // Link to parent task
  parentTaskId?: string;
  
  // Role identification
  isRepairBot?: boolean;
  repairStage?: 'cleanup' | 'followup';
  
  // Audit trail
  createdBy?: string;
  createdReason?: string;
  
  // State snapshots
  workspaceSnapshot?: {
    branchName: string;
    commitHash: string;
    stagedFiles: string[];
    unstagedFiles: string[];
  };
}
```

**Pattern Benefits**:
- Immutable task reference links
- Audit trail for compliance
- Enables graph traversal (parent→children)
- Supports rollback via snapshots

---

### 4.2 Pattern: State Snapshots for Rollback

**Concept**: Capture workspace state at decision points

**Implementation Sketch**:
```typescript
interface WorkspaceSnapshot {
  timestamp: string;
  branchName: string;
  commitHash: string;
  stagedFiles: string[];
  unstagedFiles: string[];
  filesModified: string[];
  filesAdded: string[];
  filesDeleted: string[];
}

// In metadata:
snapshots: {
  taskStart: WorkspaceSnapshot;
  taskCompletion: WorkspaceSnapshot;
  prCreation: WorkspaceSnapshot;
}
```

**Rollback Pattern**:
```
1. Detect failure (followup failed, PR checks failed)
2. Retrieve snapshot from metadata
3. Execute: git reset --hard <snapshot.commitHash>
4. Execute: git checkout <snapshot.branchName>
5. Update task status with rollback info
```

---

### 4.3 Pattern: Event-Driven Recovery Hooks

**Current**: Task completion event triggers followup creation

**Extension**: Pre/post-execution hooks

```typescript
interface ExecutionHooks {
  preExecution?: (task: Task) => Promise<void>;
  postCompletion?: (task: Task, output: string) => Promise<void>;
  onFailure?: (task: Task, error: string) => Promise<void>;
  onCrash?: (task: Task) => Promise<void>;  // NEW
}
```

**Use Cases**:
- `preExecution`: Verify workspace state, backup current branch
- `postCompletion`: Clean up temp files, update metrics
- `onFailure`: Trigger recovery, attempt fix
- `onCrash`: Emergency cleanup, save logs, create incident

---

### 4.4 Pattern: Atomic State Transitions via Transactions

**Current**: SQLite transactions for task queue operations

**Extensible to**:
- Multi-task workflows (all-or-nothing execution)
- PR merge ceremonies (checks + merge in single transaction)
- Recovery workflows (cleanup + followup atomicity)

**Example Use**:
```typescript
// Execute cleanup AND create followup atomically
const result = await db.transaction(() => {
  markCleanupComplete();
  createFollowupTask();
  return { success: true };
})();
```

---

### 4.5 Pattern: Circuit Breaker for External Services

**Current**: Docker execution has circuit breaker

**Extension Candidates**:
- GitHub API calls (PR creation, merge)
- Docker image pulls
- Network-dependent operations

**Benefits**:
- Fail fast on infrastructure issues
- Prevent resource exhaustion
- Graceful degradation

---

## PART 5: KEY FAILURE POINTS & MITIGATIONS

### 5.1 Container Lifecycle Failures

**Failure Point**: Container creation fails (OOM, no disk space, image pull timeout)

**Current Mitigation**:
- Circuit breaker with 5-failure threshold + 1-minute reset
- Logs error to monitoring

**Extension Opportunities**:
- Detect type of failure (OOM vs. image pull timeout)
- Create different recovery tasks based on failure type
- Monitor container resource usage trends

---

### 5.2 Workspace State Corruption

**Failure Point**: Task modifies workspace in unexpected way (uncommitted changes, merge conflict, detached HEAD)

**Current Mitigation**:
- None (each task runs in isolated container)

**Extension Opportunities**:
- Pre-execution: Verify git state (clean working tree)
- Post-execution: Snapshot workspace state
- On failure: Compare snapshots to understand what changed
- Recovery: Reset to pre-execution snapshot if followup fails

---

### 5.3 Agent Unavailability

**Failure Point**: Requested agent doesn't exist or isn't available

**Current Mitigation**:
- Check agent exists before executing
- Fail task immediately
- Trigger recovery (cleanup task unlikely to help)

**Extension Opportunities**:
- Agent fallback logic (use similar agent if requested unavailable)
- Agent health monitoring
- Graceful agent switching during execution

---

### 5.4 Output Capture Failure

**Failure Point**: Task runs but output not captured (file system issue, permissions)

**Current Mitigation**:
- Logs are written to host fs via `docker cp`
- If docker cp fails, task marked as failed

**Extension Opportunities**:
- Stream logs directly (vs. waiting for task completion)
- Store logs in database as backup
- Health check: verify logs directory exists and writable

---

### 5.5 Recovery Loop Prevention

**Failure Point**: Cleanup fails → creates followup → followup fails → creates another cleanup (infinite loop)

**Current Mitigation**:
```typescript
// Circular recovery prevention
if ((task as any).metadata?.isRepairBot) {
  return { recovered: false }; // Never repair a repair bot
}
```

**Strength**: This is well-designed and prevents circular loops

**Extension Opportunities**:
- Track recovery attempts (add counter to metadata)
- Max 3 recovery attempts per original task
- Create incident task after max retries exceeded

---

## PART 6: MONITORING & OBSERVABILITY FOUNDATION

### 6.1 Structured Logging

**Already In Place**:
- Comprehensive logging system (`logger.ts`)
- 20+ log categories
- Structured JSON format
- File + console output
- Error stack trace capture

**Log Query Examples**:
```bash
# Recovery system activity
tail -f logs/dev-monitor-backend.log | grep "category.*recovery"

# Worker failures
tail -f logs/dev-monitor-backend.log | grep "worker_poll_failed"

# Task execution flow
tail -f logs/dev-monitor-backend.log | grep "process"
```

---

### 6.2 Metrics Collection

**MetricsEmitter** (`metricsEmitter.ts`):
- Emits every minute by default
- Metrics: queue depth, active workers, completion rate, success rate
- Circuit breaker status tracking

**Metrics Available**:
```typescript
interface SystemMetrics {
  timestamp: number;
  queueDepth: number;
  activeWorkers: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  avgCompletionTimeMs: number;
  successRate: number;
  circuitBreakerStatus?: {
    state: string;
    failureCount: number;
  };
}
```

---

### 6.3 Health Check Points

**Task Queue Health**:
```typescript
getQueueMetrics() returns:
{
  pending: number;
  running: number;
  completed: number;
  failed: number;
  avg_completion_time_ms: number;
  health_status: 'HEALTHY' | 'MODERATE' | 'HIGH_LOAD';
}
```

**Worker Health**:
```typescript
getWorkerStatus() returns:
{
  running: boolean;
  enabled: boolean;
  consecutiveFailures: number;
  pollIntervalMs: number;
}
```

---

## PART 7: CONFIGURATION & ENVIRONMENT

### Critical Environment Variables

```bash
# Auto-recovery System
ENABLE_AUTO_RECOVERY=true|false       # Default: false
RECOVERY_DRY_RUN=true|false           # Default: true

# Docker
DOCKER_REGISTRY=...                   # Container registry
CLAUDE_IMAGE=...                       # Claude CLI image
CODEX_IMAGE=...                        # Codex CLI image

# Database
DB_PATH=/workspace/dev-bots.db

# Task Queue Worker
TASK_QUEUE_POLL_INTERVAL_MS=5000      # Default: 5000 (5 seconds)
MAX_CONSECUTIVE_FAILURES=10           # Default: 10

# Circuit Breaker
DOCKER_CIRCUIT_BREAKER_THRESHOLD=5    # Default: 5
DOCKER_CIRCUIT_BREAKER_RESET_MS=60000 # Default: 60000 (1 minute)
```

### Configuration Files

- `src/config.ts`: Central configuration
- `src/services/cliFlags.ts`: CLI compatibility layer
- `src/services/taskPromptTemplates.ts`: Prompt generation
- `backend/config/worker-log-streams.json`: Log streaming config

---

## PART 8: RECOMMENDATIONS FOR EXTENSIONS

### 8.1 Implement Workspace State Snapshots (High Priority)

**Why**: Enable intelligent rollback if followup fails

**Implementation**:
1. Before task execution, snapshot git state
2. After task completion, snapshot again
3. Store both in task metadata
4. On followup failure, offer rollback option

**Files to Create**:
- `src/services/workspaceStateSnapshot.ts` - Snapshot management
- `src/utils/gitState.ts` - Git state detection

**Integration Points**:
- `taskExecution.service.ts:preExecution` hook
- `taskCompletion.service.ts:onFollowupFailure` event

---

### 8.2 Extend Recovery Budget System (Medium Priority)

**Why**: Prevent infinite recovery attempts

**Current State**: Single-level recovery (cleanup → followup)

**Proposal**: Track recovery attempts in metadata

```typescript
metadata: {
  originalFailureCount: number;       // How many times the original task failed
  recoveryAttempts: number;           // How many cleanup+followup cycles
  maxRecoveryAttempts: number;        // Default: 3
  recoveryHistory: [{
    cleanupTaskId: string;
    followupTaskId?: string;
    outcome: 'cleanup_failed' | 'followup_failed' | 'success';
  }];
}
```

**Files to Create**:
- Update `failureRecovery.ts` to track budget

---

### 8.3 Add Recovery Analytics (Medium Priority)

**Why**: Understand which error types recover successfully

**Proposal**: Track recovery metrics by error category

```typescript
interface RecoveryMetrics {
  errorCategory: string;           // e.g., 'cli_incompatibility'
  totalAttempts: number;
  successfulCleanups: number;
  successfulFollowups: number;
  overallSuccessRate: number;
  avgCleanupDuration: number;
  avgFollowupDuration: number;
}
```

**Files to Create**:
- `src/services/recoveryAnalytics.ts`

**Query Example**:
```sql
SELECT 
  failure_category,
  COUNT(*) as attempts,
  SUM(CASE WHEN repair_stage='cleanup' AND status='completed' THEN 1 ELSE 0 END) as cleanup_success,
  SUM(CASE WHEN repair_stage='followup' AND status='completed' THEN 1 ELSE 0 END) as followup_success
FROM tasks
WHERE is_repair_bot = 1
GROUP BY failure_category
```

---

### 8.4 Implement Task Dependency Graphs (Lower Priority)

**Why**: Enable parallel execution and dependency validation

**Proposal**: Add task dependency tracking to metadata

```typescript
metadata: {
  dependencies: {
    blockedBy: string[];           // Tasks that must complete first
    blocks: string[];              // Tasks that depend on this
    parallel: string[];            // Can run concurrently
  };
  executionOrder?: number;         // When to run in workflow
}
```

**Benefits**:
- Execute independent tasks in parallel
- Validate circular dependencies
- Support multi-stage workflows

---

### 8.5 Build Agent Health Monitoring (Lower Priority)

**Why**: Understand agent performance variations

**Proposal**: Track metrics per agent

```typescript
interface AgentMetrics {
  agentId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  successRate: number;
  avgDuration: number;
  lastTaskTime: string;
  lastTaskResult: 'success' | 'failure';
}
```

**Existing Foundation**: TaskQueueService already tracks `agent_type` (claude vs codex)

---

## PART 9: TESTING STRATEGY

### Current State
- Overall: ~20%
- Critical paths: ~40%
- Utils: ~30%

### Existing Test Files (Pattern)
- `failureRecovery.test.ts` - Recovery system tests
- `devBotsManager.retry.test.ts` - Retry tests
- `taskQueue.sqlite.test.ts` - Queue tests
- `retryManager.test.ts` - Manual retry tests

### Test Coverage Gaps
1. **Recovery end-to-end**: Create failing task → cleanup created → followup created → success
2. **Circuit breaker**: Failure threshold → open circuit → timeout → half-open
3. **Workspace state**: Pre/post snapshots, rollback scenarios
4. **PR workflow integration**: Task completion → PR creation → checks → merge
5. **Metadata linking**: Verify parent→child task relationships

---

## PART 10: PERFORMANCE CONSIDERATIONS

### Current Bottlenecks (from logs)
1. **Container spawn time**: ~5-30s per task
2. **Queue polling**: 5-second intervals (batched in SQLite)
3. **Log streaming**: Network latency on file operations
4. **Docker cp overhead**: Workspace copy time

### Optimization Opportunities
1. **Parallel Execution**: Use dependency graphs to run independent tasks concurrently
2. **Incremental Workspace Sync**: Instead of full `docker cp`, use Git
3. **Log Streaming**: Real-time stdout/stderr vs. post-execution capture
4. **Agent Warmup**: Pre-load common agents, prepare containers

### Performance Targets (from roadmap)
- Task query response: <10ms ✅ (SQLite)
- Queue processing: <100ms per cycle ✅ (Transaction-based)
- Container spawn time: <5s (goal, currently variable)
- Log streaming latency: <100ms (goal)

---

## PART 11: MIGRATION PATHS

### From Manual to Automatic Recovery
1. Phase 1: Deploy simplified recovery (DONE ✅)
2. Phase 2: Collect recovery metrics (RECOMMENDED)
3. Phase 3: Tune recoverable categories based on success rates
4. Phase 4: Add adaptive recovery (learn from patterns)

### From Single-Task to Multi-Task Workflows
1. Implement task dependencies in metadata
2. Add dependency validation before execution
3. Support branching (parallel execution)
4. Add synchronization points (join operations)

### From Container-Isolated to Persistent Workspaces
1. Current: Ephemeral containers, no shared state
2. Transition: Add workspace snapshots for audit trail
3. Advanced: Persistent workspaces with git-based sync

---

## PART 12: DECISION POINTS & TRADE-OFFS

### Design Decisions Well-Made
1. **Two-stage recovery** (cleanup → followup): Simple, proven pattern
2. **Manual timeouts, not automatic**: Respects complex task durations
3. **SQLite transactions for queue**: Atomic, race-condition-free
4. **Metadata for linking**: Immutable references, audit trail
5. **Event-driven recovery**: No polling, clean separation

### Current Limitations (Acceptable)
1. **Recovery only for specific errors**: Can expand over time
2. **No adaptive learning**: Hardcoded categories (can add later)
3. **No automatic rollback**: Manual intervention required
4. **No agent failover**: Respects agent selection intent

### Trade-offs to Consider
1. **Simplicity vs. Automation**: Current system prioritizes simplicity
2. **Safety vs. Speed**: Current system prioritizes safety (no auto-timeout)
3. **Observability vs. Overhead**: Structured logging has minimal overhead

---

## CONCLUSION

The app-monitor architecture has a **robust foundation** for recovery and resilience:

✅ **Strengths**:
- Event-driven, not polling-based
- Transaction-safe queue with atomic assignment
- Intelligent failure detection and categorization
- Two-stage recovery with safety guarantees
- Extensible metadata for audit trails
- Comprehensive structured logging

⚠️ **Gaps** (addressable):
- No recovery analytics yet
- No recovery budget tracking
- No workspace rollback capability
- Limited observability into recovery success rates

🎯 **Immediate Next Steps**:
1. Implement workspace state snapshots
2. Add recovery budget tracking
3. Collect and analyze recovery metrics
4. Build recovery success rate dashboards
5. Extend recovery categories based on observed patterns

All new work should **extend existing patterns** rather than create new ones:
- Use metadata for linking (not database tables)
- Use events for triggering (not polling)
- Use transactions for consistency (not ad-hoc locking)
- Use structured logging (already comprehensive)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-08
**Next Review**: After Phase 1 completion (2025-11-15)
