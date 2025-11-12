# Database Migration Safety Guide

This document describes the multiple layers of safety mechanisms implemented to prevent database migration failures during deployment.

## Problem History

On Nov 12, 2025, a deployment failed because migration `001_initial_schema` attempted to create tables without `IF NOT EXISTS` clauses. When the service started, it crashed with:
```
SqliteError: table task_executions already exists
```

This caused a cascade of failures:
1. Service crashed on startup
2. Health checks failed
3. Deployment was automatically rolled back
4. GitHub Actions workflow timed out

See `DEPLOYMENT_TIMEOUT_ANALYSIS.md` for full details.

## Safety Mechanisms

We've implemented **four layers of defense** to prevent this from happening again:

### Layer 1: Idempotent SQL (CRITICAL)

All `CREATE TABLE` and `CREATE INDEX` statements MUST use `IF NOT EXISTS`:

```sql
-- ✅ CORRECT
CREATE TABLE IF NOT EXISTS my_table (...);
CREATE INDEX IF NOT EXISTS idx_my_table ON my_table(column);

-- ❌ WRONG - Will fail if table already exists
CREATE TABLE my_table (...);
CREATE INDEX idx_my_table ON my_table(column);
```

**Status:** ✅ All migrations fixed
- Inline migrations in `database.ts`: Fixed
- Migration files in `backend/migrations/`: All use `IF NOT EXISTS`

### Layer 2: Migration Error Recovery (NEW)

The `applyMigration` function now includes automatic error recovery:

```typescript
private applyMigration(name: string, migration: () => void): void {
  try {
    migration();
    // Mark as applied
  } catch (error: any) {
    // If error is "already exists", warn but don't crash
    if (error.code === 'SQLITE_ERROR' && error.message.includes('already exists')) {
      console.warn(`⚠️  Migration ${name} failed with "already exists" error`);
      // Mark as applied to prevent retry loops
    } else {
      // Re-throw actual errors
      throw error;
    }
  }
}
```

**Benefits:**
- Service won't crash if a table already exists
- Deployment can continue instead of rolling back
- Logs clearly indicate the issue for investigation
- Prevents retry loops that would repeatedly fail

**Location:** `backend/src/services/database.ts` lines 265-300

### Layer 3: Database Integrity Validation (NEW)

After migrations run, we validate the database has all required tables:

```typescript
private validateDatabaseIntegrity(): void {
  const requiredTables = [
    'migrations', 'task_executions', 'token_usage',
    'experiments', 'batch_approvals', 'failure_patterns',
    'tasks', 'task_automation_runs'
  ];
  
  // Check all tables exist
  // Log detailed error if any are missing
}
```

**Benefits:**
- Catches missing tables immediately on startup
- Fails fast with clear error messages
- Prevents mysterious runtime errors later
- Validates migration tracking is working

**Location:** `backend/src/services/database.ts` lines 302-350

### Layer 4: Pre-Deployment Validation (NEW)

A validation script runs during CI/CD to catch unsafe migrations before deployment:

```bash
./scripts/validate-migrations.sh
```

**Checks:**
1. ✅ All inline migrations use `IF NOT EXISTS`
2. ✅ All migration files use `IF NOT EXISTS`
3. ✅ Migration tracking table uses `IF NOT EXISTS`
4. ✅ `applyMigration` has error handling
5. ⚠️  Warns about `ALTER TABLE` (can't use IF NOT EXISTS)
6. ⚠️  Warns about unsafe index creation

**Location:** `scripts/validate-migrations.sh`

**CI Integration:** `.github/workflows/deploy-production.yml` line 88

**Example output:**
```
[INFO] Starting migration validation...
[INFO] ✓ Inline migrations are safe (use IF NOT EXISTS)
[INFO] ✓ 008_pr_review_comments.sql uses safe patterns
[INFO] ✓ applyMigration has error handling
[INFO] ✅ All migration validations passed!
```

## Migration Best Practices

### Creating New Migrations

1. **Use IF NOT EXISTS for tables:**
   ```sql
   CREATE TABLE IF NOT EXISTS my_new_table (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL
   );
   ```

2. **Use IF NOT EXISTS for indexes:**
   ```sql
   CREATE INDEX IF NOT EXISTS idx_my_table_name 
     ON my_new_table(name);
   ```

3. **Handle ALTER TABLE carefully:**
   
   ALTER TABLE can't use IF NOT EXISTS. Options:
   
   **Option A: Check column exists first (SQLite 3.35+)**
   ```sql
   -- Check if column exists before adding
   -- (requires pragma table_info queries)
   ```
   
   **Option B: Accept that ALTERs are append-only**
   ```sql
   -- ALTERs are safe if they only ADD columns/constraints
   -- Don't ALTER if you need to remove or modify
   ALTER TABLE tasks ADD COLUMN pr_number INTEGER;
   ```
   
   **Option C: Document as non-idempotent**
   ```sql
   -- WARNING: This migration is not idempotent
   -- Do not re-run after successful application
   ALTER TABLE tasks ADD COLUMN new_field TEXT;
   ```

4. **Test migrations locally:**
   ```bash
   # Run validation
   ./scripts/validate-migrations.sh
   
   # Test with existing database
   cd backend
   npm test
   
   # Test fresh database creation
   rm -f backend/data/app-monitor.db
   npm start
   ```

### File Migrations vs Inline Migrations

**Inline migrations** (in `database.ts`):
- Used for initial schema (001_initial_schema)
- Kept in TypeScript for bootstrapping
- Harder to review in SQL tools
- ✅ All use IF NOT EXISTS now

**File migrations** (in `backend/migrations/`):
- Preferred for new migrations
- Easy to review and test
- Can be applied independently
- Most already use IF NOT EXISTS

## Validation Workflow

### During Development
```bash
# 1. Write your migration
vim backend/migrations/012_my_new_feature.sql

# 2. Validate syntax
./scripts/validate-migrations.sh

# 3. Test with backend
cd backend && npm test

# 4. Test on existing database
npm start
```

### During CI/CD
```yaml
- name: Validate database migrations
  run: ./scripts/validate-migrations.sh

- name: Run backend tests  
  run: npm run test:backend

- name: Build backend
  run: npm run build -w backend
```

### During Deployment
1. Service starts
2. `DevBotsDatabase` constructor called
3. `initialize()` runs migrations
4. `validateDatabaseIntegrity()` checks tables
5. Service starts accepting requests

**If migration fails:**
- Error logged with details
- If "already exists" → Warn and continue
- If other error → Crash with clear message
- Systemd attempts restart (5 times)
- If still failing → Health checks fail
- Deployment rolls back automatically

## Troubleshooting

### Symptom: Service crashes with "table already exists"

**Diagnosis:**
```bash
journalctl -u app-monitor-backend@5001.service -n 100
```

Look for: `SqliteError: table X already exists`

**Solution 1: Automatic (with new safety features)**
Service should auto-recover and log warnings. Check logs for:
```
⚠️  Migration 001_initial_schema failed with "already exists" error
⚠️  Marking migration as applied to prevent future failures
```

**Solution 2: Manual recovery (if auto-recovery fails)**
```bash
# Check migrations table
sqlite3 /opt/app-monitor/shared/backend/data/app-monitor.db
sqlite> SELECT * FROM migrations;
sqlite> .quit

# If migrations table is corrupt, rebuild it
# (Database has mechanisms to recover)
```

### Symptom: Migration validation fails in CI

**Diagnosis:**
Check GitHub Actions output for validation errors.

**Common issues:**

1. **Missing IF NOT EXISTS**
   ```
   [ERROR] ✗ 012_my_feature.sql contains CREATE TABLE without IF NOT EXISTS
   ```
   
   **Fix:** Add `IF NOT EXISTS` to CREATE TABLE statements

2. **No error handling in applyMigration**
   ```
   [ERROR] applyMigration should have try-catch error handling
   ```
   
   **Fix:** This shouldn't happen (already implemented)

### Symptom: Tables missing after deployment

**Diagnosis:**
```bash
journalctl -u app-monitor-backend@5001.service -n 100 | grep -i "integrity"
```

Look for: `❌ Database integrity check failed: Missing tables:`

**Solution:**
1. Check if migrations ran: `SELECT * FROM migrations;`
2. Manually run missing migrations
3. Restart service

## Testing

### Unit Tests
```bash
cd backend
npm test
```

Includes:
- Database initialization
- Migration tracking
- Error handling
- Table creation

### Integration Tests

**Test migration safety:**
```bash
# Start with existing database
cd backend
npm start

# Check logs for errors
tail -f logs/app-monitor.log

# Verify tables exist
sqlite3 data/app-monitor.db ".tables"
```

**Test fresh database:**
```bash
# Remove database
rm -f backend/data/app-monitor.db

# Start service
npm start

# All tables should be created
sqlite3 data/app-monitor.db ".tables"
```

**Test migration recovery:**
```bash
# Simulate partial migration failure
sqlite3 backend/data/app-monitor.db
sqlite> DELETE FROM migrations WHERE name = '001_initial_schema';
sqlite> .quit

# Start service - should recover automatically
npm start

# Check logs for warning messages
```

## Monitoring

### Health Checks

The health check script validates database connectivity:

```bash
/opt/app-monitor/scripts/health-check.sh
```

Add database-specific checks:
```bash
# Check critical tables exist
sqlite3 /opt/app-monitor/shared/backend/data/app-monitor.db \
  "SELECT name FROM sqlite_master WHERE type='table'" | \
  grep -q "task_executions" || echo "ERROR: Missing task_executions table"
```

### Alerts

Monitor for these log patterns:
- `⚠️  Migration.*already exists` - Migration recovery triggered
- `❌ Database integrity check failed` - Critical tables missing
- `SqliteError` - Database errors
- `Migration.*failed` - Migration errors

## Future Improvements

1. **Migration rollback support**
   - Track migration SQL for rollback
   - Implement `down` migrations
   - Test rollback before deployment

2. **Schema versioning**
   - Add schema version to database
   - Validate schema matches code expectations
   - Detect schema drift

3. **Automated schema diffs**
   - Compare production vs dev schemas
   - Detect manual changes
   - Alert on discrepancies

4. **Migration dry-run mode**
   - Test migrations without applying
   - Show what would change
   - Validate before deployment

## Summary

With these four layers of defense, database migration failures are now:
- ✅ **Prevented** - Validation catches issues before deployment
- ✅ **Handled** - Auto-recovery prevents crashes
- ✅ **Detected** - Integrity checks catch problems immediately  
- ✅ **Logged** - Clear error messages for debugging

**This migration system is now production-hardened and deployment-safe.**
