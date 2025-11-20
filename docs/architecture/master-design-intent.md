# Master Design Intent: App Monitor Philosophy

**Purpose:** Quick onboarding for new developers - the design philosophy and high-level restrictions that guide all decision-making.


**Last Updated:** 2025-11-20

---
## Core Philosophy

**Autonomy First**: After initial human planning/dispatch, the system (task queue → dev-bots → verification → PR tracking) operates autonomously. Manual input comes *only* when automation raises alerts or humans intentionally intervene.


**Isolation Everywhere**: AI agents run in isolated Docker containers with ephemeral filesystems. No host writes, no shared state between bots.

**Chain-Aware Processing**: Tasks belong to chains (implementation → review → fix → complete). Concurrency limits apply to chains, not individual tasks.
---

## High-Level Restrictions

### Event-Driven Architecture
- **✅ DO**: React to backend events, explicit user input, webhooks
- **❌ NEVER**: Cron jobs, polling loops, long-lived timers in frontend
- **WHY**: Event-driven = deterministic, debuggable, low-latency

### Minimalist UI
- **✅ DO**: Show binary status (on/off, active/blocked), high-signal alerts, critical controls
- **❌ NEVER**: Analytics dashboards, exploratory metrics, documentation browsers, vanity metrics
- **WHY**: Dev-monitor is an intervention panel, not a BI tool. If it doesn't help unblock/triage, it doesn't belong.

### Filesystem Isolation
- **✅ DO**: Work in ephemeral container filesystems, managed context artifacts
- **❌ NEVER**: Direct host filesystem writes, shared worktrees between bots
- **WHY**: Prevents contamination, enables safe parallel execution

### Database as Source of Truth
- **✅ DO**: Persist ALL state to SQLite database (via services)
- **❌ NEVER**: In-memory caches, arrays, maps for state that must survive deployments
- **WHY**: Blue-green deployments constantly roll over servers - in-memory data is lost
- **EXCEPTION**: Single-request transient data (function-scoped variables only)

### Hard Cut Deployments
- **✅ DO**: Remove deprecated code the moment its replacement ships, fix forward only
- **❌ NEVER**: Feature flags, dry-run switches, delayed rollovers, or staggered migrations
- **WHY**: App Monitor is an internal tool with no external users; clarity and maintainability outrank backwards compatibility

### Caching Disabled
- **✅ DO**: Serve responses directly from the database/service layer each request
- **❌ NEVER**: Introduce HTTP caches, memoization layers, or stale-read optimizations
- **WHY**: Server-side caching is disabled to keep behavior deterministic across blue/green nodes

### Log Access
- **✅ DO**: Write every production log file to `/opt/app-monitor/shared/logs/` and read artifacts directly from disk
- **❌ NEVER**: Add HTTP log streaming endpoints or write logs inside release directories (they disappear on deploy)
- **WHY**: Blue/green releases swap entire application directories; the shared logs mount is the only durable surface

### Chain Concurrency Control
- **✅ DO**: Limit concurrent *chains* (default: 3), block new implementations until chains complete
- **❌ NEVER**: Unlimited concurrent tasks, orphaned follow-ups
- **WHY**: Prevents PR explosion, ensures chains complete before new work starts

### Automated Review Depth Limits
- **✅ DO**: Allow 4 automated review/fix attempts, then escalate to humans with summary
- **❌ NEVER**: Infinite retry loops, silent failures
- **WHY**: Prevents resource waste, ensures human oversight of persistent issues

### Production-Only Testing
- **✅ DO**: Test at https://app-monitor.joshwentworth.com
- **❌ NEVER**: Use development servers (Docker deactivated)
- **WHY**: Dev-bots require Docker orchestration unavailable in dev mode

### Single Database Instance
- **✅ DO**: Use the single shared database (see Production Infrastructure section)
- **❌ NEVER**: Multiple databases, test DBs in production, duplicates
- **WHY**: Single source of truth for all task/PR/chain state

### Deployment Restrictions
- **✅ DO**: All deployments through CI/CD pipeline (GitHub Actions → pull-agent)
- **❌ NEVER**: Manual deployments, worker-initiated deploys, direct production edits
- **WHY**: Ensures blue-green process, health checks, automatic rollback, audit trail

### Deployment-Safe Architecture
- **✅ DO**: Design all features to survive server restarts and blue-green rollover
- **❌ NEVER**: Rely on in-memory state, process uptime, or server continuity
- **WHY**: Production deploys multiple times daily - architecture must assume ephemeral servers
- **RULE**: If data matters beyond a single function call, persist it to the database

---

## Key Design Patterns

### Blue-Green Deployment
- Zero-downtime deploys via two systemd services (ports 5001/5002)
- Nginx upstream switches traffic after health checks
- Shared data directory (`/opt/app-monitor/shared/`) persists across releases
- **Frequent rollover**: Deploys happen multiple times daily
- **Ephemeral servers**: Each release is a new Node.js process with clean memory
- **State persistence required**: All critical state MUST be in database, not RAM

### Heartbeat-Based Monitoring
- Workers heartbeat every 15s
- Missing >30s triggers hung-task handling
- No polling - event-driven detection

### Circuit Breakers
- GitHub API calls wrapped in circuit breaker
- Docker operations use Dockerode + circuit breaker
- Prevents cascading failures

### Fingerprint-Based Deduplication
- PR conditions generate fingerprints from blocking issues
- Prevents spawning duplicate fix tasks for same problem
- Conditions only spawn tasks when fingerprint changes

---

## Critical Workflows

### Task Processing: 7-Phase Lifecycle (v0.3.0)

**Single Task, Multiple Phases** - No child tasks, all phases within one task entity.

1. **Phase 1: Planning** → Validate task relevance, determine if obsolete or needs realignment
2. **Phase 2: Implementation** → Write code, create branch, open PR
3. **Phase 3: Review** → Identify code issues with fingerprints (loops to Phase 4 if issues)
4. **Phase 4: Fixes** → Address all issues from review (returns to Phase 3 for re-review)
5. **Phase 5: Test Coverage & Validation** → Write tests, ensure ≥80% coverage, all passing (internal loop)
6. **Phase 6: Cleanup & Docs** → Update documentation, prune phase artifacts
7. **Phase 7: PR Shepherding** → Monitor 8 merge gates, auto-merge when ready

**Phase Loops:**
- **3↔4 Loop**: Review finds issues → Fixes applied → Re-review (max 4 cycles)
- **Phase 5 Internal**: Tests fail → Agent fixes → Re-run tests (max 4 attempts)

**Attempt Limits**: 4 attempts per loop before escalation to human

**Recovery Agent**: On validation failure, recovery agent diagnoses in same container:
- `retry` - Simple retry (transient error)
- `context_update` - Update task prompt and retry
- `chain_blocked` - Block this task, alert human
- `system_blocked` - Pause ALL tasks, alert human

### PR Merge Gates (8 Conditions)
1. Base branch updated
2. No merge conflicts
3. Review comments resolved
4. Change requests addressed  
5. CI checks passing
6. Copilot review complete
7. Task verification passed
8. Final validation clean

### Agent Selection
- **AgentSelector Service** is authoritative - NO hardcoded preferences
- Selection criteria: task type, context, agent availability, quota limits
- Available agents: Claude, Codex, Gemini, Copilot
- Recovery agent selected dynamically based on failure context

---

## What Goes Where

- **This document**: Design philosophy, high-level restrictions, decision-making principles
- **`/architecture/`**: System architecture overviews, component relationships
- **`/technicalDesigns/`**: Detailed implementation specifications for features
- **`/guides/`**: Operational how-tos, runbooks, setup procedures
- **`/plans/`**: Future work not yet implemented

---

## Production Infrastructure

- **URL**: https://app-monitor.joshwentworth.com
- **Database**: `/opt/app-monitor/shared/backend/data/app-monitor.db` (SINGLE instance, shared across releases)
- **Deployment**: Automated CI/CD only (GitHub Actions → pull-agent → blue-green)
- **Services**: Two systemd units (`app-monitor-backend@5001`, `@5002`)
- **Proxy**: Nginx upstream switched during deployment
- **Tunnel**: Cloudflare for external access
- **Dev Database**: `backend/data/app-monitor.db` (development environment only)

**DATABASE_PATH Environment Variable:**
- Development: `./data/app-monitor.db` (relative to backend directory)
- Production: `/opt/app-monitor/shared/backend/data/app-monitor.db` (set in `/opt/app-monitor/shared/.env`)

---

**Remember**: This document is your north star. When in doubt about a design decision, ask:
1. "Does this align with autonomy, isolation, event-driven architecture, and minimalist UI?"
2. "Will this survive a blue-green deployment rollover?"
3. "Is all critical state persisted to the database?"

If any answer is NO → reconsider the design.

---

## Documentation Guidelines

See `docs/guides/DOCUMENTATION_SYSTEM.md` for the authoritative rules (delete-first mentality, hard limits, lifecycle policies).
