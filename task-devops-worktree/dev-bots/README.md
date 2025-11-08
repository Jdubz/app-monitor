# Claude Workers System

> **⚠️ DEPRECATED**: This directory contains legacy experimental code. The active Claude Workers system is now integrated into the dev-monitor.

## Active System

The Claude Workers system is now part of the **dev-monitor** and provides:

- ✅ **Task Management**: Create and assign tasks to specialized AI agents
- ✅ **6 Agent Personalities**: Backend, Frontend, Testing, Review, DevOps, Documentation specialists  
- ✅ **Real-time Monitoring**: Live task status and progress tracking
- ✅ **Docker Integration**: Containerized task execution with proper isolation
- ✅ **Task Persistence**: File-based storage with automatic backups

## How to Use

1. **Start the dev-monitor system**:
   ```bash
   make dev-monitor
   ```

2. **Access the Claude Workers interface**:
   - Open http://localhost:5174
   - Navigate to the "Claude Workers" tab
   - Create and manage tasks

3. **API Access**:
   ```bash
   # Check system status
   curl http://localhost:5000/api/claude-workers/status
   
   # Get tasks
   curl http://localhost:5000/api/claude-workers/tasks
   ```

## Documentation

- **System Architecture**: See `/dev-monitor/` directory
- **API Documentation**: See `dev-monitor/backend/src/routes/api.ts`
- **Agent Personalities**: See `dev-monitor/backend/src/services/agentPersonalities.ts`

## 📚 Documentation

All Claude Workers documentation has been consolidated and organized in the `docs/` directory:

### Quick Start
- [Documentation Overview](docs/README.md) - Complete documentation index
- [System Architecture](docs/architecture/system-overview.md) - High-level system design
- [API Reference](docs/api/endpoints.md) - Complete API documentation

### Key Documents
- [Comprehensive Analysis](docs/analysis/comprehensive-analysis.md) - Complete technical analysis
- [Quick Reference](docs/analysis/quick-reference.md) - Fast lookup guide
- [Implementation Guide](docs/implementation/implementation-guide.md) - Step-by-step setup
- [Task Examples](docs/examples/task-examples.md) - Sample tasks and templates

### Specialized Documentation
- [Agent Personalities](docs/api/agent-personalities.md) - 6 specialized AI agents
- [Learning System](docs/learning/learning-system-analysis.md) - Adaptive learning
- [Healing System](docs/healing/healing-system-design.md) - Auto-recovery
- [Scope Control](docs/scope-control/scope-control-system.md) - Feature creep prevention

## Legacy Files

Historical documentation and analysis files are kept for reference in `docs/archive/`:

- `docs/archive/` - All legacy documentation files
- `docs/archive/migration-notes.md` - System evolution and migration details
- Various other analysis and documentation files

---

**Note**: The active Claude Workers system is now fully integrated into the dev-monitor. Use the dev-monitor interface for all task management operations.