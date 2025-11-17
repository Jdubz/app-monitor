# Phase System Observability

**Agent-First Debugging and Exploration APIs**

## Overview

The Phase System Observability suite provides comprehensive debugging and monitoring capabilities for autonomous agents working with the 7-phase task execution system. All features are exposed via REST APIs optimized for programmatic consumption.

## Motivation

The phased task system is complex with:
- 7 sequential phases with validation
- Phase 3↔4 review/fix loops (up to 4 iterations)
- Phase 5 internal test/fix loops (up to 4 attempts)
- Recovery agent interventions
- Multiple failure modes

Agents need deep observability to:
- Debug stuck tasks independently
- Identify system-wide patterns
- Make data-driven improvements
- Validate recovery effectiveness

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│               Observability API Layer                   │
│            GET /api/observability/*                     │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│          PhaseObservabilityService                      │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Task Trace   │  │ Log Query    │  │  Anomaly     │  │
│  │  Generation  │  │   Engine     │  │  Detection   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Diagnostic Query Engine                   │  │
│  │  - slow_phases                                    │  │
│  │  - high_failure_phases                            │  │
│  │  - loop_iterations                                │  │
│  │  - recovery_effectiveness                         │  │
│  │  - validation_patterns                            │  │
│  └──────────────────────────────────────────────────┘  │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│              Database Layer                             │
│  - tasks (task metadata, current phase)                │
│  - task_stage_runs (phase execution history)           │
│  - logs (structured logging)                           │
└─────────────────────────────────────────────────────────┘
```

## Core Features

### 1. Task Execution Tracing

**Endpoint:** `GET /api/observability/tasks/:taskId/trace`

Returns complete execution timeline for a task across all phases:

```typescript
{
  "taskId": "task-123",
  "taskTitle": "Implement feature X",
  "taskStatus": "running",
  "totalDurationMs": 1234567,
  "createdAt": "2024-01-15T10:00:00Z",
  "currentPhase": {
    "index": 3,
    "name": "Review",
    "status": "running",
    "attempts": 2
  },
  "phases": [
    {
      "phaseIndex": 1,
      "phaseName": "Planning",
      "attempt": 1,
      "status": "success",
      "durationMs": 45000,
      "validatorResults": {...},
      "error": null
    }
    // ... more phases
  ],
  "recoveryCount": 1,
  "loopCount": 2,
  "isStuck": false
}
```

**Key Metrics:**
- `recoveryCount`: Number of recovery agent interventions
- `loopCount`: Total loop iterations (Phase 3↔4 + Phase 5 internal)
- `isStuck`: Boolean indicating if task hasn't progressed in 10+ minutes

**Use Cases:**
- Investigate why a task failed
- Analyze loop behavior (are we stuck?)
- Validate recovery effectiveness
- Identify performance bottlenecks

### 2. Phase Log Querying

**Endpoint:** `GET /api/observability/logs`

Flexible log querying with multiple filters:

**Query Parameters:**
```
?taskId=task-123              # Filter by specific task
&phaseIndex=3                 # Filter by phase (1-7)
&level=error                  # Filter by log level
&category=validation          # Filter by category
&startTime=2024-01-15T00:00Z  # Time range start
&endTime=2024-01-15T23:59Z    # Time range end
&limit=100                    # Max results
&offset=0                     # Pagination offset
```

**Response:**
```typescript
{
  "logs": [
    {
      "taskId": "task-123",
      "phaseIndex": 3,
      "phaseName": "Review",
      "attempt": 2,
      "timestamp": "2024-01-15T10:30:00Z",
      "level": "error",
      "category": "validation",
      "action": "review_validation",
      "message": "Review validation failed",
      "details": {...}
    }
  ],
  "total": 42,
  "query": {...}
}
```

**Use Cases:**
- Debug specific phase failures
- Correlate errors across tasks
- Audit validation behavior
- Track recovery agent actions

### 3. Anomaly Detection

**Endpoint:** `GET /api/observability/anomalies`

Automated detection of problematic execution patterns:

**Response:**
```typescript
{
  "timestamp": "2024-01-15T12:00:00Z",
  "tasks": [
    {
      "taskId": "task-456",
      "anomalies": [
        {
          "type": "stuck_loop",
          "severity": "high",
          "description": "Task stuck in loop with 6 iterations",
          "details": { "loopCount": 6 }
        },
        {
          "type": "excessive_recovery",
          "severity": "medium",
          "description": "Task required 3 recovery attempts",
          "details": { "recoveryCount": 3 }
        }
      ],
      "score": 13,
      "isAnomaly": true
    }
  ],
  "systemPatterns": [
    {
      "type": "widespread_stuck_loops",
      "description": "4 tasks are stuck in execution loops",
      "affectedTasks": ["task-456", "task-789", ...],
      "severity": "high"
    }
  ]
}
```

**Anomaly Types:**

| Type | Threshold | Severity Logic |
|------|-----------|----------------|
| `stuck_loop` | >3 loop iterations | High: >5, Medium: 3-5 |
| `excessive_recovery` | >2 recovery attempts | High: >4, Medium: 2-4 |
| `slow_phase` | Phase >10 minutes | Low (informational) |
| `validation_pattern` | >2 validation failures | Medium |

**System Patterns:**

- `widespread_stuck_loops`: 3+ tasks in loops
- `recovery_pattern`: 3+ tasks with excessive recovery

**Use Cases:**
- Proactive issue detection
- System health monitoring
- Identify systemic problems
- Prioritize debugging efforts

### 4. Diagnostic Queries

**Endpoint:** `GET /api/observability/diagnostics`

List of pre-built diagnostic queries:

```typescript
[
  {
    "id": "slow_phases",
    "name": "Slow Phase Executions",
    "description": "Find phase runs that took longer than 5 minutes",
    "category": "performance"
  },
  // ... more queries
]
```

**Endpoint:** `GET /api/observability/diagnostics/:queryId`

Execute a diagnostic query:

```typescript
{
  "query": {
    "id": "slow_phases",
    "name": "Slow Phase Executions",
    ...
  },
  "executedAt": "2024-01-15T12:00:00Z",
  "results": [
    {
      "task_id": "task-123",
      "phase_index": 5,
      "duration_ms": 420000,
      ...
    }
  ],
  "summary": "Found 15 phase executions exceeding 5 minutes",
  "recommendations": [
    "Consider optimizing validator timeout configurations",
    "Review phase execution logs for blocking operations"
  ]
}
```

**Available Queries:**

1. **slow_phases**: Phases >5 minutes
   - Category: `performance`
   - Recommendations: Validator optimization, blocking operation review

2. **high_failure_phases**: Phases with >30% failure rate
   - Category: `failures`
   - Recommendations: Validator review, documentation improvements

3. **loop_iterations**: Tasks stuck in loops
   - Category: `loops`
   - Recommendations: Loop exit condition review, stricter validation

4. **recovery_effectiveness**: Recovery success rates by category
   - Category: `recovery`
   - No automatic recommendations (data-only)

5. **validation_patterns**: Common validation failures
   - Category: `validation`
   - Recommendations: Task template updates, recovery diagnosis improvements

**Use Cases:**
- Performance analysis
- Failure pattern identification
- Recovery effectiveness validation
- System optimization planning

## Implementation Details

### Database Schema

**Tasks Table:**
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  phase_index INTEGER,        -- Current phase (1-7)
  phase_status TEXT,          -- ready/running/validating/recovering/complete/blocked
  phase_attempts INTEGER      -- Retry count for current phase
);
```

**Task Stage Runs Table:**
```sql
CREATE TABLE task_stage_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  phase_index INTEGER NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,       -- success/failed/blocked/recovered
  created_at TEXT NOT NULL,
  completed_at TEXT,
  validator_results TEXT,     -- JSON
  recovery_diagnosis TEXT,    -- JSON
  error TEXT
);
```

**Logs Table:**
```sql
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT                -- JSON
);
```

### Performance Considerations

1. **Metrics Cache**: PhaseMetricsService caches results for 5 minutes
2. **Query Limits**: Diagnostic queries limited to 50 results
3. **Index Strategy**: 
   - `task_stage_runs(task_id, phase_index)`
   - `tasks(status, phase_index)`
   - `logs(timestamp, level)`

4. **Pagination**: Log queries support limit/offset for large result sets

### Stuck Task Detection Logic

A task is considered stuck if ALL of:
1. Status is `pending` or `running`
2. Created >30 minutes ago
3. No phase completed in last 10 minutes

### Loop Detection Logic

**Phase 3↔4 Loop:**
```
Total phase 3&4 runs - 2 = loop count
(Subtract 2 for first normal pass)
```

**Phase 5 Internal Loop:**
```
Total phase 5 runs - 1 = loop count
(Subtract 1 for first attempt)
```

## Agent Usage Examples

### Example 1: Debug a Failed Task

```bash
# 1. Get task execution trace
curl -H "X-API-Key: $API_KEY" \
  http://localhost:5000/api/observability/tasks/task-123/trace

# 2. Identify failed phase
# -> Phase 3 failed at attempt 2

# 3. Get phase-specific logs
curl -H "X-API-Key: $API_KEY" \
  "http://localhost:5000/api/observability/logs?taskId=task-123&phaseIndex=3&level=error"

# 4. Check recovery diagnosis in trace
# -> recovery_diagnosis: { category: "validation_failed", ... }
```

### Example 2: Monitor System Health

```bash
# 1. Check for anomalies
curl -H "X-API-Key: $API_KEY" \
  http://localhost:5000/api/observability/anomalies

# 2. If system patterns detected, run diagnostics
curl -H "X-API-Key: $API_KEY" \
  http://localhost:5000/api/observability/diagnostics/loop_iterations

# 3. Review recommendations and take action
```

### Example 3: Performance Analysis

```bash
# 1. List available diagnostics
curl -H "X-API-Key: $API_KEY" \
  http://localhost:5000/api/observability/diagnostics

# 2. Run slow_phases query
curl -H "X-API-Key: $API_KEY" \
  http://localhost:5000/api/observability/diagnostics/slow_phases

# 3. Analyze results and apply recommendations
```

### Example 4: Validate Recovery Effectiveness

```bash
# 1. Run recovery effectiveness query
curl -H "X-API-Key: $API_KEY" \
  http://localhost:5000/api/observability/diagnostics/recovery_effectiveness

# Response:
# [
#   {
#     "category": "retry",
#     "totalAttempts": 45,
#     "successfulRecoveries": 38,
#     "successRate": 0.844
#   },
#   ...
# ]
```

## Testing

Comprehensive test suite with 17 tests covering:

1. **Task Trace Generation** (5 tests)
   - Non-existent task handling
   - Complete timeline generation
   - Loop detection
   - Recovery counting
   - Stuck task detection

2. **Log Querying** (2 tests)
   - Filter application
   - Limit/pagination

3. **Anomaly Detection** (3 tests)
   - Stuck loop detection
   - Excessive recovery detection
   - System-wide pattern detection

4. **Diagnostic Queries** (7 tests)
   - Query listing
   - Unknown query handling
   - All 5 query executions
   - Recommendation generation

## Future Enhancements

1. **Metric Dashboards**: Pre-aggregated metrics for common questions
2. **Custom Queries**: Agent-defined SQL queries with safety validation
3. **Trend Analysis**: Historical pattern detection over time
4. **Correlation Analysis**: Cross-task dependency impact
5. **Real-time Alerts**: WebSocket notifications for critical anomalies

## Related Documentation

- `docs/architecture/phase-system-architecture.md` - Phase system architecture
- `docs/architecture/master-design-intent.md` - Autonomy-first design principles
- `backend/src/services/phaseMetrics.service.ts` - Aggregated metrics service
- `backend/src/routes/metrics.routes.ts` - Metrics API endpoints

## API Authentication

All observability endpoints require API key authentication:

```bash
curl -H "X-API-Key: your-api-key-here" \
  http://localhost:5000/api/observability/...
```

## Error Handling

Standard API error format:

```typescript
{
  "success": false,
  "error": "TASK_NOT_FOUND",
  "message": "Task task-123 not found"
}
```

Common error codes:
- `TASK_NOT_FOUND` (404): Task doesn't exist
- `QUERY_NOT_FOUND` (404): Diagnostic query ID invalid
- `FAILED_TO_*` (500): Internal service error
