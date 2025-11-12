# Production Deployment Guide - Pull Agent Architecture

Complete guide for production deployment using the secure pull-agent architecture.

## Quick Links

- **Architecture**: Pull-agent with GitHub-hosted builds
- **Deployment Time**: ~2.5 minutes (optimized)
- **Zero Downtime**: Yes (blue-green with graceful shutdown)
- **Rollback Time**: ~45 seconds
- **Last Updated**: 2025-11-12

## Overview

**Current Status:** Production-ready with blue-green deployment ✅

The deployment system uses:
- **Blue-green deployment** on ports 5001 ↔ 5002
- **30-second drain period** between instances
- **90-second graceful shutdown** (60s tasks + 30s WebSocket)
- **Comprehensive health checks** (6 different checks)
- **Automatic rollback** on failure
- **State persistence** to database (no Redis needed)

---

## How It Works

### Deployment Flow (Automated)

1. **Push to main** → GitHub Actions builds and packages
2. **Pull agent detects** → Downloads artifact within 2 minutes  
3. **Blue-green deploy** → Deploys to inactive port (e.g., 5002)
4. **Health checks** → 6 comprehensive checks validate new instance
5. **Traffic switch** → Nginx routes to new port **ONLY IF HEALTHY** ✅
6. **Drain period** → 30s with both instances running
7. **Graceful shutdown** → Old instance shuts down over 90s
8. **Cleanup** → Old releases removed (keep last 5)
9. **Status reported** → Success/failure sent back to GitHub

**Total Time:** ~150 seconds (2.5 minutes)  
**Downtime:** ZERO (always one instance serving traffic)

**Health Check Failure:** If new instance fails health checks, deployment automatically rolls back to old instance (zero downtime maintained) ✅

### Health Checks (Automatic)

Before switching traffic, the system validates:

1. ✅ **Service running** (systemctl status)
2. ✅ **Port listening** (ss/nc/lsof)
3. ✅ **HTTP health endpoint** (/api/health returns 200)
4. ✅ **Database connectivity** (can query tasks)
5. ✅ **Docker connectivity** (can access Docker socket)
6. ✅ **WebSocket connectivity** (optional, if tools available)

**If any check fails:** Automatic rollback, old instance continues serving traffic (zero downtime) ✅

### Zero-Downtime Guarantees

The deployment script ensures zero downtime through:

1. **Health-gated traffic switching** - Nginx ONLY routes to new instance if ALL health checks pass
2. **Automatic rollback** - Failed health checks trigger instant rollback to old instance  
3. **Dual-instance drain** - 30s overlap with both instances running during switch
4. **Graceful shutdown** - Old instance has 90s to complete in-flight work
5. **State persistence** - All state saved to database before old instance stops

**Result:** Production traffic NEVER hits an unhealthy instance ✅

### Graceful Shutdown (90 seconds)

When old instance shuts down:

```
Phase 1: Client Notification (1s)
  - Broadcast server_migration event
  - Clients auto-reconnect to new instance

Phase 2: Stop New Connections (immediate)
  - HTTP server closes
  - Health endpoint returns 503

Phase 3: Task Completion Wait (60s)
  - Active dev-bot tasks complete
  - Tasks can be resumed if interrupted

Phase 4: WebSocket Drain (30s)
  - Wait for connections to close naturally
  - Clients already reconnected to new instance

Phase 5: State Persistence
  - Retry history → database
  - PR conditions → database
  - Clean exit (code 0)
```

**Result:** No lost data, no abrupt disconnections

---

## Common Tasks

### Deploy to Production

```bash
git push origin main
# Monitor: journalctl -u app-monitor-deploy-agent.service -f
```

### Manual Deployment

```bash
cd /opt/app-monitor
sudo ./scripts/deploy.sh /home/jdubz/Development/app-monitor
```

### Rollback

```bash
cd /opt/app-monitor
sudo ./scripts/rollback.sh
```

### Check Status

```bash
# Pull agent
systemctl status app-monitor-deploy-agent.timer

# Services
systemctl status 'app-monitor-backend@*'

# Test pull agent
~/Development/app-monitor-deployment/scripts/test-deploy-agent.sh
```

### View Logs

```bash
# Pull agent
journalctl -u app-monitor-deploy-agent.service -f

# Backend
journalctl -u 'app-monitor-backend@*' -f

# Deployments
ls -la ~/.cache/app-monitor-deploy-agent/logs/
```

## Directory Structure

```
/opt/app-monitor/
├── current/              # Symlink to active release
├── releases/             # Timestamped releases
├── shared/
│   ├── backend/data/     # Database
│   ├── logs/             # App logs
│   └── backups/          # DB backups
└── scripts/              # Deployment scripts
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Deployment not processing | Check timer: `systemctl status app-monitor-deploy-agent.timer` |
| Service won't start | Check logs: `journalctl -u app-monitor-backend@5001 -n 50` |
| Health checks failing | Test manually: `curl http://localhost:5001/api/health` |
| Database locked | Stop all services, verify WAL mode enabled |

## Full Documentation

See [CI/CD Setup Guide](./CI_CD_SETUP.md) for:
- Complete pull-agent architecture details
- Initial setup instructions
- Security benefits
- Performance tuning
- Monitoring setup

### Apply Deployment Fixes (One-Time Setup)

After pulling latest code, run this **once** on production server:

```bash
cd /opt/app-monitor/current
scripts/production/apply-deployment-fixes.sh
```

This will:
- ✅ Increase systemd timeout (30s → 120s)
- ✅ Automate process cleanup on start
- ✅ Verify configuration

**Time:** ~5 minutes  
**Requires:** sudo access  
**Effect:** Takes effect on next deployment

---

## Architecture Details

### No Redis Design Decision

**Why no Redis?**
- Adds infrastructure complexity
- Another point of failure  
- Database persistence works fine
- Client auto-reconnect implemented
- Simpler operations

**Trade-offs Accepted:**
- WebSocket connections briefly dropped during deploy
- Clients automatically reconnect (implemented) ✅
- Task state persists across restarts ✅

### Future Enhancement: Self-Healing Deployments

**Status:** Documented for future implementation (P3 priority)

The system could leverage the existing review/repair bot system to automatically fix failed deployments. This would require:
- Special "prod-deploy-bot" with access to production folder
- Ability to update `.env`, deploy scripts, systemd configs
- Integration with existing review/repair workflow

See [SELF_HEALING_DEPLOYMENT.md](../plans/SELF_HEALING_DEPLOYMENT.md) for full design.

**Current State:** Manual fixes after deployment failure are acceptable. Rollback mechanism ensures zero downtime.
- Clients must reconnect (happens automatically in <5s)
- No shared rooms across instances (not needed)

**Works Because:**
- Client reconnect is automatic
- `server_migration` event warns clients
- 30s drain + 90s graceful shutdown = plenty of time
- State persisted to database
- Blue-green means one instance always available

### systemd Configuration

Each instance runs as a separate systemd service:

```ini
# /etc/systemd/system/app-monitor-backend@.service
[Unit]
Description=App Monitor Backend Service (Port %i)
After=network.target docker.service

[Service]
Type=simple
User=jdubz
WorkingDirectory=/opt/app-monitor/current/backend
Environment="PORT=%i"
ExecStart=/usr/bin/node /opt/app-monitor/current/backend/dist/index.js

# Graceful shutdown with 120s timeout
TimeoutStopSec=120
KillMode=mixed
KillSignal=SIGTERM

# Restart on failure
Restart=on-failure
RestartSec=10
```

**Drop-ins Applied:**
- `timeout.conf` - 120s graceful shutdown
- `cleanup.conf` - Automatic process cleanup

### File Structure

```
/opt/app-monitor/
├── current/                    # Symlink to active release
├── releases/
│   ├── 20251112_030000/       # Latest release
│   ├── 20251111_150000/       # Previous releases
│   └── ...                     # (keep last 5)
├── shared/
│   ├── backend/data/
│   │   └── app-monitor.db     # Main database
│   ├── logs/                   # Application logs
│   ├── backups/                # Database backups
│   └── .env                    # Production environment variables
└── scripts/
    ├── deploy.sh               # Main deployment script
    ├── rollback.sh             # Rollback to previous
    ├── health-check.sh         # Health validation
    ├── backup-db.sh            # Database backup
    └── cleanup-processes.sh    # Process cleanup
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Deployment not processing | Check timer: `systemctl status app-monitor-deploy-agent.timer` |
| Service won't start | Check logs: `journalctl -u app-monitor-backend@5001 -n 50` |
| Health checks failing | Test manually: `curl http://localhost:5001/api/health` |
| Database locked | Stop all services, verify WAL mode enabled |
| Orphaned processes | Run: `/opt/app-monitor/scripts/cleanup-processes.sh` |
| Port conflict | Check: `lsof -i :5001` and `lsof -i :5002` |
| Graceful shutdown timeout | Verify systemd timeout: `systemctl show app-monitor-backend@5001 \| grep TimeoutStopSec` |
| Health endpoint returns 503 | Instance is draining, wait ~30s or check if deployment failed |

### Debug Commands

```bash
# Check which port is active
systemctl status 'app-monitor-backend@*'

# Check graceful shutdown configuration
systemctl cat app-monitor-backend@5001

# Test health endpoint
curl -v http://localhost:5001/api/health
curl -v http://localhost:5002/api/health

# View recent deployments
ls -la /opt/app-monitor/releases/

# Check database
sqlite3 /opt/app-monitor/shared/backend/data/app-monitor.db "PRAGMA integrity_check;"

# Check for orphaned processes
ps aux | grep "node.*backend/dist/index.js"
```

---

## Performance & Metrics

### Deployment Metrics

- **Total Time:** 150 seconds (2.5 minutes)
  - Build (GitHub): ~60s
  - Download artifact: ~10s
  - Deploy to inactive port: ~30s  
  - Health checks: ~10s
  - Traffic switch: <1s
  - Drain period: 30s
  - Graceful shutdown: 90s (async)

- **Downtime:** 0 seconds (zero-downtime blue-green)
- **Rollback Time:** ~45 seconds
- **Database Backup:** Automatic before each deploy

### Resource Usage

- **Disk Space:** ~100MB per release (keep last 5 = 500MB)
- **Memory:** ~200MB per instance during steady state
- **CPU:** Minimal (<5%) during normal operation
- **Network:** Pull-agent checks every 2 minutes

---

## Advanced Topics

### Manual Blue-Green Switch

If you need to manually switch between instances:

```bash
# Current: 5001, Switch to: 5002
sudo systemctl start app-monitor-backend@5002
# Wait for healthy
PORT=5002 /opt/app-monitor/scripts/health-check.sh

# Update nginx
sudo sed -i 's/localhost:5001/localhost:5002/' /etc/nginx/sites-enabled/app-monitor
sudo nginx -s reload

# Stop old instance
sudo systemctl stop app-monitor-backend@5001
```

### Database Migrations

Migrations run automatically during deployment. To run manually:

```bash
cd /opt/app-monitor/current/backend
npm run migrate
```

### Environment Variables

Production environment variables live in:
- `/opt/app-monitor/shared/.env` (application config)
- Systemd service files (system config)

**Never commit secrets to git!**

---

## Related Documentation

- [Deployment Checklist](./deployment-checklist.md) - Pre/post deployment tasks
- [CI/CD Setup Guide](./CI_CD_SETUP.md) - Pull-agent architecture
- [Self-Healing Deployment](../plans/SELF_HEALING_DEPLOYMENT.md) - Future enhancement

**Scripts:**
- `scripts/production/deploy.sh` - Main deployment script
- `scripts/production/health-check.sh` - Health validation
- `scripts/production/rollback.sh` - Rollback procedure
- `scripts/production/apply-deployment-fixes.sh` - One-time systemd setup

**Workflows:**
- `.github/workflows/deploy-production.yml` - GitHub Actions deployment
