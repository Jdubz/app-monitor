# App Monitor Documentation

Comprehensive documentation for the App Monitor developer tool.

## Quick Links

- [Getting Started](./getting-started.md)
- [Development Guide](./DEVELOPMENT.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [API Reference](./api/README.md)

## Documentation Structure

### `/dev-monitor/`
Original dev-monitor documentation, including:
- Refactoring documentation
- Phase completion summaries
- Component style guides
- Testing guides
- Architecture documents

**Key Files:**
- [REFACTORING_DOCUMENTATION.md](./dev-monitor/REFACTORING_DOCUMENTATION.md)
- [ARCHITECTURE.md](./dev-monitor/ARCHITECTURE.md)
- [E2E_TESTING_GUIDE.md](./dev-monitor/E2E_TESTING_GUIDE.md)
- [STATUS.md](./dev-monitor/STATUS.md)

### `/dev-bots/`
Dev-bots (formerly claude-workers) documentation:
- Worker coordination system
- Docker orchestration
- Healing and learning systems
- Mode decision trees

**Key Files:**
- [README.md](./dev-bots/README.md)
- [HEALING_SYSTEM_DESIGN.md](./dev-bots/HEALING_SYSTEM_DESIGN.md)
- [LEARNING_SYSTEM_ANALYSIS.md](./dev-bots/LEARNING_SYSTEM_ANALYSIS.md)
- [WORKER_ONBOARDING.md](./dev-bots/WORKER_ONBOARDING.md)

### `/architecture/`
System architecture and design documents (to be created)

### `/api/`
API documentation and reference (to be created)

## Project Context

App Monitor is a developer tool for the job-finder-app-manager ecosystem. It is:
- **Not public-facing** - Internal developer tool only
- **Not deployed** - Runs in development mode
- **Not performance-critical** - Functionality over optimization

## Contributing

See [DEVELOPMENT.md](./DEVELOPMENT.md) for contribution guidelines.