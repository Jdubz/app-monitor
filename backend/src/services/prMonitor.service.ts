/**
 * PR Monitor Service
 *
 * Business logic for PR workflow:
 * - Analyzes Copilot feedback
 * - Determines when to auto-merge
 * - Creates followup tasks when issues found
 * 
 * Note: Polling removed - now webhook-driven via GitHubWebhookHandler
 */

import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { GitHubPRService, getGitHubPRService, type PRStatus, type CopilotReviewAnalysis } from './githubPR.service.js';
import { TaskQueueService } from './taskQueue.sqlite.js';
import type { Task } from './taskQueue.sqlite.js';
import { ReviewCommentTracker } from './reviewCommentTracker.service.js';
import { getDatabase } from './database.js';

type TaskPRStatus = NonNullable<Task['pr_status']>;

export interface PRMonitorConfig {
  enableAutoMerge: boolean;
  maxFollowupDepth?: number;
  maxFollowupTotal?: number;
  mergeRetryAttempts?: number;
  mergeRetryDelayMs?: number[];
}

/**
 * Service for PR workflow business logic (webhook-driven)
 */
export class PRMonitorService {
  private readonly config: PRMonitorConfig;
  private readonly githubPR: GitHubPRService;
  private readonly taskQueue: TaskQueueService;
  private readonly reviewCommentTracker: ReviewCommentTracker;
  private readonly MAX_FOLLOWUP_DEPTH: number;
  private readonly MAX_FOLLOWUP_TOTAL: number;
  private readonly MERGE_RETRY_ATTEMPTS: number;
  private readonly MERGE_RETRY_DELAYS: number[];

  constructor(
    taskQueue: TaskQueueService,
    config: Partial<PRMonitorConfig> = {}
  ) {
    this.taskQueue = taskQueue;
    this.githubPR = getGitHubPRService();
    this.reviewCommentTracker = new ReviewCommentTracker(getDatabase());
    this.config = {
      enableAutoMerge: config.enableAutoMerge ?? true,
      maxFollowupDepth: config.maxFollowupDepth ?? 3,
      maxFollowupTotal: config.maxFollowupTotal ?? 5,
      mergeRetryAttempts: config.mergeRetryAttempts ?? 3,
      mergeRetryDelayMs: config.mergeRetryDelayMs ?? [5000, 15000, 45000] // 5s, 15s, 45s
    };
    this.MAX_FOLLOWUP_DEPTH = this.config.maxFollowupDepth!;
    this.MAX_FOLLOWUP_TOTAL = this.config.maxFollowupTotal!;
    this.MERGE_RETRY_ATTEMPTS = this.config.mergeRetryAttempts!;
    this.MERGE_RETRY_DELAYS = this.config.mergeRetryDelayMs!;
  }

  /**
   * Detect if a PR was created by our system (dev bots)
   * System PRs should be auto-adopted if orphaned, user PRs should not
   */
  detectSystemCreatedPR(prBranch: string, prAuthor: string, prTitle: string): {
    isSystemPR: boolean;
    reason: string;
    extractedTaskId?: string;
  } {
    // Pattern 1: Branch name matches task pattern
    const branchMatch = prBranch.match(/task-(implementation|investigation|bugfix|feature|refactor|docs)-([a-f0-9-]+)/i);
    if (branchMatch) {
      return {
        isSystemPR: true,
        reason: `Branch pattern: ${prBranch}`,
        extractedTaskId: `task-${branchMatch[1]}-${branchMatch[2]}`
      };
    }

    // Pattern 2: Simple task- prefix
    const simpleTaskMatch = prBranch.match(/^task-([a-f0-9-]{8,})/i);
    if (simpleTaskMatch) {
      return {
        isSystemPR: true,
        reason: `Branch starts with task-: ${prBranch}`,
        extractedTaskId: prBranch.split('/')[0] // Take before any slashes
      };
    }

    // Pattern 3: Author is a bot
    const botAuthors = ['github-actions[bot]', 'dependabot[bot]', 'renovate[bot]'];
    const authorLower = prAuthor.toLowerCase();
    if (botAuthors.some(bot => authorLower.includes(bot.toLowerCase()))) {
      return {
        isSystemPR: true,
        reason: `Bot author: ${prAuthor}`
      };
    }

    // Pattern 4: Title contains task ID
    const titleMatch = prTitle.match(/\b(task-[a-z]+-[a-f0-9-]{8,})\b/i);
    if (titleMatch) {
      return {
        isSystemPR: true,
        reason: `Task ID in title: ${titleMatch[1]}`,
        extractedTaskId: titleMatch[1]
      };
    }

    return {
      isSystemPR: false,
      reason: 'No system PR indicators found'
    };
  }

  /**
   * Create an adoption task for an orphaned system PR
   * Attempts to reconstruct minimal task metadata from PR information
   */
  async adoptOrphanedSystemPR(
    prNumber: number,
    prData: {
      title: string;
      branch: string;
      author: string;
      description?: string;
    },
    extractedTaskId?: string
  ): Promise<Task | null> {
    logger.info({
      category: 'pr-workflow',
      action: 'adopting_orphaned_pr',
      message: `Auto-adopting orphaned system PR #${prNumber}`,
      details: {
        prNumber,
        branch: prData.branch,
        author: prData.author,
        extractedTaskId
      }
    });

    try {
      // Try to extract meaningful acceptance criteria from PR description
      const acceptanceCriteria: string[] = [];
      if (prData.description) {
        // Look for acceptance criteria patterns in description
        const criteriaMatch = prData.description.match(/(?:acceptance criteria|criteria|requirements?):\s*\n?((?:[-*]\s+.+\n?)+)/im);
        if (criteriaMatch) {
          const extracted = criteriaMatch[1].split('\n')
            .filter(line => line.trim())
            .map(line => line.replace(/^[-*]\s+/, '').trim());
          acceptanceCriteria.push(...extracted);
        }
      }

      // Fallback criteria if none found
      if (acceptanceCriteria.length === 0) {
        acceptanceCriteria.push(
          'All CI checks pass',
          'Code review feedback addressed',
          'No merge conflicts'
        );
      }

      // Use extracted task ID or generate one
      const taskId = extractedTaskId || `task-adopted-${Date.now().toString(36)}`;

      // Create adoption task
      const adoptionTask = this.taskQueue.createTask({
        id: taskId,
        title: `[ADOPTED] ${prData.title}`,
        description: `Auto-adopted orphaned system PR #${prNumber}

**Original PR:** #${prNumber}
**Branch:** ${prData.branch}
**Author:** ${prData.author}

**Reason for adoption:**
This PR was created by our system but lost its task association. It has been automatically adopted to ensure quality gates are enforced.

**Original Description:**
${prData.description || 'No description available'}`,
        type: 'implementation',
        priority: 7,
        assigned_agent: 'backend-specialist',
        pr_number: prNumber,
        pr_branch: prData.branch,
        pr_status: 'pending_checks',
        acceptance_criteria: acceptanceCriteria,
        is_orphaned_pr: true, // Mark as orphaned
        notes: `Auto-adopted on ${new Date().toISOString()}`
      });

      logger.info({
        category: 'pr-workflow',
        action: 'orphaned_pr_adopted',
        message: `Successfully adopted PR #${prNumber} as task ${adoptionTask.id}`,
        details: {
          prNumber,
          taskId: adoptionTask.id,
          acceptanceCriteriaCount: acceptanceCriteria.length
        }
      });

      return adoptionTask;
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'pr_adoption_failed',
        message: `Failed to adopt orphaned PR #${prNumber}`,
        error,
        details: { prNumber, prData }
      });
      return null;
    }
  }

  /**
   * Determine if a followup task should be created for PR issues
   */
  shouldCreateFollowup(prNumber: number, prStatus: PRStatus, copilotAnalysis: CopilotReviewAnalysis, task?: Task): boolean {
    // Create followup for failed checks
    const hasFailedChecks = prStatus.checks.some(c =>
      c.status === 'failure' || c.status === 'error'
    );
    if (hasFailedChecks) {
      return true;
    }

    // Create followup for blocking Copilot issues
    if (copilotAnalysis.severity === 'high' || copilotAnalysis.severity === 'medium') {
      return true;
    }

    // Create followup for human change requests
    const hasChangeRequests = prStatus.reviews.some(r =>
      r.state === 'CHANGES_REQUESTED' && !r.author.toLowerCase().includes('copilot')
    );
    if (hasChangeRequests) {
      return true;
    }

    // Create followup for merge conflicts
    if (prStatus.mergeable === 'CONFLICTING') {
      return true;
    }

    // Create followup for unresolved blocking review comments
    const resolutionSummary = this.reviewCommentTracker.getResolutionSummary(prNumber);
    if (resolutionSummary.unresolvedBlocking > 0) {
      logger.info({
        category: 'pr-workflow',
        action: 'followup_needed_unresolved_comments',
        message: `PR #${prNumber} has ${resolutionSummary.unresolvedBlocking} unresolved blocking comments`,
        details: { pr_number: prNumber, ...resolutionSummary }
      });
      return true;
    }

    // Create followup for failed task verification (< 80% acceptance criteria met)
    if (task && task.verification_passed === false) {
      logger.info({
        category: 'pr-workflow',
        action: 'followup_needed_verification_failed',
        message: `PR #${prNumber} task verification failed`,
        details: {
          pr_number: prNumber,
          task_id: task.id,
          verification_passed: task.verification_passed
        }
      });
      return true;
    }

    return false;
  }

  /**
   * Hash issues to create fingerprint for tracking
   */
  private hashIssues(issues: string[]): string {
    return crypto.createHash('md5').update(issues.sort().join('|')).digest('hex');
  }

  /**
   * Get all tasks associated with a PR (original + all followups)
   */
  private async getTasksForPR(prNumber: number): Promise<Task[]> {
    return await this.taskQueue.findByPRNumber(prNumber);
  }

  /**
   * Calculate followup depth by traversing the followup_tasks chain
   * Protected against circular dependencies and stack overflow
   *
   * Note: This method is synchronous because taskQueue.getTask() is synchronous
   * (better-sqlite3 provides synchronous database access for performance)
   */
  private getFollowupDepth(taskId: string, visited: Set<string> = new Set(), depth: number = 0): number {
    // Prevent circular dependency stack overflow
    if (visited.has(taskId)) {
      logger.warn({
        category: 'pr-workflow',
        action: 'circular_dependency_detected',
        message: `Circular dependency detected in followup chain at task ${taskId}`,
        details: { taskId, visitedChain: Array.from(visited) }
      });
      return depth; // Return current depth, don't recurse further
    }

    // Safety: max depth limit (double the configured max to catch issues)
    if (depth > this.MAX_FOLLOWUP_DEPTH * 2) {
      logger.error({
        category: 'pr-workflow',
        action: 'max_recursion_depth_exceeded',
        message: `Maximum recursion depth exceeded at task ${taskId}`,
        details: { taskId, depth, maxAllowed: this.MAX_FOLLOWUP_DEPTH * 2 }
      });
      return depth;
    }

    const task = this.taskQueue.getTask(taskId);
    if (!task || !task.followup_tasks || task.followup_tasks.length === 0) {
      return depth;
    }

    // Add current task to visited set
    visited.add(taskId);

    // Find max depth of any child
    let maxChildDepth = depth;
    for (const childId of task.followup_tasks) {
      const childDepth = this.getFollowupDepth(childId, visited, depth + 1);
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }

    // Remove from visited when backtracking (allows same task in different branches)
    visited.delete(taskId);

    return maxChildDepth;
  }

  /**
   * Count total followup tasks for a PR
   */
  private async countFollowupsForPR(prNumber: number): Promise<number> {
    const tasks = await this.getTasksForPR(prNumber);
    return tasks.filter(t => t.followup_for_pr === prNumber).length;
  }

  /**
   * Check if we can create another followup task
   */
  private async checkFollowupLimits(prNumber: number, parentTaskId: string): Promise<{
    allowed: boolean;
    reason?: string;
    depth: number;
    total: number;
  }> {
    const depth = this.getFollowupDepth(parentTaskId);
    const total = await this.countFollowupsForPR(prNumber);

    if (depth >= this.MAX_FOLLOWUP_DEPTH) {
      return {
        allowed: false,
        reason: `Maximum followup depth (${this.MAX_FOLLOWUP_DEPTH}) exceeded`,
        depth,
        total
      };
    }

    if (total >= this.MAX_FOLLOWUP_TOTAL) {
      return {
        allowed: false,
        reason: `Maximum total followups (${this.MAX_FOLLOWUP_TOTAL}) for PR exceeded`,
        depth,
        total
      };
    }

    return { allowed: true, depth, total };
  }

  /**
   * Create escalation task for human intervention
   */
  private async createEscalationTask(
    prNumber: number,
    parentTaskId: string,
    reason: string,
    depth: number,
    total: number
  ): Promise<Task> {
    const parentTask = this.taskQueue.getTask(parentTaskId);
    const prTasks = await this.getTasksForPR(prNumber);
    const taskChain = prTasks.map(t => `- ${t.id}: ${t.title} (${t.status})`).join('\n');

    const escalationTask = this.taskQueue.createTask({
      title: `🚨 ESCALATION: PR #${prNumber} followup limit exceeded`,
      description: `PR #${prNumber} has reached the maximum automated fix attempts and requires human intervention.

**Reason:** ${reason}
**Followup depth:** ${depth}/${this.MAX_FOLLOWUP_DEPTH}
**Total followups:** ${total}/${this.MAX_FOLLOWUP_TOTAL}
**Original task:** ${parentTaskId}

**Task chain for this PR:**
${taskChain}

**Action required:**
1. Review PR #${prNumber}: ${parentTask?.pr_url || `https://github.com/Jdubz/app-monitor/pull/${prNumber}`}
2. Investigate why automated fixes failed
3. Either:
   - Fix manually and merge
   - Close PR if not viable
   - Adjust approach and retry with new task

**Common causes:**
- Complex issue requiring architectural changes
- Missing requirements/unclear specifications  
- External dependencies or environment issues
- Test infrastructure problems

**Note:** GitHub Copilot will be notified of this escalation via PR review.`,
      type: 'manual-intervention',
      priority: 10, // Highest priority
      assigned_agent: 'human',
      followup_for_pr: prNumber,
      pr_branch: parentTask?.pr_branch,
      acceptance_criteria: [
        `PR #${prNumber} is either merged or closed with explanation`,
        `Root cause of repeated failures is documented`,
        `Any systemic issues are addressed`
      ]
    });

    // Update parent task
    if (parentTask) {
      this.taskQueue.updateTask(parentTaskId, {
        notes: `Escalated to human: ${reason}. See task ${escalationTask.id}`
      });
    }

    logger.error({
      category: 'pr-workflow',
      action: 'followup_limit_exceeded',
      message: `PR #${prNumber} escalated: ${reason}`,
      details: {
        prNumber,
        parentTaskId,
        escalationTaskId: escalationTask.id,
        depth,
        total,
        reason
      }
    });

    return escalationTask;
  }

  /**
   * Create a followup task to address PR issues
   */
  async createFollowupTask(
    prNumber: number,
    taskId: string,
    prBranch: string,
    prStatus: PRStatus,
    copilotAnalysis: CopilotReviewAnalysis
  ): Promise<Task | null> {
    // Check followup limits FIRST
    const limitCheck = await this.checkFollowupLimits(prNumber, taskId);
    
    if (!limitCheck.allowed) {
      logger.warn({
        category: 'pr-workflow',
        action: 'followup_limit_reached',
        message: `Cannot create followup for PR #${prNumber}: ${limitCheck.reason}`,
        details: {
          prNumber,
          parentTaskId: taskId,
          depth: limitCheck.depth,
          total: limitCheck.total,
          maxDepth: this.MAX_FOLLOWUP_DEPTH,
          maxTotal: this.MAX_FOLLOWUP_TOTAL
        }
      });

      // Create escalation task for human intervention
      await this.createEscalationTask(
        prNumber,
        taskId,
        limitCheck.reason!,
        limitCheck.depth,
        limitCheck.total
      );

      return null;
    }

    // Build task description
    const issues: string[] = [];

    // Failed checks
    const failedChecks = prStatus.checks.filter(c =>
      c.status === 'failure' || c.status === 'error'
    );
    if (failedChecks.length > 0) {
      issues.push(`Failed CI checks: ${failedChecks.map(c => c.name).join(', ')}`);
    }

    // Copilot blocking issues
    if (copilotAnalysis.blockingIssues.length > 0) {
      issues.push(`Copilot found ${copilotAnalysis.blockingIssues.length} blocking issue(s)`);
      copilotAnalysis.blockingIssues.forEach(issue => {
        issues.push(`  - ${issue.substring(0, 200)}`);
      });
    }

    // Human change requests
    const changeRequests = prStatus.reviews.filter(r =>
      r.state === 'CHANGES_REQUESTED' && !r.author.toLowerCase().includes('copilot')
    );
    if (changeRequests.length > 0) {
      issues.push(`Human reviewer(s) requested changes: ${changeRequests.map(r => r.author).join(', ')}`);
    }

    // Check if we've already created a followup for these exact issues
    const issueFingerprint = this.hashIssues(issues);
    
    if (this.taskQueue.hasFollowupFingerprint(prNumber, issueFingerprint)) {
      logger.info({
        category: 'pr-workflow',
        action: 'followup_already_exists',
        message: `Followup task already exists for these exact issues on PR #${prNumber}`,
        details: {
          prNumber,
          issueFingerprint,
          issuesCount: issues.length
        }
      });
      return null;
    }

    // Track fingerprint in database
    this.taskQueue.addFollowupFingerprint(prNumber, issueFingerprint);

    const taskDescription = `Fix issues found in PR #${prNumber}:\n\n${issues.join('\n')}`;

    logger.info({
      category: 'pr-workflow',
      action: 'create_followup_task',
      message: `Creating followup task for PR #${prNumber}`,
      details: {
        prNumber,
        parentTaskId: taskId,
        issuesCount: issues.length
      }
    });

    // Get original task
    const originalTask = this.taskQueue.getTask(taskId);
    if (!originalTask) {
      logger.error({
        category: 'pr-workflow',
        action: 'followup_task_error',
        message: `Original task ${taskId} not found`
      });
      return null;
    }

    // Create followup task
    const followupTask = this.taskQueue.createTask({
      title: `Fix PR #${prNumber} issues`,
      description: taskDescription,
      type: 'fix',
      priority: 8,
      acceptance_criteria: [
        `All CI checks pass`,
        `Address all Copilot blocking issues`,
        `Resolve human reviewer feedback`
      ],
      followup_for_pr: prNumber,
      pr_branch: prBranch,
      assigned_agent: originalTask.assigned_agent || 'backend-specialist'
    });

    // Update original task with followup link
    const followupTasks = originalTask.followup_tasks || [];
    followupTasks.push(followupTask.id);
    this.taskQueue.updateTask(originalTask.id, { followup_tasks: [...followupTasks] });

    // Update task PR status
    await this.updateTaskPRStatus(taskId, 'pending_review', `followup_created:${followupTask.id}`);

    return followupTask;
  }

  /**
   * Helper to sleep/delay execution
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    
    const retryablePatterns = [
      'temporarily unavailable',
      'rate limit',
      'timeout',
      'network error',
      'econnreset',
      '503 service unavailable',
      '502 bad gateway',
      'etimedout',
      'try again'
    ];
    
    return retryablePatterns.some(pattern => errorMsg.includes(pattern));
  }

  /**
   * Check if PR branch is behind base and auto-update if possible
   * Returns true if branch is up to date (or was successfully updated)
   */
  private async ensureBranchUpToDate(prNumber: number): Promise<{ 
    upToDate: boolean; 
    updated?: boolean; 
    error?: string 
  }> {
    try {
      // Check if PR is behind base branch
      const prData = await this.githubPR.getPR(prNumber);
      
      // If mergeable_state indicates branch is behind, try to update
      if (prData.mergeable_state === 'behind') {
        logger.info({
          category: 'pr-workflow',
          action: 'branch_behind_detected',
          message: `PR #${prNumber} branch is behind base, attempting auto-update`,
          details: { prNumber, mergeable_state: prData.mergeable_state }
        });

        // Use GitHub's update branch API (merges base into PR branch)
        await this.githubPR.updateBranch(prNumber);
        
        logger.info({
          category: 'pr-workflow',
          action: 'branch_updated',
          message: `Successfully updated PR #${prNumber} branch with latest base`,
          details: { prNumber }
        });
        
        return { upToDate: true, updated: true };
      }
      
      // Branch is already up to date
      return { upToDate: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      logger.warn({
        category: 'pr-workflow',
        action: 'branch_update_failed',
        message: `Failed to update PR #${prNumber} branch`,
        details: { prNumber, error: errorMsg }
      });
      
      // Check if it's a merge conflict
      if (errorMsg.toLowerCase().includes('conflict') || errorMsg.toLowerCase().includes('merge')) {
        return { upToDate: false, error: 'merge_conflicts' };
      }
      
      // Other error - don't block merge attempt
      return { upToDate: true, error: errorMsg };
    }
  }

  /**
   * Merge a PR with graceful degradation
   * Tries multiple merge strategies with retry logic
   */
  async mergePR(prNumber: number, taskId: string): Promise<boolean> {
    logger.info({
      category: 'pr-workflow',
      action: 'merging_pr_start',
      message: `Attempting to merge PR #${prNumber}`,
      details: { prNumber, taskId }
    });

    // STEP 1: Ensure branch is up to date with base
    const branchStatus = await this.ensureBranchUpToDate(prNumber);
    
    if (!branchStatus.upToDate) {
      // Branch has merge conflicts - create intervention task
      logger.error({
        category: 'pr-workflow',
        action: 'merge_blocked_by_conflicts',
        message: `PR #${prNumber} has merge conflicts, cannot auto-merge`,
        details: { prNumber, taskId, error: branchStatus.error }
      });
      
      await this.handleMergeFailure(prNumber, taskId, {
        squashError: `Branch has merge conflicts: ${branchStatus.error}`,
        rebaseError: 'Skipped - conflicts detected',
        mergeError: 'Skipped - conflicts detected'
      });
      
      return false;
    }
    
    if (branchStatus.updated) {
      logger.info({
        category: 'pr-workflow',
        action: 'branch_updated_before_merge',
        message: `PR #${prNumber} branch was updated, waiting for CI to complete`,
        details: { prNumber, taskId }
      });

      // Branch was updated - CI will re-run. When CI completes, the GitHubWebhookHandler
      // will receive a status webhook and attempt to retry the merge.
      return false;
    }

    // STEP 2: Proceed with merge strategies

    // Strategy 1: Squash merge (preferred - cleanest history)
    const squashResult = await this.tryMergeStrategy(prNumber, 'squash');
    if (squashResult.success) {
      await this.handleMergeSuccess(prNumber, taskId, 'squash');
      return true;
    }

    // If squash failed with retryable error, it already retried. 
    // Try next strategy.
    logger.warn({
      category: 'pr-workflow',
      action: 'merge_strategy_failed',
      message: `Squash merge failed for PR #${prNumber}, trying rebase`,
      details: { error: squashResult.error }
    });

    // Strategy 2: Rebase merge
    const rebaseResult = await this.tryMergeStrategy(prNumber, 'rebase');
    if (rebaseResult.success) {
      await this.handleMergeSuccess(prNumber, taskId, 'rebase');
      return true;
    }

    logger.warn({
      category: 'pr-workflow',
      action: 'merge_strategy_failed',
      message: `Rebase merge failed for PR #${prNumber}, trying merge commit`,
      details: { error: rebaseResult.error }
    });

    // Strategy 3: Merge commit (last resort - preserves all commits)
    const mergeResult = await this.tryMergeStrategy(prNumber, 'merge');
    if (mergeResult.success) {
      await this.handleMergeSuccess(prNumber, taskId, 'merge');
      return true;
    }

    // All strategies failed - create manual intervention task
    logger.error({
      category: 'pr-workflow',
      action: 'all_merge_strategies_failed',
      message: `All merge strategies failed for PR #${prNumber}`,
      details: {
        prNumber,
        taskId,
        squashError: squashResult.error,
        rebaseError: rebaseResult.error,
        mergeError: mergeResult.error
      }
    });

    await this.handleMergeFailure(prNumber, taskId, {
      squashError: squashResult.error,
      rebaseError: rebaseResult.error,
      mergeError: mergeResult.error
    });

    return false;
  }

  /**
   * Try a specific merge strategy with retry logic
   */
  private async tryMergeStrategy(
    prNumber: number,
    method: 'merge' | 'squash' | 'rebase',
    attempt: number = 0
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.githubPR.mergePR(prNumber, method);
      
      logger.info({
        category: 'pr-workflow',
        action: 'merge_strategy_success',
        message: `Successfully merged PR #${prNumber} using ${method}`,
        details: { prNumber, method, attempt }
      });
      
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Check if we should retry
      if (attempt < this.MERGE_RETRY_ATTEMPTS && this.isRetryableError(error)) {
        const delay = this.MERGE_RETRY_DELAYS[attempt] || 45000;
        
        logger.warn({
          category: 'pr-workflow',
          action: 'merge_retry_scheduled',
          message: `Retrying ${method} merge for PR #${prNumber} in ${delay}ms (attempt ${attempt + 1}/${this.MERGE_RETRY_ATTEMPTS})`,
          details: { prNumber, method, attempt: attempt + 1, delay, error: errorMsg }
        });
        
        await this.sleep(delay);
        return await this.tryMergeStrategy(prNumber, method, attempt + 1);
      }
      
      // Non-retryable error or max retries exceeded
      logger.error({
        category: 'pr-workflow',
        action: 'merge_strategy_failed',
        message: `${method} merge failed for PR #${prNumber}`,
        details: { prNumber, method, attempt, error: errorMsg }
      });
      
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Handle successful merge
   */
  private async handleMergeSuccess(
    prNumber: number,
    taskId: string,
    method: string
  ): Promise<void> {
    await this.updateTaskPRStatus(taskId, 'merged');
    
    // Clear fingerprints for this PR since it's merged
    this.taskQueue.clearFollowupFingerprints(prNumber);

    logger.info({
      category: 'pr-workflow',
      action: 'pr_merged',
      message: `Successfully merged PR #${prNumber} using ${method}`,
      details: { prNumber, taskId, method }
    });
  }

  /**
   * Handle merge failure - create manual intervention task
   */
  private async handleMergeFailure(
    prNumber: number,
    taskId: string,
    errors: { squashError?: string; rebaseError?: string; mergeError?: string }
  ): Promise<void> {
    const task = this.taskQueue.getTask(taskId);
    
    const manualMergeTask = this.taskQueue.createTask({
      title: `🚨 MANUAL MERGE REQUIRED: PR #${prNumber}`,
      description: `All automated merge strategies failed for PR #${prNumber}.

**PR:** ${task?.pr_url || `https://github.com/Jdubz/app-monitor/pull/${prNumber}`}
**Branch:** ${task?.pr_branch || 'unknown'}
**Original task:** ${taskId}

**What happened:**
All three merge strategies failed after retry attempts:

1. **Squash merge:** ${errors.squashError || 'failed'}
2. **Rebase merge:** ${errors.rebaseError || 'failed'}
3. **Merge commit:** ${errors.mergeError || 'failed'}

**Possible causes:**
- Merge conflicts that require manual resolution
- Branch protection rules preventing merge
- Required status checks not passing
- PR not approved by required reviewers
- Branch is behind the base branch and can't be rebased automatically

**Action required:**
1. Review the PR and identify the blocking issue
2. If merge conflicts: Resolve them manually
3. If status checks: Wait for them to pass or investigate failures
4. If approvals: Get required reviews
5. Once ready, merge manually via GitHub UI or CLI

**To merge manually:**
\`\`\`bash
gh pr merge ${prNumber} --squash  # Or --merge or --rebase
\`\`\``,
      type: 'manual-intervention',
      priority: 9, // High priority (below escalation)
      assigned_agent: 'human',
      followup_for_pr: prNumber,
      pr_branch: task?.pr_branch,
      acceptance_criteria: [
        `PR #${prNumber} is successfully merged`,
        `Blocking issue is identified and resolved`,
        `Any systemic merge issues are documented`
      ]
    });

    // Update original task
    await this.updateTaskPRStatus(taskId, 'pending_review', `manual_merge_required:${manualMergeTask.id}`);

    logger.error({
      category: 'pr-workflow',
      action: 'manual_merge_required',
      message: `Manual merge task created for PR #${prNumber}`,
      details: {
        prNumber,
        taskId,
        manualMergeTaskId: manualMergeTask.id,
        errors
      }
    });
  }

  /**
   * Update task PR status in database
   */
  private async updateTaskPRStatus(taskId: string, prStatus: TaskPRStatus, notes?: string): Promise<void> {
    const task = this.taskQueue.getTask(taskId);
    if (!task) {
      return;
    }

    // Use updatePRStatus for PR-specific fields
    const prUpdates: Partial<Task> = {
      pr_status: prStatus
    };

    if (prStatus === 'merged') {
      prUpdates.pr_merged_at = Date.now();
    }

    await this.taskQueue.updatePRStatus(taskId, prUpdates);

    // Update notes separately using updateTask (which now supports notes)
    // Note: updateTask is synchronous (better-sqlite3)
    if (notes) {
      const updatedNotes = task.notes ? `${task.notes}\n${notes}` : notes;
      const updated = this.taskQueue.updateTask(taskId, { notes: updatedNotes });
      if (!updated) {
        logger.warn({
          category: 'pr-workflow',
          action: 'notes_update_failed',
          message: `Failed to update notes for task ${taskId}`,
          details: { taskId }
        });
      }
    }

    logger.info({
      category: 'pr-workflow',
      action: 'task_pr_status_updated',
      message: `Updated PR status for task ${taskId}`,
      details: {
        taskId,
        prStatus,
        notes
      }
    });
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      enableAutoMerge: this.config.enableAutoMerge
    };
  }
}
