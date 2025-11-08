# Architecture Overview

## System Design

App Monitor is a three-tier developer tool:

1. **Backend** - Express/Node.js service
2. **Frontend** - React SPA
3. **Dev-Bots** - Docker-based autonomous workers

## Component Relationships

```
┌─────────────────┐
│                 │
│    Frontend     │ :5174
│    (React)      │
│                 │
└────────┬────────┘
         │ HTTP/WebSocket
         │
┌────────▼────────┐
│                 │
│    Backend      │ :5000
│   (Express)     │
│                 │
└────┬──────┬─────┘
     │      │
     │      └──────────┐
     │                 │
┌────▼─────┐    ┌──────▼──────┐
│          │    │             │
│  Logs    │    │  Dev-Bots   │
│ Watcher  │    │   (Docker)  │
│          │    │             │
└──────────┘    └─────────────┘
```

## Communication Patterns

### Frontend ↔ Backend
- **REST API:** Service control, configuration
- **WebSocket:** Real-time log streams, status updates

### Backend ↔ Logs
- **File System:** Watch log files, stream changes

### Backend ↔ Dev-Bots
- **Docker API:** Start/stop containers
- **Mounted Volumes:** Share logs and data

## Data Flow

1. Services write logs to file system
2. Backend watches log files (via chokidar)
3. Backend parses and formats log entries
4. Backend streams to connected frontend clients (via Socket.io)
5. Frontend displays logs in real-time

## Key Technologies

- **Backend:** Express, Socket.io, chokidar, Dockerode
- **Frontend:** React, Vite, Socket.io-client, Axios
- **Dev-Bots:** Node.js, Docker
- **Testing:** Vitest, Playwright
- **CI:** GitHub Actions

## Future Enhancements

See Phase 4 in `MIGRATION_TO_APP_MONITOR_REPO.md`:
- Config-based log sources
- Service-specific log locations
- Enhanced monitoring capabilities

For detailed architecture, see:
- [Dev-Monitor Architecture](./dev-monitor/ARCHITECTURE.md)
- [Claude Workers Architecture](./dev-bots/CLAUDE_WORKERS_ARCHITECTURE.md)