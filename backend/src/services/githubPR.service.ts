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
   */
  async getPRStatus(prNumber: number): Promise<PRStatus> {
    const executeGetPRStatus = async (): Promise<PRStatus> => {
      logger.info({
        category: 'pr-workflow',
        action: 'fetch_pr_status',
        message: `Fetching status for PR #${prNumber}`
      });

      // Fetch PR data using gh CLI with timeout protection
      const { stdout } = await execWithTimeout(
        `gh pr view ${prNumber} --repo ${this.repoOwner}/${this.repoName} --json number,url,state,mergeable,statusCheckRollup,reviews,comments`,
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
   * Merge a pull request
   */
  async mergePR(prNumber: number, method: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<void> {
    const executeMergePR = async (): Promise<void> => {
      logger.info({
        category: 'pr-workflow',
        action: 'merge_pr',
        message: `Merging PR #${prNumber} using ${method} method`
      });

      await execWithTimeout(
        `gh pr merge ${prNumber} --repo ${this.repoOwner}/${this.repoName} --${method} --auto`,
        30000 // 30 second timeout
      );

      logger.info({
        category: 'pr-workflow',
        action: 'merge_pr_success',
        message: `Successfully merged PR #${prNumber}`
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
