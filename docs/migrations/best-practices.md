# Database Migration Best Practices

## Overview

This guide documents best practices for database migrations learned from production incidents and system evolution. Following these practices prevents schema drift, production failures, and data loss.

## Critical Rules

### 1. Single Source of Truth

**RULE**: Database schema MUST have exactly ONE source of truth.

**Problem**: Having schema defined in both migration files AND code (like `createSchema()`) causes inevitable drift.

**Solution**:
- ✅ Use ONLY migration files for production schema
- ✅ Tests should run migrations to create schema
- ❌ Never duplicate schema in code AND migrations

**Example - BAD**:
```typescript
// createSchema() in code
createTable('tasks', { /* columns */ });

// Migration file
CREATE TABLE IF NOT EXISTS tasks (/* different columns */);
// ^ These WILL drift apart!
```

**Example - GOOD**:
```typescript
// Only in migrations/002_tasks.sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  -- all columns defined here
);

// Code uses migrations via MigrationManager
const manager = new MigrationManager(db);
manager.runMigrations(); // Schema from migrations only
```

---

### 2. Use ALTER TABLE for Schema Changes

**RULE**: NEVER update `CREATE TABLE` to add columns to existing tables.

**Problem**: `CREATE TABLE IF NOT EXISTS` is silently skipped if table exists, leaving production with old schema.

**Solution**:
- ✅ Use `ALTER TABLE ADD COLUMN` for new columns
- ✅ Create separate migration for each schema change
- ❌ Never modify existing CREATE TABLE statements

**Example - BAD**:
```sql
-- Migration 026 (attempting to add recovery_diagnosis)
CREATE TABLE IF NOT EXISTS task_stage_runs (
  id INTEGER PRIMARY KEY,
  task_id TEXT,
  recovery_diagnosis TEXT  -- New column added here
);
-- ^ Skipped if table exists! Column never added!
```

**Example - GOOD**:
```sql
-- Migration 026: Create table
CREATE TABLE IF NOT EXISTS task_stage_runs (
  id INTEGER PRIMARY KEY,
  task_id TEXT
);

-- Migration 029: Add new column
ALTER TABLE task_stage_runs
ADD COLUMN recovery_diagnosis TEXT;
-- ^ Explicit change, always runs (unless column exists)
```

---

### 3. Make Migrations Idempotent

**RULE**: Migrations MUST be safe to run multiple times.

**Why**:
- Deployment failures may require re-running
- Development environments may apply migrations multiple times
- Testing needs repeatability

**Solution**:
- ✅ Use `CREATE TABLE IF NOT EXISTS`
- ✅ Handle "duplicate column" errors gracefully
- ✅ Check existence before modifications
- ✅ Document expected errors

**Example - Idempotent ALTER TABLE**:
```sql
-- Migration 029: Add recovery_diagnosis column
-- This migration is idempotent - safe to run multiple times

ALTER TABLE task_stage_runs ADD COLUMN recovery_diagnosis TEXT;

-- Note: Will fail with "duplicate column" if column exists.
-- This is EXPECTED and SAFE. The migration manager handles this gracefully.
```

**Migration Manager Support**:
```typescript
// In migrationManager.ts - handles idempotent migrations
try {
  this.db.exec(migration.sql!);
} catch (execError: any) {
  if (execError?.message?.includes('duplicate column')) {
    // Expected - column already exists, continue
    logger.info('Migration already applied (idempotent)');
  } else {
    throw execError; // Real error
  }
}
```

---

### 4. Validate Schema Before/After Deployment

**RULE**: ALWAYS validate schema compatibility before deploying code changes.

**Why**:
- Code expects certain columns/tables
- Schema drift causes runtime failures
- Tests may pass with different schema than production

**Solution**:
```bash
# Before deployment
npm run migrate:validate        # Validate dev database
npm run migrate:validate:prod   # Validate production

# After deployment
npm run migrate:validate:prod   # Verify deployment succeeded
```

**CI/CD Integration**:
```yaml
# .github/workflows/ci.yml
- name: Validate schema after migrations
  run: npm run migrate:validate
```

**What it checks**:
- ✅ Critical columns exist
- ✅ Column types match expectations
- ✅ Tables exist
- ✅ Migrations applied successfully

---

### 5. Test Migrations Against Production-Like State

**RULE**: Test migrations on databases that resemble production, not just fresh databases.

**Why**:
- Fresh databases may not catch schema drift
- ALTER TABLE behaves differently on existing data
- Indexes may fail on large tables

**Solution**:
```typescript
describe('Migration 029', () => {
  it('works on old schema (production scenario)', async () => {
    // Create DB with OLD schema (before migration)
    const db = createDatabaseWithOldSchema();

    // Run migration
    const manager = new MigrationManager(db);
    await manager.applyMigration(migration029);

    // Verify column was added
    expect(columnExists(db, 'task_stage_runs', 'recovery_diagnosis')).toBe(true);
  });

  it('is idempotent (safe to run twice)', async () => {
    const db = createDatabase();
    const manager = new MigrationManager(db);

    // Apply once
    await manager.applyMigration(migration029);

    // Apply again - should succeed or fail gracefully
    await expect(
      manager.applyMigration(migration029)
    ).resolves.not.toThrow();
  });

  it('works on fresh database', async () => {
    // Also test on fresh DB (via all migrations)
    const db = new Database(':memory:');
    const manager = new MigrationManager(db);

    await manager.runMigrations();

    expect(columnExists(db, 'task_stage_runs', 'recovery_diagnosis')).toBe(true);
  });
});
```

---

### 6. Document Breaking Changes

**RULE**: Migration files MUST document why they exist and what they fix.

**Required documentation**:
- Purpose of migration
- What tables/columns are modified
- Why the change is needed
- Known issues it fixes
- Expected errors (if any)

**Example**:
```sql
-- Migration 029: Add recovery_diagnosis column to task_stage_runs
-- Date: 2025-11-19
-- Purpose: Fix schema mismatch from migration 026
--
-- Background:
--   Migration 026 created task_stage_runs table with recovery_diagnosis column,
--   but production database had table created by TaskQueueService.createSchema()
--   BEFORE the recovery_diagnosis column was added.
--
--   The "CREATE TABLE IF NOT EXISTS" in migration 026 was silently skipped,
--   leaving production with old schema.
--
-- This migration adds the missing column to existing production databases.
-- For fresh databases, this will fail with "duplicate column" (expected & safe).

ALTER TABLE task_stage_runs ADD COLUMN recovery_diagnosis TEXT;
```

---

## Migration Workflow

### Creating a New Migration

1. **Determine migration number**:
   ```bash
   ls backend/migrations/*.sql | tail -1  # Check last migration
   # Next number: 030
   ```

2. **Create migration file**:
   ```bash
   # backend/migrations/030_add_feature_x.sql
   ```

3. **Write migration with documentation**:
   ```sql
   -- Migration 030: Add feature X tracking
   -- Date: 2025-11-20
   -- Purpose: Track feature X usage for analytics

   -- Create new table
   CREATE TABLE IF NOT EXISTS feature_x_tracking (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );

   -- Add index
   CREATE INDEX IF NOT EXISTS idx_feature_x_user
   ON feature_x_tracking(user_id);
   ```

4. **Test locally**:
   ```bash
   npm run migrate:up          # Apply migration
   npm run migrate:validate    # Validate schema
   npm run test                # Run tests
   ```

5. **Test idempotency**:
   ```bash
   npm run migrate:up          # Run again - should be safe
   ```

6. **Commit**:
   ```bash
   git add backend/migrations/030_add_feature_x.sql
   git commit -m "feat: add migration for feature X tracking"
   ```

---

### Modifying Existing Tables

**Scenario**: Add column to existing table

```sql
-- Migration 031: Add status column to feature_x_tracking
-- Date: 2025-11-20

-- Add column with default value for existing rows
ALTER TABLE feature_x_tracking
ADD COLUMN status TEXT DEFAULT 'active';

-- Add index for new column
CREATE INDEX IF NOT EXISTS idx_feature_x_status
ON feature_x_tracking(status);
```

**Scenario**: Change column type (SQLite limitation workaround)

SQLite doesn't support ALTER COLUMN, so you must:

```sql
-- Migration 032: Change user_id from TEXT to INTEGER
-- Date: 2025-11-20
-- Note: SQLite doesn't support ALTER COLUMN, using table recreation

-- Create new table with correct schema
CREATE TABLE IF NOT EXISTS feature_x_tracking_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,  -- Changed from TEXT
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL
);

-- Copy data with conversion
INSERT INTO feature_x_tracking_new (id, user_id, status, created_at)
SELECT id, CAST(user_id AS INTEGER), status, created_at
FROM feature_x_tracking;

-- Drop old table
DROP TABLE feature_x_tracking;

-- Rename new table
ALTER TABLE feature_x_tracking_new RENAME TO feature_x_tracking;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_feature_x_user
ON feature_x_tracking(user_id);

CREATE INDEX IF NOT EXISTS idx_feature_x_status
ON feature_x_tracking(status);
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All migrations have sequential numbers
- [ ] Migration files follow naming: `NNN_description.sql`
- [ ] Each migration documented with purpose
- [ ] Migrations tested locally
- [ ] Migrations tested for idempotency
- [ ] Schema validation passes: `npm run migrate:validate`
- [ ] CI/CD validation passes
- [ ] No duplicate migration numbers
- [ ] All migrations use `IF NOT EXISTS` where appropriate

### During Deployment

- [ ] Backup production database before migration
- [ ] Run schema validation: `npm run migrate:validate:prod`
- [ ] Apply migrations: `npm run migrate:up`
- [ ] Verify migrations applied: `npm run migrate:status`
- [ ] Run post-migration schema validation
- [ ] Check application logs for errors

### Post-Deployment

- [ ] Monitor error rates
- [ ] Check for schema-related errors
- [ ] Verify critical functionality works
- [ ] Run schema validation weekly
- [ ] Document any manual fixes required

---

## Troubleshooting

### Schema Mismatch Detected

**Error**: "table X has no column named Y"

**Fix**:
1. Check pending migrations: `npm run migrate:status`
2. Run schema validation: `npm run migrate:validate:prod`
3. Apply missing migrations: `npm run migrate:up`
4. If no pending migrations, check if column was added in code but not migrations

**Prevention**:
- Always use migrations for schema changes
- Run `migrate:validate` before deployment
- Never modify schema in code

---

### Migration Failed in Production

**Error**: Migration X failed with error Y

**Fix**:
1. Check migration tracking: `SELECT * FROM migrations WHERE status='failed'`
2. Review migration SQL for syntax errors
3. Check if table/column already exists (idempotency issue)
4. Fix migration file
5. Mark failed migration as pending: `UPDATE migrations SET status='pending' WHERE id=X`
6. Re-run: `npm run migrate:up`

**Prevention**:
- Test migrations locally first
- Test on production-like data
- Make migrations idempotent

---

### Dual Schema Management Detected

**Symptom**: Tests pass, production fails with schema errors

**Diagnosis**:
- Check for `createSchema()` in code
- Check if tests use different schema than migrations
- Look for schema definitions in multiple places

**Fix**:
1. Eliminate all schema definitions except migrations
2. Make tests use migrations: `manager.runMigrations()`
3. Remove `createSchema()` methods
4. Update tests to use migration-based setup

---

## References

- [Migration Manager Source](../../backend/src/services/migrationManager.ts)
- [Schema Validation Script](../../backend/src/scripts/validate-schema.ts)
- [Production Validation Script](../../scripts/validate-production-schema.sh)
- [Migration Files](../../backend/migrations/)
- [CI/CD Workflow](../../.github/workflows/ci.yml)

---

## Version History

- **2025-11-19**: Initial version after migration 029 crisis
- Documented dual schema management anti-pattern
- Added idempotent migration patterns
- Created validation workflows
