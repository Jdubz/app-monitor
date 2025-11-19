# API Reference

**Purpose:** Complete API reference including endpoints, authentication, and error handling.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Error Responses](#error-responses)
3. [Endpoints](#endpoints)
4. [WebSocket Events](#websocket-events)

---

## Authentication

### Overview

Simple API key authentication protects all API endpoints except health checks and webhooks.

### Configuration

#### Backend Setup

```bash
# Copy example env file
cp backend/.env.example backend/.env

# Generate secure key
openssl rand -base64 32

# Set in backend/.env
API_KEY=your-secure-random-key-here
REQUIRE_AUTH=true
```

#### Frontend Setup

```bash
# Copy example env file
cp frontend/.env.example frontend/.env

# Set same API key
VITE_API_KEY=your-secure-random-key-here
VITE_PASSWORD=your-secure-frontend-password
```

### Usage

#### TypeScript/React
```typescript
import { apiClient } from '@/utils/apiClient';

const tasks = await apiClient.get('/dev-bots/tasks');
const newTask = await apiClient.post('/dev-bots/tasks', {
  title: 'My task',
  taskType: 'implementation',
  intent: 'Accomplish something specific'
});
```

#### curl
```bash
curl -H "X-API-Key: your-api-key-here" \
  https://app-monitor.joshwentworth.com/api/dev-bots/tasks
```

#### fetch/JavaScript
```javascript
fetch('https://app-monitor.joshwentworth.com/api/dev-bots/tasks', {
  headers: { 'X-API-Key': 'your-api-key-here' }
})
```

### Public vs Protected Endpoints

**Public (No Auth):**
- `GET /api/health` - Health check
- `POST /api/github/webhooks/*` - GitHub webhooks (signature verified)

**Protected (API Key Required):**
- All `/api/dev-bots/*` endpoints
- All `/api/services/*` endpoints
- All `/api/docker/*` endpoints
- All `/api/logs/*` endpoints

### Security Notes

- ⚠️ Change default keys before production
- 🔒 Store API keys in environment variables only
- 🚫 Never commit `.env` files
- 📝 Rotate keys periodically

---

## Error Responses

### Standard Error Structure

```typescript
interface ApiError {
  success: false;
  error: string;         // Error category (e.g., "UNAUTHORIZED")
  message?: string;      // Human-readable message
  code?: string;         // Specific code (e.g., "AUTH_REQUIRED")
  details?: {
    field?: string;
    service?: string;
    troubleshooting?: TroubleshootingHint[];
  };
}

interface TroubleshootingHint {
  issue: string;
  solution: string;
}
```

### Error Response Helpers

Located in `backend/src/utils/errorResponses.ts`:

#### badRequest(res, message, context, field?)
**400 Bad Request** - Invalid client input

```typescript
return ErrorResponses.badRequest(
  res,
  'taskId is required',
  { category: 'api', action: 'create_task_validation' },
  'taskId'
);
```

#### unauthorized(res, message, context, hasKey)
**401 Unauthorized** - Missing/invalid authentication

```typescript
return ErrorResponses.unauthorized(
  res,
  'API key required',
  { category: 'api', action: 'auth_missing' },
  false
);
```

#### notFound(res, resource, identifier?, context?)
**404 Not Found** - Resource doesn't exist

```typescript
return ErrorResponses.notFound(
  res,
  'Task',
  taskId,
  { category: 'api', action: 'get_task_not_found' }
);
```

#### conflict(res, message, context, currentState?)
**409 Conflict** - Resource state conflict

```typescript
return ErrorResponses.conflict(
  res,
  'Task already running',
  { category: 'api', action: 'start_task_conflict' },
  'running'
);
```

#### internalError(res, message, context, error?)
**500 Internal Server Error** - Unexpected error

```typescript
return ErrorResponses.internalError(
  res,
  'Failed to process task',
  { category: 'api', action: 'process_task_error' },
  error
);
```

#### serviceUnavailable(res, service, context, healthy?)
**503 Service Unavailable** - Service dependency unavailable

```typescript
return ErrorResponses.serviceUnavailable(
  res,
  'Dev-Bots coordinator',
  { category: 'api', action: 'get_status_unavailable' },
  devBotsManager.isHealthy()
);
```

#### validationError(res, message, context, errors)
**422 Unprocessable Entity** - Validation failed

```typescript
return ErrorResponses.validationError(
  res,
  'Task validation failed',
  { category: 'api', action: 'validate_task' },
  [
    { field: 'title', error: 'Title is required' },
    { field: 'description', error: 'Min 10 characters' }
  ]
);
```

#### rateLimitExceeded(res, message, context, retryAfter?)
**429 Too Many Requests** - Rate limit exceeded

```typescript
return ErrorResponses.rateLimitExceeded(
  res,
  'Rate limit exceeded',
  { category: 'api', action: 'rate_limit_check' },
  60
);
```

### Example Error Responses

#### 401 Unauthorized
```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "API key required. Include X-API-Key header.",
  "code": "AUTH_REQUIRED",
  "details": {
    "hasKey": false,
    "troubleshooting": [
      {
        "issue": "Missing API key",
        "solution": "Include X-API-Key header with your request."
      }
    ]
  }
}
```

#### 404 Not Found
```json
{
  "success": false,
  "error": "NOT_FOUND",
  "message": "Task 'task-123' not found",
  "code": "RESOURCE_NOT_FOUND",
  "details": {
    "resource": "Task",
    "identifier": "task-123",
    "troubleshooting": [
      {
        "issue": "The requested task does not exist",
        "solution": "Verify the task ID is correct: task-123"
      }
    ]
  }
}
```

#### 503 Service Unavailable
```json
{
  "success": false,
  "error": "SERVICE_UNAVAILABLE",
  "message": "Dev-Bots coordinator is currently unavailable",
  "code": "SERVICE_DOWN",
  "details": {
    "service": "Dev-Bots coordinator",
    "healthy": false,
    "troubleshooting": [
      {
        "issue": "Dev-Bots coordinator is not responding",
        "solution": "Check if service is running. Restart if needed."
      }
    ]
  }
}
```

---

## Endpoints

**Base URL:** `http://localhost:5000/api/dev-bots`

### Task Management

#### Core Task Operations
```http
GET    /api/dev-bots/status           # System status
GET    /api/dev-bots/tasks              # List all tasks
POST   /api/dev-bots/tasks              # Create task (minimal 3-field payload)
GET    /api/dev-bots/tasks/:id/detail   # Get specific task with history
POST   /api/dev-bots/tasks/:id/timeout  # Manually timeout task
```

#### Task Status Management
```http
POST   /api/dev-bots/tasks/:id/assign    # Assign to worker
POST   /api/dev-bots/tasks/:id/start     # Start execution
POST   /api/dev-bots/tasks/:id/complete  # Mark completed
POST   /api/dev-bots/tasks/:id/fail      # Mark failed
POST   /api/dev-bots/tasks/:id/retry     # Retry failed task
```

#### Task Context & Automation Runs
```http
GET    /api/dev-bots/tasks/:id/context      # Latest automation run
GET    /api/dev-bots/tasks/:id/runs         # All automation runs
GET    /api/dev-bots/tasks/:id/runs/:runId  # Specific run details
```

### Agent Management

```http
GET    /api/dev-bots/agents           # List agent personalities
GET    /api/dev-bots/agents/:id       # Get agent details
POST   /api/dev-bots/agents/:id/assign # Assign agent to task
GET    /api/dev-bots/agent-comparison # Performance comparison
```

### Templates & Guidelines

```http
GET    /api/dev-bots/templates        # Get task templates
GET    /api/dev-bots/guidelines       # Task creation guidelines
GET    /api/dev-bots/examples/:type   # Task examples by type
```

### Health & Monitoring

```http
GET    /api/dev-bots/health           # Health check
GET    /api/dev-bots/metrics          # System metrics
GET    /api/dev-bots/logs             # System logs
GET    /api/dev-bots/performance      # Performance metrics
GET    /api/dev-bots/scope-violations # Scope violation report
POST   /api/dev-bots/emergency-recovery # Emergency healing
```

### Data Management

```http
POST   /api/dev-bots/export           # Export tasks
POST   /api/dev-bots/import           # Import tasks
GET    /api/dev-bots/backup           # Create backup
POST   /api/dev-bots/restore          # Restore from backup
```

### Request/Response Examples

#### Create Task
```http
POST /api/dev-bots/tasks
Content-Type: application/json
X-API-Key: your-api-key

{
  "title": "Add authentication to dashboard",
  "taskType": "implementation",
  "intent": "Add JWT-based authentication using Firebase Auth with token validation"
}
```

**Response:**
```json
{
  "task": {
    "id": "task-uuid",
    "type": "implementation",
    "title": "Add authentication to dashboard",
    "status": "pending",
    "created_at": "2025-11-19T06:00:00Z",
    "assigned_agent": "claude-sonnet",
    "risk_level": "high",
    "files": ["backend/src/middleware/authenticate.ts", "backend/src/services/auth.service.ts"]
  },
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": ["Auto-detection: 2 files detected from git status"],
    "suggestions": []
  },
  "autoDetection": {
    "detectedFiles": ["backend/src/middleware/authenticate.ts", "backend/src/services/auth.service.ts"],
    "inferredRiskLevel": "high",
    "selectedProfiles": ["scope-control", "dev-monitor", "implementation-patterns"],
    "recommendedOutputs": ["unit-tests", "integration-tests", "documentation"],
    "confidence": {
      "files": 0.9,
      "riskLevel": 0.95,
      "profiles": 0.9
    },
    "warnings": []
  }
}
```

**Error Responses:**
```json
// 400 - Missing required fields
{
  "error": "Missing required fields",
  "statusCode": 400,
  "details": {
    "provided": ["title", "taskType"],
    "required": ["title", "taskType", "intent"]
  }
}

// 400 - Validation failed
{
  "error": "Task validation failed",
  "statusCode": 400,
  "details": {
    "errors": ["Title must be at least 10 characters"],
    "warnings": [],
    "suggestions": ["Add more descriptive title"]
  }
}

// 409 - Duplicate task
{
  "error": "Duplicate task detected. Task 'Add authentication' (abc123) is already pending.",
  "statusCode": 409,
  "details": {
    "conflictType": "duplicate_task",
    "existingTaskId": "abc123",
    "existingTaskTitle": "Add authentication to dashboard",
    "existingTaskStatus": "pending"
  }
}
```

#### Preview Auto-Detection
```http
POST /api/dev-bots/tasks/preview-detection
Content-Type: application/json
X-API-Key: your-api-key

{
  "taskType": "fix",
  "title": "Fix memory leak",
  "intent": "Prevent OOM errors in log rotation service"
}
```

**Response:**
```json
{
  "detectedFiles": ["backend/src/services/logging.service.ts"],
  "inferredRiskLevel": "medium",
  "selectedProfiles": ["scope-control", "fix-debugging", "failure-recovery"],
  "recommendedOutputs": ["patch", "verification-log", "root-cause-analysis"],
  "confidence": {
    "files": 0.7,
    "riskLevel": 0.85,
    "profiles": 0.9
  },
  "warnings": []
}
```

#### Task Response
```json
{
  "id": "task-uuid",
  "type": "feature",
  "title": "Add authentication to dashboard",
  "status": "pending",
  "createdAt": "2025-11-16T06:00:00Z",
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

#### System Status Response
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
  }
}
```

#### Latest Automation Run
```http
GET /api/dev-bots/tasks/:id/context
```

```json
{
  "run_id": "run-abc123",
  "task_id": "task-123",
  "worker_id": "worker-001",
  "started_at": "2025-11-16T06:00:00Z",
  "completed_at": "2025-11-16T06:30:00Z",
  "duration_ms": 1800000,
  "exit_code": 0,
  "status": "success",
  "commit_sha": "abc123def456",
  "branch": "task-123",
  "quality_passed": 1,
  "build_exit_code": 0,
  "test_passed": 10,
  "test_failed": 0,
  "lint_errors": 0
}
```

#### Agent Comparison
```http
GET /api/dev-bots/agent-comparison
```

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

### Rate Limiting

- **Default:** 100 requests/minute per IP
- **Task Creation:** 10 requests/minute per user
- **Bulk Operations:** 5 requests/minute per user

---

## WebSocket Events

### Real-time Updates

```javascript
// Connect
const socket = io('http://localhost:5000');

// Task events
socket.on('claude:taskAdded', (task) => {
  console.log('New task:', task);
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
  console.log('Status changed:', status);
});
```

---

## Related Documentation

- [Task Examples](task-examples.md)
- [Agent Personalities](agent-personalities.md)
- [Task Submission Guide](TASK_SUBMISSION_GUIDE.md)
- [System Architecture](../architecture/system-overview.md)
- [Production Deployment](PRODUCTION_DEPLOYMENT.md)
