# Dev-Bots - Autonomous Development Agents

**Status**: Active Development
**Integration**: Fully integrated with app-monitor system
**Documentation**: Comprehensive docs in `dev-bots/docs/`

---

## What It Does

Dev-Bots is an autonomous AI agent system that executes development tasks using specialized agent personalities. Tasks are managed via SQLite queue, executed in ephemeral Docker containers, and submitted as PRs for review.

## Key Features

- **SQLite Task Queue**: ACID-compliant task queue with automatic recovery
- **Ephemeral Containers**: Fresh Docker container per task, no persistent workers
- **5 Agent Personalities**: backend-specialist, frontend-specialist, fullstack-developer, testing-specialist, devops-engineer
- **PR-Based Workflow**: Automatic PR creation, monitoring, and recovery
- **Quality Observation**: Monitor PR checks and create repair bots for failures
- **Interactive Sessions**: Real-time streaming of bot execution logs

## How to Use

1. **Start the app-monitor system**:
   ```bash
   cd app-monitor
   make dev
   ```

2. **Access the Dev-Bots interface**:
   - Open http://localhost:5174
   - Navigate to the "Dev-Bots" tab
   - Create and manage tasks

3. **API Access**:
   ```bash
   # Check system status
   curl http://localhost:5000/api/dev-bots/status

   # Get tasks
   curl http://localhost:5000/api/dev-bots/tasks
   ```

## Current Architecture

- **TaskQueueService** - SQLite-based queue (`backend/src/services/taskQueue.sqlite.ts`)
- **EphemeralWorkerService** - Docker container management (`backend/src/services/ephemeralWorker.service.ts`)
- **InteractiveSessionOrchestrator** - Interactive bot sessions (`backend/src/services/interactiveSessionOrchestrator.ts`)
- **Modular Components**: DevBotContainerBuilder, DevBotWorkspaceManager, DevBotCredentialsManager, DevBotContainerLifecycle

## Documentation

All Dev-Bots documentation is organized in the `docs/` directory:

### Quick Start
- [Documentation Overview](docs/README.md) - Complete documentation index
- [System Architecture](docs/architecture/system-overview.md) - High-level system design
- [API Reference](docs/api/endpoints.md) - Complete API documentation

### Key Documents
- [Agent Personalities](docs/api/agent-personalities.md) - 5 specialized AI agents
- [Task Examples](docs/examples/task-examples.md) - Sample tasks and templates
- [Deployment Guide](docs/deployment/deployment-checklist.md) - Production deployment

---

**Note**: The Dev-Bots system is fully integrated into app-monitor. Use the app-monitor interface for all task management operations.
