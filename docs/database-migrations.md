# Database Migration Management System

## Overview

Elegant, automated database migration system that provides:
- **Auto-discovery**: Automatically finds migration files in `backend/migrations/`
- **Tracking**: Records applied migrations in `migrations` table
- **Error handling**: Graceful failures with rollback support
- **CLI tools**: Easy-to-use command-line interface
- **Validation**: Checks migration files before execution
- **Logging**: Detailed logging and alerts on failures

## Architecture

```
backend/
├── migrations/              # SQL migration files
│   ├── 001_initial.sql
│   ├── 002_tasks_table.sql
│   ├── 012_staged_queue.sql
│   └── README.md
├── src/
│   ├── services/
│   │   └── migrationManager.ts   # Core migration logic
│   └── scripts/
│       └── migrate.ts            # CLI tool
└── package.json             # npm run migrate commands
```

## Migration Manager (`migrationManager.ts`)

### Features

1. **Auto-Discovery**
   - Scans `backend/migrations/` for `.sql` files
   - Parses filenames: `<number>_<description>.sql`
   - Sorts migrations by number

2. **Tracking Table**
   ```sql
   CREATE TABLE migrations (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     filename TEXT NOT NULL,
     applied_at INTEGER NOT NULL,
     duration_ms INTEGER,
     checksum TEXT,
     status TEXT CHECK(status IN ('applied', 'failed'))
   );
   ```

3. **Transaction Safety**
   - Each migration runs in a transaction
   - Automatic rollback on failure
   - Records success/failure with timestamp

4. **Checksum Validation**
   - Calculates checksum of SQL content
   - Detects if migration file was modified after application
   - Warns if checksums don't match

5. **Error Handling**
   - Try-catch around each migration
   - Detailed error logging
   - Stops on first failure (prevents cascading issues)
   - Records failed migrations for debugging

### Usage in Code

```typescript
import { MigrationManager } from './services/migrationManager.js';

const db = new Database('data/dev-bots.db');
const migrationManager = new MigrationManager(db);

// Run all pending migrations
const result = await migrationManager.runMigrations();

if (result.success) {
  console.log(`Applied ${result.applied} migrations`);
} else {
  console.error(`Failed ${result.failed} migrations`);
}

// Get status
const status = migrationManager.getStatus();
console.log(`${status.pending} pending migrations`);

// List all migrations
const migrations = migrationManager.listMigrations();
for (const m of migrations) {
  console.log(`${m.id}: ${m.name} [${m.status}]`);
}
```

## CLI Tool (`migrate.ts`)

### Commands

#### 1. Check Status
```bash
npm run migrate status
```

Output:
```
📊 Migration Status

Available:  12
Applied:    10
Pending:    2
Failed:     0

⚠️  2 pending - run 'npm run migrate up'
```

#### 2. List All Migrations
```bash
npm run migrate list
```

Output:
```
📋 Migrations

✅ 001: initial schema
✅ 002: tasks table
⏳ 012: staged queue
⏳ 013: remove deprecated columns
```

#### 3. Apply Pending Migrations
```bash
npm run migrate up
```

Output:
```
🚀 Applying migrations...

✅ 012: staged queue (45ms)
✅ 013: remove deprecated columns (12ms)

Applied: 2, Failed: 0
```

#### 4. Create New Migration
```bash
npm run migrate create add_user_preferences
```

Output:
```
✅ Created migration file: 013_add_user_preferences.sql
   Path: backend/migrations/013_add_user_preferences.sql

📝 Next steps:
   1. Edit the migration file and add your SQL
   2. Test the migration: npm run migrate up
   3. Commit the migration file to version control
```

## Migration File Format

### Naming Convention
```
<number>_<description>.sql
```

Examples:
- `001_initial_schema.sql`
- `012_staged_queue.sql`
- `013_remove_deprecated_columns.sql`

### File Structure

```sql
-- Migration 012: Staged Queue System
-- Created: 2025-11-12T08:00:00Z
-- 
-- Description:
--   Adds queue_stage and chain_status columns for chain-aware task scheduling
-- 
-- Related:
--   - docs/technicalDesigns/staged-task-queue-implementation-plan.md
--   - Issue #123: Implement staged queue

-- Add columns
ALTER TABLE tasks ADD COLUMN queue_stage TEXT 
  CHECK(queue_stage IN ('implementation', 'followup'));

ALTER TABLE tasks ADD COLUMN chain_status TEXT 
  CHECK(chain_status IN ('pending', 'active', 'blocked', 'closed'));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tasks_queue_stage ON tasks(queue_stage);
CREATE INDEX IF NOT EXISTS idx_tasks_chain_status ON tasks(chain_status);

-- Backfill existing data
UPDATE tasks 
SET queue_stage = CASE 
  WHEN original_task_id IS NULL THEN 'implementation'
  ELSE 'followup'
END
WHERE queue_stage IS NULL;

-- Migration complete
```

### Best Practices

1. **Idempotent Operations**
   - Use `IF NOT EXISTS` for CREATE statements
   - Use `WHERE column IS NULL` for backfills
   - Check for existing data before modifications

2. **Comments**
   - Describe what the migration does
   - Link to related documentation/issues
   - Explain any complex logic

3. **Indexes**
   - Create indexes for new columns
   - Use partial indexes where appropriate
   - Consider query patterns

4. **Data Backfilling**
   - Provide default values for existing rows
   - Use CASE statements for conditional logic
   - Test with production-like data volumes

5. **Testing**
   - Test on a copy of production database
   - Verify migration can be applied cleanly
   - Check performance impact

## Integration with TaskQueueService

The `TaskQueueService` automatically runs migrations on initialization:

```typescript
private runMigrations(): void {
  // Use new MigrationManager
  const migrationManager = new MigrationManager(this.db);
  
  migrationManager.runMigrations().then(result => {
    if (!result.success) {
      logger.error({
        category: 'database',
        action: 'migration_failures_detected',
        message: `${result.failed} migration(s) failed`
      });
      console.error('⚠️  DATABASE MIGRATION FAILURES - Some features may not work');
    } else if (result.applied > 0) {
      logger.info({
        category: 'database',
        action: 'migrations_applied',
        message: `Successfully applied ${result.applied} migration(s)`
      });
    }
  });
  
  // Keep legacy inline migrations for backward compatibility
  this.runLegacyMigrations();
}
```

## Transition Plan

### Phase 1: Parallel Systems (Current)
- New SQL-based migration system runs first
- Legacy inline migrations still run (backward compatibility)
- Both systems coexist without conflicts

### Phase 2: Migration to SQL Files
- Convert inline migrations to SQL files
- Test on staging environment
- Verify all migrations work correctly

### Phase 3: Remove Legacy System
- Remove `runLegacyMigrations()` method
- Remove inline migration code
- Update documentation

## Troubleshooting

### Migration Failed

**Problem**: Migration fails to apply

**Solution**:
1. Check logs for error details
2. Verify SQL syntax in migration file
3. Test migration on dev database
4. Check for data conflicts or constraints
5. Fix migration file and re-run

```bash
# Check migration status
npm run migrate list

# Check database logs
tail -f backend/logs/dev-monitor-*.log | grep migration
```

### Pending Migrations on Production

**Problem**: Production has pending migrations

**Solution**:
```bash
# 1. Backup database first!
sqlite3 data/dev-bots.db ".backup data/dev-bots-backup.db"

# 2. Check what's pending
npm run migrate status

# 3. Review migrations
npm run migrate list

# 4. Apply migrations
npm run migrate up

# 5. Verify application works
curl http://localhost:5002/health
```

### Migration Applied But Schema Wrong

**Problem**: Migration shows as applied but changes aren't present

**Solution**:
1. Check if migration actually modified database:
   ```sql
   PRAGMA table_info(tasks);
   ```

2. Check migration file for syntax errors

3. Manually apply migration (with transaction):
   ```sql
   BEGIN TRANSACTION;
   -- Paste migration SQL here
   COMMIT;
   ```

4. Mark migration as failed and re-run:
   ```sql
   UPDATE migrations SET status = 'failed' WHERE id = 12;
   ```
   ```bash
   npm run migrate up
   ```

### Checksum Mismatch

**Problem**: Migration file was modified after application

**Solution**:
- **DO NOT** modify applied migrations
- Create a new migration to fix issues
- Only modify if migration hasn't been applied to production

## Monitoring

### Health Checks

Add migration status to health endpoint:

```typescript
app.get('/health', (req, res) => {
  const migrationManager = new MigrationManager(db);
  const status = migrationManager.getStatus();
  
  res.json({
    status: 'healthy',
    database: {
      migrations: {
        available: status.available,
        applied: status.applied,
        pending: status.pending,
        failed: status.failed
      }
    }
  });
});
```

### Alerts

Set up alerts for:
- Failed migrations
- Pending migrations in production
- Migration taking too long (>5 seconds)

### Logging

Migration manager logs to structured logging:

```json
{
  "severity": "INFO",
  "category": "database",
  "action": "migration_applied",
  "message": "Successfully applied migration 012: staged queue",
  "details": {
    "id": 12,
    "name": "staged queue",
    "duration_ms": 45
  }
}
```

## Future Enhancements

1. **Rollback Support**
   - Add `down` migrations for rollback
   - `npm run migrate down` command

2. **Dry Run Mode**
   - `npm run migrate up --dry-run`
   - Shows what would be applied without applying

3. **Migration Dependencies**
   - Declare dependencies between migrations
   - Ensure correct order even with gaps

4. **Parallel Migrations**
   - Run independent migrations in parallel
   - Faster for large migration sets

5. **Schema Diff Tool**
   - Compare database schema to expected schema
   - Detect drift or manual changes

6. **Multi-Database Support**
   - Support multiple databases
   - Coordinate migrations across databases

## References

- [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html)
- [SQLite Transactions](https://www.sqlite.org/lang_transaction.html)
- [SQLite Pragma Statements](https://www.sqlite.org/pragma.html)
- [Migration Best Practices](https://www.sqlite.org/bestpractice.html)
