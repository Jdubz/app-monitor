# Dev-Bots System Overview

## 🏗️ Architecture Overview

The Dev-Bots system is an autonomous AI agent coordination framework integrated into the app-monitor ecosystem. It manages task execution through specialized AI agent personalities using ephemeral Docker containers, with SQLite-based task queuing and PR-based workflows.

## 🎯 Core Components

### 1. Task Management System
- **TaskQueueService**: SQLite-based queue with ACID transactions
- **Task Schema**: Comprehensive task metadata and validation
- **Task Persistence**: SQLite database with automatic migrations
- **Task Lifecycle**: pending → running → completed/failed
- **Recovery System**: Automatic detection and handling of orphaned tasks

### 2. Agent Personalities (5 Specialized Agents)
1. **backend-specialist** - Node.js, TypeScript, PostgreSQL, Docker, APIs
2. **frontend-specialist** - React, TypeScript, CSS, HTML, Tailwind CSS
3. **fullstack-developer** - Full-stack development across backend and frontend
4. **testing-specialist** - Test frameworks, automation, quality assurance
5. **devops-engineer** - Docker, CI/CD, deployment automation

### 3. Docker Integration (Ephemeral Containers)
- **Ephemeral Container Model**: Fresh container created per task
- **Complete Environment Isolation**: No persistent workers
- **Automatic Resource Cleanup**: Containers destroyed after task completion
- **Modular Architecture**: DevBotContainerBuilder, DevBotWorkspaceManager, DevBotCredentialsManager, DevBotContainerLifecycle

### 4. PR-Based Workflow
- **PR Creation**: Automatic PR creation for completed tasks
- **PR Monitoring**: Track PR status, checks, and reviews
- **PR Recovery**: Detect and recover orphaned PRs after server restarts
- **Quality Observation**: Monitor PR checks and create repair bots for failures

## 🔄 Task Execution Flow

1. **Task Creation**: POST /claude-workers/tasks (with validation)
2. **Assignment**: Automatic agent assignment based on task type
3. **Execution**: Docker container spawned with isolated environment
4. **Monitoring**: Real-time status via Socket.IO
5. **Completion**: Output collection, validation, and persistence
6. **Cleanup**: Container and context destruction

## 🛡️ Scope Control System

### Detection Classes
- **ScopeCreepDetector**: Detects file creation, over-engineering, scope expansion patterns
- **ContextIsolation**: Isolates contaminated contexts
- **SnowballPrevention**: Detects violation chains
- **PeriodicCleanupScheduler**: Schedules periodic cleanup tasks

### Violation Types
- **HIGH**: Scope expansion, file creation out of scope
- **MEDIUM**: Over-engineering, unnecessary complexity
- **LOW**: Feature creep patterns

## 📊 Monitoring & Logging

- **Real-time Monitoring**: Task status tracking, worker health checks
- **Log Streaming**: Real-time log streaming via Socket.IO
- **Process Management**: Service lifecycle and health monitoring
- **Cloud Logging**: Google Cloud Logging integration (staging/production)

## 🔗 Integration Points

### App Monitor Integration
- **DevBotsManager**: Coordinates task execution and worker lifecycle
- **Event Flow**: Task Created → Queue → Worker Assignment → Execution → PR Creation → Monitoring

### Frontend Integration
- **Socket.IO Events**: Real-time updates for task status changes
- **API Endpoints**: REST API for task management and monitoring
- **Interactive Sessions**: Live streaming of bot execution logs

## 🚀 Current Status

**Production Ready**: 85% complete
- Core functionality: 100%
- Monitoring: 90%
- Error handling: 80%
- Cost control: 0% (design ready)
- Self-optimization: 10% (basic patterns only)

## 📈 Key Metrics

- **Task Success Rate**: Target >95%
- **Agent Utilization**: 6 specialized personalities
- **API Endpoints**: 30+ endpoints
- **Docker Optimization**: 72% image size reduction
- **Startup Time**: 80% improvement (2-3 seconds)

## 🔮 Future Enhancements

### Short-term (High Priority)
1. **Cost Tracking Integration**: Connect CostMonitor to task execution
2. **Healing System Implementation**: Auto-detect failure patterns
3. **Enhanced Retry Strategy**: Implement exponential backoff

### Medium-term (2-4 weeks)
1. **Advanced Learning System**: Pattern analysis and ML models
2. **Performance Analytics Dashboard**: Task completion metrics
3. **Enhanced Scope Control**: Automatic scope tightening

### Long-term (1-3 months)
1. **Multi-Model Agent Orchestration**: Support for different Claude variants
2. **Advanced Self-Healing**: Automatic error recovery
3. **Full ML Integration**: Success prediction models

---

**Related Documentation**:
- [Comprehensive Analysis](../analysis/comprehensive-analysis.md)
- [Implementation Guide](../implementation/implementation-guide.md)
- [Context Isolation](context-isolation.md)
- [API Reference](../api/endpoints.md)