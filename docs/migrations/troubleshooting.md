# Migration Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: "table X has no column named Y"

**Symptom**:
```
Error: table task_stage_runs has no column named recovery_diagnosis
```

**Root Cause**: Schema drift - code expects column that doesn't exist in database

**Diagnosis Steps**:

1. **Check if column exists**:
   ```bash
   sqlite3 backend/data/app-monitor.db "PRAGMA table_info(task_stage_runs);"
   ```

2. **Check pending migrations**:
   ```bash
   npm run migrate:status
   ```

3. **Run schema validation**:
   ```bash
   npm run migrate:validate
   ```

**Solutions**:

**Option A: Apply Pending Migrations**
```bash
# Apply all pending migrations
npm run migrate:up

# Verify schema is correct
npm run migrate:validate
```

**Option B: Emergency Hotfix (Production Only)**
```bash
# Add column directly (if no migration exists)
sqlite3 /path/to/database.db \
  "ALTER TABLE task_stage_runs ADD COLUMN recovery_diagnosis TEXT;"

# Then create migration for next deployment
# backend/migrations/0XX_add_recovery_diagnosis.sql
```

**Option C: Rebuild Database (Development Only)**
```bash
# DANGER: This deletes all data!
rm backend/data/app-monitor.db
npm run migrate:up
```

**Prevention**:
- Always run `migrate:validate` before deploying
- Use migrations for ALL schema changes
- Never modify schema in code

---

### Issue 2: Migration Failed - "duplicate column"

**Symptom**:
```
Error: duplicate column name: recovery_diagnosis
Migration 029 failed
```

**Root Cause**: Column already exists (migration already applied or added manually)

**Diagnosis**:
```bash
# Check if column exists
sqlite3 backend/data/app-monitor.db \
  "PRAGMA table_info(task_stage_runs);" | grep recovery_diagnosis

# Check migration status
npm run migrate:status
```

**Solutions**:

**If migration manager detects this** (after our fixes):
- ✅ Migration marked as applied (idempotent behavior)
- ✅ No action needed

**If migration fails**:
```bash
# Mark migration as applied manually
sqlite3 backend/data/app-monitor.db <<EOF
INSERT INTO migrations (id, name, filename, applied_at, status)
VALUES (29, 'add recovery diagnosis column', '029_add_recovery_diagnosis_column.sql', $(date +%s)000, 'applied')
ON CONFLICT(name) DO UPDATE SET status='applied';
EOF

# Verify
npm run migrate:status
```

**Prevention**:
- Make migrations idempotent (handle duplicate errors)
- Document expected errors in migration files
- Use migration manager's idempotent features

---

### Issue 3: Tests Pass, Production Fails

**Symptom**:
- All tests green locally
- CI/CD passes
- Production crashes with schema errors

**Root Cause**: Dual schema management
- Tests use `createSchema()` (has new columns)
- Production uses migrations (missing columns)

**Diagnosis**:

1. **Check for createSchema() in code**:
   ```bash
   grep -r "createSchema" backend/src/
   ```

2. **Compare schemas**:
   ```bash
   # Get production schema
   ssh prod "sqlite3 /path/to/app.db '.schema tasks'" > prod_schema.sql

   # Get test schema
   sqlite3 backend/data/app-monitor.db ".schema tasks" > test_schema.sql

   # Compare
   diff prod_schema.sql test_schema.sql
   ```

**Solution**:

1. **Eliminate createSchema()**:
   ```typescript
   // REMOVE this:
   private createSchema(): void {
     this.db.exec(`CREATE TABLE tasks (...)`);
   }

   // REPLACE with migrations:
   private async initializeDatabase(): Promise<void> {
     const manager = new MigrationManager(this.db);
     await manager.runMigrations();
   }
   ```

2. **Update tests to use migrations**:
   ```typescript
   beforeEach(async () => {
     db = new Database(':memory:');
     const manager = new MigrationManager(db);
     await manager.runMigrations(); // Use migrations, not createSchema
   });
   ```

**Prevention**:
- ONE source of truth for schema (migrations only)
- Tests MUST use same schema path as production
- Validate schema in CI/CD

---

### Issue 4: Schema Validation Fails with Missing Columns

**Symptom**:
```bash
$ npm run migrate:validate
❌ Schema validation FAILED

  ❌ task_stage_runs.recovery_diagnosis MISSING
     Expected type: TEXT
```

**Root Cause**: Migrations not applied or incomplete

**Solutions**:

1. **Check migration status**:
   ```bash
   npm run migrate:status
   ```

2. **Apply pending migrations**:
   ```bash
   npm run migrate:up
   ```

3. **If no pending migrations but column missing**:
   ```bash
   # Column should be added by migration - check migration files
   grep -r "recovery_diagnosis" backend/migrations/

   # If migration exists but wasn't applied, check migrations table
   sqlite3 backend/data/app-monitor.db \
     "SELECT * FROM migrations WHERE name LIKE '%recovery%';"

   # If not recorded, migration may have failed silently
   # Re-run migrations
   npm run migrate:up
   ```

**Prevention**:
- Run `migrate:validate` in CI/CD
- Monitor migration logs during deployment
- Alert on migration failures

---

### Issue 5: CREATE TABLE IF NOT EXISTS Skipped

**Symptom**:
- Migration 026 says it creates table with column
- Table exists but missing column
- Migration marked as "applied" but changes not present

**Root Cause**: Table already existed when migration ran

**What Happened**:
```sql
-- Migration 026
CREATE TABLE IF NOT EXISTS task_stage_runs (
  id INTEGER PRIMARY KEY,
  recovery_diagnosis TEXT  -- New column
);

-- But table already existed from earlier code:
-- CREATE TABLE task_stage_runs (id INTEGER PRIMARY KEY);
-- Result: Migration skipped! Column never added!
```

**Solution**:

1. **Create follow-up migration with ALTER TABLE**:
   ```sql
   -- Migration 029: Add missing column
   ALTER TABLE task_stage_runs
   ADD COLUMN recovery_diagnosis TEXT;
   ```

2. **Apply new migration**:
   ```bash
   npm run migrate:up
   ```

**Prevention**:
- NEVER update CREATE TABLE to add columns
- ALWAYS use ALTER TABLE for schema modifications
- Separate table creation from modifications

---

### Issue 6: Migration Manager Not Finding Migrations

**Symptom**:
```
No migration files found
```

**Root Cause**: Incorrect migrations directory path

**Diagnosis**:
```bash
# Check migrations directory exists
ls -la backend/migrations/*.sql

# Check migration manager path configuration
grep -A 5 "migrationsDir" backend/src/services/migrationManager.ts
```

**Solution**:
```typescript
// Ensure correct path in migrationManager.ts
constructor(db: Database.Database, migrationsDir?: string) {
  this.migrationsDir = migrationsDir ||
    path.join(__dirname, '..', '..', 'migrations');
}

// Or specify path explicitly
const manager = new MigrationManager(
  db,
  '/absolute/path/to/migrations'
);
```

---

### Issue 7: Production Database Locked

**Symptom**:
```
Error: database is locked
```

**Root Cause**: Another process has database open

**Solution**:

1. **Find processes using database**:
   ```bash
   lsof /opt/app-monitor/current/backend/data/app-monitor.db
   ```

2. **Stop backend server temporarily**:
   ```bash
   pm2 stop backend
   npm run migrate:up
   pm2 start backend
   ```

3. **Or use WAL mode** (write-ahead logging):
   ```sql
   PRAGMA journal_mode=WAL;
   ```

**Prevention**:
- Use WAL mode for production databases
- Run migrations during maintenance windows
- Implement migration locking mechanism

---

### Issue 8: Type Mismatch After Migration

**Symptom**:
```
⚠️  task_stage_runs.attempt has type 'INTEGER' (expected 'TEXT')
```

**Root Cause**: Migration changed column type or definition

**Solution**:

1. **Check if type mismatch is intentional**:
   - Review migration that last modified column
   - Check if application code expects different type

2. **If code expects different type, update validation**:
   ```typescript
   // In migrationManager.ts validateSchema()
   { table: 'task_stage_runs', column: 'attempt', type: 'INTEGER' }
   ```

3. **If database is wrong, create migration to fix**:
   ```sql
   -- SQLite doesn't support ALTER COLUMN
   -- Must recreate table (see best-practices.md)
   ```

---

## Emergency Procedures

### Emergency Database Backup

**Before any manual schema changes**:

```bash
# Production
cp /opt/app-monitor/current/backend/data/app-monitor.db \
   /opt/app-monitor/current/backend/data/app-monitor.db.backup-$(date +%Y%m%d_%H%M%S)

# Verify backup
sqlite3 /opt/app-monitor/current/backend/data/app-monitor.db.backup-* ".tables"
```

### Emergency Schema Rollback

**If migration broke production**:

1. **Stop application**:
   ```bash
   pm2 stop backend
   ```

2. **Restore backup**:
   ```bash
   cp app-monitor.db.backup-YYYYMMDD_HHMMSS app-monitor.db
   ```

3. **Mark migration as failed**:
   ```sql
   UPDATE migrations
   SET status='failed'
   WHERE id=(SELECT MAX(id) FROM migrations);
   ```

4. **Restart with old code**:
   ```bash
   pm2 start backend
   ```

### Emergency Column Addition

**When you MUST add column immediately**:

```bash
# 1. Backup first!
cp app-monitor.db app-monitor.db.backup-emergency

# 2. Add column
sqlite3 app-monitor.db \
  "ALTER TABLE task_stage_runs ADD COLUMN recovery_diagnosis TEXT;"

# 3. Verify
sqlite3 app-monitor.db "PRAGMA table_info(task_stage_runs);" | \
  grep recovery_diagnosis

# 4. Create migration for next deployment
cat > backend/migrations/0XX_emergency_fix.sql <<EOF
-- Emergency fix applied manually on YYYY-MM-DD
-- This migration documents the manual change
ALTER TABLE task_stage_runs ADD COLUMN recovery_diagnosis TEXT;
EOF
```

---

## Diagnostic Commands

### Check Database Health

```bash
# Table list
sqlite3 app-monitor.db ".tables"

# Schema for specific table
sqlite3 app-monitor.db ".schema tasks"

# Database integrity check
sqlite3 app-monitor.db "PRAGMA integrity_check;"

# Database size
ls -lh app-monitor.db
```

### Check Migration Status

```bash
# Via npm script
npm run migrate:status

# Direct SQL query
sqlite3 app-monitor.db \
  "SELECT id, name, status, datetime(applied_at/1000, 'unixepoch') as applied
   FROM migrations ORDER BY id;"
```

### Schema Validation

```bash
# Development
npm run migrate:validate

# Production
npm run migrate:validate:prod

# Custom database
npm run migrate:validate -- --db=/path/to/database.db
```

---

## Prevention Checklist

**Before Every Deployment**:
- [ ] Run `npm run migrate:validate`
- [ ] Check `npm run migrate:status` for pending migrations
- [ ] Review migration files for documentation
- [ ] Test migrations on staging environment
- [ ] Backup production database
- [ ] Have rollback plan ready

**After Every Schema Change**:
- [ ] Create migration file (never modify code schema)
- [ ] Test migration locally
- [ ] Test idempotency (run twice)
- [ ] Update schema validation if needed
- [ ] Run `npm run migrate:validate`
- [ ] Document why change was made

**Weekly/Monthly**:
- [ ] Run schema validation on production
- [ ] Review migration logs
- [ ] Check for failed migrations
- [ ] Audit schema drift
- [ ] Update documentation

---

## Getting Help

1. **Check documentation**:
   - [Best Practices](./best-practices.md)
   - [Migration README](../../backend/migrations/README.md)

2. **Run diagnostics**:
   ```bash
   npm run migrate:status
   npm run migrate:validate
   scripts/validate-production-schema.sh
   ```

3. **Review logs**:
   - Application logs for schema errors
   - Migration manager logs
   - Database query logs

4. **Contact team**:
   - Include output of all diagnostic commands
   - Include migration files involved
   - Include database schema dump
   - Include error messages and stack traces
