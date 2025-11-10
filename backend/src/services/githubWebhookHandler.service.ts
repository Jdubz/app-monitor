/**
 * GitHub Webhook Handler Service
 * 
 * Processes incoming webhooks from GitHub
 * Phase 1: Basic event logging and structure
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
  errors: number;
  last_event_time: number;
}

/**
 * Service for handling GitHub webhook events
 * Phase 1: Logging and event structure
 */
export class GitHubWebhookHandler {
  private stats: WebhookHandlerStats = {
    pr_events_received: 0,
    push_events_received: 0,
    errors: 0,
    last_event_time: 0
  };

  /**
   * Handle pull request webhook events
   */
  async handlePullRequest(payload: GitHubPullRequestPayload): Promise<void> {
    this.stats.pr_events_received++;
    this.stats.last_event_time = Date.now();

    const { action, pull_request, repository } = payload;
    const prNumber = pull_request.number;

    logger.info({
      category: 'api',
      action: 'pr_event_received',
      message: `PR #${prNumber} ${action}`,
      details: {
        pr_number: prNumber,
        action,
        title: pull_request.title,
        user: pull_request.user.login,
        branch: pull_request.head.ref,
        repo: repository.full_name,
        draft: pull_request.draft,
        merged: pull_request.merged
      }
    });

    // TODO Phase 2: Integrate with task queue to find associated tasks
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
