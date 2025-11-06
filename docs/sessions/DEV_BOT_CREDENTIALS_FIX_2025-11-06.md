# Dev-Bot Credentials Fix & Stabilization Status Update

**Date:** November 6, 2025
**Session:** Dev-Bot Debugging & Stabilization
**Status:** ✅ Critical Blocker Resolved

---

## Executive Summary

**Problem**: Dev-bots were failing immediately with exit code 1 due to Claude CLI authentication failures.

**Root Causes Identified**:
1. Incorrect credentials file path (`.credentials.json` vs `credentials.json`)
2. Wrong mounting strategy (mount to `/tmp` instead of direct to `~/.claude/`)
3. Workspace permission issues (files owned by host user, not container worker)

**Solutions Implemented**:
- ✅ Fixed credentials mounting to use correct file path and location
- ✅ Added `--dangerously-skip-permissions` flag for sandboxed execution
- ✅ Implemented workspace ownership fix with root user chown
- ✅ Removed obsolete credential copying logic

**Verification**: End-to-end manual test successful - dev-bot authenticated, executed commands, and created files.

---

## Stabilization Plan Progress

### ✅ **COMPLETED TASKS**

#### **FE-1: TypeScript Compilation** ✅
- **Status**: COMPLETE
- **Verification**: `npm run build` succeeds in frontend workspace
- **Output**: Clean build with no TypeScript errors
- **Files**: All 6 problem files now compile successfully
  - `DevBotsPanel.tsx`
  - `EnhancedLogsViewer.tsx`
  - `EnhancedTaskCreationForm.tsx`
  - `ErrorDisplay.tsx`
  - `EnvironmentTab.tsx`
  - `panelFilters.ts`

#### **FE-2: ESLint Warnings** ✅
- **Status**: COMPLETE
- **Verification**: `npm run lint` exits cleanly with no warnings
- **Output**: No ESLint warnings blocking pre-push hooks

#### **TC-4: Dev-Bot Container Requirements** ✅
- **Status**: COMPLETE
- **Deliverable**: Credentials mounting, permissions, and command flags all documented and working
- **Implementation**:
  - Credentials: Mount `~/.claude/.credentials.json` directly to `/home/worker/.claude/.credentials.json:ro`
  - Permissions: Run `chown -R worker:worker /workspace` as root user after workspace copy
  - Command flags: Added `--dangerously-skip-permissions` to Claude CLI invocations

---

## Dev-Bot Fix Details

### **Files Modified**

**`backend/src/services/devBotsManager.ts`**:

1. **Lines 1096-1115**: Credentials mounting fix
   ```typescript
   // Check both possible credential file names
   const claudeCredentialsNew = path.join(homeDir, '.claude', '.credentials.json');
   const claudeCredentialsOld = path.join(homeDir, '.claude', 'credentials.json');
   const claudeCredentials = fs.existsSync(claudeCredentialsNew) ? claudeCredentialsNew : claudeCredentialsOld;

   // Mount directly where Claude CLI expects it
   binds.push(`${claudeCredentials}:/home/worker/.claude/.credentials.json:ro`);
   ```

2. **Line 1431**: Added permission bypass flag
   ```typescript
   '--dangerously-skip-permissions',  // Skip permission prompts in sandboxed container
   ```

3. **Lines 1263-1288**: Workspace ownership fix
   ```typescript
   const chownExec = await container.exec({
     Cmd: ['/bin/sh', '-c', 'chown -R worker:worker /workspace'],
     User: 'root',  // Run as root to be able to chown
     AttachStdout: true,
     AttachStderr: true
   });
   await chownExec.start({ Detach: false });
   ```

4. **Lines 1468-1483**: Removed obsolete credential copying logic

### **Verification Test**

```bash
# Manual end-to-end test
docker run --rm \
  --user root \
  -v ~/.claude/.credentials.json:/home/worker/.claude/.credentials.json:ro \
  dev-bot:latest

# Results:
✅ Credentials mounted correctly
✅ Claude CLI authenticated successfully
✅ File created: /workspace/COMPLETE_TEST.txt
✅ Ownership: worker:worker
```

---

## Outstanding Tasks for Dev-Bot Testing

### **Priority 1: Backend Test Stability (BE-1)**

**Task**: Fix ProcessManager integration tests hanging
- **Status**: IN PROGRESS (tests run but may have hanging tests)
- **Complexity**: Medium
- **Files**: `backend/tests/integration/process-lifecycle.test.ts`
- **Approach**:
  1. Identify which specific test hangs (run with verbose logging)
  2. Add proper cleanup/teardown for Docker containers
  3. Implement timeout guards
  4. Consider skipping problematic tests with TODO comments

**Recommended for Dev-Bot**:
```
Title: Fix hanging ProcessManager integration test
Description: The ProcessManager integration tests hang when run via safe test runner.
Identify the hanging test, add proper cleanup/teardown, and implement timeout guards.
Files: backend/tests/integration/process-lifecycle.test.ts
Type: bugfix
Priority: high
```

### **Priority 2: Work-Target Registry Migration (WT-1, WT-2)**

**WT-1: Schema Design**
- **Complexity**: Small
- **Files**: `backend/migrations/005_work_targets.sql` (new file)
- **Deliverable**: SQL migration that extends SQLite schema for work-target config
```sql
CREATE TABLE IF NOT EXISTS work_targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  services TEXT, -- JSON array
  log_sources TEXT, -- JSON array
  env_vars TEXT, -- JSON object
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Recommended for Dev-Bot**:
```
Title: Design work-target SQLite schema migration
Description: Create migration file 005_work_targets.sql that defines the work_targets
table schema to store: id, name, type, repo_path, services (JSON), log_sources (JSON),
env_vars (JSON), and timestamps.
Files: backend/migrations/005_work_targets.sql
Type: enhancement
Priority: medium
```

**WT-2: Migration Utility**
- **Complexity**: Medium
- **Files**: `backend/scripts/migrate-work-targets.ts` (new file)
- **Deliverable**: CLI script that:
  1. Reads `backend/config/work-targets/*.json`
  2. Inserts into SQLite `work_targets` table
  3. Creates backup of JSON files
  4. Supports dry-run and rollback

**Recommended for Dev-Bot**:
```
Title: Create work-target migration utility script
Description: Write a CLI script (migrate-work-targets.ts) that reads JSON configs from
backend/config/work-targets/*.json, inserts them into the SQLite work_targets table,
backs up the JSON files, and supports --dry-run and --rollback flags.
Files: backend/scripts/migrate-work-targets.ts
Type: enhancement
Priority: medium
Dependencies: WT-1 (schema must exist first)
```

### **Priority 3: Documentation Updates (DOC-1, DOC-2)**

**DOC-1: README Updates**
- **Complexity**: Small
- **Files**: `README.md`, `CONTRIBUTING.md`
- **Content**: Update with current stabilization status, dev-bot fixes, and new workflows

**Recommended for Dev-Bot**:
```
Title: Update README with stabilization status
Description: Update README.md and CONTRIBUTING.md to reflect: (1) FE-1 and FE-2 completion,
(2) dev-bot credentials fix documentation, (3) current test runner usage (npm run test),
(4) link to docs/plans/APP_MONITOR_STABILIZATION_PLAN.md
Files: README.md, CONTRIBUTING.md
Type: documentation
Priority: low
```

**DOC-2: Stabilization Checklist**
- **Complexity**: Small
- **Files**: `docs/dev-monitor/STABILIZATION_CHECKLIST.md` (new file)
- **Content**: High-level checklist with links to detailed plans

---

## Dev-Bot Testing Strategy

### **Phase 1: Small Atomic Tasks** (Ready Now)
Start with well-scoped, 1-2 file tasks:
- Schema design (WT-1)
- Documentation updates (DOC-1, DOC-2)
- Simple script creation

### **Phase 2: Medium Complexity** (After Phase 1 success)
- Migration utility (WT-2)
- Test fixes (BE-1)
- Service integration (WT-3)

### **Phase 3: Full Integration** (After Phase 2 validation)
- Multi-file refactors
- Cross-service changes
- End-to-end features

---

## Metrics Baseline (for MET-2)

**Build Times** (as of 2025-11-06):
- Frontend build: ~3s
- Backend build: ~5s
- Frontend lint: <1s
- Backend tests: ~10s (when not hanging)

**Task Status**:
- Total tasks in stabilization: 27
- Completed: 3 (FE-1, FE-2, TC-4)
- In Progress: 24
- Percentage Complete: 11%

---

## Next Actions

1. ✅ **Rebuild backend** with dev-bot fixes applied
2. ⏳ **Create test tasks** for dev-bots using recommended tasks above
3. ⏳ **Monitor first dev-bot execution** with small atomic task
4. ⏳ **Document learnings** and adjust task decomposition strategy

---

## Architecture Insights

### **Comparison with Imagineer**

Imagineer solves the workspace permissions problem more elegantly in the Dockerfile:

```dockerfile
RUN mkdir -p /workspace/repo /workspace/context /workspace/artifacts /workspace/logs \
    && chown -R node:node /workspace
```

**Future Improvement**: Update `dev-bots/docker/Dockerfile` to pre-create and pre-chown `/workspace` to avoid runtime chown operations.

### **Credentials Mounting Best Practice**

The fix implements the same pattern as imagineer:
- Mount credentials file directly to expected location
- Read-only mount for security
- Check both old and new credential file names for compatibility

---

## Status: Ready for Dev-Bot Testing

All blocking issues resolved. Dev-bots can now:
- ✅ Authenticate with Claude API
- ✅ Execute commands in containers
- ✅ Read and write files in workspace
- ✅ Access git, npm, and other tools

**Recommended First Test Task**: WT-1 (Schema design) - Small, well-defined, single file creation.
