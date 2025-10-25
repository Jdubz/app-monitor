# App Monitor

Developer monitoring and automation tool for the job-finder-app-manager ecosystem.

## What It Does

App Monitor is a **development-only** web dashboard that provides:

- **Real-time log streaming** - Monitor logs from all services in one place
- **Service management** - Start/stop backend, frontend, and worker services
- **Port management** - Fixed port assignments with conflict detection
- **Dev-bots coordination** - Autonomous development tasks via AI agents (optional)
- **System health monitoring** - Process status, port usage, Docker containers

**Key Point:** This tool is for local development only and is not deployed to production.

## Quick Start

### Install Dependencies
```bash
cd app-monitor
npm install && npm install --workspaces
```

### Configure
Environment files are already created. Verify configuration:
```bash
cd backend
node scripts/verify-config.js
```

### Start Services
```bash
# From app-monitor directory
make dev              # Both backend + frontend
make dev-backend      # Backend only (port 5000)
make dev-frontend     # Frontend only (port 5174)

# Or from job-finder-app-manager root
make monitor-start    # Start app-monitor
make monitor-stop     # Stop app-monitor
```

### Access
- **Frontend:** http://localhost:5174 (Dashboard UI)
- **Backend API:** http://localhost:5000 (REST + WebSocket)

## Structure

- `backend/` - Express + TypeScript backend (port 5000)
  - `config/` - Log sources configuration
  - `src/services/` - Business logic (10+ services)
  - `src/routes/` - API endpoints (76 endpoints, 10 modules)
  - `src/utils/` - Utilities (port checks, logging)
- `frontend/` - React + TypeScript frontend (port 5174)
  - `src/components/` - UI components
  - `src/hooks/` - Custom React hooks
  - `src/services/` - API clients
- `dev-bots/` - Autonomous development bots (Docker)
- `docs/` - Comprehensive documentation
- `scripts/` - Utility scripts

## Configuration

### Log Sources

All log sources are configured in `backend/config/log-sources.json`:

```json
{
  "logSources": {
    "job-finder-backend": {
      "name": "Job Finder Backend",
      "enabled": true,
      "path": "../../job-finder-BE/logs/backend-dev.log",
      "format": "structured",
      "parser": "winston",
      "color": "#F97316"
    }
  }
}
```

To add a new service:
1. Add entry to `log-sources.json`
2. Ensure log directory exists
3. Reload: `POST /api/logs/reload`

### Port Assignments (Fixed)

- **5000** - App Monitor backend
- **5174** - App Monitor frontend
- **5001** - Job Finder backend
- **5173** - Job Finder frontend
- **4000-9199** - Firebase emulators
- **5555** - Job Finder Worker

**Port conflicts are detected and prevented.** Services will fail to start if required ports are busy.

## Managed Services

App Monitor can start, stop, and monitor these services:

1. **job-finder-backend** - Node.js backend + Firebase emulators
   - Ports: 5001, 4000, 4400, 8080, 9099, 9199
   - Command: `npm run dev` in job-finder-BE

2. **job-finder-frontend** - React frontend
   - Port: 5173
   - Command: `npm run dev` in job-finder-FE

3. **job-finder-worker** - Python worker service
   - Port: 5555
   - Command: `python3 -m job_finder_worker`

All services use **fixed ports** and will fail if ports are busy (no automatic cleanup).

## API Endpoints

### Log Sources
- `GET /api/logs/sources` - List enabled log sources
- `GET /api/logs/config` - Get full configuration
- `POST /api/logs/reload` - Reload configuration
- `GET /api/logs/validate` - Validate log directories

### Services
- `GET /api/services` - List all services
- `POST /api/services/:name/start` - Start service
- `POST /api/services/:name/stop` - Stop service
- `GET /api/services/:name/status` - Get service status

See `docs/api/` for complete API documentation.

## Development

### Running Tests
```bash
# All tests
make test

# Specific workspace
npm test -w backend
npm test -w frontend

# E2E tests
npm run test:e2e -w frontend
```

### Linting
```bash
# All workspaces
npm run lint

# Fix issues
npm run lint:fix
```

### Building
```bash
# All workspaces
npm run build

# Specific workspace
npm run build -w backend
```

## Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
lsof -i:5000

# Kill process
lsof -ti:5000 | xargs kill

# Or stop all app-monitor services
make stop
```

### Log Sources Not Found
1. Check `backend/config/log-sources.json` paths
2. Ensure log directories exist
3. Validate: `GET /api/logs/validate`

### Service Won't Start
1. Check port availability: `lsof -i:<port>`
2. Verify service configuration in `backend/src/config.ts`
3. Check logs: `tail -f backend/logs/backend.log`

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - System design
- [Development Guide](./docs/DEVELOPMENT.md) - Developer guide
- [Migration Guide](./docs/MIGRATION_GUIDE.md) - Migration notes
- [API Documentation](./docs/api/) - API reference

## Features

✅ **Real-time log streaming** (config-based, 5+ sources)  
✅ **Service management** (start/stop/restart)  
✅ **Port conflict detection** (fail-fast with helpful errors)  
✅ **Docker integration** (dev-bots support)  
✅ **WebSocket updates** (live status and logs)  
✅ **Keyboard shortcuts** (10+ shortcuts)  
✅ **Responsive design** (mobile, tablet, desktop)  
✅ **Error boundaries** (graceful error handling)  
✅ **400+ tests** (unit, integration, E2E)  

## License

MIT
