# Cleanup Scheduler Issues

## Problem

The app-monitor is scheduling duplicate cleanup tasks immediately on startup:

- 5 cleanup tasks created twice within milliseconds
- Tasks: linting, deduplication, documentation, testing, deepCleanup

## Root Causes

### 1. **lastRun Initialization (CRITICAL)**

```typescript
private schedules = {
  linting: { interval: 6 * 60 * 60 * 1000, lastRun: 0 },  // lastRun: 0
  deduplication: { interval: 12 * 60 * 60 * 1000, lastRun: 0 },
  documentation: { interval: 24 * 60 * 60 * 1000, lastRun: 0 },
  testing: { interval: 48 * 60 * 60 * 1000, lastRun: 0 },
  deepCleanup: { interval: 7 * 24 * 60 * 60 * 1000, lastRun: 0 }
};
```

**Problem:** `lastRun: 0` means "ran at epoch (1970)". On first check:

- Current time: ~1730000000000 (Oct 2024)
- lastRun: 0
- Elapsed: ~53 years worth of milliseconds
- Result: ALL tasks are immediately "due"

### 2. **Scheduler Runs Every Minute**

```typescript
this.cleanupInterval = setInterval(async () => {
  await this.checkCleanupSchedules();
}, 60000); // Check every minute
```

Combined with #1, this causes all 5 tasks to be scheduled every minute until they're marked as run.

### 3. **Duplicate Scheduling**

Looking at the timestamps:

- First batch: task-1-1761439554092 through task-5-1761439554092
- Second batch: task-1-1761439554121 through task-5-1761439554122

29-30ms apart - likely caused by:

- Multiple constructors being called
- Service restarting
- Or the interval firing twice before tasks are processed

## Why This is Bad

1. **Task Queue Spam**: Creates 5+ tasks every minute
2. **Resource Waste**: Each task consumes memory in queue
3. **Worker Overload**: Workers get swamped with cleanup tasks
4. **No Actual Cleanup**: Tasks likely aren't being executed, just queued

## Intervals

| Task Type     | Interval | Description           |
| ------------- | -------- | --------------------- |
| linting       | 6 hours  | Code style fixes      |
| deduplication | 12 hours | Remove duplicate code |
| documentation | 24 hours | Update docs           |
| testing       | 48 hours | Fix failing tests     |
| deepCleanup   | 7 days   | Deep codebase cleanup |

## Solutions

### Option 1: Initialize lastRun to Current Time (Recommended)

```typescript
private schedules = {
  linting: { interval: 6 * 60 * 60 * 1000, lastRun: Date.now() },
  deduplication: { interval: 12 * 60 * 60 * 1000, lastRun: Date.now() },
  documentation: { interval: 24 * 60 * 60 * 1000, lastRun: Date.now() },
  testing: { interval: 48 * 60 * 60 * 1000, lastRun: Date.now() },
  deepCleanup: { interval: 7 * 24 * 60 * 60 * 1000, lastRun: Date.now() }
};
```

**Result:** First cleanup tasks won't run until their actual interval has passed.

### Option 2: Persist lastRun State

Store lastRun times in TaskPersistence so they survive restarts.

### Option 3: Disable Automatic Scheduling (Simplest)

Comment out or remove the cleanup scheduler entirely:

```typescript
// this.startCleanupScheduler(); // Disabled - schedule manually
```

**Rationale:** Automatic cleanup might not be needed if:

- Linting runs on commit (git hooks)
- Docs are updated manually
- Tests run in CI/CD
- Cleanup is task-driven, not time-driven

### Option 4: Add Grace Period on Startup

```typescript
constructor() {
  // Don't run cleanups for first hour after startup
  Object.entries(this.schedules).forEach(([_, schedule]) => {
    schedule.lastRun = Date.now();
  });
}
```

## Recommendations

**Immediate (Pick One):**

1. **Disable cleanup scheduler** - Comment out `this.startCleanupScheduler()`
2. **Fix initialization** - Set `lastRun: Date.now()` for all schedules

**Long-term:**

1. **Make cleanup opt-in** - Don't auto-schedule, let users trigger via UI
2. **Persist state** - Save lastRun to TaskPersistence
3. **Add configuration** - Let users configure intervals or disable
4. **Add duplicate prevention** - Check if cleanup task already exists before creating

## Questions to Answer

1. **Do we need automatic cleanup?** - Or should it be manual/on-demand?
2. **What should happen on startup?** - Wait full interval or run immediately?
3. **Should cleanup tasks persist across restarts?** - Or reset?
4. **Are these intervals reasonable?** - 6 hours for linting seems frequent

## Impact

**Current behavior:**

- 5 tasks created immediately on startup
- 5 new tasks every minute thereafter
- Queue grows unbounded
- No cleanup actually happens (tasks just accumulate)

**After fix:**

- No tasks on startup (wait for interval)
- OR one set of tasks on startup only
- Tasks execute on schedule
- Queue stays manageable
