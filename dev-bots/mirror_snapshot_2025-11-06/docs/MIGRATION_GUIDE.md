# Migration Guide: dev-monitor & claude-workers → app-monitor

## What Changed

### Directory Structure

**Before:**

```
job-finder-app-manager/
├── dev-monitor/
│   ├── backend/
│   ├── frontend/
│   └── docs/
└── claude-workers/
```

**After:**

```
app-monitor/ (separate repo)
├── backend/        (from dev-monitor/backend)
├── frontend/       (from dev-monitor/frontend)
├── dev-bots/       (from claude-workers)
└── docs/
```

### Commands Changed

| Old Command                              | New Command                           |
| ---------------------------------------- | ------------------------------------- |
| `cd dev-monitor && make dev`             | `cd app-monitor && make dev`          |
| `cd dev-monitor/backend && npm run dev`  | `cd app-monitor && make dev-backend`  |
| `cd dev-monitor/frontend && npm run dev` | `cd app-monitor && make dev-frontend` |

### Import Paths

- Internal imports: No changes (all relative within app-monitor)
- External types: Still from `@jsdubzw/job-finder-shared-types`

### Logging (Current State)

**No changes yet.** Logs still in `job-finder-app-manager/logs/`.
Backend still references `../../../../logs`.

**Future:** Config-based log sources (see Phase 4 plan).

## For Developers

### Setting Up app-monitor

1. **Clone the repo:**

   ```bash
   cd /path/to/your/projects/
   git clone https://github.com/Jdubz/app-monitor.git
   cd app-monitor
   ```

2. **Install dependencies:**

   ```bash
   make install
   # or: npm install && npm install --workspaces
   ```

3. **Start development:**
   ```bash
   make dev  # Both backend and frontend
   # or individually:
   make dev-backend
   make dev-frontend
   ```

### Running from job-finder-app-manager

The root Makefile in job-finder-app-manager now calls app-monitor:

```bash
cd job-finder-app-manager
make app-monitor  # Starts app-monitor services
```

### Testing

```bash
# Run all tests
make test

# Specific workspace tests
npm test -w backend
npm test -w frontend

# E2E tests
npm run test:e2e -w frontend
```

## Troubleshooting

### Port Already in Use

```bash
make stop  # Kills processes on 5000 and 5174
```

### Cannot Find Logs

**Current behavior:** Logs are expected at `../../../../logs` relative to backend.
Ensure app-monitor is in the right location relative to job-finder-app-manager.

**Future:** Will be config-based.

### Type Import Errors

Ensure `@jsdubzw/job-finder-shared-types` is properly linked:

```bash
cd job-finder-app-manager/job-finder-shared-types
npm link
cd ../../app-monitor/frontend
npm link @jsdubzw/job-finder-shared-types
```

## What's Next

See `../MIGRATION_TO_APP_MONITOR_REPO.md` Phase 4 for planned logging reconfiguration.
