# Simplicity Principle: Feature Decisions

**Purpose:** Document architectural decision to reject over-engineered features in favor of native tool access and simple APIs.

---

## Core Principle

**Keep the app simple.** Only build features that are critical for core functionality. If agents/bots have native access to tools (git, gh CLI, system commands), don't wrap them in complex APIs.

## Decision Record

### Rejected Features (2025-11-18)

Three proposed feature sets were rejected as over-engineered:

#### 1. Workspace Sync API
**Proposed:** Git repository synchronization API with conflict resolution strategies, status monitoring, and sync orchestration.

**Rejected because:** Dev-bots have native `git` and `gh` CLI access in Docker containers. Direct git commands are more flexible and powerful than any API wrapper we could build.

**Alternative:** Use native git commands directly.

#### 2. Observability/Monitoring Routes
**Proposed:** Debug endpoints (`/api/debug/memory`, `/api/health/*`, `/api/metrics/*`, `/api/logs/*`) for system monitoring.

**Rejected because:** Agents can read log files and run system commands (`free -h`, `tail logs/app.log`, `top`) directly. No need for API wrappers around system utilities.

**Alternative:** Use native system commands and log file access.

#### 3. Complex Chain Management
**Proposed:** Pattern-based chain blocking system with wildcards, CRUD operations, statistics, history tracking, and bulk operations.

**Rejected because:** Core functionality already exists (`GET /chains/blocked`, `POST /chains/:id/unblock`). System automatically blocks failure loops; only manual unblock is needed.

**Alternative:** Use existing simple block/unblock endpoints.

## Design Constraints

**When evaluating new features, ask:**

1. **Do bots have native access?** If yes, don't wrap it in an API.
2. **Does core functionality exist?** If yes, don't add complex management layers.
3. **Is this solving a real problem?** If no documented issues exist, don't build preventive infrastructure.
4. **Can this be done with existing tools?** If yes, document the tool usage instead.

## Impact

**Code removed:** ~2,646 lines of test code for over-engineered features
**Endpoints not built:** ~30+ unnecessary API endpoints
**Maintenance saved:** No complex pattern matching, conflict resolution, or monitoring infrastructure to maintain

## References

- ChainTrackerService: `backend/src/services/chainTracker.service.ts` (existing simple implementation)
- Git removal decision commits: a8fabbb, cae9352, 8b0c9ae
