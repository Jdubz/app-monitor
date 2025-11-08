# App Monitor Setup Guide

**Last Updated:** November 7, 2025
**Version:** 0.2.0

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Starting Services](#starting-services)
5. [Verification](#verification)
6. [Production Setup](#production-setup)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **Docker**: Latest stable version (for dev-bots)
- **Git**: For version control

### System Requirements
- **OS**: Linux, macOS, or Windows with WSL2
- **Memory**: Minimum 4GB RAM
- **Disk**: At least 2GB free space
- **Ports**: 5000, 5174 must be available (see [Port Requirements](#port-requirements))

### Optional
- **Python**: >= 3.8 (if running job-finder-worker)
- **Firebase CLI**: For firebase emulator management

---

## Installation

### 1. Clone the Repository

```bash
# Development location (RECOMMENDED)
cd /home/jdubz/Development
git clone https://github.com/Jdubz/app-monitor.git
cd app-monitor
```

**Important**: Keep app-monitor in this location relative to job-finder-app-manager for proper log path resolution.

### 2. Install Dependencies

```bash
# Install root dependencies and all workspaces
npm install
npm install --workspaces

# Or use the convenience command
npm run install:all
```

This will install dependencies for:
- Root package
- Backend workspace
- Frontend workspace
- Dev-bots workspace
- API contracts package

### 3. Create Environment Files

Environment files are typically already created. To verify:

```bash
# Check backend environment
ls -la backend/.env

# Check frontend environment
ls -la frontend/.env
```

If missing, create them:

**Backend** (`backend/.env`):
```env
NODE_ENV=development
PORT=5000

# AI Provider Keys (optional for basic monitoring)
ANTHROPIC_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here

# Failure Recovery Configuration
DRY_RUN_MODE=true
MAX_RECOVERY_DEPTH=3
STUCK_TASK_TIMEOUT_MINUTES=60

# Database
DATABASE_PATH=./data/tasks.sqlite
```

**Frontend** (`frontend/.env`):
```env
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000
```

### 4. Verify Installation

```bash
cd backend
node scripts/verify-config.js
```

Expected output:
```
✅ All paths exist
✅ All log directories created
✅ Log sources config valid
✅ Environment files present
✅ Port assignments documented
```

---

## Configuration

### Log Sources

All log sources are configured in `backend/config/log-sources.json`:

```json
{
  "version": "1.0",
  "logSources": {
    "app-monitor-backend": {
      "name": "App Monitor Backend",
      "enabled": true,
      "path": "./logs/backend.log",
      "format": "structured",
      "parser": "winston",
      "color": "#3B82F6",
      "displayOrder": 1
    },
    "job-finder-backend": {
      "name": "Job Finder Backend",
      "enabled": true,
      "path": "../../job-finder-BE/logs/backend-dev.log",
      "format": "structured",
      "parser": "winston",
      "color": "#F97316",
      "displayOrder": 3
    }
  }
}
```

**To add a new service**:
1. Add entry to `log-sources.json`
2. Ensure log directory exists
3. Reload configuration: `POST /api/logs/reload`

### Port Requirements

App Monitor uses **fixed port assignments**. These ports must be available:

| Port | Service | Required |
|------|---------|----------|
| 5000 | App Monitor Backend | ✅ Yes |
| 5174 | App Monitor Frontend | ✅ Yes |
| 5001 | Job Finder Backend | Optional |
| 5173 | Job Finder Frontend | Optional |
| 4000 | Firebase Emulator UI | Optional |
| 4400 | Firebase Emulator Hub | Optional |
| 8080 | Firebase Functions | Optional |
| 9099 | Firebase Auth | Optional |
| 9199 | Firebase Storage | Optional |
| 5555 | Job Finder Worker | Optional |

**Port conflicts will cause services to fail on startup**. See [Troubleshooting](#port-conflicts) for resolution.

### Service Configuration

Services are defined in `backend/src/config.ts`:

```typescript
export const serviceConfigs = {
  'job-finder-backend': {
    name: 'Job Finder Backend',
    command: 'npm run dev',
    cwd: '../../job-finder-BE',
    ports: [5001, 4000, 4400, 8080, 9099, 9199],
    env: {
      NODE_ENV: 'development',
      PORT: '5001'
    },
    requirePorts: true  // Fail if ports busy
  }
};
```

---

## Starting Services

### Development Mode

**Option 1: Using Make commands** (Recommended)
```bash
# Start both backend and frontend
make dev

# Or individually
make dev-backend      # Backend only (port 5000)
make dev-frontend     # Frontend only (port 5174)
```

**Option 2: Using npm scripts**
```bash
# Start both
npm run dev

# Or individually
npm run dev:backend
npm run dev:frontend
```

**Option 3: From job-finder-app-manager root**
```bash
cd job-finder-app-manager
make monitor-start    # Start app-monitor
make monitor-stop     # Stop app-monitor
```

### Service Startup Sequence

1. **Backend starts** (port 5000)
   - Loads configuration
   - Initializes services (ProcessManager, LogSourceManager, TaskQueueManager)
   - Starts WebSocket server
   - Loads log sources
   - Starts watching log files

2. **Frontend starts** (port 5174)
   - Vite dev server starts
   - Connects to backend via WebSocket
   - Loads initial state
   - Begins streaming logs

### Expected Output

**Backend**:
```
[2025-11-07 10:00:00] INFO: Starting app-monitor backend...
[2025-11-07 10:00:01] INFO: ✅ Port 5000 available
[2025-11-07 10:00:01] INFO: ✅ ProcessManager initialized
[2025-11-07 10:00:01] INFO: ✅ LogSourceManager loaded 5 sources
[2025-11-07 10:00:01] INFO: ✅ TaskQueueManager initialized
[2025-11-07 10:00:02] INFO: ✅ WebSocket server ready
[2025-11-07 10:00:02] INFO: Backend running on port 5000
```

**Frontend**:
```
VITE v5.x.x ready in 500 ms

➜  Local:   http://localhost:5174/
➜  Network: use --host to expose
```

---

## Verification

### Check Services are Running

```bash
# Check processes
ps aux | grep "app-monitor"

# Check ports
lsof -i:5000,5174

# Or use netstat
netstat -tuln | grep -E "5000|5174"
```

### Test API Endpoints

```bash
# Get log sources
curl http://localhost:5000/api/logs/sources

# Expected: JSON array of enabled log sources

# Get service status
curl http://localhost:5000/api/services

# Expected: JSON array of managed services

# Validate log configuration
curl http://localhost:5000/api/logs/validate

# Expected: {"success": true, "data": {...}}
```

### Access Frontend

Open your browser to `http://localhost:5174`

You should see:
- Log viewer with real-time log streams
- Service management panel
- Task queue (if dev-bots enabled)
- System status indicators

### Run Tests

```bash
# All tests
make test

# Backend only (543 tests)
npm test -w backend

# Frontend only
npm test -w frontend

# E2E tests (Playwright)
npm run test:e2e -w frontend
```

### Verify Git Hooks

Git hooks are automatically installed via Husky:

```bash
# Check hooks are installed
ls -la .husky/

# Should see: pre-commit, pre-push
```

**Pre-commit**: Runs linting on staged files
**Pre-push**: Runs all unit tests

To test:
```bash
# Make a change and commit
echo "test" >> test.txt
git add test.txt
git commit -m "test"  # Linting runs

# Try to push
git push  # Tests run
```

---

## Production Setup

### Overview

Production deployment uses:
- **Location**: `/opt/app-monitor`
- **Branch**: `main` only
- **Ports**: Backend 5050, Frontend 5173
- **Services**: systemd services
- **Deployment**: Automated via GitHub Actions

### Quick Setup

```bash
# Run the interactive setup script
~/app-monitor-deployment/setup-production-interactive.sh
```

This will:
1. Create `/opt/app-monitor` directory
2. Install systemd services
3. Clone repository from GitHub
4. Create production `.env` file
5. Install dependencies
6. Build backend and frontend
7. Start production services

### Manual Production Setup

See detailed instructions in:
- [Production Setup Quickstart](../PRODUCTION_SETUP_QUICKSTART.md)
- `~/app-monitor-deployment/setup-production-manual.md`

### Production Services

```bash
# Check service status
sudo systemctl status app-monitor-backend-prod.service
sudo systemctl status app-monitor-frontend-prod.service

# Start services
sudo systemctl start app-monitor-backend-prod.service
sudo systemctl start app-monitor-frontend-prod.service

# Stop services
sudo systemctl stop app-monitor-backend-prod.service
sudo systemctl stop app-monitor-frontend-prod.service

# View logs
sudo journalctl -u app-monitor-backend-prod.service -f
```

### Production Access

- **Backend API**: http://localhost:5050
- **Frontend**: http://localhost:5173

### Important Production Rules

- ❌ **NEVER** manually modify files in `/opt/app-monitor`
- ❌ **NEVER** run dev servers in production directory
- ✅ **ALWAYS** develop in `~/Development/app-monitor`
- ✅ **ALWAYS** let CI/CD handle production deployments

---

## Troubleshooting

### Port Conflicts

**Problem**: Service fails to start with "port already in use" error

**Solution**:
```bash
# Check what's using the port
lsof -i:5000

# Example output:
# COMMAND   PID   USER
# node     12345  jdubz

# Kill the process
kill 12345

# Or kill all on port
lsof -ti:5000 | xargs kill

# Or stop all app-monitor services
make stop
```

### Log Sources Not Found

**Problem**: Backend starts but logs show "log source not found"

**Solutions**:
1. Check paths in `backend/config/log-sources.json`
2. Ensure log directories exist:
   ```bash
   mkdir -p backend/logs
   mkdir -p frontend/logs
   mkdir -p ../../job-finder-BE/logs
   mkdir -p ../../job-finder-FE/logs
   ```
3. Validate configuration:
   ```bash
   curl http://localhost:5000/api/logs/validate
   ```
4. Reload configuration:
   ```bash
   curl -X POST http://localhost:5000/api/logs/reload
   ```

### Service Won't Start

**Problem**: Managed service (job-finder-backend, etc.) won't start

**Debugging steps**:
1. Check port availability:
   ```bash
   lsof -i:5001  # For job-finder-backend
   ```
2. Verify service configuration in `backend/src/config.ts`
3. Check service's own logs:
   ```bash
   tail -f ../../job-finder-BE/logs/backend-dev.log
   ```
4. Verify service directory exists and has correct structure
5. Check backend logs:
   ```bash
   tail -f backend/logs/backend.log
   ```

### WebSocket Connection Fails

**Problem**: Frontend can't connect to backend WebSocket

**Solutions**:
1. Verify backend is running:
   ```bash
   curl http://localhost:5000/api/health
   ```
2. Check frontend `.env` has correct URLs:
   ```env
   VITE_API_URL=http://localhost:5000
   VITE_WS_URL=ws://localhost:5000
   ```
3. Check browser console for connection errors
4. Verify no firewall blocking localhost connections
5. Restart both services:
   ```bash
   make stop
   make dev
   ```

### Tests Failing

**Problem**: Tests fail with errors

**Backend tests**:
```bash
# Run with verbose output
npm test -w backend -- --reporter=verbose

# Run specific test file
npm test -w backend -- src/services/processManager.test.ts

# Run with coverage
npm run test:coverage -w backend
```

**Frontend tests**:
```bash
# Run with UI
npm run test:ui -w frontend

# Run E2E tests with debugging
npm run test:e2e:debug -w frontend
```

### Docker Issues (Dev-Bots)

**Problem**: Dev-bots containers won't start

**Solutions**:
1. Check Docker is running:
   ```bash
   docker ps
   ```
2. Verify Docker socket permissions:
   ```bash
   ls -la /var/run/docker.sock
   ```
3. Check image exists:
   ```bash
   docker images | grep app-monitor
   ```
4. Build image if missing:
   ```bash
   cd dev-bots
   docker build -t app-monitor-worker:latest -f docker/Dockerfile .
   ```
5. Check Docker logs:
   ```bash
   docker logs <container-id>
   ```

### Git Hooks Not Running

**Problem**: Pre-commit or pre-push hooks don't execute

**Solutions**:
1. Reinstall hooks:
   ```bash
   npm run prepare
   ```
2. Verify Husky installed:
   ```bash
   ls -la .husky/
   cat .husky/pre-commit
   cat .husky/pre-push
   ```
3. Check hook permissions:
   ```bash
   chmod +x .husky/pre-commit
   chmod +x .husky/pre-push
   ```
4. Test hook manually:
   ```bash
   .husky/pre-commit
   ```

### Build Errors

**Problem**: `npm run build` fails with TypeScript errors

**Current Known Issues**:
- Some TypeScript errors remain in `backend/src/routes/` and `backend/src/server.ts`
- These are **non-critical** and don't affect runtime
- Tests still pass (543/543)

**Solutions**:
1. Check for recent code changes
2. Ensure all dependencies installed:
   ```bash
   npm install --workspaces
   ```
3. Clear build cache:
   ```bash
   npm run clean
   npm run build
   ```
4. Check TypeScript version:
   ```bash
   npx tsc --version  # Should be 5.3.3
   ```

### Performance Issues

**Problem**: Slow log streaming or high CPU usage

**Solutions**:
1. Reduce enabled log sources in `log-sources.json`
2. Increase log polling interval in backend config
3. Check log file sizes (large files slow parsing):
   ```bash
   ls -lh backend/logs/
   ls -lh ../../job-finder-BE/logs/
   ```
4. Rotate large log files:
   ```bash
   mv backend/logs/backend.log backend/logs/backend.log.old
   touch backend/logs/backend.log
   ```
5. Monitor system resources:
   ```bash
   top
   # or
   htop
   ```

### Environment Variables Not Loading

**Problem**: Configuration not being picked up

**Solutions**:
1. Verify `.env` file exists in correct location:
   ```bash
   ls -la backend/.env
   ls -la frontend/.env
   ```
2. Check file permissions:
   ```bash
   chmod 600 backend/.env
   chmod 600 frontend/.env
   ```
3. Verify no syntax errors in `.env` files
4. Restart services after changes:
   ```bash
   make stop
   make dev
   ```
5. Check environment is loaded:
   ```bash
   # In backend
   console.log(process.env.PORT);  # Should be 5000
   ```

---

## Development Workflow

### Daily Development

```bash
# 1. Pull latest changes
git checkout staging
git pull origin staging

# 2. Create feature branch
git checkout -b feature/your-feature

# 3. Start services
make dev

# 4. Make changes and test
npm test -w backend
npm test -w frontend

# 5. Commit (hooks run automatically)
git add .
git commit -m "feat: your feature"

# 6. Push (tests run automatically)
git push origin feature/your-feature

# 7. Create pull request to staging
```

### Before Pushing

Pre-push hook automatically runs:
- All backend tests (543 tests)
- All frontend tests
- Must pass before push succeeds

To bypass (use sparingly):
```bash
git push --no-verify
```

### Configuration Changes

When modifying configuration:

1. **Log sources** (`backend/config/log-sources.json`):
   - Edit file
   - Reload: `curl -X POST http://localhost:5000/api/logs/reload`
   - Or restart backend

2. **Service configs** (`backend/src/config.ts`):
   - Edit file
   - Restart backend

3. **Environment variables** (`.env`):
   - Edit file
   - Restart affected service

---

## Next Steps

After successful setup:

1. Review [Architecture Documentation](./architecture.md)
2. Check [Next Steps and Roadmap](./next-steps.md)
3. Read [Development Guide](./DEVELOPMENT.md)
4. Explore [API Documentation](./api/README.md)
5. Review [Stabilization Plan](./plans/APP_MONITOR_STABILIZATION_PLAN.md)

---

## Getting Help

If you encounter issues not covered here:

1. Check the logs:
   - Backend: `backend/logs/backend.log`
   - Frontend: Browser console
   - Services: Service-specific log files

2. Review related documentation:
   - [Troubleshooting Common Issues](./DEVELOPMENT.md#troubleshooting)
   - [Migration Guide](./MIGRATION_GUIDE.md)

3. Check recent changes:
   ```bash
   git log --oneline -10
   ```

4. Verify system status:
   ```bash
   make status  # If available
   # or
   ps aux | grep app-monitor
   lsof -i:5000,5174
   ```

---

**Last Updated**: November 7, 2025
**Document Version**: 1.0
**App Version**: v0.2.0
