/**
 * GitHub Webhook Types
 * 
 * Type definitions for GitHub webhook payloads and related interfaces.
 * Extracted from githubWebhookHandler.service.ts for better modularity.
 */

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
