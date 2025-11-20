# App Monitor

Developer monitoring and automation tool for the job-finder-app-manager ecosystem.

## 📊 Project Status: Post-Stabilization

**Current Focus:** Production validation & monitoring  
**Status:** Active Development  
**Last Updated:** November 20, 2025  
**Production Deployment:** Automated via GitHub Actions

Stabilization (v0.2.0) completed on November 14, 2025 and the dedicated plan was deleted per the Documentation System rules. Current priorities now live exclusively in the [Prioritized Feature Roadmap](./docs/plans/PRIORITIZED_FEATURE_ROADMAP.md).

### ✅ Recent Highlights
- **Frontend + Backend Baselines:** Builds, linting, and 543 backend tests green after the stabilization push.
- **Context-Aware Task Submission:** Three-field API with auto-detection fully powering dev-bot intake.
- **Ephemeral Execution Guarantees:** Tar|docker-cp pattern with automatic cleanup and uncommitted-change safety nets.

### 🚧 Active Initiatives (see roadmap for owners)
- **Work-Target Registry:** SQLite-first metadata with zero legacy JSON fallbacks.
- **Quality Metrics:** Instrumentation for scope compliance, duplication rate, and workflow success.
- **Prompt/Context Iterations:** Continual recipe tuning to keep acceptance checklists and constraints current.

**Note:** This internal tool favors immediate cutovers—feature flags, dry runs, or soft-rollouts are intentionally avoided to preserve clarity.

---

## ⚠️ CRITICAL: Development vs Production

### Development Environment (THIS ONE)
**Use this for all development work:**
- **Location**: This directory (`/home/jdubz/Development/app-monitor`)
- **Branch**: `staging` or feature branches
- **Ports**: Backend 5000, Frontend 5174
- **Start**: `npm run dev -w backend` and `npm run dev -w frontend`
- **Never commit directly to `main`**

### Production Environment (HANDS OFF)
**NEVER manually modify - CI/CD only:**
- **Location**: `/opt/app-monitor` (system service)
- **Branch**: `main` only
- **Ports**: Backend 5001/5002 (blue-green), Frontend 80 (nginx)
- **Services**: `app-monitor-backend@5001.service`, `app-monitor-backend@5002.service`, `nginx`
- **Deployment**: Automatic via GitHub Actions on push to `main`

📖 See [Production Setup Guide](./docs/setup/PRODUCTION_SETUP_QUICKSTART.md) for production details.

---

## What It Does

App Monitor is a **development-only** web dashboard that provides:

- **Real-time log streaming** - Monitor logs from all services in one place
- **Service management** - Start/stop backend, frontend, and worker services
- **Port management** - Fixed port assignments with conflict detection
- **Dev-bots coordination** - Autonomous development tasks via AI agents (optional)
- **System health monitoring** - Process status, port usage, Docker containers

**Key Point:** This tool is for local development only and is not deployed to production.

## Quick Start

### System Requirements

Before installing dependencies, ensure you have the following system requirements:

**Required:**
- Node.js 18.x or 20.x
- npm 8.x or higher
- tmux (for interactive terminal sessions)
- Build tools for native dependencies:
  - **Linux**: `build-essential` package
    ```bash
    sudo apt-get install build-essential tmux
    ```
  - **macOS**: Xcode Command Line Tools
    ```bash
    xcode-select --install
    brew install tmux
    ```

**Note:** The `node-pty` package requires native compilation and these build tools are necessary for installation. If you encounter errors during `npm install`, ensure these dependencies are installed.

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

### Shared API Contracts

- `shared/api-contracts/index.ts` contains the only source of truth for every REST/Socket DTO that the backend emits and the frontend consumes.
- All JSON responses must use the shared `ApiSuccess<T>` and `ApiError` envelopes so clients can rely on `success`/`data`/`error` fields; the backend routes import these helpers and the frontend services unwrap them before returning data.
- If you add a new endpoint, extend the shared contract file first, update the backend route to return the contract, and then consume it in `frontend/src/services/api.ts` so both sides stay in sync.
- Dev-Bots management endpoints (`/api/dev-bots/*`) expose types such as `DevBotsStatus`, `DevBotsTask`, and `DevBotsWorkspaceSyncStatus` from the shared contracts package, and the frontend imports those exact types to avoid drift across panels.

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

### Git Hooks (Automated Quality Checks)

This repository uses [Husky](https://typicode.github.io/husky/) for automated code quality checks:

**Pre-commit Hook:** Runs linting on staged files
- Automatically formats TypeScript files with ESLint
- Catches style issues before commit
- Can be bypassed with `git commit --no-verify` (not recommended)

**Pre-push Hook:** Runs all unit tests
- Ensures tests pass before pushing
- Prevents broken code from reaching remote
- Can be bypassed with `git push --no-verify` (not recommended)

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed development guidelines.

### CI/CD Pipeline

GitHub Actions automatically runs on pull requests to `main`:
- ✅ Linting (ESLint)
- ✅ Unit tests (Vitest)
- ✅ Build verification

Matrix testing on Node.js 18.x and 20.x ensures compatibility.

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

### Getting Started
- [Environment Setup Guide](./docs/setup/ENVIRONMENT_SETUP.md) - Detailed installation and configuration
- [Architecture Overview](./docs/architecture/README.md) - System design and components
- [Frontend Development Guide](./docs/guides/FRONTEND_DEVELOPMENT.md) - Developer workflows and best practices

### Planning & Roadmap
- [Prioritized Feature Roadmap](./docs/plans/PRIORITIZED_FEATURE_ROADMAP.md) - Current priorities (stabilization complete)

### Migration & History
- [Migration Guide](./docs/guides/MIGRATION_GUIDE.md) - Migrating from dev-monitor
- [Google Cloud Logging](./docs/guides/GOOGLE_CLOUD_LOGGING_PERMISSIONS.md) - GCP IAM setup

### Contributing
- [Contributing Guide](./CONTRIBUTING.md) - Git hooks, CI/CD, and development workflows

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
