# Dev-Bot Pipeline - REVISED Path to Completion

**Date:** 2025-11-10T20:06:00Z  
**Current Status:** ~60-70% Complete (Much more than initially assessed!)  
**Estimated Time to Complete:** 1-2 weeks (down from 3-4)  
**Reference:** `docs/plans/DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md`

---

## REVISION NOTES

**Previous Assessment:** Incorrectly stated ~30% complete  
**Actual Status:** ~60-70% complete based on deep audit  
**Key Discovery:** Artifact logging, task execution, and failure handling already implemented  
**CRITICAL MISSING:** Intelligent agent selection (Codex vs Claude vs Copilot delegation)

---

## ✅ What's ALREADY Implemented (60-70%)

### Core Infrastructure (100%)
- ✅ **DevBotsManager** (1,786 lines) - Task execution orchestration
- ✅ **TaskQueueService** (1,780 lines) - SQLite-based task persistence
- ✅ **TaskExecutionService** - Coordinates full task lifecycle
- ✅ **EphemeralWorkerService** - Docker container management
- ✅ **TaskCompletionService** - Handles task completion
- ✅ **WorkspaceSyncManager** - Git workspace management
- ✅ **DockerManager** - Container orchestration
- ✅ **ProcessManager** - Process lifecycle management

### Artifact System (80% - WORKING!)
- ✅ **Artifact Directory**: `dev-bots/artifacts/` exists and working
- ✅ **Log Capture**: stdout/stderr saved to disk
  - Format: `task-{id}-stdout-{timestamp}.log`
  - Format: `task-{id}-stderr-{timestamp}.log`
  - Evidence: 16+ log files currently in artifacts/
- ✅ **TaskExecutionService Integration**: Logs saved after each run
- ✅ **Path Resolution**: `resolveArtifactsDir()` in `utils/repoPaths.ts`
- ❌ **Missing**: session_summary.json generation
- ❌ **Missing**: Artifact linking in database (no task_artifacts table)

### Failure Handling (90%)
- ✅ **FailureRecovery** service - Recovery strategies
- ✅ **TaskFailureGuards** - Stuck task detection, failure patterns
- ✅ **RetryManager** - Exponential backoff retry logic
- ✅ **TIME_BASED_GUARDS** - Timeout enforcement
- ❌ **Missing**: Quarantine system for repeated failures

### UI Components (50%)
- ✅ **TaskLogViewer** - Real-time log streaming (EventSource)
  - Supports stdout/stderr switching
  - Auto-scroll capability
  - Bounded log buffer (4000 lines)
- ✅ **TaskQueuePanel** - Queue management UI
- ✅ **EnhancedTaskCreationForm** - Task creation with validation
- ❌ **Missing**: Task detail artifact browser
- ⏳ **Not Needed**: Context capture UI (not critical per requirements)

### What WORKS Right Now
```
1. Create task → Queue → Assign to ephemeral worker
2. Execute in Docker container
3. Capture stdout/stderr
4. Save logs to dev-bots/artifacts/
5. Detect failures and retry
6. View logs in UI (real-time streaming)
7. Complete/fail task appropriately
```

---

## ❌ What's Still Missing (30-40%)

### Database Schema (0% - Blocking)
- ❌ `task_context` TEXT column - Environment + app state
- ❌ `task_logs` TEXT column - Bounded log array (for quick access)
- ❌ `task_artifacts` table - Links tasks to artifact files
  ```sql
  CREATE TABLE task_artifacts (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    artifact_type TEXT NOT NULL, -- 'stdout', 'stderr', 'summary'
    file_path TEXT NOT NULL,
    file_size INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
  );
  ```
- ❌ `task_automation_runs` table - Execution attempt tracking
  ```sql
  CREATE TABLE task_automation_runs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    status TEXT NOT NULL, -- 'success', 'failure', 'error'
    exit_code INTEGER,
    artifact_dir TEXT,
    commit_sha TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    duration_ms INTEGER,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
  );
  ```

### Enhanced Artifact System (20% - Important)
- ❌ **session_summary.json** generation
  ```json
  {
    "exitCode": 0,
    "success": true,
    "commitSHA": "abc123",
    "duration": 45000,
    "filesChanged": ["src/foo.ts", "src/bar.ts"],
    "tokenUsage": {
      "input": 1500,
      "output": 800,
      "total": 2300,
      "cost": 0.023
    }
  }
  ```
- ❌ **Artifact registration** in database (task_artifacts table)
- ❌ **Artifact cleanup** - Retention policy (30 days)

### Quarantine System (0% - High Value)
- ❌ **TaskAutomationManager** extension to DevBotsManager
  - Track recent failures per task
  - Quarantine after N failures (prevent runaway retries)
  - Manual override capability
  - Quarantine dashboard/view

### Analytics (0% - Medium Value)
- ❌ **Automation metrics** tracking
  - Success rate by task type
  - Mean time to resolution (MTTR)
  - Token usage over time
  - Failure categories
- ❌ **Analytics API** endpoints
- ❌ **Analytics dashboard** (optional - can start with API-only)

### Auto-Actions (0% - Medium Value)
- ❌ **Auto-close** on successful PR merge
  - Already has PR workflow (recently implemented)
  - Just needs to link PR success → task completion
- ❌ **Auto-followup** on failure with artifacts
  - Create followup task
  - Attach session logs
  - Include failure summary

### Intelligent Agent Selection (0% - CRITICAL!) 🔴
- ❌ **Task classification** system
  - Infer category (implementation, analysis, documentation, review, planning)
  - Extract file patterns from task description
  - Estimate complexity (simple, medium, complex)
- ❌ **Agent capability mapping**
  - Claude: Code editing, implementation, refactoring
  - Codex: Analysis, planning, documentation (BAD at file editing)
  - Copilot: Async delegation for simple, low-risk polish tasks
- ❌ **Intelligent selection logic**
  - Decision tree based on task category, file patterns, complexity
  - Learn from previous attempts (if Claude failed, try Codex)
  - Explain selection reasoning in logs
- ❌ **Copilot delegation integration**
  - `/delegate` comment on PRs for simple docs/formatting
  - Monitor delegation results via webhooks

**Why Critical:** Current random/alternating selection wastes tokens and causes failures.
Codex fails at code editing but excels at analysis. Need intelligent routing.

**Reference:** `docs/INTELLIGENT_AGENT_SELECTION_STRATEGY.md`

---

## REVISED Path to Completion

### Phase 0: Intelligent Agent Selection (1.5 weeks) - P0 🔴 NEW

**Priority:** P0 (BLOCKING - Required for effective automation)

**Why P0:** Without this, we're sending tasks to the wrong agents, causing:
- Codex failing at code editing (should use Claude)
- Claude wasting tokens on simple docs (should use Codex or Copilot)
- High failure rates that could be avoided

**Tasks:**
1. **Task Classification System** (2-3 days)
   - Add fields: task_category, file_patterns, estimated_complexity
   - Create TaskClassifier service
   - Classify on task creation

2. **Intelligent AgentSelector** (2-3 days)
   - Decision tree: category → file patterns → complexity
   - Learn from previous failures
   - Explain selection reasoning

3. **Copilot Delegation** (1-2 days)
   - Integrate `/delegate` for simple tasks
   - Monitor delegation outcomes

4. **Learning & Optimization** (1 day)
   - Track success rates by agent + category
   - Adjust selection weights

**Deliverables:**
- Task classification working
- Intelligent agent selection active
- Copilot delegation available
- Selection metrics tracked

**Estimated Time:** 6-9 days (1.5 weeks)

**Reference:** `docs/INTELLIGENT_AGENT_SELECTION_STRATEGY.md`

---

### Phase 1: Database Schema & Artifact Registration (3-4 days)

**Priority:** P0 (Blocking for persistence)

**Tasks:**
1. **Create Migration Script**
   ```sql
   -- Migration: 00X_task_artifacts_and_runs
   
   ALTER TABLE tasks ADD COLUMN task_context TEXT; -- JSON, optional
   
   CREATE TABLE task_artifacts (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL,
     artifact_type TEXT NOT NULL,
     file_path TEXT NOT NULL,
     file_size INTEGER,
     created_at INTEGER NOT NULL,
     FOREIGN KEY (task_id) REFERENCES tasks(id)
   );
   
   CREATE TABLE task_automation_runs (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL,
     attempt_number INTEGER NOT NULL,
     status TEXT NOT NULL,
     exit_code INTEGER,
     artifact_dir TEXT,
     commit_sha TEXT,
     started_at INTEGER NOT NULL,
     completed_at INTEGER,
     duration_ms INTEGER,
     error_message TEXT,
     FOREIGN KEY (task_id) REFERENCES tasks(id)
   );
   
   CREATE INDEX idx_artifacts_task ON task_artifacts(task_id);
   CREATE INDEX idx_automation_runs_task ON task_automation_runs(task_id);
   CREATE INDEX idx_automation_runs_status ON task_automation_runs(status);
   ```

2. **Update TaskExecutionService**
   - Register artifacts in DB after saving files
   - Record automation run in task_automation_runs
   - Link artifact files to task

3. **Add API Endpoints** (simple additions)
   - `GET /api/tasks/:id/artifacts` - List artifacts for task
   - `GET /api/tasks/:id/runs` - Get automation run history
   - `GET /api/tasks/:id/artifacts/:artifactId/download` - Download artifact

**Deliverables:**
- Migration script tested on staging
- Artifact registration working
- API endpoints functional

**Estimated Time:** 3-4 days

---

### Phase 2: Session Summary & Analytics Foundation (2-3 days)

**Priority:** P1 (High value for debugging)

**Tasks:**
1. **Generate session_summary.json**
   ```typescript
   // In TaskExecutionService after execution completes
   async saveSessionSummary(taskId: string, result: ExecutionResult) {
     const summary = {
       exitCode: result.exitCode,
       success: result.exitCode === 0,
       commitSHA: result.commitSHA,
       duration: result.duration,
       filesChanged: result.filesChanged || [],
       errorMessage: result.error?.message,
       timestamp: new Date().toISOString()
     };
     
     const summaryPath = path.join(
       this.config.artifactsDir,
       `task-${taskId}-summary-${Date.now()}.json`
     );
     
     await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
     
     // Register in DB
     await this.registerArtifact(taskId, 'summary', summaryPath);
   }
   ```

2. **Add Basic Analytics**
   - Query automation_runs for success/failure rates
   - Calculate MTTR (completed_at - started_at averages)
   - Track by task type

3. **Analytics API**
   - `GET /api/analytics/automation` - Overall stats
   - `GET /api/analytics/automation/by-type` - Grouped by task type
   - `GET /api/analytics/automation/failures` - Recent failures

**Deliverables:**
- session_summary.json generated for every run
- Basic analytics API working
- Metrics queryable

**Estimated Time:** 2-3 days

---

### Phase 3: Quarantine System (2-3 days)

**Priority:** P1 (Prevents runaway failures)

**Tasks:**
1. **Extend DevBotsManager** (or create TaskAutomationManager wrapper)
   ```typescript
   class QuarantineManager {
     private quarantined = new Map<string, QuarantineRecord>();
     private readonly FAILURE_THRESHOLD = 3;
     
     shouldQuarantine(taskId: string): boolean {
       const runs = await this.getRecentRuns(taskId);
       const failures = runs.filter(r => r.status === 'failure');
       return failures.length >= this.FAILURE_THRESHOLD;
     }
     
     async quarantineTask(taskId: string, reason: string) {
       this.quarantined.set(taskId, {
         taskId,
         reason,
         quarantinedAt: Date.now(),
         canRetryAfter: Date.now() + (24 * 60 * 60 * 1000) // 24h
       });
       
       await this.taskQueue.updateTask(taskId, {
         status: 'quarantined',
         notes: `Quarantined: ${reason}`
       });
     }
     
     async releaseFromQuarantine(taskId: string) {
       this.quarantined.delete(taskId);
       await this.taskQueue.updateTask(taskId, {
         status: 'pending'
       });
     }
   }
   ```

2. **Integrate with Queue Processing**
   - Check quarantine before assigning task
   - Update task status to 'quarantined'
   - Log quarantine events

3. **Manual Override UI** (simple)
   - Show quarantined tasks in queue panel
   - Add "Release from Quarantine" button
   - Show quarantine reason

**Deliverables:**
- Quarantine system preventing runaway retries
- Manual override capability
- Quarantine visible in UI

**Estimated Time:** 2-3 days

---

### Phase 4: Auto-Actions & Integration (1-2 days)

**Priority:** P2 (Nice to have, builds on existing PR workflow)

**Tasks:**
1. **Auto-Close on PR Merge**
   ```typescript
   // In prMonitor.service.ts after PR merges
   async handlePRMerged(prNumber: number) {
     const tasks = await this.taskQueue.findByPRNumber(prNumber);
     
     for (const task of tasks) {
       // Check if automation was successful
       const lastRun = await this.getLastAutomationRun(task.id);
       
       if (lastRun?.status === 'success') {
         await this.taskQueue.completeTask(task.id, {
           notes: `Auto-closed: PR #${prNumber} merged successfully`
         });
       }
     }
   }
   ```

2. **Auto-Followup on Failure**
   ```typescript
   // In TaskExecutionService after failure
   async createFollowupOnFailure(task: Task, run: AutomationRun) {
     if (run.attempt_number >= 3) { // Max retries exceeded
       const followup = await this.taskQueue.createTask({
         title: `Fix: ${task.title}`,
         description: `Original task failed after ${run.attempt_number} attempts.`,
         type: 'bugfix',
         priority: 8,
         parent_task_id: task.id,
         context: {
           failureReason: run.error_message,
           lastRun: run.id,
           artifacts: await this.getArtifactsForRun(run.id)
         }
       });
       
       logger.info({
         category: 'automation',
         action: 'followup_created',
         message: `Created followup task ${followup.id} for failed task ${task.id}`
       });
     }
   }
   ```

**Deliverables:**
- Tasks auto-close when PR merges
- Followup tasks created on repeated failures
- Artifacts linked in followup context

**Estimated Time:** 1-2 days

---

### Phase 5: Polish & Documentation (1 day)

**Priority:** P2

**Tasks:**
1. **Artifact Cleanup Job**
   - Cron job to delete artifacts older than 30 days
   - Configurable retention period
   - Keep summaries longer than logs

2. **Update Documentation**
   - Update DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md status
   - Document artifact system
   - Document quarantine system
   - Add troubleshooting guide

3. **Dashboard Enhancements** (optional)
   - Show automation stats in existing dashboard
   - Recent failures panel
   - Quarantined tasks alert

**Deliverables:**
- Cleanup job working
- Documentation complete
- Optional dashboard widgets

**Estimated Time:** 1 day

---

## REVISED Timeline

| Phase | Description | Duration | Total |
|-------|-------------|----------|-------|
| 0 | **Intelligent Agent Selection** 🔴 | 1.5 weeks | 1.5 weeks |
| 1 | Database & Artifact Registration | 3-4 days | 2-2.5 weeks |
| 2 | Session Summary & Analytics | 2-3 days | 2.5-3 weeks |
| 3 | Quarantine System | 2-3 days | 3-3.5 weeks |
| 4 | Auto-Actions | 1-2 days | 3.5-4 weeks |
| 5 | Polish & Docs | 1 day | 3.5-4 weeks |

**Total Time:** 3.5-4 weeks (with one developer)

**Can Parallelize:**
- Phase 0 must complete first (blocking)
- Phase 2 can start once Phase 1 DB migration is done
- Phase 3 can develop in parallel with Phase 2

**Optimized Timeline:** 3-3.5 weeks with parallelization

---

## Priority Recommendation (REVISED)

### P0 (Blocking - MUST DO FIRST)
- **Phase 0:** Intelligent Agent Selection 🔴 **NEW**
  - **CRITICAL:** Without this, automation will continue to fail unnecessarily
  - Codex failing at code editing is a major waste
  - Must route tasks to appropriate agents
  - Blocks everything else from being effective

### P1 (High Value - Week 2-3)
- **Phase 1:** Database schema + artifact registration
  - Critical for data persistence
  - Enables everything else
- **Phase 2:** session_summary.json + analytics
  - Improves debugging significantly
  - Foundation for metrics
- **Phase 3:** Quarantine system
  - Prevents runaway failures (production concern)

### P2 (Nice to Have - Week 3-4)
- **Phase 4:** Auto-actions
  - Convenience features
  - Builds on existing PR workflow
- **Phase 5:** Polish
  - Cleanup and docs

### NOT NEEDED
- ❌ Context capture UI - Not critical for human intervention
- ❌ Complex analytics dashboard - API is sufficient initially
- ❌ Work-target config UI - Can configure via JSON/code

---

## What We DON'T Need to Build

Based on "only critical tasks that need human intervention":

1. ❌ **Context Capture UI** - Frontend log/network instrumentation
   - Reason: Dev-bots generate their own context
   - Alternative: Human tasks can attach text/files manually

2. ❌ **Analytics Dashboard** - Complex charts/graphs
   - Reason: API is sufficient for monitoring
   - Alternative: Query API, use external tools (Grafana)

3. ❌ **Screenshot Capture** - UI for attaching screenshots
   - Reason: Not relevant for dev-bot automation
   - Alternative: Manual upload if needed for human tasks

4. ❌ **Network Event Capture** - Fetch instrumentation
   - Reason: Dev-bots don't run in browser
   - Alternative: Server-side logging

5. ❌ **Work-Target Config UI** - Form for automation config
   - Reason: Developers can edit JSON/code directly
   - Alternative: Configuration files in repository

---

## Success Criteria (REVISED)

**Definition of Done:**
- ✅ Artifacts registered in database (task_artifacts table)
- ✅ Automation runs tracked (task_automation_runs table)
- ✅ session_summary.json generated for every run
- ✅ Analytics API returns success rates, MTTR
- ✅ Quarantine system prevents runaway retries
- ✅ Manual quarantine override works
- ✅ Auto-close on PR merge working
- ✅ Auto-followup on repeated failures
- ✅ Artifact cleanup job running
- ✅ Documentation updated

**Metrics to Track:**
- Automation success rate (target: >80%)
- Quarantine rate (target: <5%)
- False positive quarantine (target: <1%)
- Disk usage from artifacts (monitor growth)

---

## Risk Mitigation (REVISED)

**Reduced Risks** (vs original assessment):
1. ✅ Artifact logging already works - No risk
2. ✅ UI exists for log viewing - No development needed
3. ✅ Failure handling exists - Just needs quarantine layer

**Remaining Risks:**
1. **Database migration** - Could break existing tasks
   - Mitigation: Test on staging, add rollback script
2. **Quarantine false positives** - Good tasks blocked
   - Mitigation: Manual override, review metrics weekly
3. **Disk space** - Artifact growth
   - Mitigation: Cleanup job, monitor usage

---

## Next Steps

### Immediate (This Week)
1. Review revised plan with team
2. Approve Phase 1 (database schema)
3. Test migration on staging database
4. Begin artifact registration implementation

### Week 1
- Complete Phase 1 (DB + artifact registration)
- Start Phase 2 (session summary)

### Week 2  
- Complete Phase 2 & 3 (analytics + quarantine)
- Start Phase 4 (auto-actions)

### Week 3 (Buffer)
- Complete Phase 4 & 5
- Testing and documentation

---

**Created:** 2025-11-10T20:06:00Z  
**Supersedes:** DEV_BOT_PIPELINE_COMPLETION_PLAN.md (initial assessment)  
**Status:** Accurate based on deep code audit  
**Owner:** Platform Tooling Team
