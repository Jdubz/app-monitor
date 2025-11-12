# Large Files Requiring Refactoring - Summary

**Date**: 2025-11-12  
**Status**: Prioritized Action Plan  
**Source**: Aggregated from CODE_HYGIENE_AND_MAINTAINABILITY_ANALYSIS.md and taskqueue-metrics-extraction.md

---

## Executive Summary

5 large files (>1,500 lines) need modularization to improve maintainability, testability, and code organization. Combined, these files represent **8,080 lines** of backend code that can be split into smaller, focused modules.

**Priority Order**:
1. **taskQueue.sqlite.ts** (1,971 lines) - P1 High Value
2. **prConditionState.service.ts** (1,922 lines) - P1 High Value  
3. **devBotsManager.ts** (1,789 lines) - P1 High Value
4. **taskPromptTemplates.ts** (1,521 lines) - P2 Quality
5. ~~dev-bots.routes.ts (2,068 lines)~~ - ✅ Already modularized (completed)

---

## 1. taskQueue.sqlite.ts (1,971 lines)

**Priority**: P1 - High Value  
**Effort**: Medium (1-2 days)  
**Status**: Ready for extraction

### Problem
Monolithic file mixing multiple concerns:
- Core queue operations (enqueue, dequeue, assign)
- Task lifecycle management (complete, fail, timeout)
- Database schema and migrations
- **Metrics and analytics** (duration stats, agent comparison, queue metrics)
- Recovery and repair operations
- PR tracking integration

### Extraction Plan

#### Phase 1: Extract Metrics (~200 lines)
**Target File**: `taskQueueMetrics.service.ts`

**Extract**:
- `getTaskDurationStats()` (lines 1611-1645) - 35 lines
- `getQueueMetrics()` (lines 1650-1699) - 50 lines
- `getAgentComparisonMetrics()` (lines 1758-1796) - 120 lines
- `summarizeAgentComparisonMetrics()` (lines 80-132) - utility function
- Associated types (lines 41-73):
  - `AgentStatsRow`
  - `AgentTaskTypeStatsRow`
  - `TaskTypeKey`
  - `AgentTaskTypeBreakdown`
  - `AgentMetrics`
  - `AgentComparisonMetrics`

**Implementation**:
```typescript
export class TaskQueueMetricsService {
  constructor(private db: Database.Database) {}
  
  getTaskDurationStats(daysBack: number = 30): Array<...> { }
  getQueueMetrics(): QueueMetrics { }
  getAgentComparisonMetrics(): AgentComparisonMetrics { }
}
```

**Backward Compatibility**: Delegate methods from TaskQueueService to MetricsService

**Estimated Time**: 90 minutes

#### Phase 2: Consider Further Extractions
After metrics extraction, evaluate:
- Recovery/repair operations → `taskQueueRecovery.service.ts`
- PR tracking logic → `taskQueuePR.service.ts`
- Schema definitions → `taskQueueSchema.ts`

### Benefits
- Easier testing of metrics logic
- Clear separation of concerns
- Metrics can be reused elsewhere
- Reduces main file from 1,971 to ~1,800 lines (9% reduction)

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

## 5. ✅ dev-bots.routes.ts (Previously 2,068 lines) - COMPLETED

**Status**: ✅ Already modularized  
**Completed**: Based on docs/technicalDesigns/dev-bots-routes-modularization.md

### Current Structure
```
backend/src/routes/dev-bots/
├── index.ts                    # Main router aggregator
├── shared.ts                   # Common utilities (~450 lines)
├── status.routes.ts            # Status endpoints (~512 lines)
├── tasks.routes.ts             # Task endpoints (~877 lines)
├── agents.routes.ts            # Agent endpoints (~100 lines)
├── interactive.routes.ts       # Interactive endpoints (~150 lines)
└── templates.routes.ts         # Template endpoints (~130 lines)
```

### Results
- Largest file reduced: 2,068 → 877 lines (58% reduction)
- Average module size: ~357 lines (vs 2,068 monolith)
- ✅ Clear separation of concerns achieved
- ✅ Easier to navigate and maintain

---

## Priority Implementation Order

### Immediate (This Sprint)
1. **taskQueue.sqlite.ts** - Extract metrics (90 minutes)
   - High impact, low effort
   - Clear extraction plan already documented
   - Sets pattern for future extractions

### Next Sprint
2. **prConditionState.service.ts** - Create evaluator pattern (2 days)
   - High complexity, needs careful planning
   - Most impactful for PR workflow clarity
   - Design phase needed before implementation

3. **devBotsManager.ts** - Complete service migration (2 days)
   - Leverage existing extracted services
   - Clear migration path
   - Immediate maintainability gains

### Future Sprint
4. **taskPromptTemplates.ts** - Extract processors (1 day)
   - Lower priority
   - Still valuable for maintainability
   - Clear structure for extraction

---

## Success Metrics

### Before
- 5 files >1,500 lines
- Total: 8,080 lines in large files
- Average file size: 1,616 lines
- Cognitive load: HIGH

### After (Target)
- 0 files >1,000 lines
- Largest file: ~877 lines (tasks.routes.ts)
- Average file size: <400 lines
- Cognitive load: LOW

### Quality Improvements
- ✅ Better testability (isolated units)
- ✅ Clearer responsibilities (SRP)
- ✅ Easier onboarding (smaller files)
- ✅ Parallel development (less conflicts)
- ✅ Better IDE performance (smaller files)

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
