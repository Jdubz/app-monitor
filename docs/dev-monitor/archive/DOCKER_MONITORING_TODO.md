# Docker Monitoring Implementation - Remaining Work

## Problem Summary

The Python Worker docker monitoring in dev-monitor UI is not working properly because:

1. **Wrong Container Name**: Code looks for `job-finder-local-build` but the actual running container is `job-finder-local-dev`
2. **No Separate Status**: UI doesn't distinguish between container status and worker process status inside the container
3. **No Separate Controls**: Can't independently manage the container vs the worker process

## Completed Work

### ✅ Backend Changes
- **Updated ProcessInfo interface** (`backend/src/services/processManager.ts:21-36`)
  - Added `dockerContainer` field with:
    - `name`: string
    - `status`: 'running' | 'stopped' | 'exited' | 'unknown'
    - `workerStatus`: 'running' | 'idle' | 'stopped' | 'unknown'
    - `containerId`: string (optional)

## Remaining Backend Work

### 1. Fix Container Name Detection
**File**: `backend/src/services/processManager.ts` (line ~116)

**Current Code**:
```typescript
const containerInfo = await getDockerContainerInfo('job-finder-local-build');
```

**Required Change**:
```typescript
// Try multiple container names with fallback
const containerNames = ['job-finder-local-dev', 'job-finder-dev'];
let containerInfo = { running: false, pid: null, startedAt: null };
let detectedContainerName = null;

for (const name of containerNames) {
  const info = await getDockerContainerInfo(name);
  if (info.running) {
    containerInfo = info;
    detectedContainerName = name;
    Logger.info(`Found running container: ${name}`);
    break;
  }
}

if (!containerInfo.running) {
  Logger.info('No running container found, will start new container');
}
```

### 2. Update getServiceStatus() Method
**File**: `backend/src/services/processManager.ts` (method around line ~300)

**Add docker status population**:
```typescript
async getServiceStatus(serviceName: string): Promise<ProcessInfo> {
  const config = services[serviceName];
  const managed = this.processes.get(serviceName);

  const status: ProcessInfo = {
    name: serviceName,
    displayName: config.displayName,
    status: managed?.status || 'stopped',
    // ... existing fields ...
  };

  // Add docker container info for python-worker
  if (serviceName === 'python-worker') {
    const containerNames = ['job-finder-local-dev', 'job-finder-dev'];
    for (const name of containerNames) {
      const containerInfo = await getDockerContainerInfo(name);
      if (containerInfo.running || containerInfo.pid) {
        const workerStatus = await this.getDockerWorkerStatus(name);
        status.dockerContainer = {
          name,
          status: containerInfo.running ? 'running' : 'stopped',
          workerStatus,
          containerId: containerInfo.containerId,
        };
        break;
      }
    }

    // If no container found
    if (!status.dockerContainer) {
      status.dockerContainer = {
        name: 'job-finder-local-dev',
        status: 'stopped',
        workerStatus: 'stopped',
      };
    }
  }

  return status;
}
```

### 3. Add Docker Worker Status Detection
**File**: `backend/src/services/processManager.ts`

**New Method**:
```typescript
/**
 * Check if worker process is running inside docker container
 * Checks the queue_worker.log file for recent activity
 */
private async getDockerWorkerStatus(containerName: string): Promise<'running' | 'idle' | 'stopped' | 'unknown'> {
  try {
    // Check if queue_worker.py process is running in container
    const { execAsync } = await import('../utils/portManager.js');
    const { stdout } = await execAsync(
      `docker exec ${containerName} ps aux | grep -v grep | grep queue_worker.py`
    );

    if (stdout.trim()) {
      // Process exists, check if it's actively processing
      // Look at recent log entries (last 30 seconds)
      const logFile = path.join(ROOT_DIR, 'logs/queue_worker.log');
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        const lastModified = stats.mtime.getTime();
        const now = Date.now();

        // If log was updated in last 30 seconds, worker is active
        if (now - lastModified < 30000) {
          return 'running';
        } else {
          return 'idle';
        }
      }
      return 'running';
    }
    return 'stopped';
  } catch (error) {
    Logger.error(`Failed to check docker worker status: ${error}`);
    return 'unknown';
  }
}
```

### 4. Add Docker-Specific API Endpoints
**File**: `backend/src/routes/api.ts`

**New Endpoints**:
```typescript
// Start docker container
router.post('/services/:name/docker/start-container', async (req, res) => {
  const { name } = req.params;

  if (name !== 'python-worker') {
    return res.status(400).json({ error: 'Docker operations only supported for python-worker' });
  }

  try {
    const { execAsync } = await import('../utils/portManager.js');
    await execAsync(
      'cd ../job-finder-worker && docker-compose -f docker-compose.dev.yml up -d'
    );

    res.json({ success: true, message: 'Container started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop docker container
router.post('/services/:name/docker/stop-container', async (req, res) => {
  const { name } = req.params;

  if (name !== 'python-worker') {
    return res.status(400).json({ error: 'Docker operations only supported for python-worker' });
  }

  try {
    const containerNames = ['job-finder-local-dev', 'job-finder-dev'];
    for (const containerName of containerNames) {
      await stopDockerContainer(containerName);
    }

    res.json({ success: true, message: 'Container stopped' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restart worker process inside container
router.post('/services/:name/docker/restart-worker', async (req, res) => {
  const { name } = req.params;

  if (name !== 'python-worker') {
    return res.status(400).json({ error: 'Docker operations only supported for python-worker' });
  }

  try {
    const { execAsync } = await import('../utils/portManager.js');
    const containerNames = ['job-finder-local-dev', 'job-finder-dev'];

    let restarted = false;
    for (const containerName of containerNames) {
      try {
        // Kill the queue_worker.py process
        await execAsync(
          `docker exec ${containerName} pkill -f queue_worker.py`
        );

        // The container's command will restart it automatically
        restarted = true;
        break;
      } catch (error) {
        // Try next container name
      }
    }

    if (restarted) {
      res.json({ success: true, message: 'Worker process restarted' });
    } else {
      res.status(404).json({ error: 'No running container found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 5. Update portManager Utilities
**File**: `backend/src/utils/portManager.ts`

**Add to getDockerContainerInfo return type**:
```typescript
export async function getDockerContainerInfo(containerName: string): Promise<{
  running: boolean;
  pid: number | null;
  startedAt: number | null;
  containerId: string | null;  // ADD THIS
}> {
  try {
    const isRunning = await isDockerContainerRunning(containerName);

    if (!isRunning) {
      return {
        running: false,
        pid: null,
        startedAt: null,
        containerId: null,
      };
    }

    const pid = await getDockerContainerPid(containerName);

    // Get container start time
    const { stdout: startTimeStr } = await execAsync(
      `docker inspect --format='{{.State.StartedAt}}' ${containerName}`
    );
    const startedAt = startTimeStr.trim() ? new Date(startTimeStr.trim()).getTime() : null;

    // Get container ID
    const { stdout: containerIdStr } = await execAsync(
      `docker inspect --format='{{.Id}}' ${containerName}`
    );
    const containerId = containerIdStr.trim() || null;

    return {
      running: true,
      pid,
      startedAt,
      containerId,
    };
  } catch (error) {
    console.error(`[DOCKER] Failed to get container info for ${containerName}:`, error);
    return {
      running: false,
      pid: null,
      startedAt: null,
      containerId: null,
    };
  }
}
```

## Remaining Frontend Work

### 1. Update ServiceCard Component
**File**: `frontend/src/components/ServiceCard.tsx`

**Add Docker Status Display**:
```tsx
// Add to ServiceCard interface
interface Service {
  // ... existing fields ...
  dockerContainer?: {
    name: string;
    status: 'running' | 'stopped' | 'exited' | 'unknown';
    workerStatus?: 'running' | 'idle' | 'stopped' | 'unknown';
    containerId?: string;
  };
}

// In the component JSX, add docker status section:
{service.dockerContainer && (
  <div className="docker-status">
    <div className="status-row">
      <span className="label">Container:</span>
      <span className={`badge badge-${service.dockerContainer.status}`}>
        {service.dockerContainer.status}
      </span>
      <span className="container-name">{service.dockerContainer.name}</span>
    </div>

    {service.dockerContainer.workerStatus && (
      <div className="status-row">
        <span className="label">Worker:</span>
        <span className={`badge badge-${service.dockerContainer.workerStatus}`}>
          {service.dockerContainer.workerStatus}
        </span>
      </div>
    )}
  </div>
)}
```

### 2. Add Docker Control Buttons
**File**: `frontend/src/components/ServiceCard.tsx`

**Add Button Group**:
```tsx
{service.name === 'python-worker' && service.dockerContainer && (
  <div className="docker-controls">
    <button
      onClick={() => handleDockerAction('start-container')}
      disabled={service.dockerContainer.status === 'running'}
      className="btn btn-sm btn-primary"
    >
      Start Container
    </button>

    <button
      onClick={() => handleDockerAction('stop-container')}
      disabled={service.dockerContainer.status !== 'running'}
      className="btn btn-sm btn-danger"
    >
      Stop Container
    </button>

    <button
      onClick={() => handleDockerAction('restart-worker')}
      disabled={service.dockerContainer.status !== 'running'}
      className="btn btn-sm btn-warning"
    >
      Restart Worker
    </button>
  </div>
)}
```

### 3. Add Docker Action Handler
**File**: `frontend/src/components/ServiceCard.tsx`

**New Function**:
```tsx
const handleDockerAction = async (action: string) => {
  try {
    const response = await fetch(
      `http://localhost:5000/api/services/${service.name}/docker/${action}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Docker action failed');
    }

    // Refresh service status
    setTimeout(() => {
      // Trigger service status refresh
    }, 1000);
  } catch (error) {
    console.error(`Docker action ${action} failed:`, error);
    alert(`Failed to ${action}: ${error.message}`);
  }
};
```

### 4. Add CSS Styles
**File**: `frontend/src/components/ServiceCard.tsx` (styled-components or CSS)

```css
.docker-status {
  margin-top: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.docker-status .status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.docker-status .label {
  font-weight: 500;
  min-width: 80px;
}

.docker-status .container-name {
  font-size: 0.85em;
  color: #666;
  font-family: monospace;
}

.docker-controls {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.badge-running {
  background: #4caf50;
  color: white;
}

.badge-idle {
  background: #ff9800;
  color: white;
}

.badge-stopped {
  background: #9e9e9e;
  color: white;
}

.badge-exited {
  background: #f44336;
  color: white;
}

.badge-unknown {
  background: #607d8b;
  color: white;
}
```

## Testing Checklist

After implementing the above changes:

- [ ] Container status shows correctly when `job-finder-local-dev` is running
- [ ] Container status shows "stopped" when no container is running
- [ ] Worker status shows "running" when queue_worker.py is active
- [ ] Worker status shows "idle" when process exists but not processing jobs
- [ ] Worker status shows "stopped" when process is not running
- [ ] "Start Container" button launches docker-compose successfully
- [ ] "Stop Container" button stops the container
- [ ] "Restart Worker" button kills and restarts the queue_worker.py process
- [ ] Buttons are disabled when action is not applicable
- [ ] UI updates after docker actions complete
- [ ] Logs continue to stream to dev-monitor/logs/queue_worker.log

## Build & Deploy

After making all changes:

```bash
# Rebuild backend
cd dev-monitor/backend
npm run build

# Restart dev-monitor to apply changes
# (via make dev-monitor or your preferred method)
```

## Notes

- The container name detection uses a fallback array to handle different container naming conventions
- Worker status is determined by checking both process existence AND log file activity
- All docker operations are restricted to the `python-worker` service for security
- The UI gracefully handles cases where docker is not installed or containers don't exist
