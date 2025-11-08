# APP-MONITOR-CONSOLIDATE-1 — Centralize All Dev Scripting in App Monitor

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P2 (Medium)
- **Labels**: priority-p2, type-developer-experience, app-monitor, cross-repository
- **Estimated Effort**: 2-3 days
- **Dependencies**: None (app-monitor already complete)
- **Related**: App Monitor project - enhancing local development workflow

## What This Issue Covers

Refactor all development scripts across repositories to eliminate duplication and manage everything exclusively through the app-monitor interface. Currently, dev scripts are scattered across multiple repos with significant duplication.

## Context

**Current State**:

- Each repo has its own package.json scripts (dev, build, test, lint, etc.)
- Bash scripts duplicated across repos
- Docker commands repeated in multiple places
- Firebase emulator commands scattered
- No single source of truth for dev operations
- **Result**: Duplication, inconsistency, hard to discover dev commands

**Problems**:

- Developers must remember different commands per repo
- Same operations implemented differently across repos
- Changes to dev workflow require updates in multiple places
- Hard to onboard new developers (where are the scripts?)
- App Monitor only manages processes, not all dev tasks

**Vision**:

- App Monitor becomes the **single interface** for ALL local development
- Eliminate script duplication across repos
- Consistent dev experience regardless of which repo you're working in
- All common dev tasks accessible from app-monitor UI
- Individual repos only keep repo-specific scripts

## Tasks

### 1. Audit Current Dev Scripts

- [ ] Catalog all package.json scripts across all repos
- [ ] Identify bash scripts in each repo
- [ ] Document Docker/Docker Compose commands
- [ ] List Firebase emulator commands
- [ ] Identify duplicated functionality
- [ ] Categorize: common vs repo-specific

### 2. Design Centralized Script Architecture

- [ ] Define which scripts stay in repos (repo-specific)
- [ ] Define which scripts move to app-monitor (common)
- [ ] Design app-monitor command interface
- [ ] Plan backward compatibility (if needed)
- [ ] Document script organization strategy

### 3. Implement Centralized Scripts in App Monitor

- [ ] Create scripts/ directory in app-monitor
- [ ] Implement common build operations
- [ ] Implement common test operations
- [ ] Implement common lint/format operations
- [ ] Implement deployment helpers
- [ ] Implement database/Firestore helpers

### 4. Add App Monitor UI for Script Execution

- [ ] Add "Scripts" panel to app-monitor UI
- [ ] Button interface for common operations
- [ ] Output/logs for script execution
- [ ] Error handling and feedback
- [ ] Script history/favorites

### 5. Remove Duplicated Scripts from Repos

- [ ] Remove duplicated scripts from FE
- [ ] Remove duplicated scripts from BE
- [ ] Remove duplicated scripts from Worker
- [ ] Keep only repo-specific scripts
- [ ] Update README files with new workflow

### 6. Update Documentation

- [ ] Document centralized script architecture
- [ ] Update onboarding guide
- [ ] Create script reference guide
- [ ] Document how to add new scripts
- [ ] Update README files to reference app-monitor

### 7. Migration & Testing

- [ ] Test all migrated scripts work correctly
- [ ] Verify backward compatibility (if needed)
- [ ] Update CI/CD if affected
- [ ] Update team workflow documentation
- [ ] Announce changes to team

## Current Script Duplication Analysis

### Frontend (job-finder-FE/package.json)

```json
{
  "scripts": {
    "dev": "vite", // ✅ Keep (FE-specific)
    "build": "tsc && vite build", // ✅ Keep (FE-specific)
    "preview": "vite preview", // ✅ Keep (FE-specific)
    "lint": "eslint .", // ❌ Common pattern
    "lint:fix": "eslint . --fix", // ❌ Common pattern
    "format": "prettier --write .", // ❌ Common pattern
    "format:check": "prettier --check .", // ❌ Common pattern
    "test": "vitest", // ❌ Common pattern
    "test:ui": "vitest --ui", // ❌ Common pattern
    "test:coverage": "vitest --coverage", // ❌ Common pattern
    "test:e2e": "playwright test", // ✅ Keep (FE-specific)
    "type-check": "tsc --noEmit" // ❌ Common pattern
  }
}
```

### Backend (job-finder-BE/functions/package.json)

```json
{
  "scripts": {
    "lint": "eslint .", // ❌ DUPLICATE
    "lint:fix": "eslint . --fix", // ❌ DUPLICATE
    "format": "prettier --write .", // ❌ DUPLICATE
    "format:check": "prettier --check .", // ❌ DUPLICATE
    "build": "tsc", // ✅ Keep (BE-specific)
    "serve": "npm run build && firebase emulators:start", // ❌ Could centralize
    "shell": "npm run build && firebase functions:shell",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log"
  }
}
```

### Worker (job-finder-worker)

```bash
# Various bash scripts and make commands
docker compose up              # ❌ Common pattern
docker compose down            # ❌ Common pattern
pytest                         # ❌ Common pattern
black src/                     # ❌ Common pattern (format)
```

### Identified Duplication

1. **Linting**: ESLint commands duplicated (FE, BE)
2. **Formatting**: Prettier commands duplicated (FE, BE)
3. **Testing**: Test runner commands duplicated
4. **Type checking**: TypeScript check duplicated
5. **Docker**: Docker Compose commands scattered
6. **Build**: Similar patterns across repos

## Proposed Centralized Architecture

### app-monitor/scripts/ Structure

```
app-monitor/
├── scripts/
│   ├── common/
│   │   ├── lint.sh              # Lint any repo
│   │   ├── format.sh            # Format any repo
│   │   ├── test.sh              # Run tests for any repo
│   │   ├── build.sh             # Build any repo
│   │   └── type-check.sh        # Type check TypeScript repos
│   ├── database/
│   │   ├── start-emulators.sh   # Start Firebase emulators
│   │   ├── seed-data.sh         # Seed test data
│   │   ├── backup.sh            # Backup Firestore
│   │   └── restore.sh           # Restore Firestore
│   ├── docker/
│   │   ├── start.sh             # Start Docker services
│   │   ├── stop.sh              # Stop Docker services
│   │   ├── rebuild.sh           # Rebuild containers
│   │   └── logs.sh              # View container logs
│   ├── deployment/
│   │   ├── deploy-staging.sh    # Deploy to staging
│   │   ├── deploy-prod.sh       # Deploy to production
│   │   └── rollback.sh          # Rollback deployment
│   └── utils/
│       ├── clean.sh             # Clean build artifacts
│       ├── install.sh           # Install all dependencies
│       └── update.sh            # Update all dependencies
└── backend/
    └── src/
        └── services/
            └── scriptRunner.ts   # Service to execute scripts
```

### Script Execution Examples

```bash
# From app-monitor UI or CLI
app-monitor run lint frontend
app-monitor run test backend
app-monitor run format worker
app-monitor run build all
app-monitor run deploy staging
```

### Intelligent Script Router

```typescript
// app-monitor/backend/src/services/scriptRunner.ts
export class ScriptRunner {
  async runScript(script: string, target: string, options: any) {
    // Route to appropriate script based on target
    const repoPath = this.getRepoPath(target);
    const scriptPath = this.resolveScript(script);

    // Execute with proper context
    const result = await this.execute(scriptPath, {
      cwd: repoPath,
      env: this.getEnv(target),
      ...options,
    });

    return result;
  }

  private resolveScript(script: string): string {
    // Map common operations to centralized scripts
    const scriptMap = {
      lint: "scripts/common/lint.sh",
      format: "scripts/common/format.sh",
      test: "scripts/common/test.sh",
      build: "scripts/common/build.sh",
      // ...
    };

    return scriptMap[script] || script;
  }
}
```

### App Monitor UI Enhancement

```typescript
// New "Scripts" panel in app-monitor UI
interface ScriptsPanel {
  categories: {
    Common: [
      { name: "Lint All"; command: "lint"; target: "all" },
      { name: "Format All"; command: "format"; target: "all" },
      { name: "Test All"; command: "test"; target: "all" },
      { name: "Build All"; command: "build"; target: "all" },
    ];
    Database: [
      { name: "Start Emulators"; command: "start-emulators" },
      { name: "Seed Data"; command: "seed-data" },
    ];
    Docker: [
      { name: "Start Worker"; command: "docker/start"; target: "worker" },
      { name: "View Logs"; command: "docker/logs"; target: "worker" },
    ];
    "Per-Repo": [
      { name: "Lint FE"; command: "lint"; target: "frontend" },
      { name: "Test BE"; command: "test"; target: "backend" },
      { name: "Build Worker"; command: "build"; target: "worker" },
    ];
  };
}
```

## Acceptance Criteria

- [ ] All common scripts centralized in app-monitor
- [ ] Script duplication eliminated across repos
- [ ] App Monitor UI has Scripts panel
- [ ] All common dev operations accessible from UI
- [ ] Individual repos only keep repo-specific scripts
- [ ] Documentation updated with new workflow
- [ ] Team trained on new approach
- [ ] Backward compatibility maintained (if needed)

## Implementation Strategy

### Phase 1: Analysis & Design (0.5 days)

- Audit all existing scripts
- Identify duplication patterns
- Design centralized architecture
- Get team feedback on approach

### Phase 2: Core Scripts Infrastructure (1 day)

- Create scripts/ directory structure
- Implement common script utilities
- Add scriptRunner service to backend
- Create script execution infrastructure

### Phase 3: Script Migration (0.5 days)

- Implement centralized scripts
- Test each script works correctly
- Remove duplicates from repos
- Update repo README files

### Phase 4: UI Enhancement (0.5 days)

- Add Scripts panel to app-monitor UI
- Implement script execution from UI
- Add output/logs display
- Add error handling

### Phase 5: Documentation & Rollout (0.5 days)

- Document new architecture
- Update onboarding guide
- Announce changes to team
- Training/walkthrough session

## Benefits

- **Single Source of Truth**: All dev operations in one place
- **No Duplication**: Common scripts written once
- **Better DX**: Easy to discover and use dev commands
- **Consistency**: Same operations work the same way everywhere
- **Easier Onboarding**: New devs only learn app-monitor
- **Maintainability**: Changes in one place, not three

## Migration Strategy

### Backward Compatibility (Optional)

If we want to maintain backward compatibility temporarily:

```json
// Individual repo package.json
{
  "scripts": {
    // Proxy to app-monitor scripts
    "lint": "node ../app-monitor/scripts/common/lint.sh",
    "format": "node ../app-monitor/scripts/common/format.sh",
    "test": "node ../app-monitor/scripts/common/test.sh"
  }
}
```

Or we can do a clean break and update documentation.

### Phased Rollout

1. **Week 1**: Implement infrastructure, migrate common scripts
2. **Week 2**: Add UI panel, remove duplicates from repos
3. **Week 3**: Team training, documentation updates
4. **Ongoing**: Monitor adoption, iterate based on feedback

## Examples of Centralized Scripts

### scripts/common/lint.sh

```bash
#!/bin/bash
# Lint any repository intelligently

REPO_PATH=$1

# Detect repo type and run appropriate linter
if [ -f "$REPO_PATH/package.json" ]; then
  cd "$REPO_PATH"
  npm run lint
elif [ -f "$REPO_PATH/pyproject.toml" ]; then
  cd "$REPO_PATH"
  black --check src/
  flake8 src/
else
  echo "Unknown repo type"
  exit 1
fi
```

### scripts/common/format.sh

```bash
#!/bin/bash
# Format any repository

REPO_PATH=$1
FIX=${2:-false}

if [ -f "$REPO_PATH/package.json" ]; then
  cd "$REPO_PATH"
  if [ "$FIX" = "true" ]; then
    npm run format
  else
    npm run format:check
  fi
elif [ -f "$REPO_PATH/pyproject.toml" ]; then
  cd "$REPO_PATH"
  black src/
fi
```

### scripts/database/start-emulators.sh

```bash
#!/bin/bash
# Start Firebase emulators with proper configuration

cd job-finder-BE/functions
firebase emulators:start \
  --only firestore,auth,functions \
  --import=./emulator-data \
  --export-on-exit=./emulator-data
```

## Related Issues

- APP-MONITOR-1 through 6 (foundation complete)
- APP-MONITOR-FIX-6 (workspace scripts - this supersedes)
- All workflow issues (could streamline with centralized scripts)

## Future Enhancements

- **Script Templates**: Easy to add new scripts
- **Custom Scripts**: Users can add their own
- **Script Scheduling**: Run scripts on schedule
- **Script Chains**: Combine multiple scripts
- **Script Favorites**: Pin frequently used scripts
- **Keyboard Shortcuts**: Quick access to common scripts

## Notes

- This is a **quality of life improvement**, not critical
- Focus on developer experience
- Keep it simple - don't over-engineer
- Get team feedback early
- Iterate based on usage
- Document everything clearly
- **Priority**: P2 (do after critical production issues resolved)
