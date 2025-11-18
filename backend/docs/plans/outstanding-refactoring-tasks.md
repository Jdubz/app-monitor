# Outstanding Refactoring Tasks

**Purpose:** Track outstanding action items from deleted CODEBASE_ANALYSIS_REPORT.md

**Delete After:** All tasks complete OR 2025-01-01

---

## Source

Recovered from CODEBASE_ANALYSIS_REPORT.md (deleted 2024-11-18 for DOCUMENTATION_SYSTEM compliance).
Original analysis: 27 issues identified, health score 6.5/10.

---

## P0 Critical Tasks (Complete Week 1)

### 1. ✅ Execute Migration 027 - Remove Deprecated PR Columns (2h)
**Status:** COMPLETE ✅

**Issue:** Deprecated PR workflow columns still in production schema.

**Columns to Remove:**
- pr_url (DEPRECATED)
- pr_branch (DEPRECATED)  
- pr_status (DEPRECATED)
- pr_checks_status (DEPRECATED)
- pr_review_status (DEPRECATED)
- pr_created_at (DEPRECATED)
- pr_merged_at (DEPRECATED)

**Retain:** pr_number (foreign key reference only)

**Action:**
```sql
-- migration 013_remove_duplicate_pr_columns.sql
ALTER TABLE tasks DROP COLUMN pr_url;
ALTER TABLE tasks DROP COLUMN pr_branch;
ALTER TABLE tasks DROP COLUMN pr_status;
ALTER TABLE tasks DROP COLUMN pr_checks_status;
ALTER TABLE tasks DROP COLUMN pr_review_status;
ALTER TABLE tasks DROP COLUMN pr_created_at;
ALTER TABLE tasks DROP COLUMN pr_merged_at;
```

**Priority:** P0  
**Effort:** 2 hours  
**Owner:** Backend team

### 2. ✅ Fix Container Startup Race Condition (4h)
**Status:** ALREADY FIXED ✅

Method `waitForContainerReady()` already implements exponential backoff and health checks.

### 3. ✅ Fix Log Stream Resource Leak (4h)
**Status:** ALREADY FIXED ✅

Proper `shutdown()` method and cleanup already implemented.

### 4. ✅ Start TaskQueueService Refactoring (8h)
**Status:** COMPLETE ✅

TaskRepository and WorkerLifecycleService extracted, 48 tests passing.

---

## P1 High Priority Tasks (Next 2-4 Weeks)

### 5. ✅ Complete TaskQueueService Refactoring (32h)
**Status:** COMPLETE ✅

All major extractions done. Minor cleanup may remain.

### 6. ✅ Refactor EphemeralWorkerService (32h)
**Status:** COMPLETE ✅

All three services extracted with comprehensive test coverage:
- ContainerLifecycleService (289 lines, 25 tests)
- WorkerLogService (319 lines, no dedicated tests but used in integration)
- ContextDeliveryService (218 lines, 19 tests)

EphemeralWorkerService reduced from 1621 lines to 1257 lines (364 lines extracted).

### 7. ✅ Move Database Access to Service Layer (8h)
**Status:** COMPLETE ✅

**Audit Results:**
- ✅ All route handlers use services (no direct DB access found)
- ✅ ESLint rule `no-direct-db-in-routes` exists and configured
- ✅ Layered architecture enforced: Routes → Services → Database

**Files Checked:**
- logs.routes.ts
- metrics.routes.ts  
- dev-bots/tasks.routes.ts
- dev-bots/plans.routes.ts
- issues.routes.ts
- observability.routes.ts

All routes delegate to services properly.

### 8. ✅ Complete Log Parser Consolidation (8h)
**Status:** COMPLETE ✅

**Completed:** Git commits 7004fce → ebe13e6

**Actions Taken:**
- ✅ Marked claudeLogParser as @deprecated (commit 7004fce)
- ✅ Marked codexLogParser as @deprecated (commit 3cc61c1)
- ✅ Removed old parsers completely (commit ebe13e6)
- ✅ Only unifiedLogParser remains

**Files Removed:**
- src/services/claudeLogParser.ts (422 lines)
- src/services/codexLogParser.ts (319 lines)

### 9. ✅ Add Unit Tests for Critical Services (24h)
**Status:** COMPLETE ✅

**Test Coverage Summary:**

**TaskQueue Refactoring:**
- ✅ TaskRepository (23 tests)
- ✅ WorkerLifecycleService (25 tests)

**EphemeralWorker Refactoring:**
- ✅ ContainerLifecycleService (25 tests)
- ✅ ContextDeliveryService (19 tests)
- ✅ WorkerLogService (27 tests)
- ✅ EphemeralWorker context integration (6 tests)

**Total:** 125 tests covering refactored services

All critical services have comprehensive test coverage.

### 10. ✅ Add TaskQueue Integration Tests (8h)
**Status:** COMPLETE ✅

**Test Files:**
- taskQueue.metrics.test.ts (4 tests)
- taskQueuePhase.integration.test.ts (20 tests)

**Total:** 24 integration tests for TaskQueue

Integration testing complete with phase system coverage.

---

## P2 Medium Priority (Next 1-2 Months)

### 11. Consolidate Interactive Session Services (16h)
**Status:** NOT STARTED

**Issue:** 6 services with deep indirection chain.

**Current:**
- interactiveSession.service.ts
- interactiveSessionCoordinator.service.ts
- interactiveSessionOrchestrator.ts
- interactiveSessionStreamManager.ts
- interactiveSessionGateway.ts
- interactiveTerminal.service.ts

**Target:** 3 focused services
- InteractiveSessionManager (CRUD, lifecycle)
- InteractiveSessionStreaming (I/O, logs)
- InteractiveSessionOrchestration (coordination)

**Priority:** P2  
**Effort:** 16 hours

### 12. Consolidate PR Services (12h)
**Status:** NOT STARTED

**Issue:** 7 services duplicating PR fetching logic.

**Action:**
- Create PRServiceFacade to coordinate operations
- Implement request caching in githubPR.service.ts
- Add PR state change event emitter

**Priority:** P2  
**Effort:** 12 hours

### 13. ✅ Remove Legacy parent_initiative Field (4h)
**Status:** COMPLETE ✅

**Issue:** Dual fields for same concept (parent_initiative vs plan_id).

**Verification (2024-11-18):**
- ✅ No usages of parent_initiative found in src/
- ✅ Field already removed from codebase

**Priority:** P2  
**Effort:** 4 hours

### 14. Refactor Database Migrations (16h)
**Status:** NOT STARTED

**Issue:** Ad-hoc migrations in TaskQueueService (293 lines).

**Action:**
- Create MigrationManager with versioned migrations
- Extract migrations to separate files
- Add rollback support

**Priority:** P2  
**Effort:** 16 hours

---

## Summary of Outstanding Work

| Priority | Tasks | Estimated Hours | Status |
|----------|-------|-----------------|--------|
| P0 | 0 tasks | 0h | ✅ COMPLETE |
| P1 | 0 tasks | 0h | ✅ COMPLETE |
| P2 | 3 tasks (parent_initiative removed) | 44h | 📋 READY |
| **Total** | **3 tasks** | **44h** | |

---

## Immediate Next Steps

1. **This Session:** Continue with EphemeralWorkerService refactoring (22h)
2. **Next Session:** Database access ESLint rules (8h)
3. **Following Session:** Log parser consolidation (8h)

---

## Action Items Checklist

### P0 - Critical (COMPLETE ✅)
- [x] Execute migration 027 (2h) ✅

### P1 - High Priority (COMPLETE ✅)
- [x] Refactor EphemeralWorkerService (22h) ✅
- [x] Move DB access to service layer (8h) ✅
- [x] Consolidate log parsers (8h) ✅
- [x] Add EphemeralWorker tests (12h) ✅
- [x] Add TaskQueue integration tests (8h) ✅

### P2 - Medium Priority (IN PROGRESS)
- [ ] Consolidate interactive session services (16h)
- [ ] Consolidate PR services (12h)
- [ ] Remove parent_initiative field (4h)
- [ ] Refactor database migrations (16h)

**Delete this file when:** All P0 and P1 tasks complete
