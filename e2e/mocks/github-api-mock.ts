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
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | null;
  name: string;
  started_at: string;
  completed_at: string | null;
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
  private checkRuns: Map<number, MockCheckRun> = new Map();
  private webhookEndpoint: string;
  private nextPRNumber = 1;
  private nextCheckRunId = 1;

  constructor(webhookEndpoint: string = 'http://localhost:3002/api/webhooks/github') {
    super();
    this.webhookEndpoint = webhookEndpoint;
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
          this.checkRuns.set(check.id, check);
        });
        
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
        
        this.checkRuns.set(checkRun.id, checkRun);
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
        const existing = this.checkRuns.get(checkRunId);
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
        
        this.checkRuns.set(checkRunId, updated);
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
        throw new Error(`Webhook failed: ${response.statusText}`);
      }
      
      this.emit('webhook_delivered', { event, payload });
    } catch (error: any) {
      this.emit('webhook_failed', { event, payload, error: error.message });
      throw error;
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
    this.checkRuns.clear();
    this.nextPRNumber = 1;
    this.nextCheckRunId = 1;
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
  });
}
