# Bug Reports & Issue Triage Architecture

**Purpose:** Comprehensive architecture of the automated bug report collection, triage, and resolution system.

**Status:** Production (v0.2.0)

---

## Overview

The bug reports system provides a frictionless way for users to report issues encountered in the app-monitor UI. Reports are immediately triaged and converted into bugfix tasks that dev-bots automatically attempt to resolve.

**Key Principles:**
- **Event-driven immediate triage** - No cron jobs, instant response
- **Automatic task creation** - Bug reports become fix tasks automatically
- **Trace ID correlation** - Link reports to structured logs
- **Zero UI friction** - One-click report submission
- **Persistent storage** - Consolidated in main database

---

## System Architecture

### Core Components

| Component | Responsibility | Location |
|-----------|---------------|----------|
| `IssueStorageService` | Persists reports to database | `issueStorageService.ts` |
| `IssueTriageService` | Immediate triage and task creation | `issueTriageService.ts` |
| `TaskQueueService` | Receives generated bugfix tasks | `taskQueue.sqlite.ts` |
| Frontend Issue Reporter | UI button and submission form | `frontend/src/components/IssueReporter.tsx` |

### Data Flow

```
User Clicks "Report Issue"
          ↓
POST /api/issues (with trace ID, route, description)
          ↓
IssueStorageService.storeIssue()
          ↓
(stores in app-monitor.db)
          ↓
emit('issue:created')
          ↓
IssueTriageService.handleNewIssue()
          ↓
createBugfixTask()
          ↓
TaskQueueService.addTask()
          ↓
Dev-bot assigned
          ↓
Bot searches logs by trace ID
          ↓
Bot analyzes error context
          ↓
Bot creates fix PR
```

---

## Database Schema

### `issues` Table

```sql
CREATE TABLE issues (
  id TEXT PRIMARY KEY,            -- 'issue-{uuid}'
  timestamp TEXT NOT NULL,        -- ISO 8601 timestamp
  session_id TEXT,                -- Browser session ID
  trace_id TEXT,                  -- Correlation ID (if available)
  route TEXT NOT NULL,            -- Where issue occurred (e.g., '/monitor/dev-bots')
  user_agent TEXT,                -- Browser user agent
  description TEXT,               -- Optional user description
  status TEXT NOT NULL,           -- 'pending', 'triaged', 'assigned', 'resolved', 'wont_fix'
  task_id TEXT,                   -- Associated bugfix task ID
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_trace_id ON issues(trace_id);
CREATE INDEX idx_issues_created_at ON issues(created_at DESC);
```

### Issue Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Report received, awaiting triage |
| `triaged` | Analyzed, bugfix task created |
| `assigned` | Bugfix task actively being worked |
| `resolved` | Bugfix task completed, fix deployed |
| `wont_fix` | Determined not actionable or duplicate |

---

## Issue Submission

### Frontend UI

**Location:** Floating button in bottom-right corner (all routes)

**Trigger:** User clicks "Report Issue" button

**Form Fields:**
- **Route** (auto-captured from current URL path)
- **Description** (optional, user-provided)
- **Trace ID** (auto-captured if available from app context)
- **Session ID** (auto-generated browser session UUID)

**Submit Handler:**
```typescript
async function submitIssueReport(data: IssueReport): Promise<void> {
  const response = await fetch('/api/issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      route: window.location.pathname,
      description: data.description,
      traceId: getTraceId(),  // From app context
      sessionId: getSessionId()  // From localStorage
    })
  });
  
  if (response.ok) {
    showNotification('Issue reported! We\'ll investigate.');
  }
}
```

### Backend API Endpoint

**Route:** `POST /api/issues`

**Handler:**
```typescript
router.post('/issues', async (req, res) => {
  try {
    const { route, description, traceId, sessionId } = req.body;
    
    // Validation
    if (!route) {
      return sendError(res, 'Route is required', 400);
    }
    
    // Store issue
    const issue = await issueStorageService.storeIssue({
      route,
      description,
      traceId,
      sessionId,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });
    
    // Event-driven triage (no await - fire and forget)
    issueTriageService.handleNewIssue(issue.id).catch(err => {
      logger.error({
        category: 'issues',
        action: 'triage_failed',
        message: 'Failed to triage issue',
        error: err
      });
    });
    
    sendSuccess(res, { issueId: issue.id });
  } catch (error) {
    sendError(res, 'Failed to store issue', 500, { error });
  }
});
```

---

## Event-Driven Triage

### Immediate Triage on Report

**Trigger:** `issue:created` event emitted when issue stored

**Flow:**
```typescript
// IssueTriageService.handleNewIssue()
async handleNewIssue(issueId: string): Promise<void> {
  const issue = await db.getIssueById(issueId);
  
  // Step 1: Analyze issue context
  const context = await this.gatherContext(issue);
  
  // Step 2: Determine severity
  const severity = this.classifySeverity(issue, context);
  
  // Step 3: Check for duplicates
  const isDuplicate = await this.checkDuplicate(issue);
  if (isDuplicate) {
    await db.updateIssueStatus(issueId, 'wont_fix');
    return;
  }
  
  // Step 4: Create bugfix task
  const taskId = await this.createBugfixTask(issue, context, severity);
  
  // Step 5: Update issue status
  await db.run(
    'UPDATE issues SET status = ?, task_id = ?, updated_at = ? WHERE id = ?',
    ['triaged', taskId, new Date().toISOString(), issueId]
  );
  
  logger.info({
    category: 'issues',
    action: 'triaged',
    issueId,
    taskId,
    severity
  });
}
```

### Context Gathering

**Sources:**
1. **Structured Logs** - Search by trace ID
2. **Error Logs** - Recent errors from route
3. **Browser Info** - User agent, session data
4. **Route State** - API calls made from route

**Implementation:**
```typescript
async function gatherContext(issue: Issue): Promise<IssueContext> {
  const context: IssueContext = {
    logs: [],
    recentErrors: [],
    relatedIssues: []
  };
  
  // Search logs by trace ID
  if (issue.traceId) {
    context.logs = await logService.searchByTraceId(issue.traceId);
  }
  
  // Find recent errors from same route
  context.recentErrors = await logService.getRecentErrors(issue.route, {
    limit: 10,
    since: new Date(Date.now() - 3600000)  // Last hour
  });
  
  // Find similar issues
  context.relatedIssues = await db.all(
    `SELECT * FROM issues 
     WHERE route = ? 
     AND status IN ('resolved', 'wont_fix') 
     ORDER BY created_at DESC LIMIT 5`,
    [issue.route]
  );
  
  return context;
}
```

---

## Bugfix Task Creation

### Task Generation

**Task Type:** `fix`

**Title:** `Fix reported issue: {route} - {description_summary}`

**Agent Selection:** Claude (requires debugging + reasoning)

**Prompt Template:**
```typescript
function generateBugfixPrompt(issue: Issue, context: IssueContext): string {
  return `
# Bugfix Task

## Reported Issue
- **Route:** ${issue.route}
- **Description:** ${issue.description || 'No description provided'}
- **Trace ID:** ${issue.traceId || 'Not available'}
- **Timestamp:** ${issue.timestamp}

## Context

### Related Logs
${context.logs.map(log => formatLog(log)).join('\n')}

### Recent Errors
${context.recentErrors.map(err => formatError(err)).join('\n')}

### Similar Issues (Resolved)
${context.relatedIssues.map(i => formatIssue(i)).join('\n')}

## Your Task

1. Analyze the logs and error context
2. Identify the root cause
3. Implement a fix
4. Add tests to prevent regression
5. Verify fix resolves the issue

## Acceptance Criteria

- [ ] Root cause identified and documented
- [ ] Fix implemented with minimal scope
- [ ] Tests added for regression prevention
- [ ] Manual verification passed
`.trim();
}
```

### Priority Calculation

**Base Priority:** P1 (high priority for bugs)

**Adjustments:**
- **Critical route** (`/monitor/*`) → P0
- **Frequent issue** (>5 reports in 24h) → P0
- **Has trace ID** (easier to debug) → +10 priority
- **User provided description** → +5 priority

---

## Deduplication Strategy

### Fingerprinting

**Goal:** Prevent creating multiple tasks for same underlying issue

**Fingerprint Components:**
1. Route
2. Error message (if available)
3. Stack trace signature (if available)

**Generation:**
```typescript
function generateIssueFingerprint(issue: Issue, context: IssueContext): string {
  const components = [
    issue.route,
    context.recentErrors[0]?.message || '',
    extractStackSignature(context.logs)
  ];
  
  return crypto.createHash('sha256')
    .update(components.join(':'))
    .digest('hex')
    .substring(0, 16);
}
```

### Duplicate Detection

**Check:** Before creating task, search for recent issues with same fingerprint

**Implementation:**
```typescript
async function checkDuplicate(issue: Issue): Promise<boolean> {
  const fingerprint = generateIssueFingerprint(issue, context);
  
  // Check for active tasks with same fingerprint
  const existingTask = await db.get(
    `SELECT tasks.id 
     FROM tasks 
     JOIN issues ON issues.task_id = tasks.id 
     WHERE issues.fingerprint = ? 
     AND tasks.status IN ('pending', 'active')
     AND tasks.created_at > datetime('now', '-24 hours')`,
    [fingerprint]
  );
  
  return !!existingTask;
}
```

---

## Severity Classification

### Severity Levels

| Level | Criteria | Priority | Auto-Escalate |
|-------|----------|----------|---------------|
| **Critical** | Blocks core functionality | P0 | After 2 failed attempts |
| **High** | Major feature broken | P1 | After 3 failed attempts |
| **Medium** | Minor feature degraded | P2 | After 4 failed attempts |
| **Low** | Cosmetic or edge case | P3 | Manual escalation only |

### Classification Logic

```typescript
function classifySeverity(issue: Issue, context: IssueContext): Severity {
  // Critical: Route is core monitoring page + has errors
  if (issue.route.startsWith('/monitor/') && context.recentErrors.length > 0) {
    return 'critical';
  }
  
  // High: Multiple recent errors
  if (context.recentErrors.length >= 5) {
    return 'high';
  }
  
  // Medium: Has trace ID and errors
  if (issue.traceId && context.recentErrors.length > 0) {
    return 'medium';
  }
  
  // Low: Everything else
  return 'low';
}
```

---

## Resolution Tracking

### Issue Status Updates

**Status Flow:**
```
pending → triaged → assigned → resolved
                      ↓
                   wont_fix
```

**Update Triggers:**
- **triaged:** Bugfix task created
- **assigned:** Bugfix task starts execution
- **resolved:** Bugfix task completed + PR merged
- **wont_fix:** Determined duplicate or not actionable

### Automatic Status Updates

**Event Listeners:**
```typescript
// When bugfix task starts
eventBus.on('task:started', async (task: Task) => {
  if (task.type === 'fix') {
    const issue = await db.get(
      'SELECT * FROM issues WHERE task_id = ?',
      [task.id]
    );
    
    if (issue) {
      await db.run(
        'UPDATE issues SET status = ?, updated_at = ? WHERE id = ?',
        ['assigned', new Date().toISOString(), issue.id]
      );
    }
  }
});

// When bugfix task completes
eventBus.on('task:completed', async (task: Task) => {
  if (task.type === 'fix') {
    const issue = await db.get(
      'SELECT * FROM issues WHERE task_id = ?',
      [task.id]
    );
    
    if (issue) {
      await db.run(
        `UPDATE issues 
         SET status = ?, resolved_at = ?, updated_at = ? 
         WHERE id = ?`,
        ['resolved', new Date().toISOString(), new Date().toISOString(), issue.id]
      );
    }
  }
});
```

---

## Metrics & Analytics

### Issue Metrics

**Collection Rate:**
- Issues reported per day
- Issues per route
- Issues by time of day

**Resolution Metrics:**
- Time to triage (report → task created)
- Time to assignment (task created → bot starts)
- Time to resolution (bot starts → PR merged)
- Resolution rate (resolved / total reported)

**Quality Metrics:**
- Duplicate report rate
- False positive rate (wont_fix)
- Recurring issues (same fingerprint >3 times)

### Route Health

**Per-Route Tracking:**
- Issue frequency
- Average severity
- Resolution success rate
- Most common error types

**Health Score:**
```typescript
function calculateRouteHealth(route: string): number {
  const issues = getIssuesForRoute(route, { since: '30 days' });
  
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const unresolved = issues.filter(i => i.status !== 'resolved').length;
  
  // 100 - penalties
  let score = 100;
  score -= criticalCount * 10;
  score -= unresolved * 5;
  
  return Math.max(0, score);
}
```

---

## User Feedback Loop

### Resolution Notification

**When Issue Resolved:**
- Email notification (if user provided email)
- In-app notification on next visit
- Link to PR with fix details

**Notification Template:**
```typescript
interface ResolutionNotification {
  issueId: string;
  route: string;
  description: string;
  resolution: {
    taskId: string;
    prUrl: string;
    deployedAt: string;
  };
}
```

### Verification Request

**Optional:** Ask user to verify fix

**UI:** "Your reported issue on {route} has been fixed. Can you verify?"

**Outcome:** User feedback improves bot learning

---

## Configuration

### Environment Variables

**Optional:**
- `ISSUE_AUTO_TRIAGE_ENABLED` - Enable automatic triage (default: true)
- `ISSUE_DUPLICATE_WINDOW_HOURS` - Duplicate detection window (default: 24)
- `ISSUE_MAX_CONTEXT_LOGS` - Max log entries to include (default: 100)

### Triage Rules

**Configurable:** (via database settings table)
- Severity thresholds
- Auto-escalation criteria
- Duplicate detection sensitivity

---

## Error Handling

### Triage Failures

**What if triage fails?**
- Issue remains in `pending` status
- Error logged with full context
- Retry attempted after 5 minutes
- After 3 failed retries, human notified

**Graceful Degradation:**
```typescript
async function handleNewIssue(issueId: string): Promise<void> {
  try {
    await this.triageIssue(issueId);
  } catch (error) {
    logger.error({
      category: 'issues',
      action: 'triage_failed',
      issueId,
      error
    });
    
    // Don't throw - prevents API failure
    // Issue stays in pending, retry later
  }
}
```

---

## Security Considerations

### Rate Limiting

**Prevent Abuse:**
- Max 10 reports per session per hour
- Max 100 reports per IP per day

**Implementation:**
```typescript
const rateLimiter = new RateLimiter({
  maxPerSession: 10,
  windowHours: 1
});

router.post('/issues', async (req, res) => {
  const sessionId = req.body.sessionId;
  
  if (!rateLimiter.check(sessionId)) {
    return sendError(res, 'Rate limit exceeded', 429);
  }
  
  // ... process report
});
```

### Input Sanitization

**XSS Prevention:**
- Sanitize description field
- Validate route format
- Escape user agent string

---

## Future Enhancements

**Planned:**
- Screenshot capture with issue reports
- Browser console log capture
- Network request replay
- Issue clustering (ML-based grouping)
- User voting on issue severity

**Not Planned:**
- Public issue tracker (internal tool only)
- Email-based issue submission

---

## Related Documentation

- **Dev-Bots Architecture:** `docs/architecture/dev-bots-architecture.md`
- **Task Queue Architecture:** `docs/architecture/task-queue-architecture.md`
- **Error Recovery Design:** `docs/technicalDesigns/error-detection-and-recovery-design.md`
