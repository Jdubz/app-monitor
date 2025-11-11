# System Service Management Fixes - Implementation Summary

**Date:** 2025-11-11T19:50:00Z  
**Status:** Implemented - Ready for Deployment

---

## What Was Implemented

### 1. PM2 Ecosystem Configuration (`deployment/ecosystem.config.js`)

**Features:**
- Single backend instance management
- Auto-restart on failure (max 10 restarts)
- Memory limit monitoring (1GB)
- Structured logging to `/opt/app-monitor/logs/`
- Graceful shutdown handling (5s timeout)
- Production environment configuration

**Benefits:**
- Prevents duplicate processes
- Automatic crash recovery
- Better resource management
- Centralized log management

### 2. Systemd Service File (`deployment/app-monitor.service`)

**Configuration:**
- Runs as user `jdubz`
- Uses PM2 as process manager
- Auto-restart on failure (10s delay)
- Proper signal handling (SIGTERM)
- Resource limits (65536 file handles)
- Journal logging integration

**Benefits:**
- System-level process management
- Survives server reboots
- Standard Linux service management
- Security best practices (NoNewPrivileges, PrivateTmp)

### 3. Installation Script (`deployment/install-service.sh`)

**Actions:**
- Installs PM2 globally if missing
- Copies configuration files to system locations
- Stops any existing duplicate processes
- Registers systemd service
- Provides usage instructions

**Usage:**
```bash
cd /home/jdubz/Development/app-monitor/deployment
sudo ./install-service.sh
sudo systemctl start app-monitor
```

---

## How This Fixes Stuck PRs

### Root Cause Identified:
**Two backend processes running → port conflict → no webhook processing → PRs stuck**

### Solution:
1. **PM2 Process Management**
   - Only one process per application
   - Automatic PID management
   - Built-in restart policies

2. **Systemd Integration**
   - System-level supervision
   - Proper shutdown on restart
   - Clean process lifecycle

3. **Automatic Health Checks**
   - PM2 monitors process health
   - Auto-restart on crashes
   - Resource limit enforcement

---

## Deployment Instructions

### Step 1: Install Service (One-Time Setup)

```bash
# Navigate to deployment directory
cd /home/jdubz/Development/app-monitor/deployment

# Run installation script
sudo ./install-service.sh

# Expected output:
# 🔧 Installing App Monitor System Service...
# 📦 Installing PM2...
# 📋 Copying PM2 ecosystem config...
# 📋 Installing systemd service...
# 🛑 Stopping any existing processes...
# 🔄 Reloading systemd...
# ✅ Enabling app-monitor service...
# ✅ Installation complete!
```

### Step 2: Start the Service

```bash
sudo systemctl start app-monitor
```

### Step 3: Verify Running

```bash
# Check service status
sudo systemctl status app-monitor

# Check PM2 status
pm2 status

# Check health endpoint
curl http://localhost:3001/api/health

# View logs
sudo journalctl -u app-monitor -f
# OR
pm2 logs app-monitor-backend
```

---

## Management Commands

### Service Control

```bash
# Start service
sudo systemctl start app-monitor

# Stop service
sudo systemctl stop app-monitor

# Restart service
sudo systemctl restart app-monitor

# Check status
sudo systemctl status app-monitor

# Enable on boot
sudo systemctl enable app-monitor

# Disable on boot
sudo systemctl disable app-monitor
```

### PM2 Management

```bash
# List processes
pm2 list

# View logs (real-time)
pm2 logs app-monitor-backend

# View logs (last 100 lines)
pm2 logs app-monitor-backend --lines 100

# Monitor resources
pm2 monit

# Restart application
pm2 restart app-monitor-backend

# Reload (zero-downtime)
pm2 reload app-monitor-backend

# Stop application
pm2 stop app-monitor-backend

# Delete from PM2
pm2 delete app-monitor-backend
```

### Log Management

```bash
# View systemd logs
sudo journalctl -u app-monitor -f

# View last 50 lines
sudo journalctl -u app-monitor -n 50

# View logs since boot
sudo journalctl -u app-monitor -b

# View PM2 logs
tail -f /opt/app-monitor/logs/pm2-out.log
tail -f /opt/app-monitor/logs/pm2-error.log
```

---

## What Was NOT Implemented (Future Enhancements)

### 1. Startup PR Evaluation

**Planned but deferred** due to type issues with GitHubPRService.

**What it would do:**
- On server startup, evaluate all open PRs
- Prevents PRs from being stuck after restart
- Detects stale PRs immediately

**Implementation needed:**
```typescript
// In index.ts after server starts
async function evaluateExistingPRs() {
  const taskQueue = devBotsManager.getTaskQueue();
  const prConditionState = getPRConditionStateService(taskQueue);
  // Fetch open PRs from GitHub
  // Evaluate each one
}
```

**Priority:** HIGH - implement in next iteration

### 2. Webhook Health Monitoring

**Concept:**
```typescript
let lastWebhookTime = Date.now();

// Alert if no webhooks in >1 hour
setInterval(() => {
  const silence = Date.now() - lastWebhookTime;
  if (silence > 60 * 60 * 1000) {
    logger.error({ message: 'No webhooks in 1 hour!' });
    // Send alert
  }
}, 5 * 60 * 1000);
```

**Priority:** MEDIUM

### 3. Stale PR Detection

**Already documented** in PR_TRACKING_ANALYSIS.md

**Priority:** HIGH

---

## Immediate Next Steps

### 1. Deploy Service Configuration (NOW)

```bash
cd /home/jdubz/Development/app-monitor/deployment
sudo ./install-service.sh
sudo systemctl start app-monitor
```

### 2. Verify Webhooks Working (5 mins)

```bash
# Push empty commit to trigger webhook
git checkout task-implementation-de0d23692ef2
git commit --allow-empty -m "test: verify webhook processing"
git push

# Watch logs
pm2 logs app-monitor-backend --lines 50 | grep webhook
```

### 3. Monitor PR Progress (15 mins)

```bash
# Check PR status every 2 minutes
watch -n 120 'gh pr list --state open | grep -E "96|97|98|99"'

# Should see PRs auto-merging as conditions are met
```

---

## Expected Timeline After Deployment

| Time | Event |
|------|-------|
| **T+0** | Service deployed and started |
| **T+2min** | Webhooks being processed |
| **T+5min** | PR conditions evaluated |
| **T+10min** | Update tasks created for PRs #96, #97, #98 |
| **T+15min** | Bots merge main into PR branches |
| **T+20min** | CI re-runs on updated branches |
| **T+25min** | All conditions met |
| **T+30min** | PRs auto-merge to main |

**PR #99:** Needs manual conflict resolution first

---

## Success Criteria

✅ Single backend process running  
✅ Health endpoint responds  
✅ Webhooks being received and processed  
✅ PR conditions evaluated  
✅ Update tasks created  
✅ PRs progressing toward merge  

---

## Rollback Plan

If issues occur:

```bash
# Stop the service
sudo systemctl stop app-monitor

# Remove service
sudo systemctl disable app-monitor
sudo rm /etc/systemd/system/app-monitor.service
sudo systemctl daemon-reload

# Clean PM2
pm2 delete all
pm2 kill

# Manual start (old way)
cd /opt/app-monitor/current/backend
npm start
```

---

## Files Created

1. `deployment/ecosystem.config.js` - PM2 configuration
2. `deployment/app-monitor.service` - Systemd unit file  
3. `deployment/install-service.sh` - Installation script
4. `docs/SYSTEM_SERVICE_IMPLEMENTATION.md` - This document

**Commit:** feat: add system service management configuration  
**Branch:** staging  
**Status:** Committed, ready to push

---

**Next Action:** Deploy to production and verify PRs unstuck within 30 minutes
