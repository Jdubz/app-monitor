# APP-MONITOR-FIX-4 — Add Prettier and Formatting (OPTIONAL)

- **Status**: To Do
- **Owner**: Worker B (or PM)
- **Priority**: P3 (Low - Optional for Local Tool)
- **Labels**: priority-p3, app-monitor, type-feature, tooling, optional
- **Estimated Effort**: 30 minutes
- **Dependencies**: None
- **Related**: APP-MONITOR-SETUP Part 1.4 & 2.2

## Important Context

⚠️ **App Monitor is a LOCAL DEVELOPMENT TOOL ONLY** - It will never be deployed. Code formatting is nice to have but not critical for a local-only tool.

## What This Issue Covers

Add Prettier for consistent code formatting across backend and frontend. This is **optional** for a local dev tool.

## Context

**Missing**:

- No `.prettierrc` files
- No format scripts
- No formatting in git hooks
- No formatting in CI

**Result**: Inconsistent code style

## Tasks

### Backend

- [ ] Create `.prettierrc` in backend/
- [ ] Create `.prettierignore` in backend/
- [ ] Add format scripts to package.json
- [ ] Install prettier as devDependency

### Frontend

- [ ] Create `.prettierrc` in frontend/
- [ ] Create `.prettierignore` in frontend/
- [ ] Add format scripts to package.json
- [ ] Install prettier as devDependency

### Test

- [ ] Run `npm run format:check` - should pass
- [ ] Run `npm run format` - should format files
- [ ] Verify consistency

## Proposed Configuration

### backend/.prettierrc & frontend/.prettierrc

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

### backend/.prettierignore & frontend/.prettierignore

```
node_modules/
dist/
build/
coverage/
*.min.js
```

### package.json Scripts (Both)

```json
{
  "scripts": {
    "format": "prettier --write \"src/**/*.{ts,tsx}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx}\""
  }
}
```

## Acceptance Criteria

- [ ] `.prettierrc` exists in both backend and frontend
- [ ] `.prettierignore` exists in both
- [ ] `npm run format` formats code
- [ ] `npm run format:check` validates formatting
- [ ] All existing code passes format check
- [ ] Configs are consistent between backend/frontend

## Benefits

- Consistent code style
- No style debates
- Auto-formatting on save (VS Code)
- Cleaner git diffs

## Related Issues

- APP-MONITOR-FIX-3: Git hooks (can add format to pre-commit)
- APP-MONITOR-FIX-2: CI/CD (can add format check)
