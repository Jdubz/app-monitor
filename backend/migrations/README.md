# Database Migrations

This directory contains SQL migration files for the dev-monitor SQLite database.

## ✨ New Automated Migration System

We now have an elegant migration management system!

### Quick Start

```bash
# Check migration status
npm run migrate status

# List all migrations
npm run migrate list

# Apply pending migrations
npm run migrate up

# Create new migration
npm run migrate create my_feature_name
```

### Features

- ✅ **Auto-discovery**: Automatically finds and applies migrations
- ✅ **Error handling**: Graceful failures with detailed logging
- ✅ **Transaction safety**: Each migration runs in a transaction
- ✅ **CLI tools**: Easy commands for managing migrations
- ✅ **Tracking**: Records applied migrations in database
- ✅ **Validation**: Checksums detect modified migrations

## Migration Files

### 001_initial_schema (Applied via database.ts)
- Task execution history (`task_executions`)
- Token usage tracking (`token_usage`)
- Experiments tracking (`experiments`)
- Batch approvals (`batch_approvals`)
- Failure patterns (`failure_patterns`)

### 002_tasks_table.sql
**Purpose**: Core tasks table for dev-bot task queue

Creates the primary `tasks` table that stores all dev-bot tasks with their lifecycle, configuration, and execution results. This table is aligned with the `TaskSchema` from `src/types/taskSchema.ts`.

**Tables**:
- `tasks` - Primary task queue table

**Indexes**:
- `idx_tasks_status` - Fast status filtering
- `idx_tasks_type` - Task type grouping
- `idx_tasks_assigned_worker` - Worker-specific queries
- `idx_tasks_assigned_agent` - Agent routing
- `idx_tasks_project` - Project-scoped queries
- `idx_tasks_priority` - Priority sorting
- `idx_tasks_created` - Chronological ordering
- `idx_tasks_status_priority` - Composite index for common query pattern

### 003_task_persistence_schema.sql
**Purpose**: Documentation and reference for complete task schema

This is a **documentation-only** migration that provides comprehensive documentation for the entire task persistence schema, including:
- Complete schema reference with all tables and indexes
- Query patterns and optimization strategies
- Data type rationale and design decisions
- Migration path from JSON to SQLite
- Performance characteristics and tuning
- Backup and recovery procedures
- Maintenance and troubleshooting guides

**Note**: This file does not create any tables. It serves as a reference document for developers working with the task persistence system.

### 004_task_context.sql
**Purpose**: Task context and automation run tracking

Adds rich diagnostic context capture for dev-bot automation runs. Tracks every execution attempt with full telemetry.

**Tables**:
- `task_automation_runs` - Execution attempts with telemetry
- `task_commands` - Shell commands executed per run
- `task_file_operations` - File operations tracking
- `task_git_operations` - Git operations tracking
- `task_artifacts` - Artifacts (logs, patches, reports)
- `task_build_outputs` - Build results (denormalized)
- `task_test_results` - Test results and coverage

**Views**:
- `v_automation_success_by_type` - Success rates by task type
- `v_recent_automation_runs` - Recent runs with task details
- `v_task_retry_stats` - Retry statistics

### 005_pr_workflow.sql
**Purpose**: PR workflow and tracking tables

### 005_quality_observations.sql  
**Purpose**: Quality observations and metrics

### 007_interactive_sessions.sql (OBSOLETE)
**Purpose**: Interactive session management (removed in migration 028 - replaced with tmux-based terminal)

### 008_pr_review_comments.sql
**Purpose**: PR review comment tracking and fingerprinting

### 009_task_context_storage.sql
**Purpose**: Task context storage

### 010_pr_condition_states.sql
**Purpose**: PR condition state tracking for self-healing

### 011_add_chain_tracking.sql ✨
**Purpose**: Chain tracking for PR fix tasks

Adds chain tracking support for PR self-healing with depth-limited healing:
- `chain_id` - Links all tasks in a fix chain
- `chain_depth` - Tracks depth in chain (max 4 reviews/fixes)

**Columns Added**:
- `chain_id` TEXT - Chain identifier
- `chain_depth` INTEGER - Depth in chain (default 0)

**Indexes**:
- `idx_tasks_chain_id` - Efficient chain queries

**Related**: PR self-healing and event-driven fix spawning

### 012_staged_queue.sql ✨ **[CORE FEATURE]**
**Purpose**: Staged queue system for chain-aware scheduling

Implements chain-aware task scheduling that separates implementation tasks (new chains) from follow-up tasks (REVIEW/FIX), enforcing concurrency limits to prevent dev-bot pool saturation.

**Columns Added**:
- `queue_stage` ENUM ('implementation', 'followup') - Queue separation
- `chain_status` ENUM ('pending', 'active', 'blocked', 'closed') - Chain lifecycle
- `blocked_reason` TEXT - Human intervention context
- `blocked_at` INTEGER - Block timestamp
- `blocked_by` TEXT - Operator who blocked

**Indexes**:
- `idx_tasks_queue_stage` - Queue filtering
- `idx_tasks_chain_status` - Chain state queries
- `idx_tasks_active_chains` - Active chain counting (partial index)

**Configuration**: Chain concurrency matches `MAX_DEV_BOTS` (default 3)

**Related**: 
- Design: `docs/technicalDesigns/staged-task-queue.md`
- Implementation: `backend/src/services/chainTracker.service.ts`
- UI: `frontend/src/components/dev-bots/queue/ChainStatusPanel.tsx`

### 013_remove_duplicate_pr_columns.sql ✨ **[Phase 2B Cleanup]**
**Purpose**: Remove duplicate PR columns from tasks table

Follows design principle: "Any information available from GitHub should NOT be stored in our DB"

> This avoids data staleness, reduces unnecessary storage, and ensures GitHub remains the source of truth.

**Columns Removed**:
- `pr_url` - Redundant (can construct from pr_number)
- `pr_branch` - Redundant (available via GitHub API)
- `pr_status` - Redundant (available via GitHub API)
- `pr_checks_status` - Redundant (available via GitHub API)
- `pr_review_status` - Redundant (available via GitHub API)
- `pr_created_at` - Redundant (available via GitHub API)
- `pr_merged_at` - Redundant (available via GitHub API)

**Retained**: `pr_number` (foreign key reference only)

### 014_slim_pr_review_comments.sql ✨ **[Phase 2B Cleanup]**
**Purpose**: Remove GitHub data from pr_review_comments table

Stores only metadata (fingerprint, severity, resolution) following "no GitHub data duplication" principle.

**Columns Removed**:
- `file_path` - Available via GitHub API
- `line_number` - Available via GitHub API
- `body` - Available via GitHub API
- `reviewer` - Available via GitHub API

**Retained**: Metadata only (pr_number, comment_id, fingerprint, severity, category, resolution status)

### 015_clean_quality_observations.sql ✨ **[Phase 2B Cleanup]**
**Purpose**: Remove branch column from quality_observations

Branch names can be fetched on-demand using pr_number.

**Columns Removed**:
- `branch` - Redundant (available via pr_number lookup)

### 028_drop_interactive_sessions.sql ✨ **[Terminal Simplification]**
**Purpose**: Remove interactive_sessions table - replaced with tmux-based terminal

Interactive sessions now use tmux for persistence instead of database tracking. Sessions are managed entirely via TerminalService and Socket.IO events.

**Tables Removed**:
- `interactive_sessions` - Session state now managed by tmux

**Migration Path**:
- Old REST API endpoints removed
- InteractiveSessionManager replaced by TerminalService
- Socket.IO events: `terminal:create`, `terminal:attach`, `terminal:input`, `terminal:output`

## Migration System

Migrations are applied automatically by `src/services/database.ts` during initialization. The database tracks applied migrations in the `migrations` table.

### Adding a New Migration

1. Create a new SQL file with naming convention: `<number>_<description>.sql`
   - Example: `005_add_new_feature.sql`

2. Update `src/services/database.ts` to apply the migration:
   ```typescript
   this.applyMigration('005_add_new_feature', () => {
     this.db.exec(fs.readFileSync(
       path.join(__dirname, '..', '..', 'migrations', '005_add_new_feature.sql'),
       'utf-8'
     ));
   });
   ```

3. Test the migration:
   - Start with a clean database
   - Verify all tables and indexes are created
   - Run sample queries to verify functionality
   - Check migration tracking: `SELECT * FROM migrations;`

## Schema Documentation

For complete schema documentation, including:
- Data type rationale
- Index strategy
- Query patterns
- Performance characteristics
- Migration from JSON to SQLite
- Backup and recovery procedures
- Troubleshooting guides

See: [`003_task_persistence_schema.sql`](./003_task_persistence_schema.sql)

## Database Configuration

**Location**: `/workspace/dev-bots.db`

**Mode**: WAL (Write-Ahead Logging)
- Enables concurrent reads and writes
- Better crash recovery
- Non-blocking reads during writes

**Connection**: Managed by `src/services/database.ts`
- Singleton pattern via `getDatabase()`
- Automatic migration on initialization
- Proper connection cleanup via `closeDatabase()`

## Common Operations

### View Applied Migrations
```sql
SELECT * FROM migrations ORDER BY applied_at;
```

### Check Database Integrity
```sql
PRAGMA integrity_check;
```

### View Database Statistics
```sql
PRAGMA page_count;
PRAGMA page_size;
PRAGMA freelist_count;
```

### Analyze Query Performance
```sql
EXPLAIN QUERY PLAN
SELECT * FROM tasks WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC;
```

### Backup Database
```bash
# Online backup (no downtime)
sqlite3 dev-bots.db ".backup dev-bots-backup.db"

# Or copy file (requires app shutdown)
cp dev-bots.db dev-bots-backup.db
cp dev-bots.db-wal dev-bots-backup.db-wal
cp dev-bots.db-shm dev-bots-backup.db-shm
```

## Troubleshooting

### "Database is locked" error
```sql
-- Check journal mode (should be "wal")
PRAGMA journal_mode;

-- If not WAL, enable it:
PRAGMA journal_mode=WAL;
```

### Slow queries
```sql
-- Analyze query plan
EXPLAIN QUERY PLAN <your-query>;

-- Update statistics
ANALYZE;
```

### Large database file
```sql
-- Reclaim space
VACUUM;

-- Check auto-vacuum setting
PRAGMA auto_vacuum;
```

## Related Files

- `src/services/database.ts` - Database wrapper and migration runner
- `src/services/taskPersistence.ts` - JSON persistence (being migrated to SQLite)
- `src/types/taskSchema.ts` - TypeScript type definitions
- `src/services/taskQueueManager.ts` - Task queue management (uses tasks table)

## References

- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [better-sqlite3 Library](https://github.com/WiseLibs/better-sqlite3)
- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
- [SQLite Query Planning](https://www.sqlite.org/queryplanner.html)
