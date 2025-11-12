# Database Reorganization Plan

## Problem Statement

The app-monitor project has inconsistent database locations and multiple unused database files:

### Current State (Problematic)

**Development Environment:**
- `./dev-bots.db` (root directory) - Duplicate/unused
- `./backend/data/dev-bots.db` - Main metrics database (380KB, actively used)
- `./backend/data/tasks/queue.db` - Task queue database (1.2MB, actively used)
- `./backend/data/app-monitor.db` - Empty/unused (0 bytes)
- `./backend/data/task-queue.db` - Empty/unused (0 bytes)
- `./backend/data/tasks.db` - Empty/unused (0 bytes)

**Production Environment:**
- `/opt/app-monitor/shared/backend/data/dev-bots.db` - Main production database

**Issues:**
1. **Multiple databases for related data** - Task queue and metrics split across files
2. **Inconsistent naming** - `dev-bots.db` vs `tasks/queue.db`
3. **Confusing locations** - Some in `data/`, some in `data/tasks/`
4. **Unused files** - Multiple empty .db files cluttering the project
5. **Configuration complexity** - Different paths in different places

## Solution: Single Consolidated Database

### New Structure

**Single Database File:**
```
backend/data/app-monitor.db
```

This database contains ALL tables:
- Task queue (tasks, task metadata)
- Agent metrics (task_executions, agent_stats)
- Token tracking
- Interactive sessions
- Batch approvals
- Failure patterns
- Quality observations
- Migrations tracking

### Benefits

1. **Simplicity** - One database file to backup, migrate, and manage
2. **Atomic transactions** - Related data updates can be atomic across all tables
3. **Better performance** - SQLite performs best with single database
4. **Consistent configuration** - One `DATABASE_PATH` environment variable
5. **Easier testing** - Single database to mock/reset in tests

## Implementation Plan

### Phase 1: Update Code

1. **Update database initialization**
   - Merge `DevBotsDatabase` and `TaskQueueService` schemas into single DB
   - Update both classes to accept same database path
   - Ensure both use same Database instance (WAL mode)

2. **Update configuration**
   - Change `config.ts` default to `../data/app-monitor.db`
   - Update `.env.example` with new path
   - Update systemd service files

3. **Update factories**
   - `taskQueue.factory.ts` - use config.databasePath
   - `devBotsManager.factory.ts` - use config.databasePath

### Phase 2: Migration Strategy

```typescript
// Migration script to combine databases
1. Create new app-monitor.db
2. Copy all schema from dev-bots.db
3. Copy all schema from tasks/queue.db
4. Copy all data from both databases
5. Verify data integrity
6. Backup old databases
7. Update config to point to new database
```

### Phase 3: Cleanup - ⚠️ PARTIAL (Updated 2025-11-11)

1. **Remove unused files**
   - ~~Delete `app-monitor.db` (empty)~~ - NOW ACTIVE (1.4MB) - Contains task queue
   - [x] ✅ Delete `task-queue.db` (empty) - DONE 2025-11-11
   - [x] ✅ Delete `tasks.db` (empty) - DONE 2025-11-11
   - [x] ✅ Delete `./dev-bots.db` (root, duplicate) - VERIFIED NOT PRESENT

**Current State**:
   - `app-monitor.db` (1.4MB) - Active task queue
   - `dev-bots.db` (484KB) - Active legacy metrics
   - `tasks/queue.db` (1.2MB) - Active task queue (duplicate schema)

**Remaining Work**: Consolidate `dev-bots.db` and `tasks/queue.db` into `app-monitor.db`

2. **Update .gitignore**
   - Keep `*.db` pattern (all databases git-ignored)
   - Ensure `backend/data/` is git-ignored

3. **Update documentation**
   - Update setup guides with new database path
   - Update deployment docs
   - Update backup scripts

## Configuration Changes

### Before
```typescript
// config.ts
databasePath: process.env.DATABASE_PATH || path.join(__dirname, '../data/dev-bots.db')

// taskQueue.factory.ts
const queueDbPath = dbPath ?? './data/tasks/queue.db';

// Multiple separate databases
```

### After
```typescript
// config.ts
databasePath: process.env.DATABASE_PATH || path.join(__dirname, '../data/app-monitor.db')

// taskQueue.factory.ts
const queueDbPath = dbPath ?? config.databasePath; // Use same database

// Single unified database
```

## Environment Variables

### Development (.env)
```bash
# Single database for all data
DATABASE_PATH=./backend/data/app-monitor.db
```

### Production (systemd)
```ini
Environment="DATABASE_PATH=/opt/app-monitor/shared/backend/data/app-monitor.db"
```

## Database Schema

### Unified Schema in app-monitor.db

**Task Management:**
- `tasks` - Task queue entries
- `task_metadata` - Extended task information
- `task_executions` - Execution history and metrics

**Agent Performance:**
- `agent_stats` - Agent comparison metrics by type
- `agent_task_type_stats` - Breakdown by task type (implementation, testing, docs)

**Quality & Tracking:**
- `quality_observations` - Quality gate results
- `failure_patterns` - Failure analysis
- `batch_approvals` - Batch processing state
- `token_usage_daily` - Token consumption tracking

**Interactive Sessions:**
- `interactive_sessions` - Live Claude sessions
- `session_heartbeats` - Keepalive tracking

**System:**
- `migrations` - Schema version tracking

## Testing Strategy

1. **Create migration script** that:
   - Creates new unified database
   - Copies all data from existing databases
   - Validates data integrity
   - Provides rollback capability

2. **Test in development** first:
   - Run migration script
   - Run all unit tests
   - Run integration tests
   - Verify all features work

3. **Deploy to production**:
   - Backup existing databases
   - Run migration during maintenance window
   - Verify health checks pass
   - Keep old databases for 7 days as backup

## Rollback Plan

If issues occur after migration:

1. Stop backend service
2. Rename `app-monitor.db` to `app-monitor.db.failed`
3. Restore from backup:
   - Copy `dev-bots.db.backup` to `dev-bots.db`
   - Copy `tasks/queue.db.backup` to `tasks/queue.db`
4. Revert configuration changes
5. Restart backend service

## Timeline

- **Phase 1 (Code Updates)**: 2-3 hours
- **Phase 2 (Migration Script)**: 1-2 hours
- **Phase 3 (Testing)**: 2-3 hours
- **Phase 4 (Cleanup)**: 1 hour
- **Total**: ~8 hours

## Success Criteria

- ✅ Single database file contains all data
- ✅ All tests pass
- ✅ Backend starts successfully with new config
- ✅ No unused .db files in project
- ✅ Production deployment successful
- ✅ Documentation updated
- ✅ Backup strategy in place

## Future Considerations

### Database Growth
- Monitor `app-monitor.db` size
- Implement log rotation for old executions
- Consider archiving completed tasks > 90 days

### Performance
- SQLite WAL mode handles concurrent access well
- Single database reduces I/O overhead
- Indexes already optimized for queries

### Backup Strategy
```bash
# Daily backup script
cp backend/data/app-monitor.db backend/data/backups/app-monitor-$(date +%Y%m%d).db

# Keep last 7 days
find backend/data/backups/ -name "app-monitor-*.db" -mtime +7 -delete
```

## References

- SQLite WAL Mode: https://www.sqlite.org/wal.html
- Database Normalization: Current schema already normalized
- Better-sqlite3 Docs: https://github.com/WiseLibs/better-sqlite3
