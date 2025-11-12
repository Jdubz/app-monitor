# Production Fix - Manual Steps Required

**Date**: 2025-11-10T05:32:00Z  
**Issue**: Deployment hung due to database schema mismatch  
**Status**: Database fixed, new release ready, needs manual switchover

---

## What Was Fixed

### Database Schema Updates ✅

Added missing columns and tables to production database:

**Columns added to `tasks` table:**
- `fingerprint TEXT`
- `started_at INTEGER`
- `agent_type TEXT`
- `can_retry INTEGER`
- `timeout_ms INTEGER`
- `estimated_hours REAL`
- `complexity TEXT`

**Tables created:**
- `workers` - Worker status tracking
- `task_executions` - Execution history
- `task_files` - File associations
- `task_criteria` - Acceptance criteria
- `task_references` - Architecture references
- `task_dependencies` - Task dependencies
- `task_validation_steps` - Validation steps
- `task_success_metrics` - Success metrics

**Database backups created:**
- `/opt/app-monitor/shared/backend/data/dev-bots.db.backup-before-fingerprint`
- `/opt/app-monitor/shared/backend/data/dev-bots.db.backup-full-20251109_213026`

### New Release Validated ✅

Release `20251109_211708` tested and working:
- ✅ Has `shared/api-contracts` directory
- ✅ All node_modules installed
- ✅ Backend starts successfully
- ✅ Database schema compatible
- ✅ No startup errors

---

## Manual Steps Required

### Option 1: Use Deployment Script (Recommended)

```bash
cd /opt/app-monitor
sudo bash scripts/deploy.sh
```

This will complete the deployment that was rolled back.

### Option 2: Manual Switchover

If deployment script doesn't work, manually complete these steps:

1. **Update current symlink**
   ```bash
   sudo ln -sfn /opt/app-monitor/releases/20251109_211708 /opt/app-monitor/current
   ```

2. **Restart backend service**
   ```bash
   sudo systemctl restart app-monitor-backend@5001.service
   ```

3. **Verify service is running**
   ```bash
   sudo systemctl status app-monitor-backend@5001.service
   curl http://localhost:5001/
   ```

4. **Update nginx (if needed)**
   ```bash
   sudo cp /opt/app-monitor/scripts/production/nginx-app-monitor.conf /etc/nginx/sites-available/app-monitor
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

## Verification Steps

After completing manual steps:

1. **Check backend is running**
   ```bash
   curl http://localhost:5001/
   # Should return: {"message":"Dev Monitor Backend","version":"1.0.0","status":"running"}
   ```

2. **Check webhook endpoint**
   ```bash
   curl https://app-monitor.joshwentworth.com/api/github/webhooks/health
   # Should return: {"success":true,"message":"GitHub webhooks endpoint is healthy",...}
   ```

3. **Check logs**
   ```bash
   journalctl -u app-monitor-backend@5001.service -n 50 --no-pager
   ```

4. **Verify webhook handler initialized**
   ```bash
   journalctl -u app-monitor-backend@5001.service | grep webhook_handler_initialized
   # Should show: "GitHub webhook handler configured and ready"
   ```

---

## What's in the New Release

**Commit**: `ca71af5` (latest from staging)

**Features**:
- ✅ GitHub webhook integration complete
- ✅ PR status updates via webhooks
- ✅ Task queue PR lookup methods
- ✅ PRWorkflowOrchestrator webhook callbacks
- ✅ All documentation updated
- ✅ Database backup script fixed
- ✅ Deployment tarball includes shared/

**Files Modified**: 15+ commits, 20+ files

---

## Rollback Plan

If issues occur after switchover:

```bash
# Revert to previous release
sudo ln -sfn /opt/app-monitor/releases/20251109_210106 /opt/app-monitor/current
sudo systemctl restart app-monitor-backend@5001.service
```

**Note**: Previous release may have database compatibility issues since we updated the schema. If rollback is needed, also restore the database:

```bash
cp /opt/app-monitor/shared/backend/data/dev-bots.db.backup-before-fingerprint \
   /opt/app-monitor/shared/backend/data/dev-bots.db
```

---

## Next Steps After Deployment

1. Test webhook with a PR:
   - Create test PR with task ID in title
   - Verify logs show webhook received
   - Verify task status updated

2. Monitor for issues:
   - Watch logs for errors
   - Check webhook delivery in GitHub
   - Verify no race conditions with polling

3. Schedule Phase 4b:
   - After 2-4 weeks of stable operation
   - Remove polling code
   - Webhook-only architecture

---

## Contact

**Issue**: Database schema mismatch  
**Root Cause**: Production database didn't have columns/tables added in recent commits  
**Fix**: Manually added missing schema to production database  
**Status**: Ready for manual switchover

**Commands executed to fix database:**
```sql
-- Added columns
ALTER TABLE tasks ADD COLUMN fingerprint TEXT
ALTER TABLE tasks ADD COLUMN started_at INTEGER
ALTER TABLE tasks ADD COLUMN agent_type TEXT
ALTER TABLE tasks ADD COLUMN can_retry INTEGER
ALTER TABLE tasks ADD COLUMN timeout_ms INTEGER
ALTER TABLE tasks ADD COLUMN estimated_hours REAL
ALTER TABLE tasks ADD COLUMN complexity TEXT

-- Created tables
CREATE TABLE IF NOT EXISTS workers (...)
CREATE TABLE IF NOT EXISTS task_executions (...)
CREATE TABLE IF NOT EXISTS task_files (...)
-- ... and 5 more
```

**Last Updated**: 2025-11-10T05:32:00Z
