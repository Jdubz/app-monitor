# Failure Recovery & Error Handling

## Purpose
Guidelines for detecting, handling, and recovering from errors during task execution.

## When to Read
Read when implementing error handling, debugging failures, or creating recovery tasks.

## Error Detection Principles

### 1. Fail Fast, Fail Loud
```typescript
// ✅ GOOD: Detect errors early
function validateInput(data: unknown): UserInput {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid input: expected object');
  }
  // Validate early, fail fast
  return parseUserInput(data);
}

// ❌ BAD: Silent failures
function validateInput(data: any) {
  try {
    return parseUserInput(data || {});
  } catch {
    return null; // Silent failure - BAD
  }
}
```

### 2. Structured Error Logging
```typescript
// ✅ GOOD: Structured error context
logger.error({
  category: 'task',
  action: 'execution_failed',
  message: 'Task execution failed due to timeout',
  error: err,
  details: {
    taskId: task.id,
    duration: Date.now() - startTime,
    lastKnownState: 'processing',
    attemptNumber: 2
  }
});

// ❌ BAD: Unstructured logging
console.error('Task failed:', err); // NO
logger.error('Error: ' + err.message); // NO
```

### 3. Error Classification

**Error Types:**
```typescript
// Infrastructure Errors (retryable)
- Docker container failures
- Network timeouts
- Database connection issues
- File system errors

// Logic Errors (require fix)
- Null pointer exceptions
- Type errors
- Validation failures
- Business rule violations

// Resource Errors (require intervention)
- Out of memory
- Disk full
- Rate limits exceeded
- Permission denied
```

## Recovery Strategies

### Automatic Retry (Transient Failures)
```typescript
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      logger.warn({
        category: 'retry',
        action: 'operation_failed',
        message: `Attempt ${attempt} failed, retrying...`,
        details: { error, remainingAttempts: maxAttempts - attempt }
      });
      
      await sleep(exponentialBackoff(attempt));
    }
  }
  throw new Error('Unreachable');
}
```

### Circuit Breaker (Cascading Failures)
```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime?: number;
  private readonly threshold = 5;
  private readonly resetTimeout = 60000; // 1 minute
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker open - too many failures');
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private isOpen(): boolean {
    if (this.failureCount < this.threshold) return false;
    
    const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);
    if (timeSinceLastFailure > this.resetTimeout) {
      this.reset();
      return false;
    }
    
    return true;
  }
}
```

### Graceful Degradation
```typescript
// ✅ GOOD: Fallback behavior
async function getTaskContext(taskId: string): Promise<TaskContext> {
  try {
    // Try primary source
    return await contextService.getFullContext(taskId);
  } catch (error) {
    logger.warn({
      category: 'context',
      action: 'fallback_to_minimal',
      message: 'Full context unavailable, using minimal',
      details: { taskId, error }
    });
    
    // Fallback to minimal context
    return contextService.getMinimalContext(taskId);
  }
}

// ❌ BAD: All-or-nothing
async function getTaskContext(taskId: string): Promise<TaskContext> {
  return await contextService.getFullContext(taskId); // Throws on failure
}
```

## Task Failure Handling

### Stuck Task Detection
```typescript
// Timeout configuration
const TASK_TIMEOUTS = {
  implementation: 60 * 60 * 1000, // 1 hour
  review: 30 * 60 * 1000,         // 30 minutes
  fix: 45 * 60 * 1000,            // 45 minutes
  deployment: 20 * 60 * 1000      // 20 minutes
};

// Timeout enforcement
setInterval(async () => {
  const stuckTasks = await taskQueue.findStuckTasks();
  
  for (const task of stuckTasks) {
    logger.warn({
      category: 'task',
      action: 'stuck_task_detected',
      message: `Task stuck: ${task.id}`,
      details: {
        taskId: task.id,
        duration: Date.now() - task.startedAt,
        timeout: TASK_TIMEOUTS[task.type]
      }
    });
    
    await recoveryService.handleStuckTask(task);
  }
}, 5 * 60 * 1000); // Check every 5 minutes
```

### Recovery Task Creation
```typescript
async function handleStuckTask(task: Task): Promise<void> {
  // 1. Stop hung container
  await dockerManager.stopContainer(task.containerId, { force: true });
  
  // 2. Capture diagnostic data
  const diagnostics = await captureDiagnostics(task);
  
  // 3. Mark original task as failed
  await taskQueue.updateTask(task.id, {
    status: 'failed',
    error: 'Task exceeded timeout',
    completedAt: new Date()
  });
  
  // 4. Create recovery task
  await taskQueue.createTask({
    type: 'review',
    title: `REVIEW: ${task.title} (stuck task recovery)`,
    description: `Analyze stuck task ${task.id} and determine next action`,
    parent TaskId: task.id,
    metadata: {
      isRecoveryTask: true,
      originalFailure: 'timeout',
      diagnostics
    }
  });
}
```

### Circular Recovery Prevention
```typescript
// Track recovery attempts
const recoveryAttempts = new Map<string, number>();
const MAX_RECOVERY_ATTEMPTS = 3;

async function createRecoveryTask(failedTask: Task): Promise<void> {
  const chainId = failedTask.metadata?.chainId || failedTask.id;
  const attempts = recoveryAttempts.get(chainId) || 0;
  
  if (attempts >= MAX_RECOVERY_ATTEMPTS) {
    logger.error({
      category: 'recovery',
      action: 'max_attempts_exceeded',
      message: `Task ${failedTask.id} exceeded max recovery attempts`,
      details: { chainId, attempts, maxAttempts: MAX_RECOVERY_ATTEMPTS }
    });
    
    // Escalate to human
    await escalateToHuman(failedTask, 'Max recovery attempts exceeded');
    return;
  }
  
  recoveryAttempts.set(chainId, attempts + 1);
  
  // Create recovery task...
}
```

## Error Messages & Debugging

### Actionable Error Messages
```typescript
// ✅ GOOD: Clear, actionable messages
throw new Error(
  `Context bundle generation failed: Recipe "pr-workflow" not found. ` +
  `Expected location: backend/src/services/context/recipes/pr-workflow.md. ` +
  `Action: Create the recipe file or remove it from task context_profiles.`
);

// ❌ BAD: Vague messages
throw new Error('Bundle generation failed'); // NO
throw new Error('Error in context'); // NO
```

### Debugging Context
```typescript
// ✅ GOOD: Include debugging context
logger.error({
  category: 'docker',
  action: 'container_start_failed',
  message: 'Failed to start container',
  error: err,
  details: {
    containerId: container.id,
    image: container.image,
    volumes: container.volumes,
    env: Object.keys(container.env), // Don't log values (secrets)
    lastCommand: container.lastCommand,
    exitCode: container.exitCode,
    logs: container.logs?.slice(-500) // Last 500 chars
  }
});

// ❌ BAD: Insufficient context
logger.error('Container failed', err); // NO
```

## Cleanup & Resource Management

### Container Cleanup
```typescript
async function cleanupFailedTask(task: Task): Promise<void> {
  try {
    // Stop container
    if (task.containerId) {
      await dockerManager.stopContainer(task.containerId, { force: true });
      await dockerManager.removeContainer(task.containerId);
    }
    
    // Clean workspace (optional - ephemeral containers)
    if (task.workspacePath && fs.existsSync(task.workspacePath)) {
      await fs.promises.rm(task.workspacePath, { recursive: true });
    }
    
    // Clean artifacts (retain for debugging)
    // ... selective cleanup based on retention policy ...
    
    logger.info({
      category: 'cleanup',
      action: 'task_cleanup_completed',
      message: `Cleaned up resources for task ${task.id}`
    });
  } catch (error) {
    logger.error({
      category: 'cleanup',
      action: 'cleanup_failed',
      message: `Failed to clean up task ${task.id}`,
      error
    });
    // Continue despite cleanup failure
  }
}
```

### Patch File Preservation
```typescript
// Save uncommitted changes before cleanup
async function preserveUncommittedWork(task: Task): Promise<void> {
  const workspace = task.workspacePath;
  
  try {
    // Check for uncommitted changes
    const { stdout: status } = await execInWorkspace(workspace, 'git status --porcelain');
    
    if (status.trim()) {
      // Create patch file
      const { stdout: diff } = await execInWorkspace(workspace, 'git diff HEAD');
      const patchPath = path.join('logs', 'recovery', `${task.id}-patch.diff`);
      await fs.promises.writeFile(patchPath, diff);
      
      logger.warn({
        category: 'recovery',
        action: 'patch_created',
        message: `Saved uncommitted changes for task ${task.id}`,
        details: { patchPath, linesChanged: diff.split('\n').length }
      });
    }
  } catch (error) {
    logger.error({
      category: 'recovery',
      action: 'patch_creation_failed',
      message: `Failed to create patch for task ${task.id}`,
      error
    });
  }
}
```

## Human Escalation

### Escalation Triggers
Escalate to human when:
- ❌ Max recovery attempts exceeded (3 attempts)
- ❌ Circular failure pattern detected
- ❌ Critical resource failures (disk full, OOM)
- ❌ Security violations detected
- ❌ Data corruption suspected
- ❌ Unrecoverable error states

### Escalation Template
```typescript
async function escalateToHuman(task: Task, reason: string): Promise<void> {
  const escalation = {
    taskId: task.id,
    title: task.title,
    reason,
    timestamp: new Date(),
    attempts: getRecoveryAttempts(task.id),
    diagnostics: await captureDiagnostics(task),
    logs: await getTaskLogs(task.id),
    recommendations: generateRecommendations(task)
  };
  
  // Create escalation issue/notification
  await notificationService.sendEscalation(escalation);
  
  // Mark task for human review
  await taskQueue.updateTask(task.id, {
    status: 'blocked',
    metadata: {
      ...task.metadata,
      escalated: true,
      escalationReason: reason,
      escalatedAt: new Date()
    }
  });
  
  logger.error({
    category: 'escalation',
    action: 'task_escalated',
    message: `Task ${task.id} escalated to human review`,
    details: { reason, attempts: escalation.attempts }
  });
}
```

## Prevention Strategies

### Pre-execution Validation
```typescript
// Validate before starting task
async function validateTaskPreExecution(task: Task): Promise<void> {
  // Check resources
  const diskSpace = await checkDiskSpace();
  if (diskSpace < MIN_DISK_SPACE) {
    throw new Error(`Insufficient disk space: ${diskSpace}MB available`);
  }
  
  // Check dependencies
  if (task.dependencies?.length > 0) {
    const unmetDeps = await checkDependencies(task.dependencies);
    if (unmetDeps.length > 0) {
      throw new Error(`Unmet dependencies: ${unmetDeps.join(', ')}`);
    }
  }
  
  // Check Docker availability
  const dockerReady = await dockerManager.ping();
  if (!dockerReady) {
    throw new Error('Docker daemon not available');
  }
}
```

### Health Monitoring
```typescript
// Continuous health checks
setInterval(async () => {
  const health = await systemHealth.check();
  
  if (health.diskUsage > 90) {
    logger.warn({
      category: 'system',
      action: 'disk_space_critical',
      message: 'Disk space critical - pausing task queue',
      details: { diskUsage: health.diskUsage }
    });
    await taskQueue.pause();
  }
  
  if (health.memoryUsage > 85) {
    logger.warn({
      category: 'system',
      action: 'memory_high',
      message: 'Memory usage high - may affect performance',
      details: { memoryUsage: health.memoryUsage }
    });
  }
}, 60 * 1000); // Check every minute
```

## Related Guidelines
- See `scope-control.md` for preventing scope-related failures
- See `pr-workflow.md` for git error handling
- See `dev-monitor.md` for logging best practices
