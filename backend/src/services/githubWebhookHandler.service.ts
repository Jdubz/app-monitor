/**
 * GitHub Webhook Handler Service
 * 
 * Processes incoming webhooks from GitHub for PR lifecycle management.
 * Handles PR events, check suites, and check runs to update task status,
 * create followup tasks, and trigger auto-merge when appropriate.
 */

import { logger } from '../utils/logger.js';
import type { TaskQueueService, Task } from './taskQueue.sqlite.js';
import type { PRWorkflowOrchestrator } from './prWorkflowOrchestrator.service.js';
import type { PRStatus, CopilotReviewAnalysis } from './githubPR.service.js';
import { ReviewCommentTracker } from './reviewCommentTracker.service.js';
import { TaskVerificationService } from './taskVerification.service.js';
import { PRConditionStateService } from './prConditionState.service.js';
import { getDatabase } from './database.js';

export interface GitHubPullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    state: string;
    html_url: string;
    user: {
      login: string;
      type: string;
    };
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
    };
    draft: boolean;
    merged: boolean;
    merged_at: string | null;
  };
  repository: {
    full_name: string;
  };
}

export interface GitHubPushPayload {
  ref: string;
  before: string;
  after: string;
  commits: Array<{
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
  }>;
  repository: {
    full_name: string;
  };
  pusher: {
    name: string;
  };
}

export interface GitHubCheckSuitePR {
  number: number;
}

export interface GitHubCheckSuitePayload {
  action: string;
  check_suite: {
    id: number;
    status: string;
    conclusion: string | null;
    pull_requests: GitHubCheckSuitePR[];
  };
  repository: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
}

export interface GitHubCheckRunPayload {
  action: string;
  check_run: {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    pull_requests: GitHubCheckSuitePR[];
  };
  repository: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
}

export interface GitHubPullRequestReviewPayload {
  action: 'submitted' | 'edited' | 'dismissed';
  review: {
    id: number;
    user: {
      login: string;
      type: string;
    };
    body: string;
    state: 'commented' | 'approved' | 'changes_requested';
    submitted_at: string;
  };
  pull_request: {
    number: number;
    title: string;
    head: {
      ref: string;
    };
  };
  repository: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
}

export interface AutoMergeBlockReason {
  reason: string;
  count: number;
}

export interface WebhookHandlerStats {
  pr_events_received: number;
  pr_review_events_received: number;
  push_events_received: number;
  task_ids_extracted: number;
  copilot_reviews_detected: number;
  errors: number;
  last_event_time: number;

  // PR Workflow Quality Gate Metrics
  auto_merge_attempts: number;
  auto_merge_successes: number;
  auto_merge_failures: number;
  auto_merge_blocks: AutoMergeBlockReason[];
  followup_tasks_created: number;
  task_verifications_run: number;
  task_verifications_passed: number;
  task_verifications_failed: number;
  review_comments_tracked: number;
  review_comments_resolved: number;
  orphaned_prs_adopted: number;

  // Time-to-merge tracking (milliseconds)
  merge_times: number[];  // Array of merge times for calculating average
  avg_time_to_merge_ms?: number;  // Calculated average
}

/**
 * Service for handling GitHub webhook events
 * Phase 2: Integrated with task queue
 */
export class GitHubWebhookHandler {
  private stats: WebhookHandlerStats = {
    pr_events_received: 0,
    pr_review_events_received: 0,
    push_events_received: 0,
    task_ids_extracted: 0,
    copilot_reviews_detected: 0,
    errors: 0,
    last_event_time: 0,

    // PR Workflow Quality Gate Metrics
    auto_merge_attempts: 0,
    auto_merge_successes: 0,
    auto_merge_failures: 0,
    auto_merge_blocks: [],
    followup_tasks_created: 0,
    task_verifications_run: 0,
    task_verifications_passed: 0,
    task_verifications_failed: 0,
    review_comments_tracked: 0,
    review_comments_resolved: 0,
    orphaned_prs_adopted: 0,

    // Time-to-merge tracking
    merge_times: [],
    avg_time_to_merge_ms: undefined
  };

  private reviewCommentTracker: ReviewCommentTracker;
  private taskVerification: TaskVerificationService;
  private prConditionState: PRConditionStateService;

  constructor(
    private readonly taskQueue?: TaskQueueService,
    private readonly prOrchestrator?: PRWorkflowOrchestrator
  ) {
    this.reviewCommentTracker = new ReviewCommentTracker(getDatabase());
    this.taskVerification = new TaskVerificationService();
    this.prConditionState = taskQueue ? new PRConditionStateService(taskQueue) : null!;
  }
  /**
   * Extract task ID from PR branch name or title
   * Checks branch name first (more reliable), then falls back to title
   * 
   * Supported formats:
   * Branch:
   * - "task-implementation-abc123def456" (standard bot branch pattern)
   * - "fix/task-abc123"
   * - "feature/task-abc123"
   * 
   * Title:
   * - "Task: task-abc123"
   * - "[task-abc123]"
   * - "task-abc123:"
   * - "(task-abc123)"
   */
  private extractTaskIdFromBranchOrTitle(branchName: string, title: string): string | null {
    // PRIORITY 1: Check branch name first (most reliable)
    // Pattern: task-{type}-{uuid} (standard bot pattern)
    let match = branchName.match(/task-(implementation|investigation|bugfix|feature|refactor|docs)-([a-f0-9-]{36})/i);
    if (match) return `task-${match[1]}-${match[2]}`;
    
    // Pattern: task-{uuid} (simplified)
    match = branchName.match(/task-([a-f0-9-]{36})\b/i);
    if (match) return `task-${match[1]}`;
    
    // Pattern: any branch with task-{type}-{shortid}
    match = branchName.match(/(task-[a-z]+-[a-f0-9-]{8,})/i);
    if (match) return match[1];

    // PRIORITY 2: Fall back to title patterns
    // Pattern 1: "Task: task-xyz" or "Task task-xyz"
    match = title.match(/Task[:\s]+([a-f0-9-]{8,})/i);
    if (match) return match[1];

    // Pattern 2: "[task-xyz]"
    match = title.match(/\[([a-f0-9-]{8,})\]/);
    if (match) return match[1];

    // Pattern 3: "task-xyz:" at start
    match = title.match(/^([a-f0-9-]{8,}):/);
    if (match) return match[1];

    // Pattern 4: "(task-xyz)"
    match = title.match(/\(([a-f0-9-]{8,})\)/);
    if (match) return match[1];

    // Pattern 5: Just "task-xyz" as a word (UUID format)
    match = title.match(/\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/);
    if (match) return match[1];

    return null;
  }

  /**
   * Handle pull request webhook events
   */
  async handlePullRequest(payload: GitHubPullRequestPayload): Promise<void> {
    this.stats.pr_events_received++;
    this.stats.last_event_time = Date.now();

    const { action, pull_request, repository } = payload;
    const prNumber = pull_request.number;
    const branchName = pull_request.head.ref;
    const taskId = this.extractTaskIdFromBranchOrTitle(branchName, pull_request.title);

    if (taskId) {
      this.stats.task_ids_extracted++;
    }

    logger.info({
      category: 'api',
      action: 'pr_event_received',
      message: `PR #${prNumber} ${action}${taskId ? ` (Task: ${taskId})` : ''}`,
      details: {
        pr_number: prNumber,
        task_id: taskId,
        action,
        title: pull_request.title,
        branch: branchName,
        user: pull_request.user.login,
        repo: repository.full_name,
        draft: pull_request.draft,
        merged: pull_request.merged
      }
    });

    // Find associated task(s)
    let tasks: Task[] = [];
    
    if (this.taskQueue) {
      // Try to find by PR number first
      tasks = await this.taskQueue.findByPRNumber(prNumber);
      
      // If not found and we have a task ID from title, try that
      if (tasks.length === 0 && taskId) {
        const task = await this.taskQueue.findByTaskId(taskId);
        if (task) {
          tasks = [task];
        }
      }
    }

    if (tasks.length === 0) {
      // PR is orphaned - check if it's a system-created PR that should be auto-adopted
      if (this.prOrchestrator) {
        const prMonitor = this.prOrchestrator.getPRMonitor();
        const detection = prMonitor.detectSystemCreatedPR(
          branchName,
          pull_request.user.login,
          pull_request.title
        );

        if (detection.isSystemPR) {
          // System PR is orphaned - auto-adopt it
          logger.warn({
            category: 'api',
            action: 'system_pr_orphaned',
            message: `System PR #${prNumber} is orphaned - auto-adopting`,
            details: {
              pr_number: prNumber,
              reason: detection.reason,
              extracted_task_id: detection.extractedTaskId
            }
          });

          const adoptedTask = await prMonitor.adoptOrphanedSystemPR(
            prNumber,
            {
              title: pull_request.title,
              branch: branchName,
              author: pull_request.user.login,
              description: (pull_request as { body?: string }).body
            },
            detection.extractedTaskId
          );

          if (adoptedTask) {
            // Successfully adopted - continue processing with adopted task
            tasks = [adoptedTask];
            this.stats.orphaned_prs_adopted++;

            logger.info({
              category: 'api',
              action: 'system_pr_adopted',
              message: `Successfully adopted system PR #${prNumber} as task ${adoptedTask.id}`,
              details: {
                pr_number: prNumber,
                task_id: adoptedTask.id
              }
            });
          } else {
            logger.error({
              category: 'api',
              action: 'pr_adoption_failed',
              message: `Failed to adopt orphaned system PR #${prNumber}`,
              details: { pr_number: prNumber }
            });
            return;
          }
        } else {
          // User-created PR - log but don't auto-adopt
          logger.info({
            category: 'api',
            action: 'user_pr_no_task',
            message: `User PR #${prNumber} has no task (manual tracking available via /api/dev-bots/pr/track)`,
            details: {
              pr_number: prNumber,
              task_id: taskId,
              detection_reason: detection.reason
            }
          });
          return;
        }
      } else {
        // Orchestrator not available
        logger.info({
          category: 'api',
          action: 'pr_no_task_found',
          message: `No task found for PR #${prNumber}${taskId ? ` (Task ID: ${taskId})` : ''}`,
          details: { pr_number: prNumber, task_id: taskId }
        });
        return;
      }
    }

    logger.info({
      category: 'api',
      action: 'pr_tasks_found',
      message: `Found ${tasks.length} task(s) for PR #${prNumber}`,
      details: { 
        pr_number: prNumber, 
        task_count: tasks.length,
        task_ids: tasks.map(t => t.id)
      }
    });

    // Handle the PR event
    try {
      switch (action) {
        case 'opened':
          await this.handlePROpened(prNumber, pull_request, tasks);
          break;

        case 'synchronize':
          await this.handlePRSynchronize(prNumber, pull_request, tasks);
          break;

        case 'closed':
          if (pull_request.merged) {
            await this.handlePRMerged(prNumber, pull_request, tasks);
          } else {
            await this.handlePRClosed(prNumber, pull_request, tasks);
          }
          break;

        case 'reopened':
          await this.handlePRReopened(prNumber, pull_request, tasks);
          break;

        case 'ready_for_review':
          await this.handlePRReadyForReview(prNumber, pull_request, tasks);
          break;

        default:
          logger.info({
            category: 'api',
            action: 'pr_event_ignored',
            message: `Ignoring PR action: ${action}`,
            details: { pr_number: prNumber, action }
          });
      }
    } catch (error) {
      this.stats.errors++;
      logger.error({
        category: 'api',
        action: 'pr_event_error',
        message: `Error handling PR #${prNumber} ${action}`,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Handle push webhook events
   * When base branches are updated, re-evaluate branch_updated condition for all tracked PRs
   */
  async handlePush(payload: GitHubPushPayload): Promise<void> {
    this.stats.push_events_received++;
    this.stats.last_event_time = Date.now();

    const { ref, commits, repository, pusher } = payload;
    const branch = ref.replace('refs/heads/', '');

    logger.info({
      category: 'api',
      action: 'push_event_received',
      message: `Push to ${branch} by ${pusher.name}`,
      details: {
        branch,
        commit_count: commits.length,
        repo: repository.full_name,
        head_commit: commits[0]?.message
      }
    });

    // Only trigger condition evaluation for base branches (most PRs target these)
    const baseBranches = ['main', 'master', 'staging', 'develop', 'production'];
    if (!baseBranches.includes(branch)) {
      logger.debug({
        category: 'pr-workflow',
        action: 'push_ignored_non_base_branch',
        message: `Push to ${branch} ignored - not a base branch`,
        details: { branch }
      });
      return;
    }

    if (!this.prConditionState) {
      logger.warn({
        category: 'pr-workflow',
        action: 'push_handler_skipped',
        message: 'PR condition state service not available'
      });
      return;
    }

    try {
      // Get all tracked PRs
      const trackedPRs = await this.prConditionState.getAllTrackedPRNumbers();

      if (trackedPRs.length === 0) {
        logger.debug({
          category: 'pr-workflow',
          action: 'push_no_tracked_prs',
          message: `No tracked PRs to evaluate after push to ${branch}`
        });
        return;
      }

      logger.info({
        category: 'pr-workflow',
        action: 'push_evaluating_prs',
        message: `Push to ${branch} - evaluating ${trackedPRs.length} tracked PRs`,
        details: {
          branch,
          pr_count: trackedPRs.length,
          pr_numbers: trackedPRs
        }
      });

      // Trigger condition evaluation for all tracked PRs
      // This will check if PRs need to merge the base branch
      for (const prNumber of trackedPRs) {
        try {
          await this.prConditionState.evaluateConditions(prNumber, 'push');
        } catch (error) {
          logger.error({
            category: 'pr-workflow',
            action: 'push_evaluation_failed',
            message: `Failed to evaluate PR #${prNumber} after push to ${branch}`,
            error,
            details: { prNumber, branch }
          });
          // Continue with other PRs
        }
      }

      logger.info({
        category: 'pr-workflow',
        action: 'push_evaluation_completed',
        message: `Completed evaluating ${trackedPRs.length} PRs after push to ${branch}`,
        details: { branch, pr_count: trackedPRs.length }
      });
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'push_handler_failed',
        message: `Failed to handle push event for ${branch}`,
        error,
        details: { branch }
      });
    }
  }

  /**
   * Handle check_suite webhook events
   * Triggers followup task creation and auto-merge when checks complete
   */
  async handleCheckSuite(payload: GitHubCheckSuitePayload): Promise<void> {
    this.stats.last_event_time = Date.now();
    
    const { action, check_suite, repository } = payload;
    
    // Only process 'completed' check suites
    if (action !== 'completed') {
      logger.debug({
        category: 'api',
        action: 'check_suite_ignored',
        message: `Check suite action '${action}' ignored (only processing 'completed')`,
        details: { action, conclusion: check_suite?.conclusion }
      });
      return;
    }

    const pullRequests = check_suite?.pull_requests || [];
    if (pullRequests.length === 0) {
      logger.debug({
        category: 'api',
        action: 'check_suite_no_prs',
        message: 'Check suite not associated with any PRs'
      });
      return;
    }

    logger.info({
      category: 'api',
      action: 'check_suite_completed',
      message: `Check suite completed with ${check_suite?.conclusion}`,
      details: {
        conclusion: check_suite.conclusion,
        pr_count: pullRequests.length,
        pr_numbers: pullRequests.map((pr) => pr.number),
        repository: repository.full_name
      }
    });

    // Process each PR
    for (const pr of pullRequests) {
      await this.processCheckSuiteForPR(pr.number, check_suite, repository);
    }
  }

  /**
   * Handle check_run webhook events
   * Similar to check_suite but for individual check runs
   */
  async handleCheckRun(payload: GitHubCheckRunPayload): Promise<void> {
    this.stats.last_event_time = Date.now();
    
    const { action, check_run, repository } = payload;
    
    // Only process 'completed' check runs
    if (action !== 'completed') {
      logger.debug({
        category: 'api',
        action: 'check_run_ignored',
        message: `Check run action '${action}' ignored (only processing 'completed')`,
        details: { action, conclusion: check_run.conclusion }
      });
      return;
    }

    const pullRequests = check_run.pull_requests || [];
    if (pullRequests.length === 0) {
      logger.debug({
        category: 'api',
        action: 'check_run_no_prs',
        message: 'Check run not associated with any PRs'
      });
      return;
    }

    logger.info({
      category: 'api',
      action: 'check_run_completed',
      message: `Check run '${check_run.name}' completed with ${check_run.conclusion}`,
      details: {
        name: check_run.name,
        conclusion: check_run.conclusion,
        pr_count: pullRequests.length,
        pr_numbers: pullRequests.map((pr) => pr.number),
        repository: repository.full_name
      }
    });

    // Process each PR - reuse check suite logic since both trigger same workflow
    for (const pr of pullRequests) {
      await this.processCheckSuiteForPR(pr.number, check_run, repository);
    }
  }

  /**
   * Handle pull_request_review webhook events
   * Detects when Copilot or humans submit reviews
   */
  async handlePullRequestReview(payload: GitHubPullRequestReviewPayload): Promise<void> {
    this.stats.pr_review_events_received++;
    this.stats.last_event_time = Date.now();
    
    const { action, review, pull_request, repository } = payload;
    
    // Only process 'submitted' reviews
    if (action !== 'submitted') {
      logger.debug({
        category: 'api',
        action: 'review_ignored',
        message: `Review action '${action}' ignored (only processing 'submitted')`,
        details: { action, pr_number: pull_request.number }
      });
      return;
    }

    const prNumber = pull_request.number;
    const reviewer = review.user.login;
    const isCopilot = reviewer.toLowerCase().includes('copilot') || 
                      review.user.type === 'Bot';

    if (isCopilot) {
      this.stats.copilot_reviews_detected++;
    }

    logger.info({
      category: 'api',
      action: 'review_submitted',
      message: `${isCopilot ? 'Copilot' : 'Human'} review submitted for PR #${prNumber}`,
      details: {
        pr_number: prNumber,
        reviewer,
        review_state: review.state,
        is_copilot: isCopilot,
        repository: repository.full_name
      }
    });

    if (!this.taskQueue || !this.prOrchestrator) {
      logger.warn({
        category: 'api',
        action: 'review_handler_not_ready',
        message: 'Task queue or PR orchestrator not available'
      });
      return;
    }

    // Find associated tasks
    const tasks = await this.taskQueue.findByPRNumber(prNumber);
    if (tasks.length === 0) {
      logger.debug({
        category: 'api',
        action: 'review_no_tasks',
        message: `No tasks found for PR #${prNumber}`,
        details: { pr_number: prNumber }
      });
      return;
    }

    try {
      const prMonitor = this.prOrchestrator.getPRMonitor();
      const githubPR = this.prOrchestrator.getGitHubPRService();
      
      // Get current PR status and analysis
      const prStatus = await githubPR.getPRStatus(
        prNumber, 
        repository.owner.login, 
        repository.name
      );
      const copilotAnalysis = await githubPR.getCopilotReviewAnalysis(
        prNumber,
        repository.owner.login,
        repository.name
      );

      // Auto-update branch if PR is behind base (before evaluating conditions)
      if (prStatus.mergeable_state === 'behind' && prStatus.state === 'OPEN') {
        try {
          logger.info({
            category: 'pr-workflow',
            action: 'auto_update_branch_behind',
            message: `PR #${prNumber} is behind base, attempting automatic branch update`,
            details: { pr_number: prNumber, mergeable_state: prStatus.mergeable_state }
          });
          
          await githubPR.updateBranch(prNumber, repository.owner.login, repository.name);
          
          logger.info({
            category: 'pr-workflow',
            action: 'auto_update_branch_success',
            message: `Successfully updated PR #${prNumber} branch with latest base`,
            details: { pr_number: prNumber }
          });
        } catch (error) {
          logger.warn({
            category: 'pr-workflow',
            action: 'auto_update_branch_failed',
            message: `Failed to auto-update PR #${prNumber} branch`,
            error,
            details: { pr_number: prNumber }
          });
        }
      }

      // Evaluate PR conditions for review-related issues (continuous self-healing)
      try {
        await this.prConditionState.evaluateConditions(prNumber, 'pull_request_review');
      } catch (error) {
        logger.warn({
          category: 'pr-workflow',
          action: 'condition_evaluation_failed',
          message: `Failed to evaluate PR conditions for PR #${prNumber}`,
          error,
          details: { pr_number: prNumber }
        });
      }

      // Store review comments for tracking (only Copilot comments)
      if (isCopilot && prStatus.comments.length > 0) {
        const copilotComments = prStatus.comments.filter(c =>
          c.author.toLowerCase().includes('copilot') || c.author.toLowerCase().includes('bot')
        );

        let storedCount = 0;
        for (const comment of copilotComments) {
          const stored = this.reviewCommentTracker.storeComment({
            pr_number: prNumber,
            comment_id: comment.id,
            file_path: comment.path || undefined,
            line_number: comment.line || undefined,
            body: comment.body,
            fingerprint: '', // Generated by storeComment
            severity: 'info', // Classified by storeComment
            created_at: new Date(comment.createdAt).getTime(),
            reviewer: comment.author,
            is_copilot: true
          });
          if (stored) {
            storedCount++;
            this.stats.review_comments_tracked++;
          }
        }

        logger.info({
          category: 'pr-workflow',
          action: 'comments_stored',
          message: `Stored ${storedCount}/${copilotComments.length} Copilot comments for PR #${prNumber}`,
          details: { pr_number: prNumber, stored: storedCount, total: copilotComments.length }
        });
      }

      // Update task with review status
      for (const task of tasks) {
        const reviewStatus = review.state === 'changes_requested' ? 'changes_requested' :
                            review.state === 'approved' ? 'approved' :
                            'commented';
        
        await this.taskQueue.updateTask(task.id, {
          pr_review_status: reviewStatus,
          notes: `${isCopilot ? 'Copilot' : reviewer} review: ${review.state}`
        });
      }

      // If Copilot review completed, check if ready to merge
      if (isCopilot) {
        logger.info({
          category: 'pr-workflow',
          action: 'copilot_review_completed',
          message: `Copilot review completed for PR #${prNumber}`,
          details: {
            pr_number: prNumber,
            review_state: review.state,
            severity: copilotAnalysis.severity,
            blocking_issues: copilotAnalysis.blockingIssues.length
          }
        });

        // Check if we need followup task or can auto-merge
        const task = tasks[0];
        if (prMonitor.shouldCreateFollowup(prNumber, prStatus, copilotAnalysis, task)) {
          const prBranch = task.pr_branch || pull_request.head.ref;

          const followupTask = await prMonitor.createFollowupTask(
            prNumber,
            task.id,
            prBranch,
            prStatus,
            copilotAnalysis
          );

          if (followupTask) {
            logger.info({
              category: 'pr-workflow',
              action: 'followup_created_from_copilot_review',
              message: `Created followup task ${followupTask.id} for Copilot findings`,
              details: {
                pr_number: prNumber,
                followup_id: followupTask.id,
                parent_task: task.id,
                severity: copilotAnalysis.severity
              }
            });
          }
        } else {
          // Copilot review passed, check if all other gates passed
          const canMerge = githubPR.canAutoMerge(prStatus, copilotAnalysis);
          
          if (canMerge.canMerge) {
            const task = tasks[0];
            const merged = await prMonitor.mergePR(prNumber, task.id);
            
            if (merged) {
              logger.info({
                category: 'pr-workflow',
                action: 'pr_auto_merged_after_copilot_review',
                message: `Auto-merged PR #${prNumber} after Copilot approval`,
                details: { pr_number: prNumber, task_id: task.id }
              });
            }
          } else {
            logger.info({
              category: 'pr-workflow',
              action: 'merge_blocked_after_copilot_review',
              message: `Cannot auto-merge PR #${prNumber}: ${canMerge.reason}`,
              details: { pr_number: prNumber, reason: canMerge.reason }
            });
          }
        }
      }
    } catch (error) {
      this.stats.errors++;
      logger.error({
        category: 'pr-workflow',
        action: 'review_processing_error',
        message: `Error processing review for PR #${prNumber}`,
        error,
        details: { pr_number: prNumber, repository: repository.full_name }
      });
    }
  }

  /**
   * Process check suite completion for a specific PR
   */
  private async processCheckSuiteForPR(
    prNumber: number,
    checkSuite: { conclusion: string | null },
    repository: { owner: { login: string }; name: string; full_name: string }
  ): Promise<void> {
    if (!this.taskQueue || !this.prOrchestrator) {
      logger.warn({
        category: 'api',
        action: 'check_suite_handler_not_ready',
        message: 'Task queue or PR orchestrator not available'
      });
      return;
    }

    // Find associated tasks
    const tasks = await this.taskQueue.findByPRNumber(prNumber);
    if (tasks.length === 0) {
      logger.debug({
        category: 'api',
        action: 'check_suite_no_tasks',
        message: `No tasks found for PR #${prNumber}`,
        details: { pr_number: prNumber }
      });
      return;
    }

    const conclusion = checkSuite.conclusion;
    const owner = repository.owner.login;
    const repo = repository.name;
    
    logger.info({
      category: 'pr-workflow',
      action: 'check_suite_processed',
      message: `Processing check suite ${conclusion} for PR #${prNumber}`,
      details: {
        pr_number: prNumber,
        conclusion,
        task_ids: tasks.map(t => t.id),
        repository: repository.full_name
      }
    });

    try {
      const prMonitor = this.prOrchestrator.getPRMonitor();
      const githubPR = this.prOrchestrator.getGitHubPRService();
      
      // Get PR status and Copilot analysis
      const prStatus = await githubPR.getPRStatus(prNumber, owner, repo);
      const copilotAnalysis = await githubPR.getCopilotReviewAnalysis(prNumber, owner, repo);

      // Auto-update branch if PR is behind base (before evaluating conditions)
      if (prStatus.mergeable_state === 'behind' && prStatus.state === 'OPEN') {
        try {
          logger.info({
            category: 'pr-workflow',
            action: 'auto_update_branch_behind',
            message: `PR #${prNumber} is behind base, attempting automatic branch update`,
            details: { pr_number: prNumber, mergeable_state: prStatus.mergeable_state }
          });
          
          await githubPR.updateBranch(prNumber, owner, repo);
          
          logger.info({
            category: 'pr-workflow',
            action: 'auto_update_branch_success',
            message: `Successfully updated PR #${prNumber} branch with latest base`,
            details: { pr_number: prNumber }
          });
        } catch (error) {
          logger.warn({
            category: 'pr-workflow',
            action: 'auto_update_branch_failed',
            message: `Failed to auto-update PR #${prNumber} branch`,
            error,
            details: { pr_number: prNumber }
          });
          // Continue with normal flow - condition evaluation will create followup task if needed
        }
      }

      // Evaluate PR conditions and spawn fix tasks if needed (continuous self-healing)
      try {
        await this.prConditionState.evaluateConditions(prNumber, 'check_suite');
      } catch (error) {
        logger.warn({
          category: 'pr-workflow',
          action: 'condition_evaluation_failed',
          message: `Failed to evaluate PR conditions for PR #${prNumber}`,
          error,
          details: { pr_number: prNumber }
        });
      }

      // Run task verification when checks pass successfully
      if (conclusion === 'success' && tasks.length > 0) {
        const task = tasks[0];
        try {
          logger.info({
            category: 'pr-workflow',
            action: 'verification_started',
            message: `Running task verification for PR #${prNumber}`,
            details: { pr_number: prNumber, task_id: task.id }
          });

          const verificationResult = await this.taskVerification.verifyTask(
            task,
            '/home/jdubz/Development/app-monitor', // workspace path
            task.output || ''
          );

          // Store verification results in task
          await this.taskQueue.updateTask(task.id, {
            verification_passed: verificationResult.passed,
            verification_results: JSON.stringify(verificationResult),
            verification_timestamp: Date.now()
          });

          // Track verification metrics
          this.stats.task_verifications_run++;
          if (verificationResult.passed) {
            this.stats.task_verifications_passed++;
          } else {
            this.stats.task_verifications_failed++;
          }

          logger.info({
            category: 'pr-workflow',
            action: 'verification_completed',
            message: `Task verification ${verificationResult.passed ? 'PASSED' : 'FAILED'} for PR #${prNumber}`,
            details: {
              pr_number: prNumber,
              task_id: task.id,
              passed: verificationResult.passed,
              overall_score: verificationResult.overallScore,
              acceptance_criteria_met: verificationResult.acceptanceCriteria.percentMet
            }
          });
        } catch (error) {
          logger.warn({
            category: 'pr-workflow',
            action: 'verification_failed',
            message: `Task verification failed for PR #${prNumber}`,
            error,
            details: { pr_number: prNumber, task_id: task.id }
          });
        }
      }

      // Check if we should create a followup task
      const task = tasks[0]; // Use first matching task
      if (prMonitor.shouldCreateFollowup(prNumber, prStatus, copilotAnalysis, task)) {
        // Determine and track specific block reasons
        const blockReasons = this.determineBlockReasons(prNumber, prStatus, copilotAnalysis, task);
        blockReasons.forEach(reason => this.trackAutoMergeBlock(reason));

        // Get PR branch from status
        const prBranch = task.pr_branch || `pr-${prNumber}`;

        const followupTask = await prMonitor.createFollowupTask(
          prNumber,
          task.id,
          prBranch,
          prStatus,
          copilotAnalysis
        );

        if (followupTask) {
          this.stats.followup_tasks_created++;

          logger.info({
            category: 'pr-workflow',
            action: 'followup_task_created_from_check_suite',
            message: `Created followup task ${followupTask.id} for PR #${prNumber}`,
            details: {
              pr_number: prNumber,
              task_id: followupTask.id,
              parent_task: task.id,
              block_reasons: blockReasons
            }
          });
        }
      } else if (conclusion === 'success') {
        // All checks passed - try auto-merge if enabled
        const task = tasks[0];
        this.stats.auto_merge_attempts++;
        const merged = await prMonitor.mergePR(prNumber, task.id);

        if (merged) {
          // Track merge success with time-to-merge
          const prCreatedAt = task.created_at || Date.now();
          this.trackMergeSuccess(prCreatedAt);

          logger.info({
            category: 'pr-workflow',
            action: 'pr_auto_merged_from_check_suite',
            message: `Auto-merged PR #${prNumber} after checks passed`,
            details: { pr_number: prNumber, task_id: task.id }
          });
        } else {
          this.stats.auto_merge_failures++;
          logger.info({
            category: 'pr-workflow',
            action: 'pr_auto_merge_failed',
            message: `Auto-merge failed for PR #${prNumber}`,
            details: { pr_number: prNumber, task_id: task.id }
          });
        }
      }
    } catch (error) {
      logger.error({
        category: 'pr-workflow',
        action: 'check_suite_processing_error',
        message: `Error processing check suite for PR #${prNumber}`,
        error,
        details: { pr_number: prNumber, repository: repository?.full_name }
      });
    }
  }

  /**
   * Track auto-merge block reason
   */
  private trackAutoMergeBlock(reason: string): void {
    const existing = this.stats.auto_merge_blocks.find(b => b.reason === reason);
    if (existing) {
      existing.count++;
    } else {
      this.stats.auto_merge_blocks.push({ reason, count: 1 });
    }
  }

  /**
   * Determine and log the specific reason(s) why auto-merge was blocked
   */
  private determineBlockReasons(
    prNumber: number,
    prStatus: PRStatus,
    copilotAnalysis: CopilotReviewAnalysis,
    task?: Task
  ): string[] {
    const reasons: string[] = [];

    // Check for failed checks
    const hasFailedChecks = prStatus.checks.some(c =>
      c.status === 'failure' || c.status === 'error'
    );
    if (hasFailedChecks) {
      reasons.push('Failed CI checks');
    }

    // Check for blocking Copilot issues
    if (copilotAnalysis.severity === 'high' || copilotAnalysis.severity === 'medium') {
      reasons.push(`Copilot ${copilotAnalysis.severity} severity issues`);
    }

    // Check for human change requests
    const hasChangeRequests = prStatus.reviews.some(r =>
      r.state === 'CHANGES_REQUESTED' && !r.author.toLowerCase().includes('copilot')
    );
    if (hasChangeRequests) {
      reasons.push('Human change requests');
    }

    // Check for merge conflicts
    if (prStatus.mergeable === 'CONFLICTING') {
      reasons.push('Merge conflicts');
    }

    // Check for unresolved blocking comments
    const resolutionSummary = this.reviewCommentTracker.getResolutionSummary(prNumber);
    if (resolutionSummary.unresolvedBlocking > 0) {
      reasons.push(`${resolutionSummary.unresolvedBlocking} unresolved blocking comments`);
    }

    // Check for failed task verification
    if (task && task.verification_passed === false) {
      reasons.push('Failed task verification');
    }

    return reasons;
  }

  /**
   * Track successful merge with time-to-merge
   */
  private trackMergeSuccess(prCreatedAt: number): void {
    this.stats.auto_merge_successes++;
    const timeToMerge = Date.now() - prCreatedAt;
    this.stats.merge_times.push(timeToMerge);

    // Keep only last 100 merge times for performance
    if (this.stats.merge_times.length > 100) {
      this.stats.merge_times.shift();
    }
  }

  /**
   * Get webhook handler statistics with calculated metrics
   */
  getStats(): WebhookHandlerStats {
    const stats = { ...this.stats };

    // Calculate average time-to-merge
    if (stats.merge_times.length > 0) {
      const sum = stats.merge_times.reduce((acc, time) => acc + time, 0);
      stats.avg_time_to_merge_ms = Math.round(sum / stats.merge_times.length);
    }

    return stats;
  }

  // ==========================================================================
  // PR Event Handlers
  // ==========================================================================

  private async handlePROpened(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_opened',
      message: `PR #${prNumber} opened - updating ${tasks.length} task(s)`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_number: prNumber,
        pr_url: pr.html_url,
        pr_branch: pr.head.ref,
        pr_status: pr.draft ? 'creating' : 'pending_checks',
        pr_created_at: Date.now()
      });
    }
  }

  private async handlePRSynchronize(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_synchronized',
      message: `PR #${prNumber} updated with new commits`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    // Detect resolved comments (comments that no longer exist after sync)
    if (this.prOrchestrator) {
      try {
        const githubPR = this.prOrchestrator.getGitHubPRService();
        const prStatus = await githubPR.getPRStatus(prNumber);

        const currentCommentIds = prStatus.comments.map(c => c.id);
        const resolvedFingerprints = this.reviewCommentTracker.detectResolvedComments(
          prNumber,
          currentCommentIds
        );

        if (resolvedFingerprints.length > 0) {
          // Track resolved comments
          this.stats.review_comments_resolved += resolvedFingerprints.length;

          logger.info({
            category: 'pr-workflow',
            action: 'comments_resolved_detected',
            message: `Detected ${resolvedFingerprints.length} resolved comments for PR #${prNumber}`,
            details: { pr_number: prNumber, resolved_count: resolvedFingerprints.length }
          });

          // Get updated resolution summary
          const summary = this.reviewCommentTracker.getResolutionSummary(prNumber);
          logger.info({
            category: 'pr-workflow',
            action: 'comment_resolution_summary',
            message: `PR #${prNumber} comment status: ${summary.unresolved} unresolved (${summary.unresolvedBlocking} blocking)`,
            details: { pr_number: prNumber, ...summary }
          });
        }
      } catch (error) {
        logger.warn({
          category: 'pr-workflow',
          action: 'comment_resolution_detection_failed',
          message: `Failed to detect resolved comments for PR #${prNumber}`,
          error
        });
      }
    }

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_status: 'pending_checks',
        pr_checks_status: 'pending'
      });
    }

    // Evaluate PR conditions after code changes (continuous self-healing)
    try {
      await this.prConditionState.evaluateConditions(prNumber, 'pull_request_synchronize');
    } catch (error) {
      logger.warn({
        category: 'pr-workflow',
        action: 'condition_evaluation_failed',
        message: `Failed to evaluate PR conditions for PR #${prNumber}`,
        error,
        details: { pr_number: prNumber }
      });
    }
  }

  private async handlePRMerged(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_merged',
      message: `PR #${prNumber} merged - marking ${tasks.length} task(s) complete`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_status: 'merged',
        pr_merged_at: Date.now()
      });

      // Mark task as completed if not already
      if (task.status !== 'completed') {
        const completeStmt = (this.taskQueue as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db.prepare(`
          UPDATE tasks
          SET status = 'completed',
              completed_at = ?
          WHERE id = ?
        `);
        completeStmt.run(Date.now(), task.id);
      }
    }

    // Clean up PR condition state
    if (this.prConditionState) {
      await this.prConditionState.deletePRConditionState(prNumber);
    }
  }

  private async handlePRClosed(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_closed',
      message: `PR #${prNumber} closed without merging`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_status: 'closed'
      });
    }

    // Clean up PR condition state
    if (this.prConditionState) {
      await this.prConditionState.deletePRConditionState(prNumber);
    }
  }

  private async handlePRReopened(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_reopened',
      message: `PR #${prNumber} reopened`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_status: 'pending_checks'
      });
    }
  }

  private async handlePRReadyForReview(
    prNumber: number,
    pr: GitHubPullRequestPayload['pull_request'],
    tasks: Task[]
  ): Promise<void> {
    logger.info({
      category: 'api',
      action: 'pr_ready_for_review',
      message: `PR #${prNumber} marked ready for review`,
      details: { pr_number: prNumber, task_count: tasks.length }
    });

    if (!this.taskQueue) return;

    for (const task of tasks) {
      await this.taskQueue.updatePRStatus(task.id, {
        pr_status: 'pending_review'
      });
    }
  }
}
