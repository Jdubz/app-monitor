/**
 * E2E Test Data Helpers
 * 
 * Provides valid task payloads that pass backend validation
 */

export interface E2ETaskData {
  title: string;
  taskType: 'implementation' | 'analysis' | 'documentation' | 'review';
  intent: string;
  assignedAgent?: string;
  priority?: number;
}

/**
 * Creates a valid minimal task payload for E2E testing
 * 
 * Note: The minimal API auto-detects fields, but the underlying
 * task creation still has validation requirements. This helper
 * provides sensible defaults that pass validation.
 */
export function createValidE2ETask(partial: Partial<E2ETaskData> = {}): E2ETaskData {
  return {
    title: partial.title || 'E2E Test Task - Phased Execution',
    taskType: partial.taskType || 'implementation',
    intent: partial.intent || 'Test phased task execution with proper validation',
    assignedAgent: partial.assignedAgent || 'dev-bot-1',
    priority: partial.priority || 1
  };
}

/**
 * Sample test tasks for different scenarios
 */
export const sampleTasks = {
  happyPath: createValidE2ETask({
    title: 'E2E Happy Path - All Phases Complete',
    intent: 'Execute all 7 phases successfully without errors'
  }),
  
  withFailure: createValidE2ETask({
    title: 'E2E Failure Test - Phase 2 Failure',
    intent: 'Simulate a failure in phase 2 (implementation) and trigger recovery'
  }),
  
  withRetry: createValidE2ETask({
    title: 'E2E Retry Test - Phase Retry',
    intent: 'Test phase retry mechanism when a phase needs to be retried'
  }),
  
  documentation: createValidE2ETask({
    title: 'E2E Documentation Task',
    taskType: 'documentation',
    intent: 'Test documentation task execution through all phases'
  })
};
