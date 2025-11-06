# Backend Duplication & Legacy Artifact Cleanup Plan (2025-11-06)

## Goals
- Remove lingering duplicate backends and prevent regeneration.
- Excise deprecated script runner surface.
- Prepare for transition away from JSON task backups toward SQLite storage.

## Investigation Tasks
- [ ] Trace why `dev-bots/mirror/backend` is regenerated (cron job, build step, or manual script).
  - [x] Inspect `dev-bots/` Makefiles and scripts for mirror creation.
  - [x] Audit CI/CD pipelines (`.github/`, `scripts/`, `dev-bots/monitoring/`) for mirror sync commands.
  - [ ] Add logging/instrumentation to any suspect scripts to confirm execution.
  - [ ] Add optional `MIRROR_DEBUG=1` telemetry in `WorkspaceOrchestrator` so we can capture caller + cwd each time a mirror bootstrap is attempted.
  - [ ] Run `safe-test-runner` and local CLI flows with telemetry enabled to capture which process attempts to rehydrate the mirror.
  - [ ] Capture and archive telemetry logs in `logs/mirror-watch/` for regression diffs.
- [ ] Confirm nothing imports from the mirror tree at runtime or tests.
  - [x] Search for `dev-bots/mirror` path references across repo.
  - [ ] Run tests with mirror temporarily removed to detect hidden dependencies.
- [ ] Investigate new `backend/dev-bots/artifacts/*` outputs (should not exist).
  - [ ] Identify which script writes under `backend/dev-bots` instead of root-level `dev-bots`.
  - [ ] Update `.gitignore`/guards to block the backend-local artifacts path.
  - [ ] Verify Husky pre-push fails if either `dev-bots/mirror` or `backend/dev-bots/artifacts` reappears.

## Remediation Tasks
- [x] Delete `dev-bots/mirror/backend` and enforce prevention.
  - [x] Remove or guard scripts that recreate the mirror (fail build if mirror would be reintroduced).
  - [x] Add CI check that flags the directory if committed.
- [x] Remove deprecated script routers and services.
  - [x] Delete `backend/src/routes/scripts.routes.ts` and `backend/src/routes/script-history.routes.ts`.
  - [x] Remove `ScriptManager` and `ScriptExecutionHistory` wiring from server bootstrap/tests.
  - [x] Update API documentation to reflect removal.
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

## Follow-Up & Safeguards
- [ ] Add regression tests or lint rules preventing duplicate backend trees.
- [ ] Document mirror removal rationale in `docs/DEV_MONITOR/` onboarding.
- [ ] Schedule review after SQLite migration to delete remaining backups.

## Duplication Remediation Targets
- [ ] Collapse duplicate guideline field lists in `TaskCreationGuidelinesManager` so shared required/optional fields are sourced from a single constant.
- [x] Move documentation suggestion regex rules in `TaskPromptTemplateManager` into a declarative map to prevent drift between prompt generation and docs. _(Nov 6, 2025 — introduced `DOC_SUGGESTION_RULES` map to power `discoverRelevantDocumentation()`.)_
- [ ] Ensure process-manager unit tests share a single fake child-process factory to avoid per-suite redefinitions.
- [ ] Audit `taskPromptTemplates` vs `TaskCreationGuidelines` to ensure both reference the same canonical list of task metadata fields.
