# Claude Workers API Endpoints

## 📡 API Overview

The Claude Workers system provides 30+ REST API endpoints for task management, monitoring, and system control. All endpoints are prefixed with `/api/claude-workers/`.

## 🔧 Core Task Management

### Task Operations
```http
GET    /api/claude-workers/status           # System status
GET    /api/claude-workers/tasks            # List all tasks
POST   /api/claude-workers/tasks            # Create task
POST   /api/claude-workers/tasks/enhanced   # Create enhanced task with full context
GET    /api/claude-workers/tasks/:id        # Get specific task
PUT    /api/claude-workers/tasks/:id        # Update task
DELETE /api/claude-workers/tasks/:id        # Delete task
```

### Task Context & Automation Runs (NEW)
```http
GET    /api/dev-bots/tasks/:id/context      # Get latest automation run for task
GET    /api/dev-bots/tasks/:id/runs         # Get all automation runs for task
GET    /api/dev-bots/tasks/:id/runs/:runId  # Get specific automation run details
```

**Purpose**: Access task automation run data, including execution history, quality metrics, and build/test results.

### Task Status Management
```http
POST   /api/claude-workers/tasks/:id/assign    # Assign task to worker
POST   /api/claude-workers/tasks/:id/start     # Start task execution
POST   /api/claude-workers/tasks/:id/complete  # Mark task as completed
POST   /api/claude-workers/tasks/:id/fail      # Mark task as failed
POST   /api/claude-workers/tasks/:id/retry     # Retry failed task
```

## 👥 Agent & Templates

### Agent Management
```http
GET    /api/claude-workers/agents           # List agent personalities
GET    /api/claude-workers/agents/:id       # Get specific agent details
POST   /api/claude-workers/agents/:id/assign # Assign agent to task
```

### Templates & Guidelines
```http
GET    /api/claude-workers/templates        # Get task templates
GET    /api/claude-workers/guidelines       # Task creation guidelines
GET    /api/claude-workers/examples/:type   # Task examples by type
```

## 🏥 Health & Status

### System Health
```http
GET    /api/claude-workers/health           # Health check
GET    /api/claude-workers/scope-violations # Scope violation report
POST   /api/claude-workers/emergency-recovery # Emergency healing
```

### Monitoring
```http
GET    /api/claude-workers/metrics          # System metrics
GET    /api/claude-workers/logs             # System logs
GET    /api/claude-workers/performance      # Performance metrics
GET    /api/claude-workers/agent-comparison # Claude vs Codex comparison metrics
```

### Agent Comparison (NEW)
```http
GET    /api/dev-bots/agent-comparison       # Performance comparison between Claude and Codex agents
```

**Purpose**: Compare performance metrics between Claude and Codex AI agents for data-driven insights into which agent performs better for different task types.

**Response Example**:
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

**Metrics Explained**:
- `total`: Total number of tasks executed by this agent
- `completed`: Number of successfully completed tasks
- `failed`: Number of failed tasks
- `avg_duration_ms`: Average task completion time in milliseconds
- `success_rate`: Percentage of tasks completed successfully (0-100)

**Usage**:
```bash
# Get comparison metrics
curl http://localhost:5000/api/dev-bots/agent-comparison

# Compare success rates
curl http://localhost:5000/api/dev-bots/agent-comparison | \
  jq '.comparison | {claude: .claude.success_rate, codex: .codex.success_rate}'

# Compare average durations (in minutes)
curl http://localhost:5000/api/dev-bots/agent-comparison | \
  jq '.comparison | {
    claude_min: (.claude.avg_duration_ms/60000),
    codex_min: (.codex.avg_duration_ms/60000)
  }'
```

## 📊 Export/Import

### Data Management
```http
POST   /api/claude-workers/export           # Export tasks to file
POST   /api/claude-workers/import           # Import tasks from file
GET    /api/claude-workers/backup           # Create system backup
POST   /api/claude-workers/restore          # Restore from backup
```

## 🚀 Onboarding & Setup

### Worker Onboarding
```http
POST   /api/claude-workers/onboarding/complete # Complete onboarding
GET    /api/claude-workers/onboarding/status   # Onboarding status
POST   /api/claude-workers/onboarding/reset    # Reset onboarding
```

## 📝 Request/Response Examples

### Create Task
```http
POST /api/claude-workers/tasks
Content-Type: application/json

{
  "type": "feature",
  "title": "Add authentication to dashboard",
  "documentation": "Add JWT-based authentication...",
  "acceptanceCriteria": [
    "Must use Firebase Auth",
    "Must support JWT tokens"
  ],
  "assignedAgent": "backend-specialist",
  "files": ["src/auth.ts"],
  "dependencies": ["firebase-admin"],
  "project": "job-finder-BE",
  "notes": "Follow security best practices"
}
```

### Task Response
```json
{
  "id": "task-uuid",
  "type": "feature",
  "title": "Add authentication to dashboard",
  "status": "pending",
  "createdAt": "2025-01-27T10:00:00Z",
  "assignedAgent": "backend-specialist",
  "project": "job-finder-BE",
  "priority": 5,
  "estimatedEffort": {
    "hours": 4,
    "complexity": "medium",
    "confidence": "high"
  }
}
```

### System Status Response
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "tasks": {
    "total": 25,
    "pending": 3,
    "active": 2,
    "completed": 18,
    "failed": 2
  },
  "workers": {
    "total": 6,
    "available": 4,
    "busy": 2
  },
  "system": {
    "memory": "512MB",
    "cpu": "45%",
    "disk": "2.1GB"
  }
}
```

### Task Context Endpoints

#### Get Latest Automation Run
```http
GET /api/dev-bots/tasks/:id/context
```

Returns the most recent automation run for the specified task, including execution details, quality metrics, and build/test results.

**Example Response**:
```json
{
  "run_id": "run-abc123",
  "task_id": "task-implementation-8065108ee20a",
  "worker_id": "worker-001",
  "container_id": "container-xyz789",
  "started_at": "2025-11-10T10:00:00Z",
  "completed_at": "2025-11-10T10:30:00Z",
  "duration_ms": 1800000,
  "exit_code": 0,
  "status": "success",
  "failure_reason": null,
  "commit_sha": "abc123def456",
  "branch": "task-implementation-8065108ee20a",
  "quality_passed": 1,
  "quality_validation_json": "{\"passed\": true, \"score\": 95}",
  "resource_usage_json": "{\"cpu\": 50, \"memory\": 1024}",
  "token_usage_json": "{\"input\": 1000, \"output\": 2000}",
  "container_meta_json": "{\"image\": \"node:18\", \"platform\": \"linux/amd64\"}",
  "build_exit_code": 0,
  "test_passed": 10,
  "test_failed": 0,
  "test_skipped": 1,
  "lint_errors": 0,
  "lint_warnings": 2,
  "created_at": "2025-11-10T10:00:00Z"
}
```

**Status Codes**:
- `200 OK` - Latest run found and returned
- `404 Not Found` - No automation runs found for this task
- `500 Internal Server Error` - Server error retrieving context

#### Get All Automation Runs
```http
GET /api/dev-bots/tasks/:id/runs
```

Returns all automation runs for the specified task, ordered by `started_at` DESC (most recent first).

**Example Response**:
```json
{
  "runs": [
    {
      "run_id": "run-003",
      "task_id": "task-123",
      "started_at": "2025-11-10T11:00:00Z",
      "status": "success",
      "exit_code": 0,
      "duration_ms": 1500000
    },
    {
      "run_id": "run-002",
      "task_id": "task-123",
      "started_at": "2025-11-10T10:00:00Z",
      "status": "failed",
      "exit_code": 1,
      "failure_reason": "Build failed: TypeScript errors",
      "duration_ms": 300000
    },
    {
      "run_id": "run-001",
      "task_id": "task-123",
      "started_at": "2025-11-10T09:00:00Z",
      "status": "success",
      "exit_code": 0,
      "duration_ms": 1800000
    }
  ]
}
```

**Status Codes**:
- `200 OK` - Runs retrieved (may be empty array)
- `500 Internal Server Error` - Server error retrieving runs

#### Get Specific Automation Run
```http
GET /api/dev-bots/tasks/:id/runs/:runId
```

Returns details for a specific automation run. Verifies that the run belongs to the specified task.

**Parameters**:
- `id` - Task ID
- `runId` - Automation run ID

**Example Response**:
Same structure as "Get Latest Automation Run" above.

**Status Codes**:
- `200 OK` - Run found and returned
- `404 Not Found` - Run not found or doesn't belong to specified task
- `500 Internal Server Error` - Server error retrieving run

**Usage Examples**:
```bash
# Get latest context for a task
curl http://localhost:5000/api/dev-bots/tasks/task-123/context

# Get all runs for a task
curl http://localhost:5000/api/dev-bots/tasks/task-123/runs

# Get specific run details
curl http://localhost:5000/api/dev-bots/tasks/task-123/runs/run-abc123

# Check test results from latest run
curl http://localhost:5000/api/dev-bots/tasks/task-123/context | \
  jq '{passed: .test_passed, failed: .test_failed, skipped: .test_skipped}'

# Check quality validation
curl http://localhost:5000/api/dev-bots/tasks/task-123/context | \
  jq '.quality_validation_json | fromjson'
```

## 🔐 Authentication

All API endpoints require authentication via API key or JWT token:

```http
Authorization: Bearer your-api-key
```

## 📊 Rate Limiting

- **Default**: 100 requests per minute per IP
- **Task Creation**: 10 requests per minute per user
- **Bulk Operations**: 5 requests per minute per user

## 🚨 Error Handling

### Standard Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Task title must be at least 10 characters",
    "details": {
      "field": "title",
      "value": "Fix bug",
      "constraint": "minLength: 10"
    },
    "timestamp": "2025-01-27T10:00:00Z"
  }
}
```

### Common Error Codes
- `VALIDATION_ERROR` - Request validation failed
- `TASK_NOT_FOUND` - Task with specified ID not found
- `AGENT_UNAVAILABLE` - Requested agent is not available
- `SCOPE_VIOLATION` - Task violates scope constraints
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `SYSTEM_ERROR` - Internal server error

## 🔄 WebSocket Events

### Real-time Updates
```javascript
// Connect to WebSocket
const socket = io('http://localhost:5000');

// Listen for task events
socket.on('claude:taskAdded', (task) => {
  console.log('New task added:', task);
});

socket.on('claude:taskAssigned', (task) => {
  console.log('Task assigned:', task);
});

socket.on('claude:taskStarted', (task) => {
  console.log('Task started:', task);
});

socket.on('claude:taskCompleted', (task) => {
  console.log('Task completed:', task);
});

socket.on('claude:taskFailed', (task) => {
  console.log('Task failed:', task);
});

socket.on('claude:systemStatusChange', (status) => {
  console.log('System status changed:', status);
});
```

## 📚 Related Documentation

- [Task Examples](task-examples.md)
- [Agent Personalities](agent-personalities.md)
- [Task Execution Template](task-execution-template.md)
- [Worker Onboarding](worker-onboarding.md)
- [Dev-Bots Architecture](../architecture/dev-bots-overview.md)

---

**Base URL**: `http://localhost:5000/api/claude-workers`  
**API Version**: 1.0.0  
**Last Updated**: 2025-01-27