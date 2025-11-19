# Dev-Bots Architecture

**Purpose:** Comprehensive architecture of the autonomous AI agent execution system.

**Status:** Production (v0.2.0)

---

## Overview

Dev-bots are autonomous AI agents that execute development tasks in isolated Docker containers. They are the core automation engine of app-monitor, capable of implementing features, fixing bugs, conducting reviews, and managing pull requests without human intervention.

**Key Principle:** Isolation everywhere - each task gets ephemeral filesystem, no host writes, no shared state.

---

## System Architecture

### High-Level Flow

```
Task Created → Queue → Agent Selection → Container Provision → Execution → Completion → PR Creation → Review Chain
```

### Core Components

| Component | Responsibility | Location |
|-----------|---------------|----------|
| `DevBotsManager` | Orchestration hub - coordinates all subsystems | `devBotsManager.ts` |
| `TaskExecutionService` | Pulls tasks, provisions containers, streams logs | `taskExecution.service.ts` |
| `AgentSelector` | Routes tasks to appropriate AI agent | `agentSelector.ts` |
| `AgentEligibilityService` | Quota/risk/context checks for agent routing | `agentEligibility.service.ts` |
| `EphemeralWorkerService` | Container lifecycle + context delivery | `ephemeralWorker.service.ts` |
| `TaskCompletionService` | Quality gates, verification, PR registration | `taskCompletion.service.ts` |
| `ScopeControlService` | Scope creep detection, context isolation | `scopeControl.service.ts` |
| `CleanupCoordinator` | Resource cleanup, artifact preservation | `cleanupCoordinator.service.ts` |

---

## Agent Types & Selection

### Available Agents

**Claude (Primary Implementation Agent)**
- **Use Cases:** Code implementation, refactoring, complex features
- **Strengths:** Deep reasoning, code quality, architectural understanding
- **Limitations:** Rate limits, token costs
- **API:** Anthropic Claude API

**Codex (Analysis & Documentation)**
- **Use Cases:** Code analysis, documentation, planning, reviews
- **Strengths:** Fast, cost-effective, good at analysis
- **Limitations:** Less context than Claude
- **API:** OpenAI Codex API

**Gemini (Frontend & Analysis)**
- **Use Cases:** Frontend work, logs analysis, low-risk tasks
- **Strengths:** Free tier, good for specific workloads
- **Limitations:** Quota limits, eligibility checks required
- **API:** Google Gemini API
- **Special:** Eligibility service checks quota/risk before routing

**Copilot (GitHub Operations)**
- **Use Cases:** PR management, issue triage, GitHub-specific tasks
- **Strengths:** Native GitHub integration
- **Limitations:** Throttle limits, delegated tasks only
- **API:** GitHub Copilot

### Selection Logic

```typescript
// AgentSelector priority logic:
1. Check task.preferredAgent (manual override)
2. Task type classification (implementation/review/fix/analysis)
3. File type analysis (frontend → Gemini eligible)
4. Eligibility checks (quota, risk assessment)
5. Fallback chain: Claude → Codex → Gemini (if eligible)
```

**Agent Assignment Rules:**
- `implementation` tasks → Claude (primary) or Gemini (frontend)
- `review` tasks → Codex or Claude
- `fix` tasks → Same agent as parent task
- `analysis` tasks → Codex or Gemini
- `deploy` tasks → Copilot (delegated)

---

## Container Isolation

### Ephemeral Container Lifecycle

**Phase 1: Provision**
1. Create container from `node:18` base image
2. Mount no host volumes (isolation guarantee)
3. Generate unique container name: `dev-bot-{taskId}-{timestamp}`
4. Configure environment variables (API keys, GitHub token)

**Phase 2: Context Delivery**
1. Generate git worktree of current branch
2. Bundle context artifacts (recipes, files, schemas)
3. Use `tar | docker cp` pattern to copy workspace
4. No persistent volumes - fully ephemeral

**Phase 3: Execution**
1. Start agent with task prompt + context
2. Stream logs via Docker API
3. Heartbeat every 15 seconds
4. Timeout: 60 seconds for implementation tasks

**Phase 4: Artifact Collection**
1. Extract changed files via `docker cp`
2. Save to shared artifacts directory
3. Preserve for chain continuity (review/fix tasks need parent artifacts)

**Phase 5: Cleanup**
1. Stop container
2. Remove container
3. Clean up worktree (unless artifacts needed for chain)
4. Log completion metrics

### Isolation Guarantees

✅ **No Host Filesystem Writes** - Container cannot modify host  
✅ **Ephemeral State** - Every task starts fresh  
✅ **No Shared State** - Tasks cannot interfere with each other  
✅ **Context Controlled** - Agent only sees bundled context  
✅ **Resource Limits** - CPU/memory limits enforced by Docker  

---

## Context Management

### Context Bundle Structure

Each task receives:
```
workspace/
├── .git/              # Git repository (worktree)
├── src/               # Source code
├── .context/          # Context artifacts
│   ├── recipes/       # YAML guidance files
│   ├── schemas/       # Validation schemas
│   ├── examples/      # Code examples
│   └── manifest.json  # Bundle metadata
└── task.json          # Task definition
```

### Context Recipes (YAML Profiles)

**Available Profiles:**
- `scope-control.yaml` - Prevents scope creep
- `dev-monitor.yaml` - Development patterns specific to this project
- `pr-workflow.yaml` - Git/PR guidelines
- `failure-recovery.yaml` - Error handling patterns
- `deployment.yaml` - Production deployment rules
- `implementation-patterns.yaml` - Code implementation standards
- `review-checklist.yaml` - Code review guidelines
- `fix-debugging.yaml` - Debug workflow strategies

**Selection Logic:**
- Task type → Required recipes
- File types → Additional recipes
- Manual override → Metadata-specified profiles

### Context Caching

**Cache Key:** Git hash + selected profiles  
**Hit Rate:** ~90% (same branch, same profiles)  
**Invalidation:** On git hash change or profile update  
**Storage:** In-memory LRU cache (max 100 entries)  

---

## Execution Workflow

### Task Execution State Machine

```
PENDING → ACTIVE → COMPLETED → (chain continues)
            ↓
          FAILED → REVIEW → FIX → (retry loop)
                     ↓
                  ESCALATED (after 4 attempts)
```

### Heartbeat Monitoring

**Frequency:** Every 15 seconds  
**Timeout Detection:** Missing heartbeat >30 seconds  
**Action on Timeout:** Mark task as hung, trigger recovery  

**Heartbeat Payload:**
```json
{
  "taskId": "task-123",
  "containerId": "abc123",
  "status": "active",
  "progress": 45,
  "timestamp": "2025-11-15T19:00:00Z"
}
```

### Log Streaming

**Source:** Docker container stdout/stderr  
**Transport:** Docker API stream → Backend → Socket.IO → Frontend  
**Format:** Structured JSON logs + raw output  
**Persistence:** Logs saved to task-specific files  

---

## Quality Gates

### Task Completion Checks

**Quality Gate 1: Execution Success**
- Container exited with code 0
- No critical errors in logs
- Expected output files present

**Quality Gate 2: Verification**
- Files changed match task scope
- Tests pass (if applicable)
- Linting passes (if applicable)

**Quality Gate 3: PR Creation**
- Branch created successfully
- PR opened in GitHub
- PR metadata registered in database

**Quality Gate 4: Chain Triggering**
- REVIEW task auto-created for implementation
- Chain depth limits enforced (max 10)
- Parent-child relationships tracked

### Failure Modes & Recovery

**Container Crash:**
- Detect via Docker exit code
- Capture logs before cleanup
- Trigger automatic retry (max 3 attempts)

**Timeout:**
- Detect via heartbeat monitoring
- Force container stop
- Save partial artifacts
- Create diagnostic task for investigation

**Scope Creep:**
- Detect via file change analysis
- Abort execution
- Log scope violation
- Escalate to human review

---

## Chain Orchestration

### Task Chain Types

**Implementation → Review → Fix → Complete**
```
IMPLEMENTATION (parent)
  └─> REVIEW (verifies outcome)
       └─> FIX (if issues found)
            └─> REVIEW (re-verify)
                 └─> COMPLETE (finish chain)
```

**Chain Properties:**
- **Depth Limit:** Max 10 tasks per chain
- **Concurrency:** Only 1 REVIEW can block new IMPLEMENTATION
- **Artifacts:** Shared across chain members
- **Agent:** FIX tasks inherit parent agent

### Chain Blocking

**Rule:** New IMPLEMENTATION tasks are blocked if any chain has pending REVIEW.

**Rationale:** Prevents PR explosion - finish what you started before new work.

**Implementation:**
```typescript
// ChainTracker checks before allowing new IMPLEMENTATION
canStartNewChain(): boolean {
  const blockedChains = db.getChainsByStatus('blocked');
  return blockedChains.length === 0;
}
```

### Chain Completion

**Success Conditions:**
1. REVIEW task passes all checks
2. PR merged or manually approved
3. All chain tasks marked complete

**Cleanup:**
- Archive chain metadata
- Remove shared artifacts
- Release concurrency slot
- Emit completion event

---

## Interactive Terminal

### Developer Terminal Access

**Use Case:** Developer needs direct shell access for debugging or manual operations.

**Architecture:**
- Persistent tmux sessions (survive disconnects)
- Bidirectional terminal I/O via Socket.IO
- Session timeout: 1 hour idle
- No database persistence - sessions managed by tmux

**Workflow:**
1. User creates new session or attaches to existing
2. tmux session spawned via node-pty
3. Terminal streamed to frontend via xterm.js
4. User executes commands
5. Session persists until explicitly killed or idle timeout

**Security:**
- Socket.IO authentication required
- Session ID sanitization (command injection prevention)
- Session whitelist validation
- Sessions isolated per user

---

## Metrics & Observability

### Key Metrics

**Execution Metrics:**
- Task success rate (target: >90%)
- Average execution time by task type
- Container provision time (target: <5s)
- Context bundle generation time (target: <2s)

**Resource Metrics:**
- Active containers (max: 3 concurrent)
- Memory usage per container
- Disk usage for artifacts
- Docker API latency

**Quality Metrics:**
- Scope creep violations
- Review failure rate
- Retry attempt count
- Chain depth distribution

### Logging

**Structured Logging:**
```json
{
  "category": "dev-bots",
  "action": "task_started",
  "taskId": "task-123",
  "agent": "claude",
  "containerId": "abc123",
  "timestamp": "2025-11-15T19:00:00Z"
}
```

**Log Categories:**
- `dev-bots` - Bot lifecycle events
- `docker` - Container operations
- `context` - Context bundle generation
- `quality` - Quality gate results

---

## Configuration

### Environment Variables

**Required:**
- `CLAUDE_API_KEY` - Anthropic API key
- `OPENAI_API_KEY` - OpenAI API key (Codex)
- `GEMINI_API_KEY` - Google Gemini API key
- `GITHUB_TOKEN` - GitHub personal access token

**Optional:**
- `DEV_BOTS_CONCURRENCY` - Max concurrent bots (default: 3)
- `DEV_BOTS_TIMEOUT` - Task timeout seconds (default: 60)
- `CONTEXT_CACHE_SIZE` - Max context bundles cached (default: 100)

### Docker Requirements

**Version:** Docker Engine 20.10+  
**Access:** Docker socket mounted at `/var/run/docker.sock`  
**Permissions:** User must be in `docker` group  

---

## Error Handling

### Automatic Recovery Strategies

**Transient Failures (Retry):**
- Network timeouts
- API rate limits
- Container provision failures

**Permanent Failures (Escalate):**
- Scope violations
- 4th review failure
- Invalid task specification

**Diagnostic Tasks:**
- Created for hung tasks
- Analyze logs for root cause
- Suggest fixes or escalate

---

## Security Considerations

### API Key Management

**Storage:** Environment variables only (never in code)  
**Rotation:** Keys rotated manually, no automated rotation  
**Scope:** GitHub token has minimal required permissions  

### Container Security

**No Privileged Containers:** All run as non-root user  
**Network Isolation:** Containers can access internet but not host network  
**Resource Limits:** CPU/memory cgroups enforced  

### Artifact Safety

**Validation:** All artifacts scanned for secrets before save  
**Cleanup:** Artifacts auto-deleted after 7 days  
**Encryption:** Not implemented (artifacts are code, not secrets)  

---

## Future Enhancements

**Planned (Not Yet Implemented):**
- Multi-stage task execution (build → test → deploy)
- Parallel task execution within chains
- Agent performance tracking (success rates per agent)
- Cost optimization (cheaper agents for simple tasks)
- Self-healing: bots can fix their own infrastructure

**Not Planned:**
- Kubernetes orchestration (Docker sufficient for current scale)
- Distributed execution (single-server design)
- Agent fine-tuning (use pre-trained models only)

---

## Related Documentation

- **System Overview:** `docs/architecture/system-overview.md`
- **Context Management:** `docs/architecture/context-management/system-architecture.md`
- **Error Recovery:** `docs/technicalDesigns/error-detection-and-recovery-design.md`
- **Task Queue:** `docs/architecture/task-queue-architecture.md`
- **PR Tracking:** `docs/architecture/pr-tracking-architecture.md`
