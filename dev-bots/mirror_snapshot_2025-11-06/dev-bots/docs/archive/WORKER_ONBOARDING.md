# Claude Worker Onboarding Guide

## 🎯 Overview

You are a Claude Worker in a multi-repository application. This guide provides explicit instructions for working with the nested repository structure and completing tasks effectively.

## 📁 Repository Structure

The application consists of **5 independent git repositories**:

```
/app/worktrees/
├── job-finder-BE/           # Backend (Firebase Functions)
├── job-finder-FE/           # Frontend (React)
├── job-finder-worker/       # Python Worker
├── job-finder-shared-types/ # Shared TypeScript Types
├── dev-monitor/             # Development Monitor
├── docs/                    # Project Documentation
├── issues/                  # Issue Tracking
└── scripts/                 # Utility Scripts
```

## 🔄 Direct Staging Workflow

**ALWAYS follow this exact sequence for every task:**

### 1. Pre-Task Setup

```bash
# Navigate to the relevant repository
cd /app/worktrees/[REPO_NAME]

# Check current status
git status

# Switch to staging branch
git checkout staging

# Pull latest changes
git pull origin staging

# Verify you're on staging and up to date
git branch --show-current
git log --oneline -3
```

### 2. Work Directly on Staging

```bash
# Work directly on the staging branch
# NO feature branches needed for worker tasks
# All changes go directly to staging
```

### 3. Complete Your Work

- Make your changes
- Test thoroughly
- Follow coding standards
- Update documentation if needed

### 4. Commit and Push

```bash
# Stage your changes
git add .

# Commit with descriptive message
git commit -m "feat: [DESCRIPTION]

- What was changed
- Why it was changed
- Any important notes"

# Push directly to staging
git push origin staging
```

### 5. Post-Task Verification

```bash
# Verify changes are on staging
git log --oneline -3
git status
```

## 🎯 Worker Specializations

### Worker A (Backend Focus)

- **Primary**: `job-finder-BE/` (Firebase Functions)
- **Secondary**: `job-finder-worker/` (Python Worker)
- **Support**: `job-finder-shared-types/` (Type definitions)
- **Tools**: Bash, Read, Write, Edit, Search, Git

### Worker B (Frontend Focus)

- **Primary**: `job-finder-FE/` (React Frontend)
- **Secondary**: `dev-monitor/` (Development Tools)
- **Support**: `job-finder-shared-types/` (Type definitions)
- **Tools**: Read, Analyze, Test, Review, Git

## 📋 Task Execution Checklist

**Before starting ANY task:**

- [ ] Read this onboarding guide completely
- [ ] Understand which repositories are affected
- [ ] Check current branch status in all relevant repos
- [ ] Pull latest changes from staging
- [ ] Create appropriate feature branches

**During task execution:**

- [ ] Work in the correct repository
- [ ] Follow the established code patterns
- [ ] Test your changes thoroughly
- [ ] Update documentation if needed
- [ ] Commit frequently with clear messages

**After completing the task:**

- [ ] Push your feature branch
- [ ] Switch back to staging in all repos
- [ ] Pull latest changes
- [ ] Document any important changes or decisions

## 🚨 Critical Rules

1. **NEVER work directly on staging branch** - always create a feature branch
2. **ALWAYS pull staging before starting work** - ensure you have latest changes
3. **ALWAYS commit with descriptive messages** - include worker name and clear description
4. **ALWAYS test your changes** - don't assume they work
5. **ALWAYS update documentation** - if you change APIs, update docs
6. **NEVER force push** - use normal git push
7. **ALWAYS switch back to staging** - after completing work

## 🔍 Repository-Specific Notes

### job-finder-BE (Backend)

- Firebase Functions in TypeScript
- Main entry: `functions/src/index.ts`
- Environment: `.env` file
- Deploy: `firebase deploy --only functions`

### job-finder-FE (Frontend)

- React application with TypeScript
- Main entry: `src/App.tsx`
- Build: `npm run build`
- Dev server: `npm run dev`

### job-finder-worker (Python Worker)

- Python application for job processing
- Main entry: `main.py`
- Dependencies: `requirements.txt`
- Run: `python main.py`

### job-finder-shared-types

- Shared TypeScript type definitions
- Used by both FE and BE
- Update carefully - affects multiple components

### dev-monitor

- Development monitoring tools
- Backend: Node.js/Express
- Frontend: React
- Used for system monitoring and management

## 🆘 Troubleshooting

### Git Issues

- **Merge conflicts**: Resolve carefully, ask for help if complex
- **Detached HEAD**: `git checkout staging`
- **Wrong branch**: `git checkout staging` then create new branch
- **Uncommitted changes**: `git stash` to save, `git stash pop` to restore

### Repository Issues

- **Missing files**: Check if you're in the right repository
- **Build errors**: Check dependencies and environment setup
- **Type errors**: Update shared types if needed

### Communication

- Always document your decisions
- Ask for clarification if requirements are unclear
- Report issues or blockers immediately

## 📚 Additional Resources

- `docs/` - Comprehensive project documentation
- `issues/` - Current issues and requirements
- `README.md` - Project overview
- `WORKER_README.md` - Worker-specific information

---

**Remember**: You are part of a team. Your work affects other components. Always think about the broader system and communicate clearly about your changes.
