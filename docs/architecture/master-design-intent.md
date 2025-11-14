# Master Design Intent: App Monitor Automation Platform

**Audience:** feature designers, reviewers, and operators validating that new implementations match the established philosophy across dev-monitor, dev-bots, the task queue, error detection & recovery, and the PR tracking system.
**Authority:** Only human-directed bots may edit this document. All autonomous agents must adhere to it. Supporting architecture docs may evolve as long as they remain consistent with this intent, and any change to intent must update both this file and the originating sources.
**Sources Reviewed (Nov 12, 2025):**
- Architecture docs: `dev-monitor-architecture.md`, `dev-bots-overview.md`, `automatic-failure-recovery.md`, `failure-guards.md`, `recovery-queue-management.md`, `context-isolation.md`, `scope-control-system.md`, `healing-system-design.md`, `retry-mechanisms.md`, `timeout-strategy.md`.
- Plan docs: `APP_MONITOR_CAPABILITY_ROADMAP.md`, `APP_MONITOR_STABILIZATION_PLAN.md`, `DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md`, `DEV_BOT_SAFETY_AND_PROMPT_IMPROVEMENTS.md`, `ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md`, `PR_TRACKING_CRITICAL_FIX_IMPLEMENTATION.md`, `PR_TRACKING_SYSTEM_RESILIENCE_PLAN.md`, `CONTINUOUS_PR_SELF_HEALING.md`, `sqlite-integration.md`, `IMPLEMENTATION_STATUS.md`.
- Implementations: `backend/src/services/*`, `frontend/src/*`, `dev-bots/*`.

Use this document as the standing reference when judging whether new work aligns with the intended design.

---

## Autonomy Mandate
- After the initial human planning/dispatch session, the end-to-end system (task queue, dev-bots, verification, PR tracking) must operate autonomously. Manual inputs come *only* when the automation raises an alert or a human intentionally intervenes.
- The dev-monitor UI exists purely as the safety panel for those interventions. It must surface high-level truth (system power state, queue/concurrency counts, blocked chains, alert banners) and expose controls to pause/resume, block/unblock, or escalate. It must not become a general analytics dashboard, metrics explorer, or documentation browser.
- Any feature work that increases UI scope or data exposure must prove it directly improves critical intervention speed rather than curiosity/analytics.

---

## Dev-Monitor Platform (Frontend Control Surface)

### Philosophy
- Dev-monitor is the administrative UI for an otherwise automated system. Once the initial plan is kicked off, the backend runs unattended—dev-monitor is the breaker panel for when humans must step in.
- Primary goals: surface binary/high-level status (system power, deployment state, worker/bot counts, tasks/chains active vs. blocked) plus any alerts that demand intervention. No vanity metrics, exploratory analytics, or metadata drill-downs beyond what is required to unblock/triage.
- It is the human bridge into the automated backend; all orchestration flows from HTTP routes while state changes stream through Socket.IO.

### Architecture Snapshot
- Backend services (`backend/src/services`): `ProcessManager`, `DockerManager`, `TaskQueueManager`, `LogStreamer`, `ConnectionManager`, `TaskQueueWorker`, and auxiliary services (metrics, PR orchestration, etc.).
- Frontend (`frontend/src`): React views subscribe to Socket.IO channels (`process:*`, `docker:*`, `task:*`, `pr:*`) and invoke REST endpoints for control actions.
- Data flow: routes trigger deterministic backend actions; results are broadcast in real time. The frontend never invents state—UI reflects backend truth.

### Implementation Requirements & Invariants
1. **Administrative Focus**
   - Show only the high-signal indicators needed for intervention (on/off state, deployment version, total task chains, blocked chains, hung alerts) alongside the controls to act (restart service, pause queue, block/unblock chain). Suppress metrics/analysis/metadata panels that do not change immediate action.
2. **Event-Driven Only**
   - No cron jobs or long-lived timers in dev-monitor. Everything reacts to backend events or explicit user input.
3. **Process & Docker Safety**
   - `ProcessManager` with `requirePorts=true` must fail fast on conflicts and report the conflict details to the UI. Docker interactions must flow through `DockerManager` (Dockerode + circuit breaker).
4. **Task Visibility**
   - `/api/tasks` endpoints immediately hand off to the SQLite queue; UI lists must be driven by queue state, not local arrays.
5. **Observability**
   - Preserve ≥80% test coverage. Every change to lifecycle/transport code requires matching Vitest updates.

---

## Dev-Bots Autonomous Execution Layer

### Philosophy
- Each AI agent runs exclusively inside an isolated filesystem within its container. Host worktrees/workspaces are forbidden.
- Task context is managed per task/target: preloaded onto the container at spin-up, invalidated/rebuilt as needed, and never shared simultaneously between bots. Sequential reuse for speed is allowed when captured accurately (feature in progress).
- Automation is “trust but verify.” Humans can override, but the automated review pipeline enforces scope control, verification, recovery, and continual improvement. Every task ultimately receives review attention that may spawn follow-up work.

### Core Components & Responsibilities
| Component | Intent | Notes |
|-----------|--------|-------|
| `DevBotsManager` | Dependency-injected orchestrator across process, Docker, queue, completion, review, and PR subsystems. | Must expose hooks for review/repair chain events and for human intervention commands from dev-monitor. |
| `TaskExecutionService` | Pulls work (via shared `TaskQueueService`), selects agents intelligently, provisions containers, streams logs. | Uses `AgentSelector` (Codex planning/analysis, Claude implementation, Copilot GitHub ops). Docker calls run inside a circuit breaker. |
| `EphemeralWorkerService` | Manages container lifecycle + per-task context FS, emits heartbeats, and logs artifact locations. | Heartbeats every 15s; missing >30s triggers hung-task handling. |
| `TaskCompletionService` | Enforces quality gates, token tracking, verification, PR registration, and emits structured results for review. | Always records verification output; failed pushes capture patch diffs for salvage. |
| `ScopeControlService` & Context Manager | Detects scope creep, isolates contaminated contexts, schedules cleanup tasks, and coordinates context snapshots for reuse. | Violation chains ≥3 trigger emergency recovery hooks. |
| Interactive Session Stack | Allows human-in-the-loop shells without bypassing isolation/logging guarantees. | Shares the same container orchestration + heartbeat rules. |
| Review/Recovery Pipeline | Chain-aware REVIEW → FIX → COMPLETE orchestration with depth tracking and human escalation. | Detailed below. |

### Implementation Requirements
1. **Chain Scheduling & Concurrency**
   - Max concurrent implementation chains equals the number of available bots (configurable; currently 3). Chains include the original implementation task plus every follow-up (reviews, fixes, delegated tasks, etc.).
   - New implementation tasks enter the queue FIFO but cannot start until an existing chain fully finishes (PR merged + chain closed). This prevents dozens of simultaneous PRs with unresolved follow-ups.
2. **Review Chain Rules**
   - Every failure or verification outcome spawns a REVIEW task that inspects prior attempts before proposing action.
   - Automated chain depth limit: 4 reviews/fixes. The 5th review stops automated fixes, produces a summary, flags the chain as blocked, and alerts humans via dev-monitor.
3. **Blocked Chain Handling**
   - Blocked chains drop out of the “active chain” count, allowing other work to proceed. When a human unblocks/requeues, the chain may temporarily exceed bot count, but the queue worker must not start brand-new implementation tasks until active chains return to within capacity.
   - Provide UI actions to view blocked chains, acknowledge alerts, and re-enter chains into the queue.
4. **Hung Task/Container Handling**
   - Task event logs and artifacts must detect stuck containers. Hung tasks are terminated, their contexts captured, and the failure immediately feeds into the REVIEW chain.
5. **Patch Diff Salvage**
   - When no branch/PR exists, follow-up tasks must inspect patch artifacts for reusable code. Salvaged patches can be preloaded into subsequent containers for healing.
6. **Context & Safety**
   - No host filesystem writes. Context snapshots are managed artifacts. Destructive operations are governed by the multi-step review pipeline plus telemetry.

---

## Task Queue & Dispatch Layer

### Philosophy
- SQLite (`backend/src/services/taskQueue.sqlite.ts`) is the authoritative task/workflow DB. All consumers must use the singleton `TaskQueueService` (via `getTaskQueueService()`) to avoid conflicting handles.
- Task processing is event-driven and chain-aware. Scheduling honors FIFO submission order but enforces the concurrency rules described above.
- Monitoring relies on log artifacts + the task event API. Hung tasks/containers are automatically detected, killed, and routed into the review/recovery flow.

### Architecture & Requirements
1. **Data Model**
   - Tables for tasks, task executions, acceptance criteria, files, workers/heartbeats, PR metadata, verification results, and chain tracking.
2. **Transactions & APIs**
   - `createTask`, `assignNextTask`, `completeTask`, `failTask`, `updateTask`, and hung-task handlers must run within SQLite transactions.
3. **Heartbeat & Hung Detection**
   - Workers update heartbeats every 15s. Failure to send within 30s marks the task as failed and triggers the review chain.
4. **Chain-Aware Scheduler**
   - Queue worker enforces “chains ≤ bot count” for new implementations. A chain is considered active until its PR merges (or the chain is blocked/aborted).
   - Blocked chains are excluded from the cap but must be manually resumed through dev-monitor.
5. **Manual Interventions**
   - Operators can manually timeout or block chains. Such actions must record reasons and surface in the UI.

---

## Error Detection, Verification & Recovery

### Philosophy
- Never trust reported success. Every task completion flows into a REVIEW → FIX → COMPLETE pipeline that verifies real-world outcomes (branch exists, PR exists, PR tracked, Copilot review done, etc.).
- Recovery is chain-aware and conservative: cleanup/fix tasks operate within their own isolated containers, referencing prior attempts to avoid repeated mistakes.
- Automated review depth is limited to four attempts. On the fifth, the system escalates to humans with a comprehensive summary.

### Components
- **Failure Pattern Detection:** Regex/exit-code classifiers categorize CLI/infra issues and feed the review planning step.
- **Review/Repair Pipeline:** REVIEW tasks read prior attempts, verification output, and failure context to decide between FIX, CONTINUE, or ESCALATE. FIX tasks apply conservative changes; COMPLETE tasks finish original goals once prerequisites pass.
- **Hung Task Monitor:** Detects unresponsive containers via heartbeats/logs, terminates them, and immediately spawns a REVIEW.
- **Task Verification Service:** Mandatory on every completion—checks acceptance criteria, coverage, scope, and logs structured findings for the review chain.
- **Scope/Context Control:** Ensures each attempt respects defined boundaries. Violation chains trigger emergency cleanup tasks and may block the chain for human review.
- **Human Intervention Alerts:** Fifth-review escalations, repeated destructive patterns, or policy violations raise alerts in dev-monitor. Blocked chains must present UI actions for resuming or aborting.

---

## PR Tracking & Workflow Assurance

### Philosophy
- Never trust “task succeeded.” REVIEW must confirm that a branch exists, a PR targeting `main` exists, the PR record is stored in SQLite, and the PR monitor is actively tracking it.
- Auto-merge only after Copilot review completes, all eight gate conditions pass, and delegated/copilot fix PRs merge back into the task branch.
- All tasks spawned for a PR (reviews, fixes, validations, delegated work) belong to the originating implementation chain and count toward its completion.

### System Components & Requirements
1. **PRWorkflowOrchestrator**
   - Extracts PR metadata, registers monitoring, and ties every follow-up task back to the original implementation chain.
2. **PRMonitorService**
   - Evaluates merge eligibility, adopts orphaned PRs, and spawns follow-up tasks. Must ensure Copilot review completion before attempting merges.
3. **PRConditionStateService**
   - Tracks the eight gate conditions plus active fix tasks (fingerprinted). Evaluations are locked per PR to avoid race conditions.
4. **GitHub Integrations**
   - `GitHubPRService` (with circuit breaker) + `GitHubWebhookHandler` provide event-driven updates. All webhook-driven tasks feed into the same chain-aware scheduler.
5. **Review & Artifact Tooling**
   - `ReviewCommentTracker` fingerprints comments (including Copilot) and enforces resolution. `PRArtifactRecoveryService` recovers lost PR info. Copilot review completion is a first-class state.
6. **Copilot Delegation Workflow**
   - `/delegate` commands or tagged comments may cause Copilot to open fix PRs against the task branch. These delegated tasks:
     - Do not count toward the bot concurrency limit.
     - Must merge back into the task branch before the main implementation PR can merge.
     - Are preferred over spinning up dev-bots when within throttle limits (threshold TBD).
     - Are considered part of the original task chain; AgentSelector must factor this when deciding whether to run Copilot vs. bot execution.

### Pending Workstreams
- Consolidate PR storage + backups per `PR_TRACKING_SYSTEM_RESILIENCE_PLAN.md`.
- Finish `PR_TRACKING_CRITICAL_FIX_IMPLEMENTATION.md` (branch currency, active task cleanup, fixture-driven tests, telemetry).
- Complete `PR_CREATION_AUTOMATION_RESTORE_PLAN.md` (HOME resolution, token fallback).
- Implement continuous review/fix chaining from `CONTINUOUS_PR_SELF_HEALING.md`.
- Add UI for human intervention alerts, blocked-chain dashboards, and re-entry controls.

---

## Using This Document
- Every change proposal or PR must cite the relevant sections here and explain how it preserves or intentionally alters the design intent.
- Only human-directed efforts may change this master document. Automated agents must align their behavior with it.
- Supporting architecture/plan documents may evolve, but they must reinforce the assertions made here. Any change to intent requires updating both this file and the originating sources.
- Reviewers treat deviations as blockers unless explicitly approved by architecture owners.
