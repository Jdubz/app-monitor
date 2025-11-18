# Refactoring Backlog

This file contains a list of outstanding refactoring tasks.

---

## P2 Medium Priority (Next 1-2 Months)

### 1. Consolidate Interactive Session Services (16h)
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

### 2. Consolidate PR Services (12h)
**Status:** NOT STARTED

**Issue:** 7 services duplicating PR fetching logic.

**Action:**
- Create PRServiceFacade to coordinate operations
- Implement request caching in githubPR.service.ts
- Add PR state change event emitter

**Priority:** P2
**Effort:** 12 hours

### 3. Refactor Database Migrations (16h)
**Status:** NOT STARTED

**Issue:** Ad-hoc migrations in TaskQueueService (293 lines).

**Action:**
- Create MigrationManager with versioned migrations
- Extract migrations to separate files
- Add rollback support

**Priority:** P2
**Effort:** 16 hours
