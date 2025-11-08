# Dev-Bots Task Queue Documentation

## Overview

The Dev-Bots task queue system has evolved from a simple markdown-based queue to a sophisticated SQLite-backed queue with built-in agent comparison metrics. This document provides guidance on using the task queue system effectively.

**Note:** This file is now legacy documentation. The actual task queue is managed via SQLite database at `./data/tasks/queue.db`. For comprehensive documentation, see:
- [SQLite Integration Plan](./SQLITE_INTEGRATION_PLAN.md)
- [Dev-Bots Architecture](./README.md)

---

## Task Queue API Usage

### Creating Tasks

**POST `/api/dev-bots/tasks`**

Create a new task in the queue:

```bash
curl -X POST http://localhost:5000/api/dev-bots/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "implementation",
    "title": "Add user authentication",
    "description": "Implement JWT-based authentication for the API",
    "acceptanceCriteria": [
      "Users can register with email and password",
      "Users can login and receive JWT token",
      "Protected routes verify JWT token"
    ],
    "files": ["backend/src/auth/*"],
    "assignedAgent": "backend-specialist",
    "estimatedEffort": "3 hours"
  }'
```

### Viewing Queue Status

**GET `/api/dev-bots/tasks`**

View all tasks in the queue:

```bash
# Get all tasks
curl http://localhost:5000/api/dev-bots/tasks

# Get only pending tasks
curl http://localhost:5000/api/dev-bots/tasks | jq '.[] | select(.status == "pending")'

# Get running tasks
curl http://localhost:5000/api/dev-bots/tasks | jq '.[] | select(.status == "running")'
```

### Queue Metrics

**GET `/api/dev-bots/metrics`**

Get detailed queue metrics and statistics:

```bash
curl http://localhost:5000/api/dev-bots/metrics | jq '.'
```

**Example Response:**
```json
{
  "metrics": {
    "pending": 5,
    "running": 2,
    "completed": 45,
    "failed": 3,
    "cancelled": 0,
    "timeout": 1,
    "total": 56,
    "avg_completion_time_ms": 125430,
    "oldest_pending_age_ms": 3600000
  },
  "stats": [
    {
      "type": "implementation",
      "complexity": "medium",
      "completed_count": 15,
      "avg_minutes": 22.5,
      "max_minutes": 45.2,
      "min_minutes": 8.3
    }
  ]
}
```

#### Agent comparison drilldowns

See [SQLite Integration Plan - Agent Comparison Metrics](./SQLITE_INTEGRATION_PLAN.md#agent-comparison-metrics) for the full architecture. The quick commands below are handy when you just need a per-type snapshot:

```bash
# Task-type scoreboard grouped by agent
curl -s http://localhost:5000/api/dev-bots/agent-comparison \
  | jq '.comparison.task_type_breakdown \
        | to_entries[] \
        | {agent: .key, implementation: .value.implementation.success_rate, testing: .value.testing.success_rate, documentation: .value.documentation.success_rate}'

# Raw breakdown data if you want to feed Grafana
curl -s http://localhost:5000/api/dev-bots/agent-comparison \
  | jq '.comparison.task_type_breakdown'
```


---

## Agent Comparison Metrics

### Overview

The SQLite task queue tracks which AI agent (Claude or Codex) executed each task, enabling performance comparison.

### Getting Comparison Data

**GET `/api/dev-bots/agent-comparison`**

Retrieve Claude vs Codex performance metrics:

```bash
curl http://localhost:5000/api/dev-bots/agent-comparison | jq '.'
```

**Example Response:**
```json
{
  "comparison": {
    "claude": {
      "total": 45,
      "completed": 42,
      "failed": 3,
      "avg_duration_ms": 125430,
      "success_rate": 93.33
    },
    "codex": {
      "total": 43,
      "completed": 38,
      "failed": 5,
      "avg_duration_ms": 118250,
      "success_rate": 88.37
    }
  }
}
```

### Interpreting Metrics

**Key Metrics:**

1. **`total`**: Total number of tasks executed by this agent
2. **`completed`**: Number of successfully completed tasks
3. **`failed`**: Number of failed tasks
4. **`avg_duration_ms`**: Average time to complete tasks (milliseconds)
5. **`success_rate`**: Percentage of tasks completed successfully (0-100)

**Performance Analysis:**

```bash
# Compare success rates
curl http://localhost:5000/api/dev-bots/agent-comparison | \
  jq '{
    claude_success: .comparison.claude.success_rate,
    codex_success: .comparison.codex.success_rate,
    difference: (.comparison.claude.success_rate - .comparison.codex.success_rate)
  }'

# Compare average completion times (in minutes)
curl http://localhost:5000/api/dev-bots/agent-comparison | \
  jq '{
    claude_avg_min: (.comparison.claude.avg_duration_ms / 60000),
    codex_avg_min: (.comparison.codex.avg_duration_ms / 60000),
    claude_faster: (.comparison.claude.avg_duration_ms < .comparison.codex.avg_duration_ms)
  }'
```

### Agent Rotation Strategy

The system alternates between Claude and Codex by default. To change the rotation strategy, modify `devBotsManager.ts`:

```typescript
// Available strategies: 'alternate' | 'random' | 'claude-only' | 'codex-only'
private readonly AGENT_ROTATION_STRATEGY = 'alternate'; // Default
```

**Strategy Options:**

- **`alternate`**: Alternates between agents for balanced comparison
- **`random`**: Randomly selects agent (useful for A/B testing)
- **`claude-only`**: Use only Claude CLI
- **`codex-only`**: Use only Codex CLI

---

## Direct Database Queries

For advanced analysis, query the SQLite database directly:

```bash
# Connect to database
sqlite3 ./data/tasks/queue.db

# View all tasks with agent type
SELECT id, title, type, agent_type, status,
       ROUND((completed_at - started_at) / 60000.0, 2) as duration_min
FROM tasks
WHERE agent_type IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

# Compare performance by task type
SELECT
  type,
  agent_type,
  COUNT(*) as tasks,
  ROUND(AVG(completed_at - started_at) / 60000.0, 2) as avg_min,
  ROUND(100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM tasks
WHERE agent_type IS NOT NULL
GROUP BY type, agent_type
ORDER BY type, agent_type;

# Find slowest tasks by agent
SELECT
  agent_type,
  title,
  type,
  ROUND((completed_at - started_at) / 60000.0, 2) as duration_min
FROM tasks
WHERE status = 'completed' AND agent_type IS NOT NULL
ORDER BY (completed_at - started_at) DESC
LIMIT 10;
```

---

## Task Status Lifecycle

Tasks progress through the following states:

1. **`pending`**: Task created, waiting for assignment
2. **`running`**: Task assigned to a worker and executing
3. **`completed`**: Task finished successfully (agent_type recorded)
4. **`failed`**: Task failed (may retry if configured)
5. **`cancelled`**: Task cancelled by user
6. **`timeout`**: Task manually timed out after investigation

**State Transitions:**

```
pending → running → completed (records agent_type)
pending → running → failed → pending (retry)
pending → running → failed (max retries reached)
running → timeout (manual intervention)
pending → cancelled (user action)
```

---

## Monitoring and Observability

### Real-time Monitoring

```bash
# Watch queue status
watch -n 5 'curl -s http://localhost:5000/api/dev-bots/metrics | jq ".metrics"'

# Monitor agent comparison
watch -n 10 'curl -s http://localhost:5000/api/dev-bots/agent-comparison | jq ".comparison"'

# Track log output by agent type
tail -f logs/backend.log | grep '"agentType":"claude"'
tail -f logs/backend.log | grep '"agentType":"codex"'
```

### Performance Dashboards

Create custom dashboards using the metrics:

```bash
# Success rate comparison
echo "=== Agent Success Rates ===" && \
curl -s http://localhost:5000/api/dev-bots/agent-comparison | \
jq -r '.comparison |
  "Claude: \(.claude.success_rate)% (\(.claude.completed)/\(.claude.total))\n" +
  "Codex:  \(.codex.success_rate)% (\(.codex.completed)/\(.codex.total))"'

# Average duration comparison
echo "=== Agent Average Durations ===" && \
curl -s http://localhost:5000/api/dev-bots/agent-comparison | \
jq -r '.comparison |
  "Claude: \((.claude.avg_duration_ms/60000) | round) minutes\n" +
  "Codex:  \((.codex.avg_duration_ms/60000) | round) minutes"'
```

#### Agent comparison drilldowns

See [SQLite Integration Plan - Agent Comparison Metrics](./SQLITE_INTEGRATION_PLAN.md#agent-comparison-metrics) for the full architecture. The quick commands below are handy when you just need a per-type snapshot:

```bash
# Task-type scoreboard grouped by agent
curl -s http://localhost:5000/api/dev-bots/agent-comparison \
  | jq '.comparison.task_type_breakdown \
        | to_entries[] \
        | {agent: .key, implementation: .value.implementation.success_rate, testing: .value.testing.success_rate, documentation: .value.documentation.success_rate}

# Raw breakdown data if you want to feed Grafana
curl -s http://localhost:5000/api/dev-bots/agent-comparison \
  | jq '.comparison.task_type_breakdown'
```

---

## Best Practices

### 1. Task Design

- **Clear Acceptance Criteria**: Define measurable success criteria
- **Appropriate File Scope**: List all files that may be modified
- **Realistic Estimates**: Provide estimated effort in hours
- **Task Type Classification**: Use correct type (implementation, bug, refactor, etc.)

### 2. Agent Comparison

- **Collect Sufficient Data**: Aim for 50+ tasks per agent before conclusions
- **Control Variables**: Compare similar task types and complexities
- **Monitor Trends**: Track performance over time
- **Quality Over Speed**: Consider code quality, not just completion time

### 3. Queue Management

- **Monitor Queue Depth**: Keep pending tasks under 10 for optimal performance
- **Review Failed Tasks**: Investigate patterns in task failures
- **Use Manual Timeout**: Only timeout tasks after verification they're stuck
- **Regular Backups**: Backup SQLite database regularly

---

## Migration Notes

This queue system replaced the legacy markdown-based queue. Key improvements:

- **ACID Compliance**: Atomic task operations, no race conditions
- **Agent Tracking**: Built-in Claude vs Codex comparison
- **Execution History**: Complete audit trail of all task attempts
- **Worker Heartbeats**: Automatic detection of crashed workers
- **File Lock Management**: Prevents conflicting file modifications
- **Duplicate Detection**: Prevents duplicate task execution
- **Metrics & Analytics**: Built-in performance tracking

For migration details, see [SQLITE_INTEGRATION_PLAN.md](./SQLITE_INTEGRATION_PLAN.md#migration-behavior).

---

## Troubleshooting

### Common Issues

**Issue: Tasks stuck in "running" state**
```bash
# Check for stalled workers (automatic detection runs every 15 seconds)
# Manually timeout task if needed
curl -X POST http://localhost:5000/api/dev-bots/tasks/TASK_ID/timeout \
  -H "Content-Type: application/json" \
  -d '{"reason": "Worker crashed, container not responding"}'
```

**Issue: Agent comparison metrics show no data**
```bash
# Confirm API is reachable
curl -s http://localhost:5000/api/dev-bots/agent-comparison | jq '.comparison'

# Verify agent_type column exists
sqlite3 ./data/tasks/queue.db "PRAGMA table_info(tasks)" | grep agent_type

# Check if tasks have agent_type set
sqlite3 ./data/tasks/queue.db "SELECT agent_type, COUNT(*) FROM tasks GROUP BY agent_type"

# Inspect per-type breakdown to make sure new runs exist
curl -s http://localhost:5000/api/dev-bots/agent-comparison \
  | jq '.comparison.task_type_breakdown'
```
See the [Agent Comparison Metrics](./SQLITE_INTEGRATION_PLAN.md#agent-comparison-metrics) section for a complete operator checklist.

**Issue: Tasks not being assigned**
```bash
# Check queue metrics
curl http://localhost:5000/api/dev-bots/metrics

# Manually trigger assignment
curl -X POST http://localhost:5000/api/dev-bots/assign

# Check Docker status
curl http://localhost:5000/api/dev-bots/docker/status
```

---

## Related Documentation

- **[SQLite Integration Plan](./SQLITE_INTEGRATION_PLAN.md)**: Complete technical implementation details
- **[Dev-Bots Architecture](./README.md)**: System architecture overview
- **[API Documentation](./api/endpoints.md)**: Complete API endpoint reference
- **[Database Schema](../../architecture/database-schema.md)**: Full schema documentation
