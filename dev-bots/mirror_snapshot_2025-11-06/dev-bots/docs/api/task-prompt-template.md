# Claude Worker Task Prompt Template

## 📋 Standard Task Execution Template

Use this template for every task to ensure consistent, reliable execution.

---

## 🎯 Task Assignment

**Worker**: [A/B]  
**Task**: [Clear description of what needs to be done]  
**Priority**: [High/Medium/Low]  
**Estimated Time**: [X minutes/hours]

## 📚 Pre-Task Requirements

**MANDATORY - Complete these steps before starting:**

1. **Read Documentation**
   - [ ] Read `WORKER_ONBOARDING.md` completely
   - [ ] Read `REPO_STRUCTURE.md` for context
   - [ ] Review any task-specific documentation

2. **Repository Analysis**
   - [ ] Identify which repositories are affected: [List repos]
   - [ ] Understand the current state of each repository
   - [ ] Check for any existing related work or issues

3. **Environment Setup**
   - [ ] Navigate to `/app/worktree/`
   - [ ] Check current branch status in all relevant repos
   - [ ] Pull latest changes from staging in all repos
   - [ ] Verify you're working with the latest code

## 🔄 Execution Steps

### Step 1: Branch Management

```bash
# For each affected repository:
cd /app/worktree/[REPO_NAME]
git checkout staging
git pull origin staging
git checkout -b worker-[A/B]-[TASK_DESCRIPTION]
```

### Step 2: Implementation

- [ ] Make the required changes
- [ ] Follow established coding patterns
- [ ] Test your changes thoroughly
- [ ] Update documentation if needed

### Step 3: Validation

- [ ] Run any relevant tests
- [ ] Check for linting errors
- [ ] Verify the changes work as expected
- [ ] Ensure no breaking changes to other components

### Step 4: Documentation

- [ ] Update relevant documentation
- [ ] Add comments to complex code
- [ ] Document any new dependencies or requirements
- [ ] Update API documentation if applicable

### Step 5: Commit and Push

```bash
# For each modified repository:
git add .
git commit -m "worker-[A/B]: [DESCRIPTION]

- What was changed
- Why it was changed
- Any important notes or considerations"

git push origin worker-[A/B]-[TASK_DESCRIPTION]
```

### Step 6: Cleanup

```bash
# Return to staging in all repos
cd /app/worktree/[REPO_NAME]
git checkout staging
git pull origin staging
```

## 📝 Task-Specific Instructions

**For this specific task:**

[Add task-specific details here]

**Repositories to modify:**

- [ ] `job-finder-BE/` - [What changes]
- [ ] `job-finder-FE/` - [What changes]
- [ ] `job-finder-worker/` - [What changes]
- [ ] `job-finder-shared-types/` - [What changes]
- [ ] `dev-monitor/` - [What changes]

**Testing requirements:**

- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing
- [ ] Cross-component testing

**Documentation updates:**

- [ ] API documentation
- [ ] User documentation
- [ ] Developer documentation
- [ ] README files

## 🚨 Critical Reminders

- **NEVER work directly on staging branch**
- **ALWAYS create a feature branch for your work**
- **ALWAYS pull latest changes before starting**
- **ALWAYS test your changes thoroughly**
- **ALWAYS commit with descriptive messages**
- **ALWAYS update documentation when needed**
- **ALWAYS switch back to staging when done**

## 🔍 Quality Checklist

Before considering the task complete:

- [ ] All changes are committed and pushed
- [ ] All tests pass
- [ ] Documentation is updated
- [ ] Code follows project standards
- [ ] No breaking changes introduced
- [ ] All repositories are back on staging branch
- [ ] Task requirements are fully met

## 📊 Task Completion Report

**Summary:**
[Brief description of what was accomplished]

**Changes Made:**

- Repository 1: [Summary of changes]
- Repository 2: [Summary of changes]
- etc.

**Testing Results:**
[Results of any testing performed]

**Documentation Updates:**
[What documentation was updated]

**Notes:**
[Any important notes, decisions, or considerations]

**Next Steps:**
[Any follow-up work needed]

---

## 🆘 If You Get Stuck

1. **Re-read the onboarding guide** - Often the answer is there
2. **Check the documentation** - Look in `docs/` for relevant information
3. **Review similar tasks** - Look at recent commits for patterns
4. **Ask for clarification** - Don't guess, ask for help
5. **Document the issue** - If you find a problem, document it

**Remember**: It's better to ask for clarification than to make assumptions that could break the system.
