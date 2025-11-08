# Dev-Bot Workflow Investigation Report

## Executive Summary

This investigation maps the complete dev-bot workflow with focus on artifact systems, logging, PR recovery mechanisms, and existing infrastructure that can be leveraged for PR orphan recovery.

**Key Finding**: The system already has comprehensive PR tracking and recovery infrastructure in place. PRs created by bots are:
1. Extracted from bot output
2. Persisted in SQLite database with full metadata
3. Monitored for status changes
4. Automatically managed (merge/failures trigger followup tasks)

This provides an excellent foundation for implementing PR orphan recovery.

---

## 1. Artifact Directory System

### Directory Structure

**Location**: `/home/jdubz/Development/app-monitor/dev-bots/artifacts/`

**Files Stored**:
- `task-{taskType}-{taskId}-stdout-{timestamp}.log` - Task standard output
- `task-{taskType}-{taskId}-stderr-{timestamp}.log` - Task error output
- `task-{taskId}-status-{timestamp}.txt` - Task status snapshots

**Example Files**:
```
task-refactoring-756a15a0-44b3-4dee-9a68-9f1cd7a253f4-stderr-1762575433594.log
task-refactoring-756a15a0-44b3-4dee-9a68-9f1cd7a253f4-stdout-1762575433594.log
task-refactoring-2ab0d82b-13af-4ca3-a632-8949dd306d4e-stderr-1762576985973.log
task-frontend-implementation-990e7afb-3d89-4dde-bfeb-6d58cc4deede-stderr-1762588892138.log
```

**Current Total**: 17 artifact files tracked (primarily from Nov 7-8, 2025)

### Log Stream Configuration

**File**: `backend/config/worker-log-streams.json`

```json
{
  "dev-bots": {
    "artifactRoot": "dev-bots/artifacts",
    "streams": {
      "stdout": {
        "pattern": "{taskId}-stdout-*.log",
        "label": "Task stdout",
        "encoding": "utf-8"
      },
      "stderr": {
        "pattern": "{taskId}-stderr-*.log",
        "label": "Task stderr",
        "encoding": "utf-8"
      }
    }
  }
}
```

### Log Location Service

**File**: `backend/src/services/taskLogLocator.ts` (111 lines)

**Key Class**: `WorkerLogLocator`

```typescript
class WorkerLogLocator {
  async getDescriptor(workTarget: string, taskId: string, stream: string): Promise<TaskLogFileDescriptor | null>
  // Returns: { filename, path, size, updatedAt, stream }
  
  private buildMatcher(pattern: string, taskId: string) 
  // Supports pattern matching with {taskId} placeholder and wildcards
}
```

**Interface**:
```typescript
interface TaskLogFileDescriptor {
  filename: string;
  path: string;
  size: number;
  updatedAt: string;
  stream: string; // 'stdout' or 'stderr'
}
```

**Usage**: 
- Loads configuration from `worker-log-streams.json`
- Searches artifact directory for log files matching task ID
- Returns most recent file descriptor (sorted by modification time)

---

## 2. Persistent Dev-Bot Logs

### Log Output Persistence

**Captured In**:
1. **Ephemeral Container Logs** (primary)
   - Location: Container stdout/stderr during execution
   - Collected by: `EphemeralWorkerService.executeTask()`
   - Lifecycle: Destroyed with container

2. **Artifact Files** (fallback)
   - Location: `/dev-bots/artifacts/{taskId}-{stream}-{timestamp}.log`
   - Created by: Task completion service captures output
   - Persistence: Indefinite

### Task Output Storage

**Database Fields** (SQLite, `taskQueue.sqlite.ts`):
```typescript
interface Task {
  id: string;
  // ... other fields
  prompt?: string;        // Full task prompt sent to bot
  output?: string;        // Bot stdout (task completion output)
  error?: string;         // Bot stderr (error output)
  
  // Execution details
  started_at?: number;
  completed_at?: number;
  
  // PR workflow fields
  pr_number?: number;
  pr_url?: string;
  pr_branch?: string;
  pr_status?: 'creating' | 'pending_checks' | 'pending_review' | 'ready_to_merge' | 'merged' | 'closed';
  pr_created_at?: number;
  pr_merged_at?: number;
}
```

### Log Naming Pattern

All logs follow pattern:
```
task-{taskType}-{taskId}-{stream}-{timestamp}.log
```

Where:
- `taskType`: Task category (e.g., 'refactoring', 'implementation', 'documentation')
- `taskId`: Full UUID from task database
- `stream`: 'stdout' or 'stderr'
- `timestamp`: Millisecond epoch when log was written

---

## 3. Existing Log Parsing Services

### PR Info Extraction Service

**File**: `backend/src/utils/prExtractor.ts` (136 lines)

**Key Function**: `extractPRInfo(output: string): PRInfo | null`

Extracts PR metadata from bot output using multiple pattern matching strategies:

```typescript
interface PRInfo {
  number: number;
  url: string;
  branch: string;
}

// Supported extraction patterns:

// Pattern 1: Explicit format (recommended)
PR_NUMBER: 42
PR_URL: https://github.com/owner/repo/pull/42
PR_BRANCH: task-feat-add-feature

// Pattern 2: gh pr create output
Created pull request: https://github.com/Jdubz/app-monitor/pull/123
Switched to branch 'task-fix-bug'

// Pattern 3: PR merge message format
Pull request #99 from Jdubz/feature-branch
```

**Helper Functions**:
- `isValidPRInfo(prInfo: PRInfo | null): prInfo is PRInfo` - Validates PR data
- `extractPRNumber(text: string): number | null` - Extracts just PR number

**Usage**:
- Called in `TaskCompletionService.completeEphemeralTask()`
- Updates task with PR metadata
- Triggers PR workflow orchestrator

### Task Completion Service

**File**: `backend/src/services/taskCompletion.service.ts` (300+ lines)

**Key Method**: `completeEphemeralTask(worker, output, errorOutput, exitCode, onAssignNext)`

```typescript
async completeEphemeralTask(
  worker: EphemeralWorker,
  output: string,
  errorOutput: string,
  exitCode: number,
  onAssignNext: () => Promise<void>
): Promise<void> {
  // 1. Extract and record PR info from output
  this.extractAndRecordPRInfo(task, output);
  
  // 2. Run task verification (if enabled)
  if (shouldPush && this.config.enableTaskVerification) {
    taskVerification = await this.runTaskVerification(task, workspacePath, output);
  }
  
  // 3. Run quality gates (if enabled)
  if (shouldPush && this.config.enableQualityGates) {
    qualityValidation = await this.runQualityGateValidation(task, workspacePath);
  }
  
  // 4. Create quality observations and improvement tasks
  if (finalStatus === 'completed') {
    await this.createQualityObservationAndImprovements(task, taskVerification, qualityValidation);
  }
  
  // 5. Emit callback for PR workflow
  this.config.onPRCreated?.(task);
}
```

**Integration Point**:
- Task.output captures full bot stdout
- Task.error captures full bot stderr
- Both stored in SQLite and available for log analysis

---

## 4. Complete Dev-Bot Workflow

### Workflow Stages

#### Stage 1: Task Creation & Assignment
```
User/System
  ↓
DevBotsManager.addTask(taskData)
  ↓
TaskQueueService.createTask()
  ↓ (stored in SQLite)
Task Status: PENDING
```

**File**: `backend/src/services/devBotsManager.ts` (lines 830-983)

#### Stage 2: Worker Execution
```
AssignNextTask()
  ↓
TaskExecutionService.assignNextTask()
  ↓
EphemeralWorkerService.createWorker(task, agent)
  ↓
Docker Container Created
  ↓
Workspace Copied INTO Container (docker cp approach)
  ↓
Claude Code CLI Executes Task
  ↓
Output Captured (stdout/stderr)
  ↓
Task Status: RUNNING
```

**File**: `backend/src/services/ephemeralWorker.service.ts` (300+ lines)

**Key Method**: `createWorker(task: Task, agent: AgentPersonality): Promise<EphemeralWorker>`

Notable Implementation Details:
- Creates ephemeral Docker container with `--rm` flag (auto-cleanup)
- Copies entire workspace into container via `docker cp`
- No persistent volume mounts (security isolation)
- Mounts logs directory: `${hostLogsDir}:/app/logs:rw`
- Workspace ID format: `{agent.id}-{task.id}-{Date.now()}`

#### Stage 3: Task Completion & PR Workflow
```
Task Execution Completes
  ↓
TaskCompletionService.completeEphemeralTask()
  ↓ (1) Extract PR info from output
  ↓ (2) Extract token usage
  ↓ (3) Run quality gates (if enabled)
  ↓ (4) Update task with PR metadata
  ↓
Task Status: COMPLETED
  ↓
PRWorkflowOrchestrator.handleTaskCompletion(task, output)
  ↓
Register PR for Monitoring
  ↓
PRMonitorService.registerPR(task)
```

**File**: `backend/src/services/prWorkflowOrchestrator.service.ts` (322 lines)

#### Stage 4: PR Monitoring & Auto-Merge
```
PRMonitorService.startPolling() (every 60 seconds)
  ↓ for each monitored PR:
  ↓
GitHubPRService.getPRStatus(prNumber)
  ↓ checks:
  ↓   - Check status (success/failure)
  ↓   - Review status (approved/changes requested)
  ↓   - Copilot analysis (blocking issues/suggestions)
  ↓
Decision Logic:
  - If PR is merged → Mark as merged
  - If PR is closed → Mark as failed
  - If all checks pass & no blocking issues → Auto-merge (if enabled)
  - If blocking issues found → Create followup task
  ↓
Task Status: COMPLETED/FAILED or PENDING (if followup created)
```

**File**: `backend/src/services/prMonitor.service.ts` (400+ lines)

---

## 5. PR Tracking & Recovery Infrastructure

### PR Database Fields

All PR metadata is stored in `tasks` table:

```typescript
interface Task {
  // PR workflow fields
  pr_number?: number;              // GitHub PR number
  pr_url?: string;                 // Full PR URL
  pr_branch?: string;              // Feature branch name
  pr_status?: 'creating' | 'pending_checks' | 'pending_review' | 'ready_to_merge' | 'merged' | 'closed';
  pr_checks_status?: 'pending' | 'success' | 'failure';
  pr_review_status?: 'no_reviews' | 'approved' | 'changes_requested' | 'commented';
  pr_created_at?: number;          // Timestamp when PR was created
  pr_merged_at?: number;           // Timestamp when PR was merged
  
  // Followup task linking
  followup_for_pr?: number;        // If this task fixes issues from a PR
  followup_tasks?: string[];       // Child tasks created to fix PR issues
}
```

### PR Query Methods

**File**: `backend/src/services/taskQueue.sqlite.ts`

```typescript
// Get all tasks with unmerged PRs
getTasksWithUnmergedPRs(): Task[] {
  const stmt = this.db.prepare(`
    SELECT * FROM tasks
    WHERE pr_number IS NOT NULL
      AND pr_url IS NOT NULL
      AND pr_branch IS NOT NULL
      AND (pr_status IS NULL OR pr_status != 'merged')
    ORDER BY pr_created_at DESC
  `);
  return stmt.all() as Task[];
}
```

This query finds:
- All tasks that created PRs
- PRs that are NOT yet merged
- Returns newest first (by created_at timestamp)

### PR Status Update Methods

```typescript
// Called by PRMonitorService when status changes
async updateTask(taskId: string, updates: Partial<Task>): Promise<void>
  // Updates: pr_status, pr_checks_status, pr_review_status, pr_merged_at

// Used by PRWorkflowOrchestrator after task completion
async updateTask(taskId: string, {
  pr_number: prInfo.number,
  pr_url: prInfo.url,
  pr_branch: prInfo.branch,
  pr_status: 'pending_checks',
  pr_created_at: Date.now()
})
```

---

## 6. Failure Recovery System

### Two-Stage Recovery Pattern

**File**: `backend/src/services/failureRecovery.ts` (343 lines)

When a task fails, the system creates two sequential repair tasks:

#### Stage 1: Cleanup Task
- Focus: Fix the error only
- Constraints: Minimal changes (< 5 files, < 100 lines)
- Priority: 100 (front of queue)
- Metadata: `{ isRepairBot: true, repairStage: 'cleanup', originalTaskId }`

#### Stage 2: Followup Task
- Trigger: Created automatically when cleanup completes successfully
- Focus: Complete original goal
- Priority: 100
- Metadata: `{ isRepairBot: true, repairStage: 'followup', originalTaskId, cleanupTaskId }`

### Repair Bot Query Methods

```typescript
// Get all repair tasks for a failed task
getRepairBotsForTask(originalTaskId: string): Task[] {
  const rows = this.db.prepare(`
    SELECT * FROM tasks
    WHERE original_task_id = ?
      AND is_repair_bot = 1
    ORDER BY created_at ASC
  `).all(originalTaskId) as Task[];
  
  return rows;
}
```

### Recovery Integration Points

1. **Task Execution Service** (`taskExecution.service.ts`):
   - On task failure: Calls `failTaskWithRecovery()`
   - Detects failure pattern via `detectFailurePattern()`
   - Calls `this.recovery.attemptRecovery()`

2. **Task Completion Service** (`taskCompletion.service.ts`):
   - On cleanup task completion: Checks metadata
   - If `repairStage === 'cleanup'`: Calls recovery service to create followup

3. **Recoverable Error Categories**:
   - `cli_incompatibility`: Command not found, version mismatches
   - `missing_resource`: Files, dependencies, configuration
   - `syntax_error`: Code syntax issues
   - `import_error`: Module imports
   - `config_error`: Configuration problems

---

## 7. Workspace & Container Management

### Container Lifecycle

**File**: `backend/src/services/ephemeralWorker.service.ts`

```typescript
interface EphemeralWorker {
  id: string;
  containerId: string;
  agent: AgentPersonality;
  task: Task;
  status: 'starting' | 'running' | 'completing' | 'completed' | 'failed' | 'destroyed';
  createdAt: string;
  workspace: WorkspaceContext;
}

interface WorkspaceContext {
  id: string;
  hostPath: string;       // EMPTY (workspace only in container)
  branchName: string;     // 'staging' or PR branch
  mirrorPath: string;     // EMPTY (no persistent mirror)
  createdAt: string;
}
```

### Container Setup

1. **Create Container**:
   - Image: `dev-bot:latest`
   - Memory: 512MB
   - CPU Quota: 50%
   - AutoRemove: true (cleanup on exit)
   - WorkingDir: `/workspace`

2. **Mount Binds**:
   ```
   ${hostLogsDir}:/app/logs:rw                    # Logs directory
   ${claudeCredentials}:/tmp/host-creds.json:ro   # Claude API credentials
   ${gitCredentials}:/home/worker/.git-credentials:ro  # Git credentials
   ${sshDir}:/home/worker/.ssh:ro                 # SSH keys
   ```

3. **Copy Workspace**:
   - Uses `docker cp` to copy repository into container
   - Chown to worker user inside container
   - Path: `/workspace` inside container

4. **Execute Task**:
   - Claude Code CLI runs inside container
   - Full isolation (security)
   - No persistent modifications to host

5. **Cleanup**:
   - Container auto-destroys on exit (`--rm`)
   - Workspace lost (designed for statelessness)
   - Logs preserved in artifact files

---

## 8. Fallback Mechanisms & Emergency Scenarios

### When Patch Files Would Be Created

**Current Status**: NOT IMPLEMENTED (by design)

The system was designed to NOT create patch files because:
1. Container gets destroyed after execution
2. Workspace is ephemeral (inside container)
3. All changes are captured in git (Claude CLI commits)
4. Output is logged to artifacts for recovery

**Quote from TaskCompletionService**:
```typescript
// NOTE: Patch creation not possible with Docker cp approach
// The workspace is inside the container which gets destroyed
// Task output contains all the changes that were made
logger.warn({
  category: 'process',
  action: 'task_failed_no_patch',
  message: `Task ${task.id} failed - workspace inside container (no patch artifact)`,
  details: {
    taskId: task.id,
    failureReason
  }
});
```

### What IS Captured for Recovery

1. **Task Output** (`task.output`):
   - Full stdout from bot execution
   - May contain file diffs
   - May contain git status output
   - Stored in SQLite + artifact file

2. **Task Error** (`task.error`):
   - Full stderr from bot execution
   - Error messages and stack traces
   - Stored in SQLite + artifact file

3. **PR Information** (`pr_*` fields):
   - PR number, URL, branch
   - PR creation timestamp
   - PR status at last check
   - Stored in SQLite

4. **Failure Pattern** (`task.error`):
   - Analyzed by `detectFailurePattern()`
   - Category identifies error type
   - Stored for recovery decision

### Emergency Fallback Flow

```
Task Fails
  ↓
1. Capture output to task.output/task.error
  ↓
2. Write artifacts to dev-bots/artifacts/{taskId}-{stream}.log
  ↓
3. Analyze failure pattern
  ↓
4. If recoverable:
     → Create cleanup task with full error context
     → Log full error in cleanup prompt
     → Allow cleanup bot to re-run work
  ↓
5. If PR was created:
     → Check pr_status in database
     → Query GitHub for actual PR state
     → Create followup task if issues found
```

---

## 9. What Infrastructure Already Exists for PR Orphan Recovery

### 1. PR Detection & Logging

- **Service**: `prExtractor.ts` (already extracts PR info from output)
- **Storage**: SQLite task fields capture all PR metadata
- **Pattern Matching**: Multiple extraction patterns handle different output formats

### 2. PR Database Tracking

- **Service**: `taskQueue.sqlite.ts` (PR fields in Task interface)
- **Query**: `getTasksWithUnmergedPRs()` finds all incomplete PRs
- **Monitoring**: PR status fields track current state

### 3. PR Status Monitoring

- **Service**: `prMonitor.service.ts` (polls GitHub API for PR state)
- **Detection**: Automatically checks if PR exists, is merged, is closed
- **Updates**: Updates database when status changes

### 4. GitHub API Integration

- **Service**: `githubPR.service.ts` (gh CLI wrapper)
- **Capability**: Can query PR status, reviews, checks, comments
- **Circuit Breaker**: Has protection against API failures

### 5. Log Persistence & Retrieval

- **Service**: `taskLogLocator.ts` (finds log files by task ID)
- **Storage**: Artifact files in `/dev-bots/artifacts/`
- **Pattern**: Standard naming enables recovery

### 6. Task Output Analysis

- **Service**: `taskCompletion.service.ts` (extracts info from output)
- **Extraction**: PR info, token usage, quality observations
- **Verification**: Runs verification checks on output

### 7. Recovery Task Creation

- **Service**: `failureRecovery.ts` (creates repair tasks)
- **Mechanism**: Can create cleanup + followup tasks
- **Metadata**: Tracks relationships between tasks

---

## 10. Key Files & Line Numbers

### Core Services

| File | Lines | Purpose |
|------|-------|---------|
| `devBotsManager.ts` | 1666 | Main orchestrator for bot system |
| `taskQueue.sqlite.ts` | 1409 | Task persistence & PR tracking |
| `ephemeralWorker.service.ts` | 400+ | Container lifecycle management |
| `taskExecution.service.ts` | 500+ | Task execution coordination |
| `taskCompletion.service.ts` | 300+ | Task completion & quality gates |
| `failureRecovery.ts` | 343 | Two-stage recovery system |

### PR Workflow Services

| File | Lines | Purpose |
|------|-------|---------|
| `prWorkflowOrchestrator.service.ts` | 322 | PR creation & registration |
| `prMonitor.service.ts` | 450+ | PR monitoring & auto-merge |
| `githubPR.service.ts` | 350+ | GitHub API wrapper |
| `prExtractor.ts` | 136 | Extract PR info from output |

### Logging & Recovery

| File | Lines | Purpose |
|------|-------|---------|
| `taskLogLocator.ts` | 111 | Find log files by task ID |
| `logStreamer.ts` | 200+ | Stream logs to clients |
| `taskFailureGuards.ts` | 300+ | Detect failure patterns |

### Configuration

| File | Purpose |
|------|---------|
| `worker-log-streams.json` | Define log artifact locations & patterns |
| `log-sources.json` | Define external log sources |
| `config.ts` | System-wide configuration |

---

## 11. Database Schema for PR Recovery

### Tasks Table (Relevant Fields)

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed', ...)),
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  
  -- PR workflow fields
  pr_number INTEGER,
  pr_url TEXT,
  pr_branch TEXT,
  pr_status TEXT CHECK(pr_status IN ('creating', 'pending_checks', 'pending_review', 'ready_to_merge', 'merged', 'closed')),
  pr_checks_status TEXT CHECK(pr_checks_status IN ('pending', 'success', 'failure')),
  pr_review_status TEXT CHECK(pr_review_status IN ('no_reviews', 'approved', 'changes_requested', 'commented')),
  pr_created_at INTEGER,
  pr_merged_at INTEGER,
  
  -- Output for recovery
  output TEXT,           -- Full stdout (may contain PR URL)
  error TEXT,            -- Full stderr (error details)
  
  -- Recovery metadata
  is_repair_bot INTEGER DEFAULT 0,
  original_task_id TEXT,
  repair_stage TEXT CHECK(repair_stage IN ('cleanup', 'followup')),
  
  -- Other fields...
);

CREATE INDEX idx_tasks_pr_number ON tasks(pr_number);
CREATE INDEX idx_tasks_pr_status ON tasks(pr_status);
```

### Query to Find Orphaned PRs

```sql
-- Find all tasks that created PRs but are not yet merged
SELECT * FROM tasks
WHERE pr_number IS NOT NULL
  AND pr_url IS NOT NULL
  AND pr_branch IS NOT NULL
  AND (pr_status IS NULL OR pr_status != 'merged')
ORDER BY pr_created_at DESC;
```

---

## 12. Recommendations for PR Orphan Recovery Implementation

### What to Leverage

1. **`WorkerLogLocator`** - Find task logs by ID
   ```typescript
   const logLocator = new WorkerLogLocator();
   const descriptor = await logLocator.getDescriptor('dev-bots', taskId, 'stdout');
   // Returns: { filename, path, size, updatedAt }
   ```

2. **`extractPRInfo()`** - Parse PR from output
   ```typescript
   const prInfo = extractPRInfo(taskOutput);
   // Returns: { number, url, branch } or null
   ```

3. **`taskQueue.getTasksWithUnmergedPRs()`** - Find incomplete PRs
   ```typescript
   const unmergedPRs = taskQueue.getTasksWithUnmergedPRs();
   // All tasks that created PRs but aren't merged yet
   ```

4. **`prMonitor.registerPR()`** - Start monitoring recovered PR
   ```typescript
   prMonitor.registerPR(task);
   // Automatically monitors PR for status changes
   ```

5. **`GitHubPRService.getPRStatus()`** - Verify PR still exists
   ```typescript
   const status = await githubPR.getPRStatus(prNumber);
   // Confirm PR exists and get current state
   ```

### Recovery Workflow

```typescript
// 1. Find tasks that might have orphaned PRs
const tasksWithLostPRInfo = await findOrphanedTasks();

for (const task of tasksWithLostPRInfo) {
  // 2. Try to find PR info in logs
  const logDescriptor = await logLocator.getDescriptor('dev-bots', task.id, 'stdout');
  if (logDescriptor) {
    const logContent = fs.readFileSync(logDescriptor.path, 'utf-8');
    const prInfo = extractPRInfo(logContent);
    
    // 3. Verify PR still exists on GitHub
    if (prInfo) {
      const prStatus = await githubPR.getPRStatus(prInfo.number);
      
      // 4. Update database with recovered PR info
      await taskQueue.updateTask(task.id, {
        pr_number: prInfo.number,
        pr_url: prInfo.url,
        pr_branch: prInfo.branch,
        pr_status: 'pending_checks'
      });
      
      // 5. Resume monitoring
      prMonitor.registerPR(updatedTask);
    }
  }
}
```

---

## Conclusion

The dev-bot system has comprehensive infrastructure for:

1. **PR Creation & Detection** - Extracts from output, stores in DB
2. **PR Monitoring** - Continuously checks status
3. **PR Auto-Management** - Merges or creates followup tasks
4. **Log Persistence** - All output saved to artifacts
5. **Recovery Mechanisms** - Two-stage repair bots
6. **Database Tracking** - Full PR metadata in SQLite

**For PR Orphan Recovery**, we can leverage:
- Log location and parsing services
- PR extraction utilities
- Database query methods
- GitHub API integration
- Task creation mechanisms

All pieces are already in place. The implementation would primarily be an orchestration layer that ties these existing services together.

