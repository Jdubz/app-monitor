# Backend Duplication & Legacy Artifact Cleanup Plan (2025-11-06)

## Goals
- Remove lingering duplicate backends and prevent regeneration.
- Excise deprecated script runner surface.
- Prepare for transition away from JSON task backups toward SQLite storage.

## Investigation Tasks
- [ ] Trace why `dev-bots/mirror/backend` is regenerated (cron job, build step, or manual script).
  - [ ] Inspect `dev-bots/` Makefiles and scripts for mirror creation.
  - [ ] Audit CI/CD pipelines (`.github/`, `scripts/`, `dev-bots/monitoring/`) for mirror sync commands.
  - [ ] Add logging/instrumentation to any suspect scripts to confirm execution.
- [ ] Confirm nothing imports from the mirror tree at runtime or tests.
  - [ ] Search for `dev-bots/mirror` path references across repo.
  - [ ] Run tests with mirror temporarily removed to detect hidden dependencies.

## Remediation Tasks
- [x] Delete `dev-bots/mirror/backend` and enforce prevention.
  - [x] Remove or guard scripts that recreate the mirror (fail build if mirror would be reintroduced).
  - [x] Add CI check that flags the directory if committed.
- [x] Remove deprecated script routers and services.
  - [x] Delete `backend/src/routes/scripts.routes.ts` and `backend/src/routes/script-history.routes.ts`.
  - [x] Remove `ScriptManager` and `ScriptExecutionHistory` wiring from server bootstrap/tests.
  - [ ] Update API documentation to reflect removal.
- [ ] Prune backup/temp artifacts pending SQLite migration.
  - [ ] Remove `.bak` and `.tmp` task JSON files once SQLite migration lands.
  - [ ] Ensure migration plan (`docs/plans/TASK_QUEUE_SQLITE_MIGRATION.md`) covers export/import needs.

## Follow-Up & Safeguards
- [ ] Add regression tests or lint rules preventing duplicate backend trees.
- [ ] Document mirror removal rationale in `docs/DEV_MONITOR/` onboarding.
- [ ] Schedule review after SQLite migration to delete remaining backups.
