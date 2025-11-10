# Dev-Bot Pipeline Enhancement - Path to Completion

**Date:** 2025-11-10T19:53:00Z  
**Current Status:** ~30% Complete (Core infrastructure only)  
**Estimated Time to Complete:** 3-4 weeks  
**Reference:** `docs/plans/DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md`

---

## Current State Analysis

### ✅ What's Implemented (30%)

**Core Infrastructure:**
- ✅ DevBotsManager (1,786 lines) - Task execution orchestration
- ✅ WorkspaceSyncManager - Git workspace management
- ✅ DockerManager - Container orchestration
- ✅ TaskQueue (SQLite) - Task persistence
- ✅ ProcessManager - Process lifecycle management
- ✅ RetryManager - Retry logic with exponential backoff
- ✅ AgentPersonalities - Bot personality system
- ✅ TaskPromptTemplates - Prompt generation

**What Works:**
- Task creation and queueing
- Docker container workspace isolation
- Git repository mirroring
- Basic task execution
- Process monitoring
- Retry on failure

### ❌ What's Missing (70%)

According to DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md, the following stages are **not implemented**:

#### Stage 1: Data Foundations (0% Complete)
- ❌ `task_context` JSON column - Environment + app state
- ❌ `task_logs` JSON column - Bounded log array
- ❌ `task_network_events` JSON column - Network request capture
- ❌ `task_artifacts` table - Screenshots, patches, session logs
- ❌ `task_automation_runs` table - Execution attempt tracking
- ❌ API schema validation for context payloads
- ❌ Database migration scripts

#### Stage 2: Context Capture MVP (0% Complete)
- ❌ Frontend TaskContext UI components
- ❌ Console log instrumentation
- ❌ Network request capture
- ❌ Screenshot attachment capability
- ❌ CLI flags for context submission
- ❌ Task detail view context display
- ❌ JSON Schema validation

#### Stage 3: Dev-Bot Pipeline Hardening (0% Complete)
- ❌ TaskAutomationManager class (builds on DevBotsManager)
- ❌ Single-concurrency locking
- ❌ `_recent_failures` quarantine system
- ❌ Automation attempt counters
- ❌ `session.log` capture (stdout/stderr)
- ❌ `session_summary.json` generation
- ❌ Bootstrap script enhancements
- ❌ Artifact storage under `logs/dev-bots/<task_id>/<timestamp>/`
- ❌ Artifact linking in task detail

#### Stage 4: Work-Target Configuration (0% Complete)
- ❌ Per-target automation config in registry
- ❌ Image/branch/command configuration
- ❌ Credential passthrough per target
- ❌ Bootstrap path configuration
- ❌ Container image validation

#### Stage 5: Continuous Queue Integration (0% Complete)
- ❌ Auto-close tasks on successful runs
- ❌ Auto-generate followup tasks on failure
- ❌ Analytics dashboard (success rate, MTTR, failure categories)
- ❌ Backlog prioritization based on telemetry

---

## Path to Completion

### Phase 1: Data Foundations (1 week)

**Goal:** Add persistence layer for context, logs, and automation tracking

**Tasks:**
1. **Database Schema Migration**
   ```sql
   -- Migration: 00X_dev_bot_context_and_artifacts
   
   ALTER TABLE tasks ADD COLUMN task_context TEXT; -- JSON
   ALTER TABLE tasks ADD COLUMN task_logs TEXT; -- JSON array
   ALTER TABLE tasks ADD COLUMN task_network_events TEXT; -- JSON array
   
   CREATE TABLE task_artifacts (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL,
     artifact_type TEXT NOT NULL, -- 'screenshot', 'log', 'patch', 'summary'
     file_path TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     metadata TEXT, -- JSON
     FOREIGN KEY (task_id) REFERENCES tasks(id)
   );
   
   CREATE TABLE task_automation_runs (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL,
     attempt_number INTEGER NOT NULL,
     status TEXT NOT NULL, -- 'success', 'failure', 'error'
     exit_code INTEGER,
     log_dir TEXT,
     summary_json TEXT, -- JSON
     commit_sha TEXT,
     started_at INTEGER NOT NULL,
     completed_at INTEGER,
     duration_ms INTEGER,
     worker_id TEXT,
     FOREIGN KEY (task_id) REFERENCES tasks(id)
   );
   
   CREATE INDEX idx_artifacts_task ON task_artifacts(task_id);
   CREATE INDEX idx_automation_runs_task ON task_automation_runs(task_id);
   ```

2. **Update TaskQueue Service**
   - Add methods: `attachContext()`, `appendLog()`, `createArtifact()`, `recordAutomationRun()`
   - Add TypeScript interfaces for context, logs, artifacts, runs
   - Add JSON Schema validators

3. **Update Task API**
   - `POST /api/tasks` - Accept optional context payload
   - `GET /api/tasks/:id` - Return context, logs, artifacts
   - `POST /api/tasks/:id/artifacts` - Upload artifact
   - `GET /api/tasks/:id/runs` - Get automation run history

**Acceptance Criteria:**
- Database migration runs successfully
- Task API accepts and returns context data
- All tests pass with new schema

**Estimated Time:** 3-4 days

---

### Phase 2: Artifact Trail System (1 week)

**Goal:** Capture and persist execution artifacts for debugging

**Tasks:**
1. **Create Artifact Storage System**
   ```typescript
   // backend/src/services/artifactManager.ts
   export class ArtifactManager {
     private readonly artifactRoot = 'logs/dev-bots';
     
     async createRunDirectory(taskId: string): Promise<string> {
       const timestamp = Date.now();
       const path = `${this.artifactRoot}/${taskId}/${timestamp}`;
       await fs.mkdir(path, { recursive: true });
       return path;
     }
     
     async saveSessionLog(runDir: string, stdout: string, stderr: string): Promise<void> {
       const combined = `=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}`;
       await fs.writeFile(`${runDir}/session.log`, combined);
     }
     
     async saveSessionSummary(runDir: string, summary: SessionSummary): Promise<void> {
       await fs.writeFile(`${runDir}/session_summary.json`, JSON.stringify(summary, null, 2));
     }
     
     async savePatch(runDir: string, diff: string): Promise<void> {
       await fs.writeFile(`${runDir}/changes.patch`, diff);
     }
   }
   
   export interface SessionSummary {
     exitCode: number;
     success: boolean;
     failureReason?: string;
     commitSHA?: string;
     tokenUsage?: {
       input: number;
       output: number;
       total: number;
       cost: number;
     };
     filesChanged?: string[];
     duration: number; // ms
   }
   ```

2. **Update DevBotsManager**
   - Capture stdout/stderr during execution
   - Generate session summary after task completes
   - Store artifacts before cleanup
   - Link artifacts to task in database

3. **Bootstrap Script Enhancements**
   ```bash
   #!/bin/bash
   # dev-bots/bootstrap.sh
   
   set -e
   
   # Configure git
   git config user.name "Dev Bot"
   git config user.email "bot@app-monitor.local"
   
   # Capture all output
   exec 1> >(tee -a session.log)
   exec 2>&1
   
   # Run commands
   npm install
   npm run lint
   npm run build
   npm test
   
   # Generate summary
   cat << EOF > session_summary.json
   {
     "exitCode": $?,
     "success": $([ $? -eq 0 ] && echo true || echo false),
     "commitSHA": "$(git rev-parse HEAD)",
     "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   }
   EOF
   ```

**Acceptance Criteria:**
- Session logs captured for every run
- Session summary JSON generated
- Artifacts stored in correct directory structure
- Artifacts linked to tasks in database

**Estimated Time:** 4-5 days

---

### Phase 3: Context Capture UI (3-4 days)

**Goal:** Allow users to attach rich context when creating tasks

**Tasks:**
1. **Create TaskContext React Components**
   ```typescript
   // frontend/src/components/TaskContext/index.tsx
   export const TaskContextCapture: React.FC = () => {
     const [logs, setLogs] = useState<string[]>([]);
     const [networkEvents, setNetworkEvents] = useState<NetworkEvent[]>([]);
     
     // Instrument console
     useEffect(() => {
       const originalLog = console.log;
       console.log = (...args) => {
         setLogs(prev => [...prev.slice(-100), args.join(' ')]);
         originalLog(...args);
       };
       return () => { console.log = originalLog; };
     }, []);
     
     // Instrument fetch
     useEffect(() => {
       const originalFetch = window.fetch;
       window.fetch = async (...args) => {
         const start = Date.now();
         const response = await originalFetch(...args);
         setNetworkEvents(prev => [...prev, {
           url: args[0],
           method: args[1]?.method || 'GET',
           status: response.status,
           duration: Date.now() - start
         }]);
         return response;
       };
       return () => { window.fetch = originalFetch; };
     }, []);
     
     return (
       <ContextCapturePanel logs={logs} networkEvents={networkEvents} />
     );
   };
   ```

2. **Update Task Creation Form**
   - Add context capture toggle
   - Display captured logs/network events
   - Allow screenshot attachment
   - Environment snapshot (app version, browser, OS)

3. **Update CLI**
   ```bash
   # cli/tasks.ts
   async create(title: string, options: {
     context?: string; // JSON file path
     attachLogs?: boolean;
   }) {
     const contextData = options.context 
       ? JSON.parse(await fs.readFile(options.context))
       : undefined;
     
     await api.post('/tasks', {
       title,
       description,
       task_context: contextData
     });
   }
   ```

**Acceptance Criteria:**
- UI components capture console logs
- UI components capture network requests
- Context included in task creation
- Task detail view displays context

**Estimated Time:** 3-4 days

---

### Phase 4: TaskAutomationManager (1 week)

**Goal:** Queue management with locking, retry guards, and failure tracking

**Tasks:**
1. **Create TaskAutomationManager**
   ```typescript
   // backend/src/services/taskAutomationManager.ts
   export class TaskAutomationManager extends DevBotsManager {
     private readonly queueLock = new AsyncLock();
     private readonly recentFailures = new Map<string, number>(); // task_id -> failure_count
     private readonly MAX_RETRY_ATTEMPTS = 3;
     private readonly QUARANTINE_THRESHOLD = 3; // failures before quarantine
     
     async processQueue(): Promise<void> {
       await this.queueLock.acquire('queue', async () => {
         const tasks = await this.getEligibleTasks();
         
         for (const task of tasks) {
           // Skip quarantined tasks
           if (this.isQuarantined(task.id)) {
             continue;
           }
           
           // Check retry limit
           const attempts = await this.getAutomationAttempts(task.id);
           if (attempts >= this.MAX_RETRY_ATTEMPTS) {
             await this.escalateToHuman(task.id);
             continue;
           }
           
           // Execute task
           try {
             await this.executeTaskWithArtifacts(task);
             this.recentFailures.delete(task.id);
           } catch (error) {
             this.handleAutomationFailure(task.id, error);
           }
         }
       });
     }
     
     private async getEligibleTasks(): Promise<Task[]> {
       return await this.taskQueue.findTasks({
         status: 'pending',
         automation_enabled: true,
         // Exclude quarantined
         id_not_in: Array.from(this.recentFailures.keys())
       });
     }
     
     private async executeTaskWithArtifacts(task: Task): Promise<void> {
       const runDir = await this.artifactManager.createRunDirectory(task.id);
       const startTime = Date.now();
       
       try {
         const result = await this.executeTask(task);
         
         // Save artifacts
         await this.artifactManager.saveSessionLog(runDir, result.stdout, result.stderr);
         await this.artifactManager.saveSessionSummary(runDir, {
           exitCode: result.exitCode,
           success: result.exitCode === 0,
           commitSHA: result.commitSHA,
           duration: Date.now() - startTime
         });
         
         // Record run
         await this.taskQueue.recordAutomationRun(task.id, {
           status: 'success',
           exitCode: result.exitCode,
           log_dir: runDir,
           duration_ms: Date.now() - startTime
         });
       } catch (error) {
         // Save failure artifacts
         await this.artifactManager.saveSessionSummary(runDir, {
           exitCode: 1,
           success: false,
           failureReason: error.message,
           duration: Date.now() - startTime
         });
         
         throw error;
       }
     }
     
     private handleAutomationFailure(taskId: string, error: Error): void {
       const failures = (this.recentFailures.get(taskId) || 0) + 1;
       this.recentFailures.set(taskId, failures);
       
       if (failures >= this.QUARANTINE_THRESHOLD) {
         logger.warn({
           category: 'automation',
           action: 'task_quarantined',
           message: `Task ${taskId} quarantined after ${failures} failures`,
           details: { task_id: taskId, failures }
         });
       }
     }
     
     private isQuarantined(taskId: string): boolean {
       const failures = this.recentFailures.get(taskId) || 0;
       return failures >= this.QUARANTINE_THRESHOLD;
     }
   }
   ```

2. **Integrate with Existing System**
   - Replace DevBotsManager usage with TaskAutomationManager
   - Add queue locking to prevent concurrent execution
   - Implement failure quarantine

3. **Add Metrics and Monitoring**
   - Track automation success rate
   - Track average execution time
   - Track quarantined tasks
   - Expose metrics via API

**Acceptance Criteria:**
- Tasks execute with artifacts captured
- Failed tasks retry with exponential backoff
- Quarantine prevents repeated failures
- Metrics tracked and exposed

**Estimated Time:** 5-6 days

---

### Phase 5: Work-Target Configuration (3 days)

**Goal:** Per-target automation configuration

**Tasks:**
1. **Define Work-Target Config Schema**
   ```typescript
   export interface WorkTargetAutomationConfig {
     enabled: boolean;
     image: string; // Docker image
     branch: string; // Default branch
     bootstrapScript: string; // Path to bootstrap.sh
     testCommands: string[]; // Commands to run
     buildCommands: string[];
     credentials: {
       githubToken?: string;
       npmToken?: string;
     };
     timeouts: {
       build: number; // ms
       test: number; // ms
     };
   }
   ```

2. **Store in Registry**
   - Add automation config to work-target registry
   - API to update automation config
   - Validation for config schema

3. **Use in TaskAutomationManager**
   - Load config per work-target
   - Use configured image, branch, commands
   - Pass credentials securely

**Acceptance Criteria:**
- Work-targets have automation config
- Config used during task execution
- Credentials passed securely

**Estimated Time:** 3 days

---

### Phase 6: Analytics & Continuous Integration (3-4 days)

**Goal:** Surface metrics and auto-close/followup based on results

**Tasks:**
1. **Build Analytics Dashboard**
   - Automation success rate by task type
   - Mean time to resolution (MTTR)
   - Top failure categories
   - Quarantined tasks list

2. **Auto-Close on Success**
   - If automation run succeeds and PR merges → close task
   - Record completion metrics

3. **Auto-Followup on Failure**
   - Generate followup task with:
     - Link to parent task
     - Attached artifacts (session log, summary)
     - Failure reason
     - Retry count

**Acceptance Criteria:**
- Dashboard shows automation metrics
- Successful runs auto-close tasks
- Failed runs create followup tasks with context

**Estimated Time:** 3-4 days

---

## Summary Timeline

| Phase | Description | Duration | Dependencies |
|-------|-------------|----------|--------------|
| 1 | Data Foundations | 1 week | None |
| 2 | Artifact Trail | 1 week | Phase 1 |
| 3 | Context Capture UI | 3-4 days | Phase 1 |
| 4 | TaskAutomationManager | 1 week | Phase 1, 2 |
| 5 | Work-Target Config | 3 days | Phase 4 |
| 6 | Analytics & Integration | 3-4 days | Phase 4, 5 |

**Total Time:** ~3-4 weeks (with one developer full-time)

**Parallelization Opportunities:**
- Phase 3 (UI) can run parallel to Phase 2 (artifacts)
- Phase 5 (config) can start once Phase 4 core is done

---

## Priority Recommendation

### P0 (Must Have for Production)
- **Phase 1:** Data Foundations - Required for persistence
- **Phase 2:** Artifact Trail - Critical for debugging failures

### P1 (High Value)
- **Phase 4:** TaskAutomationManager - Prevents runaway failures
- **Phase 6:** Analytics - Measure effectiveness

### P2 (Nice to Have)
- **Phase 3:** Context Capture UI - Improves UX but not blocking
- **Phase 5:** Work-Target Config - Can start with defaults

### Recommended Order
1. **Week 1:** Phase 1 (Data) + Phase 2 (Artifacts)
2. **Week 2:** Phase 4 (Automation Manager)
3. **Week 3:** Phase 3 (UI) + Phase 5 (Config)
4. **Week 4:** Phase 6 (Analytics) + Buffer/Testing

---

## Risk Mitigation

**Risks:**
1. **Database migration on production** - Could break existing tasks
2. **Artifact storage growth** - Disk space management needed
3. **Quarantine false positives** - Good tasks blocked
4. **Performance impact** - Extra DB writes during execution

**Mitigations:**
1. Test migrations on staging thoroughly, add rollback capability
2. Implement artifact retention policy (30 days), add cleanup job
3. Add manual quarantine override, review quarantine metrics weekly
4. Batch artifact writes, use async I/O, monitor performance

---

## Success Criteria

**Definition of Done:**
- ✅ All 6 phases implemented
- ✅ Database migrations successful
- ✅ Artifacts captured for 100% of runs
- ✅ Session logs accessible from task detail
- ✅ Analytics dashboard showing real metrics
- ✅ Auto-close working for successful runs
- ✅ Auto-followup working for failures
- ✅ <1% of tasks quarantined incorrectly
- ✅ All tests passing
- ✅ Documentation updated

**Metrics to Track:**
- Automation success rate (target: >80%)
- Mean time to resolution (target: <2 hours)
- Artifact storage size (monitor growth)
- Quarantine rate (target: <5%)
- False positive quarantine (target: <1%)

---

**Created:** 2025-11-10T19:53:00Z  
**Next Review:** After Phase 1 completion  
**Owner:** Platform Tooling Team
