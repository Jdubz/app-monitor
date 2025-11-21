# Prod Dev-Bot Pipeline Validation (2025-11-21)

## Context
- Environment: Production (`app-monitor.joshwentworth.com`, backend port 5002)
- Task submitted: `task-analysis-83d5a4a4-5e5a-496e-9c36-fe9575a56c62`
  - Title: "Prod validation: pipeline drift check"
  - Submitted: 2025-11-21T07:09:56Z
  - Status during investigation: `active`, phase 1 (Planning), repeatedly retried

## Observations
1) Worker startup fails copying host logs
   - Error (journal): `mkdir: can't create directory '/host-logs/': Permission denied` thrown by `EphemeralWorkerService.copyHostDirectoryToContainer` when copying `/opt/app-monitor/shared/backend/logs` and `/var/log/nginx`.
   - Result: worker aborts immediately; task remains "active" with no surfaced failure reason.

2) Repeated silent retries
   - Task history shows multiple "Attempt 1 failed" entries with new worker IDs but no error message in the API response. Queue shows 1 active, 1 pending; task never progresses beyond phase 1.

3) Migration drift in production DB
   - Multiple unrelated tasks failing with: `table task_stage_runs has no column named recovery_diagnosis` (seen in prod queue history from 2025-11-18/19). Indicates migration not applied to `/opt/app-monitor/shared/backend/data/app-monitor.db`.

4) Auto-merge policy mismatch
   - Automated merge attempts for PRs #291/#292 fail because GitHub repo auto-merge is disabled (`enablePullRequestAutoMerge`), generating many `manual-intervention` tasks and queue noise.

5) Credential/missing-file failures inflate failure count
   - Historical failures show missing codex/gemini credentials and missing dev-bot log directories leading to heartbeat timeouts.

## Impact
- Current validation task is stuck; pipeline health cannot be verified end-to-end.
- Queue health reported as "CRITICAL"; success rate ~18.6% (35 failed tasks recorded).
- Human intervention needed for multiple blocked merge tasks, consuming capacity and obscuring true failures.

## Recommendations
1) Unblock worker startup
   - Change log snapshot target to a user-writable path (e.g., `/tmp/host-logs`) in `EphemeralWorkerService.copyWorkTargetLogSnapshots`, or pre-create `/host-logs` with appropriate permissions in the dev-bot image/entrypoint.
   - Add a guard: on permission errors, skip host-log copy and continue task execution (log a warning).

2) Surface failures to tasks
   - When worker bootstrap fails, mark the task `failed` with the error message so it does not remain "active".

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

---

## Rerun Validation (2025-11-21)

### Task ID
`task-analysis-24eae827-9e56-45bc-87fd-2503b294e250` - Prod validation: pipeline drift check (rerun)

### Fixes Applied Since Initial Validation

The following commits have been merged to address the issues identified in the initial validation:

#### Fix 1: Recovery Parsing & Completion Endpoint (cc25662)
**Date:** 2025-11-21 12:29:56 UTC

**Changes:**
- `backend/src/services/recoveryAgent.service.ts`: Improved JSON parsing robustness
  - Added control character stripping for malformed output
  - Added support for fenced JSON blocks (```json ... ```)
  - Fallback search from end of output for most relevant JSON
  - Extracted validation into separate `validateRecoveryResponse()` method
- `backend/src/services/taskPromptTemplates.ts`: Fixed completion endpoint URL
  - Changed from `http://host.docker.internal:5000/` to `https://app-monitor.joshwentworth.com/`
- `backend/src/services/workTargetDocumentation.ts`: Fixed log path for dev-monitor target
  - Changed from `/workspace/host-logs/` to `/tmp/host-logs/`

#### Fix 2: Credentials & Auto-Merge Gating (e64bf2a)
**Date:** 2025-11-21 12:52:48 UTC

**Changes:**
- `backend/src/services/devbot/DevBotCredentialsManager.ts`: Full credential discovery
  - Added `findCodexCredentials()` for `.codex/auth.json`
  - Added `findGeminiDirectory()` for entire `~/.gemini` folder
  - Added env var support for `GEMINI_API_KEY`, `GOOGLE_API_KEY`
- `backend/src/services/ephemeralWorker.service.ts`: Use new credential manager
- `backend/src/services/prConditionState.service.ts`: Auto-merge policy gating
  - Added `ENABLE_AUTO_MERGE` environment variable check
  - Prevents duplicate manual-intervention tasks for same PR
  - Creates human-intervention task instead of attempting auto-merge when disabled

### Validation Results

#### Fix Verification

| Issue | Fix Applied | Status | Notes |
|-------|-------------|--------|-------|
| **Completion endpoint** | URL changed to `https://app-monitor.joshwentworth.com/` | **VERIFIED** | Both success and failure curl commands updated in taskPromptTemplates.ts:938,945 |
| **Log path permission** | Changed to `/tmp/host-logs/` for dev-monitor | **PARTIAL** | Fixed for dev-monitor target; backend/frontend targets still use `/host-logs/` |
| **Recovery parsing** | JSON parsing improved with control char stripping and fenced block support | **VERIFIED** | New parseRecoveryResponse() with validateRecoveryResponse() |
| **Auto-merge spam** | `ENABLE_AUTO_MERGE` gating added | **VERIFIED** | Deduplication of manual-intervention tasks implemented |
| **Credential discovery** | Codex/Gemini credential mounting added | **VERIFIED** | Full `~/.gemini` directory now mounted |

#### Remaining Issues

1. **Log path partial fix**: The `backend` and `frontend` work targets in `workTargetDocumentation.ts` still reference `/host-logs/` instead of `/tmp/host-logs/`:
   - `backend`: Lines 254, 260
   - `frontend`: Lines 329, 335

2. **Database migration drift**: Pending migration 022 for `recovery_diagnosis` column still needs to be applied to production database.

3. **API authentication required**: Production API endpoints now require `X-API-Key` header, preventing external validation without credentials.

### Phase Test Validation

All 10 phase test files are present with 151 total tests:
- phaseExecution.service.test.ts (8 tests)
- artifactExtractor.service.test.ts (12 tests)
- recoveryAgent.service.test.ts (9 tests)
- phaseSystem.e2e.test.ts (13 tests)
- taskQueuePhase.integration.test.ts (20 tests)
- phaseOrchestrator.service.test.ts (22 tests)
- Phase1-2Validators.test.ts (15 tests)
- Phase3-4Validators.test.ts (19 tests)
- Phase5-7Validators.test.ts (19 tests)
- phase-integration.test.ts (14 tests)

### Metrics

| Metric | Value |
|--------|-------|
| Files modified for fixes | 6 |
| Lines added | 192 |
| Lines removed | 50 |
| Test files validated | 10/10 |
| Total test count | 151 |

### Recommendations

1. **Complete log path fix**: Apply `/tmp/host-logs/` change to `backend` and `frontend` work targets in `workTargetDocumentation.ts`

2. **Apply database migration**: Run migration 022 on production database to add `recovery_diagnosis` column

3. **Production re-test**: After remaining fixes, run end-to-end pipeline test with:
   ```bash
   curl -X POST https://app-monitor.joshwentworth.com/api/dev-bots/tasks \
     -H "X-API-Key: <key>" \
     -H "Content-Type: application/json" \
     -d '{"type": "analysis", "title": "Pipeline validation test"}'
   ```

4. **Monitor phase progression**: Verify tasks progress beyond phase 1 (Planning) and complete or fail with surfaced error messages

### Conclusion

The critical fixes for completion endpoint, recovery parsing, credential discovery, and auto-merge gating have been successfully implemented and verified in the codebase. The log path fix is partially complete (dev-monitor target only). Production validation requires API key access and database migration application before full end-to-end testing can confirm the fixes resolve all issues.
