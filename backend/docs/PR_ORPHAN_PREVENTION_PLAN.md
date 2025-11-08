# PR Orphan Prevention & Recovery Plan

## Executive Summary

This plan addresses the critical issue of PR orphaning caused by server crashes/restarts during task execution. It proposes a comprehensive solution with retry mechanisms, emergency rollback, and automatic recovery - all aligned with the existing architecture and Phase 3 roadmap (Recovery Optimization, Q1 2025).

## Problem Statement

**Current State:**
- Dev-bots create PRs successfully on GitHub
- Server crashes/restarts orphan running tasks
- Task output (containing PR info) is lost
- PRs exist on GitHub but aren't tracked in the system
- No automatic recovery mechanism

**Impact:**
- 7 orphaned PRs discovered (22, 23, 24, 26, 28, 30, 31)
- Manual intervention required to reconnect PRs
- Reduced system reliability
- Lost productivity from unmerged PRs

## Architectural Alignment

### Existing Patterns to Leverage

1. **Event-Driven Architecture** - Use events for recovery triggers
2. **SQLite Transactions** - Atomic operations for state management
3. **Metadata-Driven Linking** - Store recovery state in JSON metadata
4. **Structured Logging** - Track recovery operations with categories
5. **Two-Stage Recovery** - Extend existing SimpleFailureRecovery pattern

### Roadmap Alignment

- **Phase 1 (Current)**: System Stabilization - This directly supports 60% → 80% success rate
- **Phase 3 (Q1 2025)**: Recovery Optimization - Foundation for smart rollback and analytics

## Solution Design

### Component 1: Resilient Task Execution Service

Enhance existing `TaskExecutionService` with persistent output streaming and heartbeat monitoring.

```typescript
// backend/src/services/taskExecutionResilient.service.ts

interface ResilientTaskConfig {
  heartbeatInterval: number;      // 30 seconds
  outputBufferSize: number;       // 10MB
  persistOutputInterval: number;  // 5 seconds
  crashDetectionTimeout: number;  // 2 minutes
}

class ResilientTaskExecutionService extends TaskExecutionService {
  private outputStreams: Map<string, fs.WriteStream> = new Map();
  private heartbeatTimers: Map<string, NodeJS.Timer> = new Map();

  // Stream output to disk in real-time
  private async streamOutput(taskId: string, chunk: string, type: 'stdout' | 'stderr') {
    const logPath = `data/logs/tasks/${taskId}/${type}.log`;
    const stream = this.outputStreams.get(`${taskId}-${type}`);

    if (stream) {
      stream.write(chunk);
      // Extract PR info as it streams
      this.extractPRInfoFromChunk(taskId, chunk);
    }
  }

  // Heartbeat monitoring
  private startHeartbeat(taskId: string) {
    const timer = setInterval(async () => {
      await this.updateHeartbeat(taskId);
      await this.checkForOrphans();
    }, this.config.heartbeatInterval);

    this.heartbeatTimers.set(taskId, timer);
  }

  // Detect orphaned tasks
  private async checkForOrphans() {
    const orphanedTasks = await this.taskQueue.getOrphanedTasks(
      this.config.crashDetectionTimeout
    );

    for (const task of orphanedTasks) {
      await this.recoverOrphanedTask(task);
    }
  }
}
```

### Component 2: PR Orphan Recovery Service

Dedicated service for recovering orphaned PRs, integrated with PRWorkflowOrchestrator.

```typescript
// backend/src/services/prOrphanRecovery.service.ts

interface OrphanRecoveryConfig {
  scanInterval: number;           // 5 minutes
  maxRecoveryAttempts: number;    // 3
  githubScanEnabled: boolean;     // true
  autoReconnect: boolean;         // true
}

class PROrphanRecoveryService {
  private recoveryHistory: Map<string, RecoveryAttempt[]> = new Map();
  private scanTimer: NodeJS.Timer | null = null;

  async initialize() {
    // Scan on startup
    await this.scanForOrphans();

    // Periodic scanning
    this.startPeriodicScan();
  }

  private async scanForOrphans(): Promise<OrphanedPR[]> {
    const orphans: OrphanedPR[] = [];

    // Strategy 1: Database scan - tasks with null output but matching branches on GitHub
    const potentialOrphans = await this.taskQueue.getTasksWithoutPRInfo();

    for (const task of potentialOrphans) {
      const pr = await this.findPRByBranch(task);
      if (pr) {
        orphans.push({ task, pr });
      }
    }

    // Strategy 2: Output recovery - read persisted logs for PR info
    const tasksWithLogs = await this.findTasksWithPersistedOutput();

    for (const taskId of tasksWithLogs) {
      const prInfo = await this.extractPRFromLogs(taskId);
      if (prInfo) {
        await this.reconnectPR(taskId, prInfo);
      }
    }

    // Strategy 3: GitHub scan - find PRs with our branch pattern
    if (this.config.githubScanEnabled) {
      const githubPRs = await this.scanGitHubForOrphanedPRs();
      orphans.push(...githubPRs);
    }

    return orphans;
  }

  private async reconnectPR(taskId: string, prInfo: PRInfo) {
    // Update database with PR info
    await this.taskQueue.updateTask(taskId, {
      pr_number: prInfo.number,
      pr_url: prInfo.url,
      pr_branch: prInfo.branch,
      pr_status: 'pending_checks',
      pr_created_at: Date.now(),
      status: 'completed' // Mark as completed if PR exists
    });

    // Register with PR orchestrator
    const task = await this.taskQueue.getTask(taskId);
    if (task) {
      this.prOrchestrator.registerPR(task);
    }

    logger.info({
      category: 'recovery',
      action: 'pr_reconnected',
      message: `Reconnected PR #${prInfo.number} to task ${taskId}`
    });
  }
}
```

### Component 3: Exponential Backoff Retry Manager

Enhance existing RetryManager with automatic retries and exponential backoff.

```typescript
// backend/src/services/retryManagerEnhanced.service.ts

interface ExponentialBackoffConfig {
  initialDelayMs: number;     // 1000ms
  maxDelayMs: number;         // 60000ms
  multiplier: number;         // 2
  jitter: boolean;           // true
  retryableErrors: string[]; // ['ECONNREFUSED', 'ETIMEDOUT', ...]
}

class EnhancedRetryManager extends RetryManager {
  private backoffConfig: ExponentialBackoffConfig;
  private retryQueues: Map<string, RetryQueueItem[]> = new Map();

  async scheduleRetry(task: Task, error: Error): Promise<void> {
    if (!this.shouldAutoRetry(error)) {
      return; // Fall back to manual retry
    }

    const retryCount = task.retry_count || 0;
    const delay = this.calculateBackoff(retryCount);

    const retryItem: RetryQueueItem = {
      task,
      scheduledTime: Date.now() + delay,
      attemptNumber: retryCount + 1,
      error: error.message
    };

    // Add to retry queue
    this.addToRetryQueue(retryItem);

    logger.info({
      category: 'retry',
      action: 'auto_retry_scheduled',
      message: `Task ${task.id} scheduled for retry in ${delay}ms`,
      details: {
        taskId: task.id,
        attemptNumber: retryItem.attemptNumber,
        delay,
        error: error.message
      }
    });
  }

  private calculateBackoff(retryCount: number): number {
    const baseDelay = Math.min(
      this.backoffConfig.initialDelayMs * Math.pow(this.backoffConfig.multiplier, retryCount),
      this.backoffConfig.maxDelayMs
    );

    // Add jitter to prevent thundering herd
    if (this.backoffConfig.jitter) {
      return baseDelay * (0.5 + Math.random() * 0.5);
    }

    return baseDelay;
  }

  private shouldAutoRetry(error: Error): boolean {
    // Check if error is retryable
    const errorCode = (error as any).code;
    if (errorCode && this.backoffConfig.retryableErrors.includes(errorCode)) {
      return true;
    }

    // Check for specific patterns
    const retryablePatterns = [
      /server.*crash/i,
      /connection.*refused/i,
      /timeout/i,
      /ENOTFOUND/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }
}
```

### Component 4: Emergency Rollback System

Detect crash loops and automatically rollback to last stable state.

```typescript
// backend/src/services/emergencyRollback.service.ts

interface RollbackConfig {
  crashThreshold: number;        // 3 crashes in window
  crashWindowMs: number;         // 5 minutes
  rollbackStrategy: 'git' | 'snapshot' | 'both';
  autoRollback: boolean;         // true
  notifyOnRollback: boolean;     // true
}

class EmergencyRollbackService {
  private crashHistory: CrashEvent[] = [];
  private lastStableCommit: string | null = null;
  private isInCrashLoop: boolean = false;

  async detectCrashLoop(): Promise<boolean> {
    const recentCrashes = this.crashHistory.filter(
      crash => Date.now() - crash.timestamp < this.config.crashWindowMs
    );

    if (recentCrashes.length >= this.config.crashThreshold) {
      this.isInCrashLoop = true;

      logger.error({
        category: 'emergency',
        action: 'crash_loop_detected',
        message: `Crash loop detected: ${recentCrashes.length} crashes in ${this.config.crashWindowMs}ms`,
        details: {
          crashes: recentCrashes,
          lastStableCommit: this.lastStableCommit
        }
      });

      if (this.config.autoRollback) {
        await this.performEmergencyRollback();
      }

      return true;
    }

    return false;
  }

  private async performEmergencyRollback() {
    logger.warn({
      category: 'emergency',
      action: 'rollback_initiated',
      message: 'Initiating emergency rollback to last stable state'
    });

    try {
      // Strategy 1: Git rollback
      if (this.config.rollbackStrategy === 'git' || this.config.rollbackStrategy === 'both') {
        await this.gitRollback();
      }

      // Strategy 2: Snapshot restoration
      if (this.config.rollbackStrategy === 'snapshot' || this.config.rollbackStrategy === 'both') {
        await this.restoreSnapshot();
      }

      // Clear problematic tasks
      await this.quarantineProblematicTasks();

      // Restart services
      await this.restartServices();

      // Notify
      if (this.config.notifyOnRollback) {
        await this.sendRollbackNotification();
      }

      logger.info({
        category: 'emergency',
        action: 'rollback_completed',
        message: 'Emergency rollback completed successfully'
      });

    } catch (error) {
      logger.error({
        category: 'emergency',
        action: 'rollback_failed',
        message: 'Emergency rollback failed',
        error
      });

      // Last resort: safe mode
      await this.enterSafeMode();
    }
  }

  private async quarantineProblematicTasks() {
    // Move tasks that caused crashes to quarantine
    const problematicTasks = await this.identifyProblematicTasks();

    for (const task of problematicTasks) {
      await this.taskQueue.updateTask(task.id, {
        status: 'quarantined',
        metadata: {
          ...task.metadata,
          quarantinedAt: Date.now(),
          quarantineReason: 'Caused server crash/restart loop'
        }
      });
    }
  }

  private async enterSafeMode() {
    // Disable all task execution
    await this.taskExecutor.pauseAllWorkers();

    // Enable minimal functionality
    logger.error({
      category: 'emergency',
      action: 'safe_mode_activated',
      message: 'System entered safe mode - manual intervention required'
    });
  }
}
```

## Implementation Plan

### Phase 1: Foundation (Week 1)

1. **Persistent Output Streaming**
   - Implement output streaming to disk
   - Real-time PR info extraction
   - Recovery from persisted logs

2. **Heartbeat Monitoring**
   - Add heartbeat updates to TaskExecutionService
   - Implement orphan detection
   - Basic recovery for orphaned tasks

### Phase 2: Recovery (Week 2)

3. **PR Orphan Recovery Service**
   - Database scanning for orphans
   - GitHub API integration
   - Automatic reconnection

4. **Enhanced Retry Manager**
   - Exponential backoff implementation
   - Retryable error detection
   - Automatic retry scheduling

### Phase 3: Resilience (Week 3)

5. **Emergency Rollback System**
   - Crash loop detection
   - Git-based rollback
   - Task quarantine

6. **Integration & Testing**
   - End-to-end testing
   - Performance validation
   - Documentation

## Migration Strategy

1. **Non-Breaking Changes**
   - All enhancements extend existing services
   - Backward compatible with current system
   - Can be enabled/disabled via configuration

2. **Gradual Rollout**
   - Start with logging only (dry-run mode)
   - Enable recovery for specific task types
   - Full deployment after validation

## Success Metrics

### Primary Metrics
- **PR Orphan Rate**: < 1% (from current ~15%)
- **Recovery Success Rate**: > 90%
- **Mean Time to Recovery**: < 5 minutes
- **Crash Loop Prevention**: 100%

### Secondary Metrics
- Retry success rate by error type
- Average backoff delay effectiveness
- Rollback frequency and success rate
- Task completion rate improvement

## Risk Mitigation

### Risks and Mitigations

1. **Risk**: Recovery creates duplicate PRs
   - **Mitigation**: Check for existing PRs before creation
   - **Mitigation**: Use branch name as unique identifier

2. **Risk**: Rollback causes data loss
   - **Mitigation**: Snapshot before rollback
   - **Mitigation**: Quarantine instead of delete

3. **Risk**: Infinite retry loops
   - **Mitigation**: Max retry limits
   - **Mitigation**: Circuit breaker pattern

4. **Risk**: Performance impact
   - **Mitigation**: Async operations
   - **Mitigation**: Configurable intervals

## Configuration

```typescript
// backend/config/recovery.config.ts

export const recoveryConfig = {
  // Resilient Execution
  resilientExecution: {
    enabled: true,
    heartbeatInterval: 30000,      // 30 seconds
    outputPersistence: true,
    crashDetectionTimeout: 120000  // 2 minutes
  },

  // PR Recovery
  prRecovery: {
    enabled: true,
    scanInterval: 300000,          // 5 minutes
    githubScanEnabled: true,
    autoReconnect: true
  },

  // Retry Manager
  retryManager: {
    autoRetry: true,
    initialDelay: 1000,
    maxDelay: 60000,
    multiplier: 2,
    maxRetries: 3
  },

  // Emergency Rollback
  emergencyRollback: {
    enabled: true,
    crashThreshold: 3,
    crashWindow: 300000,          // 5 minutes
    autoRollback: true,
    strategy: 'both'
  }
};
```

## Monitoring & Alerts

### Key Alerts to Implement

1. **PR Orphan Detected**
   - Trigger: Orphaned PR found
   - Action: Auto-recovery or manual review

2. **Crash Loop Detected**
   - Trigger: 3+ crashes in 5 minutes
   - Action: Emergency rollback

3. **Recovery Failed**
   - Trigger: Recovery attempt failed
   - Action: Manual intervention required

4. **High Retry Rate**
   - Trigger: > 20% tasks requiring retry
   - Action: Investigate root cause

## Documentation Updates

1. Update **ARCHITECTURE_ANALYSIS.md** with recovery system
2. Add **RECOVERY_GUIDE.md** for operators
3. Update **API_DOCUMENTATION.md** with new endpoints
4. Add runbooks for emergency procedures

## Next Steps

1. **Review & Approval** - Architecture team review
2. **Prototype** - Build proof-of-concept for output streaming
3. **Testing** - Simulate crashes and validate recovery
4. **Deployment** - Phased rollout with monitoring
5. **Optimization** - Tune based on production metrics

## Conclusion

This comprehensive solution addresses the PR orphaning problem through multiple layers of resilience:

1. **Prevention** - Persistent output and heartbeat monitoring
2. **Detection** - Multiple scanning strategies
3. **Recovery** - Automatic reconnection and retry
4. **Protection** - Emergency rollback for crash loops

By building on existing patterns and aligning with the Phase 3 roadmap, we can achieve a robust, maintainable solution that significantly improves system reliability.