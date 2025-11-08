# App Monitor Architecture

**Version:** 2.0
**Last Updated:** November 7, 2025
**Status:** Pre-POC Stabilization (v0.2.0)

---

## Table of Contents

1. [System Vision](#system-vision)
2. [Core Architecture](#core-architecture)
3. [Technology Stack](#technology-stack)
4. [Component Details](#component-details)
5. [Data Flow](#data-flow)
6. [Security & Safety](#security--safety)
7. [Evolution Phases](#evolution-phases)

---

## System Vision

App Monitor is evolving from a **development monitoring tool** into a **self-building, self-improving autonomous development platform**. The system is designed to:

- Monitor and manage services in the job-finder-app-manager ecosystem
- Provide real-time log streaming from multiple services
- Coordinate autonomous development tasks via AI agents (dev-bots)
- Learn from execution patterns and optimize model selection
- Maintain high code quality through automated gates
- Operate within budget constraints across multiple AI providers

**Key Principle**: Quality over speed. All code must pass tests, linting, and documentation requirements.

---

## Core Architecture

### High-Level System Design

```
┌────────────────────────────────────────────────────────────┐
│                   Browser Dashboard (Port 5174)             │
│  [Logs] [Services] [Dev-Bots] [Tasks] [Token Monitor]     │
└─────────────────────┬──────────────────────────────────────┘
                      │ HTTP/WebSocket
                      ▼
┌────────────────────────────────────────────────────────────┐
│           App Monitor Backend (Port 5000)                   │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │                  Core Services                       │   │
│  │  • ProcessManager (service lifecycle)               │   │
│  │  • LogSourceManager (config-driven log streaming)   │   │
│  │  • TaskQueueManager (FIFO, SQLite persistence)     │   │
│  │  • DevBotsManager (agent coordination)             │   │
│  │  • TokenTrackingService (budget management)         │   │
│  │  • QualityGateValidator (test/lint/docs)           │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
└──────┬────────────────┬───────────────┬─────────────────┘
       │                │               │
   ┌───▼────┐      ┌───▼──────┐   ┌───▼─────────────┐
   │ Local  │      │  Docker  │   │  AI Providers   │
   │Services│      │Containers│   │ Claude/GPT/etc  │
   └────────┘      └──────────┘   └─────────────────┘
```

### Directory Structure

```
app-monitor/
├── backend/                    # Express + TypeScript backend
│   ├── src/
│   │   ├── routes/            # 76 API endpoints across 10 modules
│   │   ├── services/          # 10+ core services
│   │   │   ├── processManager.ts
│   │   │   ├── logSourceManager.ts
│   │   │   ├── taskQueueManager.ts
│   │   │   ├── devBotsManager.ts
│   │   │   ├── tokenTracking.ts
│   │   │   ├── qualityGates.ts
│   │   │   └── ...
│   │   ├── utils/
│   │   │   └── portCheck.ts   # Port validation utilities
│   │   └── config.ts          # Fixed ports, paths
│   ├── config/
│   │   └── log-sources.json   # Central log configuration
│   ├── logs/                  # Backend logs
│   └── tests/
├── frontend/                  # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── hooks/            # Custom React hooks
│   │   └── services/         # API clients
│   └── logs/                 # Frontend logs
├── dev-bots/                 # Autonomous development agents
│   ├── docker/
│   │   └── Dockerfile
│   ├── scripts/
│   └── logs/
├── packages/
│   └── api-contracts/        # Shared TypeScript API contracts
├── docs/                     # Comprehensive documentation
└── scripts/                  # Utility scripts
```

---

## Technology Stack

### Backend
- **Runtime**: Node.js >= 18.0.0
- **Framework**: Express.js
- **Language**: TypeScript 5.3.3
- **WebSockets**: Socket.io
- **Database**: SQLite (task queue, work-target registry)
- **File Watching**: chokidar
- **Docker**: dockerode
- **Testing**: Vitest (543/543 tests passing)

### Frontend
- **Framework**: React 18
- **Language**: TypeScript 5.3.3
- **Build Tool**: Vite
- **WebSockets**: Socket.io-client
- **HTTP Client**: Axios
- **E2E Testing**: Playwright

### Dev-Bots
- **Container**: Docker (ephemeral containers)
- **AI Providers**: Claude (Anthropic), GPT (OpenAI), Cursor, Copilot
- **Workspace**: Git worktrees (worker-a, worker-b)

### CI/CD
- **Git Hooks**: Husky (pre-commit linting, pre-push testing)
- **Pipeline**: GitHub Actions
- **Linting**: ESLint
- **Quality Checks**: Matrix testing on Node.js 18.x and 20.x

---

## Component Details

### 1. ProcessManager
**Purpose**: Manage local service lifecycles with strict port validation

**Features**:
- Spawn/stop child processes for managed services
- **Port conflict detection** with fail-fast behavior
- Track service state transitions
- Handle stdout/stderr streams
- Optional auto-restart on crash

**Fixed Port Assignments**:
- **5000** - App Monitor backend
- **5174** - App Monitor frontend
- **5001** - Job Finder backend
- **5173** - Job Finder frontend
- **4000-9199** - Firebase emulators (6 ports)
- **5555** - Job Finder worker

**Managed Services**:
1. job-finder-backend (Node.js + Firebase emulators)
2. job-finder-frontend (React SPA)
3. job-finder-worker (Python service)

### 2. LogSourceManager
**Purpose**: Config-driven log streaming from multiple services

**Configuration** (`backend/config/log-sources.json`):
```json
{
  "version": "1.0",
  "logSources": {
    "service-name": {
      "name": "Display Name",
      "enabled": true,
      "path": "../../service/logs/file.log",
      "format": "structured",
      "parser": "winston",
      "color": "#F97316",
      "displayOrder": 1
    }
  }
}
```

**Features**:
- Watch multiple log files simultaneously
- Parse different log formats (winston, vite, python)
- Stream to dashboard via Socket.IO
- Enable/disable sources dynamically
- Hot reload configuration

**Current Sources**:
1. App Monitor Backend (port 5000)
2. App Monitor Frontend (port 5174)
3. Job Finder Backend (port 5001)
4. Job Finder Frontend (port 5173)
5. Job Finder Worker (Python)
6. Dev-Bots (disabled, Phase B)

### 3. TaskQueueManager
**Purpose**: FIFO task queue with SQLite persistence

**Task Types**:
1. feature - New feature implementation
2. bugfix - Bug fixes
3. refactoring - Code refactoring
4. testing - Test creation/improvement
5. documentation - Documentation updates
6. devops - Infrastructure/deployment
7. performance - Performance optimization
8. security - Security improvements
9. learning - System self-improvement

**Task Lifecycle**:
```
pending → assigned → active → completed/failed
```

**Features**:
- SQLite persistence with automatic backups
- Quality gate integration (tests/lint/docs must pass)
- Token usage tracking per task
- Quality scoring after completion
- Retry system with exponential backoff
- Batch approval enforcement (Phase 1)

### 4. DevBotsManager
**Purpose**: Coordinate autonomous AI development agents

**Agent Personalities** (6 specialized agents):
1. **Backend Specialist** - Node.js, TypeScript, PostgreSQL, APIs
2. **Frontend Specialist** - React, TypeScript, CSS, UI/UX
3. **Review Specialist** - Code analysis, security, best practices
4. **Testing Specialist** - Test frameworks, coverage, automation
5. **DevOps Specialist** - Docker, Kubernetes, CI/CD, infrastructure
6. **Documentation Specialist** - Technical writing, API docs, guides

**Container Architecture**:
- **Ephemeral containers**: Zero filesystem artifacts (72% smaller, 80% faster)
- **Tar | docker cp pattern**: Workspace copying without filesystem writes
- **Automatic cleanup**: Containers removed after task completion
- **Credential mounting**: Read-only access to git credentials
- **Workspace isolation**: Git worktrees for parallel execution

**Safety Mechanisms**:
- **Uncommitted changes detection**: Prevents losing work
- **Patch files**: Captures bot changes before failure
- **Git status capture**: Full state snapshot on errors
- **Scope creep detection**: Monitors task boundary violations
- **Timeout enforcement**: 60-minute stuck task detection

**Failure Recovery** (NEW):
- Circular recovery prevention
- Stuck task timeout detection
- Automatic cleanup strategies
- Dry-run mode for testing
- Comprehensive logging

### 5. TokenTrackingService (Phase 1 - In Progress)
**Purpose**: Budget management across AI providers

**Features**:
- Track token usage per provider (not dollar amounts)
- Calculate daily budgets from weekly/monthly limits
- Hard stop when daily budget reached
- Real-time dashboard monitoring
- Historical usage data

**Providers**:
- Claude (Anthropic) - monthly billing
- GPT (OpenAI) - monthly billing
- Cursor - weekly billing
- GitHub Copilot - monthly subscription

### 6. QualityGateValidator (Phase 1 - In Progress)
**Purpose**: Enforce code quality requirements

**Quality Gates**:
1. **Tests**: All tests must pass
2. **Linting**: No ESLint errors
3. **Documentation**: Required docs updated
4. **Type Safety**: TypeScript compilation succeeds
5. **Build**: Production build succeeds

**Enforcement**: Tasks CANNOT complete without passing all gates.

---

## Data Flow

### Log Streaming Flow
```
1. Services write logs → file system
2. Backend watches log files (chokidar)
3. Backend parses log entries (format-specific parsers)
4. Backend streams to frontend (Socket.IO)
5. Frontend displays in real-time
```

### Task Execution Flow
```
1. Task created → pending state in SQLite
2. Task assigned to appropriate agent (by personality)
3. Ephemeral container spawned with workspace
4. Agent executes task with safety checks
5. Quality gates validate output
6. Results scored and saved
7. Container cleaned up
8. Task marked completed/failed
```

### Service Management Flow
```
1. Frontend requests service start/stop
2. Backend validates port availability
3. ProcessManager spawns/kills process
4. Status updates streamed via WebSocket
5. Logs captured and streamed to dashboard
```

---

## Security & Safety

### Development vs Production

**Development Environment** (PRIMARY):
- **Location**: `/home/jdubz/Development/app-monitor`
- **Branch**: `staging` or feature branches
- **Ports**: Backend 5000, Frontend 5174
- **Commands**: `npm run dev -w backend`, `npm run dev -w frontend`
- **Rule**: Never commit directly to `main`

**Production Environment** (CI/CD ONLY):
- **Location**: `/opt/app-monitor`
- **Branch**: `main` only
- **Ports**: Backend 5050, Frontend 5173
- **Services**: systemd (app-monitor-backend-prod.service, app-monitor-frontend-prod.service)
- **Deployment**: Automatic via GitHub Actions on push to `main`
- **Rule**: NEVER manually modify production

### Safety Mechanisms

1. **Port Conflict Prevention**:
   - Fail-fast on port conflicts
   - Detailed error messages with PID information
   - No automatic cleanup (explicit user action required)

2. **Git Safety**:
   - Pre-commit hooks (linting)
   - Pre-push hooks (all tests)
   - Uncommitted changes detection
   - Patch file creation on failures

3. **Container Safety**:
   - Ephemeral containers (no persistent state)
   - Read-only credential mounts
   - Automatic cleanup on completion
   - Resource limits and timeouts

4. **Quality Enforcement**:
   - Mandatory test coverage
   - Zero linting errors
   - Documentation requirements
   - Type safety validation

---

## Evolution Phases

### Current State: Pre-POC Stabilization (v0.2.0)
**Status**: 85% Production Ready

**Completed**:
- Task management (FIFO queue, SQLite persistence, 9 types)
- 6 specialized agent personalities
- Docker integration (ephemeral, optimized)
- 76 API endpoints across 10 modules
- Real-time updates (Socket.IO)
- Workspace sync (git worktrees)
- Config-driven log streaming
- Fixed port management
- 543/543 backend tests passing
- Frontend build and tests passing
- Git hooks (pre-commit, pre-push)
- Failure recovery system

**In Progress**:
- Backend build errors (routes/server.ts) - non-critical
- V3 prompt engineering system
- Token tracking integration
- Quality metrics dashboard

### Phase 1: Foundation (2-3 weeks) - IN PROGRESS
**Goal**: Production-ready with quality enforcement and budget controls

**Key Deliverables**:
1. **Token Tracking Integration**: Cross-provider budget management
2. **Quality Gates Enforcement**: Mandatory test/lint/docs checks
3. **Quality Scoring Framework**: Automated task quality metrics
4. **Batch Approval System**: Controlled autonomy with human oversight
5. **Basic Healing System**: Failure pattern detection and recovery

### Phase 2: Multi-Model Intelligence (3-4 weeks) - PLANNED
**Goal**: Optimal model selection and self-improvement

**Key Deliverables**:
1. **Multi-Model Support**: Intelligent routing across Claude, GPT, Cursor, Copilot
2. **Learning Engine**: Pattern analysis from task history
3. **Self-Tuning**: Automated prompt and configuration optimization

### Phase 3: Full Autonomy (4-6 weeks) - FUTURE
**Goal**: Self-building, self-maintaining system

**Key Deliverables**:
1. **Advanced Healing**: Automatic error recovery
2. **Predictive Optimization**: Task complexity prediction
3. **Full Autonomy**: Self-generated improvement tasks

---

## API Contracts

All API requests and responses use the shared TypeScript contracts defined in `/packages/api-contracts/index.ts`.

**Standard Response Format**:
```typescript
// Success
{
  success: true,
  data: T
}

// Error
{
  success: false,
  error: string
}
```

**Key Endpoint Groups**:
- `/api/logs/*` - Log source management (6 endpoints)
- `/api/services/*` - Service lifecycle management (8 endpoints)
- `/api/tasks/*` - Task queue operations (12 endpoints)
- `/api/dev-bots/*` - Agent coordination (15 endpoints)
- `/api/quality/*` - Quality gates and scoring (10 endpoints)
- `/api/tokens/*` - Token tracking and budgets (8 endpoints)

See `/docs/api/README.md` for complete API reference.

---

## Related Documentation

- [Setup Guide](./setup.md) - Complete installation and configuration
- [Next Steps](./next-steps.md) - Prioritized tasks and roadmap
- [Development Guide](./DEVELOPMENT.md) - Developer workflows
- [Migration Guide](./MIGRATION_GUIDE.md) - Migration from dev-monitor
- [Stabilization Plan](./plans/APP_MONITOR_STABILIZATION_PLAN.md) - Current phase details
- [Capability Roadmap](./plans/APP_MONITOR_CAPABILITY_ROADMAP.md) - Long-term vision

---

## Architectural Decisions

### Why Config-Based Log Sources?
- **Flexibility**: Add new services without code changes
- **Maintainability**: Single source of truth for log configuration
- **Scalability**: Easy to enable/disable sources
- **Documentation**: Self-documenting through JSON schema

### Why Fixed Ports?
- **Predictability**: Developers always know where services are
- **Debugging**: Easier to troubleshoot port conflicts
- **Documentation**: Clear port assignments in docs
- **Safety**: Fail-fast prevents silent failures

### Why Ephemeral Containers?
- **Performance**: 72% smaller, 80% faster than persistent containers
- **Safety**: No persistent state to corrupt
- **Cleanup**: Automatic removal prevents accumulation
- **Isolation**: Each task gets clean environment

### Why SQLite for Task Queue?
- **Simplicity**: No external database required
- **Performance**: Fast for queue operations
- **Reliability**: ACID compliance for task state
- **Portability**: Single file, easy backups

### Why Quality Gates?
- **Quality**: Prevents broken code from landing
- **Consistency**: Enforces standards across all work
- **Learning**: System learns what "quality" means
- **Trust**: Enables autonomous operation with confidence

---

**Last Updated**: November 7, 2025
**Document Version**: 2.0
**Architecture Version**: v0.2.0
