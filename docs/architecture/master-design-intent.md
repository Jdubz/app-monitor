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
- **✅ DO**: Use `/opt/app-monitor/shared/data/dev-bots.db`
- **❌ NEVER**: Multiple databases, test DBs in production, duplicates
- **WHY**: Single source of truth for all task/PR/chain state

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
- **Database**: `/opt/app-monitor/shared/data/dev-bots.db` (SINGLE instance)
- **Deployment**: Blue-green via `scripts/deploy.sh`
- **Services**: Two systemd units (`app-monitor-backend@5001`, `@5002`)
- **Proxy**: Nginx upstream switched during deployment
- **Tunnel**: Cloudflare for external access

---

**Remember**: This document is your north star. When in doubt about a design decision, ask: "Does this align with autonomy, isolation, event-driven architecture, and minimalist UI?" If not, reconsider.

---

## Documentation Guidelines

### Organization Principles

**Keep It Minimal:** Target <60 total documents. Delete completed/outdated docs instead of archiving.

**Directory Structure:**
```
docs/
├── architecture/
│   ├── master-design-intent.md (<200 lines - THIS FILE)
│   ├── system-overview.md (detailed architecture)
│   └── README.md
├── technicalDesigns/  (feature implementation specs)
├── guides/  (operational how-tos)
├── plans/  (active future work only)
├── analysis/  (<5 files - active investigations only)
└── setup/  (environment configuration)
```

### Document Lifecycle

**Planning Phase:**
- Create in `/plans/` for future work
- Move to `/analysis/` if investigation needed

**Implementation Phase:**
- Move to `/technicalDesigns/` when implementing
- Update system-overview.md if architecture changes
- Delete plan/analysis docs when addressed

**Completion:**
- **DELETE** completed plans/analyses
- **NEVER** archive (archives appear in searches and mislead)
- Update guides if operational procedures change

### Anti-Patterns (CI Will Fail)

❌ **Archive directories** - Delete old docs instead  
❌ **Versioned docs** (`-v2.md`, `-new.md`) - Replace the original  
❌ **Completed markers** (`COMPLETED.md`, `archived.md`) - Just delete  
❌ **Test databases** in docs/ - Keep data out of documentation  
❌ **Large master-design-intent** (>200 lines) - Keep it concise  

### What Goes Where

| Document Type | Location | Purpose | Lifecycle |
|--------------|----------|---------|-----------|
| Design philosophy | `architecture/master-design-intent.md` | Guiding principles | Living doc |
| System architecture | `architecture/system-overview.md` | Complete architecture | Updated as system evolves |
| Feature specs | `technicalDesigns/` | Implementation details | Permanent |
| How-tos | `guides/` | Operational procedures | Updated as needed |
| Future work | `plans/` | Not yet implemented | Delete when done |
| Investigations | `analysis/` | Active research | Delete when addressed |
| Setup | `setup/` | Environment config | Updated as needed |

### CI Enforcement

The `docs-check.yml` workflow enforces:
- ✅ No `docs/archive/` directory exists
- ✅ No database files in docs
- ✅ Analysis directory has <5 files
- ✅ No COMPLETED/archived/old markers in filenames
- ✅ master-design-intent.md is <200 lines
- ✅ Required structure (architecture/, technicalDesigns/, etc.)
- ✅ Total docs <60 (target)
- ✅ All markdown links valid

**When CI Fails:** Clean up before merging. Documentation sprawl compounds quickly.

### Writing Guidelines

**master-design-intent.md (this file):**
- Design philosophy and principles
- High-level restrictions
- Quick developer onboarding
- <200 lines (enforced)

**system-overview.md:**
- Complete system architecture
- Component details
- Data flows
- Integration points

**technicalDesigns/:**
- Implementation specifications
- Design decisions
- API contracts
- Usage examples

**guides/:**
- Step-by-step procedures
- Troubleshooting
- Best practices
- Runbooks

**plans/:**
- Future features
- Proposed changes
- Research directions
- Delete when implemented

**analysis/:**
- Active investigations
- Problem diagnosis
- Options evaluation
- Delete when addressed

---

**Remember:** Good documentation hygiene prevents context window bloat and keeps the project maintainable. When in doubt, delete.
