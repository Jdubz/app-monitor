# APP-MONITOR-FIX-6 — Add Root Workspace Scripts (NICE TO HAVE)

- **Status**: To Do
- **Owner**: Worker B (or PM)
- **Priority**: P2 (Medium - Nice DX Improvement)
- **Labels**: priority-p2, app-monitor, type-feature, dx
- **Estimated Effort**: 30 minutes
- **Dependencies**: None
- **Related**: APP-MONITOR-SETUP Part 5.1

## Important Context

⚠️ **App Monitor is a LOCAL DEVELOPMENT TOOL ONLY** - It will never be deployed. Workspace scripts are a **nice-to-have** for developer convenience but not critical.

## What This Issue Covers

Create root `package.json` with workspace scripts to run backend and frontend together. Currently must open two separate terminals manually. This is **purely a convenience** - the app works fine without it.

## Context

**Current DX**: Open 2 terminals

```bash
# Terminal 1
cd app-monitor/backend && npm run dev

# Terminal 2
cd app-monitor/frontend && npm run dev
```

**Better DX**: Single command

```bash
npm run dev  # Starts both
```

## Tasks

### 1. Create Root Package.json

- [ ] Create `app-monitor/package.json`
- [ ] Add concurrently dependency
- [ ] Add workspace scripts

### 2. Add Development Scripts

- [ ] `dev` - Start both backend and frontend
- [ ] `dev:backend` - Start backend only
- [ ] `dev:frontend` - Start frontend only

### 3. Add Quality Scripts

- [ ] `lint` - Lint both
- [ ] `type-check` - Type-check both
- [ ] `test` - Test both (when added)
- [ ] `build` - Build both

### 4. Add Utility Scripts

- [ ] `clean` - Remove node_modules and dist
- [ ] `install:all` - Install dependencies in both
- [ ] `prepare` - Husky install (if added)

## Proposed Configuration

### app-monitor/package.json

```json
{
  "name": "app-monitor-root",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",

    "lint": "npm run lint:backend && npm run lint:frontend",
    "lint:backend": "cd backend && npm run lint",
    "lint:frontend": "cd frontend && npm run lint",

    "type-check": "npm run type-check:backend && npm run type-check:frontend",
    "type-check:backend": "cd backend && npm run type-check",
    "type-check:frontend": "cd frontend && npm run type-check",

    "build": "npm run build:backend && npm run build:frontend",
    "build:backend": "cd backend && npm run build",
    "build:frontend": "cd frontend && npm run build",

    "test": "npm run test:backend && npm run test:frontend",
    "test:backend": "cd backend && npm test",
    "test:frontend": "cd frontend && npm test",

    "clean": "rm -rf backend/node_modules backend/dist frontend/node_modules frontend/dist node_modules",
    "install:all": "npm install && cd backend && npm install && cd ../frontend && npm install"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

## Usage Examples

```bash
# Start development (both backend + frontend)
npm run dev

# Run all linting
npm run lint

# Type-check everything
npm run type-check

# Build everything
npm run build

# Run all tests
npm test

# Clean everything
npm run clean
```

## Acceptance Criteria

- [ ] Root package.json exists
- [ ] `npm run dev` starts both backend and frontend
- [ ] `npm run lint` lints both
- [ ] `npm run type-check` checks both
- [ ] `npm run build` builds both
- [ ] All scripts work from app-monitor/ root
- [ ] Concurrently shows colored output for each service

## Benefits

- Single command to start everything
- Unified quality checks
- Better developer experience
- Consistent with other projects
- Easier onboarding

## Optional: Colored Output

### Enhanced dev script with colors

```json
{
  "scripts": {
    "dev": "concurrently -n backend,frontend -c blue,green \"npm run dev:backend\" \"npm run dev:frontend\""
  }
}
```

This shows backend logs in blue, frontend in green for easy distinction.

## Related Issues

- APP-MONITOR-FIX-3: Git hooks (shares root package.json)
- Could integrate with job-finder-app-manager root scripts
