# Prod Dev-Bot Pipeline Validation (2025-11-21)

## Context
- Environment: Production (`app-monitor.joshwentworth.com`, backend port 5002)
- Task submitted: `task-analysis-83d5a4a4-5e5a-496e-9c36-fe9575a56c62`
  - Title: “Prod validation: pipeline drift check”
  - Submitted: 2025-11-21T07:09:56Z
  - Status during investigation: `active`, phase 1 (Planning), repeatedly retried

## Observations
1) Worker startup fails copying host logs  
   - Error (journal): `mkdir: can't create directory '/host-logs/': Permission denied` thrown by `EphemeralWorkerService.copyHostDirectoryToContainer` when copying `/opt/app-monitor/shared/backend/logs` and `/var/log/nginx`.  
   - Result: worker aborts immediately; task remains “active” with no surfaced failure reason.

2) Repeated silent retries  
   - Task history shows multiple “Attempt 1 failed” entries with new worker IDs but no error message in the API response. Queue shows 1 active, 1 pending; task never progresses beyond phase 1.

3) Migration drift in production DB  
   - Multiple unrelated tasks failing with: `table task_stage_runs has no column named recovery_diagnosis` (seen in prod queue history from 2025-11-18/19). Indicates migration not applied to `/opt/app-monitor/shared/backend/data/app-monitor.db`.

4) Auto-merge policy mismatch  
   - Automated merge attempts for PRs #291/#292 fail because GitHub repo auto-merge is disabled (`enablePullRequestAutoMerge`), generating many `manual-intervention` tasks and queue noise.

5) Credential/missing-file failures inflate failure count  
   - Historical failures show missing codex/gemini credentials and missing dev-bot log directories leading to heartbeat timeouts.

## Impact
- Current validation task is stuck; pipeline health cannot be verified end-to-end.
- Queue health reported as “CRITICAL”; success rate ~18.6% (35 failed tasks recorded).
- Human intervention needed for multiple blocked merge tasks, consuming capacity and obscuring true failures.

## Recommendations
1) Unblock worker startup
   - Change log snapshot target to a user-writable path (e.g., `/tmp/host-logs`) in `EphemeralWorkerService.copyWorkTargetLogSnapshots`, or pre-create `/host-logs` with appropriate permissions in the dev-bot image/entrypoint.
   - Add a guard: on permission errors, skip host-log copy and continue task execution (log a warning).

2) Surface failures to tasks
   - When worker bootstrap fails, mark the task `failed` with the error message so it does not remain “active”.

3) Fix database schema drift
   - Run pending migrations on the production DB to add `recovery_diagnosis` to `task_stage_runs` (see Migration 022).

4) Align PR automation with repo policy
   - Either enable auto-merge in GitHub or disable auto-merge attempts in the bot; otherwise suppress creation of repetitive `manual-intervention` tasks for the same PR.

5) Credential and log prerequisites
   - Ensure codex/gemini credentials are baked into the dev-bot image or mounted consistently.
   - Restore/mount required dev-bot log directories referenced in task execution to reduce heartbeat timeouts.

## Next Steps to Re-test
1) Apply fixes above (especially log-copy permission and DB migration).  
2) Resubmit a read-only validation task (same payload) in production.  
3) Monitor `/api/dev-bots/status`, `/queue`, and task detail; expect phase progression beyond Planning and completion or a surfaced failure reason.  
4) If successful, close this doc with the final timings and any remaining gaps.
