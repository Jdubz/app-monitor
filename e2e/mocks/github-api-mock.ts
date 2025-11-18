/**
 * GitHub API Mock Server for E2E Testing
 * 
 * Provides realistic GitHub API response mocking and webhook simulation
 * for E2E tests without hitting actual GitHub API.
 */

import { EventEmitter } from 'events';

export interface MockPRResponse {
  number: number;
  state: 'open' | 'closed';
  title: string;
  body: string;
  user: { login: string };
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  mergeable: boolean | null;
  mergeable_state: 'unknown' | 'dirty' | 'clean' | 'unstable' | 'blocked';
  merged: boolean;
  draft: boolean;
  created_at: string;
  updated_at: string;
}

export interface MockCheckRun {
  id: number;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  name: string;
  started_at: string;
  completed_at: string | null;
  output?: {
    title?: string;
    summary?: string;
    text?: string;
  };
}

export interface MockReview {
  id: number;
  user: { login: string };
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed';
  submitted_at: string;
  body?: string;
}

export interface PRGateStatus {
  base_branch_updated: boolean;
  no_conflicts: boolean;
  ci_checks_passing: boolean;
  required_approvals: boolean;
  task_verification: boolean;
  copilot_review: boolean;
  final_validation: boolean;
  no_wip_commits: boolean;
}

export interface WebhookPayload {
  action: string;
  pull_request?: MockPRResponse;
  check_suite?: {
    id: number;
    status: string;
    conclusion: string | null;
    pull_requests: Array<{ number: number }>;
  };
  check_run?: MockCheckRun;
  [key: string]: any;
}

/**
 * GitHub API Mock Server
 * 
 * Usage:
 * ```typescript
 * const mockGH = new GitHubAPIMock();
 * mockGH.onCreatePR().reply(201, { number: 123, state: 'open', ... });
 * await mockGH.triggerWebhook('check_suite', { action: 'completed', ... });
 * ```
 */
export class GitHubAPIMock extends EventEmitter {
  private prs: Map<number, MockPRResponse> = new Map();
  private checkRunsById: Map<number, MockCheckRun> = new Map(); // checkRuns by ID
  private checkRunsByPR: Map<number, MockCheckRun[]> = new Map(); // checkRuns by PR number
  private reviewsByPR: Map<number, MockReview[]> = new Map(); // reviews by PR number
  private webhookEndpoint: string;
  private nextPRNumber = 1;
  private nextCheckRunId = 1;
  private nextReviewId = 1;
  private prCounter = 1; // Counter for createPullRequest helper

  constructor(webhookEndpoint: string = 'http://localhost:3002/api/webhooks/github') {
    super();
    this.webhookEndpoint = webhookEndpoint;
    // Expose internal maps for helper functions
    this['pullRequests'] = this.prs;
    this['checkRuns'] = this.checkRunsByPR;
    this['reviews'] = this.reviewsByPR;
  }

  /**
   * Mock PR creation
   */
  onCreatePR() {
    return {
      reply: (status: number, data: Partial<MockPRResponse>) => {
        const pr: MockPRResponse = {
          number: data.number || this.nextPRNumber++,
          state: data.state || 'open',
          title: data.title || 'Test PR',
          body: data.body || 'Test PR body',
          user: data.user || { login: 'test-bot' },
          head: data.head || { ref: 'feature-branch', sha: 'abc123' },
          base: data.base || { ref: 'main', sha: 'def456' },
          mergeable: data.mergeable !== undefined ? data.mergeable : null,
          mergeable_state: data.mergeable_state || 'unknown',
          merged: data.merged || false,
          draft: data.draft || false,
          created_at: data.created_at || new Date().toISOString(),
          updated_at: data.updated_at || new Date().toISOString(),
        };
        
        this.prs.set(pr.number, pr);
        this.emit('pr_created', pr);
        
        return pr;
      }
    };
  }

  /**
   * Mock PR update
   */
  onUpdatePR(prNumber: number) {
    return {
      reply: (status: number, data: Partial<MockPRResponse>) => {
        const existing = this.prs.get(prNumber);
        if (!existing) {
          throw new Error(`PR ${prNumber} not found`);
        }
        
        const updated: MockPRResponse = {
          ...existing,
          ...data,
          number: prNumber,
          updated_at: new Date().toISOString(),
        };
        
        this.prs.set(prNumber, updated);
        this.emit('pr_updated', updated);
        
        return updated;
      }
    };
  }

  /**
   * Mock get PR
   */
  onGetPR(prNumber: number) {
    return {
      reply: (status: number) => {
        const pr = this.prs.get(prNumber);
        if (!pr && status === 200) {
          throw new Error(`PR ${prNumber} not found`);
        }
        return pr || null;
      }
    };
  }

  /**
   * Mock CI check runs
   */
  onGetChecks(prNumber: number) {
    return {
      reply: (status: number, checks: MockCheckRun[]) => {
        checks.forEach(check => {
          this.checkRunsById.set(check.id, check);
        });
        this.checkRunsByPR.set(prNumber, checks);
        
        return {
          total_count: checks.length,
          check_runs: checks,
        };
      }
    };
  }

  /**
   * Mock create check run
   */
  onCreateCheckRun() {
    return {
      reply: (status: number, data: Partial<MockCheckRun>) => {
        const checkRun: MockCheckRun = {
          id: data.id || this.nextCheckRunId++,
          status: data.status || 'queued',
          conclusion: data.conclusion || null,
          name: data.name || 'test-check',
          started_at: data.started_at || new Date().toISOString(),
          completed_at: data.completed_at || null,
        };
        
        this.checkRunsById.set(checkRun.id, checkRun);
        this.emit('check_run_created', checkRun);
        
        return checkRun;
      }
    };
  }

  /**
   * Mock update check run (e.g., mark as completed)
   */
  onUpdateCheckRun(checkRunId: number) {
    return {
      reply: (status: number, data: Partial<MockCheckRun>) => {
        const existing = this.checkRunsById.get(checkRunId);
        if (!existing) {
          throw new Error(`Check run ${checkRunId} not found`);
        }
        
        const updated: MockCheckRun = {
          ...existing,
          ...data,
          id: checkRunId,
        };
        
        if (data.status === 'completed' && !updated.completed_at) {
          updated.completed_at = new Date().toISOString();
        }
        
        this.checkRunsById.set(checkRunId, updated);
        this.emit('check_run_updated', updated);
        
        return updated;
      }
    };
  }

  /**
   * Simulate triggering a GitHub webhook
   */
  async triggerWebhook(event: string, payload: WebhookPayload): Promise<void> {
    this.emit('webhook_triggered', { event, payload });
    
    try {
      const response = await fetch(this.webhookEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': event,
          'X-GitHub-Delivery': `mock-${Date.now()}`,
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        // In test mode, webhook endpoint might not be available
        // Log the issue but don't fail
        this.emit('webhook_failed', { event, payload, error: `Webhook endpoint returned ${response.status}: ${response.statusText}` });
        console.warn(`Webhook to ${this.webhookEndpoint} failed: ${response.statusText}`);
        return; // Don't throw, just return
      }
      
      this.emit('webhook_delivered', { event, payload });
    } catch (error: any) {
      this.emit('webhook_failed', { event, payload, error: error.message });
      console.warn(`Webhook to ${this.webhookEndpoint} error: ${error.message}`);
      // Don't throw in test mode - webhook endpoint might not be available
    }
  }

  /**
   * Helper: Create PR with failing CI
   */
  createPRWithFailingCI(prNumber?: number): MockPRResponse {
    const pr = this.onCreatePR().reply(201, {
      number: prNumber,
      mergeable: true,
      mergeable_state: 'unstable',
    });
    
    // Add failing check run
    this.onCreateCheckRun().reply(201, {
      status: 'completed',
      conclusion: 'failure',
      name: 'ci-tests',
    });
    
    return pr;
  }

  /**
   * Helper: Create PR with conflicts
   */
  createPRWithConflicts(prNumber?: number): MockPRResponse {
    return this.onCreatePR().reply(201, {
      number: prNumber,
      mergeable: false,
      mergeable_state: 'dirty',
    });
  }

  /**
   * Helper: Create PR ready to merge
   */
  createPRReadyToMerge(prNumber?: number): MockPRResponse {
    const pr = this.onCreatePR().reply(201, {
      number: prNumber,
      mergeable: true,
      mergeable_state: 'clean',
    });
    
    // Add passing check runs
    this.onCreateCheckRun().reply(201, {
      status: 'completed',
      conclusion: 'success',
      name: 'ci-tests',
    });
    
    this.onCreateCheckRun().reply(201, {
      status: 'completed',
      conclusion: 'success',
      name: 'lint',
    });
    
    return pr;
  }

  /**
   * Helper: Simulate CI completion webhook
   */
  async simulateCICompletion(
    prNumber: number,
    conclusion: 'success' | 'failure'
  ): Promise<void> {
    const pr = this.prs.get(prNumber);
    if (!pr) {
      throw new Error(`PR ${prNumber} not found`);
    }
    
    await this.triggerWebhook('check_suite', {
      action: 'completed',
      check_suite: {
        id: Date.now(),
        status: 'completed',
        conclusion,
        pull_requests: [{ number: prNumber }],
      },
    });
  }

  /**
   * Helper: Simulate PR approval
   */
  async simulatePRApproval(prNumber: number): Promise<void> {
    const pr = this.prs.get(prNumber);
    if (!pr) {
      throw new Error(`PR ${prNumber} not found`);
    }
    
    await this.triggerWebhook('pull_request_review', {
      action: 'submitted',
      review: {
        state: 'approved',
        user: { login: 'reviewer' },
      },
      pull_request: pr,
    });
  }

  /**
   * Helper: Resolve PR conflicts
   */
  resolveConflicts(prNumber: number): void {
    this.onUpdatePR(prNumber).reply(200, {
      mergeable: true,
      mergeable_state: 'clean',
    });
  }

  /**
   * Helper: Pass all other gates
   */
  passAllGates(prNumber: number): void {
    this.onUpdatePR(prNumber).reply(200, {
      mergeable: true,
      mergeable_state: 'clean',
    });
    
    // Ensure all checks passing
    const checkNames = ['ci-tests', 'lint', 'type-check', 'security-scan'];
    checkNames.forEach(name => {
      this.onCreateCheckRun().reply(201, {
        status: 'completed',
        conclusion: 'success',
        name,
      });
    });
    
    // Add approving review
    this.addReview(prNumber, {
      user: { login: 'reviewer' },
      state: 'approved'
    });
  }

  /**
   * Add a review to a PR
   */
  addReview(prNumber: number, review: Partial<MockReview>): MockReview {
    const newReview: MockReview = {
      id: this.nextReviewId++,
      user: review.user || { login: 'test-reviewer' },
      state: review.state || 'commented',
      submitted_at: new Date().toISOString(),
      body: review.body
    };
    
    const existing = this.reviewsByPR.get(prNumber) || [];
    existing.push(newReview);
    this.reviewsByPR.set(prNumber, existing);
    
    this.emit('review_added', { prNumber, review: newReview });
    return newReview;
  }

  /**
   * Get reviews for PR
   */
  getReviews(prNumber: number): MockReview[] {
    return this.reviewsByPR.get(prNumber) || [];
  }

  /**
   * Check if PR has required approvals
   */
  hasRequiredApprovals(prNumber: number, required: number = 1): boolean {
    const reviews = this.getReviews(prNumber);
    const approvals = reviews.filter(r => r.state === 'approved').length;
    const changeRequests = reviews.filter(r => r.state === 'changes_requested').length;
    
    // Must have approvals and no active change requests
    return approvals >= required && changeRequests === 0;
  }

  /**
   * Get PR gate status (8 gates)
   */
  getPRGateStatus(prNumber: number): PRGateStatus {
    const pr = this.prs.get(prNumber);
    if (!pr) {
      throw new Error(`PR ${prNumber} not found`);
    }
    
    const checkRuns = this.checkRunsByPR.get(prNumber) || [];
    const allChecksPassing = checkRuns.length > 0 && 
      checkRuns.every(c => c.status === 'completed' && c.conclusion === 'success');
    
    return {
      base_branch_updated: pr.mergeable !== false, // Simplified check
      no_conflicts: pr.mergeable !== false,
      ci_checks_passing: allChecksPassing,
      required_approvals: this.hasRequiredApprovals(prNumber),
      task_verification: true, // Assume task is verified
      copilot_review: true, // Non-blocking, assume passed
      final_validation: allChecksPassing, // Tied to CI for simplicity
      no_wip_commits: !pr.draft && !pr.title.toLowerCase().includes('wip')
    };
  }

  /**
   * Create PR with specific gate failures
   */
  createPRWithGateFailures(
    gates: Partial<PRGateStatus>,
    prNumber?: number
  ): MockPRResponse {
    const pr = this.onCreatePR().reply(201, {
      number: prNumber,
      mergeable: gates.no_conflicts !== false,
      mergeable_state: gates.no_conflicts === false ? 'dirty' : 'unstable',
      draft: gates.no_wip_commits === false
    });
    
    // Add failing checks if ci_checks_passing is false
    if (gates.ci_checks_passing === false) {
      this.onCreateCheckRun().reply(201, {
        status: 'completed',
        conclusion: 'failure',
        name: 'ci-tests',
        output: {
          title: 'Tests Failed',
          summary: '3 of 10 tests failed',
          text: 'See details for more information'
        }
      });
    }
    
    // Add change request if required_approvals is false
    if (gates.required_approvals === false) {
      this.addReview(pr.number, {
        state: 'changes_requested',
        body: 'Please fix the issues before merging'
      });
    }
    
    return pr;
  }

  /**
   * Get PR by number
   */
  getPR(prNumber: number): MockPRResponse | undefined {
    return this.prs.get(prNumber);
  }

  /**
   * Get all PRs
   */
  getAllPRs(): MockPRResponse[] {
    return Array.from(this.prs.values());
  }

  /**
   * Get check runs for PR
   */
  getCheckRuns(): MockCheckRun[] {
    return Array.from(this.checkRuns.values());
  }

  /**
   * Reset all mocks
   */
  resetMocks(): void {
    this.prs.clear();
    this.checkRunsByPR.clear();
    this.checkRunsById.clear();
    this.reviewsByPR.clear();
    this.nextPRNumber = 1;
    this.nextCheckRunId = 1;
    this.nextReviewId = 1;
    this.removeAllListeners();
  }

  /**
   * Set webhook endpoint
   */
  setWebhookEndpoint(endpoint: string): void {
    this.webhookEndpoint = endpoint;
  }
}

/**
 * Factory function to create GitHub API mock
 */
export function setupGitHubMock(webhookEndpoint?: string): GitHubAPIMock {
  return new GitHubAPIMock(webhookEndpoint);
}

/**
 * Helper to create a pull request with all E2E test options
 */
export async function createPullRequest(
  options: {
    title?: string;
    baseBranch?: string;
    headBranch?: string;
    baseBehind?: number;
    hasConflicts?: boolean;
    conflicts?: string[]; // Alias for hasConflicts
    ciStatus?: 'success' | 'failure' | 'pending';
    ciChecks?: Array<{ name: string; status: 'success' | 'failure' | 'pending' }>;
    approvals?: number | Array<{ user: string; status: 'approved' | 'changes_requested' }>;
    isDraft?: boolean;
    taskId?: string;
    commits?: Array<{ message: string }>;
  },
  mock: GitHubAPIMock
): Promise<MockPRResponse> {
  const prNumber = mock['prCounter']++;
  
  // Determine if there are conflicts
  const hasConflicts = options.hasConflicts || (options.conflicts && options.conflicts.length > 0) || false;
  
  // Determine CI status from ciChecks or ciStatus
  let overallCIStatus: 'success' | 'failure' | 'pending' = options.ciStatus || 'success';
  if (options.ciChecks) {
    const hasFailure = options.ciChecks.some(c => c.status === 'failure');
    const hasPending = options.ciChecks.some(c => c.status === 'pending');
    if (hasFailure) {
      overallCIStatus = 'failure';
    } else if (hasPending) {
      overallCIStatus = 'pending';
    }
  }
  
  // Determine mergeable state based on options
  let mergeableState: MockPRResponse['mergeable_state'] = 'clean';
  if (hasConflicts) {
    mergeableState = 'dirty';
  } else if (options.baseBehind && options.baseBehind > 0) {
    mergeableState = 'behind';
  } else if (overallCIStatus === 'pending') {
    mergeableState = 'unstable';
  } else if (overallCIStatus === 'failure') {
    mergeableState = 'blocked';
  }
  
  // Build PR body with task reference if provided
  let body = 'Test PR body';
  if (options.taskId) {
    body += `\n\nRelated to task: ${options.taskId}`;
  }
  
  const pr: MockPRResponse = {
    number: prNumber,
    state: 'open',
    title: options.title || `Test PR #${prNumber}`,
    body,
    user: { login: 'test-user' },
    head: { 
      ref: options.headBranch || 'feature/test',
      sha: `sha-head-${prNumber}`
    },
    base: { 
      ref: options.baseBranch || 'main',
      sha: `sha-base-${prNumber}`
    },
    mergeable: !hasConflicts,
    mergeable_state: mergeableState,
    merged: false,
    draft: options.isDraft || false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  mock['pullRequests'].set(prNumber, pr);

  // Add check runs if ciChecks specified
  let checkRuns: MockCheckRun[] = [];
  if (options.ciChecks && options.ciChecks.length > 0) {
    checkRuns = options.ciChecks.map((check, idx) => ({
      id: Date.now() + idx,
      status: check.status === 'pending' ? 'in_progress' : 'completed',
      conclusion: check.status === 'pending' ? null : check.status,
      name: check.name,
      started_at: new Date().toISOString(),
      completed_at: check.status === 'pending' ? null : new Date().toISOString(),
    }));
    mock['checkRuns'].set(prNumber, checkRuns);
  } else if (overallCIStatus) {
    // Add default check run if CI status specified
    const checkRun: MockCheckRun = {
      id: Date.now(),
      status: overallCIStatus === 'pending' ? 'in_progress' : 'completed',
      conclusion: overallCIStatus === 'pending' ? null : overallCIStatus,
      name: 'CI',
      started_at: new Date().toISOString(),
      completed_at: overallCIStatus === 'pending' ? null : new Date().toISOString(),
    };
    checkRuns = [checkRun];
    mock['checkRuns'].set(prNumber, checkRuns);
  }

  // Get reviews for this PR
  const reviews = mock['reviews'].get(prNumber) || [];

  // Register PR with backend mock registry (TEST MODE only)
  await registerPRWithBackend({
    number: prNumber,
    url: `https://github.com/test/repo/pull/${prNumber}`,
    html_url: `https://github.com/test/repo/pull/${prNumber}`,
    head_ref: pr.head.ref,
    base_ref: pr.base.ref,
    state: pr.state === 'open' ? 'OPEN' : pr.state === 'closed' ? 'CLOSED' : 'MERGED',
    mergeable: pr.mergeable ? 'MERGEABLE' : 'CONFLICTING',
    mergeable_state: mergeableState.toUpperCase(), // Convert to uppercase for backend
    checks: checkRuns.map(check => ({
      name: check.name,
      status: check.conclusion === 'success' ? 'success' :
              check.conclusion === 'failure' ? 'failure' :
              check.conclusion === null ? 'pending' : 'error',
      conclusion: check.conclusion,
      detailsUrl: null
    })),
    reviews: reviews.map(review => ({
      author: review.user.login,
      state: review.state,
      submittedAt: review.submitted_at,
      body: review.body || ''
    })),
    comments: [],
    commits: options.commits?.map((commit, idx) => ({
      sha: `sha-${idx}`,
      message: commit.message
    }))
  });

  return pr;
}

/**
 * Register a mock PR with the backend mock registry
 * This allows the backend to retrieve mock PR data during E2E tests
 */
async function registerPRWithBackend(prData: any): Promise<void> {
  try {
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
    const API_KEY = 'test-e2e-api-key-not-for-production';

    const response = await fetch(`${API_BASE_URL}/api/prs/mock/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(prData)
    });

    if (!response.ok) {
      // Log but don't throw - backend might not be ready yet
      console.warn(`Failed to register mock PR #${prData.number} with backend: ${response.statusText}`);
      return;
    }

    const result = await response.json();
    if (!result.success) {
      console.warn(`Backend rejected mock PR registration for #${prData.number}: ${result.error}`);
    }
  } catch (error) {
    // Silently fail if backend is not available
    // This allows tests to run even if backend is starting up
    console.warn(`Could not register mock PR with backend:`, error instanceof Error ? error.message : error);
  }
}

/**
 * Helper to wait for webhook delivery
 */
export async function waitForWebhook(
  mock: GitHubAPIMock,
  timeout: number = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for webhook delivery'));
    }, timeout);
    
    mock.once('webhook_delivered', () => {
      clearTimeout(timer);
      resolve();
    });
    
    // Also resolve on webhook_failed (webhook endpoint might not be available in test mode)
    mock.once('webhook_failed', () => {
      clearTimeout(timer);
      resolve(); // Resolve anyway, test mode doesn't require webhooks
    });
  });
}
