# Production Pipeline Drift Check Report

**Date:** 2025-11-21
**Task ID:** task-analysis-9b664c58-e04b-404d-bb5f-761d3b442232
**Environment:** Production (code-based validation)
**Validation Method:** Static code analysis + comparison with previous validation findings

---

## Executive Summary

This report validates the production dev-bot pipeline against the previous validation findings from `task-analysis-83d5a4a4-5e5a-496e-9c36-fe9575a56c62` (2025-11-21). The analysis compares the current codebase state against identified issues and evaluates remediation status.

### Key Findings Summary

| Issue Category | Previous Status | Current Status | Remediation |
|---------------|-----------------|----------------|-------------|
| Worker Startup (Log Copy) | CRITICAL | IMPROVED | Error handling added |
| Migration Drift (`recovery_diagnosis`) | CRITICAL | FIXED | Column exists in migration 026 |
| Credential Delivery | HIGH | FIXED | Tar-based copy pattern implemented |
| Auto-merge Policy Mismatch | MEDIUM | DOCUMENTED | Known limitation |
| Task Failure Surfacing | HIGH | IMPROVED | Better error logging |

**Overall Pipeline Health:** IMPROVED (Yellow -> Green-Yellow)

---

## 1. Issue Resolution Analysis

### 1.1 Worker Startup Failure (Log Copy Permission Denied)

**Previous Issue:**
> `mkdir: can't create directory '/host-logs/': Permission denied` thrown by `EphemeralWorkerService.copyHostDirectoryToContainer`

**Current Status: IMPROVED**

The `copyWorkTargetLogSnapshots` method (line 667-700) now includes:
- **Graceful degradation**: Catches copy errors and logs warning instead of crashing
- **Path existence checks**: Verifies host paths exist before attempting copy
- **Error isolation**: Individual log copy failures don't abort the entire worker setup

```typescript
// Current implementation (lines 690-698)
} catch (error) {
  logger.error({
    category: 'process',
    action: 'work_target_log_snapshot_failed',
    message: `Failed to copy ${logPath.description} for ${workTarget}`,
    error,
    details: { workTarget, hostPath: logPath.hostPath, containerPath: logPath.containerPath }
  });
}
```

**Recommendation:** While error handling is improved, the root cause (container directory permissions) should still be addressed by:
1. Pre-creating container directories with correct permissions in the Docker image
2. Running setup scripts as root before switching to node user

---

### 1.2 Migration Drift (`recovery_diagnosis` Column)

**Previous Issue:**
> `table task_stage_runs has no column named recovery_diagnosis`

**Current Status: FIXED**

Migration 026 (`026_phase_system.sql`) includes the column definition:

```sql
CREATE TABLE IF NOT EXISTS task_stage_runs (
  ...
  recovery_diagnosis TEXT, -- JSON recovery agent response if recovery was triggered
  ...
);
```

**Verification Steps for Production:**
1. Run pending migrations on production database
2. Verify column exists: `PRAGMA table_info(task_stage_runs);`
3. Confirm no SQL errors in recent task executions

---

### 1.3 Credential Delivery Hardening

**Previous Issue:**
> Historical failures show missing codex/gemini credentials

**Current Status: FIXED**

Three commits addressed credential delivery:
- `4a49fce`: "harden worker credential delivery" - Added robust error handling
- `34aca43`: "copy codex auth + logs without binds" - Tar-based copy pattern
- `7cc7f2e`: "fix: creds" - Additional fixes

Current implementation uses `tar-fs` for atomic credential delivery:
- Codex: `syncCodexCredentials()` (lines 702-745)
- Gemini: `syncGeminiCredentials()` (lines 747-790)

Both methods:
- Check for credential directory existence
- Log warnings when credentials are missing
- Use tar archive for reliable cross-filesystem copy

---

### 1.4 Auto-merge Policy Mismatch

**Previous Issue:**
> Automated merge attempts for PRs fail because GitHub repo auto-merge is disabled (`enablePullRequestAutoMerge`)

**Current Status: DOCUMENTED (Not Fixed)**

The Phase 7 PR Shepherding validator (`Phase7PRShepherdingValidator.ts`) validates 8 merge gates:
1. `base_branch_updated`
2. `no_merge_conflicts`
3. `review_comments_resolved`
4. `change_requests_addressed`
5. `ci_checks_passing`
6. `copilot_review_complete`
7. `task_verification_passed`
8. `final_validation_clean`

**Known Limitation:** If GitHub repo has auto-merge disabled, Phase 7 will repeatedly attempt to trigger auto-merge. This generates noise and consumes queue capacity.

**Recommendation:**
1. Enable auto-merge in GitHub repository settings, OR
2. Implement detection of repo auto-merge capability before attempting
3. Add rate limiting for repeated merge attempts on same PR

---

### 1.5 Task Failure Surfacing

**Previous Issue:**
> Task remains "active" with no surfaced failure reason when worker bootstrap fails

**Current Status: IMPROVED**

The `createEphemeralWorker` method (lines 533-541) now includes comprehensive error logging:

```typescript
} catch (error) {
  logger.error({
    category: 'process',
    action: 'failed_to_create_ephemeral_worker',
    message: `Failed to create ephemeral worker ${workerId}:`,
    error: error
  });
  throw error;
}
```

**Remaining Gap:** While errors are logged, the task status update to "failed" may still require orchestration-level handling.

---

## 2. Per-Phase Timing Analysis (Architecture Review)

Based on the task-queue architecture documentation:

| Phase | Name | Expected Duration | Bottleneck Risk |
|-------|------|------------------|-----------------|
| 1 | Planning | 30-60s | Low |
| 2 | Implementation | 60-600s | AI response time |
| 3 | Review | 30-120s | File complexity |
| 4 | Fixes | 60-180s | Issue count |
| 5 | Test Coverage | 120-600s | **HIGH** - Test execution |
| 6 | Cleanup & Docs | 30-90s | Low |
| 7 | PR Shepherding | 300-3600s | CI/CD wait time |

**Total Pipeline Duration:**
- Happy Path: 9.5 - 75 minutes
- With Review Loop (2x): 12.5 - 85 minutes
- Maximum (4 retry attempts): 20 - 120 minutes

**Observability Infrastructure:**
- Phase metrics service: `backend/src/services/phaseMetrics.service.ts`
- 5-minute in-memory cache for performance
- API endpoints: `GET /api/dev-bots/phases/metrics`

---

## 3. Auth/Logging/PR-Sync Assessment

### 3.1 Authentication

**Current State:**
- Environment variables: `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GITHUB_TOKEN`
- No automated key rotation
- Key validation on startup: NOT IMPLEMENTED

**Risk Level:** MEDIUM

**Recommendations:**
1. Add startup validation to verify API key validity
2. Implement key expiration monitoring
3. Add circuit breakers for each external API (currently only Docker has circuit breaker)

### 3.2 Logging

**Current State:**
- Structured logging with categories
- Per-task log files via `WorkerLogService`
- Consolidated log at `dev-bots/logs/dev-bots.log`

**Categories Identified:**
- `process`, `automation`, `phase`, `dev-bots`, `docker`, `context`, `quality`, `api`

**Issues:**
- Some category inconsistency (e.g., `dev-bots` vs `devBots`)
- No log retention policy implemented
- No log rotation

**Recommendations:**
1. Standardize on kebab-case categories
2. Implement 7-day log retention
3. Add log rotation at 100MB

### 3.3 PR Synchronization

**Current State:**
- PR tracking via `pr_metadata` table
- Manual sync: `POST /api/dev-bots/pr-sync`
- PR status caching: `PRCacheService`

**Improvements Since Last Validation:**
- `PRCacheService` added for reducing GitHub API calls
- Timeout protection on GitHub CLI calls (`GITHUB_API_TIMEOUT_MS`)

**Remaining Gaps:**
- No webhook-based PR updates (still polling)
- Rate limit handling could be more robust

---

## 4. Drift Detection Summary

### Code Drift from Main

The following recent commits (since 2025-11-20) have been analyzed:

| Commit | Description | Impact |
|--------|-------------|--------|
| `071a8c9` | Merge staging | CI/test fixes integrated |
| `7cc7f2e` | fix: creds | Credential delivery fixed |
| `31bc195` | validation report | Documentation |
| `68efd42` | fix: tests | Test stability |
| `34aca43` | copy codex auth | Credential handling |
| `4a49fce` | harden worker credential | Security improvement |

### Schema Drift

**Production Database Risk:**
Migration 026 adds critical phase system columns. If not applied:
- `phase_index`, `phase_name`, `phase_status`, `phase_attempts`, `phase_payload` columns missing
- `task_stage_runs` table missing or incomplete

**Verification Command:**
```sql
SELECT sql FROM sqlite_master WHERE name = 'task_stage_runs';
```

---

## 5. Metrics Summary

### 5.1 Code Quality Metrics

| Metric | Status |
|--------|--------|
| Migration coverage | 31 migrations present |
| Error handling | IMPROVED |
| Logging consistency | PARTIAL |
| Type safety | Strong (TypeScript) |

### 5.2 Operational Readiness

| Component | Ready for Prod |
|-----------|---------------|
| Phase execution | YES |
| Error recovery | YES |
| Credential delivery | YES |
| Log management | PARTIAL |
| PR automation | PARTIAL |

---

## 6. Recommendations

### 6.1 Critical (Before Heavy Prod Use)

1. **Apply Migrations:** Ensure all migrations up to 031 are applied to production database
2. **Verify Credentials:** Confirm all API keys are present and valid in production environment
3. **Test Worker Startup:** Execute test task to verify worker creation succeeds

### 6.2 High Priority (Within 1 Week)

4. **Add API Key Validation:** Implement startup checks for all required credentials
5. **Fix Auto-merge Detection:** Check repo settings before attempting auto-merge
6. **Implement Log Retention:** Add cleanup job for logs older than 7 days

### 6.3 Medium Priority (Within 1 Month)

7. **Webhook PR Updates:** Replace polling with GitHub webhook for real-time PR status
8. **Circuit Breakers:** Add circuit breakers for Claude/OpenAI/Gemini APIs
9. **Standardize Logging:** Enforce consistent category naming across codebase

---

## 7. Conclusion

### Risk Assessment

**Overall Risk Level:** MEDIUM-LOW (Improved from MEDIUM)

| Area | Risk | Trend |
|------|------|-------|
| Architecture | LOW | Stable |
| Error Handling | LOW | Improved |
| Authentication | MEDIUM | Unchanged |
| Logging | MEDIUM | Unchanged |
| PR Sync | MEDIUM | Improved |
| Performance | LOW | Stable |

### Go/No-Go Recommendation

**Recommendation:** GO with conditions

**Conditions:**
1. Verify production database has all migrations applied
2. Confirm worker can start successfully with test task
3. Monitor first 24 hours for new failure patterns
4. Have rollback plan ready

---

## Appendix A: Files Analyzed

- `backend/src/services/ephemeralWorker.service.ts`
- `backend/src/services/githubPR.service.ts`
- `backend/src/services/phaseValidation/Phase7PRShepherdingValidator.ts`
- `backend/src/services/workTargetDocumentation.ts`
- `backend/migrations/026_phase_system.sql`
- `docs/prod-dev-bot-validation.md`
- `PROD_PIPELINE_VALIDATION_REPORT.md`

## Appendix B: Verification Commands

```bash
# Check migration status
sqlite3 /opt/app-monitor/shared/backend/data/app-monitor.db "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# Verify task_stage_runs schema
sqlite3 /opt/app-monitor/shared/backend/data/app-monitor.db "PRAGMA table_info(task_stage_runs);"

# Check recent task failures
sqlite3 /opt/app-monitor/shared/backend/data/app-monitor.db "SELECT id, status, phase_status FROM tasks WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 10;"

# Test API health
curl -s http://localhost:5002/api/dev-bots/status | jq .
```

---

**Report Generated By:** Claude (Documentation Specialist)
**Validation Method:** Static code analysis + architecture review
**Comparison Baseline:** task-analysis-83d5a4a4-5e5a-496e-9c36-fe9575a56c62
