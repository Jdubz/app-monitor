/**
 * PR Validation Test Helpers
 * 
 * Utilities for testing PR gate validation in E2E tests
 */

const API_KEY = 'test-e2e-api-key-not-for-production';

/**
 * Complete a pr-validation task for testing
 * This simulates a validation agent completing the validation task
 */
export async function completeValidationTask(
  prNumber: number,
  options: {
    score?: number;
    issues?: Array<{ type: string; severity: string; message?: string }>;
  } = {},
  apiBaseUrl: string = 'http://localhost:3002'
): Promise<void> {
  const { score = 85, issues = [] } = options;

  const response = await fetch(`${apiBaseUrl}/api/prs/${prNumber}/complete-validation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify({ score, issues })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to complete validation: ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(`Validation completion failed: ${result.error || 'Unknown error'}`);
  }
}

/**
 * Wait for all 7 pre-validation conditions to be met
 */
export async function waitForPreValidationConditions(
  prNumber: number,
  apiBaseUrl: string = 'http://localhost:3002',
  timeout: number = 30000
): Promise<void> {
  const startTime = Date.now();
  const preValidationConditions = [
    'ci_checks_passing',
    'comments_resolved',
    'no_merge_conflicts',
    'branch_updated',
    'no_change_requests',
    'task_verification',
    'copilot_review_completed'
  ];

  while (Date.now() - startTime < timeout) {
    const gates = await getPRGates(prNumber, apiBaseUrl);
    const preValidationMet = preValidationConditions.every(conditionName => {
      const gate = gates.find(g => g.name === conditionName);
      return gate && gate.status === 'pass';
    });

    if (preValidationMet) {
      return; // All pre-validation conditions met
    }

    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Pre-validation conditions not met within ${timeout}ms`);
}

/**
 * Get PR gates
 */
export async function getPRGates(
  prNumber: number,
  apiBaseUrl: string = 'http://localhost:3002'
): Promise<Array<{
  name: string;
  status: string;
  blocking: boolean;
  blocking_issues: any[];
  last_checked: number;
}>> {
  const response = await fetch(`${apiBaseUrl}/api/prs/${prNumber}/gates`, {
    headers: { 'X-API-Key': API_KEY }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get PR gates: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.data?.gates || result.gates || [];
}

/**
 * Trigger PR gate evaluation
 */
export async function triggerGateEvaluation(
  prNumber: number,
  options: { force?: boolean } = {},
  apiBaseUrl: string = 'http://localhost:3002'
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/prs/${prNumber}/evaluate-gates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify(options)
  });

  if (!response.ok) {
    throw new Error(`Failed to trigger gate evaluation: ${response.statusText}`);
  }
}
