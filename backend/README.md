# App Monitor Backend

Backend service for the App Monitor developer automation platform, providing DevBots management, GitHub integration, task queue orchestration, and PR workflow automation.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Key Services](#key-services)
- [Database](#database)
- [Testing](#testing)
- [API Documentation](#api-documentation)
- [Development](#development)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## Overview

The App Monitor backend is a TypeScript/Node.js application that orchestrates autonomous DevBots to automate development tasks, manage pull requests, and provide self-healing capabilities for CI/CD workflows.

### Key Features

- **Task Queue System**: SQLite-backed persistent task queue with priority management
- **DevBots Orchestration**: Docker-based ephemeral workers for task execution
- **GitHub Integration**: Webhook handling, PR monitoring, auto-merge capabilities
- **PR Self-Healing**: Event-driven condition evaluation and automated fix generation
- **Chain Tracking**: Multi-level task dependency tracking with depth limiting
- **Interactive Sessions**: Real-time session management with log streaming
- **Quality Observations**: Automated code quality tracking and improvement suggestions

### Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.x
- **Database**: SQLite (better-sqlite3)
- **Container Runtime**: Docker
- **API Framework**: Express.js
- **Real-time**: Socket.io
- **Testing**: Vitest
- **GitHub API**: gh CLI

---

## Quick Start

### Prerequisites

```bash
# Required
node >= 18.0.0
npm >= 9.0.0
docker >= 20.0.0
gh CLI >= 2.0.0

# Verify installations
node --version
npm --version
docker --version
gh --version
```

### Installation

```bash
# From monorepo root
npm install

# Or from backend directory
cd backend
npm install
```

### Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values
# Required: GITHUB_TOKEN, API_KEY
nano .env
```

### Running Locally

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start

# From monorepo root
npm run dev -w backend
```

The backend will start on `http://localhost:5000` (configurable via `PORT` env var).

---

## Architecture

### Service Layer Architecture

```
backend/
├── src/
│   ├── routes/              # HTTP API endpoints
│   │   └── dev-bots.routes.ts  (30+ endpoints - to be modularized)
│   ├── services/            # Business logic
│   │   ├── taskQueue.sqlite.ts         # Task queue + DB operations
│   │   ├── devBotsManager.ts          # DevBots orchestration
│   │   ├── prMonitor.service.ts       # PR workflow automation
│   │   ├── prConditionState.service.ts # PR condition evaluation
│   │   ├── githubPR.service.ts        # GitHub API client
│   │   ├── githubWebhookHandler.service.ts  # Webhook processing
│   │   ├── chainTracker.service.ts    # Task chain management
│   │   ├── ephemeralWorker.service.ts # Docker worker management
│   │   ├── interactiveSession.service.ts   # Session orchestration
│   │   └── ...                         # 50+ other services
│   ├── utils/               # Shared utilities
│   ├── config.ts            # Configuration management
│   └── index.ts             # Application entry point
├── migrations/              # Database schema migrations (001-015)
├── data/                    # SQLite database files (gitignored)
└── logs/                    # Application logs (gitignored)
```

### Event-Driven Patterns

The backend uses event-driven architecture for PR automation:

1. **GitHub Webhook** → `githubWebhookHandler.service.ts`
2. **Event Processing** → `prConditionState.service.ts` (evaluates conditions)
3. **Task Generation** → Creates fix/improvement tasks as needed
4. **Worker Execution** → `ephemeralWorker.service.ts` executes tasks in Docker
5. **PR Updates** → `prMonitor.service.ts` handles PR state transitions

---

## Key Services

### Task Queue (`taskQueue.sqlite.ts`)

**Purpose**: Persistent task queue with SQLite backing

**Responsibilities**:
- Task CRUD operations
- Priority-based queue management
- Agent metrics tracking
- Database migrations

**Key Methods**:
```typescript
createTask(config: TaskConfig): Task
getTask(id: string): Task | undefined
updateTask(id: string, updates: Partial<Task>): Task
getTasksByStatus(status: TaskStatus): Task[]
```

**Size**: 2,149 lines (planned for modularization)

---

### DevBots Manager (`devBotsManager.ts`)

**Purpose**: Core orchestrator for DevBot workers

**Responsibilities**:
- Worker lifecycle management
- Task assignment and execution
- Docker container orchestration
- Interactive session coordination

**Key Methods**:
```typescript
assignTaskToBot(task: Task): Promise<void>
terminateBot(botId: string): Promise<void>
getActiveBots(): DevBot[]
```

**Size**: 1,789 lines (planned for refactoring)

---

### PR Monitor (`prMonitor.service.ts`)

**Purpose**: PR workflow automation and auto-merge

**Responsibilities**:
- PR status monitoring
- Auto-merge coordination
- Merge failure handling
- Manual intervention task creation

**Key Methods**:
```typescript
monitorPR(prNumber: number): Promise<void>
attemptAutoMerge(prNumber: number): Promise<boolean>
handleMergeFailure(prNumber: number): Promise<void>
```

**Integration**: Works with `prConditionState.service.ts` for condition evaluation

---

### PR Condition State (`prConditionState.service.ts`)

**Purpose**: Event-driven PR condition evaluation

**Responsibilities**:
- Check status evaluation (CI/CD)
- Review approval validation
- Unresolved comment detection
- Merge conflict checking
- Blocking issue tracking

**Key Methods**:
```typescript
evaluateConditions(prNumber: number, eventType: string): Promise<void>
getConditionState(prNumber: number): ConditionState | undefined
```

**Size**: 1,922 lines (planned for modularization)

---

### GitHub PR Service (`githubPR.service.ts`)

**Purpose**: GitHub API client for PR operations

**Responsibilities**:
- Fetch PR status from GitHub
- Get check runs and reviews
- Query PR metadata
- On-demand data fetching (no caching)

**Key Methods**:
```typescript
getPRStatus(prNumber: number): Promise<PRStatus>
```

**Design Principle**: "Any information available from GitHub should NOT be stored in our DB"

---

### Chain Tracker (`chainTracker.service.ts`)

**Purpose**: Multi-level task dependency tracking

**Responsibilities**:
- Track parent-child task relationships
- Enforce chain depth limits (max 5 levels)
- Generate chain IDs
- Detect circular dependencies

**Key Methods**:
```typescript
trackChain(task: Task): void
getChainDepth(chainId: string): number
getChainTasks(chainId: string): Task[]
```

**Critical**: Prevents runaway task generation

---

### Ephemeral Worker (`ephemeralWorker.service.ts`)

**Purpose**: Docker container management for task execution

**Responsibilities**:
- Create ephemeral Docker containers
- Mount volumes (code, credentials)
- Execute task commands
- Stream logs in real-time
- Cleanup containers

**Safety Features**:
- Uncommitted changes detection
- Automatic cleanup on timeout
- Resource limits

---

### GitHub Webhook Handler (`githubWebhookHandler.service.ts`)

**Purpose**: Process GitHub webhook events

**Supported Events**:
- `check_suite` - CI/CD check status changes
- `pull_request` - PR opened/closed/merged
- `pull_request_review` - Review submitted
- `push` - Code pushed to branch

**Event Flow**:
```
Webhook → Validation → Event Processing → Condition Evaluation → Task Generation
```

---

## Database

### Schema

SQLite database with 15 migrations (001-015):

**Core Tables**:
- `tasks` - Task queue entries
- `task_context` - Task execution context
- `pr_condition_states` - PR condition tracking
- `quality_observations` - Code quality metrics
- `pr_review_comments` - Review comment metadata
- `interactive_sessions` - Session management
- `migrations` - Migration tracking

### Migrations

Migrations are located in `/backend/migrations/`:

```bash
001 - Initial schema
002 - Tasks table
003 - Task persistence
004 - Task context
005 - PR workflow
006 - Quality observations
007 - Interactive sessions
008 - PR review comments
009 - Task context storage
010 - PR condition states
011 - Chain tracking
012 - Staged queue
013 - Remove duplicate PR columns (Phase 2B)
014 - Slim PR review comments (Phase 2B)
015 - Clean quality observations (Phase 2B)
```

### Running Migrations

Migrations auto-apply on application startup. Manual application:

```bash
npm run migrate
```

### Database Location

```bash
# Development
./backend/data/app-monitor.db

# Production
/opt/app-monitor/data/app-monitor.db
```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test taskQueue.sqlite.test.ts

# Watch mode
npm test -- --watch
```

### Test Structure

Tests are co-located with source files using `.test.ts` suffix:

```
src/services/
├── taskQueue.sqlite.ts
├── taskQueue.sqlite.test.ts    # 936 backend tests total
├── prMonitor.service.ts
├── prMonitor.service.test.ts
└── ...
```

### Test Coverage

**Current Status**: 54 test files covering major services

**Well-Tested** ✅:
- Task queue operations
- PR monitoring
- GitHub webhook handling
- Task execution

**Testing Gaps** ⚠️:
- Chain tracker service
- Quality improvement generators
- PR artifact recovery
- Review comment tracker

**Goal**: 80%+ coverage for all critical services

---

## API Documentation

### Base URL

```
Development: http://localhost:5000
Production:  https://api.yourproduction.com
```

### Authentication

```bash
# API Key in headers
X-API-Key: your-api-key-here
```

### Key Endpoints

#### Task Management

```http
GET    /dev-bots/tasks              # List all tasks
POST   /dev-bots/tasks              # Create task
GET    /dev-bots/tasks/:id          # Get task details
PATCH  /dev-bots/tasks/:id          # Update task
DELETE /dev-bots/tasks/:id          # Delete task
POST   /dev-bots/tasks/:id/execute  # Execute task
```

#### DevBots Status

```http
GET /dev-bots/status        # Get system status
GET /dev-bots/agents        # List active agents
GET /dev-bots/metrics       # Get metrics
```

#### GitHub Webhooks

```http
POST /webhooks/github       # GitHub webhook receiver
```

#### Interactive Sessions

```http
POST   /dev-bots/interactive/start   # Start session
GET    /dev-bots/interactive/:id     # Get session
DELETE /dev-bots/interactive/:id     # Stop session
```

#### WebSocket Events

```javascript
// Log streaming
socket.on('task-logs', (data) => { /* ... */ });
socket.on('session-output', (data) => { /* ... */ });
```

### Full API Reference

See `/docs/api/` for complete OpenAPI specification (coming soon).

---

## Development

### Project Structure

```
backend/
├── src/
│   ├── routes/          # HTTP endpoints
│   ├── services/        # Business logic (50+ services)
│   ├── utils/           # Shared utilities
│   ├── config.ts        # Configuration
│   └── index.ts         # Entry point
├── migrations/          # Database migrations
├── data/                # SQLite database (gitignored)
├── logs/                # Application logs (gitignored)
├── dist/                # Compiled output (gitignored)
├── tsconfig.json        # TypeScript config
├── vitest.config.ts     # Test config
└── package.json         # Dependencies
```

### Code Style

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint with recommended rules
- **Formatting**: Prettier (via ESLint)
- **Naming**: `camelCase` for variables, `PascalCase` for classes
- **Services**: Use `.service.ts` suffix for service files

### Common Development Tasks

```bash
# Build TypeScript
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint

# Fix linting issues
npm run lint:fix

# Clean build artifacts
rm -rf dist/
```

### Debugging

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Inspect database
sqlite3 ./data/app-monitor.db
sqlite> .tables
sqlite> SELECT * FROM tasks LIMIT 5;
```

---

## Environment Variables

See `.env.example` for complete list. Key variables:

### Required

- `GITHUB_TOKEN` or `GH_TOKEN` - GitHub personal access token
- `API_KEY` - Backend API authentication key

### Optional (with defaults)

- `PORT` (default: 5000) - Server port
- `NODE_ENV` (default: development) - Environment
- `DATABASE_PATH` (default: ./data/app-monitor.db) - Database location
- `MAX_DEV_BOTS` (default: 3) - Max concurrent DevBots
- `CORS_ORIGIN` (default: http://localhost:5174) - Frontend URL

### Production Only

- `GITHUB_WEBHOOK_SECRET` - GitHub webhook validation
- `GOOGLE_APPLICATION_CREDENTIALS` - GCP service account
- `INTERACTIVE_SESSION_OWNER` - Email for interactive sessions

See the Environment Setup Guide in the project documentation for complete details.

---

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>

# Or use different port
PORT=5001 npm run dev
```

#### Database Locked

```bash
# Close all connections
pkill -f app-monitor

# Remove lock files
rm ./data/*.db-wal ./data/*.db-shm

# Restart
npm run dev
```

#### Docker Permission Denied

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Logout and login again
newgrp docker
```

#### GitHub API Rate Limit

```bash
# Check rate limit status
gh api rate_limit

# Wait for reset or use different token
```

### Logs

Application logs are written to:

```bash
./backend/logs/app-monitor.log       # General logs
./backend/logs/error.log             # Error logs
```

View logs:

```bash
tail -f logs/app-monitor.log
grep ERROR logs/error.log
```

### Performance Issues

If the backend is slow:

1. Check active DevBots: `GET /dev-bots/status`
2. Review database size: `du -h data/app-monitor.db`
3. Check Docker containers: `docker ps`
4. Review logs for errors

---

## Contributing

### Code Quality Standards

- All new code must include tests
- TypeScript strict mode compliance
- ESLint warnings must be addressed
- PR requires review approval

### Pull Request Workflow

1. Create feature branch from `staging`
2. Implement changes with tests
3. Run `npm test` (all tests must pass)
4. Run `npm run lint:fix`
5. Push and create PR to `staging`
6. DevBots will auto-run checks
7. Address review comments
8. Auto-merge when approved + checks pass

### Adding New Services

1. Create service file: `src/services/myService.service.ts`
2. Create test file: `src/services/myService.service.test.ts`
3. Export singleton instance pattern
4. Document public methods
5. Add integration points

Example:

```typescript
// myService.service.ts
export class MyService {
  constructor() { /* ... */ }

  public async doSomething(): Promise<void> {
    // Implementation
  }
}

// Singleton pattern
let instance: MyService | undefined;

export function getMyService(): MyService {
  if (!instance) {
    instance = new MyService();
  }
  return instance;
}
```

---

## Related Documentation

- [IMPLEMENTATION_STATUS.md](../docs/IMPLEMENTATION_STATUS.md) - Overall project status
- [OUTSTANDING_CLEANUP_IMPROVEMENTS.md](../docs/analysis/OUTSTANDING_CLEANUP_IMPROVEMENTS.md) - Feature roadmap
- [CODE_HYGIENE_AND_MAINTAINABILITY_ANALYSIS.md](../docs/analysis/CODE_HYGIENE_AND_MAINTAINABILITY_ANALYSIS.md) - Code quality review
- [DATABASE_MIGRATION_SAFETY.md](../docs/DATABASE_MIGRATION_SAFETY.md) - Migration guide
- [DEV_BOTS_ARCHITECTURE_ANALYSIS.md](../docs/analysis/DEV_BOTS_ARCHITECTURE_ANALYSIS.md) - Architecture details

---

## License

Proprietary - Internal use only

## Support

For issues or questions:
- Create a GitHub issue in the repository
- Email: contact@joshwentworth.com

---

**Last Updated**: 2025-11-12
**Version**: 0.2.0
**Status**: Active Development
