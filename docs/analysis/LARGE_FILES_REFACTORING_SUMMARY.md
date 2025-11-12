# Large Files Requiring Refactoring - Summary

**Date**: 2025-11-12  
**Status**: Prioritized Action Plan  
**Source**: Aggregated from CODE_HYGIENE_AND_MAINTAINABILITY_ANALYSIS.md and taskqueue-metrics-extraction.md

---

## Executive Summary

**Current State (2025-11-12 20:15 UTC)**:

4 large files (>1,500 lines) need modularization. Combined, these files represent **7,203 lines** of backend code that can be split into smaller, focused modules.

**Completed Refactorings** ✅:
- ~~taskQueue.sqlite.ts~~ - Metrics extracted to `taskQueueMetrics.service.ts` (276 lines)
- ~~dev-bots.routes.ts~~ - Modularized into 6 focused route files

**Remaining Priority Order**:
1. **prConditionState.service.ts** (1,922 lines) - P1 High Value  
2. **devBotsManager.ts** (1,789 lines) - P1 High Value
3. **taskPromptTemplates.ts** (1,521 lines) - P2 Quality
4. **githubWebhookHandler.service.ts** (1,448 lines) - P2 Quality (NEW)

---

## 1. ✅ taskQueue.sqlite.ts - COMPLETED

**Original Size**: 2,151 lines (before extraction)  
**Current Size**: 1,971 lines (after extraction)  
**Status**: ✅ Metrics extracted successfully  
**Completed**: Commit 274811f (2025-11-09)

### What Was Extracted ✅

**Created**: `taskQueueMetrics.service.ts` (276 lines)

**Extracted Components**:
- ✅ `TaskQueueMetricsService` class with database access
- ✅ `getTaskDurationStats()` - task duration analytics
- ✅ `getQueueMetrics()` - queue health metrics
- ✅ `getAgentComparisonMetrics()` - Claude vs Codex comparison
- ✅ `summarizeAgentComparisonMetrics()` - utility function
- ✅ All metrics-related types:
  - `AgentStatsRow`
  - `AgentTaskTypeStatsRow`
  - `TaskTypeKey`
  - `AgentTaskTypeBreakdown`
  - `AgentMetrics`
  - `AgentComparisonMetrics`

**Integration**:
- TaskQueueService instantiates `TaskQueueMetricsService` in constructor
- Delegates all metrics methods to the service
- Types re-exported for backward compatibility
- All tests passing ✅

### Results Achieved
- ✅ Clear separation of concerns (metrics vs queue operations)
- ✅ Easier testing (metrics service independently testable)
- ✅ 276 lines extracted to dedicated service
- ✅ File size reduced by ~180 lines (8.4% reduction)
- ✅ Zero breaking changes (backward compatible delegation)

### Remaining Opportunities
Consider future extractions:
- Recovery/repair operations → `taskQueueRecovery.service.ts`
- PR tracking logic → `taskQueuePR.service.ts`
- Schema definitions → `taskQueueSchema.ts`

### Technical Design
See: `docs/technicalDesigns/taskqueue-metrics-extraction.md`

---

## 2. prConditionState.service.ts (1,922 lines)

**Priority**: P1 - High Value  
**Effort**: Medium-Large (1-2 days)  
**Status**: Needs design plan

### Problem
Complex monolithic service handling ALL PR condition evaluation:
- CI checks evaluation
- Review approval logic
- Comment resolution tracking
- Merge conflict detection
- Draft PR handling
- Task verification
- All in one 1,922 line file

### Proposed Extraction

Create modular evaluator pattern:

```
backend/src/services/prConditions/
├── evaluators/
│   ├── checksEvaluator.ts          # CI check evaluation (~200 lines)
│   ├── reviewsEvaluator.ts         # Review approval logic (~200 lines)
│   ├── commentsEvaluator.ts        # Unresolved threads (~150 lines)
│   ├── conflictsEvaluator.ts       # Merge conflict detection (~150 lines)
│   ├── draftsEvaluator.ts          # Draft PR handling (~100 lines)
│   └── taskVerificationEvaluator.ts # Task verification (~200 lines)
├── validators/
│   ├── prValidation.ts             # PR state validation (~150 lines)
│   └── blockingIssues.ts           # Blocking issue logic (~100 lines)
└── index.ts                         # Main orchestrator (~250 lines)
```

**Main service becomes orchestrator**:
- Delegates to specialized evaluators
- Coordinates condition checks
- Manages state transitions
- Only ~250-300 lines

### Benefits
- Each evaluator independently testable
- Easier to add new condition types
- Clearer logic for each check
- Parallel development possible
- Reduces cognitive load

### Estimated Size After Split
- Main orchestrator: ~300 lines
- 6 evaluators: 100-200 lines each
- 2 validators: 100-150 lines each
- Total distributed: ~1,300 lines across 9 files

---

## 3. devBotsManager.ts (1,789 lines)

**Priority**: P1 - High Value  
**Effort**: Medium (1-2 days)  
**Status**: Partially extracted (needs completion)

### Problem
Core orchestrator doing too much:
- Worker management
- Task execution
- Docker integration
- Interactive sessions
- Process lifecycle
- Event coordination

### Existing Extracted Services (Underutilized) ✅
- `ephemeralWorker.service.ts` - Worker lifecycle (partially used)
- `interactiveSession.service.ts` - Session management (partially used)
- `dockerManager.ts` - Docker operations (exists)

### Refactoring Strategy

#### 1. Complete Migration to Extracted Services
Move remaining logic to existing services:

**a) ephemeralWorker.service.ts**
- Migrate all worker lifecycle code
- Complete worker state management
- Consolidate cleanup logic

**b) interactiveSession.service.ts**
- Move ALL interactive session logic
- Session state management
- Input/output handling

**c) dockerManager.ts**
- Consolidate Docker operations
- Container lifecycle
- Volume management

#### 2. Keep Only Orchestration
Main file should only:
- Coordinate between services
- Handle high-level task flow
- Manage service dependencies
- Event emission
- Target: ~500-600 lines

### Benefits
- Better use of existing extracted services
- Clearer service boundaries
- Easier testing (services already testable)
- Reduced cognitive load

### Estimated Time
- Phase 1: Complete ephemeralWorker migration (4 hours)
- Phase 2: Complete interactiveSession migration (4 hours)
- Phase 3: Consolidate dockerManager (2 hours)
- Phase 4: Refactor main orchestrator (4 hours)
- **Total**: 2 days

---

## 4. taskPromptTemplates.ts (1,521 lines)

**Priority**: P2 - Quality Improvement  
**Effort**: Medium (1 day)  
**Status**: Needs design plan

### Problem
Large template generation service mixing:
- Template structure definitions
- Variable processors (50+ processors)
- Template assembly logic
- Helper methods
- Architecture documentation links

### Proposed Extraction

```
backend/src/services/taskPrompts/
├── processors/
│   ├── taskProcessors.ts           # Task field processors (~200 lines)
│   ├── gitProcessors.ts            # Git/branch processors (~150 lines)
│   ├── contextProcessors.ts        # Context field processors (~200 lines)
│   └── metadataProcessors.ts       # Metadata processors (~150 lines)
├── templates/
│   ├── baseTemplate.ts             # Core template structure (~200 lines)
│   ├── sectionsTemplate.ts         # Section definitions (~200 lines)
│   └── architectureLinks.ts        # Docs links (~100 lines)
├── helpers/
│   └── templateHelpers.ts          # Utility functions (~100 lines)
└── index.ts                         # Main manager (~200 lines)
```

### Benefits
- Each processor group independently testable
- Easier to add new template sections
- Clearer organization of 50+ processors
- Easier to maintain architecture links

### Estimated Size After Split
- Main manager: ~200 lines
- 4 processor modules: 150-200 lines each
- 3 template modules: 100-200 lines each
- 1 helper module: ~100 lines
- Total distributed: ~1,400 lines across 9 files

---

## 4. ✅ dev-bots.routes.ts - COMPLETED

**Original Size**: 2,068 lines (monolithic file)  
**Status**: ✅ Fully modularized  
**Completed**: Commits 81ee911 through 84650b5 (2025-11-08 to 2025-11-09)

### Current Structure
```
backend/src/routes/dev-bots/
├── index.ts                    # Main router aggregator (71 lines)
├── shared.ts                   # Common utilities (403 lines)
├── status.routes.ts            # Status endpoints (512 lines)
├── tasks.routes.ts             # Task endpoints (877 lines)
├── agents.routes.ts            # Agent endpoints (62 lines)
├── interactive.routes.ts       # Interactive endpoints (145 lines)
└── templates.routes.ts         # Template endpoints (131 lines)
```

### Results Achieved
- ✅ Largest file reduced: 2,068 → 877 lines (58% reduction)
- ✅ Average module size: 314 lines (vs 2,068 monolith)
- ✅ 7 focused modules with clear responsibilities
- ✅ All tests passing
- ✅ Clear separation of concerns
- ✅ Easier to navigate and maintain
- ✅ Parallel development enabled

### Technical Design
See: `docs/technicalDesigns/dev-bots-routes-modularization.md`

---

## 5. githubWebhookHandler.service.ts (1,448 lines) - NEW

**Priority**: P2 - Quality Improvement  
**Effort**: Medium (1-2 days)  
**Status**: Identified in current analysis

### Problem
Large webhook handler mixing multiple event types:
- Pull request events (opened, closed, synchronize)
- Push events (commit notifications)
- Check suite events (CI status updates)
- Workflow run events
- All event processing logic in one file

### Proposed Extraction

```
backend/src/services/webhooks/
├── handlers/
│   ├── prEventHandler.ts           # PR lifecycle events (~300 lines)
│   ├── pushEventHandler.ts         # Push/commit events (~200 lines)
│   ├── checkSuiteHandler.ts        # CI check events (~200 lines)
│   └── workflowRunHandler.ts       # Workflow events (~200 lines)
├── validators/
│   └── webhookValidator.ts         # Signature validation (~100 lines)
└── index.ts                         # Main orchestrator (~300 lines)
```

**Main handler becomes orchestrator**:
- Routes events to specialized handlers
- Validates webhook signatures
- Handles common error scenarios
- ~300 lines

### Benefits
- Each event handler independently testable
- Easier to add new event types
- Clearer logic for each event
- Reduced cognitive load

### Estimated Size After Split
- Main orchestrator: ~300 lines
- 4 event handlers: 200-300 lines each
- 1 validator: ~100 lines
- Total distributed: ~1,300 lines across 6 files

---

## Priority Implementation Order

### ✅ Completed
1. ~~**taskQueue.sqlite.ts** - Metrics extracted~~ (Completed 2025-11-09)
2. ~~**dev-bots.routes.ts** - Modularized~~ (Completed 2025-11-09)

### Immediate (This Sprint)
1. **prConditionState.service.ts** - Create evaluator pattern (2 days)
   - **HIGH PRIORITY** - Most impactful for PR workflow clarity
   - High complexity, needs careful planning
   - Design phase needed before implementation
   - Largest remaining monolithic service

### Next Sprint
2. **devBotsManager.ts** - Complete service migration (2 days)
   - Leverage existing extracted services (ephemeralWorker, interactiveSession)
   - Clear migration path
   - Immediate maintainability gains

3. **githubWebhookHandler.service.ts** - Extract event handlers (1-2 days)
   - NEW: Identified as 4th largest file (1,448 lines)
   - Extract PR event handlers, push handlers, check suite handlers
   - Clear separation by event type

### Future Sprint
4. **taskPromptTemplates.ts** - Extract processors (1 day)
   - Lower priority
   - Still valuable for maintainability
   - Clear structure for extraction

---

## Success Metrics

### Before (2025-11-08)
- 5 files >1,500 lines
- Total: 8,080 lines in large files
- Average file size: 1,616 lines
- Cognitive load: HIGH

### Current (2025-11-12)
- ✅ 2 files refactored (taskQueue, dev-bots routes)
- ✅ 456 lines extracted to dedicated services
- 4 files >1,500 lines remaining
- Total: 7,203 lines in large files
- Average file size: 1,801 lines
- Progress: **2 of 5 completed (40%)**

### After (Target)
- 0 files >1,000 lines
- Largest file: ~877 lines (tasks.routes.ts) ✅ Already achieved
- Average file size: <400 lines
- Cognitive load: LOW

### Quality Improvements Achieved ✅
- ✅ Better testability (metrics service independently testable)
- ✅ Clearer responsibilities (routes by domain, metrics separated)
- ✅ Easier onboarding (smaller, focused route files)
- ✅ Parallel development (less conflicts on routes)
- ✅ Better IDE performance (smaller files load faster)

### Quality Improvements Pending
- 🔄 prConditionState evaluator pattern
- 🔄 devBotsManager service completion
- 🔄 webhookHandler event extraction
- 🔄 taskPromptTemplates processor organization

---

## Related Documentation

### Existing Plans
- `docs/technicalDesigns/taskqueue-metrics-extraction.md` - Detailed TaskQueue plan
- `docs/technicalDesigns/dev-bots-routes-modularization.md` - Routes refactoring (completed)
- `docs/analysis/CODE_HYGIENE_AND_MAINTAINABILITY_ANALYSIS.md` - Comprehensive analysis

### Testing Strategy
See `CODE_HYGIENE_AND_MAINTAINABILITY_ANALYSIS.md` Section 7:
- Add tests for critical services
- Priority: chainTracker, qualityImprovement, qualityObservation
- Target: 80%+ coverage for all critical services

### Code Quality
See `CODE_HYGIENE_AND_MAINTAINABILITY_ANALYSIS.md`:
- P0: Duplicate migration numbers
- P0: .env.example missing variables
- P2: Replace console.* with logger
- P2: Address TODO comments

---

## Next Steps

1. **Review and approve** this summary
2. **Create task** for taskQueue metrics extraction (90 minutes)
3. **Design phase** for prConditionState evaluators (4 hours)
4. **Create tasks** for devBotsManager service completion
5. **Prioritize** in sprint planning

---

## Notes

- All extractions maintain backward compatibility
- Tests must pass after each extraction
- Use delegation pattern for smooth transition
- Document extracted services clearly
- Update imports systematically
