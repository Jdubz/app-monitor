/**
 * GitHub Webhook Handler Service
 * 
 * Processes incoming webhooks from GitHub
 * Phase 1: Basic event logging, task ID extraction from PR titles
 * Phase 2: Integration with PR monitoring and task queue (TODO)
 */

import { logger } from '../utils/logger.js';

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

export interface WebhookHandlerStats {
  pr_events_received: number;
  push_events_received: number;
  task_ids_extracted: number;
  errors: number;
  last_event_time: number;
}

/**
 * Service for handling GitHub webhook events
 * Phase 1: Logging and event structure with task ID extraction
 */
export class GitHubWebhookHandler {
  private stats: WebhookHandlerStats = {
    pr_events_received: 0,
    push_events_received: 0,
    task_ids_extracted: 0,
    errors: 0,
    last_event_time: 0
  };

  /**
   * Extract task ID from PR title
   * Looks for patterns like:
   * - "Task: task-abc123"
   * - "[task-abc123]"
   * - "task-abc123:"
   * - "(task-abc123)"
   */
  private extractTaskIdFromTitle(title: string): string | null {
    // Pattern 1: "Task: task-xyz" or "Task task-xyz"
    let match = title.match(/Task[:\s]+([a-f0-9-]{8,})/i);
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

    // Pattern 5: Just "task-xyz" as a word
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
    const taskId = this.extractTaskIdFromTitle(pull_request.title);

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
        user: pull_request.user.login,
        branch: pull_request.head.ref,
        repo: repository.full_name,
        draft: pull_request.draft,
        merged: pull_request.merged
      }
    });

    // TODO Phase 2: Look up task by task_id from PR title or pr_number from DB
    // TODO Phase 2: Update task PR status
    // TODO Phase 2: Notify PR orchestrator
  }

  /**
   * Handle push webhook events
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

    // TODO Phase 2: Implement push event handling
    // - Update task status if commits reference task IDs
    // - Trigger CI/CD for certain branches
    // - Monitor for conflicts with open PRs
  }

  /**
   * Get webhook handler statistics
   */
  getStats(): WebhookHandlerStats {
    return { ...this.stats };
  }
}
