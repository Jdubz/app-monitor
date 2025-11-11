# Architecture Documentation

This directory contains comprehensive architecture documentation for the app-monitor system, including dev-bots automation framework.

## Core Architecture Documents

### Dev-Monitor Frontend
- **[dev-monitor-architecture.md](dev-monitor-architecture.md)** - Dev-Monitor system architecture (React + Express + Socket.IO)

### Dev-Bots System
- **[dev-bots-overview.md](dev-bots-overview.md)** - High-level architecture overview of the dev-bots system (85% production ready)
- **[automatic-failure-recovery.md](automatic-failure-recovery.md)** - Two-stage cleanup + follow-up bot recovery system with safety guards
- **[failure-guards.md](failure-guards.md)** - Pattern-based failure detection system (active, implemented)
- **[recovery-queue-management.md](recovery-queue-management.md)** - Priority queue and concurrency management for repair bots
- **[timeout-strategy.md](timeout-strategy.md)** - Three-tier timeout philosophy (detection, manual intervention, heartbeat)
- **[context-isolation.md](context-isolation.md)** - Docker-based context isolation for task execution
- **[scope-control-system.md](scope-control-system.md)** - Scope creep detection and prevention mechanisms
- **[healing-system-design.md](healing-system-design.md)** - Self-healing system design and patterns

### Retry Mechanisms
- **[retry-mechanisms.md](retry-mechanisms.md)** - Retry strategies and backoff policies

## Key Concepts

### Failure Recovery Architecture
The system implements a sophisticated two-stage recovery process:
1. **Cleanup Bot** - Analyzes failure, applies minimal fix (max 5 files, 100 lines)
2. **Follow-up Bot** - Completes original task goal after cleanup

**Safety Guards**:
- No critical file modifications (package.json, .env, Dockerfiles, etc.)
- No destructive operations (rm -rf, DROP TABLE, etc.)
- Max 1 recovery attempt per task
- Serial execution (cleanup must complete before follow-up)

### Task Execution Model
- **Ephemeral Containers**: Fresh Docker container per task
- **Complete Isolation**: No shared state between tasks
- **Automatic Cleanup**: Containers destroyed after completion
- **Agent Specialization**: 6 specialized agent personalities

### Concurrency & Priority
- Default: 3 concurrent tasks max
- Repair bots: Priority 100 (jump queue)
- Repair bot limit: ceil(max_concurrent / 2) to prevent starvation
- Serial execution for recovery stages

## Implementation Status

| Component | Status | File Location |
|-----------|--------|---------------|
| Failure Guards | ✅ Implemented | `/backend/src/services/taskFailureGuards.ts` |
| Failure Recovery | ✅ Implemented | `/backend/src/services/failureRecovery.ts` |
| DevBots Manager | ✅ Active | `/backend/src/services/devBotsManager.ts` |
| SQLite Queue | ⏳ In Progress | See `/docs/plans/sqlite-integration.md` |
| Recovery Integration | ⏳ Pending | Integration into devBotsManager needed |

## Related Documentation

- **Guides**: See `/docs/guides/` for operational guides and API reference
- **Plans**: See `/docs/plans/` for active implementation plans
- **Archive**: See `/docs/archive/` for historical analysis and completed work

## Cross-References

- Implementation guides → `/docs/guides/`
- API endpoints → `/docs/guides/api-reference.md`
- Agent personalities → `/docs/guides/agent-personalities.md`
- Task examples → `/docs/guides/task-examples.md`
- Active plans → `/docs/plans/`

---

**Last Updated**: 2025-11-11
**Source**: Consolidated from `/docs/dev-bots/` reorganization
