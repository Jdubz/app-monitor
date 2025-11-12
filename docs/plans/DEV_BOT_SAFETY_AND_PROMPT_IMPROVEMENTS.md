# Dev-Bot Safety Mechanisms & Prompt Improvements

**Status**: Planning
**Priority**: Critical
**Created**: 2025-11-06
**Owner**: Backend Team

## Executive Summary

Analysis of task `task-2-1762414973543` revealed two critical issues:
1. **Bot misinterpreted the task** - wrote tests instead of implementation
2. **Changes were lost** - bot made 3,694 line changes but didn't commit to staging

This plan addresses both issues with improved prompts and automatic safety mechanisms.

## Problem Analysis

### Issue 1: Task Misinterpretation

**Task Given:**
```
Title: "Add task quality validation warnings"
Documentation: "Step-by-step instructions:
1. Read the validation recommendations in docs/plans/BOT_EXECUTION_IMPROVEMENTS.md lines 67-106
2. Open src/routes/dev-bots.routes.ts and locate the POST /tasks endpoint
3. Add validation checks AFTER the agent validation block (after line 172)
4. Implement warnings for: (a) missing files array on technical tasks, (b) missing/short description, (c) vague acceptance criteria
5. Use logger.warn() with structured logging (category, action, message, taskId)
6. Test with sample tasks to verify warnings appear in logs but tasks still get created"
```

**What Bot Did:**
- ✅ Read the plan document
- ❌ Did NOT implement validation warnings in `dev-bots.routes.ts`
- ✅ Created comprehensive unit tests in `dev-bots.routes.test.ts` (685 lines)
- ❌ Misunderstood step 6 "Test with sample tasks" as "Write tests"

**Root Cause:**
- Ambiguous instruction #6: "Test with sample tasks" could mean either:
  - (Intended) "Manually test by creating sample tasks via API"
  - (Interpreted) "Write unit tests with sample task data"

### Issue 2: Lost Changes

**What Happened:**
- Bot completed successfully (exit code 0)
- Made 3,694 lines of changes across 29 files
- Changes include deletions of old script management code
- Bot did NOT commit or push to staging
- Changes are uncommitted and at risk of being lost

**Root Cause:**
- Workspace mount is `:rw` (changes persist)
- Prompt instructs: "git commit && git push origin staging"
- Bot didn't follow commit instruction (possibly due to errors or misunderstanding)
- No verification that commit/push succeeded
- No automatic backup of uncommitted changes

## Solution 1: Improved Prompt Engineering

### A. Explicit Action Verb Taxonomy

Create clear distinction between actions:

**Implementation Verbs:**
- `IMPLEMENT` - Write production code
- `CREATE` - Create new files/features
- `MODIFY` - Edit existing code
- `DELETE` - Remove code/files

**Testing Verbs:**
- `WRITE TESTS` - Create test files
- `VERIFY` - Manual testing/validation
- `RUN TESTS` - Execute existing test suite

**Example Improved Prompt:**
```markdown
## Task: IMPLEMENT Task Quality Validation Warnings

### Actions Required:
1. READ: docs/plans/BOT_EXECUTION_IMPROVEMENTS.md lines 67-106
2. OPEN: src/routes/dev-bots.routes.ts
3. LOCATE: POST /tasks endpoint (after line 172)
4. IMPLEMENT: Add three validation warning checks:
   a. Missing files array on technical tasks
   b. Missing/short description (< 50 chars)
   c. Vague acceptance criteria (< 30 chars single item)
5. USE: logger.warn() with structured logging format
6. VERIFY: Create 2-3 sample tasks via API to confirm warnings appear in logs

### What NOT to Do:
- ❌ DO NOT write unit tests (tests already exist)
- ❌ DO NOT modify test files
- ❌ ONLY modify src/routes/dev-bots.routes.ts

### Success Criteria:
- ✅ Warnings appear in backend logs when creating low-quality tasks
- ✅ Tasks are still created successfully (warnings are non-blocking)
- ✅ All changes committed to staging with descriptive message
```

### B. Explicit File Scope Constraints

Add `modifyOnly` and `doNotModify` fields to task schema:

```typescript
interface Task {
  // ... existing fields
  modifyOnly?: string[];     // ONLY these files should be modified
  doNotModify?: string[];    // NEVER modify these files
  expectedChanges?: {
    linesAdded?: number;     // Approximate lines to add
    linesModified?: number;  // Approximate lines to change
    filesCreated?: string[]; // New files to create
  };
}
```

**Example:**
```json
{
  "modifyOnly": ["src/routes/dev-bots.routes.ts"],
  "doNotModify": ["src/routes/dev-bots.routes.test.ts", "**/*.test.ts"],
  "expectedChanges": {
    "linesAdded": 30,
    "linesModified": 5,
    "filesCreated": []
  }
}
```

### C. Mandatory Commit Template

Add explicit commit instructions to prompt:

```markdown
## Git Workflow (MANDATORY):

After completing implementation:

1. STAGE your changes:
   ```bash
   git add <modified-files>
   ```

2. VERIFY staged changes match expected scope:
   ```bash
   git diff --cached --stat
   ```

3. COMMIT with descriptive message:
   ```bash
   git commit -m "impl: add task quality validation warnings

   - Warn when technical tasks missing files array
   - Warn when description < 50 chars
   - Warn when acceptance criteria vague

   Non-blocking warnings logged to help improve task quality.

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

4. PUSH to staging:
   ```bash
   git push origin staging
   ```

5. VERIFY push succeeded:
   ```bash
   git log origin/staging --oneline -1
   ```

⚠️ **CRITICAL**: If ANY git command fails, REPORT the error in your output.
Do NOT mark task as complete if commit/push failed.
```

## Solution 2: Automatic Safety Mechanisms

### A. Post-Execution Change Capture

Add hook after bot execution to automatically capture uncommitted changes:

**File:** `src/services/devBotsManager.ts`

```typescript
private async captureUncommittedChanges(
  taskId: string,
  workingDir: string
): Promise<void> {
  try {
    // Check for uncommitted changes
    const { stdout: status } = await execAsync(
      'git status --porcelain',
      { cwd: workingDir }
    );

    if (status.trim()) {
      logger.warn({
        category: 'safety',
        action: 'uncommitted_changes_detected',
        message: `Task ${taskId} has uncommitted changes`,
        details: { taskId, changeCount: status.split('\n').length }
      });

      // Create patch file as backup
      const timestamp = Date.now();
      const patchFile = path.join(
        this.artifactsDir,
        `${taskId}-uncommitted-${timestamp}.patch`
      );

      // Generate diff
      const { stdout: diff } = await execAsync(
        'git diff HEAD',
        { cwd: workingDir }
      );

      // Save patch
      await fs.writeFile(patchFile, diff);

      logger.info({
        category: 'safety',
        action: 'saved_uncommitted_changes',
        message: `Saved uncommitted changes to ${patchFile}`,
        details: { taskId, patchFile, diffSize: diff.length }
      });

      // Also save git status for context
      await fs.writeFile(
        patchFile.replace('.patch', '-status.txt'),
        status
      );
    }
  } catch (error) {
    logger.error({
      category: 'safety',
      action: 'failed_to_capture_changes',
      message: `Failed to capture uncommitted changes for ${taskId}`,
      details: { error: error.message }
    });
  }
}
```

### B. Commit Verification

Add post-execution verification that bot actually committed:

```typescript
private async verifyBotCommitted(
  taskId: string,
  workingDir: string
): Promise<{
  committed: boolean;
  commitHash?: string;
  commitMessage?: string;
  pushed?: boolean;
}> {
  try {
    // Get commits since task started
    const taskStartTime = this.tasks.get(taskId)?.startedAt;
    const sinceTime = taskStartTime
      ? new Date(taskStartTime).toISOString()
      : '1 hour ago';

    const { stdout: commits } = await execAsync(
      `git log --since="${sinceTime}" --format="%H|%s" origin/staging`,
      { cwd: workingDir }
    );

    const recentCommits = commits.split('\n').filter(Boolean);

    // Check if any commit mentions this task or was made by Claude
    const botCommit = recentCommits.find(line =>
      line.includes(taskId) ||
      line.includes('🤖 Generated with') ||
      line.includes('Co-Authored-By: Claude')
    );

    if (botCommit) {
      const [hash, message] = botCommit.split('|');
      return {
        committed: true,
        commitHash: hash,
        commitMessage: message,
        pushed: true
      };
    }

    return { committed: false };
  } catch (error) {
    logger.error({
      category: 'safety',
      action: 'failed_commit_verification',
      details: { error: error.message }
    });
    return { committed: false };
  }
}
```

### C. Automatic Stash on Failure

If bot completes but doesn't commit, automatically stash changes:

```typescript
private async autoStashChanges(
  taskId: string,
  workingDir: string
): Promise<void> {
  try {
    const stashMessage = `[AUTO-STASH] Task ${taskId} - Uncommitted changes at ${new Date().toISOString()}`;

    await execAsync(
      `git stash push -m "${stashMessage}"`,
      { cwd: workingDir }
    );

    logger.info({
      category: 'safety',
      action: 'auto_stashed_changes',
      message: `Auto-stashed uncommitted changes for ${taskId}`,
      details: { taskId, stashMessage }
    });

    // List stashes for recovery
    const { stdout: stashes } = await execAsync(
      'git stash list',
      { cwd: workingDir }
    );

    logger.info({
      category: 'safety',
      action: 'stash_list',
      message: 'Current stashes',
      details: { stashes: stashes.split('\n') }
    });
  } catch (error) {
    logger.error({
      category: 'safety',
      action: 'auto_stash_failed',
      details: { error: error.message }
    });
  }
}
```

### D. Integration into Task Execution Flow

Update `executeTaskWithDocker`:

```typescript
async executeTaskWithDocker(taskId: string): Promise<void> {
  // ... existing execution logic ...

  try {
    // Execute bot
    const result = await this.runDockerCommand(dockerArgs);

    // SAFETY CHECK 1: Capture uncommitted changes
    await this.captureUncommittedChanges(taskId, repoRoot);

    // SAFETY CHECK 2: Verify bot committed
    const commitStatus = await this.verifyBotCommitted(taskId, repoRoot);

    if (!commitStatus.committed) {
      logger.warn({
        category: 'safety',
        action: 'bot_did_not_commit',
        message: `Bot completed task ${taskId} but did not commit changes`,
        details: { taskId }
      });

      // SAFETY CHECK 3: Auto-stash if uncommitted changes exist
      await this.autoStashChanges(taskId, repoRoot);
    } else {
      logger.info({
        category: 'safety',
        action: 'bot_committed_successfully',
        message: `Bot successfully committed and pushed for ${taskId}`,
        details: {
          taskId,
          commit: commitStatus.commitHash,
          pushed: commitStatus.pushed
        }
      });
    }

    // ... rest of completion logic ...
  } catch (error) {
    // ... error handling ...
  }
}
```

## Solution 3: Enhanced Task Validation

### Pre-Execution Validation

Add validation before task execution to catch ambiguous prompts:

```typescript
interface PromptQualityCheck {
  score: number;           // 0-100
  issues: string[];        // List of problems
  suggestions: string[];   // How to improve
  approved: boolean;       // Safe to execute?
}

function validatePromptQuality(task: Task): PromptQualityCheck {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // Check for ambiguous test instructions
  if (task.documentation?.match(/test (with|using)/i) &&
      !task.documentation.match(/write test|create test/i)) {
    issues.push('Ambiguous test instruction - unclear if manual or automated testing');
    suggestions.push('Use "VERIFY with sample requests" for manual testing or "WRITE TESTS" for test code');
    score -= 20;
  }

  // Check for clear file scope
  if (!task.files || task.files.length === 0) {
    issues.push('No files specified - bot may modify unexpected files');
    suggestions.push('Add specific file paths to "files" array');
    score -= 15;
  }

  // Check for explicit commit instructions
  if (!task.documentation?.includes('git commit') &&
      !task.documentation?.includes('Git Workflow')) {
    issues.push('No explicit git commit instructions');
    suggestions.push('Add mandatory Git Workflow section to prompt');
    score -= 10;
  }

  // Check for clear action verbs
  const hasActionVerbs = task.documentation?.match(/^(IMPLEMENT|CREATE|MODIFY|DELETE|READ|OPEN|LOCATE|USE|VERIFY):/gm);
  if (!hasActionVerbs || hasActionVerbs.length < 3) {
    issues.push('Unclear action steps - use explicit action verbs');
    suggestions.push('Start each step with action verb: IMPLEMENT, CREATE, MODIFY, etc.');
    score -= 15;
  }

  return {
    score,
    issues,
    suggestions,
    approved: score >= 70
  };
}
```

## Implementation Plan

### Phase 1: Safety Mechanisms (Week 1) - ✅ COMPLETE
- [x] Analyze failed task `task-2-1762414973543`
- [x] ✅ Implement `captureUncommittedChanges` (2025-11-11)
- [x] ✅ Implement `verifyBotCommitted` (2025-11-11)
- [x] ✅ Implement `autoStashChanges` (2025-11-11)
- [x] ✅ Add safety checks to task execution flow (2025-11-11)
- [ ] Test with intentionally incomplete task

**Implementation Details**:
- Added to `backend/src/services/taskExecution.service.ts`
- Integrated into task completion workflow (lines 815-900)
- Safety checks run automatically after task execution completes
- Patch files saved to artifacts directory for recovery

### Phase 2: Prompt Engineering (Week 2)
- [ ] Create prompt template library with explicit action verbs
- [ ] Add `modifyOnly` and `doNotModify` fields to Task schema
- [ ] Implement mandatory commit template
- [ ] Create "What NOT to Do" section template
- [ ] Update task creation form with new fields

### Phase 3: Validation (Week 3)
- [ ] Implement `validatePromptQuality`
- [ ] Add pre-execution validation to task creation
- [ ] Create prompt quality scoring dashboard
- [ ] Warn user when prompt score < 70

### Phase 4: Recovery Tools (Week 4)
- [ ] Create `/api/dev-bots/recovery/uncommitted/:taskId` endpoint
- [ ] Create `/api/dev-bots/recovery/stashes` endpoint
- [ ] Add UI to view and apply saved patches/stashes
- [ ] Document recovery procedures

## Success Metrics

### Before Improvements
- Task misinterpretation rate: ~50% (1 of 2 implementation tasks)
- Lost changes: Yes (3,694 lines uncommitted)
- Manual intervention required: Always
- Recovery time: Hours (manual git exploration)

### After Improvements (Target)
- Task misinterpretation rate: <5%
- Lost changes: 0% (automatic capture)
- Manual intervention: <10% of tasks
- Recovery time: Minutes (patch files + UI)

## Related Issues

- **TC-4**: Container credentials - COMPLETED
- **WT-1**: Design SQLite schema - ATTEMPTED (needs better prompt)
- **Task-2**: Add validation warnings - FAILED (misinterpreted + lost changes)

## Appendix A: Current vs Improved Prompt

### Current Prompt (Caused Failure)
```
Title: Add task quality validation warnings
Documentation: Step-by-step instructions:
1. Read the validation recommendations in docs/plans/BOT_EXECUTION_IMPROVEMENTS.md lines 67-106
2. Open src/routes/dev-bots.routes.ts and locate the POST /tasks endpoint
3. Add validation checks AFTER the agent validation block (after line 172)
4. Implement warnings for: (a) missing files array on technical tasks, (b) missing/short description, (c) vague acceptance criteria
5. Use logger.warn() with structured logging (category, action, message, taskId)
6. Test with sample tasks to verify warnings appear in logs but tasks still get created
```
**Issues:**
- ❌ "Test with sample tasks" is ambiguous
- ❌ No explicit commit instructions
- ❌ No file scope constraints
- ❌ Doesn't say "DO NOT write tests"

### Improved Prompt (Clear & Unambiguous)
```
## Task: IMPLEMENT Task Quality Validation Warnings

### Files to Modify:
- src/routes/dev-bots.routes.ts (ONLY THIS FILE)

### Files NOT to Modify:
- src/routes/dev-bots.routes.test.ts (tests already exist)
- Any other test files

### Actions Required:
1. READ: docs/plans/BOT_EXECUTION_IMPROVEMENTS.md lines 67-106
2. OPEN: src/routes/dev-bots.routes.ts
3. LOCATE: POST /tasks endpoint, line ~172 (after agent validation)
4. IMPLEMENT: Add validation warning checks:
   ```typescript
   // Check files array for technical tasks
   if (technicalTypes.includes(type) && (!files || files.length === 0)) {
     logger.warn({
       category: 'api',
       action: 'task_missing_files_array',
       message: `Technical task type '${type}' created without files array`,
       details: { taskId: title }
     });
   }
   // ... (similar for other checks)
   ```
5. VERIFY: Create 2-3 sample implementation tasks via curl/Postman
   - Check backend logs show warnings
   - Confirm tasks are created successfully (warnings are non-blocking)

### Git Workflow (MANDATORY):
```bash
git add src/routes/dev-bots.routes.ts
git commit -m "impl: add task quality validation warnings"
git push origin staging
```

### Expected Changes:
- Lines added: ~30
- Files modified: 1 (dev-bots.routes.ts)
- Files created: 0

### What NOT to Do:
- ❌ DO NOT write or modify test files
- ❌ DO NOT add new dependencies
- ❌ DO NOT modify other route files
```

**Improvements:**
- ✅ Explicit action verbs (READ, OPEN, IMPLEMENT, VERIFY)
- ✅ Clear file scope constraints
- ✅ Mandatory git workflow section
- ✅ "What NOT to Do" section
- ✅ Expected changes quantified
- ✅ "VERIFY" clearly means manual testing, not writing tests
