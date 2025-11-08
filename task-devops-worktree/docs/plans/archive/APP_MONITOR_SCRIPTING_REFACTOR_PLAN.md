# App Monitor Scripting Consolidation & Refactor Plan

**Date:** 2025-10-21
**Scope:** All job-finder repositories
**Goal:** Centralize ALL development workflows through app-monitor

---

## Executive Summary

Currently, development scripts are scattered across 4 repositories with significant duplication. This plan consolidates ALL dev operations through the `app-monitor` UI, eliminating 1000+ lines of duplicated Makefile/script code and creating a single, unified developer experience.

**Current State:**

- 4 Makefiles (1,076 total lines) with ~60% duplication
- 30+ shell scripts scattered across repos
- ~50 npm scripts duplicated across repos
- Manual process management (developers run multiple terminals)
- No unified logging or status visibility

**Target State:**

- Single app-monitor UI manages all services
- One-click start/stop for entire stack
- Unified logging with filtering and search
- Health monitoring and status dashboard
- 0 manual terminal management
- Centralized script management in app-monitor

---

## Current Inventory

### job-finder-FE (Frontend)

**Makefile:** 185 lines

```makefile
# Development
dev, dev-stop, dev-status, dev-logs
build, preview, clean

# Testing
test, test-watch, test-coverage, test-e2e

# Quality
lint, lint-fix, type-check

# Firebase (DEPRECATED - now in BE)
emulators, emulators-stop, emulators-status

# Deployment
deploy-staging, deploy-prod

# Utilities
kill, health-check
```

**Scripts:**

- `scripts/check-env.sh` - Environment validation
- `infrastructure/terraform/setup.sh` - Terraform setup

**npm scripts:** 31 scripts

- Development: dev, build, preview
- Testing: 10 test variants (unit, integration, e2e, coverage, ui)
- Quality: lint, format, type-check
- Deployment: build:staging, build:production
- Utilities: check:env

### job-finder-BE (Backend)

**Makefile:** 153 lines

```makefile
# Development
dev, dev-build, dev-stop, dev-status, dev-logs
build, clean

# Testing
test, test-watch, test-coverage

# Quality
lint, lint-fix

# Emulators (PRIMARY)
emulators, emulators-stop, functions, functions-stop
build-watch, shell

# Deployment
deploy-staging, deploy-prod, logs

# Utilities
health-check
```

**Scripts:**

- `scripts/emulator/start-with-persistence.sh` - Emulator startup
- `scripts/emulator/clear-data.sh` - Clear emulator data
- `scripts/emulator/seed-test-data.sh` - Seed test data
- `scripts/deploy-production.sh` - Production deployment
- `scripts/backup-production.sh` - Production backup
- `scripts/rollback-production.sh` - Production rollback
- `scripts/smoke-tests-production.sh` - Production smoke tests

**npm scripts:** 22 scripts

- Development: start, serve, shell
- Testing: test, test:ci, test:watch, test:coverage
- Quality: lint, lint:fix
- Build: build, build:watch
- Deployment: deploy, deploy:staging
- Utilities: clean, logs

### job-finder-worker (Python Worker)

**Makefile:** 503 lines (LARGEST!)

```makefile
# Development
setup, install, dev-install
dev, dev-stop, dev-status, dev-logs

# Testing
test, test-coverage, test-e2e, test-e2e-full, test-e2e-local
test-e2e-local-verbose, test-e2e-local-full, test-specific, smoke-queue

# Quality
lint, format, format-check, type-check, quality

# Running
run, search, worker, scheduler

# Docker
docker-build, docker-push, docker-run, docker-up, docker-down
docker-logs, docker-dev, docker-dev-shell

# Database
db-explore, db-cleanup, db-merge-companies
db-setup-listings, db-setup-config

# Deployment
deploy-staging, deploy-production

# Cleanup
clean, clean-cache, clean-all
```

**Scripts:**

- `scripts/dev/dev-shell.sh` - Dev shell access
- `scripts/dev/start-dev.sh` - Start development
- `scripts/dev/stop-dev.sh` - Stop development
- `scripts/verify-production-deployment.sh` - Verify deployment
- `scripts/setup-git-hooks.sh` - Setup git hooks
- `scripts/setup_hourly_cron.sh` - Cron job setup
- `scripts/run_worker_local.sh` - Run worker locally

### job-finder-shared-types (Types Package)

**package.json scripts:** 6 scripts

- build, clean, prepublishOnly
- test, lint, prepare

**No Makefile** (simple TypeScript package)

---

## Duplication Analysis

### Makefiles

Total lines: **1,076 lines**
Duplicated targets (appear in 2+ repos): **~646 lines (~60%)**

**Common duplicated targets:**

```
install, dev, dev-stop, dev-status, dev-logs
build, clean, test, test-watch, test-coverage
lint, lint-fix, type-check
deploy-staging, deploy-prod
health-check, kill
```

### npm Scripts

Total scripts: **59 scripts**
Duplicated (appear in 2+ repos): **~35 scripts (~60%)**

**Common duplicated scripts:**

```
dev, build, lint, lint:fix, test, test:watch
clean, deploy:staging, deploy:production
```

### Shell Scripts

Total scripts: **~30 scripts**
Duplicated patterns: **~40%**

**Common patterns:**

- Environment validation
- Health checks
- Service startup/shutdown
- Data seeding/cleanup

---

## Proposed Architecture

### Phase 1: Extend app-monitor with Scripts Panel (NEW!)

Add a **Scripts Panel** to app-monitor UI to execute common tasks:

**Features:**

- Categorized script buttons (Build, Test, Quality, Database, Deployment)
- Real-time execution output in logs panel
- Script status indicators (running, success, failed)
- Quick actions (stop running script, view output)
- Keyboard shortcuts for common scripts

**Script Categories:**

```typescript
// app-monitor/backend/src/config.ts
export interface ScriptConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category:
    | "build"
    | "test"
    | "quality"
    | "database"
    | "deployment"
    | "utility";
  command: string;
  args: string[];
  cwd: string;
  requiresConfirmation?: boolean;
  dangerLevel?: "safe" | "warning" | "danger";
}

export const scripts: Record<string, ScriptConfig> = {
  // Frontend scripts
  "fe-build": {
    id: "fe-build",
    name: "fe-build",
    displayName: "Build Frontend",
    description: "Build production bundle for frontend",
    category: "build",
    command: "npm",
    args: ["run", "build"],
    cwd: path.join(ROOT_DIR, "job-finder-FE"),
  },
  "fe-test": {
    id: "fe-test",
    name: "fe-test",
    displayName: "Test Frontend",
    description: "Run frontend unit tests",
    category: "test",
    command: "npm",
    args: ["test"],
    cwd: path.join(ROOT_DIR, "job-finder-FE"),
  },
  "fe-lint": {
    id: "fe-lint",
    name: "fe-lint",
    displayName: "Lint Frontend",
    description: "Run ESLint on frontend code",
    category: "quality",
    command: "npm",
    args: ["run", "lint"],
    cwd: path.join(ROOT_DIR, "job-finder-FE"),
  },

  // Backend scripts
  "be-build": {
    id: "be-build",
    name: "be-build",
    displayName: "Build Backend",
    description: "Build Cloud Functions",
    category: "build",
    command: "npm",
    args: ["run", "build"],
    cwd: path.join(ROOT_DIR, "job-finder-BE"),
  },
  "be-test": {
    id: "be-test",
    name: "be-test",
    displayName: "Test Backend",
    description: "Run backend unit tests",
    category: "test",
    command: "npm",
    args: ["test"],
    cwd: path.join(ROOT_DIR, "job-finder-BE"),
  },

  // Worker scripts
  "worker-test": {
    id: "worker-test",
    name: "worker-test",
    displayName: "Test Worker",
    description: "Run worker unit tests",
    category: "test",
    command: "make",
    args: ["test"],
    cwd: path.join(ROOT_DIR, "job-finder-worker"),
  },
  "worker-lint": {
    id: "worker-lint",
    name: "worker-lint",
    displayName: "Lint Worker",
    description: "Run Black formatter check",
    category: "quality",
    command: "make",
    args: ["format-check"],
    cwd: path.join(ROOT_DIR, "job-finder-worker"),
  },

  // Database scripts
  "db-seed": {
    id: "db-seed",
    name: "db-seed",
    displayName: "Seed Database",
    description: "Seed emulator with test data",
    category: "database",
    command: "bash",
    args: ["scripts/emulator/seed-test-data.sh"],
    cwd: path.join(ROOT_DIR, "job-finder-BE"),
  },
  "db-clear": {
    id: "db-clear",
    name: "db-clear",
    displayName: "Clear Database",
    description: "Clear emulator data",
    category: "database",
    command: "bash",
    args: ["scripts/emulator/clear-data.sh"],
    cwd: path.join(ROOT_DIR, "job-finder-BE"),
    dangerLevel: "warning",
    requiresConfirmation: true,
  },

  // Deployment scripts (DANGER!)
  "deploy-staging": {
    id: "deploy-staging",
    name: "deploy-staging",
    displayName: "Deploy to Staging",
    description: "Deploy all services to staging",
    category: "deployment",
    command: "bash",
    args: ["../scripts/deploy-all-staging.sh"], // To be created
    cwd: path.join(ROOT_DIR, "app-monitor"),
    dangerLevel: "warning",
    requiresConfirmation: true,
  },
};
```

**UI Layout:**

```
┌─────────────────────────────────────────────────────┐
│  App Monitor                                         │
├─────────────────────────────────────────────────────┤
│  [Services] [Logs] [Scripts] ← NEW TAB             │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Build                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Build FE │ │ Build BE │ │Build All │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                      │
│  Test                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Test FE  │ │ Test BE  │ │Test Worker│           │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                      │
│  Quality                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Lint FE  │ │ Lint BE  │ │Lint Worker│           │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                      │
│  Database                                            │
│  ┌──────────┐ ┌──────────┐                          │
│  │ Seed DB  │ │ Clear DB │ ⚠️                      │
│  └──────────┘ └──────────┘                          │
│                                                      │
│  Running: ✓ Build FE (2/3 complete)                 │
│  ┌─────────────────────────────────────────┐        │
│  │ [LOG] Building production bundle...     │        │
│  │ [LOG] ✓ TypeScript compiled              │        │
│  │ [LOG] ✓ Vite build complete               │        │
│  │ [LOG] ⏳ Optimizing assets...              │        │
│  └─────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

### Phase 2: Deprecate Individual Makefiles

**Keep Makefiles for:**

1. **Backward compatibility** (developers used to `make dev`)
2. **CI/CD** (GitHub Actions use make targets)

**Transform Makefiles to:**

```makefile
# All targets become thin wrappers that call app-monitor

dev:
    @echo "⚠️  Use app-monitor instead: make -C ../app-monitor dev"
    @echo "   Or open: http://localhost:5174"
    @echo ""
    @echo "   Starting app-monitor for you..."
    @cd ../app-monitor && make dev

test:
    @echo "⚠️  Use app-monitor Scripts panel instead"
    @echo "   Running tests via app-monitor backend..."
    @curl -X POST http://localhost:5000/api/scripts/execute \
        -H "Content-Type: application/json" \
        -d '{"script_id": "fe-test"}'

# Legacy support - actually run the command
test-local:
    npm test
```

### Phase 3: Centralize Scripts in app-monitor

Move all reusable scripts to `app-monitor/scripts/`:

```
app-monitor/
├── scripts/
│   ├── build/
│   │   ├── build-all.sh
│   │   ├── build-frontend.sh
│   │   ├── build-backend.sh
│   │   └── build-worker.sh
│   ├── test/
│   │   ├── test-all.sh
│   │   ├── test-frontend.sh
│   │   ├── test-backend.sh
│   │   └── test-worker.sh
│   ├── quality/
│   │   ├── lint-all.sh
│   │   ├── format-all.sh
│   │   └── type-check-all.sh
│   ├── database/
│   │   ├── seed-emulator.sh
│   │   ├── clear-emulator.sh
│   │   └── backup-production.sh
│   ├── deployment/
│   │   ├── deploy-all-staging.sh
│   │   ├── deploy-all-production.sh
│   │   └── rollback-production.sh
│   └── utilities/
│       ├── health-check-all.sh
│       ├── kill-all-services.sh
│       └── validate-environment.sh
```

### Phase 4: Update CI/CD Workflows

**Keep GitHub Actions using Makefiles** (they work):

```yaml
# .github/workflows/ci.yml
- name: Run tests
  run: make test-local # New local target that actually runs tests
```

**Or migrate to direct commands:**

```yaml
- name: Run tests
  run: npm test
  working-directory: ./job-finder-FE
```

---

## Migration Plan

### Week 1: Foundation

**Tasks:**

1. ✅ Add Scripts panel to app-monitor frontend
2. ✅ Implement script execution backend API
3. ✅ Add script status tracking
4. ✅ Create initial script configurations

**Deliverables:**

- Scripts tab in UI
- POST /api/scripts/execute endpoint
- GET /api/scripts endpoint
- Socket.IO script status events

### Week 2: Script Migration

**Tasks:**

1. ✅ Move common scripts to `app-monitor/scripts/`
2. ✅ Create consolidated build/test/lint scripts
3. ✅ Add all repo scripts to config
4. ✅ Test script execution flow

**Deliverables:**

- `app-monitor/scripts/` directory populated
- All repos' scripts available in UI
- Documentation for adding new scripts

### Week 3: Makefile Transformation

**Tasks:**

1. ✅ Update FE Makefile to use app-monitor
2. ✅ Update BE Makefile to use app-monitor
3. ✅ Update Worker Makefile to use app-monitor
4. ✅ Add deprecation warnings
5. ✅ Maintain backward compatibility

**Deliverables:**

- All Makefiles point to app-monitor
- Deprecation notices added
- CI/CD still works

### Week 4: Documentation & Training

**Tasks:**

1. ✅ Update all repository READMEs
2. ✅ Create app-monitor user guide
3. ✅ Record demo video
4. ✅ Update onboarding docs

**Deliverables:**

- Updated README files
- Developer guide
- Demo video
- Migration guide

---

## Benefits

### For Developers

1. **Single Interface**: One UI for all dev operations
2. **No Terminal Juggling**: No more 5+ terminal windows
3. **Unified Logging**: All logs in one place with filtering
4. **Status Dashboard**: See what's running at a glance
5. **One-Click Operations**: Start/stop entire stack with one button
6. **Better Onboarding**: New developers get started in minutes

### For Codebase

1. **Eliminate Duplication**: Remove ~646 lines of duplicated Makefile code
2. **Single Source of Truth**: One place to manage all scripts
3. **Easier Maintenance**: Update script in one place, not 4
4. **Better Testing**: Scripts can be tested independently
5. **Cleaner Repos**: Less clutter in each repository

### For Operations

1. **Health Monitoring**: Built-in health checks for all services
2. **Cloud Logs**: View staging/production logs from same UI
3. **Deployment Safety**: Confirmation dialogs for dangerous operations
4. **Audit Trail**: Log all script executions
5. **Error Recovery**: Better error handling and recovery flows

---

## Risks & Mitigation

### Risk 1: Developers Don't Adopt app-monitor

**Mitigation:**

- Keep Makefiles working (backward compatibility)
- Add deprecation warnings that guide to app-monitor
- Make app-monitor obviously better (auto-start on repo open)
- Document migration path clearly

### Risk 2: CI/CD Breakage

**Mitigation:**

- Keep `make test-local` targets working
- Test all workflows before merging
- Gradual migration (don't remove old targets)

### Risk 3: Script Complexity

**Mitigation:**

- Start with simple scripts (build, test, lint)
- Add complex scripts gradually
- Maintain shell scripts for complex logic (don't rewrite in TypeScript)

### Risk 4: Performance

**Mitigation:**

- Execute scripts directly (not via API for CLI use)
- Use efficient process spawning
- Monitor resource usage

---

## Success Metrics

### Adoption

- [ ] 80%+ of developers use app-monitor daily
- [ ] < 5 Makefile direct invocations per day
- [ ] 0 "how do I start the dev server?" questions

### Code Health

- [ ] Eliminate 600+ lines of duplicated Makefile code
- [ ] Consolidate 30+ scripts into 10-15 reusable scripts
- [ ] Reduce script-related bugs by 50%

### Developer Experience

- [ ] Onboarding time reduced from 2 hours to 15 minutes
- [ ] Time to start full stack reduced from 5 minutes to 30 seconds
- [ ] 90%+ developer satisfaction with dev workflow

---

## Next Steps

1. **Review this plan** with team
2. **Get approval** for Phase 1 (Scripts Panel)
3. **Create issue** for APP-MONITOR-CONSOLIDATE-1
4. **Assign to Worker B** (frontend specialist)
5. **Start Week 1 tasks** immediately

---

## Related Issues

- `issues/app-monitor-consolidate-1-centralize-dev-scripts.md` (to be created)
- `issues/app-monitor-ui-1-multi-panel-logs.md` (existing)

---

## Appendix: Script Inventory

### Critical Scripts (Migrate First)

**Build:**

- `npm run build` (FE, BE, shared-types)
- `make build` (worker - runs Docker build)

**Test:**

- `npm test` (FE, BE, shared-types)
- `make test` (worker)
- `npm run test:e2e` (FE)

**Quality:**

- `npm run lint` (FE, BE, shared-types)
- `make lint` (worker)
- `npm run type-check` (FE, BE)
- `make type-check` (worker - runs mypy)

**Database:**

- `bash scripts/emulator/seed-test-data.sh` (BE)
- `bash scripts/emulator/clear-data.sh` (BE)
- `make db-setup-config` (worker)

### Nice-to-Have Scripts (Migrate Later)

**Docker:**

- `make docker-build` (worker)
- `make docker-up` (worker)
- `make docker-logs` (worker)

**Deployment:**

- `make deploy-staging` (all repos)
- `make deploy-prod` (all repos)

**Utilities:**

- `make clean` (all repos)
- `make health-check` (FE, BE)
- Environment validation scripts

---

**End of Plan**
