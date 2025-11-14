# GitHub Copilot Instructions for App Monitor

## Project Overview

App Monitor is a developer monitoring and automation tool for the job-finder-app-manager ecosystem. This is a monorepo with TypeScript backend (Express + Socket.IO), React frontend (Vite + TypeScript), and autonomous dev-bots.

**Current Phase:** Pre-POC Stabilization (v0.2.0)

## Architecture & Structure

### Monorepo Workspaces
- `backend/` - Express + TypeScript API (port 5000)
- `frontend/` - React + TypeScript UI (port 5174)
- `shared/api-contracts/` - Shared TypeScript types and API contracts
- `dev-bots/` - Autonomous development agents (Docker-based)

### Key Principles

1. **API Contracts are Source of Truth**
   - ALL request/response types MUST be defined in `shared/api-contracts/index.ts`
   - Backend routes import and use `ApiSuccess<T>` and `ApiError` wrappers
   - Frontend services unwrap these contracts before returning data
   - Never duplicate types - always import from shared contracts

2. **Port Assignments (FIXED - DO NOT CHANGE)**
   - Development: Backend 5000, Frontend 5174
   - Production: Backend 5001/5002 (blue-green), Frontend 80 (nginx)
   - Fail fast on port conflicts - no automatic cleanup

3. **Environment Separation**
   - Development: `/home/jdubz/Development/app-monitor` (this directory)
   - Production: `/opt/app-monitor` (NEVER touch manually - CI/CD only)
   - Use `staging` or feature branches for dev work
   - NEVER commit directly to `main`

## Code Style & Conventions

### TypeScript
- Strict mode enabled
- Functional programming patterns preferred
- Use ESM imports (`import/export`, not `require`)
- No `any` types - use proper typing or `unknown`
- Prefer `interface` for object shapes, `type` for unions/intersections

### Backend Patterns
- Services in `backend/src/services/` handle business logic
- Routes in `backend/src/routes/` are thin wrappers
- Use structured logging via `logger.info/warn/error` with category/action/details
- All database access through `backend/src/services/database.ts`
- Process management via `ProcessManager` service

### Frontend Patterns
- Components in `frontend/src/components/`
- Custom hooks in `frontend/src/hooks/`
- API calls centralized in `frontend/src/services/api.ts`
- Use Radix UI primitives for accessible components
- Tailwind CSS for styling (no inline styles)

### Error Handling
- Backend: Wrap endpoints with try/catch, return `ApiError` on failure
- Frontend: Use error boundaries for component errors
- Log structured errors with context: `{ category, action, message, details }`

### Testing
- Unit tests: Vitest (`.test.ts` files next to source)
- E2E tests: Playwright (`frontend/e2e/`)
- Integration tests: Vitest with real service instances
- Use safe test runner: `node safe-test-runner.cjs` (prevents resource leaks)
- Test coverage target: >80%

## Git Workflow

### Branch Strategy
- `main` - Production (auto-deploys to `/opt/app-monitor`)
- `staging` - Integration testing
- Feature branches: `feature/description` or `fix/description`

### Commit Conventions
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- Keep commits atomic and focused
- Reference issues/tasks in commit messages

### Automated Quality Checks
- **Pre-commit**: ESLint on staged files (Husky)
- **Pre-push**: All unit tests must pass (Husky)
- **CI/CD**: Linting + tests on PRs to `main` (GitHub Actions)

### Scripts to Know
```bash
npm run dev              # Both backend + frontend
npm run dev:backend      # Backend only
npm run dev:frontend     # Frontend only
npm test                 # All tests
npm run lint             # Lint all workspaces
npm run lint:fix         # Auto-fix linting issues
npm run build            # Build all workspaces
```

## Common Tasks

### Adding a New API Endpoint
1. Define types in `shared/api-contracts/index.ts`
2. Create/update route in `backend/src/routes/`
3. Implement business logic in `backend/src/services/`
4. Add API call to `frontend/src/services/api.ts`
5. Use in components via hooks or direct calls
6. Write tests for backend route and frontend integration

### Adding a New Service
1. Create service file in `backend/src/services/serviceName.ts`
2. Export instance and types
3. Import in `backend/src/server.ts` if needs initialization
4. Add configuration to `backend/src/config.ts` if needed
5. Write unit tests in `backend/src/services/serviceName.test.ts`

### Adding a New Frontend Component
1. Create in `frontend/src/components/ComponentName.tsx`
2. Use Radix UI primitives where possible
3. Style with Tailwind utility classes
4. Extract reusable logic to custom hooks in `frontend/src/hooks/`
5. Write component tests in `frontend/src/components/ComponentName.test.tsx`

### Working with Dev-Bots
- Dev-bots run in ephemeral Docker containers
- Workspace mounted via `tar | docker cp` pattern
- Zero filesystem artifacts - automatic cleanup
- Credentials mounted from host `.env` files
- Safety: Detects uncommitted changes, creates patch files
- Config: `dev-bots-tasks.json` for task definitions

## Security & Safety

- **Never commit secrets** - use `.env` files (gitignored)
- **Detect uncommitted changes** before bot execution
- **Fail fast** on port conflicts or missing dependencies
- **Process cleanup** - use `ProcessManager` for child processes
- **Single instance** enforcement via `ensureSingleInstance()`

## Performance Considerations

- WebSocket for real-time updates (not polling)
- Virtual scrolling for large log lists (`@tanstack/react-virtual`)
- Log rotation and size limits
- Database indexes on frequently queried columns
- Debounce user inputs (search, filters)

## Documentation (START HERE for Context)

**📖 The `docs/` folder is your primary guide** - 47 markdown files covering architecture, plans, and guides.

### Essential Reading
- **`docs/README.md`** - Complete documentation index and navigation
- **`docs/architecture/master-design-intent.md`** - THE single source of truth for architecture
- **`docs/architecture/README.md`** - System design overview
- **`docs/plans/APP_MONITOR_STABILIZATION_PLAN.md`** - Current phase priorities
- **`docs/setup/README.md`** - Complete setup and configuration guide

### Documentation Structure
```
docs/
├── README.md                    # Start here - complete navigation
├── architecture/                # System architecture & design
│   ├── master-design-intent.md  # Master design document (source of truth)
│   ├── dev-bots-overview.md     # Dev-bots architecture
│   └── system-overview.md       # Component relationships
├── plans/                       # Strategic planning & roadmap
│   ├── APP_MONITOR_STABILIZATION_PLAN.md
│   ├── PRIORITIZED_FEATURE_ROADMAP.md
│   └── BOT_PROMPT_ENGINEERING_V3.md
├── technicalDesigns/            # Implementation designs
│   ├── staged-task-queue.md
│   ├── error-detection-and-recovery-design.md
│   └── dev-bot-foundational-upgrades.md
├── guides/                      # How-to guides & references
│   ├── MIGRATION_GUIDE.md
│   ├── PRODUCTION_DEPLOYMENT.md
│   ├── api-reference.md
│   └── task-examples.md
├── setup/                       # Installation & configuration
│   ├── ENVIRONMENT_SETUP.md
│   ├── PRODUCTION_SETUP_QUICKSTART.md
│   └── CI_CD_SETUP.md
├── analysis/                    # Analysis reports & investigations
└── archive/                     # Historical documentation
```

### Quick Reference by Task
- **Understanding the system?** → `docs/architecture/master-design-intent.md`
- **What to work on?** → `docs/plans/PRIORITIZED_FEATURE_ROADMAP.md`
- **Setting up?** → `docs/setup/README.md`
- **Dev-bots questions?** → `docs/architecture/dev-bots-overview.md`
- **API endpoints?** → `docs/guides/api-reference.md`
- **Deployment?** → `docs/guides/PRODUCTION_DEPLOYMENT.md`

**Always check relevant docs before making architectural changes!**

## What NOT to Do

❌ Change production files in `/opt/app-monitor` directly  
❌ Commit directly to `main` branch  
❌ Duplicate API types instead of using shared contracts  
❌ Use polling when WebSocket is available  
❌ Add new dependencies without updating package.json  
❌ Skip tests or bypass git hooks (except emergencies)  
❌ Use inline styles instead of Tailwind classes  
❌ Leave TODO comments without creating tracked issues  

## Current Focus Areas (Stabilization Phase)

1. **Backend Test Suite** - Fix hanging ProcessManager tests
2. **Work-Target Registry** - SQLite schema for metadata tracking
3. **Prompt Engineering v3** - Task template validation to prevent scope creep
4. **Quality Metrics** - Establish baselines for bot execution monitoring

See `docs/plans/APP_MONITOR_STABILIZATION_PLAN.md` for complete details.

## Questions or Issues?

- Check `docs/` directory first
- Review `CONTRIBUTING.md` for development guidelines
- See `TROUBLESHOOTING_REPORT.md` for common issues
- Refer to `README.md` for quick reference
