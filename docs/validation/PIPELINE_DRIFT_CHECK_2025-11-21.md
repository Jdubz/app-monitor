# Production Pipeline Drift Check Report

**Date:** 2025-11-21
**Task ID:** task-analysis-9b664c58-e04b-404d-bb5f-761d3b442232
**Validation Type:** Static code analysis + production log correlation
**Environment:** Production (app-monitor.joshwentworth.com, backend port 5002)

---

## Executive Summary

This validation analyzes the production dev-bot pipeline for drift between documented architecture and actual implementation, measuring per-phase timing capabilities, and surfacing auth/logging/PR-sync failure patterns to determine production health.

### Health Assessment: DEGRADED

| Area | Status | Risk Level |
|------|--------|------------|
| Pipeline Architecture | Implemented | LOW |
| Phase Transitions | Consistent | LOW |
| Auth Validation | Weak | MEDIUM |
| PR Sync | Event-driven | MEDIUM |
| Logging | Inconsistent | MEDIUM |
| Production Runtime | Failing | HIGH |

### Key Findings Summary

1. **Production Runtime Issues** - Worker startup failures blocking task execution
2. **Database Migration Drift** - Missing `recovery_diagnosis` column in prod
3. **Auth Validation Gaps** - No startup validation for GitHub token permissions
4. **Logging Inconsistencies** - 44 categories defined, inconsistent naming
5. **Documentation Drift** - Phase 5 routing documented differently than implemented

---

## 1. Pipeline Architecture Validation

### 7-Phase System Verification

The 7-phase task lifecycle is **correctly implemented** as documented:

| Phase | Name | Implementation Status | Code Location |
|-------|------|----------------------|---------------|
| 1 | Planning | Implemented | `Phase1PlanningValidator.ts` |
| 2 | Implementation | Implemented | `Phase2ImplementationValidator.ts` |
| 3 | Review | Implemented | `Phase3ReviewValidator.ts` |
| 4 | Fixes | Implemented | `Phase4FixesValidator.ts` |
| 5 | Test & Validate | Implemented | `Phase5TestValidator.ts` |
| 6 | Cleanup & Docs | Implemented | `Phase6CleanupValidator.ts` |
| 7 | PR Shepherding | Implemented | `Phase7PRShepherdingValidator.ts` |

### Phase Transition Verification

**Phase 3-4 Loop:** CONSISTENT
- Documentation: "Phase 4 always returns to Phase 3 for re-review"
- Code: `nextPhase: 3` comment in Phase4FixesValidator.ts:156
- Max combined attempts: 8 (4 per phase)

**Phase 5 Internal Loop:** MINOR DRIFT
- Documentation: "Phase 5 validator returns `nextPhase = 5` when tests fail"
- Reality: Validator returns `allTestsPassing` boolean flag
- Orchestrator handles routing via `PhaseOrchestrator.determineNextPhase()`
- **Impact:** Low - cleaner separation of concerns, but documentation misleading

### Recovery Agent Integration

- **Documentation:** "Always enabled, analyzes failures"
- **Code:** Optionally called via `canRecover` check
- **Status:** DRIFT - Recovery is conditionally available, not mandatory
- **Location:** `phaseExecution.service.ts:136-137`

---

## 2. Per-Phase Timing Analysis

### Timing Infrastructure

The `PhaseMetricsService` (backend/src/services/phaseMetrics.service.ts) provides comprehensive timing metrics:

```typescript
interface PhaseStats {
  phaseIndex: number;
  phaseName: string;
  totalRuns: number;
  averageDurationMs: number | null;
  minDurationMs: number | null;
  maxDurationMs: number | null;
  successRate: number;
}
```

### Expected Phase Durations (from documentation)

| Phase | Expected Duration | Source |
|-------|-------------------|--------|
| 1 - Planning | 30-60s | Auto-detection API calls, file scans |
| 2 - Implementation | 60-600s | Container provision + AI execution |
| 3 - Review | 30-120s | Code analysis, fingerprinting |
| 4 - Fixes | 60-180s | Issue remediation |
| 5 - Test & Validate | 120-600s | Test execution, internal loops |
| 6 - Cleanup & Docs | 30-90s | Documentation updates |
| 7 - PR Shepherding | 300-3600s | CI/CD, review waiting |

### Timing API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/dev-bots/phases/metrics` | Aggregated phase metrics |
| `GET /api/dev-bots/phases/:phaseIndex/metrics` | Phase-specific metrics |
| `GET /api/dev-bots/tasks/:taskId/phases` | Task phase history |
| `POST /api/dev-bots/phases/metrics/refresh` | Force cache refresh |
| `GET /api/observability/diagnostics/slow_phases` | Phases >5 minutes |

### Observability Infrastructure

The `PhaseObservabilityService` provides:
- Task execution tracing (`/api/observability/tasks/:taskId/trace`)
- Anomaly detection (`/api/observability/anomalies`)
- Diagnostic queries (5 pre-built queries)
- Stuck task detection (>30min with no progress)

---

## 3. Auth/Logging/PR-Sync Failure Analysis

### 3.1 Authentication Issues

#### API Key Authentication
- **Location:** `backend/src/middleware/auth.ts`
- **Issue:** Uses basic string comparison, not timing-safe
- **Risk:** Potential timing attack vulnerability
- **Code:**
  ```typescript
  if (apiKey !== config.apiKey) { // Vulnerable
  ```

#### GitHub Token Handling
- **Location:** `backend/src/services/devbot/DevBotCredentialsManager.ts`
- **Issues Identified:**
  1. No validation of token permissions at startup
  2. No token expiration detection
  3. Token passed directly to containers without scope checking
- **Production Impact:** Tasks can fail silently if token lacks required permissions

#### GitHub Webhook Signature
- **Status:** GOOD - Uses HMAC-SHA256 with timing-safe comparison
- **Location:** `backend/src/services/githubWebhookHandler.service.ts`

### 3.2 Logging Inconsistencies

#### Category Naming Drift

| Pattern | Examples | Count |
|---------|----------|-------|
| Hyphenated | `pr-workflow`, `pr-sync`, `pr-cache` | 4 |
| Underscored | `task_context`, `admin_bot_chat` | 2 |
| Mixed | `quality-gates` vs `quality-observation` | 3 |

#### Usage Statistics (Top 10)

| Rank | Category | Usage Count | Purpose |
|------|----------|-------------|---------|
| 1 | `process` | 178 | Worker lifecycle |
| 2 | `pr-workflow` | 138 | PR operations |
| 3 | `phase` | 37 | Phase orchestration |
| 4 | `docker` | 31 | Container ops |
| 5 | `database` | 28 | DB operations |
| 6 | `recovery` | 27 | Recovery agent |
| 7 | `system` | 26 | System events |
| 8 | `automation` | 26 | Agent selection |
| 9 | `pr-sync` | 19 | PR sync service |
| 10 | `plan` | 18 | AI planning |

#### Auth Logging Gap
- Auth middleware uses `category: 'api'`
- GitHub webhook handler uses `category: 'pr-workflow'`
- No centralized auth logging category

### 3.3 PR Sync Issues

#### Current Implementation
- **Type:** Event-driven (triggered every N task completions)
- **Threshold:** Configurable via `PR_SYNC_TASK_THRESHOLD` (default: 10)
- **Service:** `prSync.service.ts`

#### Dual-Source Pattern
The PR sync queries BOTH:
1. `pr_condition_states` table (primary)
2. `tasks` table with pr_number (legacy fallback)

**Risk:** Potential inconsistencies between sources

#### 8 Merge Gate Conditions
1. CI Checks Passing
2. Comments Resolved
3. No Merge Conflicts
4. Branch Updated
5. No Change Requests
6. Task Verification
7. Copilot Review Complete
8. Final Validation Passed (score >= 80/100)

#### Production Issues Identified
From `docs/prod-dev-bot-validation.md`:
- Auto-merge attempts fail due to GitHub repo policy mismatch
- Generates repetitive `manual-intervention` tasks
- PRs #291/#292 blocked by `enablePullRequestAutoMerge` being disabled

---

## 4. Production Runtime Status

### Current Blocking Issues (from prior validation)

#### Issue 1: Worker Startup Permission Failure
```
Error: mkdir: can't create directory '/host-logs/': Permission denied
Source: EphemeralWorkerService.copyHostDirectoryToContainer
```
**Impact:** Workers abort immediately, tasks remain "active" with no error surfaced

#### Issue 2: Database Migration Drift
```
Error: table task_stage_runs has no column named recovery_diagnosis
```
**Impact:** Recovery system cannot record diagnoses, affecting observability

#### Issue 3: Repeated Silent Retries
- Tasks show "Attempt 1 failed" but no error message in API
- Queue shows 1 active, 1 pending; never progresses past Phase 1

#### Issue 4: Credential/File Failures
- Missing codex/gemini credentials
- Missing dev-bot log directories
- Heartbeat timeouts

### Queue Health Snapshot
- **Success Rate:** ~18.6%
- **Failed Tasks:** 35 recorded
- **Status:** CRITICAL

---

## 5. Architecture Drift Summary

### Documented vs Implemented

| Component | Documentation | Implementation | Drift Level |
|-----------|--------------|----------------|-------------|
| Phase routing | Validators control | Orchestrator controls | MINOR |
| Recovery agent | Always enabled | Conditionally called | MINOR |
| Phase 5 loop | Validator returns phase | Validator returns boolean | MINOR |
| PR sync | Event-driven | Event-driven | NONE |
| API auth | Timing-safe | Basic comparison | DRIFT |
| GitHub token | Validated | Pass-through | DRIFT |
| Logging categories | Standardized | Inconsistent naming | DRIFT |

### Configuration Validation Gaps

| Variable | Documentation | Validated at Startup |
|----------|--------------|---------------------|
| `GITHUB_TOKEN` | Required | NO |
| `GITHUB_WEBHOOK_SECRET` | Required | Only via HMAC |
| `API_KEY` | Required | NO |
| `MAX_PHASE_ATTEMPTS` | Default: 4 | NO (no range check) |

---

## 6. Metrics Summary

### What CAN Be Measured

| Metric | API Endpoint | Availability |
|--------|-------------|--------------|
| Phase success rates | `/api/dev-bots/phases/metrics` | Available |
| Phase durations | `/api/dev-bots/phases/metrics` | Available |
| Loop iterations | `/api/observability/diagnostics/loop_iterations` | Available |
| Recovery effectiveness | `/api/observability/diagnostics/recovery_effectiveness` | Available |
| Active task distribution | `/api/dev-bots/phases/metrics` | Available |
| Anomaly detection | `/api/observability/anomalies` | Available |

### What CANNOT Be Measured (Production Blocked)

Due to worker startup failures, the following cannot be measured:
- Actual container provision time
- Real phase execution durations
- PR sync effectiveness under load
- Recovery agent success rates in production

---

## 7. Recommendations

### Critical (Immediate)

1. **Fix Worker Startup Permission**
   - Change log snapshot target to `/tmp/host-logs`
   - Add guard: skip host-log copy on permission error
   - Location: `EphemeralWorkerService.copyWorkTargetLogSnapshots`

2. **Apply Database Migrations**
   - Run pending migrations on production DB
   - Add `recovery_diagnosis` column to `task_stage_runs`
   - Path: `/opt/app-monitor/shared/backend/data/app-monitor.db`

3. **Surface Worker Failures to Tasks**
   - When worker bootstrap fails, mark task `failed` with error
   - Don't leave tasks in "active" state indefinitely

### High Priority (This Week)

4. **Add Timing-Safe API Key Comparison**
   - Replace `apiKey !== config.apiKey` with `crypto.timingSafeEqual`
   - Location: `backend/src/middleware/auth.ts`

5. **Add GitHub Token Validation**
   - Validate token permissions at startup
   - Check required scopes: `repo`, `workflow`, `pull_request`
   - Location: `DevBotCredentialsManager.ts`

6. **Align PR Auto-Merge Policy**
   - Either enable auto-merge in GitHub repo settings
   - Or disable auto-merge attempts in bot
   - Suppress repetitive `manual-intervention` task creation

### Medium Priority (This Sprint)

7. **Standardize Logging Categories**
   - Use hyphenated names consistently
   - Create centralized `auth` category
   - Document category usage guidelines

8. **Add Configuration Validation**
   - Validate all required env vars at startup
   - Add range checks for numeric values
   - Fail fast if critical secrets missing

9. **Update Documentation**
   - Correct Phase 5 routing description
   - Document recovery agent optionality
   - Update auth validation requirements

---

## 8. Health Decision

### Current State: NOT HEALTHY

**Reasons:**
1. Workers cannot start (permission failure)
2. Database schema out of sync
3. Tasks stuck in "active" state
4. 18.6% success rate
5. Multiple unresolved blocking issues

### Go/No-Go Recommendation

**Recommendation:** NO-GO for heavy production use

**Conditions for GO:**
1. Resolve worker startup permission issue
2. Apply database migrations
3. Fix task failure surfacing
4. Achieve >70% success rate on test batch
5. Validate end-to-end task completion (all 7 phases)

### Re-Validation Steps

1. Apply fixes listed in Critical recommendations
2. Submit read-only validation task
3. Monitor `/api/dev-bots/status` and `/queue`
4. Expect phase progression beyond Planning
5. Document actual phase timings when successful

---

## Appendix A: Key Service Locations

| Service | File | Lines |
|---------|------|-------|
| Task Execution | `taskExecution.service.ts` | 1018 |
| Phase Orchestrator | `phaseOrchestrator.service.ts` | ~300 |
| Phase Metrics | `phaseMetrics.service.ts` | 436 |
| PR Condition State | `prConditionState.service.ts` | 1589 |
| PR Sync | `prSync.service.ts` | ~300 |
| Ephemeral Worker | `ephemeralWorker.service.ts` | 1750 |
| Credentials Manager | `DevBotCredentialsManager.ts` | 260 |
| Auth Middleware | `middleware/auth.ts` | ~60 |

## Appendix B: API Endpoints for Monitoring

```bash
# Health & Status
GET /api/dev-bots/status
GET /api/dev-bots/health

# Phase Metrics
GET /api/dev-bots/phases/metrics
GET /api/dev-bots/phases/:phaseIndex/metrics
POST /api/dev-bots/phases/metrics/refresh

# Task Management
GET /api/dev-bots/tasks/:taskId/detail
GET /api/dev-bots/tasks/:taskId/phases

# Observability
GET /api/observability/tasks/:taskId/trace
GET /api/observability/anomalies
GET /api/observability/diagnostics
GET /api/observability/diagnostics/:queryId

# PR Sync
POST /api/dev-bots/pr-sync
```

---

**Report Generated By:** Claude (Documentation Specialist)
**Validation Method:** Static code analysis + production log correlation
**Files Analyzed:** 50+ service files across backend/src/
**Documentation Cross-Referenced:** 26 architecture/guide documents
