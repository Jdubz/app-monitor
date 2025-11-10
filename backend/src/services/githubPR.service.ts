/**
 * GitHub Pull Request Service
 *
 * Wrapper around GitHub CLI (gh) for PR operations.
 * Provides type-safe interface for checking PR status, reviews, and checks.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Execute command with timeout protection
 * Prevents GitHub CLI from hanging indefinitely
 */
async function execWithTimeout(
  cmd: string,
  timeoutMs: number = 30000
): Promise<{ stdout: string; stderr: string }> {
  return Promise.race([
    execAsync(cmd),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`GitHub CLI timeout after ${timeoutMs}ms: ${cmd}`)),
        timeoutMs
      )
    )
  ]);
}

export interface PRCheckStatus {
  name: string;
  status: 'pending' | 'success' | 'failure' | 'error';
  conclusion: string | null;
  detailsUrl: string | null;
}

export interface PRReview {
  author: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED';
  submittedAt: string;
  body: string;
}

export interface PRComment {
  author: string;
  body: string;
  createdAt: string;
  path: string | null;
  line: number | null;
}

export interface PRStatus {
  number: number;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  mergeable_state?: string; // behind, clean, dirty, unknown, blocked, unstable
  checks: PRCheckStatus[];
  reviews: PRReview[];
  comments: PRComment[];
}

export interface CopilotReviewAnalysis {
  hasComments: boolean;
  totalComments: number;
  blockingIssues: string[];
  suggestions: string[];
  severity: 'none' | 'low' | 'medium' | 'high';
}

/**
 * Service for interacting with GitHub Pull Requests
 */
export class GitHubPRService {
  private repoOwner: string;
  private repoName: string;
  private githubCircuitBreaker?: { execute: <T>(fn: () => Promise<T>) => Promise<T> }; // CircuitBreaker (imported lazily)

  constructor(repoOwner: string = 'Jdubz', repoName: string = 'app-monitor') {
    this.repoOwner = repoOwner;
    this.repoName = repoName;
    this.initializeCircuitBreaker();
  }

  /**
   * Initialize circuit breaker for GitHub API protection
   */
  private async initializeCircuitBreaker(): Promise<void> {
    try {
      const { CircuitBreaker } = await import('../utils/circuitBreaker.js');
      this.githubCircuitBreaker = new CircuitBreaker({
        name: 'github-api',
        failureThreshold: 5,
        resetTimeout: 60000 // 1 minute
      });

      logger.info({
        category: 'pr-workflow',
        action: 'circuit_breaker_initialized',
        message: 'GitHub API circuit breaker initialized'
      });
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'circuit_breaker_init_failed',
        message: 'Failed to initialize GitHub API circuit breaker',
        error
      });
    }
  }

  /**
   * Get comprehensive PR status including checks, reviews, and comments
   * @param prNumber PR number
   * @param repoOwner Optional repo owner (defaults to instance owner)
   * @param repoName Optional repo name (defaults to instance name)
   */
  async getPRStatus(prNumber: number, repoOwner?: string, repoName?: string): Promise<PRStatus> {
    const owner = repoOwner || this.repoOwner;
    const repo = repoName || this.repoName;
    
    const executeGetPRStatus = async (): Promise<PRStatus> => {
      logger.info({
        category: 'pr-workflow',
        action: 'fetch_pr_status',
        message: `Fetching status for PR #${prNumber} in ${owner}/${repo}`
      });

      // Fetch PR data using gh CLI with timeout protection
      const { stdout } = await execWithTimeout(
        `gh pr view ${prNumber} --repo ${owner}/${repo} --json number,url,state,mergeable,statusCheckRollup,reviews,comments`,
        30000 // 30 second timeout
      );

      const prData = JSON.parse(stdout);

      // Parse checks
      const checks: PRCheckStatus[] = (prData.statusCheckRollup || []).map((check: { name?: string; context?: string; status?: string; state?: string; conclusion?: string | null; targetUrl?: string | null; detailsUrl?: string | null }) => ({
        name: check.name || check.context || 'unknown',
        status: this.normalizeCheckStatus(check.status || check.state || 'pending'),
        conclusion: check.conclusion || null,
        detailsUrl: check.targetUrl || check.detailsUrl || null
      }));

      // Parse reviews
      const reviews: PRReview[] = (prData.reviews || []).map((review: { author?: { login?: string }; state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED'; submittedAt: string; body?: string }) => ({
        author: review.author?.login || 'unknown',
        state: review.state,
        submittedAt: review.submittedAt,
        body: review.body || ''
      }));

      // Parse comments
      const comments: PRComment[] = (prData.comments || []).map((comment: { author?: { login?: string }; body?: string; createdAt: string; path?: string | null; line?: number | null }) => ({
        author: comment.author?.login || 'unknown',
        body: comment.body || '',
        createdAt: comment.createdAt,
        path: comment.path || null,
        line: comment.line || null
      }));

      return {
        number: prData.number,
        url: prData.url,
        state: prData.state,
        mergeable: prData.mergeable || 'UNKNOWN',
        checks,
        reviews,
        comments
      };
    };

    try {
      // Execute with circuit breaker protection
      if (this.githubCircuitBreaker) {
        return await this.githubCircuitBreaker.execute(executeGetPRStatus);
      } else {
        return await executeGetPRStatus();
      }
    } catch (error) {
      const isCircuitOpen = error instanceof Error && error.message.includes('Circuit breaker');

      if (isCircuitOpen) {
        logger.error({
          category: 'circuit-breaker',
          action: 'github_api_blocked',
          message: `GitHub API circuit breaker is OPEN, blocking PR status fetch for #${prNumber}`,
          details: { prNumber }
        });
      } else {
        logger.error({
          category: 'pr-workflow',
          action: 'fetch_pr_status_failed',
          message: `Failed to fetch PR status for #${prNumber}`,
          error
        });
      }
      throw error;
    }
  }

  /**
   * Analyze Copilot's review comments for blocking issues
   */
  analyzeCopilotReview(comments: PRComment[]): CopilotReviewAnalysis {
    const copilotComments = comments.filter(c =>
      c.author.toLowerCase().includes('copilot') ||
      c.author.toLowerCase().includes('github-actions')
    );

    if (copilotComments.length === 0) {
      return {
        hasComments: false,
        totalComments: 0,
        blockingIssues: [],
        suggestions: [],
        severity: 'none'
      };
    }

    const blockingIssues: string[] = [];
    const suggestions: string[] = [];

    // Improved pattern-based matching to reduce false positives
    const blockingPatterns = [
      /\b(security|vulnerability)\b/i, // Simplified - any mention of security/vulnerability is blocking
      /\bcritical\b/i, // Critical is always blocking
      /\berror\s+(in|with|detected)/i, // Error patterns
      /\bmust\s+fix\b/i,
      /\bmust\s+be\s+(fixed|addressed|resolved)/i,
      /\bacceptance\s+criteria\s+(not\s+)?(met|satisfied)/i,
      /\brequirement\s+(not\s+)?(met|satisfied)/i,
      /\bdoes\s+not\s+meet\b/i,
      /\bunsafe\s+(code|operation|practice)/i,
      /\bbreaking\s+(change|api)/i,
      /\b(error|bug|issue)\s+(must|should|needs to)\s+be\s+(fixed|resolved)/i
    ];

    // Suggestion patterns (more permissive)
    const suggestionPatterns = [
      /\bconsider\s+(using|adding|changing)/i,
      /\bsugg(est|estion)\b/i,
      /\bcould\s+(be|improve|use)/i,
      /\bmight\s+(want to|be|consider)/i,
      /\brecommend(ed)?\b/i,
      /\bprefer(red)?\b/i,
      /\bwould\s+be\s+better\b/i
    ];

    for (const comment of copilotComments) {
      // Check for blocking issues using patterns
      if (blockingPatterns.some(pattern => pattern.test(comment.body))) {
        blockingIssues.push(comment.body);
      }
      // Check for suggestions using patterns
      else if (suggestionPatterns.some(pattern => pattern.test(comment.body))) {
        suggestions.push(comment.body);
      }
    }

    // Determine severity
    let severity: 'none' | 'low' | 'medium' | 'high' = 'low';
    if (blockingIssues.length > 0) {
      severity = blockingIssues.length >= 3 ? 'high' : 'medium';
    }

    return {
      hasComments: true,
      totalComments: copilotComments.length,
      blockingIssues,
      suggestions,
      severity
    };
  }

  /**
   * Check if PR can be auto-merged based on checks, reviews, and comments
   */
  canAutoMerge(status: PRStatus, copilotAnalysis: CopilotReviewAnalysis): {
    canMerge: boolean;
    reason: string;
  } {
    // Check if PR is open and mergeable
    if (status.state !== 'OPEN') {
      return { canMerge: false, reason: 'PR is not open' };
    }

    if (status.mergeable === 'CONFLICTING') {
      return { canMerge: false, reason: 'PR has merge conflicts' };
    }

    if (status.mergeable === 'UNKNOWN') {
      return { canMerge: false, reason: 'PR mergeable status is unknown, waiting for GitHub to determine' };
    }

    // Check if all CI checks passed
    const failedChecks = status.checks.filter(c =>
      c.status === 'failure' || c.status === 'error'
    );
    if (failedChecks.length > 0) {
      return {
        canMerge: false,
        reason: `CI checks failed: ${failedChecks.map(c => c.name).join(', ')}`
      };
    }

    const pendingChecks = status.checks.filter(c => c.status === 'pending');
    if (pendingChecks.length > 0) {
      return {
        canMerge: false,
        reason: `CI checks still pending: ${pendingChecks.map(c => c.name).join(', ')}`
      };
    }

    // Check for blocking Copilot issues
    if (copilotAnalysis.severity === 'high' || copilotAnalysis.severity === 'medium') {
      return {
        canMerge: false,
        reason: `Copilot found ${copilotAnalysis.blockingIssues.length} blocking issue(s)`
      };
    }

    // Check for human reviews that request changes
    const changesRequested = status.reviews.filter(r =>
      r.state === 'CHANGES_REQUESTED' && !r.author.toLowerCase().includes('copilot')
    );
    if (changesRequested.length > 0) {
      return {
        canMerge: false,
        reason: `Human reviewer(s) requested changes: ${changesRequested.map(r => r.author).join(', ')}`
      };
    }

    return { canMerge: true, reason: 'All checks passed, no blocking issues' };
  }

  /**
   * Get Copilot review analysis for a PR
   * Convenience method that fetches PR status and analyzes Copilot comments
   */
  async getCopilotReviewAnalysis(prNumber: number, repoOwner?: string, repoName?: string): Promise<CopilotReviewAnalysis> {
    const status = await this.getPRStatus(prNumber, repoOwner, repoName);
    return this.analyzeCopilotReview(status.comments);
  }

  /**
   * Merge a pull request
   * @param prNumber PR number
   * @param method Merge method (merge, squash, rebase)
   * @param repoOwner Optional repo owner (defaults to instance owner)
   * @param repoName Optional repo name (defaults to instance name)
   */
  async mergePR(prNumber: number, method: 'merge' | 'squash' | 'rebase' = 'squash', repoOwner?: string, repoName?: string): Promise<void> {
    const owner = repoOwner || this.repoOwner;
    const repo = repoName || this.repoName;
    
    const executeMergePR = async (): Promise<void> => {
      logger.info({
        category: 'pr-workflow',
        action: 'merge_pr',
        message: `Merging PR #${prNumber} in ${owner}/${repo} using ${method} method`
      });

      await execWithTimeout(
        `gh pr merge ${prNumber} --repo ${owner}/${repo} --${method} --auto`,
        30000
      );

      logger.info({
        category: 'pr-workflow',
        action: 'merge_pr_success',
        message: `Successfully merged PR #${prNumber} in ${owner}/${repo}`
      });
    };

    try {
      // Execute with circuit breaker protection
      if (this.githubCircuitBreaker) {
        await this.githubCircuitBreaker.execute(executeMergePR);
      } else {
        await executeMergePR();
      }
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'merge_pr_failed',
        message: `Failed to merge PR #${prNumber}`,
        error
      });
      throw error;
    }
  }

  /**
   * Get PR details including mergeable_state
   */
  async getPR(prNumber: number, repoOwner?: string, repoName?: string): Promise<{ 
    number: number;
    mergeable_state: string;
    state: string;
    title: string;
  }> {
    const owner = repoOwner || this.repoOwner;
    const repo = repoName || this.repoName;

    const executeGetPR = async () => {
      const { stdout } = await execWithTimeout(
        `gh pr view ${prNumber} --repo ${owner}/${repo} --json number,state,title,mergeStateStatus`,
        30000
      );
      
      const data = JSON.parse(stdout);
      return {
        number: data.number,
        state: data.state,
        title: data.title,
        mergeable_state: data.mergeStateStatus || 'unknown'
      };
    };

    try {
      if (this.githubCircuitBreaker) {
        return await this.githubCircuitBreaker.execute(executeGetPR);
      } else {
        return await executeGetPR();
      }
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'get_pr_failed',
        message: `Failed to get PR #${prNumber}`,
        error
      });
      throw error;
    }
  }

  /**
   * Update PR branch with latest base (merge base into PR branch)
   * Useful when PR is behind and needs to be brought up to date
   */
  async updateBranch(prNumber: number, repoOwner?: string, repoName?: string): Promise<void> {
    const owner = repoOwner || this.repoOwner;
    const repo = repoName || this.repoName;

    const executeUpdateBranch = async (): Promise<void> => {
      logger.info({
        category: 'pr-workflow',
        action: 'update_pr_branch',
        message: `Updating PR #${prNumber} branch with latest base`
      });

      // Use GitHub API to update branch (merges base into PR branch)
      await execWithTimeout(
        `gh api repos/${owner}/${repo}/pulls/${prNumber}/update-branch -X PUT`,
        30000
      );

      logger.info({
        category: 'pr-workflow',
        action: 'update_pr_branch_success',
        message: `Successfully updated PR #${prNumber} branch`
      });
    };

    try {
      if (this.githubCircuitBreaker) {
        await this.githubCircuitBreaker.execute(executeUpdateBranch);
      } else {
        await executeUpdateBranch();
      }
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'update_pr_branch_failed',
        message: `Failed to update PR #${prNumber} branch`,
        error
      });
      throw error;
    }
  }

  /**
   * Add a comment to a PR
   */
  async addComment(prNumber: number, body: string): Promise<void> {
    try {
      await execWithTimeout(
        `gh pr comment ${prNumber} --repo ${this.repoOwner}/${this.repoName} --body "${body.replace(/"/g, '\\"')}"`,
        30000 // 30 second timeout
      );

      logger.info({
        category: 'pr-workflow',
        action: 'add_pr_comment',
        message: `Added comment to PR #${prNumber}`
      });
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'add_pr_comment_failed',
        message: `Failed to add comment to PR #${prNumber}`,
        error
      });
      throw error;
    }
  }

  /**
   * Manually track a PR in the workflow
   * Extracts task ID from branch name if present, associates PR with task
   */
  async trackPR(prNumber: number): Promise<void> {
    try {
      // Get PR details including branch name
      const { stdout } = await execWithTimeout(
        `gh pr view ${prNumber} --repo ${this.repoOwner}/${this.repoName} --json number,headRefName,url,state`,
        30000
      );
      
      const prData = JSON.parse(stdout);
      const branchName: string = prData.headRefName;
      
      // Extract task ID from branch name (format: task/{taskId}/description or task-{taskId})
      let taskId: string | null = null;
      const taskBranchMatch = branchName.match(/^task\/([^\/]+)/);
      if (taskBranchMatch) {
        taskId = taskBranchMatch[1];
      } else {
        const taskDashMatch = branchName.match(/^task-(.+)/);
        if (taskDashMatch) {
          taskId = taskDashMatch[1];
        }
      }

      if (!taskId) {
        logger.info({
          category: 'pr-workflow',
          action: 'track_pr_no_task',
          message: `PR #${prNumber} has no task ID in branch name (${branchName}), tracking as standalone PR`
        });
      }

      // Import task queue to update task
      const { getTaskQueue } = await import('./taskQueue.sqlite.js');
      const taskQueue = getTaskQueue();

      if (taskId) {
        // Find and update task
        const task = await taskQueue.get(taskId);
        if (task) {
          await taskQueue.updatePRInfo(taskId, {
            prNumber,
            prUrl: prData.url,
            prBranch: branchName,
            prStatus: prData.state === 'MERGED' ? 'merged' : 
                     prData.state === 'CLOSED' ? 'closed' : 'pending_checks'
          });
          
          logger.info({
            category: 'pr-workflow',
            action: 'track_pr_success',
            message: `Successfully tracked PR #${prNumber} for task ${taskId}`
          });
        } else {
          logger.warn({
            category: 'pr-workflow',
            action: 'track_pr_task_not_found',
            message: `Task ${taskId} not found, cannot associate with PR #${prNumber}`
          });
        }
      }

      // Trigger webhook handler to process the PR
      const { getGitHubWebhookHandler } = await import('./githubWebhook.handler.js');
      const webhookHandler = getGitHubWebhookHandler();
      
      await webhookHandler.handlePullRequest({
        action: 'synchronize',
        number: prNumber,
        pull_request: {
          number: prNumber,
          html_url: prData.url,
          state: prData.state.toLowerCase(),
          head: { ref: branchName }
        }
      } as any);

      logger.info({
        category: 'pr-workflow',
        action: 'track_pr_complete',
        message: `PR #${prNumber} added to workflow tracking`
      });
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'track_pr_failed',
        message: `Failed to track PR #${prNumber}`,
        error
      });
      throw error;
    }
  }

  /**
   * Normalize check status to standard values
   */
  private normalizeCheckStatus(status: string): 'pending' | 'success' | 'failure' | 'error' {
    const normalized = status.toLowerCase();
    if (normalized.includes('success') || normalized === 'completed') {
      return 'success';
    }
    if (normalized.includes('fail')) {
      return 'failure';
    }
    if (normalized.includes('error')) {
      return 'error';
    }
    return 'pending';
  }
}

// Singleton instance
let githubPRService: GitHubPRService | null = null;

export function getGitHubPRService(): GitHubPRService {
  if (!githubPRService) {
    githubPRService = new GitHubPRService();
  }
  return githubPRService;
}
