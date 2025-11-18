# Architecture Documentation

## Primary Document

**master-design-intent.md** - THE single source of truth for App Monitor architecture, design principles, and implementation guidelines

This document consolidates all architectural decisions, safety mechanisms, and design patterns.

## Subsystem Architecture

- **[phase-system-architecture.md](./phase-system-architecture.md)** - 7-phase task lifecycle (v0.3.0 - Production)
- **[task-queue-architecture.md](./task-queue-architecture.md)** - Database schema, queue, chain concurrency
- **[dev-bots-architecture.md](./dev-bots-architecture.md)** - Autonomous agent execution layer
- **[system-overview.md](./system-overview.md)** - Complete system components and data flow
- **[pr-tracking-architecture.md](./pr-tracking-architecture.md)** - PR metadata, merge gates, condition tracking
- **[bug-reports-architecture.md](./bug-reports-architecture.md)** - Production error tracking
- **[context-management/system-architecture.md](./context-management/system-architecture.md)** - Context delivery and isolation

## Organization

- **Implementation details** → `/technicalDesigns/`
- **Operational guides** → `/guides/`
- **Future work** → `/plans/`
