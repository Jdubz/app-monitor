# Master Design Intent: App Monitor Automation Platform

**Audience:** feature designers, reviewers, and operators validating that new implementations match the established philosophy across dev-monitor, dev-bots, the task queue, error detection & recovery, and the PR tracking system.
**Sources Reviewed (Nov 12, 2025):**
- Architecture docs: `dev-monitor-architecture.md`, `dev-bots-overview.md`, `automatic-failure-recovery.md`, `failure-guards.md`, `recovery-queue-management.md`, `context-isolation.md`, `scope-control-system.md`, `healing-system-design.md`, `retry-mechanisms.md`, `timeout-strategy.md`.
- Plan docs: `APP_MONITOR_CAPABILITY_ROADMAP.md`, `APP_MONITOR_STABILIZATION_PLAN.md`, `DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md`, `DEV_BOT_SAFETY_AND_PROMPT_IMPROVEMENTS.md`, `ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md`, `PR_TRACKING_CRITICAL_FIX_IMPLEMENTATION.md`, `PR_TRACKING_SYSTEM_RESILIENCE_PLAN.md`, `CONTINUOUS_PR_SELF_HEALING.md`, `sqlite-integration.md`, `IMPLEMENTATION_STATUS.md`.
- Implementations: `backend/src/services/*`, `frontend/src/*`, `dev-bots/*`.

Use this document as the standing reference when judging whether new work aligns with the intended design. Update both this file and the originating source when intent changes.

---

## Dev-Monitor Platform

### Philosophy
- Provide a single-pane operational cockpit for local services, Docker control, and task orchestration with deterministic behavior (React 18 + Express/Socket.IO on Node 18+ per `dev-monitor-architecture.md`).
- Favor transparency over automation: every backend action emits Socket.IO events and the frontend renders raw state instead of inferred guesses.
- Treat dev-monitor as the control plane for the rest of the system—task creation, worker health, and PR visibility all originate here.

### Architecture Snapshot
- **Backend services** (`backend/src/services`): `ProcessManager` (strict port ownership, detached child lifecycles), `DockerManager`, `TaskQueueManager`, `LogStreamer`, `ConnectionManager`, and `TaskQueueWorker` (stand-alone poller to keep HTTP handlers non-blocking).
- **Frontend** (`frontend/src`): modular React components subscribe directly to Socket.IO channels such as `process:*`, `docker:*`, and `task:*`. Hooks + server truth remove the need for a global store.
- **Data Flow Guarantees:** HTTP routes perform orchestration; authoritative state lives in services and is pushed to the UI in real time. Task operations (`/api/tasks` family) immediately hand off to the SQLite queue so no in-memory lists linger.

### Implementation Requirements & Invariants
1. **Service Lifecycle Safety** (`backend/src/services/processManager.ts`)
   - Configurations with `requirePorts=true` MUST fail fast if any required port is occupied. Do not auto-kill conflicting processes; instead bubble the descriptive error (including `getPortInfo()` output) to the UI.
   - Logs persist under `logs/plain/<service>.log`. In-memory truncation (1,000 lines) is the only pruning permitted.
2. **Docker Access Discipline** (`backend/src/services/dockerManager.ts`)
   - All container operations go through Dockerode with circuit-breaker protection. Shelling out to `docker` from routes is prohibited.
3. **Task Controls**
   - Backend routes start/stop/restart processes or containers; scheduling belongs exclusively to `TaskQueueWorker`. UI controls must map 1:1 to backend functions to keep audits trustworthy.
4. **Observability Budget**
   - Maintain the documented 257 unit + 122 integration tests (≥80% coverage). Features that alter backend flows must extend the Vitest suites alongside code.

### Operations & Telemetry
- `ConnectionManager` logs every WebSocket join/leave; the frontend must rely on reconnect handlers rather than force-refreshing state.
- Process state transitions (`stopped → starting → running → stopping → error`) are enforced by `ProcessLifecycle`. Any new states require updating that finite state machine and the frontend renderers together.
- The service binds to `127.0.0.1` only. Remote exposure requires shipping Basic Auth/API key support first.

### Known Workstreams
- `APP_MONITOR_STABILIZATION_PLAN.md` still demands a quality-metrics dashboard + prompt template library. New backend metrics/hooks should keep that deliverable in mind.

---

## Dev-Bots Autonomous Execution Layer

### Philosophy
- Specialized AI agents run inside isolated, ephemeral Docker containers—never reuse a CLI context or filesystem between tasks (`context-isolation.md`).
- Human-centric safeguards come before autonomy: scope control, verification, and recovery validate every outcome (`scope-control-system.md`, `automatic-failure-recovery.md`).
- Automation must degrade gracefully. Failures trigger explicit review tasks instead of silently skipping requirements (`healing-system-design.md`).

### Core Components & Responsibilities
| Component | Intent | Implementation Notes |
|-----------|--------|----------------------|
| `DevBotsManager` (`backend/src/services/devBotsManager.ts`) | Master orchestrator across process, Docker, queue, and completion services. | Injects dependencies for testability, initializes `SimpleFailureRecovery`, hooks PR workflows, and emits lifecycle events. New capabilities must follow the same DI pattern so mocks remain viable. |
| `TaskExecutionService` | Pulls work from the SQLite queue, selects agents, runs Docker containers, and streams logs. | Uses `AgentSelector` + `TaskClassifier`; Docker commands run through a circuit breaker. Every execution records agent attempts for later fallbacks. |
| `EphemeralWorkerService` | Manages per-task worktrees and container runtime while reporting heartbeats. | Must update queue heartbeats every 15s; missing heartbeats >30s auto-fail the owning task (`taskQueue.sqlite.ts`). |
| `TaskCompletionService` | Applies quality gates, comprehensive verification, token tracking, and PR registration. | Verification (acceptance criteria, coverage, scope diff) is mandatory; failures flip the task to `failed` and flag it for recovery. |
| `ScopeControlService` | Detects scope creep, isolates contaminated contexts, and schedules periodic cleanup. | Violation chains ≥3 tasks trigger emergency recovery hooks; downstream features should respect scope metadata when provided. |
| Interactive session stack (`InteractiveSessionService`, `Gateway`, `Orchestrator`) | Human-in-the-loop terminals surfaced via dev-monitor. | Shares the same isolation and logging guarantees as automated runs; interactive commands cannot bypass audit logging. |

### Implementation Requirements
1. **Concurrency & Priority**
   - Max concurrent tasks default to 3. Cleanup/follow-up bots count toward this cap and jump the queue with priority 100 while respecting the repair-slot ceiling (ceil(max_concurrent/2)) per `recovery-queue-management.md`.
2. **Metadata Discipline**
   - Task metadata (agent type, PR info, scope, verification results) lives solely in SQLite. All mutations must use `TaskQueueService` APIs—no reintroduced arrays or maps.
3. **Artifact Handling**
   - Because work occurs inside containers, patch files are unavailable post-failure. Bots must log precise diffs and commands so operators can reconstruct context (`taskCompletion.service.ts`).
4. **Safety Rails**
   - Forbidden operations (`rm -rf`, `DROP TABLE`, credential edits, etc.) live in `SimpleFailureRecovery` and `FAILURE_GUARDS`. New features executing shell commands must reuse or extend those guard lists.
5. **Agent Selection**
   - Never hard-code agent IDs. Supply `task_category`, `file_patterns`, `estimated_complexity`, or `preferred_agent` hints so `AgentSelector` can make auditable decisions (`agentSelector.ts`).

### Backlog Signals
- `DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md` and `DEV_BOT_SAFETY_AND_PROMPT_IMPROVEMENTS.md` outline pending context-capture and prompt-hardening tasks. New work must reference the checklist items it satisfies.
- `ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md` mandates REVIEW → FIX → COMPLETE chains for every task. Until implemented, contributors must justify deviations when tasks skip those stages.

---

## Task Queue & Dispatch Layer

### Philosophy
- SQLite (`backend/src/services/taskQueue.sqlite.ts`) is the single source of truth for tasks, workers, and execution history. ACID guarantees take precedence over convenience.
- The queue never kills long tasks automatically. Humans decide when “too long” truly is too long, guided by instrumentation (`timeout-strategy.md`).

### Architecture & Data Model Highlights
- Tables cover `tasks`, `task_executions`, `task_files`, `task_acceptance_criteria`, `workers`, `worker_heartbeats`, plus PR/verification columns already present.
- All public APIs (`createTask`, `assignNextTask`, `completeTask`, `failTask`, `updateTask`) run inside transactions to keep state consistent.
- `detectLongRunningTasks()` (default 30 minutes) and `detectStalledWorkers()` run on timers: the former logs warnings only, the latter auto-fails tasks when heartbeats stop for >30 seconds.
- Manual timeout flow (`manuallyTimeoutTask`) updates both task rows and the most recent execution record; use it only after human verification.

### Implementation Requirements & Checks
1. **Singleton Access**
   - Always obtain the queue via `getTaskQueueService()` (`taskQueue.factory.ts`). Direct instantiation risks duplicate file handles and stale locks.
2. **Manual Timeouts Only**
   - No feature may auto-call `manuallyTimeoutTask`. Subscribe to warning logs or metrics instead and involve a human.
3. **Heartbeat Discipline**
   - Every worker type (bots, interactive sessions, review agents) must update heartbeats at the cadence described in `sqlite-integration.md`. Missing beats are treated as infrastructure failures and will fail tasks automatically.
4. **Priority Semantics**
   - Numeric priorities control FIFO ordering. System-critical work (repair bots, PR follow-ups) uses `priority >= 100` but is still bounded by the repair-slot ceiling to avoid starvation.
5. **Routes Backed by Queue**
   - `/dev-bots/tasks/completed` and other API responses must read from SQLite. Do not resurrect array snapshots (identified TODO in `sqlite-integration.md`).

### Integration Obligations
- Consumers (dashboards, audits, PR evaluators) must use queue APIs so execution history, PR metadata, and verification results stay correlated.
- Schema changes require updating both the SQLite DDL and the TypeScript interfaces—no ad-hoc JSON fields outside `metadata`.

---

## Error Detection, Verification & Recovery

### Philosophy
- Assume tasks misreport success. Verification, failure guards, and recovery loops validate reality before merges or deployments (`ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md`).
- Recovery stays conservative: fix the environment first (cleanup), then target the original goal (follow-up). Only one attempt per stage, no infinite recursion.

### Components & Responsibilities
| Layer | Purpose | Implementation Expectations |
|-------|---------|-----------------------------|
| Failure Guards (`backend/src/services/taskFailureGuards.ts`, `failure-guards.md`) | Regex/exit-code detection for CLI mismatches, missing tools, permissions, OOM, auth, disk, Docker issues. | Guards either force immediate failure or allow retries. Extend with tests and suggested fixes. |
| Timeout Strategy (`timeout-strategy.md`, queue helpers) | Three-tier approach: warn-only detection, manual operator timeouts, heartbeat-based infra protection. | Do not add automatic kill paths outside heartbeat logic until duration baselines justify them. |
| SimpleFailureRecovery (`backend/src/services/failureRecovery.ts`, `automatic-failure-recovery.md`) | Two-stage cleanup → follow-up tasks with priority boosts and critical-file protections. | Cleanup limited to ≤5 files/≤100 lines and cannot touch protected paths (package manifests, env files, Dockerfiles, migrations). Repair bots never spawn recovery of their own. |
| Task Verification Service (`backend/src/services/taskVerification.service.ts`) | Acceptance criteria parsing, coverage enforcement, scope diffing, recommendations. | Runs on every completion via `TaskCompletionService`; results persist in `tasks.verification_results` for downstream REVIEW tasks. |
| Healing/Learning Systems (`healing-system-design.md`) | Pattern analysis, refined task generation, question detection for failed outputs. | Currently design-stage; implementations must log failures in machine-readable formats so future healers can replay context. |
| Scope Control (`backend/src/services/scopeControl.service.ts`, `scope-control-system.md`) | Detects scope creep, isolates contaminated contexts, and schedules cleanup tasks. | Violation chains ≥3 trigger emergency recovery hooks. |

### Implementation Requirements
1. **Universal Verification**
   - `TaskCompletionService` already invokes `TaskVerificationService`. Do not short-circuit verification—even “simple” tasks must produce acceptance-criteria evidence.
2. **Safety Guards**
   - Extending execution or scripting capabilities requires registering new destructive patterns in `FORBIDDEN_OPERATIONS` and keeping `CRITICAL_FILES` lists up to date.
3. **Recovery Metadata**
   - Repair bots must set `metadata.isRepairBot`, `repairStage`, and `originalTaskId` so concurrency accounting and duplicate-prevention logic continue to work.
4. **Scope Hook**
   - New automation that emits code diffs must feed outputs through `ScopeCreepDetector`; violations should tighten scope or schedule cleanup tasks per the plan.
5. **Structured Logging**
   - Detection/recovery flows must log structured events (`category`, `action`, `message`, `details`) so dashboards can alert on spikes in guard activity.

### Roadmap Expectations
- `ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md` requires automated REVIEW → FIX → COMPLETE chains for every task, depth-limited to five hops. Until this orchestration ships, teams must manually create REVIEW tasks for critical work and store findings in `verification_results`.

---

## PR Tracking & Workflow Assurance

### Philosophy
- Never trust “PR created” statements from bots—verify via GitHub, monitor continuously, and auto-merge only when all eight conditions pass (`CONTINUOUS_PR_SELF_HEALING.md`).
- The system is event-driven: every GitHub webhook (PR, push, check_suite, check_run, review) re-evaluates the PR state, fingerprints outstanding issues, and spawns fix tasks as needed.

### System Components
1. **PRWorkflowOrchestrator** (`backend/src/services/prWorkflowOrchestrator.service.ts`)
   - Extracts PR metadata from task output, updates the originating task, registers PRs for monitoring, and initializes `PRMonitorService` + `PRArtifactRecoveryService` on startup. Configurable auto-merge (default true), 10-minute check timeout, 60-second poll.
2. **PRMonitorService** (`backend/src/services/prMonitor.service.ts`)
   - Encodes business logic for auto-merge eligibility, orphaned PR adoption, Copilot feedback ingestion, and follow-up task creation. Uses `ReviewCommentTracker` fingerprints to avoid duplicate fix tasks.
3. **PRConditionStateService** (`backend/src/services/prConditionState.service.ts`)
   - Tracks the eight gate conditions (CI checks, comment resolution, merge conflicts, branch freshness, review status, task verification, Copilot review, final validation). Uses per-PR evaluation locks and records `active_fix_tasks` keyed by fingerprints to detect partial fixes.
4. **GitHub Integration Layer**
   - `GitHubPRService` wraps `gh pr view` with circuit breaker + timeout safeguards. `GitHubWebhookHandler` routes events, maintains telemetry (auto-merge attempts, follow-ups, orphan adoption), and triggers condition evaluation.
5. **Review & Artifact Tooling**
   - `ReviewCommentTracker` stores and classifies comments/resolution state. `PRArtifactRecoveryService` scans worker artifacts/logs to recover PR metadata after crashes and re-register PRs.

### Implementation Requirements
1. **Branch Currency Enforcement**
   - `evaluateAndHandleBranchUpdate()` must enqueue branch-update tasks whenever `behind_by > 0` (Critical Bug #2 in `PR_TRACKING_CRITICAL_FIX_IMPLEMENTATION.md`). Regression tests must replay PRs 96–99 payloads.
2. **Active Fix Task Hygiene**
   - `active_fix_tasks` requires `updated_at`/status columns and a cleanup job that purges stale entries (>30 minutes) plus completion hooks that delete rows on success/failure.
3. **Telemetry & Alerting**
   - Emit metrics such as `pr_tracker.branch_updates`, `pr_tracker.fix_tasks_running`, and webhook heartbeats per `PR_TRACKING_SYSTEM_RESILIENCE_PLAN.md`. New automation must attach structured metrics for dashboards/alerts.
4. **Data Durability**
   - Converge on a single authoritative database for PR tracking with <5 minute RPO as mandated by the resilience plan. New state must target the consolidated schema and respect backup/restore scripts.
5. **Orphan Handling**
   - Adoption logic depends on branch/task ID patterns. Changes to naming conventions must update detection regexes in `PRMonitorService.detectSystemCreatedPR()`.
6. **Self-Healing Tasks**
   - Follow-up tasks created for unmet conditions should set `followup_for_pr`, encode acceptance criteria (CI, conflicts, review items), and run at high priority. Chain depth defaults (max depth 3, total 5) must be honored to avoid runaway automation.

### Pending Workstreams
- `PR_TRACKING_SYSTEM_RESILIENCE_PLAN.md`: choose consolidated storage, add `backup-pr-tracker.sh`/`restore-pr-tracker.sh`, enforce deploy safety gates, and ship heartbeat dashboards.
- `PR_TRACKING_CRITICAL_FIX_IMPLEMENTATION.md`: finish Bugs #2/#3 (branch update enqueue + active task cleanup) and add fixture-driven regression tests + telemetry.
- `PR_CREATION_AUTOMATION_RESTORE_PLAN.md`: correct `$HOME` resolution and token fallback inside worker containers before re-enabling unattended PR creation.
- `CONTINUOUS_PR_SELF_HEALING.md`: implement event-driven REVIEW → FIX spawning with fingerprinted issues and partial-fix handling.

---

## Using This Document
- Every proposal or pull request must cite the sections it touches and explain how the change preserves or intentionally alters the listed intent.
- When intent changes, update this file **and** the originating architecture/plan document so reviewers always have a single source of truth.
- Reviewers should treat deviations from these requirements as blockers unless explicitly signed off by the architecture owners.
