# Deployment - Final Step Required

**Date**: November 13, 2025  
**Status**: 99% Complete - One Configuration Fix Needed  
**Time to Complete**: 1 minute

---

## What's Complete ✅

1. ✅ **Root cause fixed** - Schema unified between TaskQueueService and migrations
2. ✅ **Migration 016 created** - Adds fingerprint column with safety checks
3. ✅ **Validation scripts** - Prevent future schema conflicts
4. ✅ **CI/CD updated** - Schema validation runs before deployment
5. ✅ **All tests pass** - 936 backend + 128 frontend tests passing
6. ✅ **PRs merged** - #115 and #116 merged to main
7. ✅ **Database prepared** - Migration 016 manually applied to production database
8. ✅ **Code deployed** - Latest code is in `/opt/app-monitor/current`

## What Remains ⏳

**One systemd configuration line needs to be updated.**

### The Problem

The systemd service file has an outdated DATABASE_PATH:
```
Environment="DATABASE_PATH=/opt/app-monitor/shared/backend/data/app-monitor.db"
```

This points to the WRONG database (which doesn't have migrations applied).

It should be:
```
Environment="DATABASE_PATH=/opt/app-monitor/shared/data/dev-bots.db"
```

This points to the CORRECT database (which has all migrations including 016).

---

## The Fix

Run ONE of these commands:

### Option 1: Automated Script (Recommended)
```bash
sudo /tmp/fix-systemd.sh
```

### Option 2: Manual Commands
```bash
# Update the systemd service file
sudo sed -i 's|/opt/app-monitor/shared/backend/data/app-monitor.db|/opt/app-monitor/shared/data/dev-bots.db|' \
  /etc/systemd/system/app-monitor-backend@.service

# Reload systemd configuration
sudo systemctl daemon-reload

# Restart the backend service
sudo systemctl restart app-monitor-backend@5001.service
```

### Option 3: Edit Manually
```bash
sudo vim /etc/systemd/system/app-monitor-backend@.service
# Change line 13: DATABASE_PATH=/opt/app-monitor/shared/data/dev-bots.db
# Save and exit

sudo systemctl daemon-reload
sudo systemctl restart app-monitor-backend@5001.service
```

---

## Verification

After running the fix, verify the deployment:

```bash
# 1. Check service is running
systemctl status app-monitor-backend@5001.service

# 2. Test health endpoint
curl http://localhost:5001/health

# 3. Verify database path
journalctl -u app-monitor-backend@5001.service -n 20 | grep DATABASE

# 4. Check migrations applied
node -e "
const db = require('better-sqlite3')('/opt/app-monitor/shared/data/dev-bots.db');
const migrations = db.prepare('SELECT name FROM migrations ORDER BY id').all();
console.log('Migrations:', migrations.length);
console.log('Has 016:', migrations.some(m => m.name === '016_add_fingerprint_column'));
db.close();
"
```

### Expected Output

```
● app-monitor-backend@5001.service - App Monitor Backend Service (Port 5001)
   Loaded: loaded (/etc/systemd/system/app-monitor-backend@.service; disabled; preset: enabled)
   Active: active (running) since Thu 2025-11-13 10:XX:XX PST
```

```
{"status":"ok","timestamp":"2025-11-13T18:XX:XX.XXXZ","uptime":X}
```

```
Migrations: 11
Has 016: true
```

---

## Why This Happened

The systemd service file was created before we implemented the database path standardization. The `Environment=` directive in systemd takes precedence over `.env` files, so even though we updated the `.env` file, the service was still using the old path.

---

## After Successful Deployment

Once the backend is running, you can:

1. **Test the 10 frontend tasks** in `dev-bots-tasks.json`
2. **Monitor the staged queue** feature
3. **Verify schema compatibility** - both fingerprint and project columns working

---

## Quick Status Check

Run this to see current status:

```bash
echo "=== Service Status ==="
systemctl is-active app-monitor-backend@5001.service

echo ""
echo "=== Database Path in Systemd ==="
grep DATABASE_PATH /etc/systemd/system/app-monitor-backend@.service

echo ""
echo "=== Database Migrations ==="
node -e "const db=require('better-sqlite3')('/opt/app-monitor/shared/data/dev-bots.db');console.log(db.prepare('SELECT name FROM migrations').all().map(m=>m.name).join('\\n'));db.close();"
```

---

## Rollback (If Needed)

If something goes wrong, rollback to previous release:

```bash
cd /opt/app-monitor
sudo ln -sfn releases/20251108_221301 current
sudo systemctl restart app-monitor-backend@5001.service
```

---

**Bottom Line**: Run `sudo /tmp/fix-systemd.sh` and you're done! 🚀
