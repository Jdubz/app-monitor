# Observability Routes Tests Removal

**Date:** 2025-11-18

## Decision

Removed `observability-routes.spec.ts` test file (~18 tests, 400+ lines) that tested debugging and monitoring endpoints.

## Rationale

**Keep it simple.** These endpoints are unnecessary because:

1. **Agents have direct log access** - Dev-bots can read log files directly using native commands
2. **No need for API wrappers** - Adding `/api/health/liveness`, `/api/debug/memory`, `/api/metrics/*` creates unnecessary abstraction
3. **Over-engineering** - The app doesn't need Kubernetes health probes, memory debugging APIs, or metrics endpoints
4. **Maintenance burden** - More code to write, test, and maintain with no clear benefit

## What Was Removed

**18 test cases** expecting these endpoints:
- `/api/health/*` - Health check endpoints (liveness, readiness, detailed)
- `/api/debug/*` - Debug endpoints (memory, uptime, session-state, active-tasks, etc.)
- `/api/metrics/*` - Metrics endpoints (performance, database)
- `/api/logs/*` - Log access endpoints (recent, errors, warnings)

## Alternative Approach

Instead of building APIs, agents can:
```bash
# Check memory
free -h
top

# Check logs
tail -100 backend/logs/app.log
grep ERROR backend/logs/app.log

# Check uptime
uptime

# Check active tasks
curl localhost:3002/api/dev-bots/status
```

## Impact

- ✅ Removes 18 "expected failure" tests
- ✅ Reduces test suite complexity
- ✅ Prevents feature creep
- ✅ Keeps focus on core app functionality

**Core app functionality:** Task queue management, dev-bot orchestration, PR workflow automation.

---

**Files Removed:**
- `e2e/tests/observability-routes.spec.ts`

**Documentation Updated:**
- `e2e/TEST_RUN_SUMMARY.md` - Removed observability from action items
