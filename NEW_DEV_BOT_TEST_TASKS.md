# Dev-Bot Test Tasks - November 2025

**Status**: Ready for Testing
**Prerequisites**: Dev-bot credentials fix applied and verified
**Strategy**: Start with atomic tasks, progress to medium complexity

---

## Phase 1: Atomic Tasks (Start Here)

### Task 1: Work-Target SQLite Schema Design (WT-1)

**Title**: Design work-target SQLite schema migration
**Type**: enhancement
**Priority**: high
**Complexity**: Simple (1 file, ~50 lines)
**Estimated Time**: 30-45 minutes

**Description**:
Create a new SQLite migration file `backend/migrations/005_work_targets.sql` that defines the `work_targets` table schema. The table should store work-target configuration currently in JSON files.

**Acceptance Criteria**:
1. File created at `backend/migrations/005_work_targets.sql`
2. Table includes these columns:
   - `id` TEXT PRIMARY KEY
   - `name` TEXT NOT NULL
   - `type` TEXT NOT NULL (e.g., 'backend', 'frontend', 'worker')
   - `repo_path` TEXT NOT NULL
   - `services` TEXT (JSON array of service names)
   - `log_sources` TEXT (JSON array of log source configs)
   - `env_vars` TEXT (JSON object of environment variables)
   - `created_at` TEXT NOT NULL
   - `updated_at` TEXT NOT NULL
3. Migration uses `IF NOT EXISTS` for idempotency
4. Schema matches patterns in existing migrations (001-004)

**Files**:
- Create: `backend/migrations/005_work_targets.sql`
- Reference: `backend/migrations/001_initial_schema.sql` (for pattern)
- Reference: `backend/config/work-targets/app-monitor.json` (for data structure)

**Why This Task**:
- Single file creation
- Well-defined schema requirements
- No external dependencies
- Good test of basic file creation and SQL writing

---

### Task 2: Update README with Stabilization Status (DOC-1)

**Title**: Update README with current stabilization status
**Type**: documentation
**Priority**: medium
**Complexity**: Simple (2 files, ~20 lines changed)
**Estimated Time**: 20-30 minutes

**Description**:
Update `README.md` and `CONTRIBUTING.md` to reflect recent stabilization progress: FE-1 and FE-2 completion, dev-bot credentials fix, and link to current stabilization plan.

**Acceptance Criteria**:
1. README.md updated with:
   - Current build status (frontend builds successfully)
   - Link to `docs/plans/APP_MONITOR_STABILIZATION_PLAN.md`
   - Note about dev-bot testing in progress
2. CONTRIBUTING.md updated with:
   - Current test runner usage (`npm run test` not `npm run test:backend`)
   - Reference to dev-bot credentials fix documentation
   - Link to stabilization checklist
3. Both files maintain existing tone and structure
4. Markdown formatting is valid

**Files**:
- Edit: `README.md`
- Edit: `CONTRIBUTING.md`
- Reference: `docs/sessions/DEV_BOT_CREDENTIALS_FIX_2025-11-06.md`

**Why This Task**:
- Low risk (documentation only)
- Tests file editing capabilities
- Multiple file coordination
- Good test of following existing patterns

---

### Task 3: Create Stabilization Checklist (DOC-2)

**Title**: Create stabilization progress checklist document
**Type**: documentation
**Priority**: low
**Complexity**: Simple (1 file, ~60 lines)
**Estimated Time**: 30-40 minutes

**Description**:
Create a new file `docs/dev-monitor/STABILIZATION_CHECKLIST.md` that provides a high-level, checkable overview of stabilization progress with links to detailed plans.

**Acceptance Criteria**:
1. File created at `docs/dev-monitor/STABILIZATION_CHECKLIST.md`
2. Contains sections for each workstream (Frontend Health, Backend Health, etc.)
3. Each completed task marked with ✅
4. Each pending task has:
   - Link to relevant plan document
   - Brief one-line description
   - Priority indicator
5. Follows markdown checklist format (`- [ ]` for pending, `- [x]` for done)
6. Includes date last updated

**Files**:
- Create: `docs/dev-monitor/STABILIZATION_CHECKLIST.md`
- Reference: `docs/plans/APP_MONITOR_STABILIZATION_PLAN.md`

**Why This Task**:
- Single file creation
- Straightforward content extraction and formatting
- Tests ability to synthesize information from source
- Low complexity, clear success criteria

---

## Phase 2: Small Tasks (After Phase 1 Success)

### Task 4: Backend Test Diagnosis (BE-1 Investigation)

**Title**: Diagnose which ProcessManager integration test hangs
**Type**: investigation
**Priority**: high
**Complexity**: Small (investigation + documentation)
**Estimated Time**: 1 hour

**Description**:
Run backend integration tests with verbose logging to identify which specific test in `process-lifecycle.test.ts` causes hangs. Document findings without fixing yet.

**Acceptance Criteria**:
1. Test suite run with verbose logging captured
2. Hanging test identified (name and line number)
3. Analysis document created: `docs/dev-monitor/BE-1-TEST-HANG-ANALYSIS.md` containing:
   - Which test hangs
   - Suspected root cause (e.g., Docker container not cleaned up)
   - Recommended fix approach
   - Whether temporary skip is needed
4. No code changes made (investigation only)

**Files**:
- Create: `docs/dev-monitor/BE-1-TEST-HANG-ANALYSIS.md`
- Reference: `backend/tests/integration/process-lifecycle.test.ts`
- Reference: `backend/safe-test-runner.cjs`

**Why This Task**:
- Tests diagnostic/investigation skills
- Requires running commands and interpreting output
- Produces actionable documentation
- Sets up for future fix task

---

### Task 5: Migration Utility Script (WT-2)

**Title**: Create work-target migration utility script
**Type**: enhancement
**Priority**: medium
**Complexity**: Medium (1 file, ~200 lines)
**Estimated Time**: 1.5-2 hours

**Description**:
Write a CLI script `backend/scripts/migrate-work-targets.ts` that reads JSON configs from `backend/config/work-targets/*.json`, inserts them into SQLite, and backs up the JSON files.

**Acceptance Criteria**:
1. Script created at `backend/scripts/migrate-work-targets.ts`
2. Functionality:
   - Reads all JSON files from `backend/config/work-targets/`
   - Validates JSON structure
   - Inserts into `work_targets` table
   - Creates backup directory `backend/config/work-targets/backup-TIMESTAMP/`
   - Copies JSON files to backup before migration
3. Supports CLI flags:
   - `--dry-run`: Show what would be migrated without executing
   - `--rollback`: Restore from most recent backup
   - `--verbose`: Show detailed logging
4. Error handling for:
   - Missing migration 005
   - Invalid JSON
   - Duplicate IDs
5. Uses existing database.ts service for DB access
6. Includes TypeScript types for work-target structure

**Files**:
- Create: `backend/scripts/migrate-work-targets.ts`
- Reference: `backend/src/services/database.ts`
- Reference: `backend/config/work-targets/app-monitor.json`
- Depends on: Task 1 (WT-1 schema must exist)

**Why This Task**:
- Real utility with practical value
- Tests file I/O, CLI args, error handling
- Medium complexity but well-defined scope
- Dependencies on prior task (good test of sequential work)

---

## Phase 3: Integration Tasks (After Phase 2 Validation)

### Task 6: Update Services to Use SQLite Registry (WT-3)

**Title**: Update ProcessManager to read from SQLite work-targets table
**Type**: enhancement
**Priority**: high
**Complexity**: Medium (3-4 files, ~150 lines)
**Estimated Time**: 2-3 hours

**Description**:
Modify ProcessManager and related services to read work-target configuration from SQLite first, with JSON fallback during migration period.

**Acceptance Criteria**:
1. `ProcessManager` updated to:
   - Query `work_targets` table via database service
   - Fall back to JSON if SQLite query returns empty
   - Cache results to avoid repeated DB queries
2. Update `database.ts` with new methods:
   - `getWorkTarget(id: string)`
   - `getAllWorkTargets()`
   - `updateWorkTarget(id, data)`
3. Add tests verifying:
   - SQLite read works
   - JSON fallback works
   - Cache invalidation on update
4. No breaking changes to existing functionality
5. Migration status logged (whether using SQLite or JSON)

**Files**:
- Edit: `backend/src/services/processManager/index.ts`
- Edit: `backend/src/services/database.ts`
- Edit: `backend/tests/integration/process-lifecycle.test.ts` (add tests)
- Reference: `backend/migrations/005_work_targets.sql`

**Why This Task**:
- Multi-file coordination
- Backward compatibility requirement
- Tests integration with existing code
- Requires understanding existing patterns

---

## Task Selection Strategy

### For First Test Run

**Recommended**: Start with **Task 1 (WT-1 Schema)** or **Task 3 (Stabilization Checklist)**

**Reasons**:
- Single file creation
- Clear, objective success criteria
- No dependencies on other code
- Low risk of breaking existing functionality
- Fast feedback loop (can verify immediately)

### If First Task Succeeds

**Recommended**: **Task 2 (README Update)**

**Reasons**:
- Tests multi-file editing
- Still low complexity
- Validates ability to follow existing patterns
- Documentation updates are easy to verify

### Progressive Difficulty

1. **Atomic (Tasks 1, 2, 3)**: Single responsibility, 1-2 files
2. **Small (Tasks 4, 5)**: Investigation or single utility, clear scope
3. **Medium (Task 6)**: Multiple files, integration required

---

## Success Metrics

For each task, track:
- ✅ **Completion**: Task fully completed as specified
- ⏱️ **Time**: Actual time taken vs estimated
- 🔧 **Fixes Needed**: Number of corrections required post-completion
- 📝 **Code Quality**: Follows project patterns, proper formatting
- 🧪 **Verification**: Tests pass, build succeeds

---

## Next Steps

1. Select Task 1 or Task 3 as first dev-bot test
2. Create task in backend database using proper schema
3. Monitor execution with enhanced logging
4. Document results and adjust strategy based on learnings
5. Progress through phases based on success rate

---

**Status**: Tasks defined and ready for dev-bot execution
**Total Tasks**: 6 (3 atomic, 2 small, 1 medium)
**Estimated Total Time**: 7-10 hours
**First Milestone**: Complete Phase 1 (3 atomic tasks) successfully
