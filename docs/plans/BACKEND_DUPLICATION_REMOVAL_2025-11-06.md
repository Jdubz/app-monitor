# Backend Duplication & Legacy Artifact Cleanup Plan (2025-11-06)

## Goals
- Remove lingering duplicate backends and prevent regeneration.
- Excise deprecated script runner surface.
- Prepare for transition away from JSON task backups toward SQLite storage.

## Investigation Tasks
- [ ] Trace why `dev-bots/mirror/backend` is regenerated (cron job, build step, or manual script).
  - [x] Inspect `dev-bots/` Makefiles and scripts for mirror creation.
  - [x] Audit CI/CD pipelines (`.github/`, `scripts/`, `dev-bots/monitoring/`) for mirror sync commands.
  - [x] Add logging/instrumentation to any suspect scripts to confirm execution. _(Nov 7, 2025 — WorkspaceOrchestrator now emits structured telemetry on every mirror bootstrap/refresh.)_
  - [x] Add optional `MIRROR_DEBUG=1` telemetry in `WorkspaceOrchestrator` so we can capture caller + cwd each time a mirror bootstrap is attempted. _(Nov 7, 2025 — MIRROR_DEBUG=1 appends JSON events to `logs/mirror-watch/mirror-events.log`.)_
  - [x] Run `safe-test-runner` and local CLI flows with telemetry enabled to capture which process attempts to rehydrate the mirror. _(Nov 7, 2025 — backend safe-test-runner executed with MIRROR_DEBUG=1; events recorded under `logs/mirror-watch/`.)_
  - [x] Capture and archive telemetry logs in `logs/mirror-watch/` for regression diffs. _(Nov 7, 2025 — helper now auto-creates the mirror-watch log inside the repo for diffs.)_
- [x] Confirm nothing imports from the mirror tree at runtime or tests.
  - [x] Search for `dev-bots/mirror` path references across repo.
  - [x] Run tests with mirror temporarily removed to detect hidden dependencies. _(Nov 7, 2025 — deleted `/tmp/app-monitor-dev-bots/mirror` and reran `npm run test:backend`; suite passed without recreating the mirror.)_
- [x] Investigate new `backend/dev-bots/artifacts/*` outputs (should not exist). _(Nov 7, 2025 — artifact destinations now resolve via repo-root helpers, preventing `backend/dev-bots` writes.)_
  - [x] Identify which script writes under `backend/dev-bots` instead of root-level `dev-bots`. _(Nov 7, 2025 — TaskExecutionService and WorkspaceOrchestrator now call `resolveArtifactsDir`.)_
  - [x] Update `.gitignore`/guards to block the backend-local artifacts path. _(Nov 7, 2025 — `.husky/pre-push` aborts when `backend/dev-bots` exists.)_
  - [x] Verify Husky pre-push fails if either `dev-bots/mirror` or `backend/dev-bots/artifacts` reappears. _(Nov 7, 2025 — guard added before linting.)_

## Remediation Tasks
- [x] Delete `dev-bots/mirror/backend` and enforce prevention.
  - [x] Remove or guard scripts that recreate the mirror (fail build if mirror would be reintroduced).
  - [x] Add CI check that flags the directory if committed.
- [x] Remove deprecated script routers and services.
  - [x] Delete `backend/src/routes/scripts.routes.ts` and `backend/src/routes/script-history.routes.ts`.
  - [x] Remove `ScriptManager` and `ScriptExecutionHistory` wiring from server bootstrap/tests.
  - [x] Update API documentation to reflect removal.
  - [x] Document script runner removal in dev-monitor ref docs (Nov 7, 2025).
  - [ ] Sweep for any lingering `ScriptRunner` references in docs or comments and delete them.
- [x] Purge lingering duplicate backend surfaces.
  - [x] Delete deprecated route/test mirrors (`backend/src/routes/api.ts.DEPRECATED`, `backend/src/routes/api.retry.test.ts.DEPRECATED`).
  - [x] Drop stale websocket backup test (`backend/src/services/websocket.integration.test.ts.bak`).
  - [x] Refactor `ProcessManager` barrel to avoid self-import duplication and circular dependencies.
- [ ] Prune backup/temp artifacts pending SQLite migration.
  - [ ] Remove `.bak` and `.tmp` task JSON files once SQLite migration lands.
  - [ ] Ensure migration plan (`docs/plans/TASK_QUEUE_SQLITE_MIGRATION.md`) covers export/import needs.
  - [ ] Catalogue every backup directory + file pattern that will be deleted post-migration and document the handoff checklist.
  - [ ] Add a guardrail (lint/test) that fails if new JSON backups are committed after the SQLite flag flips.
- [ ] Stabilize SQLite queue tests.
  - [x] Replace `taskQueue.sqlite.test.ts` (segfaulting integration suite) with pure metrics unit tests that exercise `summarizeAgentComparisonMetrics()` (Nov 7, 2025).
  - [x] Treat `database.test.ts` + `tokenTracking.test.ts` as heavy suites so CI skips their better-sqlite3 dependency until we can bundle prebuilt binaries (Nov 7, 2025).
  - [x] Re-enable `processManager.core.test.ts` and `retryButton.test.ts` with deterministic child-process/task-queue mocks so CI coverage returns for lifecycle + manual retry paths (Nov 7, 2025).
  - [ ] Re-introduce end-to-end SQLite queue coverage via a lightweight harness once we can run the service without segfaulting.

## Follow-Up & Safeguards
- [ ] Add regression tests or lint rules preventing duplicate backend trees.
- [ ] Document mirror removal rationale in `docs/DEV_MONITOR/` onboarding.
- [ ] Schedule review after SQLite migration to delete remaining backups.

## Duplication Remediation Targets
- [ ] Collapse duplicate guideline field lists in `TaskCreationGuidelinesManager` so shared required/optional fields are sourced from a single constant.
- [x] Move documentation suggestion regex rules in `TaskPromptTemplateManager` into a declarative map to prevent drift between prompt generation and docs. _(Nov 6, 2025 — introduced `DOC_SUGGESTION_RULES` map to power `discoverRelevantDocumentation()`.)_
- [ ] Ensure process-manager unit tests share a single fake child-process factory to avoid per-suite redefinitions.
- [ ] Audit `taskPromptTemplates` vs `TaskCreationGuidelines` to ensure both reference the same canonical list of task metadata fields.

## API Contract Audit (2025-11-07)
- [x] Update frontend service log calls to hit `/logs/services/:serviceName/logs` and share a typed `ServiceLogsResponse` so requests stop 404/500ing when the backend moved log streaming into LogWatcher.
- [x] Extend the shared `@app-monitor/api-contracts` folder (`shared/api-contracts`) to cover remaining responses (port kill, queue metrics) and add parity tests asserting backend routes serialize the shared DTOs. _(Nov 7, 2025 — ports/environments/logs now typed + contract tests in tests/contracts/api-contracts.test.ts)_
- [x] Standardize API responses around `ApiSuccess<ApiError>` envelopes so every client unwraps `data` consistently (health, services, ports, environments, logs). _(Nov 7, 2025 — backend routes now emit shared envelopes and frontend unwraps them via the central API client.)_
- [x] Extend the shared contract enforcement to the remaining Docker, token-tracking, and quality-gates routes and update the frontend integration tests to unwrap the new envelopes. _(Nov 7, 2025 — all REST endpoints now import `shared/api-contracts` and the frontend expects `success/data/error` consistently.)_
- [x] Bring Dev-Bots management endpoints and panels onto the shared contracts + envelope helpers. _(Nov 8, 2025 — `/api/dev-bots/*` now auto-wrap responses via the Express middleware and the React panels import the new `DevBots*` types from `shared/api-contracts`.)_
