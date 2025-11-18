# PR Services Consolidation Plan

**Created:** 2024-11-18  
**Status:** READY TO START  
**Estimated Effort:** 12 hours  
**Priority:** P2

---

## Problem Statement

Currently have 7 PR-related services with overlapping responsibilities:

### Current Services

1. **githubPR.service.ts** (950 lines)
   - GitHub API client for PR operations
   - PR status fetching
   - Merge operations
   - Copilot review analysis

2. **prMonitor.service.ts** (1,150 lines)
   - PR workflow business logic
   - Auto-merge decisions
   - Followup task creation
   - Orphaned PR adoption

3. **prSync.service.ts** (511 lines)
   - PR table synchronization
   - Metadata updates

4. **prWorkflowOrchestrator.service.ts** (467 lines)
   - High-level PR workflow coordination
   - Task→PR lifecycle management

5. **prConditionState.service.ts** (1,517 lines)
   - **✅ ALREADY REFACTORED** with modular evaluators
   - 8 condition evaluators extracted
   - Well-structured

6. **prArtifactRecovery.service.ts** (289 lines)
   - Recovery of PR metadata from orphaned tasks

7. **planProgressCalculator.service.ts** (293 lines)  
   - Plan progress calculation based on PR status

### Issues Identified

#### 1. Duplicate PR Fetching
Multiple services call `githubPR.getPRStatus()` independently:
- No caching layer
- Redundant API calls
- Rate limiting risk

#### 2. Unclear Separation of Concerns
Overlapping responsibilities between:
- `prMonitor` (business logic + workflow)
- `prWorkflowOrchestrator` (also workflow coordination)
- `prSync` (data synchronization)

#### 3. Missing Coordination
No central facade to coordinate PR operations across services.

---

## Proposed Architecture

### Keep Existing Well-Structured Services

✅ **prConditionState.service.ts** - Already refactored with evaluators  
✅ **prArtifactRecovery.service.ts** - Focused, single responsibility  
✅ **planProgressCalculator.service.ts** - Focused, single responsibility

### Refactor Target Services

#### 1. Create PRCacheService (NEW)

**Responsibility:** Centralized PR data caching

```typescript
export class PRCacheService {
  private cache: Map<number, { data: PRStatus; fetchedAt: number }>;
  private readonly TTL_MS = 30000; // 30 seconds
  
  async getPRStatus(prNumber: number): Promise<PRStatus>;
  invalidate(prNumber: number): void;
  clear(): void;
}
```

**Benefits:**
- Reduce GitHub API calls by 60-80%
- Prevent rate limiting
- Faster response times

**Estimated Effort:** 4 hours

---

#### 2. Consolidate prMonitor + prWorkflowOrchestrator

**Current:** Two services both handling workflow coordination

**Proposed:** Single **PRWorkflowService**

```typescript
export class PRWorkflowService {
  constructor(
    private github: GitHubPRService,
    private cache: PRCacheService,
    private taskQueue: TaskQueueService,
    private conditions: PRConditionStateService
  ) {}
  
  // From prMonitor
  async detectSystemCreatedPR(prData): DetectionResult;
  async adoptOrphanedSystemPR(prNumber, prData): Task | null;
  shouldCreateFollowup(prNumber, prStatus, analysis): boolean;
  async createFollowupTask(prNumber, issues, task): Task;
  
  // From prWorkflowOrchestrator
  async orchestrateTaskPRLifecycle(task): PRWorkflowResult;
  async handlePREvent(event): void;
  
  // Shared logic
  async mergePR(prNumber, taskId): MergeResult;
}
```

**Migration Steps:**
1. Create PRWorkflowService with merged methods
2. Update all callers to use new service
3. Deprecate old services
4. Remove old services after migration

**Estimated Effort:** 6 hours

---

#### 3. Keep prSync as-is

**Rationale:** Focused responsibility (PR table sync)  
**No changes needed**

---

## Implementation Plan

### Phase 1: Add Caching Layer (Week 1)

**Day 1-2: Create PRCacheService**
- Implement cache with TTL
- Add invalidation on PR updates
- Write unit tests (10-12 tests)

**Day 3: Integrate into githubPR.service**
- Wrap `getPRStatus()` with cache
- Emit events on PR changes for invalidation
- Verify existing tests pass

**Deliverables:**
- ✅ PRCacheService with tests
- ✅ githubPR.service using cache
- ✅ Documented cache behavior

---

### Phase 2: Consolidate Workflow Services (Week 2)

**Day 1-2: Create PRWorkflowService**
- Merge methods from prMonitor + prWorkflowOrchestrator
- Resolve naming conflicts
- Wire up dependencies (cache, conditions, etc.)

**Day 3: Migration**
- Update route handlers
- Update webhook handlers
- Update tests

**Day 4: Cleanup**
- Mark old services as @deprecated
- Create migration guide
- Update documentation

**Deliverables:**
- ✅ PRWorkflowService operational
- ✅ All tests passing
- ✅ Old services deprecated

---

## Success Criteria

✅ Reduce GitHub API calls by 60-80% (measured via logs)  
✅ Single source of truth for PR workflow logic  
✅ Clear separation: Cache → GitHub API → Workflow → Conditions  
✅ All existing tests passing  
✅ Zero breaking changes  
✅ Documentation updated

---

## Risk Mitigation

### Known Risks

1. **Breaking existing workflows** - Use feature flags
2. **Cache invalidation bugs** - Comprehensive tests
3. **Test failures during migration** - Incremental commits

### Mitigation Strategies

- Extract one service at a time
- Write tests FIRST before refactoring
- Use @deprecated annotations (no immediate deletion)
- Maintain backward compatibility during migration
- Commit frequently with clear messages

---

## Out of Scope

❌ Refactoring prConditionState (already done)  
❌ Changing PR database schema  
❌ Modifying GitHub webhook structure  
❌ Adding new PR features

---

## Next Actions

1. **This Week:** Implement PRCacheService
2. **Next Week:** Consolidate workflow services
3. **Following Week:** Cleanup and documentation

---

## References

- [refactoring-patterns.md](../architecture/refactoring-patterns.md) - Service extraction pattern
- [outstanding-refactoring-tasks.md](./outstanding-refactoring-tasks.md) - Task #12
- TaskQueue refactoring commits - Reference implementation

---

**Delete This File After:** PR services consolidation complete
