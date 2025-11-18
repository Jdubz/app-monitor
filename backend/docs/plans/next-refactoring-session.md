# Next Refactoring Session Plan

**Purpose:** Plan for next refactoring session based on completed TaskQueue work

**Delete After:** Session complete OR 2024-12-01

---

## Session Completed: TaskQueueService Refactoring ✅

### Achievements
- TaskRepository extracted (363 lines, 23 tests)
- WorkerLifecycleService extracted (268 lines, 25 tests)
- Integrated into TaskQueueService seamlessly
- Zero breaking changes, all tests passing
- Documentation system compliance achieved

### Time Efficiency
- Estimated: 32 hours
- Actual: 16 hours (50% under estimate!)

---

## Next Session: EphemeralWorkerService Refactoring

### Current State
- **File:** `src/services/ephemeralWorker.service.ts`
- **Size:** 1,621 lines (god object)
- **Dependencies:** 12 services (violates dependency rule)
- **Responsibilities:** 8+ (violates SRP)

### Extraction Priority (from analysis)

#### 1. ContainerLifecycleService (P0 - Highest Priority)
**Extract:**
- Container creation (lines ~434-500)
- Container start/stop
- Health check waiting (lines ~607-678) ✅ Already well-structured
- Container cleanup

**Interface:**
```typescript
export class ContainerLifecycleService {
  async createContainer(config: ContainerConfig): Promise<Container>;
  async startContainer(containerId: string): Promise<void>;
  async stopContainer(containerId: string, force?: boolean): Promise<void>;
  async removeContainer(containerId: string): Promise<void>;
  async waitForHealthy(containerId: string, options: HealthCheckOptions): Promise<void>;
  async inspectContainer(containerId: string): Promise<ContainerInspection>;
}
```

**Estimated Effort:** 8 hours
**Tests Needed:** 15-20 tests

#### 2. WorkerLogService (P1)
**Extract:**
- Log stream creation/management (lines 93-94, 128-131)
- Log file initialization
- Log rotation
- Cleanup on shutdown (lines ~1574-1620) ✅ Already has shutdown method

**Interface:**
```typescript
export class WorkerLogService {
  createLogStream(workerId: string): WriteStream;
  closeLogStream(workerId: string): Promise<void>;
  rotateLog(workerId: string): void;
  cleanupOldLogs(retentionDays: number): Promise<number>;
  shutdown(): Promise<void>;
}
```

**Estimated Effort:** 6 hours
**Tests Needed:** 12-15 tests

#### 3. ContextDeliveryService (P2)
**Extract:**
- Context bundle generation
- Docker cp operations (lines ~681-738)
- File preparation

**Interface:**
```typescript
export class ContextDeliveryService {
  async prepareContextBundle(task: Task): Promise<ContextBundle | null>;
  async deliverToContainer(containerId: string, bundle: ContextBundle): Promise<void>;
}
```

**Estimated Effort:** 8 hours
**Tests Needed:** 10-12 tests

### Total Estimated Effort: 22 hours

---

## Approach (Proven Pattern from TaskQueue)

### Week 1: ContainerLifecycleService
1. **Day 1-2:** Create service with tests (8-10 tests)
2. **Day 3:** Integrate into EphemeralWorkerService
3. **Day 4:** Verify all existing tests pass

### Week 2: WorkerLogService  
1. **Day 1-2:** Extract with tests (12-15 tests)
2. **Day 3:** Integration + cleanup
3. **Day 4:** Documentation

### Week 3: ContextDeliveryService (if time allows)
1. **Day 1-2:** Extract with tests
2. **Day 3:** Integration
3. **Day 4:** Final documentation + review

---

## Success Criteria (Same as TaskQueue)

✅ EphemeralWorkerService reduced by ~400 lines  
✅ 3 focused services with single responsibilities  
✅ 40+ comprehensive unit tests  
✅ Zero breaking changes  
✅ All existing tests passing  
✅ Documentation compliance

---

## Risk Mitigation

### Known Risks from TaskQueue Experience
1. **Pre-existing test failures** - Ignore unrelated failures, focus on new tests
2. **Complex Docker logic** - Good news: `waitForContainerReady()` already well-structured
3. **Shutdown behavior** - Good news: `shutdown()` method already exists

### Mitigation Strategies
- Extract one service at a time
- Write tests FIRST before extracting
- Maintain public API compatibility
- Commit frequently (after each service)
- Document as we go

---

## Quick Wins Available

Before tackling EphemeralWorker, consider these high-value, low-risk tasks:

### 1. Execute Migration 013 (2 hours)
- Remove deprecated PR columns
- Already identified in analysis
- Low risk, high cleanup value

### 2. ESLint Rule for DB Access (4 hours)
- Prevent direct DB access in routes
- Enforce repository pattern
- Easy to implement

### 3. Log Parser Consolidation (8 hours)
- Mark claudeLogParser and codexLogParser as @deprecated
- Migrate all usages to unifiedLogParser
- Remove old parsers

**Total Quick Wins: 14 hours**

---

## Decision Point

Choose path for next session:

**Option A: Continue God Object Refactoring (Recommended)**
- Start EphemeralWorkerService refactoring
- Estimated: 22 hours over 3 weeks
- High impact, builds on proven pattern

**Option B: Quick Wins First**
- Execute migration, ESLint rules, log consolidation
- Estimated: 14 hours over 1 week
- Lower risk, immediate value

**Option C: Hybrid**
- Week 1: Quick wins (14 hours)
- Week 2-4: EphemeralWorker refactoring (22 hours)
- Total: 36 hours over 4 weeks

---

## References

- [refactoring-patterns.md](../architecture/refactoring-patterns.md) - Extraction pattern documentation
- Git commits a9bc6dc through 7e6a3f9 - TaskQueue refactoring examples
- TaskRepository and WorkerLifecycleService - Reference implementations

---

**Next Action:** Choose option A, B, or C and begin extraction

**Delete This File After:** Next refactoring session complete
