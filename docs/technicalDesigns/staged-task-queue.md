# Staged Task Queue Design

## Document Metadata

| Field | Value |
|-------|-------|
| **Author** | Codex Agent (per architecture owner direction) |
| **Date** | November 12, 2025 |
| **Status** | 🔴 Not Started |
| **Priority** | P0 (Critical Path - Must Complete First) |
| **Dependencies** | None (Foundation for all other features) |
| **Last Updated** | November 12, 2025 |
| **Implementation Progress** | 0% (Design complete, implementation pending) |

## Quick Reference

**What**: Chain-aware task scheduling that separates implementation tasks (new chains) from follow-up tasks (REVIEW/FIX/etc), enforcing concurrency limits to prevent dev-bot pool saturation.

**Why**: Current FIFO queue allows multiple implementations to start simultaneously, creating too many parallel PRs and overwhelming the review pipeline. This violates the design intent of limiting concurrent chains.

**Current Status**: Design approved, awaiting implementation. Critical blocker for PR self-healing and error recovery features.

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Goals](#goals)
3. [High-Level Flow](#high-level-flow)
4. [Detailed Behavior](#detailed-behavior)
5. [Success Criteria](#success-criteria)
6. [Testing Strategy](#testing-strategy)
7. [Related Files](#related-files)

## Problem Statement
Implementation tasks currently enter the same FIFO queue as all follow-up work (reviews, fixes, recovery bots, delegated tasks). When multiple implementation tasks are enqueued simultaneously, they can all start executing, saturating the dev-bot pool and producing many parallel PRs, each requiring numerous follow-up tasks. This overwhelms the automated review pipeline and violates the design intent limiting concurrent implementation chains to the number of available bots.

## Goals
1. **Chain-Aware Scheduling:** Launch new implementation tasks only when there are fewer active chains than dev-bot slots (configurable, default 3).
2. **Staged Queues:** Separate work into two logical stages:
   - **Implementation queue:** original implementation tasks awaiting chain start.
   - **Follow-up queue:** REVIEW, FIX, RECOVERY, PR tasks, Copilot delegation handlers, etc., tied to existing chains.
3. **Fairness & Progress:** Ensure follow-up tasks continue advancing even when no new chains can start.
4. **Integration Simplicity:** Operate within the existing SQLite TaskQueueService and dev-bot orchestration without introducing external brokers.

## High-Level Flow
```
Implementation Queue (new chains) ─┐
                                   ├─> Queue Worker → Dev-Bots/Copilot
Follow-up Queue (chain tasks) ─────┘
```
1. Queue worker counts active chains.
2. If `activeChains < maxBots`, it dequeues an implementation task, marking a new chain active.
3. Otherwise, it dequeues the next follow-up task.

## Detailed Behavior
### Definitions
- **Chain ID:** The `id` of the implementation task; all follow-ups reference `original_task_id` = chain ID.
- **Active chain:** Chain with pending or running tasks whose PR is not yet merged/closed.
- **Blocked chain:** Chain flagged for human intervention (e.g., >4 automated reviews). Blocked chains do not count against the concurrency cap until unblocked.

### Queue Worker Logic
1. **Compute chain stats:**
   - Query SQLite for chains marked `active`.
   - Exclude blocked chains.
2. **Select task source:**
   - If `activeChains < maxBots`: dequeue oldest implementation task (`queue_stage=implementation`) and mark `chain_status=active`.
   - Else: dequeue oldest follow-up task (`queue_stage=followup`), skipping blocked chains.
3. **Assignment & bookkeeping:**
   - Assign to dev-bot or Copilot per AgentSelector.
   - Update worker heartbeat to bind the task.
   - Store chain transitions (`chain_stage`: implementation, review, fix, validation, merged).
4. **Chain completion:**
   - When PR merges and all follow-ups finish, mark chain `closed`, freeing a slot.

### Schema Changes
- Add `queue_stage` enum (`implementation`, `followup`).
- Track chains via either:
  - New `task_chains` table (`chain_id`, `status`, `current_stage`, timestamps), or
  - Extended columns on implementation tasks.
- Indexes for `queue_stage`, `chain_status`, `chain_id` to keep lookups efficient.

### API / Service Updates
- **Task creation:** Implementation tasks default to `queue_stage=implementation` and `chain_status=pending`. Follow-up tasks inherit `chain_id` and set `queue_stage=followup`.
- **DevBotsManager / TaskExecutionService:** Must respect staged dequeue rules and update chain state when tasks finish or block.
- **Dev-monitor UI:** Display implementation vs follow-up queue depth, active vs blocked chains, and provide controls to unblock or abort chains.

### Failure Handling
- **Hung tasks:** When detected, kill container, capture artifacts, enqueue REVIEW task in follow-up queue.
- **Blocked chains:** Excluded from active count. When unblocked they may temporarily cause `activeChains > maxBots`, but no new implementation tasks start until chains return within the cap.

## Open Questions
1. Should follow-up task ordering be purely FIFO, or should certain types (e.g., FIX vs REVIEW) have priority?
2. What throttle should apply to Copilot delegated tasks so they do not overwhelm review capacity?
3. Do we need a dedicated `task_chains` table for clarity, or can we extend the tasks table without impacting performance?
4. Migration strategy for existing tasks to set `queue_stage` and `chain_status` correctly.

## Success Criteria

### Phase 1: Schema & Data Model (⏳ Pending)
- ⏳ `queue_stage` enum added (implementation, followup)
- ⏳ `chain_status` field added (pending, active, blocked, closed)
- ⏳ `chain_id` tracking implemented
- ⏳ Database indexes created for efficient chain queries
- ⏳ Migration script written and tested

### Phase 2: Queue Worker Logic (⏳ Pending)
- ⏳ Active chain counting implemented
- ⏳ Staged dequeue logic (implementation vs followup)
- ⏳ Blocked chain exclusion from active count
- ⏳ Chain state transitions tracked
- ⏳ Concurrency cap enforcement (default 3 max chains)

### Phase 3: Service Integration (⏳ Pending)
- ⏳ DevBotsManager respects staged queue rules
- ⏳ Task creation sets correct queue_stage
- ⏳ Follow-up tasks inherit chain_id correctly
- ⏳ Chain closure on PR merge implemented
- ⏳ Hung task handling updates chain state

### Phase 4: Observability (⏳ Pending)
- ⏳ Dev-monitor displays queue depths (implementation vs followup)
- ⏳ Active chain count visible
- ⏳ Blocked chain list with unblock controls
- ⏳ Chain stage visualization
- ⏳ Metrics instrumentation for queue health

### Phase 5: Advanced Features (⏳ Pending)
- ⏳ Follow-up task prioritization (optional)
- ⏳ Copilot delegation throttling
- ⏳ Dynamic concurrency cap adjustment
- ⏳ Chain abort functionality

### Acceptance Criteria
1. **Concurrency Control**: Never more than 3 concurrent implementation chains active (configurable)
2. **Fairness**: Follow-up tasks continue executing even when implementation queue is blocked
3. **Correctness**: 100% of follow-up tasks correctly linked to parent chain_id
4. **Performance**: Chain state queries complete in < 50ms at 95th percentile
5. **Visibility**: Queue depths and chain states visible in dev-monitor with < 5 second lag
6. **Reliability**: 0 tasks lost during queue stage transitions

## Testing Strategy

### Unit Tests
- **Queue Worker Selection Logic**
  - Active chain counting accuracy
  - Dequeue selection (implementation vs followup)
  - Blocked chain exclusion
  - Concurrency cap enforcement
  - Edge cases (all chains blocked, empty queues)

- **Chain State Management**
  - State transitions (pending → active → closed)
  - Chain closure detection
  - Blocked flag handling
  - Chain ID inheritance

- **Schema Operations**
  - queue_stage enum validation
  - chain_status transitions
  - Index performance verification

### Integration Tests
- End-to-end queue flow
  - Multiple implementations enqueued → only maxBots start
  - Follow-up tasks execute while implementation queue blocked
  - Chain closure frees slot for next implementation
  - Blocked chain doesn't consume slot

- Chain lifecycle
  - Implementation → REVIEW → FIX → COMPLETE → PR merge → chain close
  - Chain blocking and unblocking
  - Hung task → REVIEW spawn with correct chain_id

- Migration testing
  - Existing tasks migrated correctly
  - Queue_stage set appropriately
  - No data loss during migration

### System Tests
- Load testing
  - 10+ implementations queued simultaneously
  - 50+ follow-up tasks across multiple chains
  - Chain state query performance under load
  - Concurrent chain limit enforcement

- Failure scenarios
  - Worker crash during dequeue
  - Database connection loss during chain query
  - Corrupted chain state recovery

- Production simulation
  - Realistic task mix (70% followup, 30% implementation)
  - Multiple chain completions and starts
  - Blocked chain accumulation and resolution

### Test Coverage Targets
- Queue worker logic: 95%+ coverage
- Chain state management: 90%+ coverage
- Schema operations: 85%+ coverage
- Integration tests: All critical paths covered

### Performance Benchmarks
- Chain count query: < 50ms p95
- Dequeue operation: < 100ms p95
- Chain state update: < 25ms p95
- Index scan efficiency: < 10ms for 1000+ tasks

## Related Files

### Implementation Files (Existing)
- `backend/src/services/taskQueue.sqlite.ts` - Task queue service (requires major refactor)
- `backend/src/services/devBotsManager.ts` - Dev-bot orchestration
- `backend/src/services/database.ts` - Database layer
- `backend/src/services/taskExecution.service.ts` - Task execution

### Implementation Files (To Be Created)
- `backend/src/services/stagedQueue.service.ts` - Staged queue logic
- `backend/src/services/chainTracker.service.ts` - Chain lifecycle management
- `backend/migrations/012_staged_queue.sql` - Database schema migration

### Test Files (To Be Created)
- `backend/src/services/__tests__/stagedQueue.test.ts` - Queue worker tests
- `backend/src/services/__tests__/chainTracker.test.ts` - Chain management tests
- `tests/integration/staged-queue-flow.test.ts` - End-to-end queue tests
- `tests/integration/chain-lifecycle.test.ts` - Chain lifecycle tests
- `tests/performance/queue-benchmarks.test.ts` - Performance tests

### Configuration Files
- `backend/.env` - MAX_CONCURRENT_CHAINS configuration
- `config/queue-rules.yaml` (to be created) - Queue behavior rules

### Frontend Files
- `frontend/src/components/QueueStatus.tsx` (to be created) - Queue depth display
- `frontend/src/components/ChainList.tsx` (to be created) - Active chains view

### Documentation Dependencies
- `docs/architecture/dev-bots-overview.md` - Dev-bot architecture
- `docs/plans/PRIORITIZED_FEATURE_ROADMAP.md` - Feature requirements

### Related Designs
- `docs/technicalDesigns/pr-self-healing-and-resilience.md` - Depends on staged queue
- `docs/technicalDesigns/error-detection-and-recovery-design.md` - Depends on chain tracking
- `docs/technicalDesigns/dev-bot-foundational-upgrades.md` - Parallel effort

## Next Steps
1. Review this design with architecture owners.
2. Finalize schema changes and write migrations.
3. Implement queue worker selection logic + dev-monitor instrumentation.
4. Extend automated tests to cover staged scheduling, blocked chain handling, and follow-up ordering.

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | 2025-11-12 | Claude Code | Added metadata, success criteria, testing strategy, related files |
| 1.0 | 2025-11-12 | Codex Agent | Initial design document |
