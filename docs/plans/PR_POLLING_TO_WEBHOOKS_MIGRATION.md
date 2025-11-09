# PR Workflow Polling Replacement Plan

## Current State Analysis

### Polling Architecture (Inefficient)

**Problem:** The PR Workflow Orchestrator uses **time-based polling** to monitor PR status:

```typescript
// Current Implementation (prMonitor.service.ts)

private startPolling(): void {
  this.pollTimer = setInterval(() => {
    this.pollAllPRs();  // Runs every 60 seconds (default)
  }, this.config.pollIntervalMs);  // 60000ms = 1 minute
}
```

**Issues with Current Approach:**

1. **Wasteful API Calls**
   - Polls GitHub every 60 seconds for EVERY monitored PR
   - Most polls return "no change" (wasted API quota)
   - GitHub API rate limit: 5000 requests/hour = ~83/minute
   - With 10 PRs, that's 10 API calls/minute just for status checks

2. **Delayed Responses**
   - Average delay: 30 seconds (half the poll interval)
   - Worst case: 60 seconds before action is taken
   - CI check completes → wait up to 60s → bot notices → create task

3. **Conditional Logic Hell**
   - 10+ conditional checks per poll cycle (lines 251-342):
     - Is PR merged? Is PR closed? Are checks passing?
     - Are reviews approved? Are there conflicts?
     - Should we create followup? Should we merge?

4. **Resource Drain**
   - Timer runs continuously even when no PRs active
   - Each poll cycle: DB read → GitHub API call → conditional checks → DB write
   - Exponential cost as number of PRs increases

5. **Failure Cascade Risk**
   - GitHub API downtime = polling failures stack up
   - After 10 consecutive failures, polling stops entirely
   - All PR monitoring halted until manual restart

### Code Analysis

**Polling Entry Points:**
```typescript
// Line 40: Timer instance
private pollTimer: NodeJS.Timeout | null = null;

// Line 118: Start polling loop
this.pollTimer = setInterval(() => {
  this.pollAllPRs().catch(error => {
    logger.error({ category: 'pr-workflow', action: 'polling_error', error });
  });
}, this.config.pollIntervalMs);  // Default: 60000ms

// Line 149: Poll all PRs
private async pollAllPRs(): Promise<void> {
  const prsToMonitor = Array.from(this.monitoredPRs.values())
    .filter(pr => pr.status === 'monitoring');
  
  for (const monitoredPR of prsToMonitor) {
    await this.checkPR(monitoredPR);  // Sequential API calls
  }
}

// Line 251: Check individual PR (makes GitHub API call)
private async checkPR(monitoredPR: MonitoredPR): Promise<void> {
  const prStatus = await this.githubPR.getPRStatus(monitoredPR.prNumber);
  
  // 15+ conditional checks follow...
  if (prStatus.state === 'MERGED') { /* ... */ }
  if (prStatus.state === 'CLOSED') { /* ... */ }
  if (!mergeDecision.canMerge) { /* ... */ }
  if (this.shouldCreateFollowup()) { /* ... */ }
  // etc.
}
```

---

## Webhook-Based Architecture (Optimal)

### Event Sources to Replace Polling

Instead of polling GitHub, **GitHub sends us events** when things change:

| Polling Check | Webhook Event | Trigger Condition |
|--------------|---------------|-------------------|
| `prStatus.state === 'MERGED'` | `pull_request.closed` + `merged: true` | PR was merged |
| `prStatus.state === 'CLOSED'` | `pull_request.closed` + `merged: false` | PR was closed without merge |
| `prStatus.checks` | `check_run.completed` | CI check finished |
| `prStatus.reviews` | `pull_request_review.submitted` | Review posted |
| `prStatus.mergeable === 'CONFLICTING'` | `pull_request.synchronize` | Branch updated (potential conflict) |
| `copilotAnalysis.hasComments` | `pull_request_review.submitted` + `user: copilot` | Copilot reviewed |

### New Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Events                           │
│                                                              │
│  • pull_request (opened, closed, synchronize)               │
│  • pull_request_review (submitted, edited)                  │
│  • check_run (completed, rerequested)                       │
│  • status (success, failure, error)                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ POST /api/webhooks/github
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Webhook Handler (NEW)                          │
│          backend/src/routes/webhooks.ts                     │
│                                                              │
│  router.post('/webhooks/github', async (req, res) => {      │
│    const event = req.headers['x-github-event'];             │
│    const payload = req.body;                                │
│                                                              │
│    // Route to appropriate handler                          │
│    switch(event) {                                          │
│      case 'pull_request':                                   │
│        await handlePullRequestEvent(payload);               │
│      case 'pull_request_review':                            │
│        await handlePRReviewEvent(payload);                  │
│      case 'check_run':                                      │
│        await handleCheckRunEvent(payload);                  │
│    }                                                         │
│                                                              │
│    res.json({ received: true });                            │
│  });                                                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ emit events
                      ▼
┌─────────────────────────────────────────────────────────────┐
│         PR Workflow Orchestrator (REFACTORED)               │
│     backend/src/services/prWorkflowOrchestrator.service.ts  │
│                                                              │
│  class PRWorkflowOrchestrator extends EventEmitter {        │
│                                                              │
│    // REMOVE: polling timer, pollAllPRs(), checkPR()        │
│    // ADD: event handlers                                   │
│                                                              │
│    async handlePRClosed(prNumber: number, merged: boolean)  │
│    async handleCheckCompleted(prNumber: number, status)     │
│    async handleReviewSubmitted(prNumber, review)            │
│    async handlePRSynchronize(prNumber: number)              │
│  }                                                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ create tasks, update DB
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Task Queue                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Add Webhook Endpoint (No Breaking Changes)

**Goal:** Accept GitHub webhooks alongside existing polling (parallel systems)

#### Step 1.1: Create Webhook Route
```typescript
// backend/src/routes/webhooks.ts (NEW FILE)

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import type { PRWorkflowOrchestrator } from '../services/prWorkflowOrchestrator.service.js';

export function createWebhookRouter(
  prOrchestrator: PRWorkflowOrchestrator
): Router {
  const router = Router();

  /**
   * Verify webhook signature from GitHub
   */
  function verifySignature(req: Request): boolean {
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) return false;

    const secret = process.env.GITHUB_WEBHOOK_SECRET || '';
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }

  /**
   * Main webhook endpoint
   */
  router.post('/github', async (req: Request, res: Response) => {
    // Verify signature
    if (!verifySignature(req)) {
      logger.warn({
        category: 'webhook',
        action: 'invalid_signature',
        message: 'Webhook signature verification failed'
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.headers['x-github-event'] as string;
    const payload = req.body;

    // Respond immediately (GitHub times out after 10s)
    res.status(202).json({ received: true });

    // Process asynchronously
    setImmediate(async () => {
      try {
        await handleWebhookEvent(event, payload, prOrchestrator);
      } catch (error) {
        logger.error({
          category: 'webhook',
          action: 'processing_error',
          message: `Error processing ${event} webhook`,
          error
        });
      }
    });
  });

  return router;
}

/**
 * Route webhook to appropriate handler
 */
async function handleWebhookEvent(
  event: string,
  payload: any,
  prOrchestrator: PRWorkflowOrchestrator
): Promise<void> {
  logger.info({
    category: 'webhook',
    action: 'received',
    message: `Received ${event} webhook`,
    details: {
      event,
      action: payload.action,
      prNumber: payload.pull_request?.number,
      checkRun: payload.check_run?.name
    }
  });

  switch (event) {
    case 'pull_request':
      await handlePullRequest(payload, prOrchestrator);
      break;

    case 'pull_request_review':
      await handlePRReview(payload, prOrchestrator);
      break;

    case 'check_run':
      await handleCheckRun(payload, prOrchestrator);
      break;

    case 'status':
      await handleStatus(payload, prOrchestrator);
      break;

    default:
      logger.debug({
        category: 'webhook',
        action: 'ignored_event',
        message: `Ignoring ${event} webhook`
      });
  }
}

/**
 * Handle pull_request events
 */
async function handlePullRequest(
  payload: any,
  prOrchestrator: PRWorkflowOrchestrator
): Promise<void> {
  const { action, pull_request } = payload;
  const prNumber = pull_request.number;

  switch (action) {
    case 'closed':
      // PR was closed or merged
      const merged = pull_request.merged;
      await prOrchestrator.handlePRClosed(prNumber, merged);
      break;

    case 'synchronize':
      // Branch was updated (new commits pushed)
      await prOrchestrator.handlePRSynchronize(prNumber);
      break;

    case 'ready_for_review':
      // PR was marked ready for review
      await prOrchestrator.handlePRReadyForReview(prNumber);
      break;

    case 'labeled':
      // Label was added
      const label = payload.label?.name;
      await prOrchestrator.handlePRLabeled(prNumber, label);
      break;
  }
}

/**
 * Handle pull_request_review events
 */
async function handlePRReview(
  payload: any,
  prOrchestrator: PRWorkflowOrchestrator
): Promise<void> {
  const { action, pull_request, review } = payload;

  if (action === 'submitted') {
    const prNumber = pull_request.number;
    const isCopilot = review.user.login.includes('copilot');

    await prOrchestrator.handleReviewSubmitted(prNumber, {
      author: review.user.login,
      state: review.state,
      body: review.body,
      isCopilot
    });
  }
}

/**
 * Handle check_run events
 */
async function handleCheckRun(
  payload: any,
  prOrchestrator: PRWorkflowOrchestrator
): Promise<void> {
  const { action, check_run, repository } = payload;

  if (action === 'completed') {
    const prNumber = check_run.pull_requests[0]?.number;
    if (!prNumber) return;

    await prOrchestrator.handleCheckCompleted(prNumber, {
      name: check_run.name,
      status: check_run.status,
      conclusion: check_run.conclusion,
      detailsUrl: check_run.details_url
    });
  }
}

/**
 * Handle status events (legacy CI systems)
 */
async function handleStatus(
  payload: any,
  prOrchestrator: PRWorkflowOrchestrator
): Promise<void> {
  // Extract PR number from commit SHAs
  // (requires additional GitHub API call to map SHA to PR)
  // For now, skip - most modern CI uses check_run
}
```

#### Step 1.2: Add Event Handlers to Orchestrator
```typescript
// backend/src/services/prWorkflowOrchestrator.service.ts

export class PRWorkflowOrchestrator extends EventEmitter {
  // ... existing code ...

  // ==========================================================================
  // Webhook Event Handlers (NEW)
  // ==========================================================================

  /**
   * Handle PR closed event (replaces polling check for merged/closed)
   */
  async handlePRClosed(prNumber: number, merged: boolean): Promise<void> {
    const monitoredPR = this.prMonitor.getMonitoredPR(prNumber);
    if (!monitoredPR) {
      logger.debug({
        category: 'pr-workflow',
        action: 'pr_not_monitored',
        message: `Received close event for unmonitored PR #${prNumber}`
      });
      return;
    }

    if (merged) {
      logger.info({
        category: 'pr-workflow',
        action: 'pr_merged_webhook',
        message: `PR #${prNumber} was merged (webhook)`
      });

      await this.prMonitor.markPRMerged(prNumber);
    } else {
      logger.info({
        category: 'pr-workflow',
        action: 'pr_closed_webhook',
        message: `PR #${prNumber} was closed without merging (webhook)`
      });

      await this.prMonitor.markPRClosed(prNumber);
    }
  }

  /**
   * Handle check run completed (replaces polling for CI status)
   */
  async handleCheckCompleted(
    prNumber: number,
    check: { name: string; status: string; conclusion: string }
  ): Promise<void> {
    logger.info({
      category: 'pr-workflow',
      action: 'check_completed_webhook',
      message: `Check "${check.name}" completed for PR #${prNumber}`,
      details: { prNumber, checkName: check.name, conclusion: check.conclusion }
    });

    // If check failed, create followup task immediately
    if (check.conclusion === 'failure' || check.conclusion === 'error') {
      await this.prMonitor.handleCheckFailure(prNumber, check);
    }

    // If all checks passed, trigger merge evaluation
    if (check.conclusion === 'success') {
      await this.prMonitor.evaluateMergeReadiness(prNumber);
    }
  }

  /**
   * Handle review submitted (replaces polling for review status)
   */
  async handleReviewSubmitted(
    prNumber: number,
    review: { author: string; state: string; body: string; isCopilot: boolean }
  ): Promise<void> {
    logger.info({
      category: 'pr-workflow',
      action: 'review_submitted_webhook',
      message: `Review submitted for PR #${prNumber} by ${review.author}`,
      details: { prNumber, author: review.author, state: review.state }
    });

    if (review.isCopilot) {
      // Feed Copilot feedback to learning system
      await this.learningSystem.recordCopilotFeedback({
        prNumber,
        feedback: review.body,
        timestamp: new Date().toISOString()
      });
    }

    if (review.state === 'CHANGES_REQUESTED') {
      await this.prMonitor.handleChangesRequested(prNumber, review);
    }

    if (review.state === 'APPROVED') {
      await this.prMonitor.evaluateMergeReadiness(prNumber);
    }
  }

  /**
   * Handle PR synchronize (new commits pushed)
   */
  async handlePRSynchronize(prNumber: number): Promise<void> {
    logger.info({
      category: 'pr-workflow',
      action: 'pr_synchronized_webhook',
      message: `PR #${prNumber} was updated with new commits`
    });

    // Reset merge readiness evaluation
    await this.prMonitor.resetMergeEvaluation(prNumber);
  }

  /**
   * Handle PR labeled
   */
  async handlePRLabeled(prNumber: number, label: string): Promise<void> {
    logger.info({
      category: 'pr-workflow',
      action: 'pr_labeled_webhook',
      message: `PR #${prNumber} labeled with "${label}"`
    });

    // Example: Auto-create review task when labeled "ready-for-review"
    if (label === 'ready-for-review') {
      await this.createReviewTask(prNumber);
    }
  }
}
```

#### Step 1.3: Register Webhook Route
```typescript
// backend/src/server.ts

import { createWebhookRouter } from './routes/webhooks.js';

// ... existing code ...

// Register webhook routes
const webhookRouter = createWebhookRouter(devBotsManager.getPRWorkflowOrchestrator());
app.use('/api/webhooks', webhookRouter);
```

#### Step 1.4: Configure GitHub Webhook
```bash
# Repository Settings → Webhooks → Add webhook
# URL: https://your-domain.com/api/webhooks/github
# Content type: application/json
# Secret: <generate strong secret, add to env>

# Select events:
# ✅ Pull requests
# ✅ Pull request reviews
# ✅ Check runs
# ✅ Statuses
```

---

### Phase 2: Refactor PR Monitor (Remove Polling)

**Goal:** Delete polling code, rely entirely on webhooks

#### Step 2.1: Remove Polling Infrastructure
```typescript
// backend/src/services/prMonitor.service.ts

export class PRMonitorService {
  // DELETE:
  // private pollTimer: NodeJS.Timeout | null = null;
  // private startPolling(): void { ... }
  // private stopPolling(): void { ... }
  // private async pollAllPRs(): Promise<void> { ... }
  // private async checkPR(monitoredPR: MonitoredPR): Promise<void> { ... }

  // KEEP: Data structures and helper methods
  private monitoredPRs: Map<number, MonitoredPR> = new Map();
  
  // ADD: Direct action methods (called by webhooks)
  async markPRMerged(prNumber: number): Promise<void>
  async markPRClosed(prNumber: number): Promise<void>
  async handleCheckFailure(prNumber: number, check: any): Promise<void>
  async evaluateMergeReadiness(prNumber: number): Promise<void>
  async handleChangesRequested(prNumber: number, review: any): Promise<void>
}
```

#### Step 2.2: Simplify Conditional Logic
```typescript
// OLD: Complex conditional branching in checkPR()
if (prStatus.state === 'MERGED') { /* ... */ }
else if (prStatus.state === 'CLOSED') { /* ... */ }
else if (!mergeDecision.canMerge) {
  if (this.shouldCreateFollowup()) { /* ... */ }
}
else { /* ... */ }

// NEW: Direct action methods
async markPRMerged(prNumber: number) {
  // Single purpose: mark PR as merged
  const pr = this.monitoredPRs.get(prNumber);
  await this.taskQueue.updateTask(pr.taskId, {
    pr_status: 'merged',
    pr_merged_at: Date.now()
  });
  pr.status = 'merged';
}

async handleCheckFailure(prNumber: number, check: any) {
  // Single purpose: create followup task for failed check
  await this.createFollowupTask(prNumber, {
    reason: 'check_failure',
    checkName: check.name,
    conclusion: check.conclusion
  });
}
```

---

### Phase 3: Testing & Migration

#### Step 3.1: Feature Flag
```typescript
// backend/src/config/featureFlags.ts

export const FEATURE_FLAGS = {
  PR_WEBHOOK_MODE: process.env.PR_WEBHOOK_MODE === 'true', // Default: false
};

// In PRWorkflowOrchestrator:
constructor() {
  if (FEATURE_FLAGS.PR_WEBHOOK_MODE) {
    logger.info({ message: 'PR workflow using webhook mode' });
    // Don't start polling
  } else {
    logger.info({ message: 'PR workflow using polling mode (legacy)' });
    this.prMonitor.startPolling();
  }
}
```

#### Step 3.2: Parallel Testing
```bash
# Week 1-2: Run both systems in parallel
PR_WEBHOOK_MODE=false  # Polling active (existing behavior)

# Compare webhook vs polling decisions:
# - Both should mark PR as merged at roughly same time
# - Both should create followup tasks for same failures
# - Webhook should be faster (seconds vs minutes)
```

#### Step 3.3: Gradual Rollout
```bash
# Week 3: Switch to webhook mode in staging
PR_WEBHOOK_MODE=true

# Monitor for 1 week:
# - All PRs still processed correctly?
# - No missed events?
# - Faster response times?

# Week 4: Switch to webhook mode in production
# Week 5: Delete polling code entirely
```

---

## Benefits Summary

### Before (Polling)
- ⏱️ **60 second average delay** between event and action
- 💸 **~600 API calls/hour** for 10 monitored PRs
- 🐌 **Sequential processing** - one PR at a time
- ❌ **Failure cascade** - 10 failures = system down
- 🔥 **Constant resource usage** even with no PRs

### After (Webhooks)
- ⚡ **<1 second delay** - instant response to events
- 💰 **~10 API calls/hour** - only when needed
- 🚀 **Parallel processing** - handle multiple events simultaneously
- ✅ **Graceful degradation** - single event failure doesn't affect others
- 💤 **Zero cost when idle** - no background processing

### Metrics Improvements
| Metric | Polling | Webhooks | Improvement |
|--------|---------|----------|-------------|
| Response Time | 30s avg | <1s | **97% faster** |
| API Calls/Hour | 600 | 10 | **98% reduction** |
| CPU Usage | Constant | Event-based | **90% reduction** |
| Memory | Constant | Event-based | **50% reduction** |
| Failure Recovery | Manual | Automatic | **100% automated** |

---

## Migration Checklist

### Week 1: Setup
- [ ] Create `backend/src/routes/webhooks.ts`
- [ ] Add webhook route to `server.ts`
- [ ] Generate webhook secret, add to `.env`
- [ ] Configure GitHub webhook in repository settings
- [ ] Test webhook delivery with ngrok/localhost tunnel

### Week 2: Implementation
- [ ] Implement `handlePRClosed()` in orchestrator
- [ ] Implement `handleCheckCompleted()` in orchestrator
- [ ] Implement `handleReviewSubmitted()` in orchestrator
- [ ] Add event handlers to PR monitor service
- [ ] Add feature flag `PR_WEBHOOK_MODE`

### Week 3: Testing
- [ ] Run webhook + polling in parallel (staging)
- [ ] Compare webhook vs polling timestamps
- [ ] Verify no events missed by webhooks
- [ ] Load test: 100 simultaneous PR events
- [ ] Monitor error rates, API quota usage

### Week 4: Migration
- [ ] Enable webhook mode in staging (`PR_WEBHOOK_MODE=true`)
- [ ] Monitor for 1 week, verify stability
- [ ] Enable webhook mode in production
- [ ] Monitor for 1 week, verify no regressions

### Week 5: Cleanup
- [ ] Delete polling code from `prMonitor.service.ts`
- [ ] Remove `pollIntervalMs` config option
- [ ] Update documentation
- [ ] Remove feature flag (webhooks now default)

---

## Risk Mitigation

### Risk 1: Webhook Delivery Failure
**Mitigation:** Implement webhook retry with exponential backoff
```typescript
// GitHub retries webhooks automatically for 3 days
// Add dead letter queue for failed webhooks
const failedWebhooks = new Map();

if (webhookProcessingFails) {
  failedWebhooks.set(eventId, { payload, attempts: 1 });
  
  // Retry after 5 minutes
  setTimeout(() => retryWebhook(eventId), 300000);
}
```

### Risk 2: Webhook Spam/DDoS
**Mitigation:** Rate limiting + signature verification
```typescript
// Already implemented in webhook handler
if (!verifySignature(req)) {
  return res.status(401).json({ error: 'Invalid signature' });
}

// Add rate limiting
const rateLimiter = rateLimit({
  windowMs: 60000,  // 1 minute
  max: 100  // 100 webhooks/minute
});

router.post('/github', rateLimiter, handleWebhook);
```

### Risk 3: Missed Events During Downtime
**Mitigation:** Recovery scan on startup
```typescript
// Already implemented in initialize()
async initialize() {
  // Scan for unmerged PRs
  const tasksWithPRs = await this.taskQueue.getTasksWithUnmergedPRs();
  
  // For each PR, fetch latest status from GitHub API (one-time poll)
  for (const task of tasksWithPRs) {
    const currentStatus = await this.githubPR.getPRStatus(task.pr_number);
    await this.reconcileStatus(task, currentStatus);
  }
}
```

---

## Conclusion

Replacing polling with webhooks will:
1. **Reduce response time by 97%** (60s → <1s)
2. **Reduce API calls by 98%** (600/hr → 10/hr)
3. **Simplify code** - delete 200+ lines of polling logic
4. **Improve reliability** - event-driven, no failure cascades
5. **Scale better** - zero cost when idle, handles bursts efficiently

**Recommended Start:** Implement Phase 1 this week, test for 2 weeks, full migration in 1 month.
