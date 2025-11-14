# App Monitor Stabilization Plan

**Version:** 0.2.1
**Last Updated:** November 6, 2025 (Evening Update)
**Scope:** Pre-POC stabilization (prerequisite for autonomous continuous queue)
**Owner:** Platform Tooling (personal experiment)

---

## Status Summary (2025-11-06 Evening)

### ✅ Completed Today
1. **Backend Stabilization** - Fixed all critical TypeScript errors, 543/543 tests passing
2. **Failure Recovery System** - Implemented with dry-run mode, circular prevention, timeout detection
3. **Real-time Monitoring** - Stuck task detection with 60-minute timeout enforcement
4. **Safety Mechanisms** - Ephemeral containers, patch files, uncommitted changes detection

### 🚧 In Progress
1. **Build Errors** - Some remaining TypeScript errors in routes/server.ts (non-critical)
2. **V3 Prompt Engineering** - System designed but not yet implemented

### 📋 Next Priority
1. Fix remaining build errors (routes, server.ts)
2. Implement v3 task template validation
3. Create task template library
4. Add scope validation to task creation API

---

## Objectives
1. Restore green builds/tests so feature work can land safely.
2. Establish SQLite as the authoritative work-target registry.
3. Ensure developer workflows (hooks, scripts, docs) reflect the current tooling.
4. Capture the baseline metrics needed for the upcoming continuous task queue.
5. **NEW:** Implement v3 prompt engineering to prevent scope creep and duplication.
6. **NEW:** Establish quality metrics and monitoring baselines.

---

## Workstreams & Tasks

### 1. Frontend Health
- **FE-1**: ✅ **COMPLETE** - Fix TypeScript compilation errors (`DevBotsPanel.tsx`, `EnhancedLogsViewer.tsx`, `EnhancedTaskCreationForm.tsx`, `ErrorDisplay.tsx`, `EnvironmentTab.tsx`, `panelFilters.ts`).
  - *Deliverable*: `npm run build` succeeds. ✅ **VERIFIED 2025-11-06**
  - *Notes*: All discriminated unions, missing props, and invalid enum comparisons resolved.
- **FE-2**: ✅ **COMPLETE** - Resolve ESLint warnings that block pre-push hooks (primarily `@typescript-eslint/no-explicit-any`).
  - *Deliverable*: `npm run lint` exits cleanly. ✅ **VERIFIED 2025-11-06**
- **FE-3**: Audit dev-bot UI layouts post-fix to ensure components render without runtime errors.

### 2. Backend Health
- **BE-1**: ✅ **COMPLETE** - Fixed TypeScript compilation errors in backend (taskBridge.ts, taskQueue.migration.ts, taskQueue.sqlite.ts, devBotsManager.ts).
  - *Deliverable*: All tests pass (543/543). ✅ **VERIFIED 2025-11-06**
  - *Notes*: Fixed type mismatches, missing properties, and logger interface issues. Implemented real-time stuck task detection.
- **BE-2**: ✅ **COMPLETE** - Implemented automatic failure recovery system with dry-run mode enabled.
  - *Deliverable*: Recovery system operational with comprehensive logging. ✅ **VERIFIED 2025-11-06**
  - *Notes*: See backend/.env for configuration. Features: circular recovery prevention, stuck task timeout, cleanup strategies.
- **BE-3**: ✅ **COMPLETE** - Re-enabled `.husky/pre-push` (2025-11-08) so pushes run backend/frontend lint plus `npm run test:backend` (543 specs) and `npm run test:frontend` under `NODE_OPTIONS='--max-old-space-size=2048'`.

### 3. Work-Target Registry Migration
- **WT-1**: Design SQLite schema extensions to store current JSON config fields (services, log sources, repo paths, env vars).  
  - *Deliverable*: migration script + TypeScript access layer.  
- **WT-2**: Write migration utility that ingests `backend/config/work-targets/*.json` into SQLite and keeps JSON backups.  
  - *Deliverable*: CLI script with dry-run + rollback instructions.  
- **WT-3**: Update backend services (ProcessManager, LogSourceManager, UI queries) to read from SQLite first, falling back to JSON during migration window.  
- **WT-4**: Document registry ownership and editing workflow in `docs/dev-monitor/` (including manual override steps).

### 4. Build & CI Hygiene
- **CI-1**: Confirm GitHub Actions workflow matches updated scripts (safe runners, lint commands).  
  - *Deliverable*: Workflow file references `npm run test:backend`, `npm run test:frontend`, `npm run lint --workspaces`.  
- **CI-2**: Add lightweight smoke job (lint + build) per workspace; log status in README until UI dashboard is ready.  
- **CI-3**: Ensure local `make` targets still work post-schema migration (dev, dev-backend, dev-frontend).

### 5. Documentation & Onboarding
- **DOC-1**: Update root README / CONTRIBUTING with current stabilization steps and new planning index.  
- **DOC-2**: Provide “Stabilization Checklist” summary in `docs/dev-monitor/APP_MONITOR_TESTING_PLAN.md` (or successor) referencing this plan.  
- **DOC-3**: Archive superseded plan references elsewhere in docs (link to capability roadmap + stabilization plan).

### 6. Baseline Metrics
- **MET-1**: Instrument current token logging to guarantee entries for every job (including failures).  
- **MET-2**: Capture baseline counts: test duration, lint duration, build time, number of outstanding tasks—store as seed data in SQLite or JSON snapshot.  
- **MET-3**: Define manual process for recording monthly Anthropic/OpenAI spend until automated APIs exist.

### 7. Task Context Foundations
- **TC-1**: Author task context submission schemas/validators (description, env snapshot, logs, network events, artifact references).
- **TC-2**: Design SQLite migrations for `task_context`, `task_artifacts`, and `task_automation_runs` tables (see `docs/dev-monitor/DEV_BOT_PIPELINE_ENHANCEMENT_PLAN.md`).
- **TC-3**: Extend task API/CLI scaffolding to accept optional context payloads without enabling automation yet.
- **TC-4**: ✅ **COMPLETE** - Scope remediation container requirements (image, bootstrap script path, read-only credential mounts) per work-target.
  - *Deliverable*: Container credentials mounting, workspace permissions, and command flags documented and working. ✅ **VERIFIED 2025-11-06**
  - *Notes*: See `docs/sessions/DEV_BOT_CREDENTIALS_FIX_2025-11-06.md` for implementation details.
- **TC-5**: ✅ **COMPLETE** - Ephemeral container implementation with tar | docker cp pattern.
  - *Deliverable*: Zero filesystem artifacts, automatic container cleanup, workspace copying working. ✅ **VERIFIED 2025-11-06**
  - *Notes*: See `DEV_BOT_EPHEMERAL_CONTAINER_MIGRATION.md` for implementation details.
- **TC-6**: ✅ **COMPLETE** - Safety mechanisms for uncommitted changes.
  - *Deliverable*: Patch file creation, git status capture, prevents losing bot work on failures. ✅ **VERIFIED 2025-11-06**

### 8. Prompt Engineering v3 ✅ **COMPLETE** - Superseded by Context-Aware Task Submission
- **PE-1 through PE-6**: ✅ **COMPLETED VIA CONTEXT MANAGEMENT SYSTEM**
  - Original plan: Manual v3 template validation system
  - **Implemented approach:** Context-aware auto-generation (superior to manual templates)
  - **Status:** ✅ **100% OPERATIONAL** (2025-11-14)
    - ✅ Context infrastructure complete (~2400 lines, fully tested)
    - ✅ 8 YAML recipes operational
    - ✅ Minimal API endpoints live (/tasks/minimal, /tasks/preview-detection)
    - ✅ Auto-detection service functional
    - ✅ Prompt generation from context bundles working
  - **Migration:** BOT_PROMPT_ENGINEERING_V3.md archived to `docs/archive/obsolete-2025-11-14/`
  - **Achievement:** Task submission reduced from 15+ fields to 3: title, taskType, intent
  - **Deliverable:** ✅ Production-ready API available now. Frontend UI component pending but not blocking.

### 9. Quality Metrics Baseline (NEW)
- **QM-1**: Define success metrics for bot execution.
  - *Deliverable*: Document target metrics: scope compliance (100%), duplication rate (0%), git workflow success (100%), feature creep (0%).
- **QM-2**: Implement metrics collection in task execution.
  - *Deliverable*: Track and log: scope violations, code duplication, git commit success, investigation completion.
- **QM-3**: Create quality metrics dashboard.
  - *Deliverable*: UI showing real-time: scope compliance, duplication detection, workflow success rates.
- **QM-4**: Set up alert thresholds for quality degradation.
  - *Deliverable*: Alerts at: 10% scope violations (yellow), 20% scope violations (red), 30% scope violations (emergency).

---

## Acceptance Criteria
- `npm run build -w frontend`, `npm run test:backend`, and `npm run test:frontend` pass locally and via CI.
- Pre-push hook enforces lint + test suites without false positives.
- Work-target metadata resolvable from SQLite; JSON configs retained only as backups.
- Updated documentation instructs contributors on stabilized workflows.
- Baseline metrics captured and logged for future comparison.
- **NEW:** V3 task template validation enforced in task creation API.
- **NEW:** Task template library available with at least 4 common patterns.
- **NEW:** Quality metrics dashboard operational with real-time tracking.
- **NEW:** All new tasks created must use v3 template format with mandatory investigation phase.

---

## Exit Checklist
1. All tasks above closed or explicitly deferred with rationale in capability roadmap.  
2. Capability roadmap updated to mark stabilization lane as complete and unlock POC items.  
3. Continuous task queue seeded with follow-on tickets from unresolved findings (if any).
