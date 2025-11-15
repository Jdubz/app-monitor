# Deploy Agent Integration for Lock Health Monitoring

## Overview

The deployment lock health checks are integrated into the existing `app-monitor-deploy-agent.timer` rather than creating a separate monitoring service.

## Benefits

- **Reuses existing infrastructure**: No additional timers/services needed
- **More frequent checks**: Runs every 2 minutes (vs 5 minutes with separate timer)
- **Integrated logging**: All deployment events in one place
- **Simpler maintenance**: Single service to monitor

## Implementation

### Code to Add

Add this function to `/home/jdubz/Development/app-monitor-deployment/scripts/deploy-agent.sh`:

```bash
check_deployment_lock_health() {
  local lock_manager="${DEPLOY_AGENT_LOCK_MANAGER:-/opt/app-monitor/scripts/deployment-lock-manager.sh}"
  
  # Skip if lock manager doesn't exist yet
  [[ ! -x "$lock_manager" ]] && return 0
  
  # Run health check and auto-cleanup if needed
  if ! "$lock_manager" check 2>&1 | tee -a "${LOG_DIR}/lock-health.log"; then
    local exit_code=$?
    if [[ $exit_code -eq 3 ]]; then
      log "WARN" "Stale deployment lock detected, cleaning up"
      "$lock_manager" cleanup 2>&1 | tee -a "${LOG_DIR}/lock-health.log"
    elif [[ $exit_code -eq 2 ]]; then
      log "ERROR" "Deployment deadlock detected (>30min), manual intervention required"
    fi
  fi
}
```

### Integration Point

Insert the health check **before** `acquire_lock` in the main execution flow:

```bash
load_env
ensure_dir "$WORK_DIR"
ensure_dir "$LOG_DIR"
check_deployment_lock_health  # <-- Add this line
acquire_lock
fetch_pat
process_deployment
```

## How It Works

### Every 2 Minutes (Deploy Agent Cycle)

1. **Deploy agent timer fires** (existing timer)
2. **Check deployment lock health** (new step)
   - If healthy: Continue to step 3
   - If stale lock (exit 3): Auto-cleanup, then continue
   - If deadlock (exit 2): Log error, then continue
3. **Acquire deploy agent lock** (existing step)
4. **Check for new deployments** (existing step)
5. **Process deployment if queued** (existing step)

### Auto-Recovery Flow

```
Deploy Agent Starts
       ↓
Check Lock Health
       ↓
   ┌───┴───┐
   │       │
Healthy  Stale Lock?
   │       │
   │   Auto-Cleanup
   │       │
   └───┬───┘
       ↓
Acquire Agent Lock
       ↓
Process Deployments
```

## Verification

### After Integration

```bash
# Check deploy agent is running
systemctl status app-monitor-deploy-agent.timer

# View recent lock health checks
tail -f ~/.cache/app-monitor-deploy-agent/logs/lock-health.log

# View integrated logs
journalctl -u app-monitor-deploy-agent.service -n 50
```

### Expected Log Entries

**Healthy State** (every 2 minutes):
```
[INFO] No deployment lock issues detected
```

**Stale Lock Auto-Recovery**:
```
[WARN] Stale deployment lock detected, cleaning up
[INFO] Removed stale lock file
[INFO] Lock cleanup successful
```

**Deadlock Alert**:
```
[ERROR] Deployment deadlock detected (>30min), manual intervention required
[ERROR] Process 12345 has held lock for 1845 seconds
```

## Configuration

### Environment Variables

Optional configuration via deploy agent's `.env`:

```bash
# Override lock manager path
DEPLOY_AGENT_LOCK_MANAGER=/custom/path/to/deployment-lock-manager.sh
```

### Lock Manager Thresholds

Configured in `/opt/app-monitor/scripts/deployment-lock-manager.sh`:

```bash
MAX_LOCK_AGE_SECONDS=1800  # 30 minutes before deadlock alert
```

## Maintenance

### Monitoring Health Checks

```bash
# Real-time monitoring
tail -f ~/.cache/app-monitor-deploy-agent/logs/lock-health.log

# Count health checks in last hour
journalctl -u app-monitor-deploy-agent.service --since "1 hour ago" | grep -c "lock"

# Find any deadlock alerts
journalctl -u app-monitor-deploy-agent.service --since "1 week ago" | grep "deadlock"
```

### Manual Testing

```bash
# Create a fake stale lock
echo "99999:$(date +%s)" | sudo tee /opt/app-monitor/.deployment.lock

# Wait up to 2 minutes for deploy agent to run
# Should see auto-cleanup in logs

# Verify cleanup happened
journalctl -u app-monitor-deploy-agent.service -n 20 | grep -i "stale"
```

## Troubleshooting

### Health Check Not Running

**Symptom**: No lock health log entries

**Checks**:
```bash
# 1. Verify deploy agent timer is active
systemctl status app-monitor-deploy-agent.timer

# 2. Check lock manager exists and is executable
ls -lh /opt/app-monitor/scripts/deployment-lock-manager.sh

# 3. Verify LOG_DIR is writable
ls -ld ~/.cache/app-monitor-deploy-agent/logs/
```

### Repeated Stale Lock Cleanups

**Symptom**: Same lock being cleaned up repeatedly

**Possible Causes**:
- Deploy script crashes after creating lock
- Process killed externally
- Lock file permissions issue

**Investigation**:
```bash
# Check recent deployment attempts
ls -lh ~/.cache/app-monitor-deploy-agent/logs/deploy-*.log

# View last few deployment logs
tail -n 100 ~/.cache/app-monitor-deploy-agent/logs/deploy-*.log | grep -i error
```

### Deadlock Not Detected

**Symptom**: Deployment stuck but no deadlock alert

**Checks**:
```bash
# 1. Check lock age manually
/opt/app-monitor/scripts/deployment-lock-manager.sh check

# 2. Verify deploy agent is still running
systemctl status app-monitor-deploy-agent.timer

# 3. Check for health check errors
journalctl -u app-monitor-deploy-agent.service | grep -i error
```

## Migration Notes

### From Separate Timer (if previously implemented)

If you previously set up `deployment-lock-monitor.timer`:

```bash
# 1. Stop and disable old timer
sudo systemctl stop deployment-lock-monitor.timer
sudo systemctl disable deployment-lock-monitor.timer

# 2. Remove old service files
sudo rm /etc/systemd/system/deployment-lock-monitor.{service,timer}

# 3. Reload systemd
sudo systemctl daemon-reload

# 4. Update deploy agent (integration above)

# 5. Verify integration
journalctl -u app-monitor-deploy-agent.service -n 50 | grep lock
```

## Related Documentation

- [Deployment Protection System](deployment-protection-system.md) - Full system overview
- [Production Deployment](PRODUCTION_DEPLOYMENT.md) - Deployment procedures
- Deploy Agent Repository - Separate maintenance repository
