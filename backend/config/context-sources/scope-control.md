# Scope Control Guidelines

## Purpose
Prevent scope creep, feature invention, and unauthorized changes during task execution.

## When to Read
**CRITICAL:** Read BEFORE planning any implementation to understand boundaries and constraints.

## Core Principles

### 1. Stay Within Task Scope
- ✅ **DO:** Only implement what the task explicitly requests
- ❌ **DON'T:** Add "helpful" features not mentioned in task description
- ❌ **DON'T:** Refactor unrelated code "while you're at it"
- ❌ **DON'T:** Fix bugs outside the task scope

**Example:**
```
Task: "Add validation to email field"
✅ CORRECT: Add email validation only
❌ WRONG: Add email validation + password strength meter + form styling
```

### 2. File Modification Boundaries
- ✅ **DO:** Only modify files explicitly listed in `targetFiles`
- ❌ **DON'T:** Create new files unless task explicitly requires them
- ❌ **DON'T:** Modify shared utilities without explicit permission
- ❌ **DON'T:** Change API contracts without task approval

**File Rules:**
- `modifyOnly` files: May be edited
- `doNotModify` files: Read-only reference (violation = task failure)
- `doNotCreate` patterns: Prevent duplicate implementations

### 3. Investigation Phase Requirements
**ALWAYS complete investigation BEFORE making changes:**

1. **Read Existing Code First**
   ```bash
   # Find existing implementations
   grep -r "similar-pattern" src/
   # Check for duplicates
   find . -name "*similar-name*"
   ```

2. **Verify No Duplication**
   - Search for existing utilities/components
   - Check if functionality already exists elsewhere
   - Reuse existing code instead of reinventing

3. **Validate Assumptions**
   - Confirm technical approach with architecture docs
   - Verify API contracts haven't changed
   - Check if dependencies are available

### 4. Forbidden Actions (Without Explicit Permission)
❌ **Never Do These Without Task Authorization:**
- Installing new npm dependencies
- Changing database schemas
- Modifying API endpoints
- Updating configuration files
- Changing build/deployment scripts
- Modifying git workflow files
- Editing environment variables
- Updating Docker configurations

### 5. When Scope is Unclear
**If you encounter ambiguity:**

1. **STOP** - Do not make assumptions
2. **Document** - Note the ambiguity in task logs
3. **Ask** - Request clarification via task output
4. **Wait** - Do not proceed until scope is clear

**Template for Clarification Request:**
```markdown
## Scope Clarification Needed

**Issue:** [Describe the ambiguity]
**Options:**
1. [Option A with pros/cons]
2. [Option B with pros/cons]

**Recommendation:** [Your suggested approach]
**Blocking:** Cannot proceed without decision
```

## Scope Violation Examples

### ❌ BAD: Feature Creep
```javascript
// Task: "Add loading spinner to submit button"

// WRONG: Added spinner + error toast + success animation + retry logic
<Button>
  {loading && <Spinner />}
  {error && <ErrorToast />}
  {success && <SuccessAnimation />}
  Submit
</Button>
```

### ✅ GOOD: Minimal Implementation
```javascript
// Task: "Add loading spinner to submit button"

// CORRECT: Only added spinner
<Button disabled={loading}>
  {loading && <Spinner />}
  Submit
</Button>
```

### ❌ BAD: Unauthorized Refactoring
```javascript
// Task: "Fix null pointer bug in user service"

// WRONG: Fixed bug + renamed methods + reorganized file structure
class UserService {
  getUserProfile() { /* refactored everything */ }
  updateUser() { /* new naming convention */ }
  // ... entire file restructured
}
```

### ✅ GOOD: Surgical Fix
```javascript
// Task: "Fix null pointer bug in user service"

// CORRECT: Only fixed the specific bug
class UserService {
  getUserProfile(userId) {
    // Added null check (only change)
    if (!userId) return null;
    return this.db.getUser(userId);
  }
}
```

## Quality Gates

### Before Committing Changes
**Run this checklist:**

- [ ] Only modified files in `targetFiles` list?
- [ ] No new files created unless task requires?
- [ ] No dependencies added unless task requires?
- [ ] No refactoring of unrelated code?
- [ ] All changes directly support task goal?
- [ ] Investigation phase completed?
- [ ] No duplication of existing functionality?

### If ANY Answer is "No"
**Action Required:**
1. Revert unauthorized changes
2. Document what was attempted and why
3. Request scope expansion if changes are necessary
4. Wait for approval before proceeding

## Escalation Path

### When to Escalate
Escalate to human review if you discover:
- Task scope conflicts with architecture
- Required files are marked `doNotModify`
- Task requires changes outside scope
- Duplication is unavoidable
- Technical constraints prevent completion

### How to Escalate
```markdown
## Task Blocked - Scope Issue

**Task:** [Task ID and title]
**Issue:** [Describe the scope conflict]
**Impact:** [Why this blocks completion]
**Options:**
1. [Modify task scope to allow...]
2. [Change approach to avoid...]

**Recommendation:** [Your suggested resolution]
**Status:** BLOCKED - Awaiting human decision
```

## Success Metrics
Tasks that follow scope control achieve:
- ✅ 100% scope compliance (no unauthorized changes)
- ✅ 0% code duplication
- ✅ Minimal file modifications (surgical changes)
- ✅ Clear audit trail (all changes justified)

## Related Guidelines
- See `pr-workflow.md` for git workflow constraints
- See `dev-monitor.md` for code quality standards
- See `failure-recovery.md` for error handling scope
