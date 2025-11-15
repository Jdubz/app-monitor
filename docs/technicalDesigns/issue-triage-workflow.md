# Issue Report Triage & Resolution Workflow

**Status:** Technical Design
**Aligned with:** master-design-intent.md (autonomy-first, event-driven)

---

## Overview

Issue reports flow through an **autonomous triage → diagnosis → fix** pipeline. Humans only intervene when automation can't resolve or needs guidance.

---

## Data Flow

```
User clicks "Report Issue"
          ↓
POST /api/issues
          ↓
logs/issues/YYYY-MM-DD.jsonl (persisted)
          ↓
Issue Detection Service (runs every 5 minutes)
          ↓
Create bugfix task in TaskQueue
          ↓
Dev-bot assigned to task
          ↓
Bot searches logs by trace ID
          ↓
Bot analyzes error context
          ↓
Bot creates fix PR
          ↓
PR auto-merge or human review
```

---

## Persistence

### Issue Storage

**File:** `backend/logs/issues/YYYY-MM-DD.jsonl`

**Format:**
```jsonl
{"id":"issue-abc123","timestamp":"2025-11-15T10:30:00.000Z","sessionId":"session-xyz","traceId":"trace-def456","route":"/monitor/dev-bots","userAgent":"Mozilla/5.0...","description":"Queue shows no tasks","status":"pending","created":"2025-11-15T10:30:00.000Z"}
```

**Fields:**
- `id` - Unique issue ID (generated)
- `timestamp` - When user reported
- `sessionId` - Browser session
- `traceId` - Correlation ID (if available)
- `route` - Where issue occurred
- `userAgent` - Browser info
- `description` - Optional user description
- `status` - `pending`, `triaged`, `assigned`, `resolved`, `wont_fix`
- `created` - When recorded
- `taskId` - Task ID (when created)
- `resolution` - Fix description (when resolved)

### Issue Index (for fast querying)

**Database:** `backend/data/issues.db` (SQLite)

**Schema:**
```sql
CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  sessionId TEXT,
  traceId TEXT,
  route TEXT,
  status TEXT DEFAULT 'pending',
  taskId TEXT,
  created TEXT NOT NULL,
  resolved TEXT,
  INDEX idx_status (status),
  INDEX idx_trace (traceId),
  INDEX idx_timestamp (timestamp)
);
```

**Why both JSONL + SQLite?**
- JSONL: Append-only, never loses data, easy to search with grep
- SQLite: Fast queries for status, triage automation, stats

---

## Autonomous Triage

### Issue Detection Service

**Runs:** Every 5 minutes (cron job in backend)

**Process:**
1. Query issues with `status = 'pending'`
2. For each issue:
   - Search logs for trace ID (±5 minutes from timestamp)
   - Extract errors, warnings, anomalies
   - Determine severity and type
   - Create task or mark as `wont_fix`

**File:** `backend/src/services/issueTriageService.ts`

```typescript
class IssueTriageService {
  async triagePendingIssues(): Promise<void> {
    const pending = await db.query('SELECT * FROM issues WHERE status = ?', ['pending'])

    for (const issue of pending) {
      const diagnosis = await this.diagnoseIssue(issue)

      if (diagnosis.shouldCreateTask) {
        const task = await this.createBugfixTask(issue, diagnosis)
        await this.updateIssueStatus(issue.id, 'assigned', task.id)
      } else {
        await this.updateIssueStatus(issue.id, 'wont_fix', null, diagnosis.reason)
      }
    }
  }

  private async diagnoseIssue(issue: IssueReport): Promise<Diagnosis> {
    // 1. Search logs around timestamp
    const logs = await this.searchLogsByTimeRange(
      issue.timestamp,
      -5 * 60 * 1000, // -5 minutes
      +5 * 60 * 1000  // +5 minutes
    )

    // 2. Filter by session ID or trace ID
    const relevantLogs = issue.traceId
      ? logs.filter(log => log.traceId === issue.traceId)
      : logs.filter(log => log.sessionId === issue.sessionId)

    // 3. Find errors
    const errors = relevantLogs.filter(log => log.level === 'error')

    // 4. Classify
    if (errors.length === 0) {
      return {
        shouldCreateTask: false,
        reason: 'No errors found in logs around reported timestamp'
      }
    }

    // 5. Extract stack trace, component, route
    const primaryError = errors[0]
    return {
      shouldCreateTask: true,
      errorMessage: primaryError.error.message,
      stackTrace: primaryError.error.stack,
      component: primaryError.scope,
      route: issue.route,
      severity: this.calculateSeverity(errors, relevantLogs)
    }
  }

  private async createBugfixTask(
    issue: IssueReport,
    diagnosis: Diagnosis
  ): Promise<Task> {
    const description = this.generateTaskDescription(issue, diagnosis)

    return await taskQueueService.addTask({
      type: 'bugfix',
      description,
      priority: diagnosis.severity === 'critical' ? 10 : 5,
      documentation: this.generateInvestigationGuide(issue, diagnosis),
      acceptanceCriteria: [
        'Error no longer occurs when reproducing user steps',
        'Fix includes test to prevent regression',
        'PR passes all quality gates'
      ]
    })
  }

  private generateTaskDescription(
    issue: IssueReport,
    diagnosis: Diagnosis
  ): string {
    return `Fix frontend error reported by user

**Issue Report:**
- ID: ${issue.id}
- Timestamp: ${issue.timestamp}
- Route: ${issue.route}
- User Description: ${issue.description || 'None provided'}

**Automated Diagnosis:**
- Error: ${diagnosis.errorMessage}
- Component: ${diagnosis.component}
- Trace ID: ${issue.traceId}

**Investigation:**
1. Search logs for trace ID: \`grep "${issue.traceId}" logs/frontend/*.jsonl\`
2. Examine error stack trace (see below)
3. Reproduce by navigating to route: ${issue.route}
4. Fix the error
5. Add test to prevent regression

**Error Stack Trace:**
\`\`\`
${diagnosis.stackTrace}
\`\`\`

**Relevant Log Entries:**
Search window: ${issue.timestamp} ±5 minutes
Session ID: ${issue.sessionId}
Trace ID: ${issue.traceId}
`
  }
}
```

---

## Task Execution

### Dev-Bot Investigation

When bot receives bugfix task:

1. **Read task description** - Get trace ID, timestamp, route
2. **Search logs** - `grep "trace-abc123" logs/frontend/*.jsonl`
3. **Analyze context** - What happened before error?
4. **Locate code** - Find component from stack trace
5. **Reproduce** - Navigate to route, trigger error
6. **Fix** - Implement solution
7. **Test** - Verify fix works
8. **PR** - Create pull request

**Structured investigation prompt:**
```markdown
You are debugging a frontend error reported by a user.

**Issue Details:**
- Trace ID: trace-abc123
- Timestamp: 2025-11-15T10:30:00.000Z
- Route: /monitor/dev-bots
- Error: Cannot read property 'length' of undefined

**Your Investigation Steps:**
1. Search frontend logs for trace ID to see full context
2. Examine stack trace to locate exact line
3. Analyze logs before error to understand state
4. Identify root cause
5. Implement fix with test
6. Verify error no longer occurs

**Log Search Command:**
```bash
grep "trace-abc123" /workspace/backend/logs/frontend/2025-11-15.jsonl
```

**Expected to find:**
- User actions leading to error
- API calls with responses
- State changes
- Error with stack trace

**Create PR with:**
- Fix for the error
- Test that reproduces and validates fix
- Explanation of root cause
```

---

## Resolution Tracking

### Updating Issue Status

**When task is created:**
```typescript
await db.query(
  'UPDATE issues SET status = ?, taskId = ? WHERE id = ?',
  ['assigned', task.id, issue.id]
)
```

**When PR is merged:**
```typescript
await db.query(
  'UPDATE issues SET status = ?, resolved = ?, resolution = ? WHERE taskId = ?',
  ['resolved', new Date().toISOString(), pr.title, task.id]
)
```

**Update JSONL (append resolution):**
```jsonl
{"id":"issue-abc123","timestamp":"2025-11-15T10:30:00.000Z",...,"status":"resolved","taskId":"task-xyz","resolution":"Fixed null pointer in TaskQueue.render()","resolvedAt":"2025-11-15T14:30:00.000Z","prNumber":142}
```

---

## Human Oversight

### When Humans Intervene

**Automatic escalation if:**
1. Triage service can't diagnose (no errors in logs)
2. Bot fails to fix after 2 attempts
3. Issue marked `severity: critical`
4. Multiple users report same issue (>3 in 1 hour)

**Escalation creates:**
- GitHub issue with label `needs-human-review`
- Slack notification (if configured)
- Entry in `logs/escalations/YYYY-MM-DD.jsonl`

### Manual Triage UI (Future)

**Minimal UI showing:**
- Binary status: ✅ Auto-triaged | ⚠️ Needs review
- Count of pending issues
- Recent escalations

**No dashboards, no analytics.** Just:
- List of issues
- Link to logs (grep command)
- Link to task (if created)
- Link to PR (if resolved)

---

## Deduplication

### Preventing Duplicate Tasks

Before creating task, check if similar issue already has task:

```typescript
private async isDuplicate(issue: IssueReport): Promise<boolean> {
  // Check for existing task with same error message + component
  const fingerprint = this.generateFingerprint(issue)

  const existing = await db.query(
    'SELECT * FROM issues WHERE fingerprint = ? AND status IN (?, ?) AND created > ?',
    [fingerprint, 'assigned', 'triaged', Date.now() - 24 * 60 * 60 * 1000]
  )

  return existing.length > 0
}

private generateFingerprint(issue: IssueReport): string {
  // Hash of: error message + component + route
  const data = `${issue.errorMessage}:${issue.component}:${issue.route}`
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16)
}
```

**If duplicate:** Update existing issue with new occurrence count instead of creating new task.

---

## Metrics (Binary/Alerts Only)

**NOT vanity metrics.**

**Binary indicators:**
- ✅ All pending issues triaged? (Yes/No)
- ✅ All assigned tasks have PRs? (Yes/No)
- ⚠️ Escalations pending? (Count if >0)

**Alerts:**
- 🚨 Pending issues >10 (triage backlog)
- 🚨 Same error reported >3 times in 1 hour (critical bug)
- 🚨 Issue age >7 days without resolution (stuck)

**No charts, no trends, no dashboards.** Just high-signal alerts.

---

## Storage Lifecycle

### Retention

**Issue JSONL files:**
- Keep: 90 days
- Rotate: Daily
- Cleanup: Automated job deletes files older than 90 days

**Issue database:**
- Keep resolved issues: 30 days
- Archive to JSONL: After 30 days
- Cleanup: Automated job

**Frontend log JSONL:**
- Keep: 30 days (as designed)
- Referenced by issues via trace ID

---

## Example End-to-End Flow

### User Reports Issue

1. User on `/monitor/dev-bots` sees "no tasks" but backend says 3 pending
2. Clicks "Report Issue" button
3. Optional description: "Queue shows empty"
4. Frontend sends:
```json
{
  "timestamp": "2025-11-15T10:30:00.000Z",
  "traceId": "trace-abc123",
  "sessionId": "session-xyz",
  "route": "/monitor/dev-bots",
  "description": "Queue shows empty"
}
```

### Backend Persists

5. POST /api/issues → logs/issues/2025-11-15.jsonl
6. Insert into issues.db with `status: pending`

### Triage Service (5 minutes later)

7. Detects pending issue
8. Searches logs: `grep "trace-abc123" logs/frontend/2025-11-15.jsonl`
9. Finds logs:
```jsonl
{"timestamp":"2025-11-15T10:29:58.000Z","level":"info","message":"API request","traceId":"trace-abc123","data":{"url":"/api/dev-bots/queue"}}
{"timestamp":"2025-11-15T10:29:58.500Z","level":"info","message":"API response","traceId":"trace-abc123","data":{"status":200}}
{"timestamp":"2025-11-15T10:29:59.000Z","level":"error","message":"Rendering failed","traceId":"trace-abc123","scope":"DevBotsTabContent","error":{"message":"Cannot read property 'length' of undefined","stack":"..."}}
```
10. Creates task: "Fix null pointer in DevBotsTabContent"
11. Updates issue: `status: assigned, taskId: task-xyz`

### Dev-Bot Executes

12. Bot reads task description
13. Runs: `grep "trace-abc123" logs/frontend/2025-11-15.jsonl`
14. Analyzes logs, finds error in line 34 of DevBotsTabContent.tsx
15. Fixes: Add null check `filteredChains?.length ?? 0`
16. Creates PR #142

### PR Merges

17. Auto-merge (passes gates)
18. Update issue: `status: resolved, prNumber: 142`
19. Append to JSONL: `{"id":"issue-abc123",...,"status":"resolved","resolution":"Added null check"}`

**Total time:** 5 minutes (triage) + 10 minutes (bot fix) = **15 minutes from report to resolution**

---

## Database Schema (Complete)

```sql
-- Issues table
CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  sessionId TEXT,
  traceId TEXT,
  route TEXT,
  userAgent TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending',
  taskId TEXT,
  fingerprint TEXT,
  severity TEXT,
  created TEXT NOT NULL,
  resolved TEXT,
  resolution TEXT,
  prNumber INTEGER,
  INDEX idx_status (status),
  INDEX idx_trace (traceId),
  INDEX idx_timestamp (timestamp),
  INDEX idx_fingerprint (fingerprint)
);

-- Issue occurrences (for deduplication tracking)
CREATE TABLE issue_occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issueId TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  sessionId TEXT,
  FOREIGN KEY (issueId) REFERENCES issues(id)
);
```

---

## API Endpoints

### POST /api/issues

**Request:**
```typescript
{
  timestamp: string
  traceId?: string
  sessionId: string
  route: string
  userAgent: string
  description?: string
}
```

**Response:**
```typescript
{
  success: true,
  issueId: 'issue-abc123',
  message: 'Issue recorded. Automated triage will run within 5 minutes.'
}
```

### GET /api/issues (Admin only)

**Query params:**
- `status` - Filter by status
- `limit` - Max results (default 50)
- `offset` - Pagination

**Response:**
```typescript
{
  issues: [
    {
      id: 'issue-abc123',
      timestamp: '2025-11-15T10:30:00.000Z',
      route: '/monitor/dev-bots',
      status: 'resolved',
      taskId: 'task-xyz',
      resolution: 'Added null check'
    }
  ],
  total: 42
}
```

---

## Files

**Backend:**
```
backend/src/
├── routes/
│   └── issues.routes.ts          (POST /api/issues, GET /api/issues)
├── services/
│   ├── issueTriageService.ts     (Autonomous triage)
│   └── issueStorageService.ts    (JSONL + SQLite persistence)
└── cron/
    └── triageIssues.cron.ts      (Every 5 minutes)

backend/logs/
├── issues/
│   └── YYYY-MM-DD.jsonl          (Issue records)
└── frontend/
    └── YYYY-MM-DD.jsonl          (Referenced for diagnosis)

backend/data/
└── issues.db                     (SQLite index)
```

**Frontend:**
```
frontend/src/
└── components/
    └── ReportIssueButton.tsx     (One button, one API call)
```

---

## Implementation Priority

**Phase 1: Persistence (Day 1)**
- POST /api/issues endpoint
- JSONL storage
- SQLite schema

**Phase 2: Triage Service (Day 2-3)**
- Log search by trace ID
- Error extraction
- Task creation

**Phase 3: Deduplication (Day 4)**
- Fingerprint generation
- Duplicate detection

**Phase 4: Resolution Tracking (Day 5)**
- Status updates
- PR linking

**Total:** 5 days

---

## Alignment with Master Design Intent

✅ **Autonomy First:** Issues auto-triaged, tasks auto-created, PRs auto-merged
✅ **Event-Driven:** Cron-based triage (not polling), webhook on PR merge
✅ **Binary Alerts:** Pending count, escalation count
✅ **Database as Source of Truth:** SQLite for issue state
✅ **Trust But Verify:** Task → Review → Fix → Complete pipeline

**No manual triage UI initially.** System operates autonomously. Humans only see escalations.
