/**
 * Phase Execution Assertions
 * 
 * Custom assertion helpers for validating phased task execution in E2E tests.
 * Provides type-safe, reusable assertions for phase progression, retries, and validation.
 */

import { expect } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';

/**
 * Fetch task details from backend
 */
async function fetchTask(taskId: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/dev-bots/tasks/${taskId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch task ${taskId}: ${response.statusText}`);
  }
  const result = await response.json();
  return result.data;
}

/**
 * Fetch task logs from backend
 */
async function fetchTaskLogs(taskId: string): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/dev-bots/tasks/${taskId}/logs`);
  if (!response.ok) {
    throw new Error(`Failed to fetch logs for ${taskId}: ${response.statusText}`);
  }
  const result = await response.json();
  return result.data.logs || [];
}

/**
 * Assert that task progressed through expected phases in order
 * 
 * @example
 * await expectPhaseProgression('task-123', [0, 1, 2, 3, 4, 5, 6]);
 */
export async function expectPhaseProgression(
  taskId: string,
  expectedPhases: number[]
): Promise<void> {
  const task = await fetchTask(taskId);
  
  // Get phase history from task (assuming it's tracked)
  const phaseHistory = task.phase_history || [];
  
  expect(phaseHistory).toEqual(expectedPhases);
  
  // Verify final phase matches last expected phase
  const finalPhase = expectedPhases[expectedPhases.length - 1];
  expect(task.phase_index).toBe(finalPhase);
}

/**
 * Assert that a specific phase was retried the expected number of times
 * 
 * @example
 * await expectPhaseRetry('task-123', 2, 3); // Phase 2 retried 3 times
 */
export async function expectPhaseRetry(
  taskId: string,
  phase: number,
  expectedAttempts: number
): Promise<void> {
  const task = await fetchTask(taskId);
  
  // Check phase attempts tracking
  const phaseAttempts = task.phase_attempts || {};
  const actualAttempts = phaseAttempts[phase] || 1;
  
  expect(actualAttempts).toBeGreaterThanOrEqual(expectedAttempts);
}

/**
 * Assert that recovery agent was triggered for the task
 * 
 * @example
 * await expectRecoveryTriggered('task-123');
 */
export async function expectRecoveryTriggered(taskId: string): Promise<void> {
  const logs = await fetchTaskLogs(taskId);
  const logsString = logs.join('\n');
  
  // Look for recovery agent indicators in logs
  const recoveryIndicators = [
    'Recovery agent',
    'recovery agent',
    'Analyzing failure',
    'Attempting recovery',
    'Recovery strategy',
  ];
  
  const hasRecoveryLog = recoveryIndicators.some(indicator => 
    logsString.includes(indicator)
  );
  
  expect(hasRecoveryLog).toBe(true);
  
  // Also check task metadata
  const task = await fetchTask(taskId);
  expect(task.recovery_attempts).toBeGreaterThan(0);
}

/**
 * Assert that phase validation passed or failed as expected
 * 
 * @example
 * await expectPhaseValidation('task-123', 1, true); // Phase 1 validation passed
 * await expectPhaseValidation('task-123', 2, false); // Phase 2 validation failed
 */
export async function expectPhaseValidation(
  taskId: string,
  phase: number,
  shouldPass: boolean
): Promise<void> {
  const task = await fetchTask(taskId);
  const logs = await fetchTaskLogs(taskId);
  const logsString = logs.join('\n');
  
  // Check validation results in task metadata
  const validationResults = task.validation_results || {};
  const phaseValidation = validationResults[phase];
  
  if (shouldPass) {
    // Validation should have passed
    expect(phaseValidation?.passed).toBe(true);
    
    // Should have moved past this phase
    expect(task.phase_index).toBeGreaterThan(phase);
  } else {
    // Validation should have failed
    expect(phaseValidation?.passed).toBe(false);
    
    // Look for validation failure in logs
    const hasValidationFailure = logsString.includes(`Phase ${phase} validation failed`) ||
                                   logsString.includes(`Validation error`);
    expect(hasValidationFailure).toBe(true);
    
    // Task should still be on this phase or in retry
    expect(task.phase_index).toBeLessThanOrEqual(phase + 1);
  }
}

/**
 * Assert that task is currently on expected phase
 */
export async function expectCurrentPhase(
  taskId: string,
  expectedPhase: number
): Promise<void> {
  const task = await fetchTask(taskId);
  expect(task.phase_index).toBe(expectedPhase);
}

/**
 * Assert that task completed successfully
 */
export async function expectTaskCompleted(taskId: string): Promise<void> {
  const task = await fetchTask(taskId);
  
  expect(task.status).toBe('completed');
  expect(task.phase_index).toBe(6); // Final phase
  expect(task.completed_at).toBeDefined();
}

/**
 * Assert that task failed with expected reason
 */
export async function expectTaskFailed(
  taskId: string,
  expectedReason?: string
): Promise<void> {
  const task = await fetchTask(taskId);
  
  expect(task.status).toBe('failed');
  
  if (expectedReason) {
    expect(task.failure_reason).toContain(expectedReason);
  }
}

/**
 * Assert that task is blocked
 */
export async function expectTaskBlocked(taskId: string): Promise<void> {
  const task = await fetchTask(taskId);
  
  expect(task.status).toBe('blocked');
  expect(task.blocking_reason).toBeDefined();
}

/**
 * Assert that task has PR associated
 */
export async function expectTaskHasPR(taskId: string): Promise<void> {
  const task = await fetchTask(taskId);
  
  expect(task.pr_url).toBeDefined();
  expect(task.pr_number).toBeGreaterThan(0);
}

/**
 * Assert that specific phase took approximately expected time
 */
export async function expectPhaseDuration(
  taskId: string,
  phase: number,
  minMs: number,
  maxMs: number
): Promise<void> {
  const task = await fetchTask(taskId);
  const phaseDurations = task.phase_durations || {};
  const duration = phaseDurations[phase];
  
  expect(duration).toBeGreaterThanOrEqual(minMs);
  expect(duration).toBeLessThanOrEqual(maxMs);
}

/**
 * Wait for task to reach specific phase
 */
export async function waitForPhase(
  taskId: string,
  targetPhase: number,
  options: { timeout?: number, pollInterval?: number } = {}
): Promise<void> {
  const timeout = options.timeout || 60000; // 60s default
  const pollInterval = options.pollInterval || 500; // 500ms default
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const task = await fetchTask(taskId);
    
    if (task.phase_index >= targetPhase) {
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error(`Timeout waiting for task ${taskId} to reach phase ${targetPhase}`);
}

/**
 * Wait for task to complete
 */
export async function waitForTaskCompletion(
  taskId: string,
  options: { timeout?: number, pollInterval?: number } = {}
): Promise<void> {
  const timeout = options.timeout || 120000; // 120s default
  const pollInterval = options.pollInterval || 1000; // 1s default
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const task = await fetchTask(taskId);
    
    if (task.status === 'completed' || task.status === 'failed') {
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error(`Timeout waiting for task ${taskId} to complete`);
}

/**
 * Assert that logs contain expected message
 */
export async function expectLogContains(
  taskId: string,
  expectedMessage: string | RegExp
): Promise<void> {
  const logs = await fetchTaskLogs(taskId);
  const logsString = logs.join('\n');
  
  if (typeof expectedMessage === 'string') {
    expect(logsString).toContain(expectedMessage);
  } else {
    expect(logsString).toMatch(expectedMessage);
  }
}

/**
 * Assert that specific files were created/modified during phase
 */
export async function expectFilesCreated(
  taskId: string,
  phase: number,
  expectedFiles: string[]
): Promise<void> {
  const task = await fetchTask(taskId);
  const phaseFiles = task.phase_files || {};
  const filesCreated = phaseFiles[phase] || [];
  
  for (const file of expectedFiles) {
    expect(filesCreated).toContain(file);
  }
}

/**
 * Assert that phase has specific status
 */
export async function expectPhaseStatus(
  taskId: string,
  phase: number,
  expectedStatus: 'pending' | 'in_progress' | 'completed' | 'failed'
): Promise<void> {
  const task = await fetchTask(taskId);
  const phaseStatuses = task.phase_statuses || {};
  const status = phaseStatuses[phase];
  
  expect(status).toBe(expectedStatus);
}

/**
 * Assert that task has specific number of retry attempts
 */
export async function expectRetryAttempts(
  taskId: string,
  expectedAttempts: number
): Promise<void> {
  const task = await fetchTask(taskId);
  const totalAttempts = task.retry_attempts || 0;
  
  expect(totalAttempts).toBe(expectedAttempts);
}

/**
 * Get task for custom assertions
 */
export async function getTaskForAssertion(taskId: string): Promise<any> {
  return await fetchTask(taskId);
}

/**
 * Get logs for custom assertions
 */
export async function getLogsForAssertion(taskId: string): Promise<string[]> {
  return await fetchTaskLogs(taskId);
}
