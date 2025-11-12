# Schema Audit & Cleanup Report

**Date**: 2025-11-12  
**Status**: Investigation Complete - Ready for Migration  
**Priority**: P2 - Code Quality & Maintainability

## Executive Summary

Audit of database schema revealed **data duplication violations** of master design intent. PR status data is being stored in both `tasks` table and tracked via GitHub API. This investigation proposes schema cleanup to align with the principle: **"Any information available from GitHub should NOT be stored in our DB."**

## Design Principle Violations

### From Master Design Intent:
> "Any information available from GitHub should not be stored in our DB, we should NEVER use in-memory storage."

### Current Violations:

#### ❌ Violation 1: PR Status Columns in Tasks Table

**Location**: Migration `005_pr_workflow.sql` adds to `tasks` table:

```sql
ALTER TABLE tasks ADD COLUMN pr_number INTEGER;         -- ✅ KEEP (identifier/foreign key)
ALTER TABLE tasks ADD COLUMN pr_url TEXT;               -- ❌ REMOVE (query from GitHub)
ALTER TABLE tasks ADD COLUMN pr_branch TEXT;            -- ❌ REMOVE (query from GitHub)
ALTER TABLE tasks ADD COLUMN pr_status TEXT;            -- ❌ REMOVE (query from GitHub)
ALTER TABLE tasks ADD COLUMN pr_checks_status TEXT;     -- ❌ REMOVE (redundant - tracked in pr_condition_states)
ALTER TABLE tasks ADD COLUMN pr_review_status TEXT;     -- ❌ REMOVE (redundant - tracked in pr_condition_states)
ALTER TABLE tasks ADD COLUMN pr_created_at INTEGER;     -- ❌ REMOVE (query from GitHub)
ALTER TABLE tasks ADD COLUMN pr_merged_at INTEGER;      -- ❌ REMOVE (query from GitHub)
```

**Why This Is Wrong**:
1. **Data Sync Issues**: PR state changes on GitHub, our DB becomes stale
2. **Redundancy**: Same data tracked in `pr_condition_states` table
3. **Violates SRP**: Tasks table should track task state, not PR state
4. **GitHub is Source of Truth**: We should query GitHub API when needed

**What to Keep**:
- `pr_number` - Foreign key identifier (not GitHub data, just a reference)
- `followup_for_pr` - Our internal relationship tracking

#### ❌ Violation 2: Redundant Status Tracking

**Current Architecture**:
```
tasks table:
  - pr_status (e.g., 'ready_to_merge')
  - pr_checks_status (e.g., 'failure')
  - pr_review_status (e.g., 'changes_requested')

pr_condition_states table:
  - ci_checks_passing (boolean)
  - no_change_requests (boolean)
  - merge_eligible (boolean)
  ... (6 more conditions)
```

**Problem**: Same information stored twice in different formats!

**Solution**: Use only `pr_condition_states` for PR state. Query GitHub for current values.

## Proposed Schema Cleanup

### Migration 011: Remove Duplicate PR Columns

```sql
-- Migration 011: Remove duplicate PR status columns from tasks table
-- These violate the principle: "Any information available from GitHub should NOT be stored in our DB"

-- Remove GitHub-queryable columns
ALTER TABLE tasks DROP COLUMN pr_url;           -- Query from GitHub API
ALTER TABLE tasks DROP COLUMN pr_branch;        -- Query from GitHub API
ALTER TABLE tasks DROP COLUMN pr_status;        -- Use pr_condition_states instead
ALTER TABLE tasks DROP COLUMN pr_checks_status; -- Use pr_condition_states.ci_checks_passing
ALTER TABLE tasks DROP COLUMN pr_review_status; -- Use pr_condition_states.no_change_requests
ALTER TABLE tasks DROP COLUMN pr_created_at;    -- Query from GitHub API
ALTER TABLE tasks DROP COLUMN pr_merged_at;     -- Query from GitHub API

-- KEEP these columns (they are OUR data, not GitHub's):
-- pr_number              -- Foreign key reference (identifier only)
-- followup_for_pr        -- Our internal task relationship
-- followup_tasks         -- Our internal task chain tracking

-- Drop redundant indexes
DROP INDEX IF EXISTS idx_tasks_pr_status;

-- The correct architecture:
-- 1. tasks table: Only task-specific data + pr_number reference
-- 2. pr_condition_states table: Our evaluation of PR conditions
-- 3. GitHub API: Source of truth for PR details (title, branch, url, etc.)
```

### How to Query PR Data Going Forward

**Before (Wrong)**:
```typescript
// ❌ BAD: Reading stale data from tasks table
const task = await taskQueue.getTask(taskId);
const prUrl = task.pr_url;           // Stale!
const prBranch = task.pr_branch;     // Stale!
const prStatus = task.pr_status;     // Stale!
```

**After (Correct)**:
```typescript
// ✅ GOOD: Query GitHub for current data
const task = await taskQueue.getTask(taskId);
if (task.pr_number) {
  const prStatus = await githubPR.getPRStatus(task.pr_number);
  const prUrl = prStatus.html_url;        // Current!
  const prBranch = prStatus.head_ref;     // Current!
  const mergeable = prStatus.mergeable;   // Current!
}
```

**For Condition States**:
```typescript
// ✅ GOOD: Use pr_condition_states for our evaluations
const task = await taskQueue.getTask(taskId);
if (task.pr_number) {
  const conditions = await prConditionState.getConditionState(task.pr_number);
  const canMerge = conditions.merge_eligible;
  const checksPass = conditions.ci_checks_passing;
  const needsReview = !conditions.copilot_review_completed;
}
```

## Impact Analysis

### Affected Services

#### 1. **TaskQueueService** (`taskQueue.sqlite.ts`)

**Changes Needed**:
```typescript
// Remove from Task interface
export interface Task {
  id: string;
  // ... other fields ...
  pr_number?: number;           // ✅ KEEP
  // pr_url?: string;           // ❌ REMOVE
  // pr_branch?: string;        // ❌ REMOVE
  // pr_status?: string;        // ❌ REMOVE
  // pr_checks_status?: string; // ❌ REMOVE
  // pr_review_status?: string; // ❌ REMOVE
  // pr_created_at?: number;    // ❌ REMOVE
  // pr_merged_at?: number;     // ❌ REMOVE
  followup_for_pr?: number;     // ✅ KEEP
  followup_tasks?: string;      // ✅ KEEP (JSON array)
}

// Remove from SQL INSERT statements
// Replace direct DB access with GitHub queries
```

**Estimated Effort**: 2-3 hours (update type definitions, remove references)

#### 2. **PRWorkflowOrchestrator** (`prWorkflowOrchestrator.service.ts`)

**Changes Needed**:
```typescript
// Before: Setting pr_status, pr_url, etc. on task
// After: Only set pr_number, query GitHub for everything else

async registerPR(taskId: string, prNumber: number): Promise<void> {
  // ✅ CORRECT: Only store PR number
  await this.taskQueue.updateTask(taskId, {
    pr_number: prNumber
  });
  
  // ❌ REMOVE: Don't store GitHub data
  // await this.taskQueue.updateTask(taskId, {
  //   pr_url: prData.url,
  //   pr_branch: prData.branch,
  //   pr_status: 'pending_checks',
  //   ...
  // });
  
  // ✅ CORRECT: Create condition state entry (our evaluation)
  await this.prConditionState.createConditionState(prNumber);
}
```

**Estimated Effort**: 3-4 hours (refactor PR registration, update status handling)

#### 3. **GitHubWebhookHandler** (`githubWebhookHandler.service.ts`)

**Changes Needed**:
```typescript
// Before: Update task.pr_status based on webhook events
// After: Update pr_condition_states only

async handlePullRequest(payload: GitHubPullRequestPayload): Promise<void> {
  const prNumber = payload.number;
  
  // ❌ REMOVE: Don't update task table with GitHub data
  // await this.taskQueue.updatePRStatus(taskId, {
  //   pr_status: this.mapPRState(payload.pull_request.state),
  //   pr_checks_status: 'pending',
  //   ...
  // });
  
  // ✅ CORRECT: Update condition states (our evaluation)
  await this.prConditionState.evaluateConditions(prNumber);
}
```

**Estimated Effort**: 2 hours (remove updatePRStatus calls)

#### 4. **Frontend Components**

**Changes Needed**:
```typescript
// Before: Display task.pr_url, task.pr_status
// After: Fetch from condition state or display pr_number only

// Example: TaskDetailsView.tsx
const TaskPRInfo = ({ task }) => {
  const { data: prStatus } = useQuery(
    ['pr-status', task.pr_number],
    () => api.getPRStatus(task.pr_number),
    { enabled: !!task.pr_number }
  );
  
  return (
    <div>
      <a href={prStatus?.html_url}>PR #{task.pr_number}</a>
      <span>Branch: {prStatus?.head_ref}</span>
      {/* Condition states fetched separately */}
    </div>
  );
};
```

**Estimated Effort**: 2-3 hours (update components to fetch PR data)

### Database Migration Strategy

**Option 1: Drop Columns (Recommended)**
- Clean break from old design
- No stale data persists
- Forces code to use correct pattern

**Option 2: Mark Deprecated, Remove in Future**
- Safer, allows gradual migration
- Risk of continued use
- Requires discipline

**Recommendation**: Option 1 (Drop Columns)

**Migration Steps**:
```sql
-- 1. Create migration file: 011_remove_duplicate_pr_columns.sql
-- 2. Drop columns (SQLite requires recreation)
-- 3. Update code before running migration
-- 4. Run migration on dev → staging → prod
```

**SQLite Column Drop (Requires Table Recreation)**:
```sql
-- SQLite doesn't support DROP COLUMN directly (for older versions)
-- Must recreate table

BEGIN TRANSACTION;

-- Create new table without duplicate columns
CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  documentation TEXT,
  notes TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
  priority INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL,
  assigned_at INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  assigned_agent TEXT NOT NULL,
  assigned_worker TEXT,
  agent_type TEXT CHECK(agent_type IN ('claude', 'codex')),
  prompt TEXT,
  output TEXT,
  error TEXT,
  can_retry INTEGER DEFAULT 1,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT NULL,
  fingerprint TEXT,
  estimated_hours REAL,
  complexity TEXT,
  
  -- ✅ KEEP: Our data
  pr_number INTEGER,
  followup_for_pr INTEGER,
  followup_tasks TEXT,
  
  -- ❌ REMOVED: GitHub-queryable data
  -- pr_url TEXT,
  -- pr_branch TEXT,
  -- pr_status TEXT,
  -- pr_checks_status TEXT,
  -- pr_review_status TEXT,
  -- pr_created_at INTEGER,
  -- pr_merged_at INTEGER
);

-- Copy data (excluding dropped columns)
INSERT INTO tasks_new SELECT
  id, type, title, description, documentation, notes,
  status, priority, created_at, assigned_at, started_at, completed_at,
  assigned_agent, assigned_worker, agent_type, prompt, output, error,
  can_retry, retry_count, max_retries, timeout_ms, fingerprint,
  estimated_hours, complexity,
  pr_number, followup_for_pr, followup_tasks
FROM tasks;

-- Drop old table
DROP TABLE tasks;

-- Rename new table
ALTER TABLE tasks_new RENAME TO tasks;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_fingerprint ON tasks(fingerprint);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_worker ON tasks(assigned_worker);
CREATE INDEX IF NOT EXISTS idx_tasks_pr_number ON tasks(pr_number);
CREATE INDEX IF NOT EXISTS idx_tasks_followup_for_pr ON tasks(followup_for_pr) WHERE followup_for_pr IS NOT NULL;

COMMIT;
```

## Additional Schema Recommendations

### Add Chain Tracking (If Not Already Present)

```sql
-- Support for chain-aware task spawning
ALTER TABLE tasks ADD COLUMN chain_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_chain_id ON tasks(chain_id);

-- Track chain depth for blocking logic
ALTER TABLE tasks ADD COLUMN chain_depth INTEGER DEFAULT 0;
```

### Ensure pr_condition_states Has Everything We Need

**Current Schema** (from `010_pr_condition_states.sql`):
```sql
CREATE TABLE IF NOT EXISTS pr_condition_states (
  pr_number INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,           -- ✅ Stores active_fix_tasks fingerprints
  merge_eligible BOOLEAN,             -- ✅ Our evaluation
  ci_checks_passing BOOLEAN,          -- ✅ Our evaluation
  comments_resolved BOOLEAN,          -- ✅ Our evaluation
  no_merge_conflicts BOOLEAN,         -- ✅ Our evaluation
  branch_updated BOOLEAN,             -- ✅ Our evaluation
  no_change_requests BOOLEAN,         -- ✅ Our evaluation
  task_verification BOOLEAN,          -- ✅ Our evaluation
  copilot_review_completed BOOLEAN,   -- ✅ Our evaluation
  final_validation_passed BOOLEAN,    -- ✅ Our evaluation
  has_active_tasks BOOLEAN,           -- ✅ Our tracking
  active_task_count INTEGER,          -- ✅ Our tracking
  last_evaluated INTEGER,             -- ✅ Our timestamp
  last_updated INTEGER,               -- ✅ Our timestamp
  -- NO GITHUB DATA STORED! ✅
);
```

**Verdict**: ✅ **Correct!** This table only stores our evaluations, not GitHub data.

## Code Cleanup Checklist

### Phase 1: Preparation (Before Migration)

- [ ] Update `Task` interface to remove duplicate columns
- [ ] Update `PRWorkflowOrchestrator.registerPR()` to only set `pr_number`
- [ ] Update all `taskQueue.updatePRStatus()` calls to use `prConditionState` instead
- [ ] Update frontend components to fetch PR data from GitHub API
- [ ] Add GitHub query helper methods (e.g., `getPRDetails(prNumber)`)
- [ ] Run tests to identify all references to removed columns

### Phase 2: Migration

- [ ] Create `011_remove_duplicate_pr_columns.sql`
- [ ] Add migration to `database.ts`
- [ ] Test migration on dev database
- [ ] Verify all tests pass
- [ ] Deploy to staging
- [ ] Verify staging functionality
- [ ] Deploy to production

### Phase 3: Verification

- [ ] Confirm no stale data in tasks table
- [ ] Verify PR data queries work correctly
- [ ] Check dev-monitor displays PR info correctly
- [ ] Monitor logs for any "column not found" errors
- [ ] Update documentation

## Testing Strategy

### Unit Tests

```typescript
describe('Task PR Reference', () => {
  it('should only store pr_number, not GitHub data', async () => {
    const task = await taskQueue.createTask({
      title: 'Test task',
      pr_number: 96
    });
    
    expect(task.pr_number).toBe(96);
    expect(task.pr_url).toBeUndefined();      // ✅ Not stored
    expect(task.pr_branch).toBeUndefined();   // ✅ Not stored
    expect(task.pr_status).toBeUndefined();   // ✅ Not stored
  });
  
  it('should query GitHub for PR details', async () => {
    const task = await taskQueue.getTask(taskId);
    const prDetails = await githubPR.getPRStatus(task.pr_number);
    
    expect(prDetails.html_url).toBe('https://github.com/...');
    expect(prDetails.head_ref).toBe('feature/...');
    expect(prDetails.state).toBe('open');
  });
});
```

### Integration Tests

```typescript
describe('PR Workflow Integration', () => {
  it('should use pr_condition_states for PR state tracking', async () => {
    // Create task with PR
    const task = await taskQueue.createTask({ pr_number: 96 });
    
    // Update condition state (not task table)
    await prConditionState.updateCondition(96, {
      ci_checks_passing: false
    });
    
    // Verify condition state
    const conditions = await prConditionState.getConditionState(96);
    expect(conditions.ci_checks_passing).toBe(false);
    
    // Verify task doesn't have PR status
    const refreshedTask = await taskQueue.getTask(task.id);
    expect(refreshedTask.pr_checks_status).toBeUndefined();
  });
});
```

## Performance Considerations

### GitHub API Query Frequency

**Approach**: Query GitHub on-demand, no caching (aligns with design principle: "NEVER use in-memory storage")

**Design Decision**:
- Query GitHub API directly when PR data is needed
- No in-memory caching (violates design principles)
- No SQLite caching initially (see analysis below)
- Rely on pr_condition_states for boolean checks (no API call needed)

**Mitigation Strategies**:
1. **Batching**: Fetch multiple PRs in single GraphQL query when possible
2. **Condition States**: Use pr_condition_states for boolean checks (ci_checks_passing, merge_eligible, etc.)
3. **Smart Fetching**: Only fetch PR details when actually displaying to user
4. **Webhook-Driven Updates**: pr_condition_states updated via webhooks, reducing need for polling

**Implementation**:
```typescript
// ✅ CORRECT - Query GitHub on-demand
class GitHubPRService {
  async getPRStatus(prNumber: number): Promise<PRStatus> {
    // Direct GitHub API call, no caching
    return await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });
  }
}
```

### Database Query Impact

**Before (Stale but Fast)**:
```sql
SELECT pr_url, pr_branch, pr_status FROM tasks WHERE id = ?;
-- 1 query, instant results (stale data)
```

**After (Current but Requires API Call)**:
```typescript
// 1 DB query + 1 GitHub API call (no caching)
const task = await db.query('SELECT pr_number FROM tasks WHERE id = ?', [taskId]);
const prDetails = await github.getPR(task.pr_number); // Direct API call
```

**Verdict**: Acceptable tradeoff - correctness over speed. Simple implementation aligns with design principles.

### SQLite Caching Analysis

**Question**: Should we add a SQLite-based cache table for GitHub API responses?

#### Option A: No Caching (Recommended)

**Implementation**:
```typescript
// Query GitHub directly when needed
async getPRDetails(prNumber: number) {
  return await octokit.pulls.get({ pull_number: prNumber });
}
```

**Pros**:
- ✅ Simplest implementation (no cache management)
- ✅ Always current data (no stale data issues)
- ✅ Aligns with design principle (query source of truth)
- ✅ No cache invalidation logic needed
- ✅ No additional database table/schema
- ✅ Lower code complexity

**Cons**:
- ❌ GitHub API call on every access
- ❌ ~200-500ms latency per PR fetch

**GitHub API Budget**:
- Rate limit: 5000 calls/hour
- Expected usage: 10-50 PR detail fetches/hour
- Buffer: 99% of rate limit available
- **Verdict**: Rate limit is NOT a concern

#### Option B: SQLite Short-Lived Cache

**Schema**:
```sql
CREATE TABLE github_api_cache (
  cache_key TEXT PRIMARY KEY,  -- e.g., "pr:123" or "pr:123:comments"
  response_json TEXT NOT NULL,
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL  -- TTL: 30-60 seconds
);

CREATE INDEX idx_github_cache_expires ON github_api_cache(expires_at);
```

**Implementation**:
```typescript
async getPRDetails(prNumber: number, ttl = 60000) {
  const cacheKey = `pr:${prNumber}`;
  const now = Date.now();

  // Check cache
  const cached = db.query(
    'SELECT response_json FROM github_api_cache WHERE cache_key = ? AND expires_at > ?',
    [cacheKey, now]
  );

  if (cached) {
    return JSON.parse(cached.response_json);
  }

  // Fetch from GitHub
  const response = await octokit.pulls.get({ pull_number: prNumber });

  // Store in cache
  db.query(
    'INSERT OR REPLACE INTO github_api_cache (cache_key, response_json, cached_at, expires_at) VALUES (?, ?, ?, ?)',
    [cacheKey, JSON.stringify(response), now, now + ttl]
  );

  return response;
}
```

**Pros**:
- ✅ Reduces GitHub API calls by ~80-90% (for repeated accesses)
- ✅ Faster response time for cached data (~5-10ms vs 200-500ms)
- ✅ Respects design principle (SQLite, not in-memory)
- ✅ Automatic expiration via TTL

**Cons**:
- ❌ Additional complexity: cache table, TTL management, cleanup
- ❌ Stale data for TTL duration (30-60s)
- ❌ Cache invalidation logic needed for webhook events
- ❌ More code to test and maintain
- ❌ Potential cache poisoning if GitHub data corrupted
- ❌ Background cleanup job needed for expired entries

**Cache Cleanup Required**:
```typescript
// Periodic cleanup of expired entries (every 5 minutes)
setInterval(() => {
  db.query('DELETE FROM github_api_cache WHERE expires_at < ?', [Date.now()]);
}, 5 * 60 * 1000);
```

#### Complexity Analysis

**What We'd Gain from SQLite Caching**:
1. **Performance**: 80-90% reduction in GitHub API calls (for repeated views)
   - Benefit: ~300ms faster for cached responses
   - Reality: Most PR views are one-time, not repeated within 60s

2. **API Rate Limit Buffer**: More headroom for bursts
   - Current buffer: 99% (4950/5000 calls available)
   - With cache: 99.8% (4990/5000 calls available)
   - Gain: Negligible

**What It Would Cost**:
1. **Schema**: +1 table, +1 index, +1 migration
2. **Code**: +50-100 lines cache management logic
3. **Testing**: +5-10 test cases for cache behavior
4. **Maintenance**: Cache invalidation on webhooks, cleanup jobs
5. **Debugging**: Cache-related bugs harder to trace

#### Recommendation: No SQLite Caching

**Rationale**:
1. **GitHub API rate limit is not a bottleneck** (99% headroom)
2. **Most PR views are one-time** (user checks task, sees PR details, moves on)
3. **Complexity cost outweighs benefit** (50-100 lines of code for minimal gain)
4. **Webhook-driven pr_condition_states already reduces API calls** for boolean checks
5. **Correctness > Speed** - Always current data is more valuable than 300ms savings

**When to Revisit**:
- If GitHub API rate limit becomes an issue (>4000 calls/hour sustained)
- If users report slow PR detail loading (>1s latency)
- If we add features that poll PR data frequently (e.g., real-time dashboard)

**Current Decision**: Start with no caching, monitor GitHub API usage, add SQLite cache only if needed.

## Additional Recommendations (Nov 12, 2025)

### 1. Finish PR Column Removal + Consumer Refactor
- Drop `pr_url`, `pr_branch`, `pr_status`, `pr_checks_status`, `pr_review_status`, `pr_created_at`, and `pr_merged_at` from `tasks` when running the pending migration (see `docs/NEXT_PRIORITY_TASKS.md:73-93`).  
- Before executing that migration, refactor every call site (`backend/src/services/prMonitor.service.ts`, `prWorkflowOrchestrator.service.ts`, `taskCompletion.service.ts`, `githubWebhookHandler.service.ts`, `backend/src/services/taskQueue.sqlite.ts`, `adopt-orphaned-prs.js`, relevant frontend components, etc.) so they fetch live data from `GitHubPRService` or `pr_condition_states` rather than reading/writing the soon-to-be-removed columns.  
- Replace `taskQueue.updatePRStatus` with helpers that either (a) fetch GitHub state on demand or (b) read the normalized booleans in `pr_condition_states`.

### 2. Slim Down `pr_review_comments`
- Migration `008_pr_review_comments.sql` and `ReviewCommentTracker` currently persist full GitHub comment bodies, reviewers, and file paths. Store only our derived metadata: `pr_number`, `comment_id`, fingerprint, severity, category, resolution flags, timestamps, and `is_copilot`.  
- When dev-monitor or condition-state evaluators need the body/path, fetch it via `GitHubPRService` or GraphQL at render time so we never hold GitHub-authored text in SQLite.

### 3. Clean `pr_condition_states.state_json`
- `state_json` embeds snippets of GitHub comment text inside `blocking_issues` (see `backend/src/services/prConditionState.service.ts:532-606`). Replace those strings with structured references (`issue_fingerprint`, `github_ref_type`, `github_ref_id`).  
- Any service or UI that needs the human-readable text should resolve the reference through GitHub before displaying it.

### 4. Remove GitHub Branch Names from Quality Tables
- `quality_observations.branch` and `pr_quality_history.branch` (defined in `backend/migrations/005_quality_observations.sql` and populated via `backend/src/services/database.ts:522-566`) mirror GitHub’s head ref. Drop these columns in the same cleanup migration and adjust writers/readers to rely on `pr_number`; fetch branch names from GitHub only when needed.

### 5. Add Schema/Test Guard Rails
- Add a lightweight unit test (e.g., `backend/src/services/__tests__/schemaIntegrity.test.ts`) that fails if new task columns named `pr_*` (other than `pr_number`) are introduced without an explicit exemption.  
- Extend CI linting or `DATABASE_MIGRATION_SAFETY.md` guidelines to require justification whenever a migration proposes storing GitHub-derived fields, giving reviewers an explicit hook to reject future violations.

## Summary

### Key Findings

1. ✅ **pr_condition_states** is correctly designed - stores only our evaluations
2. ❌ **tasks table** has 7 duplicate columns that violate design principles
3. ✅ **GitHub should be source of truth** for PR details
4. ✅ **Our DB should only store** identifiers (pr_number) and our evaluations

### Recommended Actions

**Priority**: P2 (Code Quality - Not Urgent)

1. **Immediate** (0 days): Document the issue (this file)
2. **Short-term** (3-5 days): Update code to stop using duplicate columns
3. **Medium-term** (1 week): Create and test migration
4. **Long-term** (2 weeks): Deploy migration to production

### Estimated Effort

- Code updates: 8-10 hours
- Migration creation/testing: 3-4 hours
- Frontend updates: 2-3 hours
- Testing/verification: 2-3 hours
- **Total**: ~2 days of focused work

### Dependencies

- Should be done **after** PR self-healing implementation (Phase 1-4)
- Can be done **in parallel** with other features
- No blocking dependencies

## References

- [Master Design Intent](../architecture/master-design-intent.md) - Design principles
- [PR Self-Healing Design](./PR_SELF_HEALING_EVENT_DRIVEN_DESIGN.md) - Event-driven architecture
- [Migration 005](../../backend/migrations/005_pr_workflow.sql) - Original PR columns
- [Migration 010](../../backend/migrations/010_pr_condition_states.sql) - Condition states (correct)

---

**Next Steps**:
1. ✅ Get approval for schema cleanup approach
2. ✅ Complete Phase 1 analysis (see below)
3. Begin Phase 2: Code refactoring
4. Create migrations and deploy

---

## Phase 1 Analysis: Code & Schema Audit (Nov 12, 2025)

### Objective
Comprehensive audit of all 4 affected areas to identify every code reference to columns being removed and GitHub data being stored.

### Schema Analysis Complete

#### 1. Tasks Table - 7 Columns to Remove

**Source**: `backend/migrations/005_pr_workflow.sql`

| Column | Line | Usage Pattern | References Found |
|--------|------|---------------|-----------------|
| `pr_url` | 6 | Store GitHub PR URL | 13 backend files |
| `pr_branch` | 7 | Store GitHub branch name | 13 backend files |
| `pr_status` | 8 | Store GitHub PR state | 13 backend files |
| `pr_checks_status` | 9 | Store GitHub checks status | 13 backend files |
| `pr_review_status` | 10 | Store GitHub review status | 13 backend files |
| `pr_created_at` | 11 | Store GitHub PR creation time | 13 backend files |
| `pr_merged_at` | 12 | Store GitHub PR merge time | 13 backend files |

**Associated Indexes to Drop**:
- `idx_tasks_pr_status` (line 22) - No longer needed

**Columns to KEEP**:
- `pr_number` - Foreign key identifier (our data)
- `followup_for_pr` - Our internal relationship tracking
- `followup_tasks` - Our internal chain tracking

#### 2. PR Review Comments Table - 3 Columns to Remove

**Source**: `backend/migrations/008_pr_review_comments.sql`

| Column | Line | Usage Pattern | Replacement Strategy |
|--------|------|---------------|---------------------|
| `file_path` | 8 | Store GitHub comment location | Fetch from GitHub API |
| `body` | 10 | Store full GitHub comment text | Fetch from GitHub API |
| `reviewer` | 17 | Store GitHub username | Fetch from GitHub API |

**Columns to KEEP**:
- `pr_number` - Our reference
- `comment_id` - GitHub identifier (for lookups)
- `fingerprint` - Our computed hash
- `severity` - Our classification
- `category` - Our classification
- `resolved` - Our resolution tracking
- `created_at`, `resolved_at` - Our timestamps
- `is_copilot` - Our classification flag

**Current Usage**:
- Referenced in 2 backend files:
  - `backend/src/services/database.ts`
  - `backend/src/services/reviewCommentTracker.service.ts`

#### 3. PR Condition States - state_json Contains GitHub Data

**Source**: `backend/migrations/010_pr_condition_states.sql`

**Problem**: The `state_json` field (line 8) stores `blocking_issues` arrays that embed GitHub comment text.

**Example from prConditionState.service.ts:569-576**:
```typescript
const blocking_issues: BlockingIssue[] = blockingThreads.map(thread => {
  const firstComment = thread.comments[0];
  return {
    type: 'unresolved_comment',
    description: firstComment.body,  // ❌ GitHub data embedded
    url: firstComment.url,           // ❌ GitHub data embedded
    file_path: thread.path,          // ❌ GitHub data embedded
    severity: 'medium'
  };
});
```

**Solution**: Replace with structured references:
```typescript
const blocking_issues: BlockingIssue[] = blockingThreads.map(thread => {
  const firstComment = thread.comments[0];
  return {
    type: 'unresolved_comment',
    github_ref_type: 'comment',
    github_ref_id: firstComment.id,  // ✅ Reference only
    fingerprint: generateFingerprint(firstComment),
    severity: 'medium'
  };
});
```

**Affected Locations in prConditionState.service.ts**:
- Lines 492-509: CI checks evaluation - stores check names/URLs
- Lines 569-588: Comments evaluation - stores comment bodies
- Lines 634-639: Merge conflicts - stores conflict descriptions

#### 4. Quality Tables - 2 Branch Columns to Remove

**Source**: `backend/migrations/005_quality_observations.sql`

| Table | Column | Line | Current Usage |
|-------|--------|------|---------------|
| `quality_observations` | `branch` | 9 | Stores GitHub branch name |
| `pr_quality_history` | `branch` | 134 | Stores GitHub branch name |

**Current References**:
- `backend/src/services/qualityObservation.service.ts:154` - Sets `branch: task.pr_branch`
- `backend/src/services/database.ts:554` - Inserts `observation.branch`
- `backend/src/services/database.ts:584` - Reads `row.branch`

**Solution**: Remove branch columns, use `pr_number` only, fetch branch from GitHub when needed.

### Code Impact Analysis

#### Backend Files Affected (13 files)

**Files referencing tasks table PR columns**:
1. `backend/src/services/chainTracker.service.ts`
2. `backend/src/services/taskQueue.sqlite.ts` - **HIGH IMPACT** (core DB layer)
3. `backend/src/services/prConditionState.service.ts` - **HIGH IMPACT**
4. `backend/src/services/githubWebhookHandler.service.ts` - **HIGH IMPACT**
5. `backend/src/services/githubPR.service.ts`
6. `backend/src/services/ephemeralWorker.service.ts`
7. `backend/src/services/prMonitor.service.ts` - **HIGH IMPACT**
8. `backend/src/services/taskCompletion.service.ts` - **MEDIUM IMPACT**
9. `backend/src/services/taskPromptTemplates.ts`
10. `backend/src/services/prWorkflowOrchestrator.service.ts` - **HIGH IMPACT**
11. `backend/src/services/prArtifactRecovery.service.ts`
12. `backend/src/services/qualityImprovementTaskGenerator.ts`
13. `backend/src/services/qualityObservation.service.ts` - **MEDIUM IMPACT**

**Files referencing pr_review_comments**:
1. `backend/src/services/database.ts` - **HIGH IMPACT** (migration runner)
2. `backend/src/services/reviewCommentTracker.service.ts` - **HIGH IMPACT**

**Frontend Impact**: ✅ **NONE** - No frontend code references these columns

### Migration Strategy

#### Migration Sequence

**Migration 013: Remove tasks table PR columns** (Priority 1)
- Drop 7 columns from tasks table
- Drop 1 index
- Requires table recreation (SQLite limitation)
- **Prerequisite**: All backend code updated first

**Migration 014: Slim pr_review_comments** (Priority 2)
- Drop 3 columns: file_path, body, reviewer
- Keep identifier and metadata columns
- **Prerequisite**: ReviewCommentTracker refactored

**Migration 015: Clean quality table branches** (Priority 3)
- Drop branch column from quality_observations
- Drop branch column from pr_quality_history
- **Prerequisite**: qualityObservation.service refactored

**Note**: pr_condition_states.state_json cleanup doesn't require migration, only code changes.

### Risk Assessment

#### High Risk Areas

1. **taskQueue.sqlite.ts** - Core data layer
   - Contains Task interface definition
   - All CRUD operations reference PR columns
   - Risk: Breaking changes across entire backend
   - Mitigation: Update interface first, test thoroughly

2. **prWorkflowOrchestrator.service.ts** - PR registration
   - Populates all 7 PR columns on task creation
   - Risk: Tasks created without proper PR reference
   - Mitigation: Refactor to only set pr_number

3. **githubWebhookHandler.service.ts** - Status updates
   - Updates PR status columns on webhook events
   - Risk: Webhook handlers fail silently
   - Mitigation: Update to use prConditionState instead

4. **prConditionState.service.ts** - State management
   - Embeds GitHub data in state_json
   - Risk: Stale data persists in JSON blobs
   - Mitigation: Refactor BlockingIssue structure first

#### Medium Risk Areas

1. **reviewCommentTracker.service.ts** - Comment tracking
   - Stores full comment bodies
   - Risk: Loss of comment history if not migrated properly
   - Mitigation: Ensure comment_id sufficient for GitHub lookups

2. **qualityObservation.service.ts** - Quality tracking
   - References branch names
   - Risk: Quality reports missing branch context
   - Mitigation: Fetch branch via pr_number when needed

#### Low Risk Areas

1. **Frontend** - No impact, no references found
2. **Scripts** - May need updates (adopt-orphaned-prs.js mentioned in doc)
3. **Tests** - Will need updates to match new schema

### Performance Considerations

#### GitHub API Call Frequency

**Before Cleanup** (Current):
```typescript
// 1 DB query, instant (stale data)
const task = await taskQueue.getTask(taskId);
const prUrl = task.pr_url;  // From DB
const branch = task.pr_branch;  // From DB
```

**After Cleanup** (Proposed):
```typescript
// 1 DB query + 1 GitHub API call (current data)
const task = await taskQueue.getTask(taskId);
const prStatus = await githubPR.getPRStatus(task.pr_number);  // From GitHub
const prUrl = prStatus.html_url;  // Current
const branch = prStatus.head.ref;  // Current
```

**Impact Analysis**:
- Additional GitHub API calls per task view: +1
- GitHub rate limit: 5000/hour (plenty of headroom)
- Expected usage: ~10-50 task views per hour = 10-50 API calls/hour
- Headroom: 99% of rate limit available

**Mitigation Strategy**:
1. Use GraphQL batching for multiple PRs when needed
2. Rely on pr_condition_states for boolean checks (no API call needed)
3. Only fetch PR details when displaying to user (not on background tasks)
4. Webhook-driven updates to pr_condition_states reduce polling needs

### Code Refactoring Estimates

| Service | LOC Affected | Complexity | Estimated Hours |
|---------|--------------|------------|----------------|
| taskQueue.sqlite.ts | ~50 lines | High | 3-4 hours |
| prWorkflowOrchestrator.service.ts | ~30 lines | High | 2-3 hours |
| githubWebhookHandler.service.ts | ~25 lines | Medium | 2 hours |
| prConditionState.service.ts | ~40 lines | High | 3 hours |
| prMonitor.service.ts | ~20 lines | Medium | 2 hours |
| reviewCommentTracker.service.ts | ~30 lines | Medium | 2-3 hours |
| qualityObservation.service.ts | ~15 lines | Low | 1 hour |
| Other services (6 files) | ~30 lines | Low | 2 hours |
| **Total Backend** | ~240 lines | - | **17-20 hours** |
| Migration files | 3 files | Medium | 3-4 hours |
| Testing & verification | - | High | 4-6 hours |
| **Grand Total** | - | - | **24-30 hours** |

### Next Steps for Phase 2

**Phase 2A: Core Backend Refactoring** (2-3 days)
1. ✅ Update Task interface in taskQueue.sqlite.ts (remove 7 PR columns)
2. ✅ Refactor prWorkflowOrchestrator to only set pr_number
3. ✅ Update githubWebhookHandler to use prConditionState
4. ✅ Refactor BlockingIssue structure in prConditionState.service (remove embedded GitHub data)
5. ✅ Update reviewCommentTracker to store only metadata (remove body, file_path, reviewer)
6. ✅ Update qualityObservation.service to remove branch refs
7. ✅ Add on-demand GitHub query helpers to GitHubPRService
8. ✅ Run tests to identify remaining references

**Phase 2B: Migration Creation** (0.5-1 day)
1. ✅ Create migration 013: tasks table cleanup
2. ✅ Create migration 014: pr_review_comments slim
3. ✅ Create migration 015: quality tables cleanup
4. ✅ Test migrations on dev database

**Phase 2C: Testing & Deployment** (1-2 days)
1. ✅ Run full test suite
2. ✅ Create schemaIntegrity.test.ts guard rail
3. ✅ Manual testing on staging
4. ✅ Deploy to production

### Phase 1 Complete - Ready for Phase 2

**Date Completed**: 2025-11-12
**Analysis Quality**: Comprehensive - All 4 areas audited
**Code References Found**: 13 backend files, 0 frontend files
**Risk Level**: Medium-High (core data layer changes)
**Estimated Total Effort**: 24-30 hours (3-4 days)
**Ready to Proceed**: Yes - Clear migration path identified
