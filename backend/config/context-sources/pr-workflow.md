# PR Workflow & Git Guidelines

## Purpose
Git workflow, branch management, PR creation, and commit practices for dev-bots.

## When to Read
Read BEFORE making any commits or creating pull requests.

## Git Workflow

### Branch Strategy

**Production Branches:**
- `main` - Production (auto-deploys to `/opt/app-monitor`)
- `staging` - Integration testing

**Development Branches:**
- `feature/description` - New features
- `fix/bug-description` - Bug fixes
- `refactor/component-name` - Code improvements
- `docs/topic` - Documentation updates

### Branch Naming Rules
```bash
# ✅ GOOD: Clear, descriptive names
feature/context-bundle-generation
fix/null-pointer-in-task-service
refactor/extract-validation-logic
docs/update-api-reference

# ❌ BAD: Vague or temporary names
feature/new-stuff
fix/bug
temp-branch
WIP-testing
```

## Commit Practices

### Conventional Commits (REQUIRED)
```bash
# Format: <type>: <description>

# Types:
feat:     # New feature
fix:      # Bug fix
docs:     # Documentation only
refactor: # Code restructuring (no behavior change)
test:     # Adding or fixing tests
chore:    # Maintenance tasks (deps, config)
perf:     # Performance improvements
style:    # Code formatting (no logic change)
ci:       # CI/CD configuration

# Examples:
git commit -m "feat: add context bundle generation system"
git commit -m "fix: resolve race condition in task queue"
git commit -m "docs: update context management architecture"
git commit -m "refactor: extract task validation to service"
git commit -m "test: add integration tests for PR workflow"
```

### Commit Message Guidelines
```bash
# ✅ GOOD: Clear, specific, imperative mood
feat: add loading spinner to submit button
fix: prevent null pointer when user is undefined
docs: update API documentation for task creation
refactor: extract validation logic to separate service

# ❌ BAD: Vague, past tense, too long
feat: added some stuff
fix: fixed bug
docs: updated documentation and also changed some code
WIP: working on feature
```

### Atomic Commits
**Each commit should:**
- ✅ Represent a single logical change
- ✅ Build and pass tests independently
- ✅ Be revertible without breaking dependencies
- ❌ NOT mix multiple unrelated changes
- ❌ NOT include "WIP" or incomplete work

```bash
# ✅ GOOD: Atomic commits
git commit -m "feat: add context recipe validation"
git commit -m "feat: implement context cache with LRU eviction"
git commit -m "test: add unit tests for context validator"

# ❌ BAD: Mixed concerns
git commit -m "feat: add validation, fix bugs, update tests, refactor code"
```

## Pull Request Workflow

### Creating PRs (Dev-Bot Specific)

**1. Create Feature Branch**
```bash
git checkout -b feature/task-description
```

**2. Make Changes & Commit**
```bash
# Make surgical changes only
git add targetFile1.ts targetFile2.ts
git commit -m "feat: implement feature as specified"
```

**3. Push to Remote**
```bash
git push origin feature/task-description
```

**4. Create PR via GitHub CLI**
```bash
gh pr create \
  --title "feat: Brief description" \
  --body "$(cat pr-description.md)" \
  --base main \
  --head feature/task-description
```

### PR Title Format
```bash
# Format: <type>: <Brief description>

# ✅ GOOD:
feat: Add context bundle generation system
fix: Resolve null pointer in task service
docs: Update context management architecture
refactor: Extract task validation logic

# ❌ BAD:
Add feature
Fix bug
Updates
WIP - testing
```

### PR Description Template
```markdown
## Summary
Brief description of what this PR does (1-2 sentences).

## Changes
- Specific change 1
- Specific change 2
- Specific change 3

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Related
- Closes #123 (if applicable)
- Related to #456 (if applicable)

## Screenshots (if UI changes)
[Attach screenshots if relevant]
```

### PR Quality Gates
**Before creating PR, verify:**
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] No console errors or warnings
- [ ] Only modified files in scope
- [ ] No unrelated changes included
- [ ] Commit messages follow conventions
- [ ] PR description is complete

### Auto-Merge Conditions
PR will be auto-merged when ALL conditions met:
1. ✅ All CI checks pass (lint, build, tests)
2. ✅ At least 1 approval from code owner
3. ✅ No merge conflicts
4. ✅ Branch is up-to-date with base
5. ✅ No changes requested by reviewers
6. ✅ All conversations resolved

### PR Lifecycle

**States:**
- `draft` - Work in progress, not ready for review
- `open` - Ready for review
- `review_requested` - Awaiting reviewer feedback
- `changes_requested` - Requires updates
- `approved` - Passed review, waiting for conditions
- `merged` - Integrated into base branch
- `closed` - Not merged (abandoned or superseded)

**Transitions:**
```
draft → open → review_requested → approved → merged
          ↓           ↓               ↓
       closed    changes_requested ←─┘
```

## Git Best Practices

### DO
✅ Create feature branch from latest `main`
✅ Keep commits small and focused
✅ Write clear commit messages
✅ Push frequently to avoid losing work
✅ Rebase on main before creating PR (if needed)
✅ Respond to review comments promptly
✅ Update PR description if scope changes

### DON'T
❌ Commit directly to `main` or `staging`
❌ Force push to shared branches
❌ Include unrelated changes in PR
❌ Push broken code (tests must pass)
❌ Ignore review feedback
❌ Merge conflicts without resolution
❌ Create PRs with 100+ file changes

## Common Scenarios

### Updating PR After Review
```bash
# Make requested changes
git add file.ts
git commit -m "fix: address review feedback"
git push origin feature/branch-name

# PR updates automatically
```

### Resolving Merge Conflicts
```bash
# Update local main
git checkout main
git pull origin main

# Rebase feature branch
git checkout feature/branch-name
git rebase main

# Resolve conflicts
# ... edit conflicted files ...
git add resolved-file.ts
git rebase --continue

# Force push (feature branch only!)
git push --force-with-lease origin feature/branch-name
```

### Abandoning PR
```bash
# Close PR without merging
gh pr close <pr-number>

# Delete local branch
git checkout main
git branch -D feature/branch-name

# Delete remote branch
git push origin --delete feature/branch-name
```

## Error Handling

### If Push Fails
```bash
# Error: Updates were rejected
# Solution: Pull and rebase
git pull --rebase origin feature/branch-name
git push origin feature/branch-name
```

### If CI Checks Fail
```bash
# 1. Check CI logs for errors
gh pr checks <pr-number>

# 2. Fix issues locally
npm run lint:fix
npm test

# 3. Commit and push fix
git add .
git commit -m "fix: resolve CI errors"
git push origin feature/branch-name
```

### If Merge Conflicts Occur
```bash
# 1. Update main
git checkout main
git pull origin main

# 2. Rebase or merge
git checkout feature/branch-name
git rebase main  # OR: git merge main

# 3. Resolve conflicts
# ... edit files ...
git add resolved-file.ts
git rebase --continue  # OR: git commit

# 4. Push
git push --force-with-lease origin feature/branch-name
```

## Security & Safety

### Protected Branches
**main** and **staging** branches are protected:
- ✅ Require PR for changes
- ✅ Require passing CI checks
- ✅ Require code owner approval
- ❌ Direct pushes blocked
- ❌ Force push blocked
- ❌ Deletion blocked

### Sensitive Data
❌ **NEVER commit:**
- API keys, tokens, passwords
- Private keys, certificates
- Database credentials
- `.env` files with secrets
- Personal information
- Internal URLs or endpoints

**If accidentally committed:**
1. STOP - Do not push
2. Remove from history: `git reset HEAD~1`
3. Add to `.gitignore`
4. Rotate/revoke exposed secrets
5. Report incident

## Related Guidelines
- See `scope-control.md` for file modification rules
- See `dev-monitor.md` for code quality standards
- See `failure-recovery.md` for error handling
