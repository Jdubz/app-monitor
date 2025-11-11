# Dev-Bots File Mapping - Complete Reference

**Date**: 2025-11-11
**Purpose**: Quick reference for finding relocated dev-bots documentation

---

## File Location Mapping

### Original → New Location

| Original File | New Location | Category |
|---------------|--------------|----------|
| `dev-bots/README.md` | **DELETED** | Navigation |
| `dev-bots/AUTOMATIC_FAILURE_RECOVERY.md` | `/docs/architecture/automatic-failure-recovery.md` | Architecture |
| `dev-bots/DOCKER_OPTIMIZATION_AND_MCP.md` | `/docs/guides/docker-optimization.md` | Guide |
| `dev-bots/FAILURE_GUARDS.md` | `/docs/architecture/failure-guards.md` | Architecture |
| `dev-bots/RECOVERY_QUEUE_MANAGEMENT.md` | `/docs/architecture/recovery-queue-management.md` | Architecture |
| `dev-bots/RECOVERY_QUICK_START.md` | `/docs/guides/failure-recovery-quick-start.md` | Guide |
| `dev-bots/SQLITE_INTEGRATION_PLAN.md` | `/docs/plans/sqlite-integration.md` | Plan |
| `dev-bots/TIMEOUT_HANDLING_STRATEGY.md` | `/docs/architecture/timeout-strategy.md` | Architecture |
| `dev-bots/analysis/architecture.md` | `/docs/archive/architecture-analysis-2025-10.md` | Archive |
| `dev-bots/analysis/comprehensive-analysis.md` | `/docs/archive/prompt-system-analysis.md` | Archive |
| `dev-bots/analysis/INDEX.md` | **DELETED** | Navigation |
| `dev-bots/analysis/quick-reference.md` | **DELETED** | Navigation |
| `dev-bots/analysis/START_HERE.md` | **DELETED** | Navigation |
| `dev-bots/api/agent-personalities.md` | `/docs/guides/agent-personalities.md` | Guide |
| `dev-bots/api/endpoints.md` | `/docs/guides/api-reference.md` | Guide |
| `dev-bots/api/task-prompt-template.md` | `/docs/guides/task-execution-template.md` | Guide |
| `dev-bots/api/worker-onboarding.md` | `/docs/guides/worker-onboarding.md` | Guide |
| `dev-bots/architecture/context-isolation.md` | `/docs/architecture/context-isolation.md` | Architecture |
| `dev-bots/architecture/system-overview.md` | `/docs/architecture/dev-bots-overview.md` | Architecture |
| `dev-bots/deployment/autonomous-docker-orchestration.md` | `/docs/archive/autonomous-docker-orchestration.md` | Archive |
| `dev-bots/deployment/deployment-checklist.md` | `/docs/guides/deployment-checklist.md` | Guide |
| `dev-bots/examples/task-examples.md` | `/docs/guides/task-examples.md` | Guide |
| `dev-bots/healing/healing-system-design.md` | `/docs/architecture/healing-system-design.md` | Architecture |
| `dev-bots/implementation/implementation-guide.md` | `/docs/archive/implementation-guide.md` | Archive |
| `dev-bots/learning/learning-system-analysis.md` | `/docs/archive/learning-system-analysis.md` | Archive |
| `dev-bots/scope-control/scope-control-system.md` | `/docs/architecture/scope-control-system.md` | Architecture |

---

## Quick Lookup by Topic

### Failure Recovery
- **Architecture**: `/docs/architecture/automatic-failure-recovery.md`
- **Quick Start**: `/docs/guides/failure-recovery-quick-start.md`
- **Failure Guards**: `/docs/architecture/failure-guards.md`
- **Queue Management**: `/docs/architecture/recovery-queue-management.md`

### System Architecture
- **Overview**: `/docs/architecture/dev-bots-overview.md`
- **Context Isolation**: `/docs/architecture/context-isolation.md`
- **Scope Control**: `/docs/architecture/scope-control-system.md`
- **Healing System**: `/docs/architecture/healing-system-design.md`
- **Timeout Strategy**: `/docs/architecture/timeout-strategy.md`

### Operational Guides
- **Agent Personalities**: `/docs/guides/agent-personalities.md`
- **API Reference**: `/docs/guides/api-reference.md`
- **Task Execution Template**: `/docs/guides/task-execution-template.md`
- **Task Examples**: `/docs/guides/task-examples.md`
- **Worker Onboarding**: `/docs/guides/worker-onboarding.md`
- **Docker Optimization**: `/docs/guides/docker-optimization.md`
- **Deployment Checklist**: `/docs/guides/deployment-checklist.md`

### Implementation Plans
- **SQLite Integration**: `/docs/plans/sqlite-integration.md` (IN PROGRESS)

### Historical/Archive
- **Architecture Analysis**: `/docs/archive/architecture-analysis-2025-10.md`
- **Prompt System Analysis**: `/docs/archive/prompt-system-analysis.md`
- **Implementation Guide**: `/docs/archive/implementation-guide.md`
- **Learning System Analysis**: `/docs/archive/learning-system-analysis.md`
- **Docker Orchestration**: `/docs/archive/autonomous-docker-orchestration.md`

---

## Directory Structure

```
/docs/
├── architecture/
│   ├── README.md (NEW)
│   ├── automatic-failure-recovery.md (from dev-bots/)
│   ├── failure-guards.md (from dev-bots/)
│   ├── recovery-queue-management.md (from dev-bots/)
│   ├── timeout-strategy.md (from dev-bots/)
│   ├── dev-bots-overview.md (from dev-bots/)
│   ├── context-isolation.md (from dev-bots/)
│   ├── scope-control-system.md (from dev-bots/)
│   ├── healing-system-design.md (from dev-bots/)
│   └── retry-mechanisms.md (existing)
│
├── guides/
│   ├── README.md (UPDATED)
│   ├── docker-optimization.md (from dev-bots/)
│   ├── failure-recovery-quick-start.md (from dev-bots/)
│   ├── agent-personalities.md (from dev-bots/)
│   ├── api-reference.md (from dev-bots/)
│   ├── task-execution-template.md (from dev-bots/)
│   ├── worker-onboarding.md (from dev-bots/)
│   ├── task-examples.md (from dev-bots/)
│   ├── deployment-checklist.md (from dev-bots/)
│   └── [existing infrastructure guides...]
│
├── plans/
│   ├── sqlite-integration.md (from dev-bots/)
│   └── [existing plans...]
│
├── archive/
│   ├── architecture-analysis-2025-10.md (from dev-bots/)
│   ├── prompt-system-analysis.md (from dev-bots/)
│   ├── autonomous-docker-orchestration.md (from dev-bots/)
│   ├── implementation-guide.md (from dev-bots/)
│   ├── learning-system-analysis.md (from dev-bots/)
│   └── [existing archived docs...]
│
├── DEV_BOTS_REORGANIZATION_REPORT.md (NEW)
├── DEV_BOTS_REORGANIZATION_SUMMARY.md (NEW)
└── DEV_BOTS_FILE_MAPPING.md (THIS FILE)
```

---

## Finding Information

### "Where is the failure recovery documentation?"
- **Architecture/Design**: `/docs/architecture/automatic-failure-recovery.md`
- **How to Use**: `/docs/guides/failure-recovery-quick-start.md`

### "Where are the agent personalities documented?"
- `/docs/guides/agent-personalities.md`

### "Where is the API reference?"
- `/docs/guides/api-reference.md`

### "Where is the SQLite integration plan?"
- `/docs/plans/sqlite-integration.md`

### "Where is the system architecture overview?"
- `/docs/architecture/dev-bots-overview.md`

### "Where are the historical analysis documents?"
- `/docs/archive/` (architecture-analysis, prompt-system-analysis, etc.)

---

## Files Deleted (No Longer Needed)

These navigation/index documents were deleted because the dev-bots/ directory no longer exists:

1. `dev-bots/README.md` - Directory index
2. `dev-bots/analysis/INDEX.md` - Analysis folder index
3. `dev-bots/analysis/START_HERE.md` - Entry point navigation
4. `dev-bots/analysis/quick-reference.md` - Quick reference with outdated paths

**Replacement**: Use the README.md files in `/docs/architecture/` and `/docs/guides/` instead.

---

## Summary

- **26 files processed** (21 moved, 5 archived, 4 deleted)
- **6,289 lines** reorganized
- **11 subdirectories** consolidated
- **dev-bots/ directory** completely removed

All content has been properly categorized and is now easier to find and maintain.

---

**Last Updated**: 2025-11-11
**Status**: Complete
**Maintained**: This mapping will be updated if files are moved again
