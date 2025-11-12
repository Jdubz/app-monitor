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
  id?: string;  // GitHub check run ID (for referencing in blocking issues)
  name: string;
  status: 'pending' | 'success' | 'failure' | 'error';
  conclusion: string | null;
  detailsUrl: string | null;
}

export interface PRReview {
  id?: string;  // GitHub review ID (for referencing in blocking issues)
  author: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED';
  submittedAt: string;
  body: string;
}

export interface PRComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  path: string | null;
  line: number | null;
}

export interface PRReviewThread {
  isResolved: boolean;
  isOutdated: boolean;
  comments: Array<{
    id?: string;  // GitHub comment ID (for referencing in blocking issues)
    body: string;
    author: string;
  }>;
}

export interface PRStatus {
  number: number;
  url: string;
  html_url: string;  // HTML URL for browser viewing
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  mergeable_state?: string; // behind, clean, dirty, unknown, blocked, unstable
  head_ref: string;  // PR branch name (head ref)
  base_ref: string;  // Base branch name
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
        `gh pr view ${prNumber} --repo ${owner}/${repo} --json number,url,headRefName,baseRefName,state,mergeable,mergeStateStatus,statusCheckRollup,reviews,comments`,
        30000 // 30 second timeout
      );

      const prData = JSON.parse(stdout);

      // Parse checks
      const checks: PRCheckStatus[] = (prData.statusCheckRollup || []).map((check: { name?: string; context?: string; status?: string; state?: string; conclusion?: string | null; targetUrl?: string | null; detailsUrl?: string | null }) => ({
        name: check.name || check.context || 'unknown',
        status: this.normalizeCheckConclusion(check.conclusion, check.status || check.state),
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
      const comments: PRComment[] = (prData.comments || []).map((comment: { id?: number; author?: { login?: string }; body?: string; createdAt: string; path?: string | null; line?: number | null }) => ({
        id: comment.id || 0,
        author: comment.author?.login || 'unknown',
        body: comment.body || '',
        createdAt: comment.createdAt,
        path: comment.path || null,
        line: comment.line || null
      }));

      return {
        number: prData.number,
        url: prData.url,
        html_url: prData.url,
        head_ref: prData.headRefName,
        base_ref: prData.baseRefName,
        state: prData.state,
        mergeable: prData.mergeable || 'UNKNOWN',
        mergeable_state: prData.mergeStateStatus || 'unknown',
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
   * Uses structured tag parsing with fallback to keyword matching
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

    // Priority 1: Explicit markdown tags (most accurate)
    const explicitBlockingTags = [
      /\*\*Critical Bug:\*\*/i,
      /\*\*Security [Cc]oncern:\*\*/i,
      /\*\*MUST fix:\*\*/i,
      /\*\*Required:\*\*/i,
      /\*\*Blocking:\*\*/i,
      /\*\*Error:\*\*/i
    ];

    const explicitNitpickTags = [
      /\[nitpick\]/i,
      /\[nit\]/i,
      /\*\*Nitpick:\*\*/i,
      /\*\*Minor:\*\*/i
    ];

    const explicitSuggestionTags = [
      /\*\*Suggestion:\*\*/i,
      /\*\*Consider:\*\*/i,
      /\*\*Recommendation:\*\*/i,
      /\[suggestion\]/i,
      /\[optional\]/i
    ];

    // Priority 2: Bracketed severity indicators
    const bracketedBlocking = /\[(critical|blocking|security|required)\]/i;
    const bracketedSuggestion = /\[(suggestion|consider|optional|recommend)\]/i;

    // Priority 3: Strong keyword patterns (fallback)
    const strongBlockingPatterns = [
      /\b(security vulnerability|security issue)\b/i,
      /\bcritical\s+(bug|error|issue|problem)\b/i,
      /\bmust\s+(be\s+)?(fixed|addressed|resolved)/i,
      /\bunsafe\s+(code|operation|practice)/i,
      /\bbreaking\s+(change|api|contract)/i
    ];

    // Priority 4: Weak keyword patterns (lowest priority, most prone to false positives)
    const weakBlockingPatterns = [
      /\bacceptance\s+criteria\s+not\s+met\b/i,
      /\brequirement\s+not\s+(met|satisfied)\b/i,
      /\bdoes\s+not\s+meet\s+requirements\b/i
    ];

    const suggestionPatterns = [
      /\bconsider\s+(using|adding|changing|implementing)/i,
      /\bsugg(est|estion):/i,
      /\bcould\s+(be|improve|use|benefit)/i,
      /\bmight\s+(want to|consider|benefit)/i,
      /\brecommend(ed)?\s+(to|that|using)/i,
      /\bwould\s+be\s+(better|clearer|safer)\b/i,
      /\bprefer(red)?\s+to\b/i
    ];

    for (const comment of copilotComments) {
      const body = comment.body;
      let isBlocking = false;
      let isSuggestion = false;
      let isNitpick = false;

      // Priority 1: Check explicit tags first (highest accuracy)
      if (explicitBlockingTags.some(tag => tag.test(body))) {
        isBlocking = true;
      } else if (explicitNitpickTags.some(tag => tag.test(body))) {
        isNitpick = true;
        isSuggestion = true; // Nitpicks are treated as suggestions
      } else if (explicitSuggestionTags.some(tag => tag.test(body))) {
        isSuggestion = true;
      }
      // Priority 2: Check bracketed tags
      else if (bracketedBlocking.test(body)) {
        isBlocking = true;
      } else if (bracketedSuggestion.test(body)) {
        isSuggestion = true;
      }
      // Priority 3: Strong patterns
      else if (strongBlockingPatterns.some(pattern => pattern.test(body))) {
        isBlocking = true;
      }
      // Priority 4: Weak patterns (require additional context)
      else if (weakBlockingPatterns.some(pattern => pattern.test(body))) {
        // Only treat as blocking if it also contains strong language
        if (/\b(must|required|critical|fail)/i.test(body)) {
          isBlocking = true;
        } else {
          isSuggestion = true; // Downgrade to suggestion
        }
      }
      // Priority 5: Suggestion patterns (fallback)
      else if (suggestionPatterns.some(pattern => pattern.test(body))) {
        isSuggestion = true;
      }

      // Categorize the comment
      if (isBlocking) {
        blockingIssues.push(body);
      } else if (isSuggestion && !isNitpick) {
        suggestions.push(body);
      }
      // Nitpicks are counted but not added to either list to reduce noise
    }

    // Determine severity based on blocking issues count
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
   * Check if PR can be auto-merged (synchronous version - DEPRECATED)
   * Use canAutoMergeAsync instead which checks unresolved comments
   * @deprecated Use canAutoMergeAsync for complete validation including comment resolution
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
   * Check if PR can be auto-merged (complete async validation)
   * Checks all conditions including unresolved review comments from GitHub
   */
  async canAutoMergeAsync(prNumber: number, repoOwner?: string, repoName?: string): Promise<{
    canMerge: boolean;
    reason: string;
  }> {
    // Get PR status and analysis
    const status = await this.getPRStatus(prNumber, repoOwner, repoName);
    const copilotAnalysis = await this.getCopilotReviewAnalysis(prNumber, repoOwner, repoName);

    // Run basic checks first
    const basicCheck = this.canAutoMerge(status, copilotAnalysis);
    if (!basicCheck.canMerge) {
      return basicCheck;
    }

    // Check for unresolved review comments (query GitHub directly)
    const hasUnresolved = await this.hasUnresolvedComments(prNumber, repoOwner, repoName);
    if (hasUnresolved) {
      const unresolvedThreads = await this.getUnresolvedComments(prNumber, repoOwner, repoName);
      const blockingCount = unresolvedThreads.filter(t => !this.isNitpick(t.comments[0].body)).length;
      const nitpickCount = unresolvedThreads.length - blockingCount;
      
      return {
        canMerge: false,
        reason: `${blockingCount} unresolved review comment(s)${nitpickCount > 0 ? ` (${nitpickCount} nitpicks)` : ''}`
      };
    }

    return { canMerge: true, reason: 'All checks passed, no blocking issues' };
  }

  /**
   * Get review threads with resolution status using GraphQL API
   * This is the source of truth for unresolved comments
   */
  async getReviewThreads(prNumber: number, repoOwner?: string, repoName?: string): Promise<PRReviewThread[]> {
    const owner = repoOwner || this.repoOwner;
    const repo = repoName || this.repoName;

    const executeGetReviewThreads = async (): Promise<PRReviewThread[]> => {
      const query = `
        query($owner: String!, $repo: String!, $prNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              reviewThreads(first: 100) {
                nodes {
                  isResolved
                  isOutdated
                  comments(first: 10) {
                    nodes {
                      body
                      author {
                        login
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const { stdout } = await execWithTimeout(
        `gh api graphql -f query='${query.replace(/'/g, "'\\''")}' -F owner='${owner}' -F repo='${repo}' -F prNumber=${prNumber}`,
        30000
      );

      const result = JSON.parse(stdout);
      const threads = result.data?.repository?.pullRequest?.reviewThreads?.nodes || [];

      return threads.map((thread: any) => ({
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        comments: thread.comments.nodes.map((comment: any) => ({
          body: comment.body,
          author: comment.author.login
        }))
      }));
    };

    try {
      if (this.githubCircuitBreaker) {
        return await this.githubCircuitBreaker.execute(executeGetReviewThreads);
      } else {
        return await executeGetReviewThreads();
      }
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'get_review_threads_failed',
        message: `Failed to get review threads for PR #${prNumber}`,
        error
      });
      throw error;
    }
  }

  /**
   * Check if PR has unresolved review comments
   * Filters out outdated comments and [nitpick] comments
   */
  async hasUnresolvedComments(prNumber: number, repoOwner?: string, repoName?: string): Promise<boolean> {
    const threads = await this.getReviewThreads(prNumber, repoOwner, repoName);
    
    const unresolvedThreads = threads.filter(thread => 
      !thread.isResolved && 
      !thread.isOutdated &&
      thread.comments.length > 0 &&
      !this.isNitpick(thread.comments[0].body)
    );

    return unresolvedThreads.length > 0;
  }

  /**
   * Get unresolved review comments for task creation
   */
  async getUnresolvedComments(prNumber: number, repoOwner?: string, repoName?: string): Promise<PRReviewThread[]> {
    const threads = await this.getReviewThreads(prNumber, repoOwner, repoName);
    
    return threads.filter(thread => 
      !thread.isResolved && 
      !thread.isOutdated &&
      thread.comments.length > 0
    );
  }

  /**
   * Check if a comment is a nitpick (non-blocking)
   */
  private isNitpick(body: string): boolean {
    return /\[nitpick\]|\[nit\]/i.test(body);
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
   * Merge a pull request with auto-merge support for branch protection
   * Uses --auto flag to queue merge after all requirements are met
   * @param prNumber PR number
   * @param method Merge method (merge, squash, rebase)
   * @param repoOwner Optional repo owner (defaults to instance owner)
   * @param repoName Optional repo name (defaults to instance name)
   * @param useAutoMerge Use --auto flag to respect branch protection (default: true)
   */
  async mergePR(
    prNumber: number, 
    method: 'merge' | 'squash' | 'rebase' = 'squash', 
    repoOwner?: string, 
    repoName?: string,
    useAutoMerge: boolean = true
  ): Promise<void> {
    const owner = repoOwner || this.repoOwner;
    const repo = repoName || this.repoName;
    
    const executeMergePR = async (): Promise<void> => {
      // Check for unresolved comments before attempting merge
      const hasUnresolved = await this.hasUnresolvedComments(prNumber, owner, repo);
      if (hasUnresolved) {
        const unresolvedThreads = await this.getUnresolvedComments(prNumber, owner, repo);
        const blockingCount = unresolvedThreads.filter(t => !this.isNitpick(t.comments[0].body)).length;
        
        throw new Error(
          `Cannot merge PR #${prNumber}: ${blockingCount} unresolved review comment(s). ` +
          `Address comments and mark as resolved before merging.`
        );
      }

      const autoFlag = useAutoMerge ? '--auto' : '';
      const command = `gh pr merge ${prNumber} --repo ${owner}/${repo} --${method} ${autoFlag}`.trim();
      
      logger.info({
        category: 'pr-workflow',
        action: 'merge_pr',
        message: `Merging PR #${prNumber} in ${owner}/${repo} using ${method} method${useAutoMerge ? ' (auto-merge)' : ''}`,
        details: { prNumber, method, useAutoMerge }
      });

      await execWithTimeout(command, 30000);

      logger.info({
        category: 'pr-workflow',
        action: 'merge_pr_success',
        message: `Successfully ${useAutoMerge ? 'queued' : 'merged'} PR #${prNumber} in ${owner}/${repo}`
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
      const taskBranchMatch = branchName.match(/^task\/([^/]+)/);
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
      const { getTaskQueueService } = await import('./taskQueue.factory.js');
      const taskQueue = getTaskQueueService();

      if (taskId) {
        // Find and update task
        const task = taskQueue.getTask(taskId);
        if (task) {
          taskQueue.updateTask(taskId, {
            pr_number: prNumber
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

      logger.info({
        category: 'pr-workflow',
        action: 'track_pr_complete',
        message: `PR #${prNumber} added to workflow tracking${taskId ? ` (task: ${taskId})` : ''}`
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
   * Normalize GitHub check conclusion to our status enum
   * CRITICAL: Must use conclusion field, NOT status field!
   * - status = execution state (COMPLETED, IN_PROGRESS)
   * - conclusion = actual result (SUCCESS, FAILURE)
   */
  private normalizeCheckConclusion(conclusion: string | null | undefined, status?: string): 'pending' | 'success' | 'failure' | 'error' {
    // If no conclusion yet, check is still running
    if (!conclusion) {
      return 'pending';
    }

    const normalized = conclusion.toLowerCase();
    
    // SUCCESS conclusion = passing check
    if (normalized === 'success') {
      return 'success';
    }
    
    // FAILURE conclusion = failing check
    if (normalized === 'failure') {
      return 'failure';
    }
    
    // CANCELLED, SKIPPED, TIMED_OUT = treat as error
    if (normalized === 'cancelled' || normalized === 'skipped' || normalized === 'timed_out' || normalized === 'action_required') {
      return 'error';
    }
    
    // NEUTRAL = treat as success (check ran but didn't fail)
    if (normalized === 'neutral') {
      return 'success';
    }
    
    // Unknown conclusion - check status as fallback
    if (status) {
      const statusNorm = status.toLowerCase();
      if (statusNorm.includes('fail') || statusNorm.includes('error')) {
        return 'failure';
      }
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
