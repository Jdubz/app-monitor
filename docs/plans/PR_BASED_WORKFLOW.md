# PR-Based Dev-Bot Workflow Design

## Overview
Transform dev-bot task execution from direct push-to-staging to a full PR-based workflow with automatic checks, review integration, and auto-merge capabilities.

## Current Workflow
```
Task → Execute → Commit → Push to staging → Done
```

## New PR-Based Workflow
```
Task → Execute → Create Branch → Commit → Push → Create PR to main
     → Wait for CI checks
     → Wait for Copilot review
     → IF all checks pass AND no review comments
        → Auto-merge PR
        → Record PR# in task metadata
        → Mark task complete
     → ELSE IF checks fail
        → Create followup task to fix failures
        → Link to original task
     → ELSE IF review has comments
        → Create followup task to address comments
        → Link to original task
```

## Architecture Components

### 1. Data Model Extensions

#### Task Interface Additions
```typescript
export interface Task {
  // ... existing fields ...

  // PR workflow fields
  pr_number?: number;           // GitHub PR number
  pr_url?: string;              // Full PR URL
  pr_branch?: string;           // Feature branch name
  pr_status?: 'creating' | 'pending_checks' | 'pending_review' | 'ready_to_merge' | 'merged' | 'closed';
  pr_checks_status?: 'pending' | 'success' | 'failure';
  pr_review_status?: 'no_reviews' | 'approved' | 'changes_requested' | 'commented';
  pr_created_at?: number;
  pr_merged_at?: number;

  // Followup task linking
  followup_for_pr?: number;     // If this task fixes issues from a PR
  followup_tasks?: string[];    // Child tasks created to fix PR issues
}
```

#### Database Migration
```sql
-- Migration: 00X_pr_workflow
ALTER TABLE tasks ADD COLUMN pr_number INTEGER;
ALTER TABLE tasks ADD COLUMN pr_url TEXT;
ALTER TABLE tasks ADD COLUMN pr_branch TEXT;
ALTER TABLE tasks ADD COLUMN pr_status TEXT;
ALTER TABLE tasks ADD COLUMN pr_checks_status TEXT;
ALTER TABLE tasks ADD COLUMN pr_review_status TEXT;
ALTER TABLE tasks ADD COLUMN pr_created_at INTEGER;
ALTER TABLE tasks ADD COLUMN pr_merged_at INTEGER;
ALTER TABLE tasks ADD COLUMN followup_for_pr INTEGER;
ALTER TABLE tasks ADD COLUMN followup_tasks TEXT; -- JSON array
```

### 2. Bot Task Template Changes

#### Git Workflow Section (taskPromptTemplates.ts)
```markdown
## Git Workflow - PR-Based (MANDATORY)

**CRITICAL: You MUST create a PR, not push directly to staging!**

### Step 1: Fetch Latest Main & Check for Conflicts
\`\`\`bash
# CRITICAL: Always fetch latest main to avoid duplicate work and conflicts
git fetch origin main

# Check how far behind main you are
BEHIND_COUNT=$(git rev-list --count HEAD..origin/main)

if [ "$BEHIND_COUNT" -gt 0 ]; then
  echo "⚠️  WARNING: main is $BEHIND_COUNT commits ahead since you started"
  echo "Rebasing onto latest main to avoid conflicts and duplicate work..."

  # Try to rebase onto latest main
  if ! git rebase origin/main; then
    echo "❌ ERROR: Rebase failed with conflicts"
    echo "This likely means someone else already fixed similar issues"
    echo "Aborting rebase and will create PR with conflict markers for review"
    git rebase --abort

    # Flag for PR description that rebase failed
    REBASE_FAILED=true
  else
    echo "✅ Successfully rebased onto latest main"
    REBASE_FAILED=false
  fi
fi
\`\`\`

### Step 2: Create Feature Branch
\`\`\`bash
# Branch naming: task-{type}-{short-description}
git checkout -b task-implementation-add-user-auth
\`\`\`

### Step 3: Make Changes & Commit
\`\`\`bash
git add {relevant files}
git commit -m "feat: {description}

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
\`\`\`

### Step 3: Push Branch
\`\`\`bash
git push -u origin task-implementation-add-user-auth
\`\`\`

### Step 5: Check for Duplicate Work Before Creating PR
\`\`\`bash
# Check if any of our changed files were also modified in main since branch creation
BRANCH_POINT=$(git merge-base HEAD origin/main)
CHANGED_FILES=$(git diff --name-only $BRANCH_POINT HEAD)

echo "Checking for duplicate work in main..."
DUPLICATE_WORK=""
for file in $CHANGED_FILES; do
  if git diff $BRANCH_POINT..origin/main --quiet -- "$file" 2>/dev/null; then
    :  # File not modified in main, OK
  else
    echo "⚠️  WARNING: $file was also modified in main since branch creation"
    DUPLICATE_WORK="${DUPLICATE_WORK}\n- $file"
  fi
done

if [ -n "$DUPLICATE_WORK" ]; then
  echo ""
  echo "⚠️  DUPLICATE WORK DETECTED"
  echo "The following files were modified both in your branch AND in main:"
  echo -e "$DUPLICATE_WORK"
  echo ""
  echo "This may indicate:"
  echo "  1. Someone else already fixed this issue"
  echo "  2. Your branch needs to be rebased/synced with main"
  echo "  3. There may be merge conflicts"
  echo ""
  echo "Creating PR anyway for review, but flagging this in PR description..."
fi
\`\`\`

### Step 6: Create Pull Request
\`\`\`bash
# Build PR description with warnings if needed
PR_WARNINGS=""
if [ "$REBASE_FAILED" = "true" ]; then
  PR_WARNINGS="${PR_WARNINGS}

⚠️ **REBASE CONFLICT DETECTED**
- Branch could not be rebased onto latest main
- Manual conflict resolution may be needed
- Review carefully for duplicate work
"
fi

if [ -n "$DUPLICATE_WORK" ]; then
  PR_WARNINGS="${PR_WARNINGS}

⚠️ **DUPLICATE WORK WARNING**
The following files were modified in both this branch AND main:
${DUPLICATE_WORK}

This may indicate overlapping changes or fixes that need review.
"
fi

gh pr create \
  --base main \
  --head task-implementation-add-user-auth \
  --title "{task.title}" \
  --body "$(cat <<EOF
## Task
Implements task: {task.id}

## Changes
- {change 1}
- {change 2}

## Testing
{how to test}
${PR_WARNINGS}

🤖 Generated by dev-bot
Task ID: {task.id}
Branch created from: ${BRANCH_POINT:0:7}
Commits ahead of main: $(git rev-list --count origin/main..HEAD)
EOF
)"
\`\`\`

### Step 5: Capture PR Number
After creating the PR, you MUST output:
\`\`\`
PR_NUMBER: {number}
PR_URL: {url}
\`\`\`

**Example:**
\`\`\`
PR_NUMBER: 42
PR_URL: https://github.com/Jdubz/app-monitor/pull/42
\`\`\`

**VERIFICATION REQUIRED:**
- ✅ Feature branch created
- ✅ Changes committed
- ✅ Branch pushed to origin
- ✅ PR created to main (NOT staging)
- ✅ PR number captured in output
\`\`\`
```

### 3. PR Monitoring Service

#### New Service: `prMonitor.service.ts`
```typescript
export interface PRCheckResult {
  pr_number: number;
  checks_passed: boolean;
  checks_pending: boolean;
  checks_failed: boolean;
  failed_checks?: string[];
}

export interface PRReviewResult {
  pr_number: number;
  has_reviews: boolean;
  approved: boolean;
  changes_requested: boolean;
  has_comments: boolean;
  comments?: Array<{
    author: string;
    body: string;
    path?: string;
    line?: number;
  }>;
}

export class PRMonitorService {
  /**
   * Monitor PR checks until they complete or timeout
   */
  async waitForChecks(prNumber: number, timeoutMs: number = 600000): Promise<PRCheckResult>

  /**
   * Check for Copilot or human reviews
   */
  async getReviewStatus(prNumber: number): Promise<PRReviewResult>

  /**
   * Auto-merge if conditions met
   */
  async attemptAutoMerge(prNumber: number): Promise<boolean>

  /**
   * Get PR comments for followup task generation
   */
  async getActionableComments(prNumber: number): Promise<string[]>
}
```

### 4. PR Workflow Orchestrator

#### New Service: `prWorkflowOrchestrator.service.ts`
```typescript
export class PRWorkflowOrchestrator {
  /**
   * Main entry point after bot completes task
   * Called from taskCompletion.service.ts
   */
  async handleTaskCompletion(task: Task, output: string): Promise<void> {
    // 1. Extract PR number from bot output
    const prInfo = this.extractPRInfo(output);
    if (!prInfo) {
      throw new Error('Bot did not create PR or provide PR number');
    }

    // 2. Update task with PR metadata
    await this.taskQueue.updateTask(task.id, {
      pr_number: prInfo.number,
      pr_url: prInfo.url,
      pr_branch: prInfo.branch,
      pr_status: 'pending_checks',
      pr_created_at: Date.now()
    });

    // 3. Start monitoring workflow (async - don't block task completion)
    this.monitorPRWorkflow(task.id, prInfo.number).catch(err => {
      logger.error({
        category: 'pr_workflow',
        action: 'monitor_pr_failed',
        message: `Failed to monitor PR ${prInfo.number}`,
        details: { taskId: task.id, error: err.message }
      });
    });
  }

  /**
   * Background monitoring of PR until resolution
   */
  private async monitorPRWorkflow(taskId: string, prNumber: number): Promise<void> {
    // 1. Wait for CI checks (with timeout)
    const checkResult = await this.prMonitor.waitForChecks(prNumber, 600000); // 10 min timeout

    // 2. Update task status
    await this.taskQueue.updateTask(taskId, {
      pr_checks_status: checkResult.checks_passed ? 'success' : 'failure'
    });

    // 3. If checks failed, create followup task
    if (checkResult.checks_failed) {
      await this.createCheckFixTask(taskId, prNumber, checkResult.failed_checks);
      return;
    }

    // 4. Check for reviews/comments
    const reviewResult = await this.prMonitor.getReviewStatus(prNumber);

    // 5. Update review status
    await this.taskQueue.updateTask(taskId, {
      pr_review_status: reviewResult.changes_requested ? 'changes_requested' :
                        reviewResult.has_comments ? 'commented' :
                        reviewResult.approved ? 'approved' : 'no_reviews'
    });

    // 6. If changes requested or comments, create followup task
    if (reviewResult.changes_requested || reviewResult.has_comments) {
      await this.createCommentAddressTask(taskId, prNumber, reviewResult.comments);
      return;
    }

    // 7. All checks passed, no blocking comments → Auto-merge
    if (checkResult.checks_passed && !reviewResult.changes_requested) {
      const merged = await this.prMonitor.attemptAutoMerge(prNumber);

      if (merged) {
        await this.taskQueue.updateTask(taskId, {
          pr_status: 'merged',
          pr_merged_at: Date.now()
        });

        logger.info({
          category: 'pr_workflow',
          action: 'pr_auto_merged',
          message: `PR #${prNumber} automatically merged`,
          details: { taskId, prNumber }
        });
      }
    }
  }

  /**
   * Create followup task to fix failed checks
   */
  private async createCheckFixTask(
    originalTaskId: string,
    prNumber: number,
    failedChecks: string[]
  ): Promise<string>

  /**
   * Create followup task to address PR comments
   */
  private async createCommentAddressTask(
    originalTaskId: string,
    prNumber: number,
    comments: any[]
  ): Promise<string>
}
```

### 5. Integration Points

#### taskCompletion.service.ts
```typescript
// After bot reports success, check for PR creation
if (task.status === 'completed') {
  await this.prWorkflowOrchestrator.handleTaskCompletion(task, output);
}
```

#### taskExecution.service.ts
```typescript
// Update git workflow in bot prompt generation
// Point to PR-based template instead of direct push
```

## Implementation Plan

### Phase 1: Data Model & Templates (Current Sprint)
- [x] Design architecture
- [ ] Add PR fields to Task interface
- [ ] Create database migration
- [ ] Update task prompt template with PR workflow
- [ ] Add PR number extraction logic

### Phase 2: PR Monitoring Service
- [ ] Implement `PRMonitorService`
  - [ ] `waitForChecks()` using `gh pr checks --watch --json`
  - [ ] `getReviewStatus()` using `gh api`
  - [ ] `attemptAutoMerge()` using `gh pr merge`
  - [ ] `getActionableComments()` for followup tasks

### Phase 3: Workflow Orchestrator
- [ ] Implement `PRWorkflowOrchestrator`
  - [ ] PR info extraction from bot output
  - [ ] Background PR monitoring loop
  - [ ] Followup task generation for failures
  - [ ] Followup task generation for comments
  - [ ] Auto-merge logic

### Phase 4: Integration & Testing
- [ ] Wire orchestrator into task completion flow
- [ ] Update all task templates
- [ ] Test with sample tasks
- [ ] Monitor and refine

## GitHub CLI Commands Reference

```bash
# Create PR
gh pr create --base main --head feature-branch --title "..." --body "..."

# Monitor checks (blocking until complete)
gh pr checks 42 --watch --json state,name,conclusion

# Get review status
gh api repos/Jdubz/app-monitor/pulls/42/reviews

# Get comments
gh api repos/Jdubz/app-monitor/pulls/42/comments

# Merge PR
gh pr merge 42 --auto --squash

# Check if checks are passing
gh pr checks 42 --required --json state
```

## Success Criteria

- [ ] Bots create PRs instead of direct push
- [ ] PR number captured in task metadata
- [ ] Automatic monitoring of CI checks
- [ ] Automatic monitoring of Copilot reviews
- [ ] Auto-merge when all conditions met
- [ ] Followup tasks created for failures/comments
- [ ] Full audit trail in task history
- [ ] No manual intervention required for clean PRs

## Merge Conflict Detection & Resolution

### Problem: Parallel Workers Creating Duplicate Work

**Scenario**: Two workers start from same main commit, both fix same bugs, create overlapping PRs.

**Detection Strategies**:
1. **Branch Age Check**: Warn if branch is >24h old before PR creation
2. **Duplicate File Detection**: Check if changed files also modified in main
3. **Merge Conflict Preview**: Run `git merge-tree` to detect conflicts before PR creation
4. **Commit Similarity Analysis**: Hash changed lines and compare with recent main commits

### Automated Conflict Resolution

#### Pre-PR Rebase (Bot Template)
```bash
# Before creating PR, attempt to rebase onto latest main
git fetch origin main

if ! git rebase origin/main; then
  # Conflict detected
  echo "CONFLICT_DETECTED: true" >> /tmp/pr-metadata.txt

  # Try auto-resolution strategies
  CONFLICTS=$(git diff --name-only --diff-filter=U)

  for file in $CONFLICTS; do
    # Strategy 1: If our changes are subset of main's changes, accept main's version
    if git show :1:$file | diff -q - <(git show :3:$file) >/dev/null 2>&1; then
      echo "Accepting main's version of $file (our changes already included)"
      git checkout --theirs $file
      git add $file
      continue
    fi

    # Strategy 2: If only whitespace conflicts, accept either version
    if git diff --ignore-all-space :2:$file :3:$file | wc -l | grep -q "^0$"; then
      echo "Accepting main's version of $file (only whitespace differences)"
      git checkout --theirs $file
      git add $file
      continue
    fi

    # Strategy 3: If both added same imports/requires, deduplicate
    # (Add more sophisticated logic here)
  done

  # If all conflicts resolved
  if [ -z "$(git diff --name-only --diff-filter=U)" ]; then
    git rebase --continue
    echo "CONFLICT_AUTO_RESOLVED: true" >> /tmp/pr-metadata.txt
  else
    git rebase --abort
    echo "CONFLICT_RESOLUTION_FAILED: true" >> /tmp/pr-metadata.txt
    echo "MANUAL_REVIEW_REQUIRED: true" >> /tmp/pr-metadata.txt
  fi
fi
```

#### Stale Branch Detection (PRWorkflowOrchestrator)
```typescript
async detectStaleBranch(prInfo: PRInfo): Promise<StalenesCheck> {
  // Get branch creation time from first commit
  const branchPoint = await exec(`git merge-base ${prInfo.branch} origin/main`);
  const branchCreatedAt = await getCommitTime(branchPoint);
  const mainLastUpdate = await getCommitTime('origin/main');

  const ageHours = (mainLastUpdate - branchCreatedAt) / 3600000;
  const commitsBehind = await exec(`git rev-list --count ${prInfo.branch}..origin/main`);

  return {
    isStale: ageHours > 24 || parseInt(commitsBehind) > 10,
    ageHours,
    commitsBehind: parseInt(commitsBehind),
    recommendation: ageHours > 24
      ? 'Branch is stale, rebase recommended'
      : 'Branch is fresh, no action needed'
  };
}
```

#### Duplicate Work Detection (PRWorkflowOrchestrator)
```typescript
async detectDuplicateWork(prNumber: number): Promise<DuplicateWorkReport> {
  // Get files changed in PR
  const prFiles = await exec(`gh pr diff ${prNumber} --name-only`);

  // Get files changed in main since PR branch was created
  const branchPoint = await exec(`gh pr view ${prNumber} --json baseRefOid -q .baseRefOid`);
  const mainFiles = await exec(`git diff --name-only ${branchPoint}..origin/main`);

  const duplicateFiles = prFiles.filter(f => mainFiles.includes(f));

  if (duplicateFiles.length === 0) {
    return { hasDuplicates: false, duplicateFiles: [] };
  }

  // Analyze severity of duplicates
  const analysis = [];
  for (const file of duplicateFiles) {
    const prChanges = await exec(`gh pr diff ${prNumber} -- ${file}`);
    const mainChanges = await exec(`git diff ${branchPoint}..origin/main -- ${file}`);

    const similarity = calculateLineSimilarity(prChanges, mainChanges);

    analysis.push({
      file,
      similarity, // 0-100%
      severity: similarity > 80 ? 'high' : similarity > 50 ? 'medium' : 'low',
      recommendation: similarity > 80
        ? 'Likely duplicate fix - consider closing PR'
        : similarity > 50
          ? 'Overlapping changes - review carefully'
          : 'Different changes to same file - OK'
    });
  }

  return {
    hasDuplicates: true,
    duplicateFiles,
    analysis
  };
}
```

#### Followup Task for Conflict Resolution
```typescript
async createConflictResolutionTask(
  originalTaskId: string,
  prNumber: number,
  conflictDetails: ConflictReport
): Promise<string> {
  const task = await this.taskQueue.createTask({
    type: 'bugfix',
    title: `Resolve merge conflicts in PR #${prNumber}`,
    description: `
PR #${prNumber} has merge conflicts that need manual resolution.

**Conflicting Files**:
${conflictDetails.files.map(f => `- ${f}`).join('\n')}

**Resolution Steps**:
1. Checkout PR branch
2. Rebase onto latest main
3. Resolve conflicts manually
4. Run tests to ensure nothing broke
5. Force push to update PR

**Conflict Analysis**:
${conflictDetails.analysis}

**Original Task**: ${originalTaskId}
    `,
    assignedAgent: 'backend-specialist',
    priority: 8, // High priority - blocking PR
    acceptanceCriteria: [
      'All merge conflicts resolved',
      'PR rebased onto latest main',
      'All tests passing',
      'PR updated with resolved changes'
    ],
    metadata: {
      isConflictResolution: true,
      originalTaskId,
      prNumber,
      followupFor: originalTaskId
    }
  });

  return task.id;
}
```

### PR Monitoring Enhancements

#### Add Merge Conflict Detection to Monitoring Loop
```typescript
async monitorPRWorkflow(taskId: string, prNumber: number): Promise<void> {
  // 1. Check for staleness
  const stalenessCheck = await this.detectStaleBranch({ number: prNumber, branch: ... });
  if (stalenessCheck.isStale) {
    logger.warn({
      category: 'pr-workflow',
      action: 'stale_branch_detected',
      message: `PR #${prNumber} branch is stale (${stalenessCheck.ageHours}h old, ${stalenessCheck.commitsBehind} commits behind)`,
      details: { taskId, prNumber, ...stalenessCheck }
    });
  }

  // 2. Check for duplicate work
  const duplicateCheck = await this.detectDuplicateWork(prNumber);
  if (duplicateCheck.hasDuplicates) {
    logger.warn({
      category: 'pr-workflow',
      action: 'duplicate_work_detected',
      message: `PR #${prNumber} has duplicate work (${duplicateCheck.duplicateFiles.length} files)`,
      details: { taskId, prNumber, ...duplicateCheck }
    });

    // If high similarity (>80%), auto-close with comment
    const highSimilarity = duplicateCheck.analysis.some(a => a.severity === 'high');
    if (highSimilarity) {
      await exec(`gh pr comment ${prNumber} --body "⚠️ **Duplicate Work Detected**\\n\\nThis PR appears to contain fixes that were already merged to main in another PR.\\n\\nConflicting files:\\n${duplicateCheck.analysis.filter(a => a.severity === 'high').map(a => \`- ${a.file} (${a.similarity}% similar)\`).join('\\n')}\\n\\nClosing as duplicate. Original task: ${taskId}"`);

      await exec(`gh pr close ${prNumber}`);
      await this.taskQueue.updateTask(taskId, {
        pr_status: 'closed',
        notes: 'PR closed automatically due to duplicate work detection'
      });

      return; // Stop monitoring
    }
  }

  // 3. Continue with normal monitoring (checks, reviews, etc.)
  // ... rest of monitoring logic
}
```

## Risk Mitigation

1. **Runaway followup tasks**: Limit followup depth to 3 levels
2. **Stuck PR monitoring**: Implement timeouts (10 min for checks)
3. **Merge conflicts**: Auto-detect before PR creation, attempt auto-resolution, create followup task if needed
4. **Duplicate work**: Detect via file-level diff analysis, auto-close PRs with >80% similarity to merged changes
5. **Stale branches**: Warn when branch >24h old or >10 commits behind, recommend rebase
6. **API rate limits**: Add exponential backoff for gh CLI calls
7. **Failed auto-merge**: Log and alert, allow manual intervention
8. **Parallel workers**: Add file-level locking (future enhancement) to prevent concurrent edits
