# Webhook Resilience Implementation Plan

**Date:** 2025-11-12  
**Priority:** P1 HIGH  
**Effort:** 1-2 days  
**Status:** In Progress

---

## Problem Statement

**Current State:**
- Webhooks processed synchronously in HTTP handler
- No retry on transient failures
- Lost webhooks = stuck PRs forever
- No visibility into webhook failures
- Single point of failure

**Risk:**
- Network blips lose webhook events
- Service restarts during webhook = lost event
- Database errors = lost event
- Memory issues = lost event
- **Impact:** PRs stuck forever, requiring manual intervention

---

## Solution Design

### Architecture: Persistent Webhook Queue

```
GitHub Webhook
     ↓
HTTP Handler (FAST - just enqueue)
     ↓
webhook_events table (SQLite)
     ↓
Background Processor (with retry)
     ↓
Event Handlers (existing code)
```

**Key Principles:**
1. **Durability:** Webhook persisted immediately to SQLite
2. **Idempotency:** Can process same webhook multiple times safely
3. **Retry:** Exponential backoff for transient failures
4. **Observability:** Track all webhook states
5. **Performance:** HTTP response in <100ms (just enqueue)

---

## Database Schema

### webhook_events Table

```sql
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,                    -- UUID
  event_type TEXT NOT NULL,               -- 'pull_request', 'push', 'check_suite', etc.
  delivery_id TEXT NOT NULL UNIQUE,       -- GitHub delivery ID (for deduplication)
  payload TEXT NOT NULL,                  -- JSON payload from GitHub
  signature TEXT,                         -- X-Hub-Signature-256 for audit
  
  -- Processing state
  status TEXT NOT NULL,                   -- 'pending', 'processing', 'completed', 'failed'
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  last_error TEXT,
  
  -- Timestamps
  received_at INTEGER NOT NULL,           -- When webhook received
  completed_at INTEGER,                   -- When successfully processed
  
  -- Metadata
  repository TEXT,                        -- owner/repo
  pr_number INTEGER,                      -- If PR-related
  
  UNIQUE(delivery_id)                     -- Prevent duplicate webhooks
);

CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_received_at ON webhook_events(received_at);
CREATE INDEX idx_webhook_events_pr_number ON webhook_events(pr_number);
```

---

## Implementation Components

### 1. WebhookEventQueue Service

**Location:** `backend/src/services/webhookEventQueue.service.ts`

```typescript
interface WebhookEvent {
  id: string;
  event_type: string;
  delivery_id: string;
  payload: any;
  signature?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempt_count: number;
  last_attempt_at?: number;
  last_error?: string;
  received_at: number;
  completed_at?: number;
  repository?: string;
  pr_number?: number;
}

class WebhookEventQueue {
  /**
   * Enqueue webhook for processing
   * Returns immediately (fast HTTP response)
   */
  async enqueue(event: Omit<WebhookEvent, 'id' | 'status' | 'attempt_count' | 'received_at'>): Promise<void>;
  
  /**
   * Get next pending webhook to process
   */
  async getNextPending(): Promise<WebhookEvent | null>;
  
  /**
   * Mark webhook as processing
   */
  async markProcessing(id: string): Promise<void>;
  
  /**
   * Mark webhook as completed
   */
  async markCompleted(id: string): Promise<void>;
  
  /**
   * Mark webhook as failed (increment attempt count)
   */
  async markFailed(id: string, error: string): Promise<void>;
  
  /**
   * Get webhooks ready for retry
   * Uses exponential backoff: 1m, 5m, 15m, 1h, 6h
   */
  async getRetryable(): Promise<WebhookEvent[]>;
  
  /**
   * Cleanup old completed webhooks (>7 days)
   */
  async cleanup(): Promise<number>;
  
  /**
   * Get metrics
   */
  async getMetrics(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed_last_hour: number;
    failed_last_hour: number;
  }>;
}
```

### 2. WebhookProcessor Service

**Location:** `backend/src/services/webhookProcessor.service.ts`

```typescript
class WebhookProcessor {
  private processing: boolean = false;
  private intervalId?: NodeJS.Timeout;
  
  /**
   * Start background processing loop
   * Processes one webhook at a time to avoid race conditions
   */
  start(): void {
    if (this.processing) return;
    
    this.processing = true;
    this.intervalId = setInterval(() => this.processNext(), 1000);
    
    logger.info('Webhook processor started');
  }
  
  /**
   * Stop processing (for graceful shutdown)
   */
  async stop(): Promise<void> {
    this.processing = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    logger.info('Webhook processor stopped');
  }
  
  /**
   * Process next pending webhook
   */
  private async processNext(): Promise<void> {
    // Get next webhook (pending or retryable)
    const event = await this.queue.getNextPending() 
      || (await this.queue.getRetryable())[0];
    
    if (!event) return;
    
    try {
      await this.queue.markProcessing(event.id);
      
      // Dispatch to appropriate handler
      switch (event.event_type) {
        case 'pull_request':
          await this.handler.handlePR(JSON.parse(event.payload));
          break;
        case 'push':
          await this.handler.handlePush(JSON.parse(event.payload));
          break;
        case 'check_suite':
          await this.handler.handleCheckSuite(JSON.parse(event.payload));
          break;
        case 'check_run':
          await this.handler.handleCheckRun(JSON.parse(event.payload));
          break;
        case 'pull_request_review':
          await this.handler.handlePRReview(JSON.parse(event.payload));
          break;
        default:
          logger.warn(`Unknown webhook event type: ${event.event_type}`);
      }
      
      await this.queue.markCompleted(event.id);
      
    } catch (error) {
      await this.queue.markFailed(event.id, error.message);
      
      logger.error({
        category: 'webhook',
        action: 'process_failed',
        message: `Webhook processing failed (attempt ${event.attempt_count + 1})`,
        error,
        details: { event_id: event.id, event_type: event.event_type }
      });
    }
  }
}
```

### 3. Update HTTP Handlers

**Location:** `backend/src/routes/github-webhooks.routes.ts`

```typescript
// Before: Process webhook synchronously
await webhookHandler.handlePR(req.body);

// After: Just enqueue (fast!)
await webhookEventQueue.enqueue({
  event_type: 'pull_request',
  delivery_id: delivery,
  payload: req.body,
  signature: req.headers['x-hub-signature-256'],
  repository: req.body.repository?.full_name,
  pr_number: req.body.number
});
```

---

## Retry Strategy

### Exponential Backoff

```
Attempt 1: Immediate
Attempt 2: 1 minute later
Attempt 3: 5 minutes later  
Attempt 4: 15 minutes later
Attempt 5: 1 hour later
Attempt 6: 6 hours later
Attempt 7+: Dead letter (alert)
```

**Implementation:**
```typescript
function getRetryDelay(attemptCount: number): number {
  const delays = [0, 60, 300, 900, 3600, 21600]; // seconds
  return delays[Math.min(attemptCount, delays.length - 1)] * 1000;
}

async function getRetryable(): Promise<WebhookEvent[]> {
  const now = Date.now();
  
  return db.prepare(`
    SELECT * FROM webhook_events
    WHERE status = 'failed'
      AND attempt_count < 6
      AND last_attempt_at < ?
    ORDER BY received_at ASC
    LIMIT 10
  `).all(now - getRetryDelay(0)); // Will check delay in app logic
}
```

---

## Idempotency

### Deduplication by delivery_id

```sql
-- Unique constraint on delivery_id prevents duplicate insertion
INSERT INTO webhook_events (...)
ON CONFLICT(delivery_id) DO NOTHING;
```

### Safe Re-processing

All webhook handlers must be idempotent:
- ✅ `evaluateConditions(prNumber)` - Safe to call multiple times
- ✅ `updatePRStatus()` - Upsert operation
- ✅ `spawnFixTask()` - Checks if task already exists
- ✅ Task status updates - Idempotent

---

## Monitoring & Alerts

### Metrics Endpoint

**GET /api/github/webhooks/metrics**

```json
{
  "queue": {
    "pending": 5,
    "processing": 1,
    "failed": 2,
    "completed_last_hour": 143,
    "failed_last_hour": 3
  },
  "processing_rate": {
    "per_minute": 2.4,
    "per_hour": 144
  },
  "failure_rate": {
    "last_hour": 0.02,
    "last_24h": 0.015
  },
  "oldest_pending": {
    "age_seconds": 300,
    "event_type": "check_suite"
  }
}
```

### Alerts

**Critical:**
- Pending webhooks > 100
- Oldest pending > 1 hour
- Failure rate > 10% over 1 hour

**Warning:**
- Pending webhooks > 50
- Oldest pending > 15 minutes
- Failed webhooks with 6+ attempts (dead letter)

---

## Migration

### 1. Create Table

```sql
-- migration: 2025-11-12-webhook-events-table.sql
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  delivery_id TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  signature TEXT,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  last_error TEXT,
  received_at INTEGER NOT NULL,
  completed_at INTEGER,
  repository TEXT,
  pr_number INTEGER
);

CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_received_at ON webhook_events(received_at);
CREATE INDEX idx_webhook_events_pr_number ON webhook_events(pr_number);
```

### 2. Rollout Strategy

**Phase 1: Dual Write (Safety)**
- Write to queue AND process synchronously
- Verify queue working correctly
- Monitor for 24-48 hours

**Phase 2: Queue Primary**
- Enqueue only, background processor handles
- Monitor closely for 72 hours
- Rollback if issues

**Phase 3: Cleanup**
- Remove old synchronous code
- Add cleanup cron job
- Production ready

---

## Testing Strategy

### Unit Tests

```typescript
describe('WebhookEventQueue', () => {
  it('should enqueue webhook and assign ID');
  it('should prevent duplicate delivery_id');
  it('should get next pending webhook');
  it('should update status to processing');
  it('should update status to completed');
  it('should update status to failed with error');
  it('should calculate retry delay correctly');
  it('should get retryable webhooks');
  it('should not retry beyond max attempts');
  it('should cleanup old completed events');
});

describe('WebhookProcessor', () => {
  it('should process pending webhook');
  it('should retry failed webhook with backoff');
  it('should dispatch to correct handler');
  it('should handle processing errors');
  it('should stop processing on shutdown');
});
```

### Integration Tests

1. **Happy Path:** Webhook enqueued → processed → completed
2. **Retry:** Failed webhook retries with backoff
3. **Idempotency:** Same delivery_id twice = processed once
4. **Concurrency:** Multiple webhooks processed in order
5. **Failure Recovery:** Processor restart continues processing

---

## Success Criteria

**Performance:**
- ✅ HTTP response < 100ms (just enqueue)
- ✅ Background processing < 1s per webhook
- ✅ Zero webhook loss (durable queue)

**Reliability:**
- ✅ Retry on transient failures
- ✅ Survive service restarts
- ✅ Idempotent processing
- ✅ Dead letter detection (6+ failures)

**Observability:**
- ✅ Metrics endpoint functional
- ✅ Logs for all state transitions
- ✅ Alerts for queue backlog
- ✅ Alerts for high failure rate

---

## Implementation Checklist

### Day 1 (Foundation)
- [ ] Create database migration
- [ ] Implement WebhookEventQueue service
- [ ] Write unit tests for queue
- [ ] Test database operations

### Day 2 (Processing)
- [ ] Implement WebhookProcessor service
- [ ] Update HTTP handlers to enqueue
- [ ] Write integration tests
- [ ] Implement metrics endpoint

### Day 3 (Deployment)
- [ ] Deploy Phase 1 (dual write)
- [ ] Monitor for 24 hours
- [ ] Deploy Phase 2 (queue primary)
- [ ] Set up alerts

### Optional (Future)
- [ ] Dead letter queue UI
- [ ] Webhook replay tool
- [ ] Performance optimizations

---

## Files to Create/Modify

**New Files:**
- `backend/src/services/webhookEventQueue.service.ts`
- `backend/src/services/webhookProcessor.service.ts`
- `backend/src/migrations/2025-11-12-webhook-events-table.sql`
- `backend/src/services/__tests__/webhookEventQueue.test.ts`
- `backend/src/services/__tests__/webhookProcessor.test.ts`

**Modified Files:**
- `backend/src/routes/github-webhooks.routes.ts` (enqueue instead of process)
- `backend/src/server.ts` (start webhook processor)
- `backend/src/services/database.ts` (run migration)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Queue backlog grows too large | Low | High | Alerts + auto-scaling |
| Processor crashes repeatedly | Low | High | Process monitor + restart |
| Disk space fills with events | Low | Medium | Cleanup cron + retention policy |
| Duplicate processing | Low | Low | Idempotent handlers + unique constraint |
| Migration breaks prod | Medium | High | Dual write phase + rollback plan |

---

## Future Enhancements

1. **Priority Queue:** Critical webhooks processed first
2. **Parallel Processing:** Process multiple webhooks concurrently
3. **Distributed Queue:** Redis/RabbitMQ for scale
4. **Webhook Replay:** Manually reprocess failed webhooks
5. **Analytics:** Processing time histograms, failure categories

---

## References

**Current Implementation:**
- `backend/src/services/githubWebhookHandler.service.ts`
- `backend/src/routes/github-webhooks.routes.ts`

**Related Plans:**
- `PR_WORKFLOW_IMPLEMENTATION.md`
- `STUCK_PRODUCTION_PRS_AUTOMATION_PLAN.md`
