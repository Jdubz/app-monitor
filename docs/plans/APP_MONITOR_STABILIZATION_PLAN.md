# App Monitor Stabilization Plan

**Version:** 0.1.0  
**Last Updated:** November 6, 2025  
**Scope:** Pre-POC stabilization (prerequisite for autonomous continuous queue)  
**Owner:** Platform Tooling (personal experiment)

---

## Objectives
1. Restore green builds/tests so feature work can land safely.  
2. Establish SQLite as the authoritative work-target registry.  
3. Ensure developer workflows (hooks, scripts, docs) reflect the current tooling.  
4. Capture the baseline metrics needed for the upcoming continuous task queue.

---

## Workstreams & Tasks

### 1. Frontend Health
- **FE-1**: Fix TypeScript compilation errors (`DevBotsPanel.tsx`, `EnhancedLogsViewer.tsx`, `EnhancedTaskCreationForm.tsx`, `ErrorDisplay.tsx`, `EnvironmentTab.tsx`, `panelFilters.ts`).  
  - *Deliverable*: `npm run build -w frontend` succeeds.  
  - *Notes*: Address discriminated unions, missing props, invalid enum comparisons.
- **FE-2**: Resolve ESLint warnings that block pre-push hooks (primarily `@typescript-eslint/no-explicit-any`).  
  - *Deliverable*: `npm run lint -w frontend` exits cleanly or warnings explicitly suppressed with justification.
- **FE-3**: Audit dev-bot UI layouts post-fix to ensure components render without runtime errors.

### 2. Backend Health
- **BE-1**: Diagnose and fix the hanging `ProcessManager` integration tests when run via safe test runner.  
  - *Deliverable*: `npm run test:backend` completes without manual interruption.  
  - *Risk*: May require temporary skips guarded by TODOs if root cause needs deeper refactor.
- **BE-2**: Verify safe runners create/clean lock files; document behavior in CONTRIBUTING.
- **BE-3**: Re-enable pre-push hooks to run backend + frontend tests once suites are green.

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
- **TC-4**: Scope remediation container requirements (image, bootstrap script path, read-only credential mounts) per work-target and record them in the registry once migrated.

---

## Acceptance Criteria
- `npm run build -w frontend`, `npm run test:backend`, and `npm run test:frontend` pass locally and via CI.  
- Pre-push hook enforces lint + test suites without false positives.  
- Work-target metadata resolvable from SQLite; JSON configs retained only as backups.  
- Updated documentation instructs contributors on stabilized workflows.  
- Baseline metrics captured and logged for future comparison.

---

## Exit Checklist
1. All tasks above closed or explicitly deferred with rationale in capability roadmap.  
2. Capability roadmap updated to mark stabilization lane as complete and unlock POC items.  
3. Continuous task queue seeded with follow-on tickets from unresolved findings (if any).
