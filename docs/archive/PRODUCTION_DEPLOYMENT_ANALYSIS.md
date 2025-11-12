# Production Deployment Analysis & PM2 Integration

**Date:** 2025-11-11T20:05:00Z  
**Status:** CRITICAL INCOMPATIBILITY FOUND

---

## ❌ CRITICAL FINDING: PM2 Config Incompatible with Existing Blue-Green Deployment

### Current Production Architecture

**Deployment Strategy:** Blue-Green with port-based switching
- **Service Template:** `app-monitor-backend@.service` (systemd template)
- **Port 5001:** "Blue" instance  
- **Port 5002:** "Green" instance
- **Nginx Upstream:** Switches between ports (zero-downtime)
- **Deployment Process:** Creates new release → starts on inactive port → health check → switches nginx → drains old port

**Why This Exists:**
1. **Zero-downtime deployments** - new version starts while old runs
2. **Instant rollback** - just switch nginx back to old port
3. **Connection draining** - 60s for WebSockets to migrate
4. **Health validation** - new version proven healthy before traffic switch

### The PM2 Configuration Problem

**Our PM2 config (`deployment/ecosystem.config.js`):**
```javascript
{
  name: 'app-monitor-backend',
  script: './dist/index.js',
  cwd: '/opt/app-monitor/current/backend',
  instances: 1,
  exec_mode: 'fork',
  env: {
    PORT: 3001  // ❌ WRONG - conflicts with blue-green ports!
  }
}
```

**Systemd service (`deployment/app-monitor.service`):**
```ini
[Service]
ExecStart=/usr/bin/pm2 start /opt/app-monitor/deployment/ecosystem.config.js --no-daemon
WorkingDirectory=/opt/app-monitor/current/backend
```

**CONFLICTS:**

1. **Port Mismatch**
   - PM2 config hardcodes `PORT=3001`
   - Blue-green uses `5001` and `5002`
   - Nginx expects upstream on `5001` or `5002`
   - Result: **App starts on wrong port, nginx can't reach it**

2. **Single Instance vs Dual**
   - Blue-green needs TWO instances running during deployment
   - PM2 configured for ONE instance
   - Result: **Cannot do zero-downtime deployment**

3. **Systemd Template Incompatibility**
   - Existing: `app-monitor-backend@5001.service`, `app-monitor-backend@5002.service`
   - Our config: `app-monitor.service` (no port parameter)
   - Deployment script expects: `systemctl start app-monitor-backend@${PORT}.service`
   - Result: **Deployment script will fail**

4. **Current Symlink vs Releases**
   - Blue-green: Creates timestamped releases (`/opt/app-monitor/releases/20251111_102436`)
   - PM2 config: Uses `/opt/app-monitor/current/backend` (symlink)
   - During deployment: Symlink switches mid-deployment
   - Result: **PM2 may restart on wrong codebase**

---

## Detailed Architecture Analysis

### How Blue-Green Deployment Works

```
┌─────────────────────────────────────────────────────────┐
│                    DEPLOYMENT FLOW                        │
└─────────────────────────────────────────────────────────┘

Step 1: Determine active/target ports
  Active: 5001 (Blue)  →  Target: 5002 (Green)

Step 2: Create new release
  /opt/app-monitor/releases/20251111_195000/
  ├── backend/
  ├── frontend/
  └── ... (full codebase)

Step 3: Build application
  cd releases/20251111_195000/backend
  npm ci && npm run build

Step 4: Start on target port (5002)
  systemctl start app-monitor-backend@5002.service
  
  # This service runs:
  PORT=5002 node /opt/app-monitor/current/backend/dist/index.js

Step 5: Health check
  curl http://localhost:5002/api/health

Step 6: Switch nginx upstream
  # Before:
  upstream app_monitor_backend {
    server 127.0.0.1:5001;  # Blue
  }
  
  # After:
  upstream app_monitor_backend {
    server 127.0.0.1:5002;  # Green
  }
  
  nginx -s reload

Step 7: Connection drain (60s)
  # Both instances running:
  - 5001 (Blue): Handling existing WebSocket connections
  - 5002 (Green): Handling new HTTP/WebSocket connections

Step 8: Stop old instance
  systemctl stop app-monitor-backend@5001.service

Step 9: Cleanup
  # Keep last 5 releases, delete older ones
```

### Current Directory Structure

```
/opt/app-monitor/
├── current -> releases/20251111_102436/  # Symlink to active release
├── releases/
│   ├── 20251111_095000/
│   ├── 20251111_102436/  ← Current active
│   ├── 20251111_153000/
│   └── ... (up to 5 kept)
├── shared/
│   ├── backend/data/  # Database (persistent)
│   ├── logs/          # Logs (persistent)
│   └── config/
│       ├── .env.production
│       └── active-port  # Contains "5001" or "5002"
└── scripts/
    ├── deploy.sh
    ├── rollback.sh
    ├── health-check.sh
    └── backup-db.sh
```

### Nginx Configuration

```nginx
upstream app_monitor_backend {
    server 127.0.0.1:5001;  # Switches between 5001 ↔ 5002
    keepalive 32;
}

server {
    listen 80;
    root /opt/app-monitor/current/frontend/dist;
    
    location /api/ {
        proxy_pass http://app_monitor_backend;
    }
    
    location /socket.io/ {
        proxy_pass http://app_monitor_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**Key Points:**
- Nginx config file: `/etc/nginx/sites-available/app-monitor`
- Upstream switches during deployment
- Frontend served from `/opt/app-monitor/current/frontend/dist`

---

## Why Our PM2 Approach Won't Work

### Scenario: Deployment with PM2

```bash
# User runs: sudo systemctl start app-monitor

1. Systemd starts PM2:
   pm2 start /opt/app-monitor/deployment/ecosystem.config.js --no-daemon

2. PM2 reads config:
   {
     name: 'app-monitor-backend',
     cwd: '/opt/app-monitor/current/backend',
     env: { PORT: 3001 }  # ❌ Wrong port!
   }

3. PM2 starts app:
   cd /opt/app-monitor/current/backend
   PORT=3001 node dist/index.js

4. App listens on port 3001

5. Nginx tries to connect to port 5001
   → Connection refused

6. Users get 502 Bad Gateway

7. Deployment FAILED
```

### Scenario: During Blue-Green Deployment

```bash
# Current state:
- Port 5001 running (Blue)
- /opt/app-monitor/current → releases/20251110_090000/

# Deploy script creates new release:
mkdir /opt/app-monitor/releases/20251111_195000
rsync ... /opt/app-monitor/releases/20251111_195000/

# Deploy script updates symlink:
ln -sfn /opt/app-monitor/releases/20251111_195000 /opt/app-monitor/current

# Deploy script starts service on port 5002:
systemctl start app-monitor-backend@5002.service

# IF we had PM2:
  - PM2 sees /opt/app-monitor/current changed
  - PM2 auto-restarts (watch: true or manual reload)
  - Old process on 5001 dies unexpectedly
  - ❌ DOWNTIME - traffic still going to 5001!

# Without PM2 (current):
  - 5001 keeps running (old code)
  - 5002 starts (new code)
  - Both coexist for 60s
  - ✅ ZERO DOWNTIME
```

---

## Solutions

### Option 1: Keep Existing System (RECOMMENDED)

**DON'T use PM2 for production.**

**Rationale:**
- Existing blue-green system is **well-designed**
- Already has zero-downtime deployments
- Already has instant rollback capability
- Already has connection draining
- **Works perfectly** - just has a duplicate process bug

**Fix for stuck PRs:**
```bash
# Problem: Two instances of app-monitor-backend@5001.service running
# Root cause: Manual `npm start` left running + systemd service started

# Solution:
1. Stop all manual node processes:
   pkill -f "node.*dist/index.js"

2. Ensure only systemd-managed processes:
   systemctl stop app-monitor-backend@5001.service
   systemctl stop app-monitor-backend@5002.service
   
3. Check which port should be active:
   cat /opt/app-monitor/shared/config/active-port
   
4. Start correct service:
   sudo systemctl start app-monitor-backend@5001.service  # or 5002
   
5. Verify:
   systemctl status app-monitor-backend@5001.service
   curl http://localhost:5001/api/health
```

**Prevention:**
- Add monitoring to detect duplicate processes
- Add health checks to CI/CD pipeline
- Document that manual `npm start` should NEVER be used in prod

### Option 2: Adapt PM2 for Blue-Green (COMPLEX)

**Make PM2 work with blue-green deployment.**

**Changes needed:**

1. **Create two PM2 ecosystem configs:**
   ```javascript
   // ecosystem.blue.config.js
   module.exports = {
     apps: [{
       name: 'app-monitor-backend-blue',
       script: './dist/index.js',
       cwd: '/opt/app-monitor/current/backend',
       env: { PORT: 5001 }
     }]
   };
   
   // ecosystem.green.config.js
   module.exports = {
     apps: [{
       name: 'app-monitor-backend-green',
       script: './dist/index.js',
       cwd: '/opt/app-monitor/current/backend',
       env: { PORT: 5002 }
     }]
   };
   ```

2. **Create two systemd services:**
   ```ini
   # app-monitor-backend-blue.service
   [Service]
   ExecStart=/usr/bin/pm2 start /opt/app-monitor/deployment/ecosystem.blue.config.js --no-daemon
   
   # app-monitor-backend-green.service
   [Service]
   ExecStart=/usr/bin/pm2 start /opt/app-monitor/deployment/ecosystem.green.config.js --no-daemon
   ```

3. **Update deploy.sh:**
   ```bash
   # Instead of:
   systemctl start app-monitor-backend@${TARGET_PORT}.service
   
   # Use:
   if [ "$TARGET_PORT" == "5001" ]; then
     systemctl start app-monitor-backend-blue.service
   else
     systemctl start app-monitor-backend-green.service
   fi
   ```

**Problems with this approach:**
- Doubles complexity
- PM2 adds no value (systemd already does auto-restart)
- PM2 resource overhead (extra process per instance)
- More points of failure

### Option 3: Use PM2 WITHOUT Blue-Green (NOT RECOMMENDED)

**Replace blue-green with single PM2 instance.**

**Changes:**
- Remove port-based switching
- Single service on port 3001
- Use PM2 reload for zero-downtime (limited)
- Lose instant rollback capability

**Deployment flow:**
```bash
# Build new code
cd /opt/app-monitor/current
git pull
npm ci && npm run build

# Reload PM2 (not truly zero-downtime for WebSockets)
pm2 reload app-monitor-backend

# If fail, rollback:
git reset --hard <prev-commit>
npm run build
pm2 reload app-monitor-backend
```

**Why not recommended:**
- PM2 reload doesn't drain WebSocket connections properly
- No health check before traffic switch
- Rollback requires rebuild (slow)
- Loses all benefits of current system

---

## Recommended Action Plan

### Immediate (Fix Stuck PRs)

**1. Clean up duplicate processes:**
```bash
# SSH to production
ssh production-server

# Check what's running
ps aux | grep "node.*dist/index.js"
systemctl status app-monitor-backend@*

# Kill manual processes (not systemd ones)
# Find PIDs that aren't managed by systemd
ps aux | grep "node.*dist/index.js" | grep -v systemd

# Stop all instances cleanly
sudo systemctl stop app-monitor-backend@5001.service
sudo systemctl stop app-monitor-backend@5002.service

# Kill any remaining
pkill -f "node.*dist/index.js"

# Check active port config
cat /opt/app-monitor/shared/config/active-port

# Start correct service
sudo systemctl start app-monitor-backend@5001.service  # or whatever active-port says
```

**2. Verify working:**
```bash
# Check service
systemctl status app-monitor-backend@5001.service

# Check health
curl http://localhost:5001/api/health

# Check nginx
curl http://localhost/api/health

# Monitor logs
journalctl -u app-monitor-backend@5001.service -f
```

**3. Verify webhooks:**
```bash
# Push test commit
cd /home/jdubz/Development/app-monitor
git checkout staging
echo "# test" >> README.md
git commit -am "test: verify webhooks working"
git push

# Watch logs for webhook events
journalctl -u app-monitor-backend@5001.service -f | grep webhook
```

### Short-term (Prevent Recurrence)

**1. Add process monitoring:**
```bash
# Cron job to detect duplicates
*/5 * * * * /opt/app-monitor/scripts/check-duplicates.sh
```

**Script: `/opt/app-monitor/scripts/check-duplicates.sh`:**
```bash
#!/bin/bash
# Check for duplicate node processes

PROCESS_COUNT=$(ps aux | grep "node.*dist/index.js" | grep -v grep | wc -l)

if [ "$PROCESS_COUNT" -gt 1 ]; then
  echo "⚠️  WARNING: $PROCESS_COUNT node processes detected!"
  ps aux | grep "node.*dist/index.js" | grep -v grep
  
  # Send alert
  echo "Multiple app-monitor processes detected" | \
    mail -s "ALERT: Duplicate processes" admin@domain.com
fi
```

**2. Update documentation:**
- Add WARNING to README about never using `npm start` in prod
- Document proper restart procedure
- Add troubleshooting guide for stuck PRs

**3. Add deployment validation:**
```bash
# In deploy.sh, after starting service:
PROCESS_COUNT=$(ps aux | grep "node.*dist/index.js" | grep -v grep | wc -l)
if [ "$PROCESS_COUNT" -ne 1 ]; then
  log_error "Expected 1 process during deployment, found $PROCESS_COUNT"
  # Continue anyway but log warning
fi
```

### Long-term (Improvements)

**1. Consider Docker containers** (future)
- Each deployment gets its own container
- No port conflicts possible
- Even better isolation
- Natural fit for blue-green

**2. Add automated health monitoring**
- Continuous health checks every 5 min
- Alert on 3 consecutive failures
- Auto-rollback on critical failure

**3. Deployment dashboard**
- Show active port
- Show release history
- Show rollback button
- Show process count alerts

---

## Conclusion

**DO NOT use the PM2 configuration we created.**

**Reasons:**
1. Incompatible with existing blue-green deployment
2. Would cause downtime
3. Would break rollback capability
4. Adds complexity without benefit

**The existing system is good!** It just had a one-time duplicate process issue.

**Fix:**
1. Clean up duplicate processes (manual)
2. Add monitoring to detect duplicates (preventive)
3. Document proper procedures (educational)

**Files to DELETE:**
- `deployment/ecosystem.config.js`
- `deployment/app-monitor.service`
- `deployment/install-service.sh`

**Files to KEEP:**
- `scripts/systemd/app-monitor-backend@.service` (existing)
- `scripts/production/deploy.sh` (existing)
- `scripts/production/nginx-app-monitor.conf` (existing)

---

## Decision Matrix

| Aspect | Current System | PM2 Single | PM2 Blue-Green |
|--------|---------------|------------|----------------|
| Zero-downtime | ✅ Yes | ⚠️  Limited | ✅ Yes |
| Instant rollback | ✅ Yes (< 5s) | ❌ No (rebuild) | ✅ Yes |
| WebSocket drain | ✅ 60s | ❌ Drops | ✅ 60s |
| Complexity | ⭐⭐ Medium | ⭐ Simple | ⭐⭐⭐⭐ High |
| Process management | systemd | PM2 | systemd + PM2 |
| Auto-restart | ✅ Yes | ✅ Yes | ✅ Yes |
| Resource overhead | Low | Medium | High |
| **Recommendation** | **KEEP ✅** | Avoid | Avoid |

---

**Status:** Analysis complete - DO NOT deploy PM2 config to production
**Action Required:** Clean up duplicate processes manually, add monitoring
**Documentation:** Update with proper restart procedures
