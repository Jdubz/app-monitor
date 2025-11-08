# APP-MONITOR-FIX-3 — Add Git Hooks with Husky (OPTIONAL)

- **Status**: To Do
- **Owner**: Worker B (or PM)
- **Priority**: P3 (Low - Optional for Local Tool)
- **Labels**: priority-p3, app-monitor, type-feature, tooling, optional
- **Estimated Effort**: 1 hour
- **Dependencies**: APP-MONITOR-FIX-1 (ESLint must work), APP-MONITOR-FIX-4 (Prettier recommended)
- **Related**: APP-MONITOR-SETUP Part 3 (partially addresses)

## Important Context

⚠️ **App Monitor is a LOCAL DEVELOPMENT TOOL ONLY** - It will never be deployed. Git hooks are **not necessary** for a local-only tool but can help if multiple developers maintain it.

## What This Issue Covers

Add Husky git hooks to run quality checks before commits and pushes. This is **completely optional** for a local dev tool that won't be deployed.

## Context

**Current State**: No local quality gates

- No `.husky/` directory
- No pre-commit hook
- No pre-push hook
- Can commit broken code
- Can push TypeScript errors

**Problem**: Developers can accidentally:

- Commit code with lint violations
- Commit code with type errors
- Commit unformatted code (when Prettier added)
- Push broken code that fails CI

**Solution**: Git hooks that:

- Pre-commit: Run linting + formatting on staged files
- Pre-push: Run type checking + builds

## Tasks

### 1. Install and Initialize Husky

- [ ] Install Husky as devDependency in root
- [ ] Run `npx husky install`
- [ ] Add prepare script to root package.json
- [ ] Create `.husky/` directory

### 2. Install lint-staged

- [ ] Install lint-staged as devDependency
- [ ] Configure for both backend and frontend
- [ ] Define file patterns and commands

### 3. Create Pre-Commit Hook

- [ ] Create `.husky/pre-commit` file
- [ ] Run lint-staged on staged files
- [ ] Backend: ESLint on \*.ts files
- [ ] Frontend: ESLint on _.ts, _.tsx files
- [ ] Format with Prettier (when added)

### 4. Create Pre-Push Hook

- [ ] Create `.husky/pre-push` file
- [ ] Run TypeScript type-check in both directories
- [ ] Optional: Run builds to verify compilation

### 5. Test Hooks

- [ ] Test pre-commit catches lint errors
- [ ] Test pre-commit catches format issues
- [ ] Test pre-push catches type errors
- [ ] Verify hooks can be bypassed if needed

## Proposed Implementation

### Step 1: Create Root Package.json

Since app-monitor doesn't have a root package.json, create one:

```json
{
  "name": "app-monitor-root",
  "private": true,
  "scripts": {
    "prepare": "husky install"
  },
  "devDependencies": {
    "husky": "^8.0.3",
    "lint-staged": "^15.2.0"
  },
  "lint-staged": {
    "app-monitor/backend/**/*.ts": [
      "cd app-monitor/backend && npm run lint:fix",
      "cd app-monitor/backend && npm run format"
    ],
    "app-monitor/frontend/**/*.{ts,tsx}": [
      "cd app-monitor/frontend && npm run lint:fix",
      "cd app-monitor/frontend && npm run format"
    ]
  }
}
```

### Step 2: Pre-Commit Hook

#### .husky/pre-commit

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run lint-staged on all staged files
npx lint-staged
```

### Step 3: Pre-Push Hook

#### .husky/pre-push

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "Running type checks..."

# Backend type check
echo "Checking backend types..."
cd app-monitor/backend && npm run type-check || exit 1

# Frontend type check
echo "Checking frontend types..."
cd app-monitor/frontend && npm run type-check || exit 1

echo "✅ All type checks passed!"
```

## Installation Steps

```bash
# 1. Create root package.json in app-monitor/
cd app-monitor
cat > package.json << 'EOF'
{
  "name": "app-monitor-root",
  "private": true,
  "scripts": {
    "prepare": "husky install"
  },
  "devDependencies": {
    "husky": "^8.0.3",
    "lint-staged": "^15.2.0"
  },
  "lint-staged": {
    "backend/**/*.ts": [
      "cd backend && npm run lint:fix"
    ],
    "frontend/**/*.{ts,tsx}": [
      "cd frontend && npm run lint:fix"
    ]
  }
}
EOF

# 2. Install dependencies
npm install

# 3. Initialize Husky
npx husky install

# 4. Create pre-commit hook
npx husky add .husky/pre-commit "npx lint-staged"

# 5. Create pre-push hook
npx husky add .husky/pre-push "cd app-monitor/backend && npm run type-check && cd ../frontend && npm run type-check"
```

## Acceptance Criteria

- [ ] `.husky/` directory exists in app-monitor/
- [ ] `pre-commit` hook exists and is executable
- [ ] `pre-push` hook exists and is executable
- [ ] Pre-commit runs lint-staged on staged files only
- [ ] Pre-commit catches lint errors and blocks commit
- [ ] Pre-push runs type-check on both backend and frontend
- [ ] Pre-push catches type errors and blocks push
- [ ] Hooks can be bypassed with `--no-verify` if needed
- [ ] `npm run prepare` installs hooks automatically

## Benefits

- **Local quality gates**: Catch issues before commit
- **Fast feedback**: Fix issues immediately
- **Reduced CI failures**: Most issues caught locally
- **Consistent code**: All commits pass linting
- **Type safety**: Prevent pushing broken types
- **Developer experience**: Clear errors before commit

## Testing Plan

1. Setup Husky as described above
2. Test pre-commit hook:
   - Add intentional lint error to backend file
   - Stage file: `git add app-monitor/backend/src/test.ts`
   - Try to commit: `git commit -m "Test"`
   - Verify commit is blocked
   - Fix error, verify commit succeeds
3. Test pre-push hook:
   - Add type error to frontend
   - Commit the change
   - Try to push
   - Verify push is blocked
   - Fix error, verify push succeeds
4. Test bypass:
   - Verify `git commit --no-verify` skips hooks
   - Verify `git push --no-verify` skips hooks

## Notes

- Hooks run locally only (not in CI)
- lint-staged only runs on staged files (fast)
- Type-check runs on all files (slower but thorough)
- Hooks complement CI, don't replace it
- Can be bypassed in emergencies with `--no-verify`

## Alternative: Simple Hooks Without lint-staged

If lint-staged is too complex, use simpler hooks:

#### .husky/pre-commit (simple version)

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "Running linters..."
cd app-monitor/backend && npm run lint || exit 1
cd ../frontend && npm run lint || exit 1
echo "✅ Linting passed!"
```

**Tradeoff**: Runs on all files (slower) but simpler setup.

## Related Issues

- APP-MONITOR-FIX-1: Backend ESLint (prerequisite)
- APP-MONITOR-FIX-2: CI/CD workflow (complementary)
- APP-MONITOR-FIX-4: Prettier (enhances pre-commit)
- APP-MONITOR-FIX-6: Root workspace scripts (could combine)
