# Development Guide

## Project Overview

App Monitor is a **developer-only tool** for monitoring and managing services in the job-finder-app-manager ecosystem.

**Key Characteristics:**

- Not public-facing
- Not deployed to production
- Runs in development mode
- Functionality over performance
- No bundle size concerns

## Architecture

### Backend (`/backend`)

- **Tech:** Node.js, Express, TypeScript, Socket.io
- **Port:** 5000
- **Purpose:**
  - Watch log files
  - Manage Docker containers (dev-bots)
  - Provide REST & WebSocket APIs
  - Execute scripts

### Frontend (`/frontend`)

- **Tech:** React, TypeScript, Vite
- **Port:** 5174
- **Purpose:**
  - Real-time log viewer
  - Service status dashboard
  - Interactive controls
  - Dev-bot management UI

### Dev-Bots (`/dev-bots`)

- **Tech:** Node.js, Docker
- **Purpose:**
  - Autonomous development tasks
  - Coordinated via backend
  - Run in Docker containers

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Docker (for dev-bots)

### Setup

```bash
git clone https://github.com/Jdubz/app-monitor.git
cd app-monitor
make install
```

### Running

```bash
# Start everything
make dev

# Or individually
make dev-backend
make dev-frontend
```

### Stopping

```bash
make stop
# Or just Ctrl+C in the terminal
```

## Development Workflow

### Making Changes

1. **Create a branch**

   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make changes in appropriate workspace**
   - Backend: `/backend/src/`
   - Frontend: `/frontend/src/`
   - Dev-bots: `/dev-bots/`

3. **Test your changes**

   ```bash
   npm test -w backend
   npm test -w frontend
   ```

4. **Lint and format**

   ```bash
   npm run lint:fix
   ```

5. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push origin feature/your-feature
   ```

### Testing

#### Unit Tests

```bash
# All workspaces
npm test

# Specific workspace
npm test -w backend
npm test -w frontend

# Watch mode
npm run test:watch -w backend
```

#### E2E Tests (Frontend)

```bash
# Ensure backend is running first
make dev-backend

# In another terminal
npm run test:e2e -w frontend

# UI mode
npm run test:e2e:ui -w frontend
```

#### Coverage

```bash
npm run test:coverage -w backend
npm run test:coverage -w frontend
```

### Linting

```bash
# Check all
npm run lint

# Fix all
npm run lint:fix

# Specific workspace
npm run lint -w backend
npm run lint:fix -w frontend
```

## Project Structure

```
app-monitor/
├── backend/
│   ├── src/
│   │   ├── routes/       # Express routes
│   │   ├── services/     # Business logic
│   │   ├── utils/        # Utilities
│   │   └── index.ts      # Entry point
│   ├── tests/
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom hooks
│   │   ├── services/     # API clients
│   │   └── App.tsx       # Root component
│   ├── e2e/              # Playwright tests
│   ├── package.json
│   └── tsconfig.json
├── dev-bots/
│   ├── docker/
│   │   └── Dockerfile
│   ├── scripts/
│   ├── data/
│   └── package.json
├── docs/                 # Documentation
├── scripts/              # Utility scripts
├── .github/workflows/    # CI/CD
├── package.json          # Root workspace config
└── Makefile              # Convenience commands
```

## Key Concepts

### Log Watching

Backend watches log files and streams updates via WebSocket to frontend.

**Current:** Watches `../../../../logs` relative to backend.
**Future:** Config-based sources.

### Dev-Bots

Autonomous development workers running in Docker containers.
Managed via backend API, monitored via frontend UI.

### Real-time Updates

Frontend connects to backend via Socket.io for live updates:

- Log streams
- Service status changes
- Task completions

## Common Tasks

### Adding a New Backend Route

1. Create route file in `backend/src/routes/`
2. Import in `backend/src/routes/index.ts`
3. Add tests in `backend/tests/`

### Adding a New Frontend Component

1. Create component in `frontend/src/components/`
2. Create test file alongside component
3. Import and use in parent component

### Updating Documentation

1. Edit markdown files in `/docs/`
2. Update cross-references as needed
3. Rebuild docs index if structure changes

## Debugging

### Backend

```bash
# Check logs
tail -f backend/logs/dev-monitor-backend.log

# Check process
ps aux | grep "nodemon.*app-monitor"

# Check port
lsof -i:5000
```

### Frontend

- Use browser DevTools
- Check browser console for errors
- Network tab for API calls

### Dev-Bots

```bash
# List containers
docker ps | grep app-monitor

# Check logs
docker logs <container-id>

# Inspect
docker inspect <container-id>
```

## CI/CD

GitHub Actions workflows in `.github/workflows/`:

- `ci.yml` - Main CI pipeline
- `backend-tests.yml` - Backend-specific
- `frontend-tests.yml` - Frontend + E2E
- `dev-bots-tests.yml` - Dev-bots

All tests must pass before merging PRs.

## Resources

- [Architecture Documentation](./ARCHITECTURE.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [API Reference](./api/README.md)
- [Original Refactoring Docs](./dev-monitor/REFACTORING_DOCUMENTATION.md)

## Getting Help

- Check documentation in `/docs/`
- Review existing issues and PRs
- Reach out to the team
