/**
 * Base Webhook Handler
 * 
 * Abstract base class for all GitHub webhook handlers.
 * Provides common functionality and dependencies for specialized handlers.
 */

import { logger } from '../../utils/logger.js';
import type { TaskQueueService } from '../taskQueue.sqlite.js';
import type { PRWorkflowOrchestrator } from '../prWorkflowOrchestrator.service.js';
import type { PRConditionStateService } from '../prConditionState.service.js';
import type { ReviewCommentTracker } from '../reviewCommentTracker.service.js';
import type { TaskVerificationService } from '../taskVerification.service.js';
import type { WebhookHandlerStats } from './types.js';

/**
 * Abstract base handler for webhook events
 */
export abstract class BaseWebhookHandler {
  constructor(
    protected readonly taskQueue: TaskQueueService | undefined,
    protected readonly prOrchestrator: PRWorkflowOrchestrator | undefined,
    protected readonly prConditionState: PRConditionStateService | null,
    protected readonly reviewCommentTracker: ReviewCommentTracker,
    protected readonly taskVerification: TaskVerificationService,
    protected readonly stats: WebhookHandlerStats
  ) {}

  /**
   * Handle the webhook event
   * @param payload The webhook payload
   */
  abstract handle(payload: any): Promise<void>;

  /**
   * Log a webhook event with consistent format
   */
  protected logEvent(eventType: string, action: string, details: any = {}): void {
    logger.info({
      category: 'api',
      action: `${eventType}_${action}`,
      message: `GitHub ${eventType} event: ${action}`,
      details
    });
  }

  /**
   * Log an error during webhook handling
   */
  protected logError(eventType: string, action: string, error: unknown, details: any = {}): void {
    logger.error({
      category: 'api',
      action: `${eventType}_${action}_error`,
      message: `Error handling ${eventType} ${action}`,
      error,
      details
    });
    this.stats.errors++;
  }

  /**
   * Extract task ID from PR branch name or title
   * Supports multiple formats for maximum compatibility
   */
  protected extractTaskIdFromBranchOrTitle(branchName: string, title: string): string | null {
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
    
    // PRIORITY 2: Check title if branch didn't match
    // Pattern: "Task: task-abc123" or "[task-abc123]" or "task-abc123:" or "(task-abc123)"
    match = title.match(/(?:task:\s*|[\[\(])(task-[a-z]+-[a-f0-9-]{8,})(?:[\]\)]|:)?/i);
    if (match) return match[1];
    
    // Pattern: task-{uuid} in title
    match = title.match(/\b(task-[a-f0-9-]{36})\b/i);
    if (match) return match[1];
    
    return null;
  }

  /**
   * Check if a PR is from a bot
   */
  protected isBotPR(userLogin: string, userType: string): boolean {
    return userType === 'Bot' || userLogin.toLowerCase().includes('bot');
  }

  /**
   * Update stats timestamp
   */
  protected updateStatsTimestamp(): void {
    this.stats.last_event_time = Date.now();
  }
}
