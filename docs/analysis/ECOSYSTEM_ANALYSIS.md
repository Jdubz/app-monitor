# App Monitor Ecosystem Analysis
**Date**: 2025-11-14
**Scope**: Complete workflow analysis from planning to feature completion
**Focus**: System harmony, integration points, self-healing, and error recovery

---

## Executive Summary

The app-monitor system implements a sophisticated multi-stage workflow for autonomous feature development through AI agents. The ecosystem spans **5 major subsystems**:

1. **Plan Management System** - Strategic planning with AI agent-created plans
2. **Task Creation & Validation** - Rigorous task specification with context bundling
3. **Dev-Bot Execution Engine** - Containerized AI agent task execution
4. **Chain Tracking & Concurrency Control** - Staged queue management for dependent tasks
5. **PR Workflow & Completion** - GitHub integration with quality gates

**Key Strengths:**
- ✅ Event-driven architecture ensures plans/tasks stay synchronized
- ✅ Comprehensive error recovery with 2-stage cleanup/followup pattern
- ✅ Git hash-based context caching reduces redundant computation (~90% cache hit rate)
- ✅ ACID-compliant SQLite queue prevents race conditions
- ✅ Intelligent agent selection based on task classification
- ✅ Automatic orphaned PR adoption and system self-healing

**Critical Findings:**
- ⚠️ Plan status updates are asynchronous without retry on failure (can drift)
- ⚠️ Context bundle generation failures are silently ignored (by design, but risks incomplete context)
- ⚠️ Chain blocking can cascade without automatic unblocking on resolution
- ⚠️ Stale chains (>24h no activity) not detected until manual intervention
- ⚠️ PR merge cleanup relies entirely on webhook delivery (no verification on task completion)

---

## 1. Complete Workflow Map

### 1.1 End-to-End Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PLANNING PHASE                                     │
│                                                                       │
│  User/AI → Create Plan → PlansService.createPlan()                   │
│           ↓                                                           │
│           status: 'planning'                                          │
│           priority: p0-p3                                             │
│           success_criteria: string[]                                  │
└──────────────────────┬────────────────────────────────────────────────┘
                       │
                       ↓ AI Agent analyzes requirements
┌──────────────────────────────────────────────────────────────────────┐
│                    TASK CREATION PHASE                                │
│                                                                       │
│  AI Agent → TaskCreationService.createTask()                         │
│           ├─ Normalize & validate task data                          │
│           ├─ Check duplicates (MD5 fingerprint)                      │
│           ├─ Generate context bundle (YAML recipes)                  │
│           │  ├─ Select profiles based on task type + files          │
│           │  ├─ Generate git hash cache key                         │
│           │  └─ Cache bundle for reuse (~90% hit rate)               │
│           ├─ Determine risk level (minimal/low/medium/high)          │
│           └─ Create task in SQLite queue                             │
│              ↓                                                        │
│              plan_id links to plan                                   │
│              context_bundle_id, context_cache_key stored             │
└──────────────────────┬────────────────────────────────────────────────┘
                       │
                       ↓ Event: onTaskCreated() → PlanStatusUpdater
┌──────────────────────────────────────────────────────────────────────┐
│             PLAN STATUS UPDATE (Event-Driven)                         │
│                                                                       │
│  PlanStatusUpdater.onTaskCreated(taskId)                             │
│  ├─ Get task by ID, check plan_id                                    │
│  ├─ If first task for plan → compute new status                      │
│  │  PlanProgressCalculator.computeStatus(planId)                     │
│  │  ├─ Get all tasks for plan                                        │
│  │  ├─ Count: pending, active, completed, failed, blocked            │
│  │  ├─ Apply status rules:                                           │
│  │  │  • All completed → 'completed'                                 │
│  │  │  • Any blocked → 'blocked'                                     │
│  │  │  • Any active → 'in_progress'                                  │
│  │  │  • Only pending → 'planning'                                   │
│  │  └─ PlansService.updatePlanStatus(planId, newStatus)              │
│  └─ Update plan timestamps (started_at, completed_at)                │
└──────────────────────┬────────────────────────────────────────────────┘
                       │
                       ↓ Task enters queue
┌──────────────────────────────────────────────────────────────────────┐
│               STAGED QUEUE & CHAIN MANAGEMENT                         │
│                                                                       │
│  ChainTrackerService manages concurrency                             │
│  ├─ Count active chains (non-blocked, non-Copilot)                   │
│  ├─ Implementation queue: New task chains                            │
│  ├─ Followup queue: Fix tasks for existing chains                    │
│  │                                                                    │
│  │  Chain Assignment Logic:                                          │
│  │  • Task without chain_id → New implementation                     │
│  │  • Task with followup_for_pr → Followup for existing chain        │
│  │  • Chain concurrency limit: maxWorkers (e.g., 3)                  │
│  │                                                                    │
│  └─ Mark chains as closed when PR merged + all tasks done            │
└──────────────────────┬────────────────────────────────────────────────┘
                       │
                       ↓ DevBotsManager.assignNextTask()
┌──────────────────────────────────────────────────────────────────────┐
│                 DEV-BOT TASK EXECUTION                                │
│                                                                       │
│  TaskExecutionService.executeTask()                                  │
│  ├─ Acquire ephemeral worker (Docker container)                      │
│  │  EphemeralWorkerService.acquireWorker(taskId, agentId)            │
│  │  └─ Create container with workspace sync                          │
│  ├─ Generate prompt from template                                    │
│  │  TaskPromptTemplateManager.generatePrompt(task, personality)      │
│  ├─ Inject context bundle if available                               │
│  │  - Read bundle from context_bundle_id                             │
│  │  - Mount as read-only Docker volume                               │
│  ├─ Execute agent in container                                       │
│  │  AgentExecutor.execute(containerId, prompt, context)              │
│  │  - Stream stdout/stderr                                           │
│  │  - Monitor exit code                                              │
│  ├─ Handle completion                                                │
│  │  TaskCompletionService.handleCompletion()                         │
│  │  ├─ Quality gates (if enabled)                                    │
│  │  ├─ Task verification (>= 80% acceptance criteria)                │
│  │  └─ PR workflow orchestration                                     │
│  │                                                                    │
│  └─ Error recovery (if failed)                                       │
│     SimpleFailureRecovery.attemptRecovery()                          │
│     ├─ Check circular recovery prevention                            │
│     ├─ Create cleanup task (Stage 1: fix error)                      │
│     └─ Followup task created when cleanup completes                  │
└──────────────────────┬────────────────────────────────────────────────┘
                       │
                       ↓ Task completed successfully
┌──────────────────────────────────────────────────────────────────────┐
│               PR WORKFLOW ORCHESTRATION                               │
│                                                                       │
│  PRWorkflowOrchestrator.handleTaskCompletion()                       │
│  ├─ Create GitHub PR                                                 │
│  │  GitHubPRService.createPR(branch, title, body)                    │
│  │  └─ Store pr_number in task (foreign key reference)               │
│  ├─ Monitor PR status via webhooks                                   │
│  │  pullRequestHandler.handle(payload)                               │
│  │  ├─ pr_opened → Link tasks to PR                                  │
│  │  ├─ pr_synchronize → Detect resolved comments                     │
│  │  │  ReviewCommentTracker.detectResolvedComments()                 │
│  │  ├─ pr_merged → Comprehensive cleanup                             │
│  │  │  ├─ Find ALL related tasks (not just pr_number)                │
│  │  │  ├─ Stop running containers                                    │
│  │  │  ├─ Cancel pending tasks                                       │
│  │  │  ├─ Mark original tasks as completed                           │
│  │  │  ├─ Delete PR condition state                                  │
│  │  │  └─ ChainTracker.closeCompletedChains()                        │
│  │  └─ pr_closed → Cleanup without merge                             │
│  │                                                                    │
│  └─ Trigger plan status update                                       │
│     PlanStatusUpdater.onPRMerged(prNumber)                           │
│     ├─ Get all tasks for PR                                          │
│     ├─ Extract unique plan_ids                                       │
│     └─ Update status for each plan                                   │
└──────────────────────┬────────────────────────────────────────────────┘
                       │
                       ↓ All tasks completed, PR merged
┌──────────────────────────────────────────────────────────────────────┐
│                    PLAN COMPLETION                                    │
│                                                                       │
│  Final status computation:                                           │
│  PlanProgressCalculator.computeStatus(planId)                        │
│  ├─ All tasks completed → status: 'completed'                        │
│  ├─ PlansService.updatePlanStatus(planId, 'completed')               │
│  └─ Update completed_at timestamp                                    │
│                                                                       │
│  Metrics available:                                                  │
│  • Total tasks: X                                                    │
│  • Completed: X                                                      │
│  • Success rate: X%                                                  │
│  • Total time: X hours                                               │
│  • PRs merged: X                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 Event Hooks & Integration Points

**Event-Driven Updates** (PlanStatusUpdater listens to):

| Event Source | Event | Handler | Updates |
|-------------|-------|---------|---------|
| TaskQueueService | Task created | `onTaskCreated(taskId)` | Plan status: planning → in_progress |
| TaskQueueService | Task status change | `onTaskStatusChange(taskId)` | Plan status based on all tasks |
| ChainTrackerService | Chain blocked | `onChainBlocked(chainId)` | Plan status → blocked |
| ChainTrackerService | Chain unblocked | `onChainUnblocked(chainId)` | Plan status → in_progress |
| PullRequestHandler | PR merged | `onPRMerged(prNumber)` | Plan status → completed (if all tasks done) |

**Critical Integration Point**: All events are asynchronous promises with `.catch()` error handlers. **There is no ordering guarantee** between multiple rapid events (e.g., 10 tasks completing simultaneously).

---

## 2. System Component Deep Dive

### 2.1 Plan Management System

**File**: `backend/src/services/plans.service.ts`
**Database Table**: `plans` (migration 021)
**Responsibilities**:
- CRUD operations for plans
- Status storage (computed, not manually set)
- Transaction-wrapped updates/deletes for ACID compliance

**Schema**:
```sql
CREATE TABLE plans (
  id TEXT PRIMARY KEY,              -- plan-{uuid}
  title TEXT NOT NULL,
  plan_type TEXT,                   -- feature, refactor, fix, investigation
  priority TEXT,                    -- p0, p1, p2, p3
  status TEXT,                      -- planning, in_progress, blocked, completed, cancelled
  created_at INTEGER,
  started_at INTEGER,               -- First task started
  completed_at INTEGER,             -- All tasks completed
  success_criteria TEXT,            -- JSON array
  scope_boundaries TEXT,            -- JSON object {mustNotChange, mustNotAffect}
  estimated_effort_hours INTEGER,
  plan_id TEXT                      -- Links task to plan
);
```

**Status Computation Algorithm** (PlanProgressCalculator.computeStatus):

```typescript
function computeStatus(planId: string): PlanStatus {
  const tasks = getPlanTasks(planId);

  // Count statuses
  const completed = tasks.filter(t => t.status === 'completed').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const blocked = tasks.filter(t => t.chain_status === 'blocked').length;
  const active = tasks.filter(t => ['pending', 'running', 'assigned'].includes(t.status)).length;

  // Status priority:
  if (tasks.length === 0) return 'planning';
  if (completed + failed === tasks.length) return 'completed';
  if (blocked > 0) return 'blocked';
  if (active > 0) return 'in_progress';
  return 'planning';
}
```

**Critical Design Decision**: Plans do NOT have a separate state machine. Status is **derived** from task/PR/chain states, ensuring plans never drift from reality.

**Integration Points**:
- **TaskCreationService**: Sets `plan_id` on tasks
- **PlanStatusUpdater**: Subscribes to task/chain/PR events
- **API routes**: `/api/dev-bots/plans` (protected by requireApiKey)

**Gaps Identified**:
1. ⚠️ **No automatic stale plan detection**: Plans in "planning" status with no tasks for > 7 days are not flagged
2. ⚠️ **No plan-level metrics aggregation**: Total effort hours, actual vs estimated not computed
3. ⚠️ **Cancelled plans don't cascade**: Cancelling a plan doesn't automatically cancel pending tasks

---

### 2.2 Task Creation & Validation System

**File**: `backend/src/services/taskCreation.service.ts`
**Responsibilities**:
- Normalize task data to EnhancedTaskData format
- Validate against guidelines (TaskCreationGuidelinesManager)
- Generate context bundles (ContextBundleGenerator)
- Detect duplicates via MD5 fingerprinting
- Determine risk level for agent eligibility

**Workflow**:

```typescript
async createTask(taskData: EnhancedTaskData): TaskCreationResult {
  // 1. Normalize data
  const normalized = this.normalizeTaskData(taskData);

  // 2. Check duplicates (fingerprint = MD5(title + files + criteria))
  await this.checkDuplicates(normalized);

  // 3. Validate
  const validation = this.validateTask(normalized);
  if (!validation.isValid) throw Error(...);

  // 4. Generate context bundle (graceful failure)
  let contextBundle: ContextBundle | undefined;
  try {
    const profiles = ContextRecipeSelector.getProfilesToInclude({
      taskType: mapToRecipeTaskType(normalized.type),
      targetFiles: normalized.files,
      includeOptional: false
    });

    const result = await contextGenerator.generateBundle({
      taskType,
      targetFiles: normalized.files,
      profiles,
      force: false
    });

    if (result.success) {
      contextBundle = result.bundle;
      // Cached: ~90% hit rate via git hash-based cache key
    }
  } catch (error) {
    // Context failure does NOT block task creation
    logger.warn({ message: 'Context bundle generation failed' });
  }

  // 5. Create task in queue
  const task = taskQueue.createTask({
    ...normalized,
    context_bundle_id: contextBundle?.id,
    context_cache_key: contextBundle?.cacheKey,
    context_profiles: contextBundle?.metadata.profiles,
    risk_level: determineRiskLevel(normalized)
  });

  return { task, validation, contextBundle };
}
```

**Risk Level Determination**:

| Condition | Risk Level |
|-----------|------------|
| Only docs/*.md files | minimal |
| Docker/migration/deploy/production | high |
| Backend services + expert complexity | high |
| Backend services + simple/medium | medium |
| Frontend/tests + complex | medium |
| Frontend/tests + simple | low |
| Default (by complexity) | simple→low, medium/complex→medium, expert→high |

**Context Bundle Caching**:
- Cache key: `git hash + recipe profiles`
- Storage: Database table `context_bundle_cache` (migration 019)
- Hit rate: ~90% (logged metrics)
- Invalidation: Git hash change

**Integration Points**:
- **DevBotsManager.addTask()**: Entry point for task creation
- **TaskQueueService.createTask()**: SQLite persistence
- **ContextBundleGenerator**: YAML recipe-based bundling
- **PlanStatusUpdater**: Event hook after creation

**Gaps Identified**:
1. ⚠️ **Silent context bundle failures**: No retry mechanism, task proceeds without context
2. ⚠️ **No context staleness detection**: Bundles cached indefinitely until git hash changes
3. ⚠️ **Fingerprint collisions possible**: MD5 not cryptographically secure, rare but possible
4. ⚠️ **No validation of plan_id foreign key**: Task can reference non-existent plan

---

### 2.3 Dev-Bot Execution Engine

**File**: `backend/src/services/devBotsManager.ts`
**Architecture**: Dependency-injected service orchestrator
**Execution Flow**:

```typescript
class DevBotsManager {
  // 1. Task assignment
  async assignNextTask(): Promise<void> {
    // Check concurrency limits
    const activeChains = chainTracker.countActiveChains();
    if (activeChains >= maxConcurrentChains) return;

    // Get next pending task (staged queue logic)
    const task = await taskQueue.getNextPendingTask({
      maxActiveChains,
      preferFollowups: true  // Prioritize followup queue
    });

    if (!task) return;

    // 2. Execute task
    await taskExecutionService.executeTask(task.id);
  }
}

class TaskExecutionService {
  async executeTask(taskId: string): Promise<void> {
    const task = taskQueue.getTask(taskId);

    // 1. Agent selection
    const agent = agentSelector.selectAgent(task);

    // 2. Acquire worker container
    const worker = await ephemeralWorkerService.acquireWorker(
      taskId,
      agent.id
    );

    // 3. Generate prompt
    const personality = agentManager.getPersonality(agent.id);
    const prompt = templateManager.generatePrompt(task, personality);

    // 4. Execute in container
    const result = await agentExecutor.execute({
      workerId: worker.id,
      prompt,
      contextBundleId: task.context_bundle_id,
      timeout: task.timeout_ms
    });

    // 5. Handle completion/failure
    if (result.exitCode === 0) {
      await taskCompletionService.handleCompletion(task, result);
    } else {
      await failureRecovery.attemptRecovery({
        task,
        failurePattern,
        stderr: result.stderr,
        exitCode: result.exitCode
      });
    }

    // 6. Release worker
    await ephemeralWorkerService.releaseWorker(worker.id);
  }
}
```

**Worker Lifecycle**:

| Phase | Service | Action |
|-------|---------|--------|
| Acquire | EphemeralWorkerService | Create Docker container, sync workspace |
| Execute | AgentExecutor | Run Claude Code CLI, stream output |
| Monitor | WorkerHealthMonitor | Heartbeat tracking, stalled worker detection |
| Cleanup | EphemeralWorkerService | Stop container, cleanup volumes |

**Context Bundle Injection**:

```typescript
// In AgentExecutor.execute()
if (task.context_bundle_id) {
  // Mount context bundle as read-only Docker volume
  const bundle = await contextStorage.getBundle(task.context_bundle_id);
  await dockerManager.mountVolume(containerId, bundle.path, '/context', {
    readOnly: true
  });

  // Inject into prompt
  prompt += `\n\nContext bundle available at /context/\nProfiles: ${bundle.metadata.profiles.join(', ')}`;
}
```

**Integration Points**:
- **TaskQueueService**: Task retrieval, status updates
- **ChainTrackerService**: Concurrency control
- **DockerManager**: Container lifecycle
- **RetryManager**: Failure tracking
- **TaskCompletionService**: Success path
- **SimpleFailureRecovery**: Failure path

**Gaps Identified**:
1. ⚠️ **No automatic worker scaling**: Fixed maxWorkers, no dynamic adjustment
2. ⚠️ **Worker crash detection relies on heartbeat**: 60s timeout before detection
3. ⚠️ **No circuit breaker for failing agents**: Repeatedly assigns to broken agent
4. ⚠️ **Context bundle mount failures are silent**: Execution proceeds without context

---

### 2.4 Chain Tracking & Concurrency Control

**File**: `backend/src/services/chainTracker.service.ts`
**Purpose**: Implement staged queue system with fix task depth limiting
**Database Fields**:

```sql
ALTER TABLE tasks ADD COLUMN chain_id TEXT;           -- UUID for chain
ALTER TABLE tasks ADD COLUMN chain_depth INTEGER;     -- 0=original, 1+=fixes
ALTER TABLE tasks ADD COLUMN queue_stage TEXT;        -- implementation | followup
ALTER TABLE tasks ADD COLUMN chain_status TEXT;       -- pending | active | blocked | closed
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;
ALTER TABLE tasks ADD COLUMN blocked_at INTEGER;
ALTER TABLE tasks ADD COLUMN blocked_by TEXT;
```

**Chain Lifecycle**:

```typescript
class ChainTrackerService {
  // Count active chains (excluding Copilot, per master intent)
  countActiveChains(): number {
    return db.prepare(`
      SELECT COUNT(DISTINCT chain_id)
      FROM tasks
      WHERE chain_status = 'active'
        AND status IN ('pending', 'assigned', 'active', 'retrying')
        AND (assigned_agent IS NULL OR assigned_agent != 'copilot')
    `).get().count;
  }

  // Close chains when PR merged + all tasks done
  closeCompletedChains(): number {
    return db.prepare(`
      UPDATE tasks
      SET chain_status = 'closed'
      WHERE chain_id IN (
        SELECT DISTINCT chain_id
        FROM tasks
        WHERE pr_status = 'merged'
          AND NOT EXISTS (
            SELECT 1 FROM tasks t2
            WHERE t2.chain_id = tasks.chain_id
              AND t2.status IN ('pending', 'assigned', 'active', 'retrying')
          )
      )
    `).run().changes;
  }

  // Block entire chain
  blockChain(chainId: string, reason: string, blockedBy: string): void {
    db.prepare(`
      UPDATE tasks
      SET chain_status = 'blocked',
          blocked_reason = ?,
          blocked_at = ?,
          blocked_by = ?
      WHERE chain_id = ?
    `).run(reason, Date.now(), blockedBy, chainId);

    // Trigger plan status update
    planStatusUpdater.onChainBlocked(chainId);
  }
}
```

**Queue Stage Assignment** (in TaskQueueService.getNextPendingTask):

```typescript
// Priority 1: Followup tasks for existing chains
const followupTask = db.prepare(`
  SELECT * FROM tasks
  WHERE status = 'pending'
    AND queue_stage = 'followup'
    AND chain_status != 'blocked'
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
`).get();

if (followupTask) return followupTask;

// Priority 2: New implementation tasks (if under concurrency limit)
if (activeChains < maxConcurrentChains) {
  const implTask = db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'pending'
      AND queue_stage = 'implementation'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
  `).get();

  return implTask;
}

return null; // Queue full
```

**Integration Points**:
- **TaskQueueService**: Queue depth queries, next task selection
- **PlanStatusUpdater**: Chain blocked/unblocked events
- **PullRequestHandler**: Chain closure on PR merge
- **DevBotsManager**: Concurrency limit enforcement

**Gaps Identified**:
1. ⚠️ **No automatic chain unblocking**: Blocked chains require manual intervention
2. ⚠️ **Chain blocking cascades without notification**: All tasks in chain silently stalled
3. ⚠️ **No chain timeout detection**: Chains can be "active" indefinitely
4. ⚠️ **Copilot exclusion is hardcoded**: No configurable agent exclusions

---

### 2.5 PR Workflow & Webhook Handling

**File**: `backend/src/services/webhookHandlers/pullRequestHandler.ts`
**Responsibilities**:
- Process GitHub webhook events
- Link tasks to PRs
- Detect resolved review comments
- Comprehensive cleanup on PR merge/close
- Orphaned system PR adoption

**PR Lifecycle Events**:

| GitHub Event | Handler | Actions |
|-------------|---------|---------|
| pr_opened | handlePROpened() | Set pr_number on tasks |
| pr_synchronize | handlePRSynchronize() | Detect resolved comments, evaluate conditions |
| pr_merged | handlePRMerged() | **CRITICAL CLEANUP**: stop containers, cancel tasks, close chains |
| pr_closed | handlePRClosed() | Same as merged (no merge) |
| pr_reopened | handlePRReopened() | Reset PR state |
| ready_for_review | handlePRReadyForReview() | Trigger PR checks |

**Critical Cleanup Flow** (handlePRMerged):

```typescript
async handlePRMerged(prNumber: number): Promise<void> {
  // 1. Find ALL related tasks (not just pr_number matches)
  const allRelatedTasks = await taskQueue.findAllTasksForPR(prNumber);

  // 2. Stop running containers immediately
  const runningTasks = allRelatedTasks.filter(t => t.status === 'running');
  for (const task of runningTasks) {
    await ephemeralWorkerService.stopWorker(task.assigned_worker);
  }

  // 3. Cancel pending tasks
  const pendingTasks = allRelatedTasks.filter(t => t.status === 'pending');
  for (const task of pendingTasks) {
    await taskQueue.updateTask(task.id, { status: 'cancelled' });
  }

  // 4. Mark original tasks as completed
  for (const task of allRelatedTasks) {
    if (!['completed', 'cancelled'].includes(task.status)) {
      await taskQueue.updateTask(task.id, {
        status: 'completed',
        completed_at: Date.now(),
        notes: `Auto-completed: PR #${prNumber} merged`
      });
    }
  }

  // 5. Clean up PR condition state
  await prConditionState.deletePRConditionState(prNumber);

  // 6. Close chains
  chainTracker.closeCompletedChains();

  // 7. Trigger plan status update
  planStatusUpdater.onPRMerged(prNumber);
}
```

**Orphaned PR Detection**:

```typescript
// System PR patterns (created by dev-bots)
const systemPRPatterns = [
  /task-\w+/,                    // Branch: task-abc123
  /^dev\/bot\//,                 // Branch: dev/bot/feature
  /^\[BOT\]/,                    // Title: [BOT] Implement auth
];

function detectSystemCreatedPR(branch, author, title): Detection {
  // Check branch pattern
  if (systemPRPatterns.some(p => p.test(branch))) {
    return { isSystemPR: true, reason: 'branch_pattern' };
  }

  // Check author (GitHub App bot)
  if (author.endsWith('[bot]')) {
    return { isSystemPR: true, reason: 'bot_author' };
  }

  return { isSystemPR: false, reason: 'user_created' };
}

// Auto-adopt orphaned system PRs
async adoptOrphanedSystemPR(prNumber, prData): Promise<Task> {
  return taskQueue.createTask({
    type: 'pr-follow-up',
    title: `[ADOPTED] ${prData.title}`,
    pr_number: prNumber,
    is_orphaned_pr: true,
    notes: `Auto-adopted orphaned system PR #${prNumber}`
  });
}
```

**Integration Points**:
- **GitHubWebhookHandler**: Routes webhook events
- **TaskQueueService**: Find tasks by PR
- **ChainTrackerService**: Close chains
- **PlanStatusUpdater**: Update plan status
- **ReviewCommentTracker**: Track comment resolution
- **PRConditionState**: Manage merge gate conditions

**Gaps Identified**:
1. ⚠️ **Webhook delivery not guaranteed**: No fallback polling for missed events
2. ⚠️ **PR cleanup assumes findAllTasksForPR is comprehensive**: May miss tasks
3. ⚠️ **No notification for orphaned PRs**: Silent adoption without alerting users
4. ⚠️ **Comment resolution relies on real-time webhook**: Historical comments not retroactively checked

---

## 3. Error Recovery & Self-Healing Mechanisms

### 3.1 Two-Stage Failure Recovery

**File**: `backend/src/services/failureRecovery.ts`
**Philosophy**: Simple, predictable recovery with circular prevention

**Recovery Flow**:

```typescript
async attemptRecovery(context: FailureContext): Promise<RecoveryResult> {
  // 1. Circular recovery prevention
  if (task.metadata?.isRepairBot) {
    logger.warn('Preventing circular recovery');
    return { recovered: false };
  }

  // 2. Check for active repair
  if (await hasActiveRepair(task.id)) {
    return { recovered: false, reason: 'repair_already_running' };
  }

  // 3. Check recoverability
  const recoverableCategories = [
    'cli_incompatibility',
    'missing_resource',
    'syntax_error',
    'import_error',
    'config_error'
  ];

  if (!recoverableCategories.includes(failurePattern.category)) {
    return { recovered: false, reason: 'not_recoverable' };
  }

  // 4. Create cleanup task (Stage 1)
  const cleanupTask = await createCleanupTask({
    title: `[CLEANUP] ${task.title}`,
    description: buildCleanupPrompt(task, failurePattern),
    metadata: {
      isRepairBot: true,
      repairStage: 'cleanup',
      originalTaskId: task.id,
      originalFailurePattern: failurePattern.name
    }
  });

  return { recovered: true, cleanupTaskId: cleanupTask.id };
}

// When cleanup completes successfully
async createFollowupTask(cleanupTask: Task): Promise<Task> {
  if (cleanupTask.status !== 'completed') {
    logger.warn('Cleanup failed, skipping followup');
    return null;
  }

  const followupTask = await taskQueue.createTask({
    title: `[FOLLOWUP] ${originalTask.title}`,
    description: buildFollowupPrompt(originalTask, cleanupTask),
    metadata: {
      isRepairBot: true,
      repairStage: 'followup',
      originalTaskId: originalTask.id,
      cleanupTaskId: cleanupTask.id
    }
  });

  return followupTask;
}
```

**Failure Pattern Detection** (TaskFailureGuards):

| Category | Patterns | Recoverable |
|----------|----------|-------------|
| cli_incompatibility | "command not found", "invalid option" | Yes |
| missing_resource | "ENOENT", "file not found" | Yes |
| syntax_error | "SyntaxError", "unexpected token" | Yes |
| import_error | "Cannot find module" | Yes |
| config_error | "Invalid configuration" | Yes |
| permission_denied | "EACCES", "permission denied" | No (requires manual fix) |
| network_error | "ECONNREFUSED", "timeout" | No (infrastructure) |
| authentication_failed | "401", "403", "invalid credentials" | No (requires credentials) |

### 3.2 Retry Coordination

**File**: `backend/src/services/retryCoordination.service.ts`
**Architecture**: Manual retry system (no automatic scheduling)

**Retry Workflow**:

```typescript
async handleTaskRetry(task: Task): Promise<void> {
  // 1. Reset task state
  task.status = 'pending';
  task.assigned_worker = undefined;
  task.error = undefined;

  // 2. Update in queue
  await taskQueue.updateTask(task.id, task);

  // 3. Emit retry event
  emitEvent('taskRetrying', task);

  // 4. Assign next task (may pick up this retry)
  await assignNextTask();
}

async retryTask(taskId: string, reason?: string): Promise<Result> {
  const task = await taskQueue.getTask(taskId);

  // Check eligibility
  if (task.status !== 'failed') {
    return { success: false, message: 'Task not failed' };
  }

  if (!retryManager.canRetryTask(task)) {
    return { success: false, message: 'Max retries exceeded' };
  }

  // Manual retry - reset and re-queue
  const retryResult = retryManager.retryTask(task, reason || 'Manual retry');
  await taskQueue.updateTask(task.id, retryResult.task);

  emitEvent('taskRetrying', retryResult.task);
  return { success: true, message: 'Task queued for retry' };
}
```

**Retry Limits**:
- Default `max_retries`: 3
- Configurable per task
- Retry count tracked in `retry_count` field
- Retry history stored in `task_executions` table

### 3.3 Worker Health Monitoring

**File**: `backend/src/services/workerHealthMonitor.service.ts`
**Mechanism**: Heartbeat-based staleness detection

**Health Check Flow**:

```typescript
class WorkerHealthMonitor {
  // Runs every 30 seconds
  async monitorWorkerHealth(): Promise<void> {
    const workers = await ephemeralWorkerService.getAllWorkers();

    for (const worker of workers) {
      const stalledDuration = Date.now() - worker.last_heartbeat;

      // Stalled worker detection (60s timeout)
      if (stalledDuration > worker.heartbeat_timeout_ms) {
        logger.error({
          message: `Worker ${worker.id} is stalled`,
          stalledDuration,
          currentTask: worker.current_task_id
        });

        // 1. Mark worker as stopped
        await ephemeralWorkerService.stopWorker(worker.id);

        // 2. Fail the current task
        if (worker.current_task_id) {
          await taskQueue.updateTask(worker.current_task_id, {
            status: 'failed',
            error: 'Worker became unresponsive (heartbeat timeout)'
          });

          // 3. Attempt recovery
          await recovery.attemptRecovery({
            task: await taskQueue.getTask(worker.current_task_id),
            failurePattern: { category: 'worker_timeout' },
            stderr: 'Worker heartbeat timeout',
            exitCode: -1
          });
        }

        // 4. Assign next task
        await assignNextTask();
      }
    }
  }
}
```

**Heartbeat Protocol**:
- Worker sends heartbeat every 20 seconds
- Timeout threshold: 60 seconds (3x heartbeat interval)
- Heartbeat includes: worker_id, task_id, timestamp, memory_usage, cpu_usage

### 3.4 Chain-Level Self-Healing

**Gaps in Current Implementation**:

| Failure Mode | Current Behavior | Self-Healing Gap |
|--------------|------------------|------------------|
| Chain blocked | Requires manual `unblockChain()` call | ⚠️ No automatic unblock after resolution |
| Chain timeout | Chains can be "active" indefinitely | ⚠️ No timeout detection for chains |
| All tasks failed | Chain status remains "active" | ⚠️ Should auto-close failed chains |
| Blocking task cancelled | Chain remains blocked | ⚠️ Should re-evaluate block state |

**Recommended Enhancements**:

```typescript
// Proposed: Auto-unblock when blocking condition resolves
async reevaluateBlockedChains(): Promise<void> {
  const blockedChains = chainTracker.getBlockedChains();

  for (const chain of blockedChains) {
    // Check if blocking condition resolved
    const blockingTask = await findBlockingTask(chain.chain_id);

    if (!blockingTask || blockingTask.status === 'completed') {
      logger.info(`Auto-unblocking chain ${chain.chain_id}`);
      chainTracker.unblockChain(chain.chain_id, 'system');
    }
  }
}

// Proposed: Detect stale chains
async detectStaleChains(): Promise<void> {
  const activeChains = await taskQueue.getActiveChains();

  for (const chain of activeChains) {
    const lastActivity = getLastTaskActivity(chain.chain_id);
    const staleDuration = Date.now() - lastActivity;

    // Stale threshold: 24 hours
    if (staleDuration > 24 * 60 * 60 * 1000) {
      logger.warn(`Chain ${chain.chain_id} is stale`, { staleDuration });

      // Auto-close or alert?
      if (shouldAutoClose(chain)) {
        chainTracker.blockChain(
          chain.chain_id,
          'Stale chain (no activity for 24h)',
          'system'
        );
      }
    }
  }
}
```

---

## 4. Integration Point Analysis

### 4.1 Data Flow Diagram

```
┌─────────────┐
│   Plans     │◄──────────────────┐
│  Service    │                   │
└──────┬──────┘                   │
       │ creates                  │
       │ plan_id                  │
       ▼                          │ updates
┌─────────────┐          ┌───────┴────────┐
│    Task     │          │  PlanStatus    │
│  Creation   ├─────────►│   Updater      │
│  Service    │  events  └────────────────┘
└──────┬──────┘                   ▲
       │ creates                  │
       │ task                     │ events
       ▼                          │
┌─────────────┐          ┌───────┴────────┐
│TaskQueue    │◄─────────┤  Chain         │
│  Service    │  queries │  Tracker       │
└──────┬──────┘          └────────────────┘
       │ assigns                  ▲
       │ task                     │ updates
       ▼                          │
┌─────────────┐          ┌───────┴────────┐
│  DevBots    │          │   PR           │
│  Manager    ├─────────►│  Workflow      │
│             │  creates │  Orchestrator  │
└──────┬──────┘   PR     └────────────────┘
       │                          │
       │ executes                 │ webhooks
       ▼                          ▼
┌─────────────┐          ┌────────────────┐
│    Task     │          │   Pull         │
│  Execution  ├─────────►│   Request      │
│  Service    │ completion│  Handler      │
└──────┬──────┘          └────────────────┘
       │ failure                  │
       ▼                          │ merged
┌─────────────┐                  │
│   Failure   │                  │
│  Recovery   │                  │
└─────────────┘                  │
       │ cleanup/followup        │
       └─────────────────────────┘
```

### 4.2 Critical Dependencies

**Singleton Pattern** (PlanStatusUpdater):
```typescript
// Initialized once in plans.routes.ts
let instance: PlanStatusUpdater | null = null;

export function initializePlanStatusUpdater(db: Database): void {
  const plansService = new PlansService(db);
  const calculator = new PlanProgressCalculator(db);
  instance = new PlanStatusUpdater(db, plansService, calculator);
}

export function getPlanStatusUpdater(): PlanStatusUpdater | null {
  return instance;
}
```

**Risk**: If `initializePlanStatusUpdater()` is not called before any task/chain/PR events fire, plan status updates will silently fail (returns null).

**Database Sharing** (TaskQueueService as source of truth):
```typescript
// DevBotsManager needs TaskQueueService.getDatabase() for other services
const db = devBotsManager.getTaskQueue().getDatabase();
const plansService = new PlansService(db);
const chainTracker = new ChainTrackerService(db);
```

**Risk**: If TaskQueueService doesn't expose `getDatabase()`, other services can't share the connection.

**Event Ordering** (Asynchronous updates):
```typescript
// Multiple events fire simultaneously
await taskQueue.createTask(task1);  // → onTaskCreated(task1.id)
await taskQueue.createTask(task2);  // → onTaskCreated(task2.id)
await taskQueue.completeTask(task3); // → onTaskStatusChange(task3.id)

// All trigger planStatusUpdater.onTaskXXX() in parallel
// No guarantee of ordering!
```

**Risk**: Plan status computation may be stale if events process out of order.

### 4.3 External Dependencies

| Dependency | Purpose | Failure Impact |
|------------|---------|----------------|
| GitHub API | PR creation, status checks, comments | PRs not created, no webhook delivery |
| GitHub Webhooks | PR merge detection, cleanup trigger | Missed PR merges, stale tasks |
| Docker Engine | Worker container execution | No task execution |
| SQLite WAL | ACID task queue | Corruption risk without WAL |
| Git (workspace) | Context bundle git hash caching | Cache invalidation broken |

**GitHub Webhook Reliability**:
- GitHub guarantees "at least once" delivery
- Retry with exponential backoff (up to 3 attempts)
- **No verification on task lifecycle events in current implementation**

**Event-Driven Solution**: Verify PR status on task completion (no polling):
```typescript
// Trigger on task completion (event-driven)
async handleCompletion(task: Task): Promise<void> {
  // ... existing completion logic

  // If task has PR, verify PR status (detect missed webhook)
  if (task.pr_number) {
    const prStatus = await githubPR.getPRStatus(task.pr_number);

    if (prStatus.merged && task.status !== 'completed') {
      logger.warn(`Missed PR merge webhook for #${task.pr_number}, triggering cleanup`);
      await pullRequestHandler.handlePRMerged(task.pr_number);
    }
  }
}

// One-time reconciliation on system startup
async initializeAsync(): Promise<void> {
  const tasksWithPRs = await taskQueue.getTasksWithOpenPRs();

  for (const task of tasksWithPRs) {
    const prStatus = await githubPR.getPRStatus(task.pr_number);
    if (prStatus.merged) {
      logger.warn(`Startup recovery: PR #${task.pr_number} merged but task not cleaned up`);
      await pullRequestHandler.handlePRMerged(task.pr_number);
    }
  }
}

// Manual trigger via API (user intervention)
router.post('/api/dev-bots/pr/reconcile', async (req, res) => {
  const reconciledPRs = await prMonitor.reconcileAllOpenPRs();
  res.json({ reconciledPRs });
});
```

---

## 5. Failure Modes & Mitigation

### 5.1 Critical Failure Scenarios

#### Scenario 1: Plan Status Drift

**Failure**: Plan status becomes incorrect due to missed event

**Cause**:
```typescript
// Event handler crashes silently
planStatusUpdater.onTaskStatusChange(taskId).catch(error => {
  logger.error({ message: 'Plan status update failed', error });
  // Plan status now stale!
});
```

**Impact**: Plans show "in_progress" when actually completed, or vice versa

**Mitigation**:
- ✅ **Current**: Errors logged with details
- ⚠️ **Missing**: No retry mechanism for failed updates
- ⚠️ **Missing**: No lazy reconciliation on plan retrieval

**Event-Driven Solution**:
```typescript
// Add retry logic to event handlers
async onTaskStatusChange(taskId: string): Promise<void> {
  const task = this.getTask(taskId);
  if (!task?.plan_id) return;

  let retries = 3;
  while (retries > 0) {
    try {
      await this.updatePlanStatus(task.plan_id);
      return; // Success
    } catch (error) {
      retries--;
      if (retries === 0) {
        logger.error({ message: 'Plan status update failed after retries', error });
        throw error;
      }
      await sleep(1000 * (4 - retries)); // Exponential backoff
    }
  }
}

// Add lazy reconciliation on plan retrieval
getPlan(planId: string): Plan | null {
  const plan = this.getPlanFromDB(planId);
  if (!plan) return null;

  // Lazy reconciliation: verify status is correct
  const computedStatus = calculator.computeStatus(planId);
  if (plan.status !== computedStatus) {
    logger.warn(`Plan ${planId} status drift detected on retrieval`, {
      stored: plan.status,
      computed: computedStatus
    });
    this.updatePlanStatus(planId, computedStatus);
    plan.status = computedStatus;
  }

  return plan;
}

// One-time reconciliation on system startup
async initializeAsync(): Promise<void> {
  const plans = plansService.listPlans({ status: ['in_progress', 'blocked'] });
  for (const plan of plans) {
    await planStatusUpdater.updatePlanStatus(plan.id);
  }
}
```

#### Scenario 2: Missed PR Merge Webhook

**Failure**: PR merged but webhook not delivered

**Cause**:
- GitHub webhook delivery failure (network, retries exhausted)
- Webhook endpoint temporarily down

**Impact**:
- Tasks remain "running" with active containers
- Chain never closes
- Plan stuck in "in_progress"

**Mitigation**:
- ⚠️ **Current**: None (relies entirely on webhooks)
- **Event-Driven Solution**:
  - On task completion with pr_number: query GitHub API to verify PR status
  - If merged: trigger cleanup flow (same as webhook handler)
  - On system startup: one-time reconciliation of tasks with open PRs
  - Manual trigger via API endpoint for user intervention

#### Scenario 3: Context Bundle Generation Failure

**Failure**: Context bundle generation fails but task executes anyway

**Cause**:
```typescript
try {
  contextBundle = await contextGenerator.generateBundle(...);
} catch (error) {
  logger.warn({ message: 'Context generation failed' });
  // Task proceeds WITHOUT context!
}
```

**Impact**: Task executes with incomplete information, higher failure rate

**Mitigation**:
- ✅ **Current**: Graceful degradation (task still runs)
- ⚠️ **Missing**: No retry for transient failures
- ⚠️ **Missing**: No warning to agent that context is incomplete

**Recommendation**:
```typescript
// Retry context generation
let contextBundle: ContextBundle | undefined;
let retries = 3;

while (retries > 0 && !contextBundle) {
  try {
    const result = await contextGenerator.generateBundle(...);
    if (result.success) {
      contextBundle = result.bundle;
    }
  } catch (error) {
    retries--;
    logger.warn({ message: `Context generation failed (${retries} retries left)`, error });
    await sleep(1000 * (4 - retries)); // Exponential backoff
  }
}

// If still failed, inject warning into prompt
if (!contextBundle) {
  task.notes = (task.notes || '') + '\n\nWARNING: Context bundle generation failed. Proceeding without cached context.';
}
```

#### Scenario 4: Chain Blocking Cascade

**Failure**: One task blocks an entire chain, preventing all followup tasks

**Cause**:
```typescript
chainTracker.blockChain(chainId, 'Task X requires manual fix', 'system');
// ALL tasks in chain now blocked, even unrelated ones
```

**Impact**: Chain concurrency slot occupied indefinitely

**Mitigation**:
- ⚠️ **Current**: Manual intervention required (unblockChain API call)
- ⚠️ **Missing**: No automatic detection of resolved blocks
- ⚠️ **Missing**: No stale chain detection

**Event-Driven Solution**:
```typescript
// On task completion: check if this resolved a blocking condition
async handleCompletion(task: Task): Promise<void> {
  // ... existing completion logic

  // Check if any chains were blocked waiting for this task
  const blockedChains = chainTracker.getBlockedChains();
  for (const chain of blockedChains) {
    if (await isBlockingTaskResolved(chain.chain_id, task)) {
      logger.info(`Auto-unblocking chain ${chain.chain_id} after task ${task.id} completion`);
      chainTracker.unblockChain(chain.chain_id, 'system');
    }
  }
}

// On assignNextTask: detect and block stale chains
async assignNextTask(): Promise<void> {
  // Detect stale chains before checking concurrency
  const staleChains = await chainTracker.detectStaleChains(24 * 60 * 60 * 1000); // 24h
  for (const chain of staleChains) {
    logger.warn(`Blocking stale chain ${chain.chain_id}`);
    chainTracker.blockChain(chain.chain_id, 'Stale chain (no activity for 24h)', 'system');
  }

  // Continue with normal assignment logic
  const activeChains = chainTracker.countActiveChains();
  if (activeChains >= maxConcurrentChains) return;
  // ...
}
```

#### Scenario 5: Worker Heartbeat Timeout False Positive

**Failure**: Worker is healthy but network latency causes heartbeat miss

**Cause**:
```typescript
// Heartbeat sent, but delayed > 60s due to network
const stalledDuration = Date.now() - worker.last_heartbeat;
if (stalledDuration > 60000) {
  // FALSE POSITIVE: Worker killed while still working
  await stopWorker(worker.id);
}
```

**Impact**: Task marked as failed, cleanup bot created unnecessarily

**Mitigation**:
- ✅ **Current**: 60s timeout is 3x heartbeat interval (20s), reduces false positives
- ⚠️ **Missing**: No grace period or secondary confirmation

**Recommendation**:
```typescript
// Add grace period and confirmation
if (stalledDuration > 60000) {
  // First check: Log warning but don't kill yet
  logger.warn(`Worker ${worker.id} heartbeat stale (${stalledDuration}ms)`);

  // Wait 30s and check again
  await sleep(30000);

  const recheckDuration = Date.now() - worker.last_heartbeat;
  if (recheckDuration > 90000) {
    // Confirmed stalled after grace period
    logger.error(`Worker ${worker.id} confirmed stalled`);
    await stopWorker(worker.id);
  }
}
```

### 5.2 Data Consistency Guarantees

**SQLite ACID Compliance**:
- ✅ WAL mode enabled: `journal_mode = WAL`
- ✅ Transactions used for all plan updates/deletes
- ✅ Foreign key constraints: `foreign_keys = ON`

**Race Condition Prevention**:
- ✅ Task assignment: Atomic SQL UPDATE with WHERE conditions
- ✅ Worker creation: Unique constraints on worker.id
- ✅ Chain concurrency: COUNT queries before assignment

**Potential Race Condition** (not mitigated):
```typescript
// Two requests create tasks for same plan simultaneously
const activeChains = chainTracker.countActiveChains(); // Returns 2
if (activeChains < maxConcurrentChains) {              // 2 < 3, both proceed
  const task1 = await createTask(...);                 // Both create tasks
  const task2 = await createTask(...);                 // Chain count now 4 > max!
}
```

**Recommendation**: Use advisory locks for chain assignment:
```sql
BEGIN TRANSACTION;
SELECT * FROM tasks WHERE id = 'advisory-lock-chains' FOR UPDATE;
-- Perform chain count + assignment
COMMIT;
```

---

## 6. Recommendations

**IMPORTANT**: All recommendations follow the master design intent - **event-driven architecture only**. No polling, no cron jobs, no timers.

### 6.1 High Priority (P0) - System Stability

1. **Add Plan Status Reconciliation Retry Logic**
   - **Risk**: Plan status drifts from reality due to failed event handlers
   - **Event-Driven Solution**:
     - Add retry logic within PlanStatusUpdater event handlers (3 retries with exponential backoff)
     - On plan retrieval (lazy reconciliation): check if recomputation needed
     - On system startup: one-time reconciliation of active plans
   - **Trigger Points**:
     - `onTaskStatusChange()`, `onPRMerged()`, `onChainBlocked()` (add retries)
     - `PlansService.getPlan()` (lazy check)
     - `SystemInitializationService.initializeAsync()` (startup recovery)
   - **Effort**: 2 hours
   - **File**: `backend/src/services/planStatusUpdater.service.ts`, `plans.service.ts`

2. **Implement Chain Staleness Detection on Task Assignment**
   - **Risk**: Chains stay "active" indefinitely, blocking concurrency slots
   - **Event-Driven Solution**:
     - Check for stale chains (>24h no activity) in `DevBotsManager.assignNextTask()`
     - Auto-block stale chains before checking concurrency limits
     - Triggers on every task completion → next assignment attempt
   - **Trigger Points**:
     - `DevBotsManager.assignNextTask()` (before concurrency check)
     - `ChainTrackerService.countActiveChains()` (filter out stale)
   - **Effort**: 3 hours
   - **File**: `backend/src/services/chainTracker.service.ts`, `devBotsManager.ts`

3. **Add Context Generation Retry Logic**
   - **Risk**: Transient failures cause tasks to run without context
   - **Event-Driven Solution**:
     - Already event-driven (during task creation)
     - Add retry 3x with exponential backoff in `TaskCreationService.createTask()`
     - Inject warning into task notes if all retries fail
   - **Trigger Points**:
     - `TaskCreationService.createTask()` (already event-driven)
   - **Effort**: 2 hours
   - **File**: `backend/src/services/taskCreation.service.ts`

4. **Add PR Merge Detection on Task Completion**
   - **Risk**: Missed webhooks leave tasks/containers running indefinitely
   - **Event-Driven Solution**:
     - On task completion with pr_number: query GitHub API to check if PR merged
     - If merged but task not marked complete: trigger cleanup flow
     - On system startup: one-time reconciliation of tasks with open PRs
     - Manual trigger via API endpoint for user intervention
   - **Trigger Points**:
     - `TaskCompletionService.handleCompletion()` (check PR status)
     - `SystemInitializationService.initializeAsync()` (startup recovery)
     - New API endpoint: `POST /api/dev-bots/pr/reconcile` (manual trigger)
   - **Effort**: 3 hours
   - **File**: `backend/src/services/taskCompletion.service.ts`, `systemInitialization.service.ts`

5. **Add Automatic Chain Unblocking on Blocker Resolution**
   - **Risk**: Blocked chains require manual intervention even when blocker resolves
   - **Event-Driven Solution**:
     - On task completion: check if any chains were blocked by this task
     - On assignNextTask(): reevaluate blocked chains before assignment
     - Auto-unblock if blocking condition no longer exists
   - **Trigger Points**:
     - `TaskCompletionService.handleCompletion()` (check dependent chains)
     - `DevBotsManager.assignNextTask()` (reevaluate before assignment)
   - **Effort**: 4 hours
   - **File**: `backend/src/services/chainTracker.service.ts`, `taskCompletion.service.ts`

### 6.2 Medium Priority (P1) - Operational Excellence

1. **Stale Plan Detection on Plan Query**
   - **Benefit**: Surface plans in "planning" with no tasks for extended periods
   - **Event-Driven Solution**:
     - On plan retrieval: check if plan in "planning" status for >7 days with 0 tasks
     - Return warning flag in API response for UI alert
     - On plan list query: filter and flag stale plans
   - **Trigger Points**:
     - `PlansService.getPlan()` (lazy detection)
     - `PlansService.listPlans()` (bulk detection)
   - **Effort**: 2 hours
   - **File**: `backend/src/services/plans.service.ts`

2. **Worker Health Grace Period**
   - **Benefit**: Reduce false positive timeout kills
   - **Event-Driven Solution**:
     - Already event-driven (heartbeat monitoring)
     - Add 30s grace period: warn on first timeout, confirm on second check
     - Prevents network latency false positives
   - **Trigger Points**:
     - `WorkerHealthMonitor.monitorWorkerHealth()` (heartbeat check)
   - **Effort**: 1 hour
   - **File**: `backend/src/services/workerHealthMonitor.service.ts`

3. **Plan Metrics Lazy Computation**
   - **Benefit**: Visibility into plan progress (actual vs estimated effort)
   - **Event-Driven Solution**:
     - Compute metrics on demand when plan retrieved
     - Cache in plan object, invalidate on task state changes
     - No background computation needed
   - **Trigger Points**:
     - `PlansService.getPlan()` (compute on demand)
     - `PlanProgressCalculator.computeProgress()` (already event-driven)
   - **Effort**: 3 hours
   - **File**: `backend/src/services/planProgressCalculator.service.ts`

4. **Enhanced Context Failure Visibility**
   - **Benefit**: Alert agents when context bundle generation fails
   - **Event-Driven Solution**:
     - Already event-driven (during task creation)
     - Inject warning banner into agent prompt if context missing
     - Log detailed error for debugging
   - **Trigger Points**:
     - `TaskCreationService.createTask()` (already event-driven)
   - **Effort**: 1 hour
   - **File**: `backend/src/services/taskCreation.service.ts`

### 6.3 Low Priority (P2) - Enhancements

1. **Circuit Breaker for Failing Agents**
   - **Benefit**: Prevent repeated assignment to broken agent
   - **Event-Driven Solution**:
     - Track agent failure rate on each task failure
     - On agent selection: check failure rate, skip if > 80% in last hour
     - Auto-recover circuit after success or timeout
   - **Trigger Points**:
     - `TaskExecutionService.executeTask()` (track failures)
     - `AgentSelector.selectAgent()` (check circuit state)
   - **Effort**: 6 hours
   - **File**: `backend/src/services/agentSelector.ts`

2. **Dynamic Worker Scaling**
   - **Benefit**: Auto-adjust maxWorkers based on load
   - **Event-Driven Solution**:
     - On task queued: check queue depth vs capacity
     - Dynamically adjust maxConcurrentChains if queue backlog > threshold
     - Scale down when queue drains (lazy adjustment)
   - **Trigger Points**:
     - `TaskQueueService.createTask()` (check queue depth)
     - `DevBotsManager.assignNextTask()` (adjust limits)
   - **Effort**: 8 hours
   - **File**: `backend/src/services/devBotsManager.ts`

3. **Context Staleness Detection on Bundle Retrieval**
   - **Benefit**: Invalidate outdated cached context bundles
   - **Event-Driven Solution**:
     - On context bundle retrieval: check age, warn if > 7 days old
     - On git hash change: automatic invalidation (already happens)
     - Lazy cleanup: purge stale entries when cache accessed
   - **Trigger Points**:
     - `ContextBundleGenerator.generateBundle()` (check cache age)
     - `ContextCache.get()` (lazy cleanup)
   - **Effort**: 2 hours
   - **File**: `backend/src/services/context/contextCache.ts`

4. **Orphaned PR Adoption Notifications**
   - **Benefit**: Alert users when system PRs are auto-adopted
   - **Event-Driven Solution**:
     - Already event-driven (PR webhook handler)
     - Emit event on orphaned PR detection, emit to frontend via WebSocket
     - UI shows banner notification (minimalist alert)
   - **Trigger Points**:
     - `PullRequestHandler.adoptOrphanedSystemPR()` (already event-driven)
   - **Effort**: 3 hours
   - **File**: `backend/src/services/webhookHandlers/pullRequestHandler.ts`

---

## 7. Metrics & Observability

### 7.1 Current Metrics

**Available Metrics**:
- ✅ Queue metrics: `taskQueue.getQueueMetrics()`
  - Pending, running, completed, failed, cancelled counts
  - Average completion time
  - Oldest pending task age

- ✅ Agent comparison: `taskQueue.getAgentComparisonMetrics()`
  - Success rate by agent (Claude vs Codex)
  - Task type breakdown
  - Average duration

- ✅ Task duration stats: `taskQueue.getTaskDurationStats(daysBack)`
  - Percentiles (p50, p75, p90, p95, p99)
  - By task type and complexity

- ✅ Chain stats: `chainTracker.getChainStats(maxConcurrentChains)`
  - Active chains
  - Blocked chains
  - Implementation queue depth
  - Followup queue depth

**Missing Metrics**:
- ⚠️ Plan-level metrics (completion rate, velocity)
- ⚠️ Context bundle cache hit rate (logged but not aggregated)
- ⚠️ Recovery success rate (cleanup → followup completion)
- ⚠️ PR merge time distribution
- ⚠️ Worker utilization (idle time vs active time)

### 7.2 Recommended Dashboards

**Operations Dashboard**:
```
┌─────────────────────────────────────────────────┐
│  Active Plans: 5          Completed Today: 12   │
│  Active Chains: 2/3       Blocked: 1            │
│  Queue Depth: Impl(8) Follow(3)                 │
│  Workers: 2 active, 1 idle                      │
└─────────────────────────────────────────────────┘
```

**Health Dashboard**:
```
┌─────────────────────────────────────────────────┐
│  Plan Status Drift: 0 detected                  │
│  Stale Chains: 1 (>24h no activity)            │
│  Failed Context Gen: 3 today                    │
│  Worker Timeouts: 0 today                       │
│  Missed Webhooks: 0 detected (last poll: 2m)   │
└─────────────────────────────────────────────────┘
```

---

## 8. Conclusion

### 8.1 System Strengths

The app-monitor ecosystem demonstrates **strong architectural foundations**:

1. **Event-Driven Synchronization**: Plans automatically stay synchronized with task/PR/chain states through event hooks
2. **Comprehensive Error Recovery**: Two-stage cleanup/followup pattern with circular prevention
3. **Intelligent Context Management**: YAML recipe-based bundling with 90% cache hit rate
4. **ACID Compliance**: SQLite WAL mode + transactions prevent data corruption
5. **Concurrency Control**: Staged queue system prevents overwhelming GitHub with PRs
6. **Self-Healing**: Orphaned PR adoption, worker timeout detection, automatic retries

### 8.2 Critical Gaps

**Five critical gaps** require immediate attention (all solvable with event-driven triggers):

1. **Plan Status Drift**: Event handler failures cause drift without retry (P0)
2. **Chain Staleness**: Active chains can block slots indefinitely without detection (P0)
3. **Context Failure Visibility**: Silent failures leave agents without context (P0)
4. **Missed Webhook Recovery**: No verification of PR status on task completion (P0)
5. **Chain Auto-Unblocking**: Resolved blockers don't trigger automatic unblock (P0)

### 8.3 Overall Assessment

**Maturity Level**: Production-ready with operational oversight

The system is **highly sophisticated** and demonstrates deep understanding of distributed system challenges. The architecture is **already event-driven** - all recommended improvements build on existing event hooks.

**Recommended Next Steps**:
1. Implement P0 event-driven improvements (retry logic, lazy checks, lifecycle triggers)
2. Add verification points to existing lifecycle events (task completion, chain closure)
3. Enhance system startup to perform one-time reconciliation (adheres to event-driven philosophy)
4. Add manual trigger API endpoints for user intervention (on-demand events)

**Alignment with Master Design Intent**:
- ✅ All recommendations use event-driven triggers (task lifecycle, system startup, user actions)
- ✅ No polling, no cron jobs, no long-lived timers
- ✅ Lazy evaluation on data retrieval (plan status on getPlan)
- ✅ Manual triggers via API for user intervention

**Risk Assessment**:
- **Low Risk**: Task execution, context bundling, error recovery
- **Medium Risk**: Chain management (improved with P0 staleness detection)
- **Low Risk**: PR webhook reliability (improved with lifecycle verification)
- **Low Risk**: Plan status synchronization (improved with retry + lazy checks)

---

## Appendix A: Key Files Reference

| Component | Primary Files |
|-----------|--------------|
| Plan Management | `plans.service.ts`, `planProgressCalculator.service.ts`, `planStatusUpdater.service.ts` |
| Task Creation | `taskCreation.service.ts`, `taskQueue.sqlite.ts` |
| Context Bundling | `context/contextBundleGenerator.ts`, `context/contextRecipeSelector.ts` |
| Dev-Bot Execution | `devBotsManager.ts`, `taskExecution.service.ts`, `ephemeralWorker.service.ts` |
| Chain Management | `chainTracker.service.ts` |
| PR Workflow | `prWorkflowOrchestrator.service.ts`, `webhookHandlers/pullRequestHandler.ts` |
| Error Recovery | `failureRecovery.ts`, `retryCoordination.service.ts` |
| Monitoring | `workerHealthMonitor.service.ts`, `taskQueueMetrics.service.ts` |

## Appendix B: Database Schema

**Key Tables**:
- `plans` (migration 021): Plan metadata + computed status
- `tasks` (migration 002+): Tasks with plan_id, chain_id, context_bundle_id
- `workers` (migration 002): Ephemeral worker containers
- `task_executions` (migration 002): Execution history
- `context_bundle_cache` (migration 019): Git hash-based context cache
- `pr_condition_states` (migration 010): PR merge gate conditions

**Critical Indexes**:
- `idx_tasks_plan_id`: Fast plan → tasks lookup
- `idx_tasks_chain_id`: Chain management queries
- `idx_plans_status_priority`: Plan listing queries
- `idx_tasks_pr_number`: PR → tasks lookup

---

**End of Analysis**
**Next Review**: After implementing P0 recommendations
**Metrics Collection**: Enable comprehensive logging and monitoring
