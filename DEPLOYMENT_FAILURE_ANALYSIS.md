# Deployment Failure Analysis - November 12, 2025

## Executive Summary

**Status**: Deployment FAILED - Backend service crashed on startup
**Root Cause**: Database path misconfiguration + migration ordering issue  
**Impact**: Production service is down (app-monitor-backend@5001)
**Fix Required**: Configure DATABASE_PATH + fix migrations

---

## Failure Timeline

```
23:44:57 - Deploy agent starts processing deployment 3300677906
23:45:30 - Backend service starts on port 5001
23:45:38 - Backend crashes with SQLite error: "no such column: project"
23:45:38-23:45:59 - Service restarts 5 times, all fail with same error
23:45:59 - Systemd gives up (restart limit reached)
23:53:19 - GitHub Actions monitoring times out after 10 minutes
```

---

## Root Cause Analysis

### Primary Issue: Database Path Misconfiguration

**Problem**: The application is looking for database in the wrong location.

```javascript
// backend/src/config.ts (Line 19)
databasePath: process.env.DATABASE_PATH || path.join(__dirname, '../data/app-monitor.db')
```

**Current State in Production**:
- `.env` has no `DATABASE_PATH` set
- Default path: `/opt/app-monitor/releases/20251112_154447/backend/dist/data/app-monitor.db`
- Actual databases location: `/opt/app-monitor/dev-bots.db` and `/opt/app-monitor/dev-bots-tasks.db`
- `/opt/app-monitor/data/` directory does NOT EXIST

**Error**: Database directory doesn't exist, so migrations try to create tables but fail.

### Secondary Issue: Migration 002 References Non-Existent Column

**Error from logs**:
```
SqliteError: no such column: project
at Database.exec (/opt/app-monitor/node_modules/better-sqlite3/lib/methods/wrappers.js:9:14)
Migration 002_tasks_table failed
```

**Analysis**:
- Migration 002 creates the `tasks` table WITH a `project` column
- But the error says "no such column: project"
- This suggests the migration is trying to query an existing table that doesn't have the column
- OR there's a transaction/ordering issue where the column isn't created yet

**Migration 002 (line 24)**:
```sql
project TEXT,
```

**Migration 013** (empty migration):
- Documents that `project` column should be removed
- But it's intentionally empty (soft deprecation)
- The column still exists in schema but is unused

---

## Immediate Fix Required

### Fix 1: Configure DATABASE_PATH in Production

**Add to `/opt/app-monitor/.env`**:
```bash
DATABASE_PATH=/opt/app-monitor/shared/data/dev-bots.db
```

**OR** create proper data directory structure:
```bash
sudo mkdir -p /opt/app-monitor/shared/data
sudo mv /opt/app-monitor/dev-bots.db /opt/app-monitor/shared/data/
sudo mv /opt/app-monitor/dev-bots-tasks.db /opt/app-monitor/shared/data/
sudo chown -R jdubz:jdubz /opt/app-monitor/shared
```

### Fix 2: Investigate Migration Ordering

The migration failure suggests either:
1. Database already exists with old schema (missing `project` column)
2. Migration is running twice
3. Migration transaction is rolled back but error handling is incorrect

**Check migrations applied**:
```bash
cd /opt/app-monitor
node -e "const Database = require('better-sqlite3'); const db = new Database('/opt/app-monitor/dev-bots.db'); console.log(JSON.stringify(db.prepare('SELECT * FROM migrations ORDER BY id').all(), null, 2));"
```

---

## Long-Term Solutions

### 1. Deployment Script Improvements

**Add Pre-Deployment Validation** (`scripts/deploy.sh`):
```bash
# Before starting services, validate configuration
validate_database_config() {
  local db_path="${DATABASE_PATH:-/opt/app-monitor/shared/data/dev-bots.db}"
  local db_dir=$(dirname "$db_path")
  
  if [[ ! -d "$db_dir" ]]; then
    log "ERROR" "Database directory does not exist: $db_dir"
    log "INFO" "Creating database directory..."
    mkdir -p "$db_dir"
  fi
  
  if [[ -n "$DATABASE_PATH" ]]; then
    log "INFO" "Using configured DATABASE_PATH: $DATABASE_PATH"
  else
    log "WARN" "DATABASE_PATH not set, using default: $db_path"
  fi
}
```

### 2. Migration Safety Checks

**Add to migration runner** (`backend/src/services/database.ts`):
```typescript
async applyMigration(migration: Migration) {
  try {
    // Validate migration before applying
    const validation = this.validateMigration(migration);
    if (!validation.valid) {
      throw new Error(`Migration validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Apply migration in transaction
    const transaction = this.db.transaction(() => {
      this.db.exec(migration.sql);
      this.db.prepare('INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        migration.id,
        migration.name,
        new Date().toISOString()
      );
    });
    
    transaction();
    
  } catch (error) {
    // Better error context
    logger.error('Migration failed', {
      migration: migration.name,
      error: error.message,
      sql: migration.sql.substring(0, 200) + '...'
    });
    throw error;
  }
}
```

### 3. Health Check Improvements

**Make health checks more informative**:
```bash
# In scripts/health-check.sh
check_database_accessible() {
  local db_path="${DATABASE_PATH:-/opt/app-monitor/shared/data/dev-bots.db}"
  
  if [[ ! -f "$db_path" ]]; then
    echo "❌ Database file does not exist: $db_path"
    return 1
  fi
  
  # Test database connection
  if node -e "const db = require('better-sqlite3')('$db_path'); db.close();" 2>/dev/null; then
    echo "✅ Database accessible"
    return 0
  else
    echo "❌ Cannot open database"
    return 1
  fi
}
```

### 4. Deployment Timeout Configuration

**Current Problem**: Deploy agent stuck at "fetching commit" for 10 minutes

**GitHub Actions Workflow** (`.github/workflows/deploy-production.yml` line 221):
```yaml
timeout-minutes: 10  # Current
```

**Recommendation**: This timeout is correct, but the deploy agent isn't properly updating status when it encounters errors.

**Fix deploy-agent.sh status updates**:
```bash
# In deploy-agent.sh, improve error reporting
CURRENT_PHASE="deploy"
log "INFO" "Executing deploy script via sudo"
if sudo "$DEPLOY_SCRIPT" "$source_dir" |& tee "$log_file"; then
  post_status success "Deploy agent ${HOSTNAME} deployed ${SOURCE_COMMIT}" "$CURRENT_LOG_URL"
else
  local exit_code=$?
  local error_msg=$(tail -20 "$log_file" | grep -i "error" | head -3)
  post_status failure "Deploy failed: $error_msg" "$CURRENT_LOG_URL"
  fatal "deploy.sh reported failure (exit $exit_code)"
fi
```

### 5. Database Path Standardization

**Add to documentation** (`docs/deployment-environment.md`):

```markdown
## Required Environment Variables

### Production (.env in /opt/app-monitor/)

```bash
# Node environment
NODE_ENV=production

# Database configuration (REQUIRED)
DATABASE_PATH=/opt/app-monitor/shared/data/dev-bots.db

# API configuration
PORT=5001
CORS_ORIGIN=https://app-monitor.joshwentworth.com

# Authentication
API_KEY=<secure-key-from-1password>
REQUIRE_AUTH=true

# GitHub Integration
GITHUB_WEBHOOK_SECRET=<webhook-secret>

# Dev-Bots Configuration
MAX_DEV_BOTS=3
ENABLE_AUTO_RECOVERY=false
RECOVERY_DRY_RUN=true
```
```

### 6. Rollback Strategy

**Enhance rollback script** (`scripts/rollback.sh`):
- Add database backup/restore
- Verify database compatibility before rollback
- Test database migrations in dry-run mode

---

## Prevention Checklist

To prevent this failure from happening again:

- [ ] **Pre-deployment validation**: Check DATABASE_PATH exists before starting service
- [ ] **Migration testing**: Test migrations against production-like database  
- [ ] **Health checks**: Verify database connectivity before declaring deployment success
- [ ] **Status updates**: Deploy agent reports errors to GitHub immediately
- [ ] **Timeout handling**: Fail fast instead of timing out after 10 minutes
- [ ] **Documentation**: Document all required environment variables
- [ ] **Database backups**: Automatic backup before each deployment
- [ ] **Rollback testing**: Verify rollback works with database state

---

## Manual Recovery Steps

### Step 1: Fix Database Configuration

```bash
# SSH to production server
cd /opt/app-monitor

# Create proper data directory
sudo mkdir -p /opt/app-monitor/shared/data

# Move existing databases (if they exist)
if [[ -f /opt/app-monitor/dev-bots.db ]]; then
  sudo mv /opt/app-monitor/dev-bots.db /opt/app-monitor/shared/data/
fi

# Fix permissions
sudo chown -R jdubz:jdubz /opt/app-monitor/shared

# Add DATABASE_PATH to .env
echo "DATABASE_PATH=/opt/app-monitor/shared/data/dev-bots.db" | sudo tee -a /opt/app-monitor/.env

# Verify
cat /opt/app-monitor/.env | grep DATABASE_PATH
```

### Step 2: Check Database State

```bash
# Check if database needs initialization
cd /opt/app-monitor
node -e "
const Database = require('better-sqlite3');
const dbPath = '/opt/app-monitor/shared/data/dev-bots.db';
const fs = require('fs');

if (!fs.existsSync(dbPath)) {
  console.log('Database does not exist - will be created on startup');
} else {
  const db = new Database(dbPath, { readonly: true });
  const migrations = db.prepare('SELECT * FROM migrations ORDER BY id').all();
  console.log('Applied migrations:', JSON.stringify(migrations, null, 2));
  db.close();
}
"
```

### Step 3: Test Service Start

```bash
# Try starting service manually first
cd /opt/app-monitor/current
PORT=5001 NODE_ENV=production DATABASE_PATH=/opt/app-monitor/shared/data/dev-bots.db node backend/dist/index.js

# If successful, restart systemd service
sudo systemctl restart app-monitor-backend@5001.service
sudo systemctl status app-monitor-backend@5001.service
```

### Step 4: Verify Health

```bash
# Check service is running
curl http://localhost:5001/health

# Check database connectivity
curl http://localhost:5001/api/dev-bots/tasks

# Check logs
sudo journalctl -u app-monitor-backend@5001.service -n 50
```

---

## Files That Need Updates

1. **`/opt/app-monitor/.env`** - Add DATABASE_PATH
2. **`scripts/deploy.sh`** - Add database path validation
3. **`scripts/health-check.sh`** - Add database connectivity check
4. **`dev-bots/scripts/deploy-agent.sh`** - Improve error reporting
5. **`.github/workflows/deploy-production.yml`** - Consider adding pre-deploy checks
6. **`docs/deployment-environment.md`** - Document DATABASE_PATH requirement
7. **`backend/src/services/database.ts`** - Add migration validation

---

## Success Criteria

Deployment will be considered fixed when:

1. ✅ DATABASE_PATH is properly configured in production .env
2. ✅ Database directory exists and has correct permissions
3. ✅ Backend service starts successfully on port 5001
4. ✅ All migrations apply without errors
5. ✅ Health checks pass within 30 seconds
6. ✅ Deploy agent reports status correctly
7. ✅ GitHub Actions workflow completes successfully
8. ✅ Production service is accessible via nginx

---

**Date**: 2025-11-13  
**Analyzed by**: Deployment Investigation  
**Priority**: P0 - Critical (Production Down)
