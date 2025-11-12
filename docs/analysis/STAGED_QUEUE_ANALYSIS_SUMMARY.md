# Staged Queue Analysis Summary

## Executive Summary

I've analyzed the staged queue design document against the existing codebase and master design intent. Here's what I found and how to implement it.

## Current State

### ✅ Foundation Already Exists
- **Chain tracking columns** (`chain_id`, `chain_depth`) added in migration 011
- **SQLite task queue** with FIFO + priority scheduling
- **File conflict detection** prevents parallel work on same files
- **Worker heartbeats** for hung task detection
- **Follow-up task linking** via `original_task_id` and `followup_for_pr`

### ❌ Missing Components
- No `queue_stage` enum (implementation vs followup separation)
- No `chain_status` tracking (pending/active/blocked/closed)
- No chain-aware scheduling logic
- No active chain counting
- No blocked chain exclusion
- No UI for queue visibility

## Design Alignment

### ✅ Matches Master Intent
1. **Chain concurrency limit**: Design enforces max 3 concurrent chains
2. **SQLite authority**: Design uses SQLite as single source of truth
3. **Manual intervention**: Design provides UI controls for blocking/unblocking
4. **Review chain depth**: Existing chain_depth supports 4-review limit
5. **Transaction safety**: Design preserves atomic operations

### ⚠️ Clarifications Needed
1. **Copilot delegation**: Master intent says "don't count toward concurrency" - need to exclude from active chain counting
2. **Blocked chain overcapacity**: When unblocked, may temporarily exceed maxBots - natural attrition will resolve
3. **Follow-up priority**: Start with FIFO, can add priority levels later

## Implementation Approach

### Phase 1: Schema (Week 1)
**New columns**:
- `queue_stage` ENUM ('implementation', 'followup')
- `chain_status` ENUM ('pending', 'active', 'blocked', 'closed')
- `blocked_reason`, `blocked_at`, `blocked_by`

**Indexes**:
- `idx_tasks_queue_stage`
- `idx_tasks_chain_status`
- `idx_tasks_queue_stage_status` (composite)
- `idx_tasks_active_chains` (partial index)

**Backfill logic**:
```sql
UPDATE tasks SET
  queue_stage = CASE WHEN original_task_id IS NULL THEN 'implementation' ELSE 'followup' END,
  chain_id = CASE WHEN original_task_id IS NULL THEN id ELSE <inherit from original> END,
  chain_status = CASE WHEN status IN ('completed','failed') THEN 'closed' ELSE 'active' END
```

### Phase 2: Chain Tracker Service (Week 1-2)
**New service**: `chainTracker.service.ts`

**Methods**:
- `countActiveChains()` - Count non-blocked active chains
- `getQueueDepths()` - Return implementation/followup queue sizes
- `closeCompletedChains()` - Auto-close chains where PR merged + all tasks done
- `blockChain(chainId, reason, by)` - Manual blocking
- `unblockChain(chainId, by)` - Manual unblocking
- `getBlockedChains()` - List for UI

### Phase 3: Staged Queue Logic (Week 2)
**Update**: `taskQueue.sqlite.ts`

**New dequeue logic**:
```typescript
assignNextTask(): Task | null {
  return this.transaction(() => {
    // 1. Close completed chains
    this.chainTracker.closeCompletedChains();
    
    // 2. Count active chains
    const activeChains = this.chainTracker.countActiveChains();
    const canStartNewChain = activeChains < this.maxConcurrentChains;
    
    // 3. Select queue
    let task: Task;
    if (canStartNewChain) {
      task = this.dequeueImplementationTask();
      if (task) this.activateChain(task.chain_id);
    }
    
    if (!task) {
      task = this.dequeueFollowupTask(); // Skip blocked chains
    }
    
    if (!task) return null;
    
    // 4. Assign with file conflict check
    return this.assignTaskToWorker(task);
  });
}
```

### Phase 4: API Routes (Week 2)
**New endpoints**:
- `GET /api/queue/stats` - Queue depths + active chain count
- `GET /api/chains/blocked` - List blocked chains
- `POST /api/chains/:id/block` - Block a chain
- `POST /api/chains/:id/unblock` - Unblock a chain

### Phase 5: Frontend (Week 3)
**New components**:
- `QueueStatus.tsx` - Show queue depths, chain utilization
- `BlockedChains.tsx` - List blocked chains with unblock buttons

**UI Features**:
- Progress bar: X / 3 active chains
- Queue depths: Implementation (5) | Follow-up (12)
- Blocked chains alert: (2 chains need attention)
- Unblock button per chain

## Key Design Decisions

### Decision 1: Implementation Task Definition
**Rule**: `original_task_id IS NULL AND is_repair_bot IS NOT 1`

This makes a task "implementation" if it's:
- Not a follow-up to another task
- Not marked as a repair bot

### Decision 2: Chain ID Assignment
**Rule**: 
- Implementation tasks: `chain_id = id`
- Follow-up tasks: `chain_id = <inherit from original_task_id>`

This creates a tree structure where all follow-ups trace back to original implementation.

### Decision 3: Chain Closure
**Rule**: Chain closes when:
- `pr_status = 'merged'` AND
- No tasks with `status IN ('pending', 'assigned', 'active', 'retrying')`

This ensures chain doesn't close prematurely while work is still pending.

### Decision 4: Copilot Exemption
**Rule**: Exclude Copilot tasks from active chain counting

**Implementation**:
```sql
WHERE chain_status = 'active'
AND assigned_agent != 'copilot'
```

This respects master intent that Copilot delegation doesn't consume bot slots.

## Testing Strategy

### Unit Tests
- Chain counting accuracy
- Dequeue selection (implementation vs followup)
- Blocked chain exclusion
- Chain status transitions
- Edge cases (all blocked, empty queues)

### Integration Tests
- Multiple implementations queued → only 3 start
- Follow-ups continue while implementation blocked
- Chain closure frees slot
- Blocked chain doesn't consume slot

### Performance Tests
- Chain count query < 50ms p95
- Dequeue operation < 100ms p95
- Index scan < 10ms for 1000+ tasks

## Risks & Mitigation

### Risk 1: Migration Data Loss
**Mitigation**: Test on production copy, validation queries, reversible migration

### Risk 2: Performance Degradation
**Mitigation**: Indexes, benchmarks, caching if needed

### Risk 3: Race Conditions
**Mitigation**: Transactions, file conflict checks, concurrent worker tests

## Timeline

### Week 1: Foundation
- [ ] Write migration 012_staged_queue.sql
- [ ] Test backfill on dev database
- [ ] Implement ChainTrackerService
- [ ] Write unit tests

### Week 2: Queue Logic
- [ ] Update TaskQueueService.assignNextTask()
- [ ] Add API routes
- [ ] Write integration tests
- [ ] Verify concurrency limits work

### Week 3: UI & Polish
- [ ] Create QueueStatus component
- [ ] Create BlockedChains component
- [ ] End-to-end testing
- [ ] Performance benchmarks
- [ ] Documentation

## Success Criteria

- ✅ Never more than 3 concurrent implementation chains
- ✅ Follow-ups continue when implementation queue blocked
- ✅ 100% of follow-ups linked to correct chain_id
- ✅ Chain queries < 50ms p95
- ✅ UI updates < 5s lag
- ✅ Zero tasks lost during migration
- ✅ 95%+ test coverage

## Files to Create

### Backend
- `backend/migrations/012_staged_queue.sql`
- `backend/src/services/chainTracker.service.ts`
- `backend/src/services/__tests__/chainTracker.test.ts`
- `backend/src/services/__tests__/stagedQueue.test.ts`

### Frontend
- `frontend/src/components/QueueStatus.tsx`
- `frontend/src/components/BlockedChains.tsx`

### Tests
- `tests/integration/staged-queue-flow.test.ts`
- `tests/integration/chain-lifecycle.test.ts`
- `tests/performance/queue-benchmarks.test.ts`

## Files to Modify

### Backend
- `backend/src/services/taskQueue.sqlite.ts` - Add staged dequeue logic
- `backend/src/routes/tasks.routes.ts` - Add chain API endpoints
- `backend/src/types/taskSchema.ts` - Add new types

### Frontend
- `frontend/src/pages/Dashboard.tsx` - Add queue status display

## Next Actions

1. ✅ **DONE**: Analysis complete, plan documented
2. **TODO**: Review plan with architecture owners
3. **TODO**: Clarify Copilot delegation handling
4. **TODO**: Create feature branch `feature/staged-task-queue`
5. **TODO**: Start Phase 1 implementation

## Documentation

Full implementation details: `/docs/technicalDesigns/staged-task-queue-implementation-plan.md`

This includes:
- Complete code for all 5 phases
- Detailed testing strategy
- Open questions with recommendations
- Risk mitigation plans
- Week-by-week targets
