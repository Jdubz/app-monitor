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

- [Task Creation Guidelines](task-creation-guidelines.md)
- [Agent Personalities](agent-personalities.md)
- [Task Prompt Template](task-prompt-template.md)
- [Worker Onboarding](worker-onboarding.md)
- [System Architecture](../architecture/system-overview.md)

---

**Base URL**: `http://localhost:5000/api/claude-workers`  
**API Version**: 1.0.0  
**Last Updated**: 2025-01-27