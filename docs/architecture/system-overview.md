# App Monitor System Architecture

**Purpose:** Comprehensive overview of system components, data flow, and integration points.

**Related:** See `/technicalDesigns/` for implementation details of specific features.

---

## System Components

### Dev-Monitor (Frontend Control Surface)

**Role:** Administrative UI for intervention and monitoring

**Architecture:**
- React frontend (`frontend/src/`)
- SSE (Server-Sent Events) for real-time updates (`task:*`, `system:*`)
- REST API for control actions
- Event-driven only (no timers, no polling)

**Key Services:**
- `DockerManager` - Docker orchestration via Dockerode + circuit breaker
- `TaskQueueManager` - Task queue coordination
- `useSSE` hook - Real-time task event streaming
- `useAdminBotSSE` hook - Admin bot chat streaming

**Design Principle:** Show only high-signal indicators needed for intervention. Not an analytics platform.

---

### Dev-Bots (Autonomous Execution Layer)

**Role:** AI agents that execute tasks in isolated Docker containers

**See:** `dev-bots-architecture.md` for complete execution details

**Core Services:**

| Service | Responsibility |
|---------|---------------|
| `DevBotsManager` | Orchestrates process, Docker, queue, completion, review, PR subsystems |
| `TaskExecutionService` | Pulls work, selects agents, provisions containers, streams logs |
| `PhaseOrchestrator` | Executes phases, runs validators, handles advancement/loops/recovery |
| `AgentSelector` | Intelligent agent routing (Claude/Codex/Gemini/Copilot) |
| `AgentEligibilityService` | Quota/risk/context checks for Gemini routing |
| `EphemeralWorkerService` | Container lifecycle + context management, heartbeats every 15s |
| `RecoveryAgent` | Diagnoses phase validation failures, suggests fixes |
| `ScopeControlService` | Scope creep detection, context isolation, cleanup scheduling |

**Agent Types:**
- **Claude**: Primary implementation agent (code, refactoring)
- **Codex**: Analysis, documentation, planning, review
- **Gemini**: Frontend, logs, analysis (with eligibility checks)
- **Copilot**: GitHub operations (delegated tasks within throttle)

**Container Isolation:**
- Each task gets ephemeral filesystem in container
- No host writes allowed
- Context preloaded per task, invalidated/rebuilt as needed
- Artifacts saved for chain continuity

---

### Task Queue & Dispatch

**Role:** SQLite-backed authoritative task/workflow database

**See:** `task-queue-architecture.md` for complete schema details

**Database:** `/opt/app-monitor/shared/data/dev-bots.db` (SINGLE instance)

**Key Tables:**
- `tasks` - Task definitions with phase tracking
- `task_stage_runs` - Historical phase execution records
- `task_executions` - Legacy execution attempts
- `task_acceptance_criteria` - Verification criteria
- `task_files` - File associations
- `workers` - Worker registration and heartbeats
- `pr_metadata` - PR tracking data
- `pr_condition_states` - Merge gate condition tracking
- `task_chains` - Chain relationships and depth limits

**Access Pattern:**
- All consumers MUST use `TaskQueueService` singleton
- No direct SQLite access (prevents locking conflicts)
- All mutations wrapped in transactions

**Scheduling:**
- FIFO within priority levels
- Chain-aware concurrency (max 3 active chains)
- New implementations blocked until chain slots available
- Blocked chains excluded from cap, manually resumed via UI
- **Phase progression within a chain doesn't consume additional slots**

---

### Phase System & Recovery

**Role:** Guide tasks through 7-phase lifecycle with validation and automatic recovery

**See:** `phase-system-architecture.md` for complete details

**7-Phase Pipeline:**

1. **Planning** - Validate task relevance, gather requirements
2. **Implementation** - Write code, create PR
3. **Review** - Identify issues (loops to Phase 4 if found)
4. **Fixes** - Correct issues (returns to Phase 3 for re-review)
5. **Test Coverage & Validation** - Write tests, ensure passing (internal loop)
6. **Cleanup & Docs** - Update docs, prune artifacts
7. **PR Shepherding** - Monitor merge gates, auto-merge when ready

**Recovery Components:**

1. **Phase Validators**
   - Each phase has dedicated validator
   - Checks phase completion criteria
   - Determines next phase (advance, loop, or block)

2. **Recovery Agent**
   - Diagnoses validation failures
   - Suggests fixes with confidence scores
   - Decides retry vs. block

3. **Phase Loops**
   - Review↔Fixes (Phases 3-4): Up to 8 combined attempts
   - Test internal loop (Phase 5): Up to 4 attempts
   - Max 4 attempts per linear phase

4. **Hung Task Monitor**
   - Heartbeat every 15s, timeout at 30s
   - Terminates unresponsive containers
   - Triggers recovery agent for diagnosis
   - Violation chains (≥3) trigger emergency cleanup
   - May block chain for human review

**Automated Limits:**
- 4 automated review/fix attempts max
- 5th review produces summary, blocks chain, alerts UI
- Prevents infinite retry loops

---

### PR Tracking & Workflow

**Role:** Ensure every task results in tracked, gate-compliant PR

**Components:**

1. **PRWorkflowOrchestrator**
   - Extracts PR metadata from task output
   - Registers PR for monitoring
   - Ties follow-ups to original chain

2. **PRMonitorService**
   - Evaluates 8 merge gate conditions
   - Adopts orphaned PRs
   - Spawns condition-specific fix tasks

3. **PRConditionStateService**
   - Tracks gate conditions + active fix tasks
   - Fingerprint-based deduplication
   - Locked evaluations prevent race conditions

4. **8 Merge Gate Conditions:**
   1. Base branch updated
   2. No merge conflicts
   3. Review comments resolved
   4. Change requests addressed
   5. CI checks passing
   6. Copilot review complete
   7. Task verification passed
   8. Final validation clean

5. **GitHub Integration**
   - `GitHubPRService` - API calls via circuit breaker
   - `GitHubWebhookHandler` - Event-driven updates
   - `ReviewCommentTracker` - Fingerprints + resolution tracking

**Copilot Delegation:**
- `/delegate` commands open fix PRs against task branch
- Delegated tasks don't count toward bot concurrency
- Must merge to task branch before main PR can merge
- Part of original task chain

---

## Data Flow

### Task Execution Flow
```
1. Task created in SQLite queue
2. TaskExecutionService pulls task
3. AgentSelector chooses agent (Claude/Codex/Gemini/Copilot)
4. EphemeralWorkerService provisions container
5. Agent executes in isolated filesystem
6. TaskCompletionService runs verification
7. PRWorkflowOrchestrator registers PR
8. REVIEW task spawned to verify outcome
9. FIX tasks spawned if issues found (max 4)
10. COMPLETE task finishes goal after verification passes
11. PR monitored for 8 gate conditions
12. Auto-merge when all gates pass
```

### Event Flow
```
Backend Event → SSE Broadcast → Frontend Update → User Action → REST API → Backend Processing → Event
```

### Chain Flow
```
Implementation → REVIEW → [FIX → REVIEW]×N → COMPLETE → PR Merge → Chain Close
                                   ↓
                           (N=5 → ESCALATE + BLOCK)
```

---

## Production Infrastructure

### Deployment Architecture

**Directory Structure:**
```
/opt/app-monitor/
├── current -> releases/YYYYMMDD_HHMMSS  (symlink)
├── releases/
│   ├── 20251114_120000/
│   ├── 20251113_180000/
│   └── ...
├── shared/
│   ├── data/
│   │   └── dev-bots.db  ← SINGLE DATABASE
│   ├── .env
│   └── logs/
└── scripts/
    ├── deploy.sh
    ├── rollback.sh
    └── ...
```

**Blue-Green Deployment:**
1. Two systemd services: `app-monitor-backend@5001.service`, `@5002.service`
2. Nginx upstream points to active port
3. Deploy script:
   - Determines inactive port
   - Backs up database
   - Builds new release
   - Starts on inactive port
   - Health checks
   - Switches nginx upstream
   - Drains connections (30s)
   - Stops old service

**Access:**
- **Production URL:** https://app-monitor.joshwentworth.com
- **Cloudflare Tunnel** exposes local server
- **No dev servers** - Docker disabled in dev mode

---

## Integration Points

### External Services
- **GitHub API** - PR operations, webhooks (via circuit breaker)
- **Cloudflare** - Tunnel for external access
- **Claude/Codex/Gemini CLIs** - AI agent backends

### Internal Communication
- **HTTP REST** - Control actions (POST /api/tasks, etc.)
- **SSE (Server-Sent Events)** - Real-time updates (task events, system status)
- **SQLite** - Shared state (via TaskQueueService singleton)
- **Filesystem** - Artifacts (logs, patches, context bundles)

---

## Security & Safety

### Isolation
- Docker containers with ephemeral FS
- No host writes
- Context artifacts managed separately
- Each task gets fresh environment

### Circuit Breakers
- GitHub API calls
- Docker operations
- Prevents cascading failures

### Heartbeat Monitoring
- Workers heartbeat every 15s
- >30s missing = hung task
- Automatic termination + review spawn

### Chain Depth Limits
- Max 4 automated review/fix attempts
- 5th review escalates to human
- Prevents infinite loops

### Database Safety
- Single instance prevents conflicts
- All access via singleton service
- Transactional mutations
- Regular backups before deployment

---

**See Also:**
- `/technicalDesigns/` - Feature implementation specifications
- `/guides/` - Operational procedures
- `/plans/` - Future enhancements
