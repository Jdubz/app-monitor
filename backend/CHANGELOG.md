# Backend Changelog

## [Unreleased]

### Changed - 2025-11-06

#### Simplified Failure Recovery System (Major Refactor)
- **Replaced complex recovery orchestrator (950 lines) with simplified system (257 lines) - 73% code reduction**
- Repair bots are now regular tasks with metadata, not special constructs
- Event-driven architecture replaces polling-based `waitForTaskCompletion`
- Two-stage recovery process maintained: cleanup → followup
- Multiple concurrent repairs supported for different tasks
- Serial execution guaranteed per task (cleanup must complete before followup)

**Technical Changes:**
- `backend/src/services/failureRecovery.ts`: Complete rewrite as `SimpleFailureRecovery`
  - Removed: State machine, polling loops, SafetyAnalyzer (200+ lines)
  - Added: Simple locking via `hasActiveRepair()`, event-driven followup creation
  - Methods: 7 (down from 30+)

- `backend/src/services/devBotsManager.ts`: Integration updates
  - Added `metadata` field to Task interface (line 329-337)
  - Updated `addTask()` to accept priority and metadata parameters
  - Added followup creation hook in task completion handler (line 1911-1914)
  - Simplified recovery call in failure handler (line 1978-1984)

- `backend/src/services/taskQueue.sqlite.ts`: Documentation updates
  - Marked `recovery_attempts` and `recovery_safety_checks` tables as unused (line 1177-1181)
  - Tables preserved for backwards compatibility but no longer referenced
  - 4 complex methods removed (150+ lines): `getRecoveryAttempt`, `createRecoveryAttempt`, etc.

- `backend/src/utils/logger.ts`: Added 'recovery' log category (line 48)

**Metadata Structure:**
```typescript
metadata: {
  isRepairBot?: boolean;
  repairStage?: 'cleanup' | 'followup';
  originalTaskId?: string;
  cleanupTaskId?: string;
  originalFailurePattern?: string;
  countsTowardsConcurrencyLimit?: boolean;
}
```

**Benefits:**
- Leverages existing task queue infrastructure (priority, concurrency limits)
- No special treatment for repair bots - they're just tasks
- Event-driven followup creation (no 5-second polling loops)
- Simpler to understand, maintain, and debug
- Clean type safety with proper TypeScript integration

**Files Changed:**
- `backend/src/services/failureRecovery.ts` (-693 lines)
- `backend/src/services/devBotsManager.ts` (+39 lines)
- `backend/src/services/taskQueue.sqlite.ts` (-155 functional lines, added documentation)
- `backend/src/services/processManager.ts` (-19 lines cleanup)
- `backend/src/utils/logger.ts` (+1 line)
- `backend/docs/FAILURE_RECOVERY_SYSTEM.md` (new documentation)

**Migration Notes:**
- No database migration required - schema already supports metadata fields
- Old recovery tables (`recovery_attempts`, `recovery_safety_checks`) remain but unused
- Configuration unchanged: `ENABLE_AUTO_RECOVERY` and `RECOVERY_DRY_RUN` still control behavior
- Recoverable error categories unchanged: cli_incompatibility, missing_resource, syntax_error, import_error, config_error

**Testing:**
- All recovery-related type errors fixed
- Integration verified with existing task queue
- Edge cases handled: cleanup failure, missing original task, active repairs
- Backwards compatibility maintained

See `backend/docs/FAILURE_RECOVERY_SYSTEM.md` for complete documentation.

### Added - 2025-11-08

- Added a Unicode-aware `toTitleCase` helper in `src/utils/stringUtils.ts`, plus regression tests that cover accented characters and emoji separators so future string formatting stays consistent.

---

## Previous Entries

(Add previous changelog entries below this line)
