# Deployment Protection System

## Overview

The deployment protection system prevents common deployment failures through automated deadlock detection, stale lock cleanup, and enhanced error reporting.

## Components

### 1. Deployment Lock Manager (`deployment-lock-manager.sh`)

**Purpose**: Monitor and manage deployment locks to prevent hung deployments and stale lock files.

**Features**:
- **Deadlock Detection**: Identifies deployments stuck for >30 minutes
- **Stale Lock Detection**: Finds lock files from crashed processes
- **Automatic Recovery**: Cleans up stale locks automatically
- **Process Validation**: Verifies locks belong to actual deployment processes

**Usage**:
```bash
# Check for issues
/opt/app-monitor/scripts/deployment-lock-manager.sh check

# Force cleanup of stale locks
/opt/app-monitor/scripts/deployment-lock-manager.sh cleanup

# Monitor with auto-recovery (used by systemd timer)
/opt/app-monitor/scripts/deployment-lock-manager.sh monitor
```

**Exit Codes**:
- `0` - Healthy (no lock or active deployment)
- `1` - Error during operation
- `2` - Deadlock detected (deployment running too long)
- `3` - Stale lock detected (process not running)

### 2. Automated Monitoring (Systemd Timer)

**Purpose**: Periodic health checks with automatic recovery.

**Configuration**:
- **Interval**: Every 5 minutes
- **First Run**: 2 minutes after boot
- **Action**: Auto-cleanup of stale locks, alerts for deadlocks

**Service Files**:
- `deployment-lock-monitor.service` - Oneshot service that runs health check
- `deployment-lock-monitor.timer` - Timer that triggers the service

**Installation**:
```bash
sudo /opt/app-monitor/scripts/production/install-deployment-monitor.sh
```

**Commands**:
```bash
# View timer status
systemctl status deployment-lock-monitor.timer

# View recent health checks
journalctl -u deployment-lock-monitor.service -n 50

# View continuous monitoring
tail -f /var/log/app-monitor/deployment-lock-monitor.log

# Manually trigger check
sudo systemctl start deployment-lock-monitor.service
```

### 3. Enhanced Deploy Script

**Improvements in `deploy.sh`**:

1. **Smart Lock Acquisition**:
   - Waits up to 60 seconds for existing locks
   - Checks lock health every 10 seconds
   - Auto-detects and cleans stale locks
   - Provides detailed diagnostics

2. **Lock Format**: `PID:TIMESTAMP`
   - Enables process validation
   - Allows age calculation
   - Supports deadlock detection

3. **Diagnostic Integration**:
   - Automatically runs lock manager on timeout
   - Suggests corrective actions
   - Logs detailed error context

### 4. GitHub Workflow Enhancements

**Deployment Confirmation**:
```bash
# Correct usage
gh workflow run deploy-production.yml --ref main -f confirm="DEPLOY TO PRODUCTION"

# Wrong - will be rejected with helpful error message
gh workflow run deploy-production.yml --ref main -f confirm="yes"
```

**Stuck Deployment Detection**:
- Monitors status every 15 seconds
- Detects if stuck for >3 minutes (no progress)
- Provides detailed troubleshooting steps
- Tracks both state AND description changes

**Enhanced Error Messages**:
- Clear explanation of what went wrong
- Specific troubleshooting commands
- Links to relevant logs
- Guidance on recovery steps

## Problem Scenarios & Solutions

### Scenario 1: Stale Lock File

**Symptoms**:
- New deployment fails with "lock file exists" error
- Lock process PID doesn't exist or is different process

**Detection**:
```bash
/opt/app-monitor/scripts/deployment-lock-manager.sh check
# Exit code 3, shows "STALE LOCK DETECTED"
```

**Automatic Recovery**:
- Systemd timer detects and removes stale lock
- Next deployment proceeds normally

**Manual Recovery**:
```bash
/opt/app-monitor/scripts/deployment-lock-manager.sh cleanup
```

### Scenario 2: Deployment Deadlock

**Symptoms**:
- Deployment runs for >30 minutes
- Process is stuck (e.g., waiting for sudo password, hung on subprocess)

**Detection**:
```bash
/opt/app-monitor/scripts/deployment-lock-manager.sh check
# Exit code 2, shows "DEADLOCK DETECTED"
```

**Recovery**:
1. Check deployment logs:
   ```bash
   journalctl -u app-monitor-deploy-agent.service -n 100
   ```

2. Identify stuck process:
   ```bash
   /opt/app-monitor/scripts/deployment-lock-manager.sh check
   # Shows process tree
   ```

3. Force cleanup:
   ```bash
   /opt/app-monitor/scripts/deployment-lock-manager.sh cleanup
   # Kills stuck process and removes lock
   ```

### Scenario 3: Wrong Deployment Confirmation

**Symptoms**:
- Manual deployment workflow fails immediately
- Error: "Deployment not confirmed"

**Cause**: Incorrect confirmation string

**Solution**:
```bash
# Use exact string
gh workflow run deploy-production.yml --ref main -f confirm="DEPLOY TO PRODUCTION"
```

The error message now shows expected vs. received values and the correct command.

### Scenario 4: GitHub Workflow Timeout

**Symptoms**:
- Workflow shows deployment as "stuck in progress"
- Status hasn't changed for >3 minutes

**Automatic Detection**:
- Workflow monitors every 15 seconds
- Fails if no progress for 3 minutes
- Provides detailed troubleshooting steps

**Response**:
1. Check agent logs (command provided in error)
2. Check lock health (command provided)
3. Force cleanup if needed (command provided)

## Monitoring & Alerts

### Log Files

**Deployment Lock Monitor**:
```bash
/var/log/app-monitor/deployment-lock-monitor.log
```
- All health checks
- Detected issues
- Automatic recoveries

**System Journal**:
```bash
journalctl -u deployment-lock-monitor.service
journalctl -u app-monitor-deploy-agent.service
```

### Alert Events

The system logs to syslog for integration with monitoring tools:

```bash
# Stale lock cleaned up
logger -t app-monitor-deployment "Auto-recovered from stale deployment lock"

# Deadlock detected
logger -t app-monitor-deployment -p user.err "DEADLOCK: Deployment stuck for over 30 minutes"
```

**Integration Points**:
- Add email notifications in `deployment-lock-manager.sh` (commented section)
- Configure rsyslog to forward to monitoring system
- Set up alerts on specific log patterns

## Configuration

### Deployment Timeouts

**Lock Manager** (`deployment-lock-manager.sh`):
```bash
MAX_LOCK_AGE_SECONDS=1800  # 30 minutes
```

**Deploy Script** (`deploy.sh`):
```bash
local max_wait=60          # Wait up to 60s for existing lock
```

**GitHub Workflow**:
```yaml
timeout-minutes: 10        # Overall workflow timeout
stuckThresholdSeconds: 180 # Stuck detection threshold
```

### Monitor Frequency

**Systemd Timer** (`deployment-lock-monitor.timer`):
```ini
OnUnitActiveSec=5min      # Run every 5 minutes
```

Adjust based on deployment frequency and acceptable detection latency.

## Best Practices

1. **Monitor Regularly**:
   - Check `deployment-lock-monitor.log` weekly
   - Review systemd timer status monthly
   - Set up alerts for deadlock events

2. **Investigate Deadlocks**:
   - Don't just cleanup - find root cause
   - Check deployment logs for patterns
   - Look for hung subprocesses

3. **Keep Timeouts Reasonable**:
   - Deployments should take 2-5 minutes
   - 30-minute deadlock threshold is generous
   - Adjust based on your deployment complexity

4. **Test Recovery**:
   - Periodically test manual cleanup
   - Verify systemd timer is running
   - Ensure log rotation is configured

5. **Update Documentation**:
   - Document any custom alert integrations
   - Note any timeout adjustments
   - Record recurring issues and solutions

## Troubleshooting

### Timer Not Running

```bash
# Check timer status
systemctl status deployment-lock-monitor.timer

# View timer list
systemctl list-timers deployment-lock-monitor.timer

# Restart timer
sudo systemctl restart deployment-lock-monitor.timer
```

### Logs Not Appearing

```bash
# Check log directory permissions
ls -la /var/log/app-monitor/

# Verify service user
systemctl cat deployment-lock-monitor.service | grep User

# Check journalctl
journalctl -u deployment-lock-monitor.service -n 20
```

### Cleanup Fails

```bash
# Check lock file permissions
ls -la /opt/app-monitor/shared/deploy.lock

# Verify process ownership
ps -p <PID> -o user,cmd

# Force remove (emergency only)
sudo rm /opt/app-monitor/shared/deploy.lock
```

## Maintenance

### Log Rotation

Create `/etc/logrotate.d/app-monitor-deployment`:
```
/var/log/app-monitor/deployment-lock-monitor.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 jdubz jdubz
    sharedscripts
    postrotate
        systemctl reload deployment-lock-monitor.timer >/dev/null 2>&1 || true
    endscript
}
```

### Periodic Review

**Weekly**:
- Check for any deadlock alerts
- Review deployment success rate

**Monthly**:
- Verify timer is running
- Check log file sizes
- Review timeout configurations

**Quarterly**:
- Test manual cleanup procedures
- Update documentation
- Review and optimize thresholds

## Migration Notes

**For Existing Deployments**:

1. Deploy the new scripts:
   ```bash
   # Already happens automatically via deploy.sh Phase 2
   ```

2. Install monitoring system:
   ```bash
   sudo /opt/app-monitor/scripts/production/install-deployment-monitor.sh
   ```

3. Verify installation:
   ```bash
   systemctl status deployment-lock-monitor.timer
   /opt/app-monitor/scripts/deployment-lock-manager.sh check
   ```

4. No changes needed to existing deployment workflow - enhancements are backward compatible

## Future Enhancements

Potential improvements for consideration:

1. **Slack/Email Notifications**: Alert on deadlocks
2. **Metrics Collection**: Track deployment duration, lock wait times
3. **Automatic Rollback**: On deadlock detection, trigger rollback
4. **Health Dashboard**: Web UI for deployment status
5. **Deployment Queue**: Handle concurrent deployment attempts gracefully

## Related Documentation

- [Production Deployment Guide](../guides/PRODUCTION_DEPLOYMENT.md)
- [Troubleshooting Guide](../TROUBLESHOOTING_REPORT.md)
- [CI/CD Setup](../setup/CI_CD_SETUP.md)
