# PR Tracking Critical Fix Implementation Plan
**Date:** 2025-11-12  
**Primary Owner:** Backend Platform  
**Stakeholders:** Release Engineering, SRE, Dev-Bots

## Objectives
- Ship fixes for Critical Bugs #2 and #3 identified in `docs/investigations/PR_TRACKING_CRITICAL_BUGS.md`.
- Backfill automated tests to prevent regressions in CI and in production monitoring.
- Redeploy PR tracking service with zero stuck PRs (#96-#99) and telemetry proving correctness.

## Success Criteria
1. `evaluateAndHandleBranchUpdate()` enqueues branch-update tasks whenever `behind_by > 0` (validated by unit + integration tests).
2. `active_fix_tasks` reflects actual running jobs; stale entries are purged automatically.
3. Production tracker processes PRs 96–99 end-to-end and re-enters steady state within 15 minutes of deployment.
4. Alert triggers if the tracker reports >20 minutes without webhook activity.

## Workstreams
### 1. Branch Update Logic (Bug #2)
- [ ] Refactor GitHub sync to fetch latest `compare/base` data before evaluating BEHIND status.
- [ ] Add contract test covering: up-to-date, behind, diverged, fast-forward scenarios.
- [ ] Instrument code path with structured logging (`branch_update_eval` span).

### 2. Active Task State Hygiene (Bug #3)
- [ ] Migrate `active_fix_tasks` schema to include `updated_at` + status.
- [ ] Background job that prunes entries older than 30 minutes or with missing task ids.
- [ ] Update task completion handler to delete row on success/failure.

### 3. Regression & Telemetry
- [ ] Add fixture-driven tests replaying PRs 96–99 payloads.
- [ ] Build synthetic PR generator script to validate tracker on staging.
- [ ] Emit metrics (`pr_tracker.branch_updates`, `pr_tracker.fix_tasks_running`).

### 4. Deployment & Verification
- [ ] Dark deploy to staging, replay recorded GitHub webhook payloads.
- [ ] Promote to production with feature flag to toggle new logic.
- [ ] Monitor dashboards for 1 hour; verify automation spawned as expected.

## Schedule
| Date | Deliverable |
|------|-------------|
| Nov 12 | Branch update refactor ready for review
| Nov 13 | Schema migration + cleanup job merged
| Nov 14 | Regression + telemetry tests ✅
| Nov 15 | Production deploy + validation

## Dependencies
- Access to GitHub App logs for historical payloads.
- Database migration window (5 minutes) to add columns + indexes.
- Telemetry sink (Prometheus) for new metrics.

## Risks
- **Race between tracker and manual fixes** → coordinate freeze during deployment.
- **Schema migration failure** → run migration dry-run on staging DB snapshot.
- **Telemetry noise** → start with debug-level metrics until validated.

## Exit Checklist
- [ ] Bugs #2 and #3 test cases green in CI.
- [ ] Tracker redeployed and PRs 96–99 processed without manual intervention.
- [ ] Runbook updated with new metrics + alert ids.
- [ ] Investigation marked closed referencing this plan.
