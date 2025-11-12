# Process Management - Better Alternatives to Cron

**Status:** ✅ Implemented (single-instance guard + systemd hardening shipped 2025-11-11)

**Evidence:**
- `backend/src/utils/singleInstance.ts` enforces one backend per port before the HTTP server starts, preventing duplicate webhook processors.
- `scripts/systemd/app-monitor-backend@.service` + `scripts/production/cleanup-processes.sh` own process lifecycle in production, so cron-based cleanup is no longer required.

The remainder of the document is kept for historical context when evaluating future improvements.

## Current Cleanup Script Issues

**The script requires sudo because:**
1. `systemctl stop/start` requires root for system services
2. Can't be automated without sudo access
3. Manual intervention needed

**Why cron is suboptimal:**
- Polling-based (wasteful, 5-min delay)
- Runs even when not needed
- Reactive, not preventive
- Requires scheduling

---

## ✅ BETTER SOLUTION: Event-Driven Process Management

### Option 1: Systemd Service Hardening (RECOMMENDED)

**Prevent duplicate processes at the systemd level:**

```ini
# /etc/systemd/system/app-monitor-backend@.service
[Unit]
Description=App Monitor Backend Service (Port %i)
After=network.target docker.service
Requires=docker.service

# Conflict resolution - only one instance per port
Conflicts=app-monitor-backend@%i.service
```

**Add PID file management:**

```ini
[Service]
Type=simple
User=jdubz
Group=jdubz
WorkingDirectory=/opt/app-monitor/current/backend

# PID file ensures single instance
PIDFile=/opt/app-monitor/shared/pids/backend-%i.pid
ExecStartPre=/bin/mkdir -p /opt/app-monitor/shared/pids
ExecStartPre=/bin/sh -c 'if [ -f /opt/app-monitor/shared/pids/backend-%i.pid ]; then rm -f /opt/app-monitor/shared/pids/backend-%i.pid; fi'

# Start with PID tracking
ExecStart=/bin/sh -c 'echo $MAINPID > /opt/app-monitor/shared/pids/backend-%i.pid && exec node /opt/app-monitor/current/backend/dist/index.js'

# Clean up PID file on stop
ExecStopPost=/bin/rm -f /opt/app-monitor/shared/pids/backend-%i.pid

# Prevent multiple instances
RemainAfterExit=no
```

**Benefits:**
- ✅ No cron needed
- ✅ No sudo required (systemd handles it)
- ✅ Prevents duplicates at source
- ✅ Event-driven (service start/stop)

---

### Option 2: Application-Level Self-Check

**Add to backend startup (`src/index.ts`):**

```typescript
import { logger } from './utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

async function ensureSingleInstance(port: number): Promise<void> {
  const pidDir = '/opt/app-monitor/shared/pids';
  const pidFile = path.join(pidDir, `backend-${port}.pid`);
  
  // Create PID directory if needed
  if (!fs.existsSync(pidDir)) {
    fs.mkdirSync(pidDir, { recursive: true });
  }
  
  // Check for existing PID file
  if (fs.existsSync(pidFile)) {
    const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
    
    // Check if process is still running
    try {
      process.kill(oldPid, 0); // Signal 0 checks existence
      
      // Process exists - this is a duplicate!
      logger.error({
        category: 'system',
        action: 'duplicate_instance_detected',
        message: `Another instance is already running on port ${port} (PID: ${oldPid})`,
        details: { oldPid, currentPid: process.pid, port }
      });
      
      throw new Error(
        `Duplicate instance detected. Another backend is running on port ${port}.\n` +
        `Existing process: PID ${oldPid}\n` +
        `To fix: sudo systemctl restart app-monitor-backend@${port}.service`
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
        // Process doesn't exist - stale PID file
        logger.warn({
          category: 'system',
          action: 'stale_pid_file',
          message: `Removing stale PID file (process ${oldPid} not running)`,
          details: { oldPid, pidFile }
        });
        fs.unlinkSync(pidFile);
      } else {
        throw err;
      }
    }
  }
  
  // Write our PID
  fs.writeFileSync(pidFile, process.pid.toString());
  
  logger.info({
    category: 'system',
    action: 'pid_file_created',
    message: `PID file created: ${pidFile}`,
    details: { pid: process.pid, port, pidFile }
  });
  
  // Clean up on exit
  const cleanup = () => {
    try {
      if (fs.existsSync(pidFile)) {
        const currentPid = parseInt(fs.readFileSync(pidFile, 'utf8'));
        if (currentPid === process.pid) {
          fs.unlinkSync(pidFile);
          logger.info({
            category: 'system',
            action: 'pid_file_removed',
            message: 'PID file cleaned up on exit',
            details: { pid: process.pid, port }
          });
        }
      }
    } catch (err) {
      logger.error({
        category: 'system',
        action: 'pid_cleanup_failed',
        message: 'Failed to clean up PID file',
        error: err
      });
    }
  };
  
  process.on('exit', cleanup);
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
}

// In startup sequence (before createApp)
async function main() {
  const port = parseInt(process.env.PORT || '3001');
  
  // Ensure single instance
  await ensureSingleInstance(port);
  
  // ... rest of startup
  const { app, httpServer } = await createApp();
  httpServer.listen(port);
}
```

**Benefits:**
- ✅ Fails fast on duplicate (prevents port conflict)
- ✅ Clear error message with fix instructions
- ✅ No external dependencies
- ✅ Works in any environment (dev, staging, prod)
- ✅ Automatic PID cleanup

---

### Option 3: Port-Based Locking (Simplest)

**The application already does this naturally!**

When you try to bind to a port that's in use, Node.js fails:

```typescript
server.listen(port, () => {
  logger.info({ message: `Server listening on port ${port}` });
});

// If port in use, this emits 'error' event:
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error({
      category: 'system',
      action: 'port_in_use',
      message: `Port ${port} is already in use. Another instance may be running.`,
      error: err
    });
    
    // Exit immediately - don't let duplicate run
    process.exit(1);
  }
});
```

**Enhance this with better error messaging:**

```typescript
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`
╔════════════════════════════════════════════════════════════╗
║  ERROR: Port ${port} Already In Use                         ║
╚════════════════════════════════════════════════════════════╝

Another app-monitor process is already running on this port.

To fix:
1. Check running processes:
   ps aux | grep "node.*dist/index.js"

2. Stop the correct service:
   sudo systemctl stop app-monitor-backend@${port}.service

3. Restart:
   sudo systemctl start app-monitor-backend@${port}.service

⚠️  NEVER use 'npm start' in production!
   Use systemd services for proper process management.
`);
    process.exit(1);
  }
});
```

---

### Option 4: Systemd Path Units (Event-Driven Monitoring)

**Monitor for duplicate processes using systemd path units:**

```ini
# /etc/systemd/system/app-monitor-duplicate-check.path
[Unit]
Description=Monitor for duplicate app-monitor processes

[Path]
# Trigger when PID file changes
PathChanged=/opt/app-monitor/shared/pids/
PathModified=/opt/app-monitor/shared/pids/

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/app-monitor-duplicate-check.service
[Unit]
Description=Check for duplicate app-monitor processes

[Service]
Type=oneshot
ExecStart=/opt/app-monitor/scripts/check-duplicates.sh

[Install]
WantedBy=multi-user.target
```

**The check script (no sudo needed):**

```bash
#!/bin/bash
# /opt/app-monitor/scripts/check-duplicates.sh

PROCESS_COUNT=$(ps aux | grep "[n]ode.*dist/index.js" | wc -l)

if [ "$PROCESS_COUNT" -gt 1 ]; then
  # Alert (send to journald, appears in logs)
  echo "CRITICAL: $PROCESS_COUNT app-monitor processes detected!" >&2
  ps aux | grep "[n]ode.*dist/index.js" >&2
  
  # Could trigger webhook, email, etc
  exit 1
fi

exit 0
```

**Benefits:**
- ✅ Event-driven (triggered by file changes)
- ✅ No polling
- ✅ Integrates with systemd journaling
- ✅ Can trigger alerts/webhooks

---

## ✅ RECOMMENDED APPROACH: Combination

**1. Application-level PID check (Option 2)**
```typescript
// In src/index.ts - prevents duplicates at source
await ensureSingleInstance(port);
```

**2. Enhanced port binding error (Option 3)**
```typescript
// Better error messages when port conflict occurs
server.on('error', handlePortConflict);
```

**3. Systemd hardening (Option 1)**
```ini
# In systemd service - proper cleanup
PIDFile=/opt/app-monitor/shared/pids/backend-%i.pid
ExecStopPost=/bin/rm -f /opt/app-monitor/shared/pids/backend-%i.pid
```

**Why this combination:**
- **Defense in depth** - multiple layers prevent duplicates
- **No cron needed** - event-driven checks
- **Clear error messages** - easy to diagnose and fix
- **No sudo for app** - runs as normal user
- **Systemd handles cleanup** - proper process management

---

## Implementation

**Step 1: Update systemd service**

```bash
# Edit service file
sudo nano /etc/systemd/system/app-monitor-backend@.service

# Add PID file management (see Option 1)

# Reload systemd
sudo systemctl daemon-reload
```

**Step 2: Add application-level check**

```typescript
// In backend/src/index.ts
// Add ensureSingleInstance() function (see Option 2)
// Call before createApp()
```

**Step 3: Enhanced error handling**

```typescript
// In backend/src/index.ts or server.ts
// Add better port conflict error messaging (see Option 3)
```

**Step 4: Remove cleanup script**

```bash
# No longer needed with preventive measures
rm scripts/production/cleanup-processes.sh
```

---

## Why This is Better

**Cron approach (reactive):**
```
Time: 0:00 - Process duplicated
Time: 0:05 - Cron detects (5 min later!)
Time: 0:05 - Alerts sent
Time: 0:06 - Manual intervention
```

**Event-driven approach (preventive):**
```
Time: 0:00 - Attempt to start duplicate
Time: 0:00 - PID check fails immediately
Time: 0:00 - Process exits with clear error
Time: 0:00 - No duplicate ever runs!
```

**Result:**
- ✅ Instant detection
- ✅ Automatic prevention
- ✅ No polling overhead
- ✅ Clear error messages
- ✅ No cron jobs needed

---

## Migration Path

**1. Deploy application changes first:**
```bash
# Add ensureSingleInstance() to backend
git add backend/src/index.ts
git commit -m "feat: add PID-based duplicate process prevention"
```

**2. Update systemd service:**
```bash
# After deploying code
sudo systemctl stop app-monitor-backend@5001
sudo nano /etc/systemd/system/app-monitor-backend@.service
# Add PID file management
sudo systemctl daemon-reload
sudo systemctl start app-monitor-backend@5001
```

**3. Test:**
```bash
# Try to start duplicate (should fail immediately)
cd /opt/app-monitor/current/backend
PORT=5001 node dist/index.js

# Expected:
# Error: Duplicate instance detected. Another backend is running on port 5001.
# Existing process: PID 12345
```

**4. Remove cleanup script:**
```bash
git rm scripts/production/cleanup-processes.sh
git commit -m "refactor: remove cleanup script, prevention is now built-in"
```

---

**TL;DR:** Use application-level PID checks + systemd hardening instead of cron. Prevents duplicates at source, no polling, no sudo for app.
