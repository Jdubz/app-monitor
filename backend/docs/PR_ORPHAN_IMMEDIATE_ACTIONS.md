# PR Orphan Prevention - Immediate Implementation Guide

## Quick Start: What to Build First

### Priority 1: Output Persistence (2 days)

**Why First**: Prevents data loss immediately, enables all other recovery mechanisms.

```typescript
// backend/src/services/taskOutputPersistence.service.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger.js';

export class TaskOutputPersistence {
  private outputDir = 'data/logs/tasks';

  async persistOutput(taskId: string, chunk: string, type: 'stdout' | 'stderr') {
    const taskDir = path.join(this.outputDir, taskId);
    const logFile = path.join(taskDir, `${type}.log`);

    try {
      await fs.mkdir(taskDir, { recursive: true });
      await fs.appendFile(logFile, chunk);

      // Real-time PR extraction
      if (chunk.includes('PR_NUMBER:') || chunk.includes('github.com')) {
        await this.extractAndSavePRInfo(taskId, chunk);
      }
    } catch (error) {
      logger.error({
        category: 'persistence',
        action: 'output_persist_failed',
        error
      });
    }
  }

  async recoverOutput(taskId: string): Promise<{ stdout: string; stderr: string; prInfo?: any }> {
    const taskDir = path.join(this.outputDir, taskId);

    try {
      const stdout = await fs.readFile(path.join(taskDir, 'stdout.log'), 'utf-8').catch(() => '');
      const stderr = await fs.readFile(path.join(taskDir, 'stderr.log'), 'utf-8').catch(() => '');
      const prInfo = await fs.readFile(path.join(taskDir, 'pr.json'), 'utf-8')
        .then(JSON.parse)
        .catch(() => null);

      return { stdout, stderr, prInfo };
    } catch (error) {
      return { stdout: '', stderr: '' };
    }
  }

  private async extractAndSavePRInfo(taskId: string, output: string) {
    const prNumber = output.match(/PR_NUMBER:\s*(\d+)/i)?.[1];
    const prUrl = output.match(/PR_URL:\s*(https:\/\/[^\s]+)/i)?.[1];
    const prBranch = output.match(/PR_BRANCH:\s*([^\s]+)/i)?.[1];

    if (prNumber || prUrl) {
      const prInfo = {
        number: prNumber ? parseInt(prNumber, 10) : null,
        url: prUrl,
        branch: prBranch,
        detectedAt: Date.now()
      };

      const prFile = path.join(this.outputDir, taskId, 'pr.json');
      await fs.writeFile(prFile, JSON.stringify(prInfo, null, 2));

      logger.info({
        category: 'persistence',
        action: 'pr_info_persisted',
        message: `PR info saved for task ${taskId}`,
        details: prInfo
      });
    }
  }
}
```

**Integration Point**: Modify `ephemeralWorker.service.ts` to stream output:

```typescript
// In ephemeralWorker.service.ts - Add to streamLogs method
const persistence = new TaskOutputPersistence();
stream.on('data', async (chunk) => {
  await persistence.persistOutput(worker.task.id, chunk.toString(), 'stdout');
  // Existing code...
});
```

### Priority 2: Startup Recovery Scanner (1 day)

**Why Second**: Automatically fixes orphans on every restart.

```typescript
// backend/src/services/startupRecovery.service.ts

export class StartupRecoveryService {
  constructor(
    private taskQueue: TaskQueueService,
    private prOrchestrator: PRWorkflowOrchestrator,
    private outputPersistence: TaskOutputPersistence
  ) {}

  async recoverOnStartup() {
    logger.info({
      category: 'recovery',
      action: 'startup_recovery_begin',
      message: 'Starting orphan recovery scan'
    });

    // Step 1: Find orphaned tasks
    const orphanedTasks = await this.taskQueue.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'running'
        AND (last_heartbeat IS NULL OR last_heartbeat < ?)
    `).all(Date.now() - 120000); // 2 minutes ago

    logger.info({
      category: 'recovery',
      action: 'orphans_found',
      message: `Found ${orphanedTasks.length} orphaned tasks`,
      details: { taskIds: orphanedTasks.map(t => t.id) }
    });

    // Step 2: Recover each task
    for (const task of orphanedTasks) {
      await this.recoverTask(task);
    }

    // Step 3: Find untracked PRs
    await this.scanForUntrackedPRs();
  }

  private async recoverTask(task: any) {
    // Try to recover output
    const { stdout, prInfo } = await this.outputPersistence.recoverOutput(task.id);

    if (prInfo) {
      // We found PR info! Update task and register with orchestrator
      await this.taskQueue.updateTask(task.id, {
        pr_number: prInfo.number,
        pr_url: prInfo.url,
        pr_branch: prInfo.branch,
        pr_status: 'pending_checks',
        status: 'completed',
        output: stdout || 'Output recovered from crash'
      });

      const updatedTask = await this.taskQueue.getTask(task.id);
      this.prOrchestrator.registerPR(updatedTask);

      logger.info({
        category: 'recovery',
        action: 'task_recovered',
        message: `Recovered task ${task.id} with PR #${prInfo.number}`
      });
    } else {
      // Mark as failed
      await this.taskQueue.updateTask(task.id, {
        status: 'failed',
        error: 'Task orphaned by server restart - no PR info recovered'
      });
    }
  }

  private async scanForUntrackedPRs() {
    // Get tasks that might have PRs but no PR info
    const candidates = await this.taskQueue.db.prepare(`
      SELECT * FROM tasks
      WHERE status IN ('failed', 'completed')
        AND pr_number IS NULL
        AND created_at > ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(Date.now() - 86400000); // Last 24 hours

    for (const task of candidates) {
      // Check GitHub for matching branch
      const branchPattern = this.extractBranchPattern(task.id);
      const pr = await this.checkGitHubForPR(branchPattern);

      if (pr) {
        await this.reconnectPR(task, pr);
      }
    }
  }
}
```

**Integration Point**: Add to `devBotsManager.factory.ts`:

```typescript
// In createDevBotsManagerDependencies function
const startupRecovery = new StartupRecoveryService(taskQueue, prWorkflowOrchestrator, outputPersistence);
await startupRecovery.recoverOnStartup();
```

### Priority 3: Heartbeat Monitoring (1 day)

**Why Third**: Detects crashes quickly, enables faster recovery.

```typescript
// backend/src/services/heartbeatMonitor.service.ts

export class HeartbeatMonitor {
  private heartbeats: Map<string, NodeJS.Timer> = new Map();

  startHeartbeat(taskId: string) {
    const timer = setInterval(async () => {
      await this.updateHeartbeat(taskId);
    }, 30000); // 30 seconds

    this.heartbeats.set(taskId, timer);
  }

  stopHeartbeat(taskId: string) {
    const timer = this.heartbeats.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.heartbeats.delete(taskId);
    }
  }

  private async updateHeartbeat(taskId: string) {
    const taskQueue = getTaskQueueService();
    await taskQueue.db.prepare(
      'UPDATE tasks SET last_heartbeat = ? WHERE id = ?'
    ).run(Date.now(), taskId);
  }

  async checkForDeadTasks(): Promise<string[]> {
    const taskQueue = getTaskQueueService();
    const deadTasks = await taskQueue.db.prepare(`
      SELECT id FROM tasks
      WHERE status = 'running'
        AND last_heartbeat < ?
    `).all(Date.now() - 120000); // 2 minutes

    return deadTasks.map(t => t.id);
  }
}
```

### Priority 4: Crash Loop Detection (2 days)

**Why Fourth**: Prevents system from getting stuck in bad state.

```typescript
// backend/src/services/crashLoopDetector.service.ts

interface CrashEvent {
  timestamp: number;
  taskId?: string;
  error?: string;
  type: 'startup' | 'task' | 'system';
}

export class CrashLoopDetector {
  private crashes: CrashEvent[] = [];
  private readonly CRASH_WINDOW = 300000; // 5 minutes
  private readonly CRASH_THRESHOLD = 3;

  recordCrash(event: Partial<CrashEvent>) {
    this.crashes.push({
      timestamp: Date.now(),
      type: 'system',
      ...event
    });

    this.checkForLoop();
  }

  private checkForLoop() {
    const recentCrashes = this.crashes.filter(
      c => Date.now() - c.timestamp < this.CRASH_WINDOW
    );

    if (recentCrashes.length >= this.CRASH_THRESHOLD) {
      this.handleCrashLoop(recentCrashes);
    }
  }

  private async handleCrashLoop(crashes: CrashEvent[]) {
    logger.error({
      category: 'emergency',
      action: 'crash_loop_detected',
      message: `CRASH LOOP: ${crashes.length} crashes in ${this.CRASH_WINDOW}ms`,
      details: { crashes }
    });

    // Step 1: Quarantine problematic tasks
    const taskIds = [...new Set(crashes.map(c => c.taskId).filter(Boolean))];

    for (const taskId of taskIds) {
      await this.quarantineTask(taskId);
    }

    // Step 2: Clear task queue if severe
    if (crashes.length > 5) {
      await this.emergencyQueueClear();
    }

    // Step 3: Enter safe mode
    await this.enterSafeMode();
  }

  private async quarantineTask(taskId: string) {
    const taskQueue = getTaskQueueService();
    await taskQueue.updateTask(taskId, {
      status: 'quarantined',
      metadata: {
        quarantinedAt: Date.now(),
        reason: 'Caused crash loop'
      }
    });
  }

  private async enterSafeMode() {
    // Create flag file
    await fs.writeFile('data/SAFE_MODE', JSON.stringify({
      activated: Date.now(),
      reason: 'Crash loop detected',
      instructions: 'Delete this file to exit safe mode'
    }));

    logger.error({
      category: 'emergency',
      action: 'safe_mode_activated',
      message: 'SYSTEM IN SAFE MODE - Task execution disabled'
    });
  }
}
```

## Integration Checklist

### 1. Database Migration (Run First)

```sql
-- backend/migrations/006_recovery_fields.sql

-- Add recovery fields to tasks table
ALTER TABLE tasks ADD COLUMN last_heartbeat INTEGER;
ALTER TABLE tasks ADD COLUMN recovery_attempts INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN quarantined_at INTEGER;

-- Add index for orphan detection
CREATE INDEX idx_tasks_heartbeat ON tasks(status, last_heartbeat);

-- Add recovery events table
CREATE TABLE IF NOT EXISTS recovery_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details JSON,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

### 2. Configuration File

```typescript
// backend/src/config/recovery.config.ts

export const RECOVERY_CONFIG = {
  // Feature flags
  enableOutputPersistence: true,
  enableStartupRecovery: true,
  enableHeartbeatMonitoring: true,
  enableCrashLoopDetection: true,

  // Timing
  heartbeatInterval: 30000,      // 30 seconds
  orphanTimeout: 120000,         // 2 minutes
  crashWindow: 300000,          // 5 minutes
  crashThreshold: 3,

  // Paths
  outputDir: 'data/logs/tasks',
  safeModeFile: 'data/SAFE_MODE',

  // Behavior
  autoRecoverOnStartup: true,
  quarantineOnCrashLoop: true,
  maxRecoveryAttempts: 3
};
```

### 3. Startup Hook

```typescript
// backend/src/server.ts - Add to createApp function

import { StartupRecoveryService } from './services/startupRecovery.service.js';
import { RECOVERY_CONFIG } from './config/recovery.config.js';

export async function createApp() {
  // ... existing code ...

  // Initialize recovery services
  if (RECOVERY_CONFIG.enableStartupRecovery) {
    const recovery = new StartupRecoveryService(
      devBotsManager.getTaskQueue(),
      devBotsManager.getPRWorkflowOrchestrator(),
      new TaskOutputPersistence()
    );

    await recovery.recoverOnStartup();

    logger.info({
      category: 'system',
      action: 'recovery_initialized',
      message: 'Recovery services initialized'
    });
  }

  // Check for safe mode
  if (await fs.access('data/SAFE_MODE').then(() => true).catch(() => false)) {
    logger.error({
      category: 'system',
      action: 'safe_mode_active',
      message: 'Server started in SAFE MODE - task execution disabled'
    });

    devBotsManager.pauseAllWorkers();
  }

  // ... rest of initialization ...
}
```

## Testing Plan

### 1. Simulate Crashes

```bash
# Test script: backend/scripts/test-recovery.sh

#!/bin/bash

echo "Testing PR Orphan Recovery..."

# 1. Start a task
TASK_ID=$(curl -X POST http://localhost:5000/api/dev-bots/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"test","title":"Recovery Test"}' | jq -r .task.id)

echo "Started task: $TASK_ID"
sleep 5

# 2. Kill the server
pkill -f "node.*index"
echo "Server killed"
sleep 2

# 3. Restart and check recovery
npm run dev &
sleep 10

# 4. Check if task was recovered
curl http://localhost:5000/api/dev-bots/tasks/$TASK_ID | jq .
```

### 2. Verify Recovery

```typescript
// backend/src/scripts/verify-recovery.ts

async function verifyRecovery() {
  const db = new Database('data/tasks/queue.db');

  // Check for orphans
  const orphans = db.prepare(`
    SELECT id, title, status, last_heartbeat
    FROM tasks
    WHERE status = 'running'
      AND last_heartbeat < ?
  `).all(Date.now() - 120000);

  console.log('Orphaned tasks:', orphans);

  // Check for recovered tasks
  const recovered = db.prepare(`
    SELECT id, title, pr_number, recovery_attempts
    FROM tasks
    WHERE recovery_attempts > 0
  `).all();

  console.log('Recovered tasks:', recovered);

  // Check for quarantined tasks
  const quarantined = db.prepare(`
    SELECT id, title, metadata
    FROM tasks
    WHERE status = 'quarantined'
  `).all();

  console.log('Quarantined tasks:', quarantined);
}
```

## Monitoring Dashboard

### Add to Frontend

```typescript
// frontend/src/components/RecoveryStatus.tsx

export function RecoveryStatus() {
  const [status, setStatus] = useState<RecoveryMetrics>();

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch('/api/dev-bots/recovery/status');
      setStatus(await res.json());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  return (
    <div className="recovery-status">
      <h3>Recovery System</h3>
      <div className="metrics">
        <div>Orphaned Tasks: {status.orphanedTasks}</div>
        <div>Recovered Today: {status.recoveredToday}</div>
        <div>Crash Events: {status.crashEvents}</div>
        <div>Safe Mode: {status.safeMode ? '🔴 ACTIVE' : '🟢 Normal'}</div>
      </div>
    </div>
  );
}
```

## Rollout Plan

### Week 1: Foundation
- [ ] Deploy output persistence
- [ ] Deploy startup recovery
- [ ] Monitor logs for recovery events

### Week 2: Detection
- [ ] Deploy heartbeat monitoring
- [ ] Deploy crash loop detection
- [ ] Test with simulated crashes

### Week 3: Polish
- [ ] Add monitoring dashboard
- [ ] Add alerts
- [ ] Documentation and training

## Success Criteria

After implementation, you should see:

1. **Zero PR orphans** after server restarts
2. **Automatic recovery** within 2 minutes
3. **No crash loops** lasting > 5 minutes
4. **Full audit trail** of all recovery events

## Quick Wins Available Now

While waiting for full implementation:

1. **Manual Recovery Script** (30 minutes)
```bash
# Quick script to find and fix orphaned PRs
node -e "
const db = require('better-sqlite3')('data/tasks/queue.db');
const orphans = db.prepare('SELECT * FROM tasks WHERE status = \"failed\" AND error LIKE \"%orphaned%\"').all();
console.log('Found', orphans.length, 'orphaned tasks');
// Add reconnection logic
"
```

2. **Cron Job** (10 minutes)
```bash
# Add to crontab - run every 5 minutes
*/5 * * * * curl -X POST http://localhost:5000/api/dev-bots/pr-monitor/register-orphaned
```

3. **Pre-restart Hook** (20 minutes)
```bash
# Add to package.json scripts
"pre-restart": "node scripts/checkpoint-tasks.js",
"restart": "npm run pre-restart && npm run dev"
```

This immediate action plan provides concrete, implementable solutions that can be deployed incrementally without disrupting the existing system.