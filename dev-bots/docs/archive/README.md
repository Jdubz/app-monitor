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

## Legacy Files

This directory contains historical documentation and analysis files that are kept for reference:

- `CLAUDE_WORKERS_ANALYSIS.md` - Comprehensive system analysis
- `CLAUDE_WORKERS_ARCHITECTURE_ANALYSIS.md` - Architecture documentation  
- `CLAUDE_WORKERS_CRITICAL_FIXES_COMPLETE.md` - Implementation fixes
- Various other analysis and documentation files

---

**Note**: The active Claude Workers system is now fully integrated into the dev-monitor. Use the dev-monitor interface for all task management operations.