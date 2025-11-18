# TaskQueue Refactoring Pattern

**Purpose:** Document the architectural pattern for extracting services from god objects, using TaskQueueService as the reference implementation.

---

## Pattern Overview

This document describes how to refactor a "god object" by extracting specialized concerns into focused services following the Single Responsibility Principle.

### When to Apply

- Service exceeds 1,500 lines
- Service has 5+ distinct responsibilities
- Testing requires complex setup
- Changes frequently cause unrelated test failures

### Core Principle

Extract **one responsibility at a time** into a dedicated service, integrate it, test thoroughly, then move to the next extraction.

---

## Architecture Pattern

### Before: God Object Anti-pattern

```
LargeService (2,000+ lines)
├── Database operations (embedded)
├── Worker lifecycle (embedded)
├── Business logic A (embedded)
├── Business logic B (embedded)
└── Utilities (embedded)

Problems:
- Multiple responsibilities
- Hard to test in isolation
- Changes cascade unexpectedly
- Tight coupling
```

### After: Service Orchestration

```
LargeService (smaller, focused)
├── RepositoryService (data access)
├── LifecycleService (state management)
├── BusinessServiceA (delegated)
├── BusinessServiceB (delegated)
└── Core orchestration logic

Benefits:
- Single Responsibility Principle
- Each service independently testable
- Clear boundaries
- Loose coupling via dependency injection
```

---

## Extraction Steps

### 1. Identify Responsibility Boundaries

Look for cohesive groups of methods that:
- Operate on the same data
- Have related names (e.g., all start with `worker*`)
- Could function independently
- Have clear inputs/outputs

**TaskQueue Example:**
- All database CRUD → TaskRepository
- All worker management → WorkerLifecycleService

### 2. Create Service Interface

Define the service contract before implementation:

```typescript
export interface WorkerMetrics {
  total: number;
  running: number;
  stopped: number;
  stalled: number;
}

export class WorkerLifecycleService {
  constructor(private db: Database.Database) {}
  
  registerWorker(id: string, agentId: string, taskId: string): Worker;
  updateHeartbeat(workerId: string): void;
  detectStalledWorkers(): StalledWorker[];
  handleStalledWorkers(): StalledWorker[];
  stopWorker(workerId: string): void;
  getMetrics(): WorkerMetrics;
}
```

### 3. Extract with Tests First

**Critical:** Write tests for the extracted service BEFORE extracting:

```typescript
describe('WorkerLifecycleService', () => {
  let db: Database.Database;
  let service: WorkerLifecycleService;
  
  beforeEach(() => {
    db = new Database(':memory:');
    // Create schema
    service = new WorkerLifecycleService(db);
  });
  
  it('should register a worker', () => {
    const worker = service.registerWorker('w1', 'claude', 't1');
    expect(worker.id).toBe('w1');
  });
});
```

### 4. Integrate via Dependency Injection

Add the service as a private dependency:

```typescript
export class TaskQueueService {
  private readonly workerLifecycle: WorkerLifecycleService;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.workerLifecycle = new WorkerLifecycleService(this.db);
  }
  
  // Delegate to service
  updateWorkerHeartbeat(workerId: string): void {
    this.workerLifecycle.updateHeartbeat(workerId);
  }
}
```

### 5. Replace Direct Calls

Find all places where the old embedded code was called:

```typescript
// Before
const stmt = this.db.prepare('UPDATE workers SET last_heartbeat = ? WHERE id = ?');
stmt.run(Date.now(), workerId);

// After
this.workerLifecycle.updateHeartbeat(workerId);
```

### 6. Verify No Breaking Changes

- Run all existing tests
- Verify public API unchanged
- Check integration tests pass
- No performance regression

---

## TaskQueue Reference Implementation

### Extracted Services

#### 1. TaskRepository (363 lines)

**Responsibility:** All database CRUD operations

**Interface:**
```typescript
export class TaskRepository {
  constructor(private db: Database.Database);
  
  create(taskData: Partial<Task>): Task;
  findById(id: string): Task | null;
  findAll(filters?: TaskFilters): Task[];
  update(id: string, updates: TaskUpdate): Task | null;
  delete(id: string): boolean;
  getExecutions(taskId: string): TaskExecution[];
  transaction<T>(fn: () => T): T;
}
```

**Usage:**
```typescript
const repository = new TaskRepository(db);
const task = repository.create({ title: 'Fix bug', priority: 8 });
const pending = repository.findAll({ status: 'pending' });
```

#### 2. WorkerLifecycleService (268 lines)

**Responsibility:** Worker registration, heartbeats, stalled detection

**Interface:**
```typescript
export class WorkerLifecycleService {
  constructor(private db: Database.Database);
  
  registerWorker(id: string, agentId: string, taskId: string): Worker;
  updateHeartbeat(workerId: string): void;
  detectStalledWorkers(): StalledWorker[];
  handleStalledWorkers(): StalledWorker[];
  stopWorker(workerId: string): void;
  getMetrics(): WorkerMetrics;
}
```

**Usage:**
```typescript
const lifecycle = new WorkerLifecycleService(db);
lifecycle.registerWorker('worker-1', 'claude', 'task-123');
lifecycle.updateHeartbeat('worker-1');
const stalled = lifecycle.handleStalledWorkers();
```

---

## Integration Patterns

### Pattern 1: Full Delegation

Original service becomes a thin wrapper:

```typescript
// TaskQueueService delegates completely
updateWorkerHeartbeat(workerId: string): void {
  this.workerLifecycle.updateHeartbeat(workerId);
}
```

### Pattern 2: Orchestration

Original service coordinates multiple services:

```typescript
detectStalledWorkers(): string[] {
  return this.transaction(() => {
    // Delegate detection to service
    const stalledWorkers = this.workerLifecycle.handleStalledWorkers();
    
    // But handle task failures here (queue responsibility)
    for (const worker of stalledWorkers) {
      if (worker.task_id) {
        this.failTask(worker.task_id, 'Worker stalled');
      }
    }
    
    return stalledWorkers.map(w => w.id);
  });
}
```

### Pattern 3: Shared Transaction

Both services operate within same transaction:

```typescript
assignTask(taskId: string): void {
  this.transaction(() => {
    // Update task
    this.taskRepository.update(taskId, { status: 'running' });
    
    // Register worker
    const workerId = `worker-${Date.now()}`;
    this.workerLifecycle.registerWorker(workerId, 'claude', taskId);
  });
}
```

---

## Testing Strategy

### Unit Tests (Extracted Service)

Test service in isolation with minimal setup:

```typescript
// Fast, focused tests
describe('TaskRepository', () => {
  it('should create task', () => {
    const repo = new TaskRepository(inMemoryDb);
    const task = repo.create({ title: 'Test' });
    expect(task.id).toBeDefined();
  });
});
```

### Integration Tests (Original Service)

Test delegation and coordination:

```typescript
// Tests that services work together
describe('TaskQueueService Integration', () => {
  it('should fail task when worker stalls', () => {
    const queue = new TaskQueueService(dbPath);
    // ... test coordination logic
  });
});
```

---

## Common Pitfalls

### ❌ Don't: Extract Too Much at Once

```typescript
// Bad: Extract 5 services in one PR
- TaskRepository
- WorkerService  
- MetricsService
- ChainService
- PhaseService
```

**Why:** Hard to review, test, and debug. If something breaks, can't isolate the cause.

**Do:** Extract one service, integrate, test, commit. Repeat.

### ❌ Don't: Change Behavior During Extraction

```typescript
// Bad: "Improving" logic while extracting
updateHeartbeat(workerId: string): void {
  // New: Add validation
  if (!workerId) throw new Error('Invalid worker');
  
  this.db.prepare('UPDATE workers...').run(Date.now(), workerId);
}
```

**Why:** Mixing refactoring with behavior changes makes bugs hard to track.

**Do:** Extract first (pure refactoring), then improve behavior in separate PR.

### ❌ Don't: Skip Tests

```typescript
// Bad: "I'll add tests later"
export class NewService {
  // No tests written
}
```

**Why:** Without tests, you can't verify extraction didn't break anything.

**Do:** Write tests BEFORE extracting. Tests are the safety net.

---

## Migration Guide

### For Adding Features

**Question:** Where should new code go?

**Decision Tree:**
1. Is it data access? → `TaskRepository`
2. Is it worker management? → `WorkerLifecycleService`
3. Is it chain tracking? → `ChainTrackerService`
4. Is it metrics? → `TaskQueueMetricsService`
5. Is it queue logic? → `TaskQueueService`

### For Refactoring Other Services

Apply this pattern to any service with:
- 1,500+ lines
- 5+ responsibilities
- Complex test setup
- Frequent unrelated failures

**Next Candidates:**
- EphemeralWorkerService (1,471 lines)
- PRMonitorService (if > 1,500 lines)

---

## Key Principles

1. **One Responsibility Per Service** - Each service should have a single, well-defined purpose

2. **Dependency Injection** - Services receive dependencies via constructor, not global access

3. **Test First** - Write tests for extracted service before extracting

4. **Incremental** - Extract one service at a time, integrate, validate, repeat

5. **No Breaking Changes** - Public API remains stable throughout refactoring

6. **Transaction Support** - Extracted services support transactions for atomic operations

---

## Success Criteria

A successful extraction achieves:

✅ Original service smaller and more focused  
✅ Extracted service has single responsibility  
✅ Both services have comprehensive tests  
✅ Public API unchanged (backward compatible)  
✅ All tests passing  
✅ No performance regression  
✅ Clear documentation of responsibilities

---

## References

- [Single Responsibility Principle](https://en.wikipedia.org/wiki/Single-responsibility_principle)
- [Dependency Injection](https://en.wikipedia.org/wiki/Dependency_injection)
- [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)

---

**Last Updated:** 2024-11-18  
**Pattern Source:** TaskQueueService refactoring (Task #5)
