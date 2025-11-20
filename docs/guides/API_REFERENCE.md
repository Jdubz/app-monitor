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
- `GET /api/health` – Backend health probe
- `POST /api/github/webhooks/*` – GitHub webhooks (HMAC verified)
- `POST /api/logs/frontend` – Frontend log ingestion
- `POST /api/issues` – Issue reporter (rate limited)

**Protected (API Key Required):**
- `/api/dev-bots/*`
- `/api/docker/*`
- `/api/token-tracking/*`
- `/api/quality-gates/*`
- `/api/verification/*`
- `/api/metrics/*`
- `/api/observability/*`
- `/api/prs/*`
- `/api/socket/*`
- `/api/terminal/*`

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

Unless noted, routes live under `/api` and require the API key described above.

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Basic backend health probe |
| POST | `/api/github/webhooks/*` | GitHub webhook receiver (HMAC verified) |
| POST | `/api/logs/frontend` | Ingest browser logs for troubleshooting |
| POST | `/api/issues` | File an issue/incident report (rate limited) |

### Dev-Bots API (`/api/dev-bots`)

#### Status & Infrastructure
| Method | Path | Description |
|---|---|---|
| GET | `/status` | High-level system status (workers, queue depth) |
| GET | `/health` | Dev-bots specific health probe |
| GET | `/metrics` | Aggregated execution metrics snapshot |
| GET | `/agent-comparison` | Success/duration comparison across agents |
| GET | `/projects` | Registered work targets/projects |
| GET | `/docker/status` | Docker daemon validation details |
| POST | `/docker/revalidate` | Re-run Docker validation checks |
| POST | `/docker/cleanup` | Trigger container/volume cleanup |
| GET | `/containers/:containerId/health` | Inspect a specific container |
| GET | `/cleanup-status` | Latest cleanup job results |
| POST | `/trigger-cleanup` | Queue a cleanup job (manual) |
| GET | `/scope-violations` | Recent scope violations |
| POST | `/emergency-recovery` | Kick off emergency recovery workflow |

#### Task Lifecycle & Queue
| Method | Path | Description |
|---|---|---|
| GET | `/tasks` | List tasks (newest first) |
| GET | `/tasks/completed` | List recently completed tasks |
| GET | `/tasks/:taskId/detail` | Task detail + history |
| POST | `/tasks` | Submit new task (three-field payload + overrides) |
| POST | `/tasks/:taskId/timeout` | Force-timeout a stuck task after verification |
| GET | `/queue` | Queue snapshot by bucket (pending/active/etc.) |
| GET | `/queue/stats` | Aggregate queue statistics |
| POST | `/validate` | Validate a submission payload without creating a task |
| POST | `/assign` | Manually trigger task assignment (rare; debugging) |
| POST | `/tasks/:taskId/resume` | Resume a blocked task |
| POST | `/tasks/:taskId/simulate-phase-progression` | Run the phase simulator for debugging |
| GET | `/tasks/:taskId/phases` | Per-phase progress + attempts |
| GET | `/phases/metrics` | Cached phase metrics |
| GET | `/phases/:phaseIndex/metrics` | Metrics for a specific phase |
| POST | `/phases/metrics/refresh` | Recompute cached phase metrics |
| GET | `/chains/blocked` | List blocked task chains |
| POST | `/chains/:chainId/unblock` | Manually unblock a chain |
| POST | `/:taskId/report-completion` | Worker hook for reporting completion/failure |
| POST | `/pr/track` | Manually enqueue PR tracking for a task |

#### Logs, Context & Runs
| Method | Path | Description |
|---|---|---|
| GET | `/tasks/:taskId/logs` | Download aggregated stdout/stderr for a task (reads artifacts) |
| GET | `/tasks/:taskId/logs/:stream` | Stream a single log (`stdout` or `stderr`) |
| GET | `/tasks/:id/context` | Latest automation run context (prompt, metadata) |
| GET | `/tasks/:id/stage-runs` | Phase/stage execution history |
| GET | `/tasks/:id/runs` | Automation runs for a task |
| GET | `/tasks/:id/runs/:runId` | Detailed automation run record |

#### Agents & Templates
| Method | Path | Description |
|---|---|---|
| GET | `/agents` | List configured agent personalities |
| GET | `/agents/valid` | Filtered list of agents currently allowed to run |
| GET | `/templates` | Task templates indexed by category |
| GET | `/guidelines` | Aggregated task creation guidelines |
| GET | `/guidelines/:taskType` | Guidelines for a specific task type |
| GET | `/examples/:taskType` | Sample task payloads for a given type |
| GET | `/checklist/:taskType` | Pre-flight checklist for the task type |

#### Interactive Sessions
| Method | Path | Description |
|---|---|---|
| GET | `/interactive/session` | Inspect current interactive session (if any) |
| POST | `/interactive/session` | Create/start an interactive session |
| DELETE | `/interactive/session` | Stop the active interactive session |
| POST | `/interactive/heartbeat` | Heartbeat endpoint for session watchdog |

#### Plans & Settings
| Method | Path | Description |
|---|---|---|
| POST | `/plans` | Create a new multi-phase plan file |
| GET | `/plans` | List plans (filters supported via query params) |
| GET | `/plans/:planId` | Load a specific plan |
| PATCH | `/plans/:planId` | Update plan metadata/content |
| POST | `/plans/:planId/cancel` | Cancel an in-flight plan |
| DELETE | `/plans/:planId` | Delete plan (per Documentation System rules) |
| GET | `/plans/:planId/tasks` | Tasks linked to a plan |
| POST | `/plans/:planId/update-status` | Force status recalculation |
| GET | `/settings` | Read dev-bot runtime settings (worker limits, etc.) |
| PUT | `/settings` | Update dev-bot runtime settings |

#### Manual PR Sync
| Method | Path | Description |
|---|---|---|
| POST | `/pr-sync` | Manually trigger PR metadata sync (normally automatic) |

### Platform & Operations APIs

#### Docker (`/api/docker`)
| Method | Path | Description |
|---|---|---|
| GET | `/container-info` | Inspect managed containers |
| POST | `/start` | Start Dev-Bot containers |
| POST | `/stop` | Stop containers |
| POST | `/restart` | Restart containers |

#### Logs (`/api/logs`)
| Method | Path | Description |
|---|---|---|
| POST | `/frontend` | Upload browser logs (public) |

#### Issues (`/api/issues`)
| Method | Path | Description |
|---|---|---|
| POST | `/` | Submit an issue/incident (public + rate limited) |

#### Metrics (`/api/metrics`)
| Method | Path | Description |
|---|---|---|
| GET | `/phases` | Aggregated phase metrics |
| GET | `/phases/:phaseIndex` | Metrics for a given phase |
| GET | `/loops` | Loop/retry metrics |
| GET | `/recovery` | Recovery bot metrics |
| GET | `/distribution` | Task distribution metrics |
| POST | `/cache/invalidate` | Clear cached metric snapshots |

#### Observability (`/api/observability`)
| Method | Path | Description |
|---|---|---|
| GET | `/tasks/:taskId/trace` | Task trace summary |
| GET | `/logs` | Structured observability logs |
| GET | `/anomalies` | Detected anomalies |
| GET | `/diagnostics` | Recent diagnostic runs |
| GET | `/diagnostics/:queryId` | Diagnostic details |

#### Pull Request Workflow (`/api/prs`)
| Method | Path | Description |
|---|---|---|
| POST | `/:prNumber/evaluate-gates` | Evaluate merge gates for a PR |
| GET | `/:prNumber/gates` | Retrieve gate statuses |
| POST | `/mock/register` | Register mock PR data (testing) |
| POST | `/:prNumber/complete-validation` | Mark validation complete |

#### Quality Gates (`/api/quality-gates`)
| Method | Path | Description |
|---|---|---|
| GET | `/config` | Entire gate configuration |
| GET | `/config/:gate` | Single gate config |
| PUT | `/config/:gate` | Update gate config |
| POST | `/validate` | Validate current gate setup |
| POST | `/config/reset` | Reset to defaults |
| GET | `/status` | Current gate evaluation summary |

#### Token Tracking (`/api/token-tracking`)
| Method | Path | Description |
|---|---|---|
| GET | `/summary` | Aggregate spend across providers |
| GET | `/summary/:provider` | Provider-specific summary |
| GET | `/budget/:provider` | Budget for provider |
| PUT | `/budget` | Update budgets |
| GET | `/can-use/:provider` | Whether provider budget allows usage |
| GET | `/remaining/:provider` | Remaining tokens/dollars |
| POST | `/reset` | Reset usage tracking |

#### Verification (`/api/verification`)
| Method | Path | Description |
|---|---|---|
| GET | `/task/:taskId` | Verification record for task |
| POST | `/verify/:taskId` | Submit verification result |
| GET | `/stats` | Verification rollup |
| GET | `/recommendations/:taskId` | Recommend follow-up actions |

#### Socket Monitoring (`/api/socket`)
| Method | Path | Description |
|---|---|---|
| GET | `/stats` | Socket.IO server stats |
| GET | `/connections` | Active connections |
| GET | `/connections/:socketId` | Inspect a connection |

#### Terminal Sessions (`/api/terminal`)
| Method | Path | Description |
|---|---|---|
| GET | `/sessions` | List tmux/terminal sessions |
| GET | `/sessions/:id` | Inspect single session |
| DELETE | `/sessions/:id` | Terminate session |

> Logs are written directly to `/opt/app-monitor/shared/logs/` in production (and `backend/data/logs/` in development). Read them from the filesystem or artifacts; there is no HTTP log download endpoint.

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

#### Task Response
```json
{
  "id": "task-uuid",
  "type": "feature",
  "title": "Add authentication to dashboard",
  "status": "pending",
  "createdAt": "2025-11-16T06:00:00Z",
  "assignedAgent": "auto-select",
  "project": "job-finder-BE",
  "priority": 5,
  "estimatedEffort": {
    "hours": 4,
    "complexity": "medium",
    "confidence": "high"
  }
}
```

> Once the task is dequeued for execution, the agent selector updates `assignedAgent` with the actual personality/provider it chose. Until then you'll see the placeholder value `auto-select`.

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
