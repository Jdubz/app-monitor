# Frontend Observability - Minimalist Implementation

**Status:** Planning
**Authority:** Aligned with master-design-intent.md
**Principle:** Log everything. UI shows nothing except errors. Trace IDs connect the dots.

---

## Philosophy Alignment

**Minimalist UI** (from master-design-intent.md):
> Show binary status, high-signal alerts, critical controls. NOT analytics dashboards, exploratory metrics, vanity metrics.

**Application to Observability:**
- ✅ **DO**: Log everything to backend for AI debugging
- ✅ **DO**: Use trace IDs to correlate frontend ↔ backend ↔ errors
- ✅ **DO**: Simple "Report Issue" button that sends timestamp + trace ID
- ❌ **NEVER**: Screenshot annotation UI, quality enhancement forms, modal dialogs
- ❌ **NEVER**: Duplicate data already in logs (network events, breadcrumbs, state)

**Result:** Frontend logs stream continuously. Bug reports are just **pointers to log segments**.

---

## Core Design

### The Only Thing Users See

```
[ Report Issue ] button → Sends {
  timestamp: '2025-11-15T10:30:00.000Z',
  traceId: 'trace-abc123',
  userDescription: 'optional 280 char tweet-length'
}
```

That's it. No modal. No screenshots. No forms. Just a button.

**Why:** All the diagnostic data is already in the logs. We just need to know *when* the issue occurred and *which trace* to examine.

---

## Architecture

```
┌────────────────────────────────────────────────────┐
│              FRONTEND                               │
├────────────────────────────────────────────────────┤
│                                                     │
│  Every action/event → Enhanced Logger              │
│                          ↓                          │
│                    Trace ID attached                │
│                          ↓                          │
│                    Buffer (1000 entries)            │
│                          ↓                          │
│                    Batch every 10s                  │
│                          ↓                          │
│              POST /api/logs/frontend                │
│                                                     │
│  [ Report Issue ] button → POST /api/issues        │
│      (just timestamp + traceId + description)       │
│                                                     │
└────────────────────────────────────────────────────┘
                          │
                          ↓
┌────────────────────────────────────────────────────┐
│              BACKEND                                │
├────────────────────────────────────────────────────┤
│                                                     │
│  logs/frontend/YYYY-MM-DD.jsonl  ← All logs        │
│                                                     │
│  logs/issues/YYYY-MM-DD.jsonl    ← Issue markers   │
│                                                     │
│  Search by trace ID to find all related logs       │
│                                                     │
└────────────────────────────────────────────────────┘
```

---

## Trace ID System

### Full-Stack Correlation

**Every API request gets a trace ID:**
1. Frontend generates: `trace-{timestamp}-{random}`
2. Attached to request header: `X-Trace-Id`
3. Backend logs with same trace ID
4. Frontend logs with same trace ID
5. All errors include trace ID

**Result:** Search logs for `trace-abc123` to see entire flow:
- Frontend button click
- API request sent
- Backend processing
- Database queries
- Error occurred
- User reported issue

### Implementation

**Frontend - ApiClient:**
```typescript
class ApiClient {
  private generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  async request(url: string, options: RequestInit) {
    const traceId = this.generateTraceId()

    // Add to headers
    options.headers = {
      ...options.headers,
      'X-Trace-Id': traceId
    }

    // Log with trace ID
    logger.info('API request', { url, method, traceId })

    try {
      const response = await fetch(url, options)
      logger.info('API response', { url, status: response.status, traceId })
      return response
    } catch (error) {
      logger.error('API error', error, { url, traceId })
      throw error
    }
  }
}
```

**Backend - Middleware:**
```typescript
app.use((req, res, next) => {
  req.traceId = req.headers['x-trace-id'] || generateTraceId()
  res.setHeader('X-Trace-Id', req.traceId)
  logger.info('Request received', {
    method: req.method,
    path: req.path,
    traceId: req.traceId
  })
  next()
})
```

---

## What We Log

### Every Log Entry

```typescript
interface LogEntry {
  id: string                    // Unique log ID
  timestamp: string             // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string               // Human-readable
  scope: string                 // Component/module name
  traceId?: string              // Correlation ID

  // Automatic context
  sessionId: string             // Browser session
  route: string                 // Current route
  userId?: string               // If authenticated

  // Event data
  data?: Record<string, unknown>

  // Error details (if level === 'error')
  error?: {
    name: string
    message: string
    stack?: string
    cause?: unknown
  }
}
```

**No breadcrumbs array.** Just log every action as it happens.
**No network events array.** Just log API calls as they happen.
**No state snapshots.** Just log state changes as they happen.

**Why:** Simpler. No duplication. Logs tell the complete story in chronological order.

---

## Issue Reporting

### The Button

**UI:** Single button in header/settings menu

```typescript
function ReportIssueButton() {
  const { reportIssue } = useIssueReporter()

  return (
    <Button onClick={() => reportIssue()}>
      Report Issue
    </Button>
  )
}
```

### The Payload

```typescript
interface IssueReport {
  timestamp: string       // When user clicked
  traceId: string         // Current trace (if in API call)
  sessionId: string       // Browser session
  route: string           // Where they were
  userAgent: string       // Browser
  description?: string    // Optional 280 char max
}
```

**Sent to:** `POST /api/issues`

**Stored as:** One line in `logs/issues/YYYY-MM-DD.jsonl`

---

## Data Efficiency

### What We're NOT Sending

❌ Screenshots (unless critical error)
❌ Full network request/response bodies
❌ Breadcrumb arrays (redundant with chronological logs)
❌ State snapshots (redundant with state change logs)
❌ Environment metadata (send once per session, not per batch)

### What We ARE Sending

✅ Every user action (click, navigation, input) as individual logs
✅ Every API call (start + end) with trace IDs
✅ Every error with full stack trace
✅ Every state change (as it happens)
✅ Session metadata (once, at session start)

### Batch Optimization

**Current approach (inefficient):**
```json
{
  "logs": [...100 logs...],
  "sessionMeta": {...},
  "environment": {...}
}
```
Every batch repeats session/environment data.

**Optimized approach:**
```json
// First batch of session
{
  "type": "session_start",
  "sessionId": "session-xyz",
  "meta": {...},
  "environment": {...}
}

// Subsequent batches
{
  "type": "log_batch",
  "sessionId": "session-xyz",
  "logs": [...100 logs...]
}
```

**Savings:** ~500 bytes per batch × 100 batches/day = 50KB/day/user

---

## Implementation

### Phase 1: Core Logging (3 days)

**Files:**
```
frontend/src/utils/observability/
├── logger.ts          (Enhanced logger with trace IDs)
├── transport.ts       (Batch uploader)
└── types.ts           (TypeScript interfaces)

backend/src/routes/
└── logs.routes.ts     (POST /api/logs/frontend)

backend/src/services/
└── logWriter.ts       (JSONL file writer)
```

**Features:**
- Generate trace IDs for all API calls
- Log every action/event chronologically
- Batch upload every 10s or 100 logs
- JSONL storage with daily rotation

**No:**
- No breadcrumb tracker (just log actions)
- No context collector (just include in each log)
- No data collection service (keep simple)

### Phase 2: Issue Reporting (1 day)

**Files:**
```
frontend/src/components/
└── ReportIssueButton.tsx

backend/src/routes/
└── issues.routes.ts   (POST /api/issues)
```

**Features:**
- Single button
- Sends timestamp + traceId + optional description
- Backend logs to separate issues file

### Phase 3: Error Boundaries (1 day)

**Files:**
```
frontend/src/components/
└── ErrorBoundary.tsx  (Auto-report on crash)
```

**Features:**
- Catch React errors
- Auto-log with stack trace + trace ID
- Optional auto-send issue report (for critical errors only)

---

## Searching Logs

### AI Agent Queries

**Find all logs for a trace:**
```bash
grep "trace-abc123" logs/frontend/*.jsonl
```

**Find all logs for a session:**
```bash
grep "session-xyz" logs/frontend/*.jsonl
```

**Find logs around an issue:**
```bash
# Get issue timestamp
jq -r 'select(.type=="issue") | .timestamp' logs/issues/2025-11-15.jsonl

# Get logs ±5 minutes
jq -r 'select(.timestamp >= "2025-11-15T10:25:00" and .timestamp <= "2025-11-15T10:35:00")' logs/frontend/2025-11-15.jsonl
```

**Find all errors for a user:**
```bash
jq -r 'select(.level=="error" and .userId=="user-123")' logs/frontend/*.jsonl
```

---

## Storage Format

### Frontend Logs

**File:** `backend/logs/frontend/YYYY-MM-DD.jsonl`

```jsonl
{"type":"session_start","sessionId":"session-xyz","timestamp":"2025-11-15T10:00:00.000Z","userAgent":"Mozilla/5.0...","route":"/monitor/dev-bots"}
{"id":"log-1","timestamp":"2025-11-15T10:00:01.234Z","level":"info","message":"Button clicked","scope":"TaskQueue","sessionId":"session-xyz","route":"/monitor/dev-bots","data":{"buttonId":"refresh"}}
{"id":"log-2","timestamp":"2025-11-15T10:00:01.456Z","level":"info","message":"API request","scope":"ApiClient","sessionId":"session-xyz","traceId":"trace-abc123","data":{"method":"GET","url":"/api/dev-bots/status"}}
{"id":"log-3","timestamp":"2025-11-15T10:00:01.789Z","level":"info","message":"API response","scope":"ApiClient","sessionId":"session-xyz","traceId":"trace-abc123","data":{"status":200,"duration":333}}
{"id":"log-4","timestamp":"2025-11-15T10:00:02.000Z","level":"error","message":"Rendering failed","scope":"TaskQueue","sessionId":"session-xyz","error":{"name":"TypeError","message":"Cannot read property 'length' of undefined","stack":"TypeError: Cannot read property 'length' of undefined\n  at TaskQueue.render..."}}
```

### Issue Reports

**File:** `backend/logs/issues/YYYY-MM-DD.jsonl`

```jsonl
{"type":"issue","timestamp":"2025-11-15T10:00:03.000Z","sessionId":"session-xyz","traceId":"trace-abc123","route":"/monitor/dev-bots","userDescription":"Queue shows no tasks but backend says 3 pending","userAgent":"Mozilla/5.0..."}
```

---

## Screenshot Exception

**Only for critical unhandled errors:**

If error boundary catches an error AND it's not user-triggered (i.e., automatic crash), optionally capture screenshot.

**Why:** Helps debug layout/rendering issues that aren't obvious from logs alone.

**How:**
```typescript
class ErrorBoundary {
  async componentDidCatch(error, errorInfo) {
    // Log error with trace ID
    logger.error('Unhandled error', error, { errorInfo })

    // Only if critical (not user-caused)
    if (this.isCriticalError(error)) {
      try {
        const screenshot = await captureScreenshot({ scale: 0.3 })
        await api.issues.submitCrashReport({
          timestamp: new Date().toISOString(),
          error: serializeError(error),
          screenshot
        })
      } catch {
        // Don't fail on screenshot capture failure
      }
    }
  }
}
```

**Rate limit:** Max 1 screenshot per session, max 10 per day globally.

---

## Comparison: Before vs. After

### Before (Complex)

**Bug Report Modal:**
- Description field
- Expected behavior field
- Actual behavior field
- Steps to reproduce field
- Screenshot with annotation canvas
- Include/exclude checkboxes
- Network events table
- Log viewer
- **Result:** 800+ lines of UI code

**Data sent:**
- 200 log entries
- 50 network events
- Current state snapshot
- Environment metadata
- Screenshot (base64 ~500KB)
- **Result:** ~800KB payload

### After (Minimal)

**Issue Button:**
- One click
- Optional 280 char description
- **Result:** 20 lines of UI code

**Data sent:**
- Timestamp
- Trace ID
- Session ID
- Route
- Description
- **Result:** ~200 bytes payload

**Diagnostic data:**
- Already in logs (streamed continuously)
- Search by trace ID to find relevant logs
- **Result:** More efficient, same (or better) debugging capability

---

## Success Metrics

**NOT metrics we track:**
- Log upload success rate (vanity metric)
- Average log size (vanity metric)
- Logs per user (vanity metric)

**Metrics that matter:**
- **Binary:** Can we reproduce issues from logs? (Yes/No)
- **Binary:** Can we find all logs for a trace? (Yes/No)
- **Alert:** Issue reports >10/day (indicates problems)
- **Alert:** Log storage >1GB/day (indicates excessive logging)

**Aligned with minimalist UI principle:** Binary states and high-signal alerts only.

---

## File Size

### Before (Complex Plan)

- Types: 200 lines
- ContextCollector: 250 lines
- BreadcrumbTracker: 350 lines
- DataCollectionService: 400 lines
- EnhancedLogger: 300 lines
- LogTransport: 350 lines
- ScreenshotService: 200 lines
- BugReportProvider: 600 lines
- BugReportModal: 400 lines
- **Total:** ~3,050 lines frontend

### After (Minimal)

- Types: 50 lines
- Logger: 150 lines
- Transport: 200 lines
- ReportIssueButton: 30 lines
- ErrorBoundary: 100 lines
- **Total:** ~530 lines frontend

**80% reduction in code.**

---

## Next Steps

1. ✅ Review this minimalist plan
2. ⏳ Implement Phase 1: Core logging with trace IDs (3 days)
3. ⏳ Implement Phase 2: Issue button (1 day)
4. ⏳ Implement Phase 3: Error boundaries (1 day)
5. ⏳ Deploy and validate
6. ⏳ **Delete** the complex plan documents

**Total effort:** 5 days (vs. 50-68 hours in complex plan)

---

## Alignment Checklist

✅ **Minimalist UI:** Just a button, no forms/modals
✅ **Event-driven:** Logs stream automatically, no polling
✅ **Data efficiency:** Send pointers (trace IDs) not duplicates
✅ **Binary alerts:** Issue count threshold, storage threshold
✅ **No vanity metrics:** Only track what helps unblock/triage
✅ **Simple implementation:** 530 lines vs. 3,050 lines
✅ **AI-first:** Logs are structured for machine parsing

**Master design intent compliance:** ✅ Fully aligned
