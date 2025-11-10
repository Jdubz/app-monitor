# PR Workflow Quality Gates Documentation

**Version**: 1.0
**Last Updated**: 2025-11-10
**Status**: Production Ready

## Table of Contents

1. [Overview](#overview)
2. [Quality Gate Architecture](#quality-gate-architecture)
3. [Individual Quality Gates](#individual-quality-gates)
4. [Decision Flow](#decision-flow)
5. [Monitoring & Metrics](#monitoring--metrics)
6. [Troubleshooting Guide](#troubleshooting-guide)
7. [Example Scenarios](#example-scenarios)

## Overview

The PR Workflow Quality Gates system provides automated validation and quality checks for pull requests created by the dev-bots system. It ensures that PRs meet defined quality standards before being auto-merged, and creates followup tasks when issues are detected.

### Key Features

- **Automated Quality Validation**: 6 independent quality gates
- **Real-time Monitoring**: Webhook-driven event processing
- **Comprehensive Audit Trail**: Full metrics and logging
- **Intelligent Task Creation**: Automatic followup tasks for issues
- **Zero Manual Intervention**: Fully automated merge decisions

### System Components

- **GitHubWebhookHandler**: Receives and routes GitHub webhook events
- **PRMonitorService**: Business logic for PR workflow decisions
- **TaskVerificationService**: Validates implementation against acceptance criteria
- **ReviewCommentTracker**: Tracks and manages review comment resolution
- **Quality Gate Metrics**: Real-time statistics via `/api/github/webhooks/pr-workflow/metrics`

## Quality Gate Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Webhook Events                        │
│         (pull_request, check_suite, pull_request_review)        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Orphaned PR Detection                         │
│  • Is PR associated with a task?                                 │
│  • Is it a system-created PR? → Auto-adopt                      │
│  • User-created PR? → Manual tracking available                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Get PR Status & Analysis                      │
│  • CI Check Status (passed/failed)                              │
│  • Copilot Review Analysis (severity: none/low/medium/high)     │
│  • Human Reviews (approved/changes_requested)                   │
│  • Merge Conflicts (mergeable/conflicting)                      │
│  • Review Comments (resolved/unresolved)                        │
│  • Task Verification (passed/failed)                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Quality Gate Evaluation                        │
│                 (shouldCreateFollowup check)                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                   ┌────────┴────────┐
                   │                 │
                   ▼                 ▼
         ┌──────────────┐   ┌──────────────┐
         │ Issues Found │   │  All Gates   │
         │   (Blocked)  │   │    Passed    │
         └──────┬───────┘   └──────┬───────┘
                │                  │
                ▼                  ▼
    ┌───────────────────┐  ┌──────────────┐
    │ Create Followup   │  │  Auto-Merge  │
    │      Task         │  │  Eligible    │
    └───────────────────┘  └──────┬───────┘
                                   │
                                   ▼
                           ┌───────────────┐
                           │  Merge with   │
                           │  Strategies   │
                           │ (squash/rebase│
                           │   /merge)     │
                           └───────────────┘
```

## Individual Quality Gates

### Gate 1: CI Checks Status

**Location**: `prMonitor.service.ts:225-230`

**Validation**:
```typescript
const hasFailedChecks = prStatus.checks.some(c =>
  c.status === 'failure' || c.status === 'error'
);
```

**Blocks Auto-Merge**: ✅ Yes
**Triggers Followup**: ✅ Yes

**Common Failures**:
- TypeScript compilation errors
- Linting failures
- Test failures
- Build failures

**Resolution**: Followup task created to fix failing checks

---

### Gate 2: Copilot Review Severity

**Location**: `prMonitor.service.ts:232-235`

**Validation**:
```typescript
if (copilotAnalysis.severity === 'high' || copilotAnalysis.severity === 'medium') {
  return true; // Create followup
}
```

**Blocks Auto-Merge**: ✅ Yes (for medium/high severity)
**Triggers Followup**: ✅ Yes

**Severity Levels**:
- **high**: 3+ blocking issues detected
- **medium**: 1-2 blocking issues detected
- **low**: Only suggestions/nitpicks
- **none**: No comments

**Blocking Issue Detection** (5-tier priority system):
1. **Priority 1**: Explicit markdown tags (`**Critical Bug:**`, `**Security concern:**`)
2. **Priority 2**: Bracketed indicators (`[critical]`, `[blocking]`)
3. **Priority 3**: Strong keyword patterns (security vulnerability, critical bug)
4. **Priority 4**: Weak patterns with context validation
5. **Priority 5**: Suggestion patterns (fallback)

**Resolution**: Followup task created to address blocking issues

---

### Gate 3: Human Review Status

**Location**: `prMonitor.service.ts:237-243`

**Validation**:
```typescript
const hasChangeRequests = prStatus.reviews.some(r =>
  r.state === 'CHANGES_REQUESTED' && !r.author.toLowerCase().includes('copilot')
);
```

**Blocks Auto-Merge**: ✅ Yes
**Triggers Followup**: ✅ Yes

**Review States**:
- `APPROVED`: Review approved
- `CHANGES_REQUESTED`: Reviewer requests changes (blocks merge)
- `COMMENTED`: Comments only (doesn't block)

**Resolution**: Followup task created to address human feedback

---

### Gate 4: Merge Conflicts

**Location**: `prMonitor.service.ts:245-249`

**Validation**:
```typescript
if (prStatus.mergeable === 'CONFLICTING') {
  return true; // Create followup
}
```

**Blocks Auto-Merge**: ✅ Yes
**Triggers Followup**: ✅ Yes

**Mergeable States**:
- `MERGEABLE`: Can be merged cleanly
- `CONFLICTING`: Has merge conflicts
- `UNKNOWN`: GitHub still calculating

**Resolution**: Followup task created to resolve conflicts

---

### Gate 5: Unresolved Review Comments

**Location**: `prMonitor.service.ts:250-260`

**Validation**:
```typescript
const resolutionSummary = this.reviewCommentTracker.getResolutionSummary(prNumber);
if (resolutionSummary.unresolvedBlocking > 0) {
  return true; // Create followup
}
```

**Blocks Auto-Merge**: ✅ Yes (only for blocking severity comments)
**Triggers Followup**: ✅ Yes

**Comment Tracking**:
- Comments stored with SHA-256 fingerprints (`file:line:body`)
- Resolution detected on PR synchronize events
- Severity classification: `blocking`, `suggestion`, `info`, `nitpick`

**Database Schema**:
```sql
CREATE TABLE pr_review_comments (
  id INTEGER PRIMARY KEY,
  pr_number INTEGER NOT NULL,
  comment_id INTEGER NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  severity TEXT CHECK(severity IN ('blocking', 'suggestion', 'info', 'nitpick')),
  resolved BOOLEAN DEFAULT 0,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
```

**Resolution**: Followup task created to resolve blocking comments

---

### Gate 6: Task Verification

**Location**: `prMonitor.service.ts:262-275`

**Validation**:
```typescript
if (task && task.verification_passed === false) {
  return true; // Create followup
}
```

**Blocks Auto-Merge**: ✅ Yes (if < 80% acceptance criteria met)
**Triggers Followup**: ✅ Yes

**Verification Process**:
1. Runs when CI checks pass (check_suite webhook with `conclusion: 'success'`)
2. Validates implementation against task acceptance criteria
3. Checks scope boundaries, test coverage, code quality
4. Stores results in task queue database

**Pass Criteria**: ≥ 80% of acceptance criteria must be met

**Verification Results Stored**:
```typescript
{
  verification_passed: boolean,
  verification_results: string,  // JSON stringified TaskVerificationResult
  verification_timestamp: number
}
```

**Resolution**: Followup task created to meet acceptance criteria

## Decision Flow

### Complete PR Lifecycle

```
┌─────────────────────┐
│   PR Opened/Update  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Store Review        │◄────── Copilot reviews PR
│ Comments            │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ CI Checks Running   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Check Suite Complete│
└─────────┬───────────┘
          │
          ├──► conclusion === 'failure' ──► Create Followup Task
          │
          └──► conclusion === 'success'
                    │
                    ▼
          ┌─────────────────────┐
          │ Run Task            │
          │ Verification        │
          └─────────┬───────────┘
                    │
                    ├──► verification_passed === false ──► Create Followup Task
                    │
                    └──► verification_passed === true
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Detect Resolved     │
                    │ Comments            │
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Evaluate All        │
                    │ Quality Gates       │
                    └─────────┬───────────┘
                              │
                   ┌──────────┴──────────┐
                   │                     │
                   ▼                     ▼
          ┌────────────────┐    ┌────────────────┐
          │ Gates Blocked  │    │  All Passed    │
          └────────┬───────┘    └────────┬───────┘
                   │                     │
                   ▼                     ▼
          ┌────────────────┐    ┌────────────────┐
          │ Create Followup│    │  Auto-Merge    │
          │     Task       │    │      PR        │
          └────────────────┘    └────────┬───────┘
                                         │
                                         ▼
                                ┌────────────────┐
                                │ Track Metrics  │
                                │ (time-to-merge)│
                                └────────────────┘
```

### Auto-Merge Decision Logic

```
Can Auto-Merge?
├─ All CI Checks Passed? ────────────────────► No ──► Block
├─ Copilot Severity low/none? ───────────────► No ──► Block
├─ No Human Change Requests? ────────────────► No ──► Block
├─ No Merge Conflicts? ──────────────────────► No ──► Block
├─ All Blocking Comments Resolved? ──────────► No ──► Block
├─ Task Verification Passed (≥80%)? ─────────► No ──► Block
└─ All Conditions Met ──────────────────────► Yes ──► Auto-Merge
```

## Monitoring & Metrics

### Metrics Endpoint

**Endpoint**: `GET /api/github/webhooks/pr-workflow/metrics`

**Response Format**:
```json
{
  "success": true,
  "data": {
    "stats": {
      "pr_events_received": 150,
      "auto_merge_attempts": 45,
      "auto_merge_successes": 38,
      "auto_merge_failures": 7,
      "auto_merge_blocks": [
        { "reason": "Failed CI checks", "count": 12 },
        { "reason": "Copilot medium severity issues", "count": 8 },
        { "reason": "3 unresolved blocking comments", "count": 5 }
      ],
      "followup_tasks_created": 52,
      "task_verifications_run": 45,
      "task_verifications_passed": 38,
      "task_verifications_failed": 7,
      "review_comments_tracked": 234,
      "review_comments_resolved": 201,
      "orphaned_prs_adopted": 3,
      "merge_times": [3600000, 5400000, ...],
      "avg_time_to_merge_ms": 4200000
    },
    "metrics": {
      "auto_merge_rate": 84.44,
      "auto_merge_failure_rate": 15.56,
      "verification_pass_rate": 84.44,
      "comment_resolution_rate": 85.90,
      "avg_time_to_merge_hours": 1.17
    },
    "top_block_reasons": [
      { "reason": "Failed CI checks", "count": 12, "percentage": 26.67 },
      { "reason": "Copilot medium severity issues", "count": 8, "percentage": 17.78 },
      { "reason": "3 unresolved blocking comments", "count": 5, "percentage": 11.11 }
    ]
  }
}
```

### Key Performance Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| **Auto-Merge Rate** | ≥ 80% | Percentage of PRs successfully auto-merged |
| **Verification Pass Rate** | ≥ 80% | Percentage of PRs passing task verification |
| **Comment Resolution Rate** | ≥ 85% | Percentage of review comments resolved |
| **Avg Time-to-Merge** | < 2 hours | Average time from PR creation to merge |
| **Orphaned PRs** | 0 (>5 min) | System PRs unprocessed for >5 minutes |

### Audit Logging

All quality gate decisions are logged with structured data:

```typescript
logger.info({
  category: 'pr-workflow',
  action: 'followup_task_created_from_check_suite',
  message: `Created followup task ${followupTask.id} for PR #${prNumber}`,
  details: {
    pr_number: prNumber,
    task_id: followupTask.id,
    parent_task: task.id,
    block_reasons: ['Failed CI checks', 'Copilot medium severity issues']
  }
});
```

## Troubleshooting Guide

### Issue: PR Not Auto-Merging

**Symptoms**: PR has all checks passing but doesn't auto-merge

**Diagnostic Steps**:

1. **Check Metrics Endpoint**:
   ```bash
   curl http://localhost:5000/api/github/webhooks/pr-workflow/metrics
   ```

2. **Review Logs** for block reasons:
   ```bash
   journalctl -u app-monitor-backend -f | grep -A5 "followup_needed"
   ```

3. **Check Quality Gates**:
   - ✅ CI checks all passed?
   - ✅ Copilot severity low/none?
   - ✅ No human change requests?
   - ✅ No merge conflicts?
   - ✅ All blocking comments resolved?
   - ✅ Task verification passed (≥80%)?

4. **Common Causes**:
   - Unresolved blocking review comments
   - Task verification < 80%
   - Copilot detected medium/high severity issues
   - Human reviewer requested changes

**Resolution**: Check followup task description for specific issues

---

### Issue: Orphaned PR Not Adopted

**Symptoms**: System-created PR has no associated task

**Diagnostic Steps**:

1. **Check PR Branch Pattern**:
   - Branch name should match: `task-(implementation|investigation)-[hash]`
   - Example: `task-implementation-abc123def456`

2. **Check PR Author**:
   - Should be created by dev-bots system
   - Author: `dev-bot` or GitHub Actions

3. **Check Logs**:
   ```bash
   journalctl -u app-monitor-backend -f | grep "orphaned"
   ```

4. **Manual Adoption** (if needed):
   ```bash
   curl -X POST http://localhost:5000/api/dev-bots/pr/track \
     -H "Content-Type: application/json" \
     -d '{"prNumber": 123}'
   ```

**Resolution**: System should auto-adopt within 5 minutes

---

### Issue: Followup Tasks Not Created

**Symptoms**: PR has failing checks but no followup task created

**Diagnostic Steps**:

1. **Check Webhook Handler Status**:
   ```bash
   curl http://localhost:5000/api/github/webhooks/health
   ```

2. **Verify Task Queue Service**:
   ```bash
   curl http://localhost:5000/api/dev-bots/health
   ```

3. **Check Task Limits**:
   - Max followup depth: 3 levels
   - Max total followups: 5 per original task

4. **Review Logs**:
   ```bash
   journalctl -u app-monitor-backend -f | grep "followup_limit"
   ```

**Resolution**: Check if followup limits exceeded

---

### Issue: Comments Not Being Tracked

**Symptoms**: Review comments not showing as resolved

**Diagnostic Steps**:

1. **Check Database**:
   ```sql
   SELECT * FROM pr_review_comments WHERE pr_number = 123;
   ```

2. **Verify Comment IDs**:
   - Comments must have unique IDs
   - Fingerprint: SHA-256(`file:line:body`)

3. **Check Resolution Detection**:
   - Runs on PR synchronize events
   - Compares current comment IDs to stored comments

4. **Review Logs**:
   ```bash
   journalctl -u app-monitor-backend -f | grep "comment_resolution"
   ```

**Resolution**: Comments should auto-resolve on next PR sync

## Example Scenarios

### Scenario 1: Clean Auto-Merge (Happy Path)

**Timeline**:
1. Dev-bot creates PR #100 for `task-implementation-abc123`
2. GitHub Actions runs CI checks → All Pass ✅
3. Copilot reviews PR → No blocking issues (severity: low) ✅
4. Task verification runs → 95% criteria met ✅
5. No unresolved blocking comments ✅
6. Auto-merge triggered → Squash merge succeeds ✅

**Metrics Updated**:
- `auto_merge_attempts++`
- `auto_merge_successes++`
- `merge_times.push(time_to_merge)`

**Outcome**: PR merged automatically in ~1.5 hours

---

### Scenario 2: CI Failures Trigger Followup

**Timeline**:
1. Dev-bot creates PR #101 for `task-implementation-def456`
2. GitHub Actions runs CI checks → TypeScript errors ❌
3. Check suite webhook received with `conclusion: 'failure'`
4. Quality gates evaluate → Failed CI checks detected
5. Followup task created: "Fix TypeScript compilation errors in PR #101"

**Block Reason**: Failed CI checks

**Metrics Updated**:
- `followup_tasks_created++`
- `auto_merge_blocks.push({reason: 'Failed CI checks', count++})`

**Outcome**: Followup task assigned to dev-bot, original task blocked

---

### Scenario 3: Copilot Finds Critical Bug

**Timeline**:
1. Dev-bot creates PR #102 for `task-implementation-ghi789`
2. CI checks pass ✅
3. Copilot reviews → Detects **Critical Bug:** in implementation ❌
4. Review comment stored with severity: `blocking`
5. Copilot analysis severity: `high` (1+ blocking issues)
6. Quality gates evaluate → Medium/high severity detected
7. Followup task created with Copilot feedback

**Block Reason**: Copilot high severity issues

**Metrics Updated**:
- `review_comments_tracked++`
- `followup_tasks_created++`
- `auto_merge_blocks.push({reason: 'Copilot high severity issues', count++})`

**Outcome**: Followup task created to address critical bug

---

### Scenario 4: Unresolved Review Comments

**Timeline**:
1. Dev-bot creates PR #103
2. CI passes, Copilot approves ✅
3. Task verification passes (85% criteria met) ✅
4. Human reviewer adds blocking comment: "This breaks backwards compatibility"
5. Comment stored with severity: `blocking`
6. PR updated (new commits pushed)
7. Comment resolution detection runs → Still unresolved (still in PR comments)
8. Quality gates evaluate → 1 unresolved blocking comment ❌
9. Followup task created

**Block Reason**: 1 unresolved blocking comment

**Resolution Path**:
- Dev-bot addresses comment in new commit
- Comment resolved (removed from PR)
- Resolution detection marks comment as resolved
- Next quality gate check passes ✅
- Auto-merge proceeds

---

### Scenario 5: Task Verification Fails

**Timeline**:
1. Dev-bot creates PR #104
2. CI passes, Copilot approves ✅
3. Task verification runs:
   - 5 acceptance criteria defined
   - Only 3 criteria met (60%)
   - Required: 80% (4/5)
4. Verification fails → `verification_passed = false` ❌
5. Quality gates evaluate → Verification failed
6. Followup task created with verification details

**Block Reason**: Failed task verification

**Verification Results**:
```json
{
  "passed": false,
  "overallScore": 60.0,
  "acceptanceCriteria": {
    "met": 3,
    "total": 5,
    "percentMet": 60.0
  }
}
```

**Metrics Updated**:
- `task_verifications_run++`
- `task_verifications_failed++`
- `followup_tasks_created++`

**Outcome**: Followup task created to meet remaining criteria

---

## Related Documentation

- [PR Workflow Enhancement Plan](./pr-workflow-enhancement-plan.md) - Implementation plan and task tracking
- [Task Verification Service](../backend/src/services/taskVerification.service.ts) - Verification implementation
- [Review Comment Tracker](../backend/src/services/reviewCommentTracker.service.ts) - Comment tracking implementation
- [GitHub PR Service](../backend/src/services/githubPR.service.ts) - PR status and analysis
- [PR Monitor Service](../backend/src/services/prMonitor.service.ts) - Quality gate business logic

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-10 | Initial documentation created | Claude |
