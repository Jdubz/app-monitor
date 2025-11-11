# Dev-Monitor System Architecture

**Version:** 1.0.0  
**Last Updated:** October 25, 2025  
**Phase:** 4 - Polish & Documentation

---

## Overview

Dev-Monitor is a development tool for managing local services, Docker containers, and task execution in a monorepo environment with real-time monitoring and log streaming.

### Purpose
- Manage local development servers (backend, frontend, workers)
- Monitor and control Docker containers
- Execute and track development tasks
- Centralize logging from all services
- Provide real-time updates via WebSocket

---

## Technology Stack

### Backend
- **Runtime:** Node.js 18+ with TypeScript (strict mode)
- **Framework:** Express 4.x + Socket.IO 4.x
- **Docker:** Dockerode 4.x
- **Testing:** Vitest (257 unit + 122+ integration tests)

### Frontend
- **Framework:** React 18 + TypeScript (strict mode)
- **Build:** Vite 5.x (HMR < 1s)
- **Styling:** CSS Modules + Design System (80+ utilities)
- **Real-time:** Socket.IO Client 4.x

---

## System Architecture

```
┌──────────────────────────────────────────────────────┐
│              Browser (React + Vite)                   │
│  [UI Components] ←→ [Socket.IO] ←→ [API Client]     │
└────────────────────┬─────────────────────────────────┘
                     │ HTTP/WebSocket
                     ▼
┌──────────────────────────────────────────────────────┐
│        Express Backend (Port 5000)                    │
│                                                       │
│  ┌──────────────┐        ┌──────────────┐          │
│  │ 10 Route     │───────►│ Socket.IO    │          │
│  │ Modules      │        │ Server       │          │
│  └──────┬───────┘        └──────┬───────┘          │
│         │                        │                   │
│  ┌──────┴────────────────────────┴──────┐          │
│  │         Service Layer                 │          │
│  │  • ProcessManager (lifecycles)        │          │
│  │  • DockerManager (containers)         │          │
│  │  • TaskQueueManager (tasks)           │          │
│  │  • ScriptManager (build/test)         │          │
│  │  • LogStreamer (real-time logs)       │          │
│  │  • ConnectionManager (WebSocket)      │          │
│  └───────────────────────────────────────┘          │
└──────┬──────────────┬──────────────────────────────┘
       │              │
   ┌───▼───┐      ┌──▼──────┐
   │ Child │      │ Docker  │
   │ Procs │      │ Daemon  │
   └───────┘      └─────────┘
```

---

## Core Components

### 1. ProcessManager
**Purpose:** Manage local service lifecycles

**Responsibilities:**
- Spawn/stop child processes (backend, frontend, workers)
- Track state: stopped → starting → running → stopping → error
- Handle stdout/stderr streams
- Port conflict detection
- Auto-restart on crash

**API:**
```typescript
startProcess(config: ProcessConfig): Promise<void>
stopProcess(processId: string): Promise<void>
restartProcess(processId: string): Promise<void>
getProcess(processId: string): ProcessInfo
```

### 2. DockerManager
**Purpose:** Interface with Docker daemon

**Responsibilities:**
- List/create/start/stop containers
- Stream container logs
- Monitor stats (CPU, memory)
- Handle Docker events

**API:**
```typescript
listContainers(): Promise<ContainerInfo[]>
startContainer(id: string): Promise<void>
stopContainer(id: string): Promise<void>
streamLogs(id: string, callback): Promise<void>
```

### 3. TaskQueueManager
**Purpose:** Manage task execution

**Responsibilities:**
- Queue tasks (FIFO)
- Assign to workers
- Track execution status
- Persist to disk (tasks.json)
- Handle retries

**API:**
```typescript
addTask(task: Task): Promise<string>
assignTask(taskId, workerId): Promise<void>
completeTask(taskId, result): Promise<void>
```

### 4. ScriptManager
**Purpose:** Execute build/test/lint scripts

**Responsibilities:**
- Run scripts with args
- Stream output in real-time
- Track execution history
- Handle failures

**API:**
```typescript
executeScript(name, args): Promise<ScriptResult>
getHistory(): ScriptExecution[]
```

---

## Route Structure

10 modular route files with dependency injection:

1. **services.routes.ts** (6) - Service control
2. **socket-task.routes.ts** (15) - Task operations
3. **docker.routes.ts** (4) - Container management  
4. ~~**scripts.routes.ts** (6) - Script execution~~ _(removed Nov 2025; functionality retired)_
5. ~~**script-history.routes.ts** (5) - History tracking~~ _(removed Nov 2025 alongside script runner deprecation)_
6. **claude-workers.routes.ts** (30) - Worker management
7. **logs.routes.ts** (6) - Log retrieval
8. **ports.routes.ts** (2) - Port management
9. **environments.routes.ts** (2) - Environment info
10. **routes/index.ts** - Factory with DI

**Factory Pattern:**
```typescript
export function createApiRouter(services): Router {
  router.use('/services', createServicesRoutes(services));
  router.use('/docker', createDockerRoutes(services));
  // ... other routes
}
```

---

## Data Flow Examples

### Starting a Process

```
User clicks "Start"
    ↓
POST /api/services/:name/start
    ↓
ProcessManager.startProcess()
    ↓
spawn() child process
    ↓
Emit socket: "process:started"
    ↓
Frontend updates UI
```

### Docker Container Lifecycle

```
POST /api/docker/containers/start
    ↓
DockerManager.startContainer()
    ↓
Dockerode → Docker daemon
    ↓
Container starts
    ↓
Emit socket: "container:status"
    ↓
Frontend shows running status
```

### Task Execution

```
POST /api/tasks
    ↓
TaskQueueManager.addTask()
    ↓
Queue: pending
    ↓
Auto-assign to worker
    ↓
Worker executes
    ↓
POST /api/tasks/:id/complete
    ↓
Emit socket: "task:completed"
    ↓
Frontend shows result
```

---

## State Management

### Backend
- **ProcessManager:** In-memory Map
- **DockerManager:** Queries Docker on-demand
- **TaskQueueManager:** In-memory + tasks.json
- **ScriptManager:** In-memory + history.json

### Frontend
- React hooks (useState, useEffect)
- Socket.IO for real-time updates
- No global state library needed

```typescript
const [processes, setProcesses] = useState([]);

socket.on('process:started', (data) => {
  setProcesses(prev => [...prev, data]);
});
```

---

## Error Handling

### Backend
Centralized error middleware:

```typescript
class AppError extends Error {
  statusCode: number;
}

app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
  }
});
```

### Frontend
Try-catch with user feedback:

```typescript
try {
  await api.startService(name);
} catch (error) {
  showError(error.message);
}
```

---

## Testing

### Unit Tests (257)
- Co-located with source
- Mock external dependencies
- Fast (< 10ms each)

### Integration Tests (122+)
- `tests/integration/`
- Real processes/containers
- Slower (seconds)

**Coverage:** > 80% target

---

## Configuration

### Environment
```bash
# Backend
PORT=5000
NODE_ENV=development
LOG_LEVEL=info

# Frontend  
VITE_API_URL=http://localhost:5000
```

### Process Config
```json
{
  "id": "backend-dev",
  "command": "npm",
  "args": ["run", "dev"],
  "autoRestart": true
}
```

---

## Performance

- **API response:** < 50ms
- **Socket latency:** < 100ms
- **Hot reload:** < 1s (both stacks)
- **Memory:** < 200MB typical
- **Max processes:** 10-20

---

## Security

**Current:** Local development only
- Binds to localhost (127.0.0.1)
- No authentication
- CORS restricted

**Future:**
- Basic auth for remote access
- API keys
- Role-based permissions

---

## Deployment

### Development
```bash
cd backend && npm run dev
cd frontend && npm run dev  # separate terminal
```

### Production
```bash
cd backend && npm run build && npm start
cd frontend && npm run build
# Serve frontend from backend static
```

---

## Key Features

1. **Real-time Updates:** WebSocket-based live monitoring
2. **Process Control:** Start/stop/restart with state tracking
3. **Docker Integration:** Full container lifecycle management
4. **Task Queue:** FIFO queue with worker assignment
5. **Log Aggregation:** Centralized logs from all sources
6. **Script Execution:** Build/test/lint with history
7. **Port Management:** Conflict detection and resolution

---

## Directory Structure

```
dev-monitor/
├── backend/
│   ├── src/
│   │   ├── routes/          # 10 route modules
│   │   ├── services/        # 6 core services
│   │   ├── utils/           # Helpers
│   │   └── types/           # TypeScript types
│   └── tests/
│       ├── integration/     # 122+ tests
│       └── test-utils.ts    # 15+ helpers
├── frontend/
│   └── src/
│       ├── components/      # React components
│       ├── styles/          # CSS Modules
│       └── services/        # API client
└── docs/
    ├── architecture/
    │   └── dev-monitor-architecture.md  # This file
    └── guides/
        ├── component-style-guide.md
        ├── frontend-testing-guide.md
        ├── e2e-testing-guide.md
        ├── frontend-safety-guide.md
        ├── frontend-troubleshooting.md
        └── structured-logging.md
```

---

## Future Enhancements

- Multi-user support with authentication
- Remote monitoring capability
- Metrics dashboard (CPU, memory, response times)
- Alerting and notifications
- Plugin system for extensibility
- E2E tests with Playwright
- CI/CD pipeline

---

## Resources

- **Source:** `backend/src/`, `frontend/src/`
- **Tests:** `backend/tests/`
- **Docs:** `docs/architecture/`, `docs/guides/`
- **Style Guide:** `docs/guides/component-style-guide.md`
- **Testing:** `docs/guides/frontend-testing-guide.md`, `docs/guides/e2e-testing-guide.md`

---

**For detailed component documentation, see individual service files.**  
**For Claude Workers architecture, see `CLAUDE_WORKERS_ARCHITECTURE.md`.**
