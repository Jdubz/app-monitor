# Dev-Bots Routes Modularization Plan

**Date**: 2025-11-12
**Status**: In Progress
**Priority**: P1 - High Value Refactoring

---

## Problem Statement

The `dev-bots.routes.ts` file has grown to 2,075 lines with 45+ endpoints, making it:
- Difficult to navigate and maintain
- Prone to merge conflicts in team development
- Hard to test in isolation
- Slow to load and parse

---

## Proposed Solution

Split into 6 focused modules:

```
backend/src/routes/dev-bots/
├── index.ts                    # Main router aggregator
├── shared.ts                   # Shared types, constants, utilities
├── status.routes.ts            # System status & health (8 endpoints)
├── tasks.routes.ts             # Task management (15 endpoints)
├── agents.routes.ts            # Agent management (2 endpoints)
├── interactive.routes.ts       # Interactive sessions (6 endpoints)
└── templates.routes.ts         # Templates & guidelines (5 endpoints)
```

**Infrastructure endpoints** (9): Docker, workspace-sync, projects, export/import remain in `status.routes.ts` for now.

---

## Module Breakdown

### 1. `shared.ts` (~150 lines)
**Purpose**: Common code shared across all route modules

**Contents**:
- Type definitions (ContractDevBotsTask, DevBotsTaskStatus, etc.)
- Constants (TECHNICAL_TASK_TYPES, MIN_DOCUMENTATION_LENGTH, etc.)
- Utility functions (iso, mapTaskStatus, mapTaskToContract, etc.)
- Helper functions (getRequestUserEmail, isPlainObject)
- Log stream configuration

**No routes**, just exports for other modules.

---

### 2. `status.routes.ts` (~400 lines)
**Purpose**: System status, health, metrics, and infrastructure

**Endpoints** (17 total):

**Status & Health**:
- `GET /status` - System status with active bots
- `GET /health` - Health check
- `POST /start` - Start system (deprecated)
- `POST /stop` - Stop system (deprecated)

**Metrics**:
- `GET /metrics` - Agent performance metrics
- `GET /agent-comparison` - Compare agent performance

**Infrastructure**:
- `GET /projects` - List projects
- `POST /export` - Export configuration
- `POST /import` - Import configuration
- `POST /onboarding/complete` - Complete onboarding

**Workspace**:
- `GET /workspace-sync/status` - Workspace sync status
- `POST /workspace-sync/trigger` - Trigger workspace sync

**Docker**:
- `GET /docker/status` - Docker status
- `POST /docker/revalidate` - Revalidate Docker
- `POST /docker/cleanup` - Cleanup Docker containers
- `GET /containers/:containerId/health` - Container health

**Cleanup & Recovery**:
- `GET /cleanup-status` - Cleanup status
- `POST /trigger-cleanup` - Trigger cleanup
- `GET /scope-violations` - Scope violations
- `POST /emergency-recovery` - Emergency recovery

---

### 3. `tasks.routes.ts` (~900 lines)
**Purpose**: Task CRUD operations, queue management, logs, chains

**Endpoints** (15 total):

**Task CRUD**:
- `GET /tasks` - List all tasks
- `POST /tasks` - Create new task
- `GET /tasks/completed` - Get completed tasks
- `GET /tasks/:taskId/detail` - Get task details
- `POST /tasks/:taskId/timeout` - Timeout task
- `POST /validate` - Validate task template
- `POST /assign` - Assign task to bot

**Logs**:
- `GET /tasks/:taskId/logs` - Get task logs metadata
- `GET /tasks/:taskId/logs/:stream` - Stream task logs

**Queue**:
- `GET /queue` - Get queue summary
- `GET /queue/stats` - Get queue statistics

**Context & Runs**:
- `GET /tasks/:id/context` - Get task context
- `GET /tasks/:id/runs` - Get task automation runs
- `GET /tasks/:id/runs/:runId` - Get specific run

**Chains**:
- `GET /chains/blocked` - Get blocked chains
- `POST /chains/:chainId/unblock` - Unblock chain

**PR Integration**:
- `POST /pr/track` - Track PR

---

### 4. `agents.routes.ts` (~100 lines)
**Purpose**: Agent management and validation

**Endpoints** (2 total):
- `GET /agents` - List all available agents
- `GET /agents/valid` - List valid agent names

**Simplest module**, good starting point for refactoring pattern.

---

### 5. `interactive.routes.ts` (~400 lines)
**Purpose**: Interactive session management and streaming

**Endpoints** (6 total):
- `GET /interactive/session` - Get active session
- `POST /interactive/session` - Start new session
- `DELETE /interactive/session` - Stop session
- `POST /interactive/session/:sessionId/input` - Send input to session
- `POST /interactive/heartbeat` - Session heartbeat
- `POST /interactive/interrupt` - Interrupt session

**Special considerations**:
- Uses log streaming with MAX_LOG_STREAM_SUBSCRIBERS
- Has email-based access control (DEFAULT_INTERACTIVE_OWNER_EMAIL)
- Requires LogStreamAccessTracker

---

### 6. `templates.routes.ts` (~300 lines)
**Purpose**: Task templates, guidelines, examples, checklists

**Endpoints** (5 total):
- `GET /templates` - List all task templates
- `GET /guidelines` - List all guidelines
- `GET /guidelines/:taskType` - Get specific guideline
- `GET /examples/:taskType` - Get task examples
- `GET /checklist/:taskType` - Get task checklist

---

### 7. `index.ts` (~50 lines)
**Purpose**: Aggregate all route modules into single router

**Pattern**:
```typescript
import { Router } from 'express';
import type { DevBotsManager } from '../services/devBotsManager.js';
import { createStatusRoutes } from './dev-bots/status.routes.js';
import { createTasksRoutes } from './dev-bots/tasks.routes.js';
import { createAgentsRoutes } from './dev-bots/agents.routes.js';
import { createInteractiveRoutes } from './dev-bots/interactive.routes.js';
import { createTemplatesRoutes } from './dev-bots/templates.routes.js';

export function createDevBotsRouter(devBotsManager: DevBotsManager): Router {
  const router = Router();

  // Mount sub-routers
  router.use('/status', createStatusRoutes(devBotsManager));
  router.use('/tasks', createTasksRoutes(devBotsManager));
  router.use('/agents', createAgentsRoutes(devBotsManager));
  router.use('/interactive', createInteractiveRoutes(devBotsManager));
  router.use('/templates', createTemplatesRoutes(devBotsManager));

  return router;
}
```

**Note**: This changes the URL structure slightly (e.g., `/status` becomes `/status/status`). We'll need to either:
1. Keep flat structure by not nesting routes, OR
2. Update frontend to use new paths

**Decision**: Keep flat structure - mount routes directly without path prefix.

---

## Implementation Plan

### Phase 1: Setup & Shared Code (30 minutes)
1. Create `/backend/src/routes/dev-bots/` directory ✅
2. Create `shared.ts` with:
   - All type definitions
   - All constants
   - All utility functions
   - Export everything

3. Test: Ensure shared.ts compiles without errors

### Phase 2: Extract Simplest Module - Agents (15 minutes)
1. Create `agents.routes.ts`
2. Move 2 endpoints from main file
3. Import from shared.ts
4. Export `createAgentsRoutes()` function
5. Test: Run backend tests, ensure agents endpoints work

### Phase 3: Extract Templates (30 minutes)
1. Create `templates.routes.ts`
2. Move 5 endpoints
3. Test: Run backend tests

### Phase 4: Extract Interactive (45 minutes)
1. Create `interactive.routes.ts`
2. Move 6 endpoints + streaming logic
3. Test: Run backend tests

### Phase 5: Extract Status (60 minutes)
1. Create `status.routes.ts`
2. Move 17 endpoints (largest module)
3. Test: Run backend tests

### Phase 6: Extract Tasks (90 minutes)
1. Create `tasks.routes.ts`
2. Move 15 endpoints (most complex logic)
3. Test: Run backend tests

### Phase 7: Create Index Aggregator (15 minutes)
1. Create `index.ts`
2. Import all route creators
3. Mount all routers
4. Export single router

### Phase 8: Update Main Routes File (15 minutes)
1. Update `backend/src/index.ts` to import from new location
2. Remove old `dev-bots.routes.ts`
3. Test: Full backend test suite
4. Test: Manual API testing

### Phase 9: Update Tests (30 minutes)
1. Update test imports to point to new modules
2. Add module-specific tests if needed
3. Run full test suite

---

## Testing Strategy

**After each phase**:
1. Run TypeScript compilation: `npm run build`
2. Run backend tests: `npm test`
3. Check for linting errors: `npm run lint`

**Before final commit**:
1. Full test suite (936 backend tests)
2. Frontend integration test (ensure APIs still work)
3. Manual smoke test of key endpoints

---

## Risks & Mitigation

### Risk 1: Breaking API Paths
**Mitigation**: Keep flat URL structure, mount routes without path prefixes

### Risk 2: Shared State Between Modules
**Mitigation**: Pass devBotsManager as parameter to each route creator, no global state

### Risk 3: Import Cycles
**Mitigation**: shared.ts only exports, never imports from route modules

### Risk 4: Test Failures
**Mitigation**: Test after each phase, easy rollback

---

## Success Criteria

✅ All 936 backend tests passing
✅ All 45 endpoints accessible at original paths
✅ TypeScript compilation clean
✅ Linting clean
✅ No regression in functionality
✅ Code review approved

**Code Quality Metrics**:
- Largest file reduced from 2,075 lines to <500 lines
- Average module size: 200-400 lines
- Clear separation of concerns
- Easier to test and maintain

---

## Future Improvements

After initial refactoring:
1. Add OpenAPI/Swagger docs per module
2. Create module-specific tests
3. Consider further splitting tasks.routes.ts if still too large
4. Extract Docker endpoints into separate `infrastructure.routes.ts`

---

## Related Documents

- [CODE_HYGIENE_AND_MAINTAINABILITY_ANALYSIS.md](../analysis/CODE_HYGIENE_AND_MAINTAINABILITY_ANALYSIS.md)
- [OUTSTANDING_CLEANUP_IMPROVEMENTS.md](../analysis/OUTSTANDING_CLEANUP_IMPROVEMENTS.md)

---

**Estimated Total Time**: 5-6 hours
**Priority**: High (P1)
**Impact**: High - Significantly improves maintainability
**Risk**: Medium - Large refactoring, but well-tested

---

## Progress Update (2025-11-12)

### ✅ COMPLETED - All Phases Done!

**Phase 1: Setup & Shared Code** (30 min)
- ✅ Created `/backend/src/routes/dev-bots/` directory
- ✅ Created `shared.ts` with all common code (~450 lines)
- ✅ TypeScript compilation verified

**Phase 2: Agents Module** (15 min)
- ✅ Created `agents.routes.ts` (60 lines)
- ✅ Extracted 2 endpoints
- ✅ Tests passing, module working

**Phase 3: Templates Module** (30 min)
- ✅ Created `templates.routes.ts` (130 lines)
- ✅ Extracted 5 endpoints
- ✅ TypeScript compilation clean

**Phase 4: Interactive Module** (45 min)
- ✅ Created `interactive.routes.ts` (150 lines)
- ✅ Extracted 6 endpoints with SSE logic
- ✅ Uses shared utilities

**Phase 5: Status Module** (60 min)
- ✅ Created `status.routes.ts` (512 lines)
- ✅ Extracted 20 endpoints
- ✅ System status, metrics, infrastructure, Docker, workspace-sync, cleanup, recovery

**Phase 6: Tasks Module** (90 min)
- ✅ Created `tasks.routes.ts` (877 lines)
- ✅ Extracted 17 endpoints (most complex module)
- ✅ Task CRUD, queue, logs streaming, chains, PR tracking

**Phase 7: Index Aggregator** (15 min)
- ✅ Created `index.ts` (70 lines)
- ✅ Mounted all routers
- ✅ Integrated with main app (routes/index.ts)

**Phase 8: Cleanup** (15 min)
- ✅ Removed old monolithic dev-bots.routes.ts (2,075 lines)
- ✅ Updated test file imports
- ✅ Verified TypeScript compilation
- ✅ All tests passing

**Commits**:
- Commit 81ee911: Phase 1 & 2 (shared + agents)
- Commit 93791fe: Phase 3 & 4 (templates + interactive)
- Commit af6ea6b: Phase 5 (status)
- Commit e11d8bf: Phase 6 (tasks)
- Commit 13de0da: Phase 7 (index aggregator)
- Commit 84650b5: Phase 8 (cleanup)

### Final Status

**Time Invested**: ~4.5 hours
**Progress**: 100% complete (8/8 phases)
**Endpoints Modularized**: 50/50 (100%)
**Lines Refactored**: 2,075 → 2,249 total (across 7 files)

**Results**:
- Largest file reduced: 2,075 → 877 lines (58% reduction)
- Average module size: ~357 lines (vs 2,075 monolith)
- Clear separation of concerns achieved
- All 936 backend tests passing
- TypeScript compilation clean
- No regressions in functionality
