# PR Orphan Recovery - Leveraging Existing Infrastructure

## Executive Summary

You're absolutely right - the infrastructure for PR recovery **already exists**! The system already persists all bot output to the artifacts directory, and there's already a service (`WorkerLogLocator`) that can find and parse these logs. We just need to connect the pieces.

## Existing Infrastructure Map

### 1. Artifact System ✅ Already In Place

```
Location: /dev-bots/artifacts/
Pattern: task-{taskId}-{stdout|stderr}-{timestamp}.log
Service: WorkerLogLocator (taskLogLocator.ts)
Config: backend/config/worker-log-streams.json
```

**Current artifacts (examples):**
```
task-refactoring-2ab0d82b-13af-4ca3-a632-8949dd306d4e-stdout-1762576985973.log
task-refactoring-2ab0d82b-13af-4ca3-a632-8949dd306d4e-stderr-1762576985973.log
task-devops-3b07f22a-35ee-481a-8c01-ffaaac26c46f-stdout-1762575424537.log
```

### 2. Log Persistence Flow

```typescript
// taskExecution.service.ts (lines 647-666)
const artifactsDir = this.config.artifactsDir;  // '/dev-bots/artifacts'
const timestamp = Date.now();
const stdoutLogPath = path.join(artifactsDir, `${task.id}-stdout-${timestamp}.log`);
const stderrLogPath = path.join(artifactsDir, `${task.id}-stderr-${timestamp}.log`);

// Logs are written AFTER task completes
fs.writeFileSync(stdoutLogPath, stdout, 'utf-8');
fs.writeFileSync(stderrLogPath, stderr, 'utf-8');
```

**Important:** These logs contain the FULL output from the bot, including PR creation output!

### 3. Existing Log Locator Service

```typescript
// WorkerLogLocator can find logs by task ID
const locator = new WorkerLogLocator();
const descriptor = await locator.getDescriptor('dev-bots', taskId, 'stdout');
// Returns: { filename, path, size, updatedAt, stream }
```

### 4. PR Extraction Already Implemented

```typescript
// prExtractor.ts - Already extracts PR info from output
export function extractPRInfo(output: string): PRInfo | null {
  // Patterns it looks for:
  // - PR_NUMBER: 42
  // - PR_URL: https://github.com/owner/repo/pull/42
  // - PR_BRANCH: task-implementation-xyz
  // - GitHub URLs in output
}
```

## The Missing Link: Artifact-Based Recovery

We just need a service that connects these existing pieces:

```typescript
// backend/src/services/prArtifactRecovery.service.ts

import { WorkerLogLocator } from './taskLogLocator.js';
import { extractPRInfo } from '../utils/prExtractor.js';
import { TaskQueueService } from './taskQueue.sqlite.js';
import { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';

export class PRArtifactRecoveryService {
  private logLocator: WorkerLogLocator;

  constructor(
    private taskQueue: TaskQueueService,
    private prOrchestrator: PRWorkflowOrchestrator
  ) {
    this.logLocator = new WorkerLogLocator();
  }

  /**
   * Recover PR info from artifact logs for orphaned tasks
   */
  async recoverFromArtifacts(): Promise<void> {
    logger.info({
      category: 'pr-recovery',
      action: 'artifact_recovery_start',
      message: 'Starting PR recovery from artifact logs'
    });

    // Find orphaned tasks
    const orphanedTasks = await this.findOrphanedTasks();

    for (const task of orphanedTasks) {
      await this.recoverTaskPR(task);
    }
  }

  private async findOrphanedTasks() {
    // Tasks that failed with "orphaned" error but might have PR info in logs
    return await this.taskQueue.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'failed'
        AND error LIKE '%orphaned%'
        AND pr_number IS NULL
        AND created_at > ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(Date.now() - 86400000); // Last 24 hours
  }

  private async recoverTaskPR(task: any) {
    try {
      // Find the stdout log for this task
      const descriptor = await this.logLocator.getDescriptor('dev-bots', task.id, 'stdout');

      if (!descriptor) {
        logger.debug({
          category: 'pr-recovery',
          action: 'no_artifact_found',
          message: `No stdout artifact found for task ${task.id}`
        });
        return;
      }

      // Read the log file
      const logContent = await fs.readFile(descriptor.path, 'utf-8');

      // Extract PR info from the log
      const prInfo = extractPRInfo(logContent);

      if (prInfo) {
        logger.info({
          category: 'pr-recovery',
          action: 'pr_info_recovered',
          message: `Recovered PR info from artifacts for task ${task.id}`,
          details: {
            taskId: task.id,
            prNumber: prInfo.number,
            prUrl: prInfo.url,
            prBranch: prInfo.branch,
            logFile: descriptor.filename
          }
        });

        // Update task with recovered PR info
        await this.taskQueue.updateTask(task.id, {
          pr_number: prInfo.number,
          pr_url: prInfo.url,
          pr_branch: prInfo.branch,
          pr_status: 'pending_checks',
          pr_created_at: Date.now(),
          status: 'completed' // Mark as completed since PR was created
        });

        // Register with PR orchestrator for monitoring
        const updatedTask = await this.taskQueue.getTask(task.id);
        if (updatedTask) {
          this.prOrchestrator.registerPR(updatedTask);
        }
      } else {
        // Check stderr for errors that prevented PR creation
        const stderrDescriptor = await this.logLocator.getDescriptor('dev-bots', task.id, 'stderr');

        if (stderrDescriptor) {
          const stderrContent = await fs.readFile(stderrDescriptor.path, 'utf-8');

          logger.warn({
            category: 'pr-recovery',
            action: 'no_pr_in_artifacts',
            message: `No PR info found in artifacts for task ${task.id}`,
            details: {
              taskId: task.id,
              hasStdout: !!descriptor,
              hasStderr: !!stderrDescriptor,
              stderrSample: stderrContent.substring(0, 500)
            }
          });
        }
      }
    } catch (error) {
      logger.error({
        category: 'pr-recovery',
        action: 'recovery_failed',
        message: `Failed to recover PR for task ${task.id}`,
        error
      });
    }
  }
}
```

## Integration Points

### 1. Add to PR Workflow Orchestrator

```typescript
// In prWorkflowOrchestrator.service.ts - extend initialize()
async initialize(): Promise<void> {
  await super.initialize();

  // Recover from artifacts on startup
  const artifactRecovery = new PRArtifactRecoveryService(this.taskQueue, this);
  await artifactRecovery.recoverFromArtifacts();

  // Continue with normal initialization...
}
```

### 2. Periodic Artifact Scanning

```typescript
// In PR orchestrator's periodic scan
private async scanForOrphans() {
  // ... existing scanning logic ...

  // Also check artifacts for unprocessed PR info
  const artifactRecovery = new PRArtifactRecoveryService(this.taskQueue, this);
  await artifactRecovery.recoverFromArtifacts();
}
```

## Complete Workflow With Fallbacks

### Normal Flow (Success Path):
```
1. Task executes in Docker container
2. Bot creates PR and outputs PR_NUMBER, PR_URL
3. Output captured in memory AND saved to artifacts
4. TaskCompletion extracts PR info from memory
5. Updates database with PR metadata
6. Registers with PR orchestrator
7. PR monitoring begins
```

### Recovery Flow (After Crash):
```
1. Server crashes/restarts
2. Task marked as orphaned (output lost from memory)
3. On restart: PRWorkflowOrchestrator.initialize()
4. PRArtifactRecoveryService scans orphaned tasks
5. Reads artifacts from disk (persistent logs)
6. Extracts PR info from artifact logs
7. Updates database and resumes monitoring
```

### Fallback Flow (No PR Created):
```
1. Task fails to create PR (permissions, network, etc.)
2. Error logged to stderr artifact
3. Task marked as failed
4. Recovery service checks artifacts
5. Finds no PR info in stdout
6. Checks stderr for failure reason
7. Can create recovery task if appropriate
```

## Why This Works

### 1. **Artifacts Are Already Persistent**
- Saved to disk at `/dev-bots/artifacts/`
- Survive server crashes
- Named with task ID for easy lookup

### 2. **PR Info Is In The Logs**
- Bots output `PR_NUMBER: X` when creating PRs
- Full GitHub URLs are logged
- Branch names are included

### 3. **Infrastructure Already Exists**
- `WorkerLogLocator` finds logs by task ID
- `extractPRInfo` parses PR details
- `PRWorkflowOrchestrator` handles registration

### 4. **No Additional Storage Needed**
- Artifacts are already being saved
- No new disk space requirements
- Uses existing log rotation

## Implementation Steps

### Step 1: Create Recovery Service (2 hours)
```bash
touch backend/src/services/prArtifactRecovery.service.ts
touch backend/src/services/__tests__/prArtifactRecovery.test.ts
```

### Step 2: Wire Into Orchestrator (1 hour)
- Add recovery call to `initialize()`
- Add to periodic orphan scanning

### Step 3: Test Recovery (1 hour)
```bash
# Simulate crash recovery
1. Start a task that creates a PR
2. Kill server while task running
3. Restart and verify recovery from artifacts
```

## Configuration

No new configuration needed! Uses existing:

```json
// backend/config/worker-log-streams.json
{
  "dev-bots": {
    "artifactRoot": "dev-bots/artifacts",
    "streams": {
      "stdout": {
        "pattern": "{taskId}-stdout-*.log"
      },
      "stderr": {
        "pattern": "{taskId}-stderr-*.log"
      }
    }
  }
}
```

## Artifact Retention & Space Management

### Current State:
- Artifacts are kept indefinitely
- Average size: 1-50KB per task
- Space usage: ~10MB for 200 tasks

### Recommended Retention Policy:
```typescript
// Add to logRotation.service.ts
async cleanupOldArtifacts() {
  const artifactDir = resolveArtifactsDir();
  const files = await fs.readdir(artifactDir);
  const now = Date.now();
  const RETENTION_DAYS = 7; // Keep for 1 week

  for (const file of files) {
    const stat = await fs.stat(path.join(artifactDir, file));
    const age = now - stat.mtimeMs;

    if (age > RETENTION_DAYS * 24 * 60 * 60 * 1000) {
      await fs.unlink(path.join(artifactDir, file));
    }
  }
}
```

## About Patch Files

You mentioned patch files as an emergency fallback. The current system architecture:

1. **Docker-based execution** means workspaces are ephemeral
2. **No patch files are created** (confirmed in taskCompletion.service.ts line 144)
3. **Artifacts serve the same purpose** - they contain the full output

However, if we wanted to add patch generation as a fallback:

```typescript
// Could add to task completion for failed tasks
if (task.status === 'failed' && task.output) {
  // Parse output for file changes and create patch
  const patch = await generatePatchFromOutput(task.output);
  const patchPath = path.join(artifactsDir, `${task.id}-patch-${timestamp}.diff`);
  await fs.writeFile(patchPath, patch);
}
```

## Summary

The system **already has everything needed** for PR orphan recovery:

1. ✅ **Persistent logs** in `/dev-bots/artifacts/`
2. ✅ **Log locator service** (`WorkerLogLocator`)
3. ✅ **PR extraction** (`extractPRInfo`)
4. ✅ **PR orchestration** (`PRWorkflowOrchestrator`)

We just need a **4-hour implementation** to connect these pieces with `PRArtifactRecoveryService`.

No new storage, no cron jobs, no explosive disk usage - just leveraging what's already there!