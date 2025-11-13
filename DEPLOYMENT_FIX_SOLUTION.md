# Deployment Failure - Root Cause and Solution

**Date**: November 13, 2025  
**Status**: IDENTIFIED - Ready to Fix  
**Priority**: P0 - Critical

---

## Root Cause Identified ✅

The deployment failure is caused by **DUAL SCHEMA DEFINITIONS** for the tasks table:

### Problem Summary

1. **DevBotsDatabase** (database.ts) uses migrations to create tasks table with:
   - `project` column
   - NO `fingerprint` column
   - Based on migration 002_tasks_table.sql

2. **TaskQueueService** (taskQueue.sqlite.ts) has its own `createSchema()` method that tries to create tasks table with:
   - `fingerprint` column  
   - NO `project` column
   - Different schema entirely

### What Happened

```
1. Migrations run successfully → tasks table created with `project` column
2. TaskQueueService initializes → calls createSchema()
3. createSchema() tries to add/modify tasks table
4. SQL fails: "no such column: fingerprint" (or "no such column: project")
5. Backend crashes on startup
```

---

## The Fix

There are two approaches:

### Option 1: Quick Fix - Use Last Known Good Deployment ⚡

**Rollback to release `20251108_221301`** (current.backup):

```bash
cd /opt/app-monitor
sudo -u jdubz ln -sfn /opt/app-monitor/releases/20251108_221301 current
sudo systemctl restart app-monitor-backend@5001.service
```

**Pros**: Immediate recovery  
**Cons**: Loses recent features, doesn't fix root cause

### Option 2: Proper Fix - Align Schema Definitions 🔧

**Make TaskQueueService use the migration-based schema**:

#### Step 1: Update taskQueue.sqlite.ts

```typescript
// backend/src/services/taskQueue.sqlite.ts

private createSchema(): void {
  // DON'T create tasks table - it's created by migrations!
  // Only create tables that are NOT in migrations
  
  this.db.exec(`
    -- Worker tracking (not in migrations)
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      heartbeat_at INTEGER NOT NULL,
      task_id TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    -- PR followup fingerprints (not in migrations)
    CREATE TABLE IF NOT EXISTS pr_followup_fingerprints (
      pr_number INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (pr_number, fingerprint)
    );

    CREATE INDEX IF NOT EXISTS idx_fingerprints_pr ON pr_followup_fingerprints(pr_number);
  `);
}
```

#### Step 2: Add fingerprint column to tasks table via migration

Create **`backend/migrations/016_add_fingerprint_column.sql`**:

```sql
-- Migration 016: Add fingerprint column to tasks table
-- Unifies TaskQueueService and DevBotsDatabase schemas

-- Add fingerprint column if it doesn't exist
ALTER TABLE tasks ADD COLUMN fingerprint TEXT;

-- Create index for fingerprint lookups
CREATE INDEX IF NOT EXISTS idx_tasks_fingerprint ON tasks(fingerprint);
```

#### Step 3: Update database.ts to run the new migration

```typescript
// backend/src/services/database.ts

// Add after migration 015
this.applyMigration('016_add_fingerprint_column', () => {
  this.db.exec(fs.readFileSync(
    path.join(__dirname, '..', '..', 'migrations', '016_add_fingerprint_column.sql'),
    'utf-8'
  ));
});
```

#### Step 4: Update Task interface

```typescript
// backend/src/types/task.ts or taskSchema.ts

export interface Task {
  // ... existing fields ...
  fingerprint?: string;  // Add this
}
```

#### Step 5: Build, test, and deploy

```bash
cd /home/jdubz/Development/app-monitor
npm run build -w backend
npm run test -w backend

# Test locally first
DATABASE_PATH=./test.db PORT=5099 node backend/dist/index.js

# If successful, commit and push
git add backend/migrations/016_add_fingerprint_column.sql
git add backend/src/services/taskQueue.sqlite.ts
git add backend/src/services/database.ts
git commit -m "fix: align TaskQueueService and DevBotsDatabase schemas

- Remove duplicate tasks table creation from TaskQueueService
- Add fingerprint column via migration 016
- Fixes deployment failure from schema conflicts"

git push origin staging
# Merge to main after testing
```

---

## Prevention Strategy

### 1. Schema Management Rules

**RULE**: There must be ONE source of truth for database schema.

- ✅ **DO**: Use migrations for ALL schema changes
- ❌ **DON'T**: Create tables in service initialization code
- ❌ **DON'T**: Have multiple services managing the same tables

### 2. Pre-Deployment Schema Validation

Add to `.github/workflows/deploy-production.yml`:

```yaml
- name: Validate Database Schema
  run: |
    # Check for duplicate table definitions
    echo "Checking for schema conflicts..."
    
    # Ensure all tables are defined in migrations
    grep -r "CREATE TABLE" backend/src/services/*.ts && {
      echo "ERROR: Found CREATE TABLE in service files!"
      echo "All tables must be created via migrations"
      exit 1
    } || echo "✓ No direct table creation in services"
```

### 3. Migration Testing

Add to deployment script:

```bash
# scripts/deploy.sh

validate_migrations() {
  log "INFO" "Validating database migrations..."
  
  # Create test database
  local test_db="/tmp/migration-test-$$.db"
  
  # Run migrations
  DATABASE_PATH="$test_db" node backend/dist/index.js --validate-schema || {
    log "ERROR" "Migration validation failed"
    rm -f "$test_db"
    return 1
  }
  
  rm -f "$test_db"
  log "INFO" "✓ Migrations validated successfully"
}
```

### 4. Documentation Updates

**docs/ARCHITECTURE.md**:

```markdown
## Database Schema Management

### Schema Definition
- ALL tables MUST be created via migrations in `backend/migrations/`
- Services MUST NOT create tables in initialization code
- Use `CREATE TABLE IF NOT EXISTS` for idempotent migrations

### Migration Rules
1. Migrations are numbered sequentially: 001, 002, 003...
2. Never modify existing migrations after deployment
3. Always add new migrations for schema changes
4. Test migrations locally before committing

### Schema Conflicts
If you see "no such column" errors:
1. Check if multiple services define the same table
2. Move table creation to migrations
3. Use ALTER TABLE for adding columns to existing tables
```

---

## Immediate Action Plan

1. ✅ **Identify root cause** - DONE
2. ⏳ **Choose fix approach**:
   - Quick rollback for immediate recovery?
   - OR proper fix (takes 1-2 hours)?
3. ⏳ **Apply chosen fix**
4. ⏳ **Verify production is stable**
5. ⏳ **Create PR with proper fix** (if rollback was chosen)
6. ⏳ **Update documentation** and prevention measures

---

## Testing the Fix

### Local Testing
```bash
# 1. Fresh database
rm -f test.db
DATABASE_PATH=./test.db PORT=5099 node backend/dist/index.js

# Should see:
# ✓ All migrations applied
# ✓ Server started on port 5099

# 2. Verify schema
node -e "
const db = require('better-sqlite3')('./test.db');
const tasks = db.prepare('PRAGMA table_info(tasks)').all();
console.log('Tasks table columns:', tasks.map(c => c.name));
const hasFinger print = tasks.some(c => c.name === 'fingerprint');
const hasProject = tasks.some(c => c.name === 'project');
console.log('Has fingerprint:', hasFingerprint);
console.log('Has project:', hasProject);
// Both should be true after fix
"
```

### Production Testing
```bash
# 1. Check service starts
sudo systemctl status app-monitor-backend@5001.service

# 2. Check logs for errors
sudo journalctl -u app-monitor-backend@5001.service -n 100 | grep -i error

# 3. Test API
curl http://localhost:5001/health
curl http://localhost:5001/api/dev-bots/tasks

# 4. Verify schema
cd /opt/app-monitor
node -e "..."  # Same check as above
```

---

## Summary

- **Root Cause**: Dual schema definitions (migrations vs TaskQueueService)
- **Error**: "no such column: fingerprint" (or "project")
- **Impact**: Production backend down since Nov 12, 15:45 PST
- **Fix**: Consolidate to single schema source (migrations)
- **Prevention**: Schema validation in CI/CD, documentation updates

---

**Next Step**: Choose Option 1 (quick rollback) or Option 2 (proper fix) and proceed.
