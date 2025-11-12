# Staged Queue Testing TODO

## Phase 3 Complete - Testing Required

### ✅ Completed Implementation
- [x] Phase 1: Schema + ChainTrackerService
- [x] Phase 2: Queue worker logic (assignNextTask, createTask)
- [x] Phase 3: API routes + UI components

### 📋 Testing TODO

#### Backend Unit Tests

**1. ChainTrackerService Tests** (`backend/src/services/__tests__/chainTracker.test.ts`)
```typescript
describe('ChainTrackerService', () => {
  // Count operations
  test('countActiveChains excludes blocked chains');
  test('countActiveChains excludes Copilot tasks');
  test('countBlockedChains returns correct count');
  test('getQueueDepths returns implementation and followup counts');
  
  // Chain lifecycle
  test('closeCompletedChains marks chains closed when PR merged + no pending tasks');
  test('closeCompletedChains does not close chains with pending tasks');
  test('closeCompletedChains does not close chains without merged PR');
  
  // Blocking operations
  test('blockChain sets chain_status to blocked');
  test('blockChain records reason, timestamp, and blocked_by');
  test('unblockChain sets chain_status to active');
  test('unblockChain clears blocked metadata');
  test('getBlockedChains returns all blocked chains with details');
  
  // Statistics
  test('getChainStats returns complete statistics');
  test('getChainStats includes maxConcurrentChains from config');
});
```

**2. TaskQueueService Staged Queue Tests** (`backend/src/services/__tests__/stagedQueue.test.ts`)
```typescript
describe('TaskQueueService Staged Queue', () => {
  // assignNextTask logic
  test('assignNextTask closes completed chains before dequeue');
  test('assignNextTask dequeues implementation when under capacity');
  test('assignNextTask marks new chains as active');
  test('assignNextTask dequeues followup when at capacity');
  test('assignNextTask skips blocked chains in followup queue');
  test('assignNextTask returns null when both queues empty');
  test('assignNextTask respects file conflicts');
  
  // createTask queue stage assignment
  test('createTask sets queue_stage=implementation for new tasks');
  test('createTask sets queue_stage=followup for tasks with original_task_id');
  test('createTask sets queue_stage=followup for repair bots');
  test('createTask sets chain_id=id for implementation tasks');
  test('createTask inherits chain_id for followup tasks');
  test('createTask sets chain_status=pending for new tasks');
  
  // Chain management API
  test('getChainStats returns current statistics');
  test('blockChain updates chain_status to blocked');
  test('unblockChain updates chain_status to active');
  test('getBlockedChains returns array of blocked chains');
});
```

#### Integration Tests

**3. Chain Concurrency Flow** (`tests/integration/staged-queue-flow.test.ts`)
```typescript
describe('Staged Queue Integration', () => {
  test('enforces maxConcurrentChains limit', async () => {
    // Given: maxWorkers=3
    // When: 5 implementation tasks queued
    // Then: Only 3 chains start, 2 wait
  });
  
  test('followups continue when implementation queue blocked', async () => {
    // Given: 3 active chains (at capacity)
    // When: Followup task queued
    // Then: Followup task executes immediately
  });
  
  test('chain closes when PR merged and tasks complete', async () => {
    // Given: Active chain with merged PR
    // When: All tasks complete
    // Then: Chain status becomes 'closed'
    // And: Slot freed for next implementation
  });
  
  test('blocked chains do not consume capacity', async () => {
    // Given: 2 active chains, 1 blocked
    // When: New implementation task queued
    // Then: Task can start (not blocked by 'blocked' chain)
  });
  
  test('unblocking chain resumes task processing', async () => {
    // Given: Blocked chain with pending followup tasks
    // When: Chain is unblocked
    // Then: Followup tasks can be dequeued
  });
});
```

**4. API Routes Integration** (`backend/src/routes/__tests__/dev-bots.chain-api.test.ts`)
```typescript
describe('Chain Management API', () => {
  describe('GET /api/dev-bots/queue/stats', () => {
    test('returns chain statistics');
    test('includes active chains count');
    test('includes queue depths');
    test('returns 500 on error');
  });
  
  describe('GET /api/dev-bots/chains/blocked', () => {
    test('returns empty array when no blocked chains');
    test('returns array of blocked chains with details');
    test('includes chain_id, reason, timestamp, task count');
  });
  
  describe('POST /api/dev-bots/chains/:chainId/unblock', () => {
    test('unblocks chain successfully');
    test('returns 400 when unblockedBy missing');
    test('logs unblock action');
    test('returns 500 on error');
  });
});
```

#### Frontend Component Tests

**5. ChainStatusPanel Tests** (`frontend/src/components/dev-bots/queue/ChainStatusPanel.test.tsx`)
```typescript
describe('ChainStatusPanel', () => {
  // Rendering
  test('displays chain utilization progress bar');
  test('displays implementation queue depth');
  test('displays followup queue depth');
  test('shows warning when chains blocked');
  test('renders blocked chains list when present');
  
  // Data fetching
  test('fetches stats on mount');
  test('fetches blocked chains on mount');
  test('polls stats every 5 seconds');
  test('handles fetch errors gracefully');
  
  // User interactions
  test('refresh button refetches data');
  test('unblock button opens confirmation dialog');
  test('confirmation dialog shows chain details');
  test('cancel closes confirmation dialog');
  test('confirm calls unblock API');
  test('unblock success refreshes data');
  test('unblock failure shows error');
  
  // Edge cases
  test('handles empty blocked chains list');
  test('handles missing stats gracefully');
  test('disables unblock button during operation');
});
```

#### Performance Tests

**6. Query Performance** (`tests/performance/queue-benchmarks.test.ts`)
```typescript
describe('Queue Performance', () => {
  test('countActiveChains query < 50ms p95');
  test('getQueueDepths query < 30ms p95');
  test('assignNextTask < 100ms p95');
  test('closeCompletedChains < 100ms p95');
  test('handles 1000+ tasks in queue');
  test('handles 100+ chains');
});
```

### 📊 Coverage Goals

- ChainTrackerService: 95%+ coverage
- TaskQueueService staged methods: 90%+ coverage
- API routes: 85%+ coverage
- Frontend components: 80%+ coverage

### 🎯 Success Criteria

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Performance benchmarks meet targets
- [ ] No regressions in existing tests
- [ ] TypeScript compiles with no errors
- [ ] Frontend renders without console errors

### 📝 Notes

**Test Data Setup:**
- Create test helper to seed database with chains
- Mock `config.devBots.maxWorkers` for testing
- Use in-memory SQLite for unit tests
- Use test database for integration tests

**Mock Scenarios:**
1. Empty queue (no tasks)
2. Under capacity (2/3 chains active)
3. At capacity (3/3 chains active)
4. Over capacity (5 impl tasks, 3 slots)
5. Mixed queue (impl + followup tasks)
6. Blocked chains present
7. Chains closing (PR merged)

**Edge Cases to Test:**
- Copilot task exclusion from chain counting
- Chain depth limits (max 4 reviews)
- Concurrent task assignment (race conditions)
- File conflict resolution
- Chain inheritance for follow-up tasks
- Chain closure timing (PR merge + task completion)

### ⏰ Estimated Time

- Backend unit tests: 4-6 hours
- Integration tests: 3-4 hours
- Frontend tests: 2-3 hours
- Performance tests: 1-2 hours
- Bug fixes + polish: 2-3 hours

**Total: 12-18 hours**

### 🚀 Next Steps

1. Create test helper utilities
2. Write ChainTrackerService unit tests
3. Write TaskQueueService staged queue tests
4. Write integration tests
5. Write API route tests
6. Write frontend component tests
7. Run performance benchmarks
8. Fix any failing tests
9. Review coverage reports
10. Document test scenarios

---

**Priority:** Medium (tests should be added before production deployment)
**Dependencies:** Phase 1, 2, 3 implementations complete
**Assigned:** TBD
