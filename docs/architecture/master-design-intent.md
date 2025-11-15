# Master Design Intent: App Monitor Philosophy

**Purpose:** Quick onboarding for new developers - the design philosophy and high-level restrictions that guide all decision-making.

**Authority:** Only human-directed bots may edit this document. All autonomous agents must adhere to it.

**Last Updated:** 2025-11-14

---

## Core Philosophy

**Autonomy First**: After initial human planning/dispatch, the system (task queue → dev-bots → verification → PR tracking) operates autonomously. Manual input comes *only* when automation raises alerts or humans intentionally intervene.

**Trust But Verify**: Never trust reported success. Every task flows through REVIEW → FIX → COMPLETE pipeline that verifies real-world outcomes.

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
- **✅ DO**: Use SQLite (via `TaskQueueService`) for all task/chain state
- **❌ NEVER**: In-memory arrays, local state that conflicts with DB
- **WHY**: Single source of truth eliminates race conditions

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

---

## Key Design Patterns

### Blue-Green Deployment
- Zero-downtime deploys via two systemd services (ports 5001/5002)
- Nginx upstream switches traffic after health checks
- Shared data directory (`/opt/app-monitor/shared/`) persists across releases

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

### Task Chain Lifecycle
1. **Implementation Task** → creates branch, opens PR
2. **REVIEW Task** → verifies outcome (branch exists, PR exists, tracked)
3. **FIX Task** → corrects issues found in review (max 4 attempts)
4. **COMPLETE Task** → finishes original goal after verification passes
5. **Escalation** → 5th review blocks chain, alerts humans

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
- **Claude**: Code implementation, refactoring (primary bottleneck)
- **Codex**: Analysis, documentation, planning, review
- **Gemini**: Eligible tasks (frontend, logs, analysis) with quota/risk checks
- **Copilot**: GitHub delegation (within throttle limits)

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

**Remember**: This document is your north star. When in doubt about a design decision, ask: "Does this align with autonomy, isolation, event-driven architecture, and minimalist UI?" If not, reconsider.

---

## Documentation Guidelines

### Organization (<60 total docs, delete don't archive)

```
docs/
├── architecture/
│   ├── master-design-intent.md (<200 lines - philosophy)
│   └── system-overview.md (detailed architecture)
├── technicalDesigns/  (implementation specs)
├── guides/  (how-tos)
├── plans/  (future work only)
├── analysis/  (<5 files - active investigations)
└── setup/  (environment config)
```

### Lifecycle Rules

1. **Planning** → Create in `/plans/`
2. **Investigation** → Move to `/analysis/` if needed
3. **Implementation** → Move to `/technicalDesigns/`, update system-overview.md
4. **Completion** → **DELETE** plan/analysis (NEVER archive)

### CI-Enforced Rules

❌ No `archive/` directories  
❌ No versioned docs (`-v2.md`, `-new.md`)  
❌ No completed markers (`COMPLETED.md`)  
❌ No databases in docs/  
❌ master-design-intent.md >200 lines  
❌ analysis/ >5 files  
❌ Total docs >60  

### What Goes Where

| Type | Location | Keep? |
|------|----------|-------|
| Philosophy | master-design-intent.md | Living doc |
| Architecture | system-overview.md | Update as needed |
| Feature specs | technicalDesigns/ | Permanent |
| How-tos | guides/ | Update as needed |
| Future work | plans/ | Delete when done |
| Investigations | analysis/ | Delete when addressed |

**Rule:** When in doubt, delete. Documentation sprawl compounds quickly.
