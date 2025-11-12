# TaskQueue Metrics Extraction Plan

**Date**: 2025-11-12
**Status**: In Progress
**Priority**: P1 - High Value Refactoring

---

## Problem Statement

The `taskQueue.sqlite.ts` file has grown to 2,151 lines, mixing:
- Core queue operations (enqueue, dequeue, assign)
- Task lifecycle management (complete, fail, timeout)
- Database schema and migrations
- **Metrics and analytics** (duration stats, agent comparison, queue metrics)
- Recovery and repair operations
- PR tracking integration

The metrics code (~150-200 lines) can be extracted to improve:
- **Separation of concerns** - metrics vs core queue operations
- **Testability** - easier to test metrics in isolation
- **Maintainability** - clearer boundaries between responsibilities

---

## Proposed Solution

Extract metrics into a dedicated `TaskQueueMetricsService`:

```
backend/src/services/
├── taskQueue.sqlite.ts          # Core queue operations (1,950 lines)
└── taskQueueMetrics.service.ts  # Metrics and analytics (~200 lines)
```

---

## Metrics Code to Extract

### 1. Agent Comparison Metrics (~120 lines)

**Function**: `summarizeAgentComparisonMetrics()` (lines 80-132)
- Pure function, no dependencies
- Processes agent stats into comparison format

**Method**: `getAgentComparisonMetrics()` (lines 1758-1796)
- Queries database for agent performance data
- Compares Claude vs Codex performance
- Breaks down by task type

**Types** (lines 41-73):
- `AgentStatsRow`
- `AgentTaskTypeStatsRow`
- `TaskTypeKey`
- `AgentTaskTypeBreakdown`
- `AgentMetrics`
- `AgentComparisonMetrics`

### 2. Task Duration Statistics (~35 lines)

**Method**: `getTaskDurationStats()` (lines 1611-1645)
- Queries task execution durations
- Groups by type and complexity
- Returns avg/min/max duration stats

### 3. Queue Metrics (~50 lines)

**Method**: `getQueueMetrics()` (lines 1650-1699)
- Counts tasks by status
- Calculates average completion time
- Finds oldest pending task age
- Returns comprehensive queue metrics

**Type**: `QueueMetrics` (lines 246-258)
- Already defined interface

---

## Implementation Plan

### Phase 1: Create Metrics Service (30 min)

1. Create `backend/src/services/taskQueueMetrics.service.ts`
2. Extract types:
   - `AgentStatsRow`
   - `AgentTaskTypeStatsRow`
   - `TaskTypeKey`
   - `AgentTaskTypeBreakdown`
   - `AgentMetrics`
   - `AgentComparisonMetrics`
3. Extract standalone function:
   - `summarizeAgentComparisonMetrics()`
4. Create `TaskQueueMetricsService` class with:
   - Constructor accepting Database instance
   - Three public methods:
     - `getTaskDurationStats()`
     - `getQueueMetrics()`
     - `getAgentComparisonMetrics()`

### Phase 2: Update TaskQueueService (15 min)

1. Remove extracted types and functions
2. Import `TaskQueueMetricsService`
3. Instantiate metrics service in constructor
4. Delegate metrics methods to metrics service:
   ```typescript
   getTaskDurationStats(daysBack?: number) {
     return this.metricsService.getTaskDurationStats(daysBack);
   }
   ```
5. Keep existing method signatures for backward compatibility

### Phase 3: Update Consumers (15 min)

1. Find all files importing metrics types from taskQueue.sqlite.ts
2. Update imports to use taskQueueMetrics.service.ts
3. Verify no direct usage of extracted methods

### Phase 4: Testing & Verification (20 min)

1. Run TypeScript compilation
2. Run all 936 backend tests
3. Verify metrics endpoints still work
4. Check devBotsManager integration

### Phase 5: Cleanup & Documentation (10 min)

1. Update file header comments
2. Document new separation of concerns
3. Commit changes with clear message

---

## File Structure

### taskQueueMetrics.service.ts (~200 lines)

```typescript
/**
 * Task Queue Metrics Service
 *
 * Provides analytics and performance metrics for the task queue:
 * - Task duration statistics by type/complexity
 * - Queue health metrics (pending, running, completion times)
 * - Agent performance comparison (Claude vs Codex)
 */

import Database from 'better-sqlite3';

// Types
export type AgentStatsRow = { ... };
export type AgentTaskTypeStatsRow = { ... };
export type TaskTypeKey = 'implementation' | 'testing' | 'documentation';
export type AgentTaskTypeBreakdown = Record<TaskTypeKey, AgentMetrics>;
export type AgentMetrics = { ... };
export type AgentComparisonMetrics = { ... };

// Standalone utility
export function summarizeAgentComparisonMetrics(...): AgentComparisonMetrics {
  // Pure function logic
}

export class TaskQueueMetricsService {
  constructor(private db: Database.Database) {}

  getTaskDurationStats(daysBack: number = 30): Array<...> {
    // Query execution durations
  }

  getQueueMetrics(): QueueMetrics {
    // Query queue status counts
  }

  getAgentComparisonMetrics(): AgentComparisonMetrics {
    // Query agent performance
  }
}
```

### taskQueue.sqlite.ts (updated, ~1,950 lines)

```typescript
import { TaskQueueMetricsService } from './taskQueueMetrics.service.js';

export class TaskQueueService {
  private metricsService: TaskQueueMetricsService;

  constructor(dbPath: string) {
    // ... existing initialization
    this.metricsService = new TaskQueueMetricsService(this.db);
  }

  // Delegate to metrics service (backward compatible)
  getTaskDurationStats(daysBack?: number) {
    return this.metricsService.getTaskDurationStats(daysBack);
  }

  getQueueMetrics() {
    return this.metricsService.getQueueMetrics();
  }

  getAgentComparisonMetrics() {
    return this.metricsService.getAgentComparisonMetrics();
  }
}
```

---

## Testing Strategy

1. **Unit Tests**: Existing taskQueue tests should continue passing
2. **Integration Tests**: Metrics endpoints in dev-bots routes should work
3. **Type Safety**: No TypeScript errors after extraction

---

## Risks & Mitigation

### Risk 1: Breaking Type Imports
**Mitigation**: Re-export types from taskQueue.sqlite.ts for backward compatibility

### Risk 2: Database Access Patterns
**Mitigation**: Metrics service receives same database instance, no changes to queries

### Risk 3: Performance Impact
**Mitigation**: No performance change - same queries, just different file location

---

## Success Criteria

✅ taskQueue.sqlite.ts reduced from 2,151 to ~1,950 lines (9% reduction)
✅ Metrics code organized in dedicated service (~200 lines)
✅ All 936 backend tests passing
✅ TypeScript compilation clean
✅ No regressions in functionality
✅ Clear separation between queue operations and metrics

---

## Benefits

1. **Better Organization**: Metrics separated from queue operations
2. **Easier Testing**: Can test metrics in isolation
3. **Clearer Responsibilities**: Single Responsibility Principle
4. **Maintainability**: Easier to locate and modify metrics code
5. **Foundation**: Sets pattern for future extractions (recovery, PR tracking)

---

## Estimated Time

**Total**: ~90 minutes (1.5 hours)
- Phase 1: 30 min
- Phase 2: 15 min
- Phase 3: 15 min
- Phase 4: 20 min
- Phase 5: 10 min

---

## Next Steps After Completion

After metrics extraction, consider:
1. Extract recovery/repair operations into `TaskQueueRecoveryService`
2. Extract PR tracking into `TaskQueuePRService`
3. Further modularize prConditionState.service.ts (1,922 lines)
