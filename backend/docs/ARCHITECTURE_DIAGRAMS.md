# App-Monitor Architecture Diagrams & Data Flows

This document contains visual representations of the key systems and data flows.

---

## 1. Task Execution & Recovery Flow

### Complete Lifecycle (Happy Path)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. TASK CREATION                                                    │
│ POST /api/dev-bots/tasks                                            │
│ - Validate agent exists                                             │
│ - Validate task quality (warnings)                                  │
│ - Create Task record in SQLite                                      │
│ - Status: pending, Priority: configured                             │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   │ Task added to queue.pending
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. TASK QUEUE WORKER                                                │
│ taskQueueWorker.ts - Background polling                             │
│ - Poll queue every 5 seconds for pending tasks                      │
│ - Call assignNextTask()                                             │
│ - Max concurrent workers: configurable (default: 2)                 │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   │ If pending tasks & capacity available
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. ATOMIC TASK ASSIGNMENT                                           │
│ taskQueue.sqlite.ts:assignNextTask()                                │
│ - SQLite transaction (ACID guarantees)                              │
│ - SELECT highest priority pending task                              │
│ - UPDATE status to 'running'                                        │
│ - UPDATE assigned_worker, assigned_at                               │
│ - Commit transaction                                                │
│ - Return task or null (no duplicates possible)                      │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   │ Task acquired exclusively
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. AGENT SELECTION & VALIDATION                                     │
│ taskExecution.service.ts:assignNextTask()                           │
│ - Get agent personality by assigned_agent name                      │
│ - If agent not found: FAIL TASK, trigger recovery                   │
│ - Select agent type (Claude/Codex alternation)                      │
│ - Generate task prompt (context-aware)                              │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   │ Agent validated, prompt generated
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. DOCKER CONTAINER EXECUTION                                       │
│ taskExecution.service.ts:executeTaskWithDockerRun()                 │
│ - Use circuit breaker (5 failures → 60s timeout)                    │
│ - docker run --rm -v workspace:/workspace image                     │
│ - Execute: claude < task-prompt.txt                                 │
│ - Capture stdout → task.output                                      │
│ - Capture stderr, exitCode                                          │
│ - Container auto-destroyed (--rm)                                   │
│                                                                      │
│ If Docker fails:                                                     │
│ - Circuit breaker increments failure count                          │
│ - If threshold exceeded (5): open circuit for 60s                   │
│ - Fail task, trigger recovery (if recoverable)                      │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   │ Task executed, output captured
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. FAILURE DETECTION & PATTERN MATCHING                             │
│ taskFailureGuards.ts:detectFailurePattern()                         │
│ - If exitCode !== 0:                                                │
│   - Check stderr + stdout against 13 failure patterns               │
│   - Pattern match using regex                                       │
│   - Return FailurePattern {name, category, suggestedFix}            │
│ - If exitCode === 0:                                                │
│   - Mark task as COMPLETED                                          │
│   - Proceed to task completion flow                                 │
│                                                                      │
│ Failure Patterns (recoverable):                                      │
│ - cli_incompatibility (invalid flags, version mismatch)             │
│ - missing_resource (missing files, dependencies)                    │
│ - syntax_error (code problems)                                      │
│ - import_error (module not found)                                   │
│ - config_error (configuration issues)                               │
│                                                                      │
│ Other Patterns (non-recoverable):                                    │
│ - permission_denied, timeout, oom, system_error, etc.               │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ├─── Task Success (exitCode=0) ────────────┐
                   │                                          │
                   │                              TASK COMPLETION
                   │                              (see flow #7)
                   │
                   └─── Task Failed & Recoverable ───┐
                   │                                │
                   ▼                                │
┌──────────────────────────────────────────────────┤
│ RECOVERY: FAILURE DETECTED                       │
│ failureRecovery.ts:attemptRecovery()             │
│                                                  │
│ 1. Check: Is this a repair bot itself?           │
│    YES → Don't repair repairs (circular)         │
│    NO  → Continue                                │
│                                                  │
│ 2. Check: Does task already have active repair?  │
│    YES → Skip (hasActiveRepair() check)          │
│    NO  → Continue                                │
│                                                  │
│ 3. Check: Is failure recoverable?                │
│    YES → Create cleanup task (Stage 1)           │
│    NO  → Give up, log failure_not_recoverable    │
│                                                  │
│ 4. Create Cleanup Task:                          │
│    - Type: 'implementation'                      │
│    - Title: '[CLEANUP] Fix {error} for {title}'  │
│    - Description: {buildCleanupPrompt}           │
│    - Priority: 100 (jump to front)               │
│    - metadata.isRepairBot = true                 │
│    - metadata.repairStage = 'cleanup'            │
│    - metadata.originalTaskId = {task.id}         │
│    - Add to queue as pending task                │
│                                                  │
│ 5. Log: cleanup_task_created                     │
│    Details: originalTaskId, cleanupTaskId        │
└──────────────────┬───────────────────────────────┘
                   │
                   │ Cleanup task created, entered queue
                   │ Will be picked up by next poll cycle
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ RECOVERY: STAGE 1 - CLEANUP TASK EXECUTION                          │
│ (Same as Step 5-6, but with cleanup-specific prompt)                │
│                                                                      │
│ Cleanup Prompt Template:                                            │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ # Cleanup Task: Fix Error Only                                  │ │
│ │                                                                  │ │
│ │ ## What Went Wrong                                              │ │
│ │ Task "..." failed with:                                         │ │
│ │ - Error: {failurePattern.name}                                  │ │
│ │ - Category: {failurePattern.category}                           │ │
│ │ - Exit Code: {exitCode}                                         │ │
│ │                                                                  │ │
│ │ Error Output:                                                   │ │
│ │ ```                                                              │ │
│ │ {stderr snippet}                                                │ │
│ │ ```                                                              │ │
│ │                                                                  │ │
│ │ ## Your ONLY Job                                                │ │
│ │ Fix the error. Nothing else.                                    │ │
│ │ {suggestedFix}                                                  │ │
│ │                                                                  │ │
│ │ ## Constraints                                                  │ │
│ │ - Fix ONLY the error                                            │ │
│ │ - Do NOT try to complete the original goal                      │ │
│ │ - Keep changes minimal (< 5 files, < 100 lines)                 │ │
│ │ - Protected: package.json, .env, database files                 │ │
│ │ - Commit message: "fix: {failurePattern.name}"                  │ │
│ │                                                                  │ │
│ │ ## Success = Error Fixed                                        │ │
│ │ The followup bot will complete the original goal.               │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ Cleanup Task Execution:                                             │
│ - Run docker with cleanup prompt                                    │
│ - Exit with code 0 (success) or 1 (failure)                         │
│ - If success: proceed to Followup Creation                          │
│ - If failure: log cleanup_failed_skipping_followup                  │
│                                                                      │
│ Safety Constraints Enforced:                                        │
│ - Cleanup tasks limited to <5 files, <100 lines                     │
│ - Protected files cannot be modified                                │
│ - Task cannot be promoted to followup if cleanup fails              │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   │ Cleanup task completes (success or failure)
                   │ Task completion handler invoked
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ RECOVERY: STAGE 2 - FOLLOWUP CREATION (IF CLEANUP SUCCEEDED)        │
│ taskCompletion.service.ts → failureRecovery.ts                      │
│                                                                      │
│ Trigger: cleanup task status = 'completed' AND isRepairBot=true     │
│          AND repairStage='cleanup'                                  │
│                                                                      │
│ 1. Verify cleanup succeeded (status === 'completed')                │
│    If cleanup failed → SKIP FOLLOWUP                                │
│                                                                      │
│ 2. Retrieve original task from queue                                │
│    If not found → Log error, skip                                   │
│                                                                      │
│ 3. Create Followup Task:                                            │
│    - Type: {original task type}                                     │
│    - Title: '[FOLLOWUP] {original title}'                           │
│    - Description: {buildFollowupPrompt}                             │
│    - Assigned Agent: {original agent}                               │
│    - Priority: 100 (high)                                           │
│    - metadata.isRepairBot = true                                    │
│    - metadata.repairStage = 'followup'                              │
│    - metadata.originalTaskId = {original task}                      │
│    - metadata.cleanupTaskId = {cleanup task}                        │
│                                                                      │
│ 4. Log: followup_task_created                                       │
│    Details: originalTaskId, cleanupTaskId, followupTaskId           │
│                                                                      │
│ Followup Prompt Template:                                           │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ # Followup Task: Complete Original Goal                          │ │
│ │                                                                  │ │
│ │ ## Original Task                                                │ │
│ │ Title: {original.title}                                         │ │
│ │ Description: {original.description}                             │ │
│ │                                                                  │ │
│ │ ## What Happened                                                │ │
│ │ 1. Original task failed                                         │ │
│ │ 2. Cleanup bot fixed the error (see task {cleanup.id})          │ │
│ │ 3. Now you need to complete the original goal                   │ │
│ │                                                                  │ │
│ │ ## Your Job                                                     │ │
│ │ Complete what the original task was trying to do.               │ │
│ │                                                                  │ │
│ │ The error is already fixed. Just focus on achieving the goal.   │ │
│ │                                                                  │ │
│ │ ## Success Criteria                                             │ │
│ │ {original acceptance criteria}                                  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ Followup Task Execution:                                            │
│ - Sent to queue with priority 100                                   │
│ - Picked up by next available worker                                │
│ - Executed same as any other task                                   │
│ - If successful: original goal achieved, recovery complete          │
│ - If fails: logged as failure (no further recovery)                 │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
                RECOVERY COMPLETE
              (Original goal achieved
               OR recovery exhausted)
```

---

## 2. Task Completion Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ TASK COMPLETION                                                     │
│ taskExecution.service.ts (after Docker execution)                   │
│                                                                      │
│ If exitCode === 0:                                                   │
│   status = 'completed'                                              │
│   output = {captured stdout}                                        │
│ Else:                                                                │
│   status = 'failed'                                                 │
│   error = {error message or stderr}                                 │
│                                                                      │
│ UPDATE tasks SET status=?, output=?, completed_at=NOW              │
│ COMMIT TRANSACTION                                                  │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TASK COMPLETION HANDLER                                             │
│ taskCompletion.service.ts                                           │
│                                                                      │
│ For completed tasks:                                                │
│ 1. Check if cleanup task → create followup (recovery flow)          │
│ 2. Extract PR info from output (regex patterns)                     │
│ 3. Register PR for monitoring (pr-workflow)                         │
│ 4. Emit task_completed event                                        │
│                                                                      │
│ For failed tasks:                                                   │
│ 1. Detect failure pattern (taskFailureGuards)                       │
│ 2. Trigger recovery if recoverable                                  │
│ 3. Emit task_failed event                                           │
│                                                                      │
│ Failure Recovery Attempt:                                           │
│ failureRecovery.ts:attemptRecovery()                                │
│ - Check recoverable (5 categories)                                  │
│ - Check no active repair                                            │
│ - Create cleanup task (Stage 1)                                     │
│                                                                      │
│ PR Workflow:                                                        │
│ prWorkflowOrchestrator.ts:handleTaskCompletion()                    │
│ - Extract PR number, URL, branch from output                        │
│ - Register PR for monitoring                                        │
│ - Monitor: checks, reviews, auto-merge                              │
│ - Create followup tasks if checks fail                              │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
          TASK LIFECYCLE COMPLETE
        (Success + PR tracking OR
         Failure + Recovery initiated)
```

---

## 3. Metadata & State Management

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TASK METADATA STRUCTURE (JSON field in tasks table)                      │
│                                                                           │
│ metadata: {                                                              │
│   // Recovery System                                                     │
│   isRepairBot?: boolean;                    // True if cleanup/followup   │
│   repairStage?: 'cleanup' | 'followup';     // Which stage               │
│   originalTaskId?: string;                  // Parent task ID            │
│   cleanupTaskId?: string;                   // Cleanup task ID (for FU)   │
│   originalFailurePattern?: string;          // What error we're fixing    │
│                                                                           │
│   // PR Workflow                                                         │
│   pr_number?: number;                       // GitHub PR number          │
│   pr_url?: string;                          // Full PR URL                │
│   pr_branch?: string;                       // Feature branch name        │
│   pr_status?: string;                       // creating|pending_checks... │
│                                                                           │
│   // Future Extensions (Recommended)                                     │
│   countsTowardsConcurrencyLimit?: boolean;  // Queue limit behavior      │
│   // workspace_snapshot?: {                 // For rollback capability   │
│   //   branchName: string;                                               │
│   //   commitHash: string;                                               │
│   //   stagedFiles: string[];                                            │
│   // };                                                                  │
│                                                                           │
│   // recovery_budget?: {                    // For limiting retries      │
│   //   originalAttempts: number;                                         │
│   //   recoveryAttempts: number;                                         │
│   //   maxRecoveryAttempts: number;                                      │
│   // };                                                                  │
│                                                                           │
│   // task_dependencies?: {                  // For parallel execution    │
│   //   blockedBy: string[];                 // Tasks that must finish    │
│   //   blocks: string[];                    // Dependent tasks           │
│   //   parallel: string[];                  // Can run concurrently      │
│   // };                                                                  │
│ }                                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Circuit Breaker State Machine

```
                      CLOSED (Normal Operation)
                         ├─────────────────────┐
                         │ Request succeeds    │
                         │ → Failure count = 0 │
                         └─────────────────────┘
                              │ ▲
                              │ │ Reset (after timeout)
                              │ │
                              ▼ │
    Failure #5:        HALF-OPEN (Recovery Test)
    Open circuit       ├─────────────────────────┐
         │             │ Test request sent       │
         │             │ Success? → CLOSED       │
         │             │ Failure? → OPEN        │
         └────────────▶│ Timeout? → OPEN        │
                       └─────────────────────────┘
                              │ ▲
                              │ │
                              ▼ │
                         OPEN (Fail Fast)
                    ├───────────────────────────┐
                    │ All requests fail fast    │
                    │ Failures: 1..5 (increment)│
                    │ After 60s: → HALF-OPEN   │
                    └───────────────────────────┘

Configuration:
- failureThreshold: 5
- resetTimeout: 60000ms (1 minute)
- name: 'docker-execution'
```

---

## 5. Database Transaction Flow (Atomicity)

```
┌──────────────────────────────────────┐
│ BEGIN TRANSACTION                    │
│                                      │
│ 1. SELECT * FROM tasks               │
│    WHERE status = 'pending'          │
│    ORDER BY priority DESC            │
│    LIMIT 1                           │
│                                      │
│ 2. IF task found:                    │
│    UPDATE tasks                      │
│    SET status = 'running',           │
│        assigned_worker = ?,          │
│        assigned_at = ?               │
│    WHERE id = ?                      │
│                                      │
│ 3. ELSE:                             │
│    Return NULL                       │
│                                      │
│ 4. COMMIT / ROLLBACK                 │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ ATOMICITY GUARANTEE:             │ │
│ │ Either both steps execute, or    │ │
│ │ neither does. No partial state.  │ │
│ │ No duplicate assignments.        │ │
│ │ No lost updates.                 │ │
│ └──────────────────────────────────┘ │
│                                      │
└──────────────────────────────────────┘

Result: Exactly one worker gets exactly
        one task. No duplicates possible.
```

---

## 6. Logging Categories & Filtering

```
┌────────────────────────────────────────────────────────────────┐
│ STRUCTURED LOGGING                                             │
│ logger.info({ category, action, message, details, error })   │
│                                                                │
│ Log Categories (20+):                                          │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ api                  - HTTP requests/responses              │ │
│ │ build                - Build system events                  │ │
│ │ circuit-breaker      - Circuit breaker state changes        │ │
│ │ docker_run           - Container execution events           │ │
│ │ process              - Worker lifecycle                     │ │
│ │ recovery             - Failure recovery system              │ │
│ │ pr-workflow          - PR monitoring & automation           │ │
│ │ metrics              - System metrics emission              │ │
│ │ database             - Database operations                  │ │
│ │ queue                - Task queue operations                │ │
│ │ task                 - Task lifecycle                       │ │
│ │ [13 more categories]                                       │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ Log Output:                                                    │
│ ├─ File: ./logs/dev-monitor-backend.log (JSON)               │ │
│ │  {"severity":"INFO","timestamp":"...","category":"recovery" │ │
│ │   "action":"cleanup_task_created","message":"...","details  │ │
│ │   {"originalTaskId":"...","cleanupTaskId":"..."}           │ │
│ │                                                             │ │
│ └─ Console: Formatted text (development)                     │ │
│    [INFO] [recovery] cleanup_task_created: ...               │ │
│                                                                │
│ Query Examples:                                                │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ # Recovery activity                                         │ │
│ │ $ tail -f logs/dev-monitor-backend.log | \                │ │
│ │   jq 'select(.category=="recovery")'                       │ │
│ │                                                             │ │
│ │ # Worker errors                                             │ │
│ │ $ tail -f logs/dev-monitor-backend.log | \                │ │
│ │   jq 'select(.category=="process" and .error != null)'    │ │
│ │                                                             │ │
│ │ # All recovery failures                                     │ │
│ │ $ tail -f logs/dev-monitor-backend.log | \                │ │
│ │   jq 'select(.category=="recovery" and                      │ │
│ │        (.action | contains("failed")))'                     │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 7. Extensible Pattern: Pre/Post Execution Hooks

```
(Future capability based on existing patterns)

┌─────────────────────────────────────────────────────────────────┐
│ EXECUTION HOOKS PATTERN (Proposed)                              │
│                                                                 │
│ interface ExecutionHooks {                                      │
│   preExecution?: (task: Task) => Promise<void>;                │
│   postCompletion?: (task: Task, output: string) => Promise<...> │
│   onFailure?: (task: Task, error: string) => Promise<void>;    │
│   onCrash?: (task: Task) => Promise<void>;                      │
│ }                                                               │
│                                                                 │
│ Execution Timeline:                                             │
│                                                                 │
│ 1. preExecution Hooks                                           │
│    ├─ Verify workspace state (clean working tree)               │
│    ├─ Create workspace snapshot (for rollback)                  │
│    └─ Validate agent availability                              │
│         │                                                       │
│         ▼                                                       │
│ 2. Task Execution (Docker)                                      │
│    ├─ Run container                                             │
│    ├─ Capture output                                            │
│    └─ Detect exit code & failures                               │
│         │                                                       │
│         ├─ Success ──────────────────┐                          │
│         │                            │                          │
│         │                            ▼                          │
│         │                  3. postCompletion Hooks               │
│         │                     ├─ Create output snapshot          │
│         │                     ├─ Trigger PR workflow            │
│         │                     └─ Update metrics                 │
│         │                                                       │
│         └─ Failure ──────────────────┐                          │
│                                      │                          │
│                                      ▼                          │
│                            4. onFailure Hooks                   │
│                               ├─ Detect pattern                 │
│                               ├─ Trigger recovery               │
│                               └─ Log failure                    │
│                                                                 │
│                    5. onCrash Hook (if applicable)              │
│                       ├─ Emergency cleanup                      │
│                       ├─ Save logs                              │
│                       └─ Create incident task                   │
│                                                                 │
│ Implementation Notes:                                           │
│ - Hooks are event-driven (not polling)                          │
│ - Multiple hooks can be registered                              │
│ - Hooks can be async (await completion)                         │
│ - Errors in hooks don't block task completion                   │
│ - All hook calls logged (category: 'process')                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Recovery Attempt Tracking (Proposed)

```
┌──────────────────────────────────────────────────────────────────┐
│ RECOVERY BUDGET SYSTEM (Recommended Implementation)              │
│                                                                  │
│ metadata.recovery_budget = {                                     │
│   originalFailureCount: number;      // How many times failed    │
│   recoveryAttempts: number;          // Cleanup+followup cycles  │
│   maxRecoveryAttempts: 3;            // Configurable limit       │
│   history: [                                                     │
│     {                                                            │
│       cleanupTaskId: string;         // Cleanup task             │
│       followupTaskId?: string;       // Followup task            │
│       outcome: 'cleanup_failed' |    // How it ended             │
│                'followup_failed' |                               │
│                'success';                                        │
│       attemptedAt: string;           // Timestamp                │
│       error?: string;                // Final error (if any)      │
│     }                                                             │
│   ];                                                             │
│ };                                                               │
│                                                                  │
│ Recovery Attempt Flow:                                           │
│                                                                  │
│ Original Task Fails                                              │
│   └─ recovery_budget.originalFailureCount++                    │
│   └─ Check: recovery_budget.recoveryAttempts < maxRecoveryAttempts?
│      │                                                           │
│      ├─ YES: Create cleanup task                                │
│      │        recovery_budget.recoveryAttempts++                │
│      │        Add entry to history                              │
│      │                                                           │
│      └─ NO: Give up                                              │
│           Create incident task                                  │
│           log: max_recovery_attempts_exceeded                    │
│           notify: ops team                                       │
│                                                                  │
│ Benefits:                                                        │
│ - Prevents infinite recovery loops                               │
│ - Tracks recovery effectiveness per task                         │
│ - Data for recovery analytics                                    │
│ - Audit trail for incidents                                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. System Health Dashboard (Metrics)

```
┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM METRICS EMISSION (Every 60 seconds)                      │
│                                                                 │
│ MetricsEmitter.ts emits:                                        │
│                                                                 │
│ {                                                               │
│   timestamp: 1730890000000,                                     │
│   queueDepth: 5,         ← How many tasks pending                │
│   activeWorkers: 2,      ← Concurrent executing tasks            │
│   completedTasks: 127,   ← Lifetime completions                  │
│   failedTasks: 23,       ← Lifetime failures                     │
│   pendingTasks: 5,       ← In queue not yet assigned             │
│   avgCompletionTimeMs: 8230,  ← Average task duration            │
│   successRate: 84.6,     ← Completion/(completion+failure)       │
│                                                                 │
│   circuitBreakerStatus: {                                       │
│     state: 'CLOSED' | 'OPEN' | 'HALF_OPEN',                    │
│     failureCount: 0..5,                                         │
│   }                                                             │
│ }                                                               │
│                                                                 │
│ Dashboard Display (Example):                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Queue Depth:        5 pending              ▁▂▃▄▅▅▄▃▂▁       │ │
│ │ Active Workers:     2 / 2                   ████████        │ │
│ │ Success Rate:       84.6%  ▓▓▓▓▓▓▓▓░░                      │ │
│ │ Avg Duration:       8.2s                                    │ │
│ │ Circuit Breaker:    CLOSED                                 │ │
│ │ Last Updated:       09:23:45                                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Alerts (on metrics anomalies):                                  │
│ - queueDepth > 10: Backlog building                             │
│ - activeWorkers === maxWorkers: Capacity constrained            │
│ - successRate < 70%: High failure rate                          │
│ - circuitBreakerStatus === 'OPEN': Docker issues                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Failure Categories Decision Tree

```
Task Execution Completes (exitCode !== 0)
│
├─ stderr/stdout contains pattern from FAILURE_GUARDS
│  │
│  ├─ "sh: claude: not found" → resource_not_found (non-recoverable)
│  ├─ "CLI Not Found" → resource_not_found (non-recoverable)
│  │
│  ├─ "--invalid-flag" → cli_incompatibility (RECOVERABLE)
│  │
│  ├─ "cannot find module 'x'" → missing_resource (RECOVERABLE)
│  ├─ "no such file or directory" → missing_resource (RECOVERABLE)
│  │
│  ├─ "SyntaxError: Unexpected token" → syntax_error (RECOVERABLE)
│  │
│  ├─ "ImportError: No module named 'x'" → import_error (RECOVERABLE)
│  │
│  ├─ "Config file not found" → config_error (RECOVERABLE)
│  │
│  ├─ "permission denied" → permission_denied (non-recoverable)
│  ├─ "EACCES: permission denied" → permission_denied (non-recoverable)
│  │
│  ├─ "timeout" / "timed out" → timeout (non-recoverable)
│  │
│  ├─ "out of memory" / "OOM" → oom (non-recoverable)
│  ├─ "Cannot allocate memory" → oom (non-recoverable)
│  │
│  ├─ "no space left on device" → system_error (non-recoverable)
│  │
│  └─ "killed" / "Process killed" → system_error (non-recoverable)
│
└─ No pattern matched → Unknown error (non-recoverable)
   Log as: failure_pattern_not_recognized

Recovery Decision:
RECOVERABLE:
  cli_incompatibility ✓   (Bot can fix flags)
  missing_resource ✓      (Bot can install deps)
  syntax_error ✓          (Bot can fix code)
  import_error ✓          (Bot can fix imports)
  config_error ✓          (Bot can fix config)

NON-RECOVERABLE:
  resource_not_found ✗    (Docker image issue)
  permission_denied ✗     (Infrastructure issue)
  timeout ✗               (Environment issue)
  oom ✗                   (Resource limit)
  system_error ✗          (Infrastructure)
```

---

## Related Documentation

- **ARCHITECTURE_ANALYSIS.md**: Detailed architectural analysis (12 sections, 1000+ lines)
- **FAILURE_RECOVERY_SYSTEM.md**: Recovery system design and implementation
- **CONSOLIDATED_ROADMAP.md**: Long-term product roadmap with phases
- **BOT_EXECUTION_IMPROVEMENTS.md**: Task quality and prompt enhancement plan

---

**Last Updated**: 2025-11-08
**Audience**: Architects, lead engineers, new contributors
**Status**: Living document - updated as architecture evolves
