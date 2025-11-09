# Retry Mechanisms Architecture

This document explains the two different retry systems in the app-monitor backend and why both are necessary.

## Overview

The backend has two distinct retry mechanisms that serve different purposes:

1. **RetryManager** (`backend/src/services/retryManager.ts`)
2. **FailureRecovery** (`backend/src/services/failureRecovery.ts`)

## RetryManager

### Purpose
Handles **task-level retries** for dev-bot task execution failures.

### Scope
- Retries individual task execution attempts
- Tracks retry count per task
- Implements exponential backoff between retries
- Determines if a task is retryable based on failure reason

### Use Case
When a dev-bot fails to complete a task (e.g., test failures, build errors, timeout), the RetryManager decides:
- Should this task be retried?
- How many times has it been retried?
- How long should we wait before retrying?
- What is the maximum number of retries allowed?

### Key Features
```typescript
class RetryManager {
  shouldRetry(taskId: string, failureReason?: string): boolean
  recordAttempt(taskId: string, success: boolean): void
  getRetryCount(taskId: string): number
  getNextRetryDelay(taskId: string): number  // Exponential backoff
}
```

### Configuration
- Default max retries: 3
- Base delay: 30 seconds
- Exponential backoff multiplier: 2x
- Certain failure types are marked non-retryable (e.g., syntax errors)

## FailureRecovery

### Purpose
Handles **system-level recovery** from catastrophic failures and resource cleanup.

### Scope
- Detects stuck/zombie containers
- Recovers from Docker daemon failures
- Cleans up orphaned resources
- Handles database corruption
- Recovers from process crashes
- Performs emergency cleanup

### Use Case
When the entire dev-bots system encounters critical failures:
- Docker containers stuck in unhealthy state
- Database connection lost
- Process manager crashed
- Resource exhaustion
- File system issues

### Key Features
```typescript
class FailureRecovery {
  detectZombieContainers(): Promise<string[]>
  emergencyCleanup(): Promise<void>
  recoverFromDockerFailure(): Promise<void>
  verifySystemHealth(): Promise<HealthStatus>
}
```

### Recovery Actions
- Kill and remove stuck containers
- Reset database connections
- Clear corrupted state
- Restart core services
- Notify administrators

## Why Both Are Necessary

### Different Abstraction Levels

**RetryManager** operates at the **task level**:
- Granular control over individual task retries
- Task-specific retry logic
- Preserves task history and retry count
- Integrated with task queue

**FailureRecovery** operates at the **system level**:
- Broad recovery across all components
- System-wide health checks
- Infrastructure-level cleanup
- Emergency procedures

### Different Failure Domains

**RetryManager** handles **expected failures**:
- Test failures
- Build errors
- Transient network issues
- Resource contention
- These are normal in a dev-bot workflow

**FailureRecovery** handles **unexpected failures**:
- System crashes
- Hardware failures
- Resource exhaustion
- Corrupted state
- These indicate serious problems

### Different Recovery Strategies

**RetryManager** uses **exponential backoff**:
```
Attempt 1: Immediate
Attempt 2: 30s delay
Attempt 3: 60s delay
Attempt 4: 120s delay
```

**FailureRecovery** uses **immediate action**:
- No backoff - emergency response
- Aggressive cleanup
- System-wide reset
- Last resort measures

### Example Scenario

Imagine a dev-bot task fails:

1. **Task execution fails** (test error)
   → **RetryManager** decides: "This is retryable, try again in 30s"

2. **Task retried, fails again** (build error)
   → **RetryManager** decides: "Try one more time in 60s"

3. **During retry, Docker daemon crashes**
   → **FailureRecovery** detects: "System critical failure!"
   → Performs emergency cleanup
   → Restarts Docker services
   → Clears all stuck containers

4. **System recovered**
   → RetryManager resumes: "Continue with retry #3"

## Design Principles

### Separation of Concerns
- RetryManager: Application logic failures
- FailureRecovery: Infrastructure failures

### Fail-Safe Mechanisms
- RetryManager gives up after max retries
- FailureRecovery always attempts recovery
- Neither can deadlock the system

### Monitoring and Observability
- RetryManager logs retry attempts and reasons
- FailureRecovery logs recovery actions and outcomes
- Both emit metrics for dashboards

## Integration Points

### DevBotsManager
```typescript
// Uses RetryManager for task retries
if (this.retryManager.shouldRetry(task.id)) {
  const delay = this.retryManager.getNextRetryDelay(task.id);
  await this.scheduleRetry(task, delay);
}

// Uses FailureRecovery for system failures
if (systemHealthCheck.failed) {
  await this.failureRecovery.emergencyCleanup();
}
```

### TaskExecutionService
```typescript
// Task-level retry on failure
catch (error) {
  this.retryManager.recordAttempt(task.id, false);
  if (this.retryManager.shouldRetry(task.id, error.message)) {
    return { status: 'retry', delay: this.retryManager.getNextRetryDelay(task.id) };
  }
}
```

### DockerManager
```typescript
// System-level recovery on Docker failure
catch (dockerError) {
  logger.error('Docker operation failed, initiating recovery');
  await this.failureRecovery.recoverFromDockerFailure();
}
```

## When to Use Which

### Use RetryManager when:
- Task execution fails
- Build/test errors occur
- Transient failures happen
- You want automatic retry with backoff
- Failure is at the task level

### Use FailureRecovery when:
- Docker daemon crashes
- System resources exhausted
- Database becomes corrupted
- Containers are stuck/zombie
- Manual intervention would be needed
- Failure is at the system level

## Future Enhancements

### Potential Improvements

1. **Circuit Breaker Pattern**
   - Add to RetryManager to prevent retry storms
   - Trip circuit after N consecutive failures
   - Gradual recovery when circuit resets

2. **Health Score Tracking**
   - FailureRecovery tracks system health over time
   - Predictive recovery based on degradation
   - Proactive cleanup before critical failure

3. **Retry Budget**
   - RetryManager enforces global retry limit
   - Prevents excessive resource usage
   - Prioritizes critical tasks for retry

4. **Recovery Strategies**
   - FailureRecovery uses pluggable strategies
   - Different recovery plans for different failures
   - A/B testing of recovery approaches

## Conclusion

Both RetryManager and FailureRecovery are essential:

- **RetryManager**: Application-level resilience for expected failures
- **FailureRecovery**: System-level resilience for unexpected failures

They operate at different layers, handle different failure domains, and use different recovery strategies. Removing either would compromise system reliability.

**Decision: Keep both mechanisms.**
