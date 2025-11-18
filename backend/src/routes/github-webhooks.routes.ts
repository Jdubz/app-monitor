import { Router, Request, Response } from 'express';
import { ApiError } from '@app-monitor/api-contracts';
import { logger } from '../utils/logger.js';
import { verifyGitHubWebhookSignature } from '../utils/githubWebhookVerification.js';
import { config } from '../config.js';
import type { GitHubWebhookHandler } from '../services/githubWebhookHandler.service.js';

const router = Router();

// Webhook handler will be injected during server initialization
let webhookHandler: GitHubWebhookHandler | null = null;

/**
 * Set the webhook handler instance (called during app initialization)
 */
export function setWebhookHandler(handler: GitHubWebhookHandler): void {
  webhookHandler = handler;
  logger.info({
    category: 'api',
    action: 'webhook_handler_set',
    message: 'GitHub webhook handler configured for routes'
  });
}

const respondSuccess = <T>(res: Response, data: T, status = 200) => {
  return res.status(status).json({
    success: true,
    data,
  });
};

const respondError = (res: Response, status: number, error: string, message?: string) => {
  const payload: ApiError = {
    success: false,
    error,
    ...(message ? { message } : {}),
  };
  return res.status(status).json(payload);
};

/**
 * Verify GitHub webhook signature
 *
 * @param req - Express request object
 * @returns true if signature is valid or verification is disabled
 */
const verifyWebhookSignature = (req: Request): boolean => {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  // Get raw body - Express json middleware stores it in req.body
  // For signature verification, we need the raw body as string
  const rawBody = JSON.stringify(req.body);

  return verifyGitHubWebhookSignature(rawBody, signature, config.githubWebhookSecret);
};

/**
 * GitHub Webhook endpoint for Pull Request events
 * Handles PR lifecycle: opened, closed, merged, synchronize, ready_for_review
 * 
 * @route POST /api/github/webhooks/pr
 */
router.post('/pr', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      logger.warn({
        category: 'api',
        action: 'github_webhook_signature_invalid',
        message: 'Invalid webhook signature for PR event'
      });
      return respondError(res, 401, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
    }

    const event = req.headers['x-github-event'] as string;
    const delivery = req.headers['x-github-delivery'] as string;

    // Validate event type
    if (event !== 'pull_request') {
      return respondError(
        res,
        400,
        'INVALID_EVENT_TYPE',
        `Expected pull_request event, received: ${event}`
      );
    }

    logger.info({
      category: 'api',
      action: 'github_webhook_received',
      message: 'Received GitHub webhook',
      details: {
        event,
        delivery,
        action: req.body?.action,
        pr_number: req.body?.pull_request?.number,
        pr_title: req.body?.pull_request?.title,
        repository: req.body?.repository?.full_name
      }
    });

    const { action, pull_request, repository } = req.body;
    
    logger.info({
      category: 'api',
      action: 'github_pr_event',
      message: 'PR Event',
      details: {
        action,
        pr: {
          number: pull_request?.number,
          title: pull_request?.title,
          state: pull_request?.state,
          user: pull_request?.user?.login,
          base: pull_request?.base?.ref,
          head: pull_request?.head?.ref
        },
        repo: repository?.full_name
      }
    });

    // Process webhook with handler if available
    if (webhookHandler) {
      await webhookHandler.handlePullRequest(req.body);
    } else {
      logger.warn({
        category: 'api',
        action: 'webhook_handler_not_configured',
        message: 'Webhook handler not configured, event logged but not processed'
      });
    }

    // Acknowledge receipt
    return respondSuccess(res, {
      message: 'Webhook received',
      event,
      delivery
    });

  } catch (error) {
    logger.error({
      category: 'api',
      action: 'github_webhook_error',
      message: 'Error processing GitHub webhook',
      error
    });
    return respondError(res, 500, 'WEBHOOK_PROCESSING_FAILED', 'Failed to process webhook');
  }
});

/**
 * GitHub Webhook endpoint for Push events
 * 
 * @route POST /api/github/webhooks/push
 */
router.post('/push', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      logger.warn({
        category: 'api',
        action: 'github_webhook_signature_invalid',
        message: 'Invalid webhook signature for push event'
      });
      return respondError(res, 401, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
    }

    const event = req.headers['x-github-event'] as string;
    const delivery = req.headers['x-github-delivery'] as string;

    // Validate event type
    if (event !== 'push') {
      return respondError(
        res,
        400,
        'INVALID_EVENT_TYPE',
        `Expected push event, received: ${event}`
      );
    }

    logger.info({
      category: 'api',
      action: 'github_push_webhook_received',
      message: 'Received GitHub push webhook',
      details: {
        event,
        delivery,
        ref: req.body?.ref,
        repository: req.body?.repository?.full_name,
        pusher: req.body?.pusher?.name
      }
    });

    const { ref, commits, repository, pusher } = req.body;

    logger.info({
      category: 'api',
      action: 'github_push_event',
      message: 'Push Event',
      details: {
        ref,
        commit_count: commits?.length,
        repo: repository?.full_name,
        pusher: pusher?.name,
        head_commit: commits?.[0]?.message
      }
    });

    // Process webhook with handler if available
    if (webhookHandler) {
      await webhookHandler.handlePush(req.body);
    }

    return respondSuccess(res, {
      message: 'Webhook received',
      event,
      delivery
    });

  } catch (error) {
    logger.error({
      category: 'api',
      action: 'github_push_webhook_error',
      message: 'Error processing push webhook',
      error
    });
    return respondError(res, 500, 'WEBHOOK_PROCESSING_FAILED', 'Failed to process webhook');
  }
});

/**
 * GitHub Webhook endpoint for Check Suite events
 * Handles check suite completion to trigger followup tasks and auto-merge
 * 
 * @route POST /api/github/webhooks/check_suite
 */
router.post('/check_suite', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      logger.warn({
        category: 'api',
        action: 'github_webhook_signature_invalid',
        message: 'Invalid webhook signature for check_suite event'
      });
      return respondError(res, 401, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
    }

    const event = req.headers['x-github-event'] as string;
    const delivery = req.headers['x-github-delivery'] as string;

    if (event !== 'check_suite') {
      return respondError(
        res,
        400,
        'INVALID_EVENT_TYPE',
        `Expected check_suite event, received: ${event}`
      );
    }

    logger.info({
      category: 'api',
      action: 'github_check_suite_webhook_received',
      message: 'Received check_suite webhook',
      details: {
        event,
        delivery,
        action: req.body?.action,
        conclusion: req.body?.check_suite?.conclusion,
        pr_numbers: req.body?.check_suite?.pull_requests?.map((pr: { number: number }) => pr.number),
        repository: req.body?.repository?.full_name
      }
    });

    if (webhookHandler) {
      await webhookHandler.handleCheckSuite(req.body);
    } else {
      logger.warn({
        category: 'api',
        action: 'webhook_handler_not_configured',
        message: 'Webhook handler not configured for check_suite'
      });
    }

    return respondSuccess(res, {
      message: 'Check suite webhook received',
      event,
      delivery
    });

  } catch (error) {
    logger.error({
      category: 'api',
      action: 'github_check_suite_webhook_error',
      message: 'Error processing check_suite webhook',
      error
    });
    return respondError(res, 500, 'WEBHOOK_PROCESSING_FAILED', 'Failed to process webhook');
  }
});

/**
 * GitHub Webhook endpoint for Check Run events
 * Handles individual check run completion to trigger followup tasks and auto-merge
 * 
 * @route POST /api/github/webhooks/check_run
 */
router.post('/check_run', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      logger.warn({
        category: 'api',
        action: 'github_webhook_signature_invalid',
        message: 'Invalid webhook signature for check_run event'
      });
      return respondError(res, 401, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
    }

    const event = req.headers['x-github-event'] as string;
    const delivery = req.headers['x-github-delivery'] as string;

    if (event !== 'check_run') {
      return respondError(
        res,
        400,
        'INVALID_EVENT_TYPE',
        `Expected check_run event, received: ${event}`
      );
    }

    logger.info({
      category: 'api',
      action: 'github_check_run_webhook_received',
      message: 'Received check_run webhook',
      details: {
        event,
        delivery,
        action: req.body?.action,
        name: req.body?.check_run?.name,
        conclusion: req.body?.check_run?.conclusion,
        pr_numbers: req.body?.check_run?.pull_requests?.map((pr: { number: number }) => pr.number),
        repository: req.body?.repository?.full_name
      }
    });

    if (webhookHandler) {
      await webhookHandler.handleCheckRun(req.body);
    } else {
      logger.warn({
        category: 'api',
        action: 'webhook_handler_not_configured',
        message: 'Webhook handler not configured for check_run'
      });
    }

    return respondSuccess(res, {
      message: 'Check run webhook received',
      event,
      delivery
    });

  } catch (error) {
    logger.error({
      category: 'api',
      action: 'github_check_run_webhook_error',
      message: 'Error processing check_run webhook',
      error
    });
    return respondError(res, 500, 'WEBHOOK_PROCESSING_FAILED', 'Failed to process webhook');
  }
});

/**
 * GitHub Webhook endpoint for Pull Request Review events
 * Handles Copilot and human code reviews to trigger followup tasks and auto-merge
 * 
 * @route POST /api/github/webhooks/pr_review
 */
router.post('/pr_review', async (req: Request, res: Response) => {
  try {
    const event = req.headers['x-github-event'] as string;
    const delivery = req.headers['x-github-delivery'] as string;
    
    if (event !== 'pull_request_review') {
      return respondError(
        res,
        400,
        'INVALID_EVENT_TYPE',
        `Expected pull_request_review event, received: ${event}`
      );
    }

    logger.info({
      category: 'api',
      action: 'github_pr_review_webhook_received',
      message: 'Received pull_request_review webhook',
      details: {
        event,
        delivery,
        action: req.body?.action,
        reviewer: req.body?.review?.user?.login,
        review_state: req.body?.review?.state,
        pr_number: req.body?.pull_request?.number,
        repository: req.body?.repository?.full_name
      }
    });

    if (webhookHandler) {
      await webhookHandler.handlePullRequestReview(req.body);
    } else {
      logger.warn({
        category: 'api',
        action: 'webhook_handler_not_configured',
        message: 'Webhook handler not configured for pull_request_review'
      });
    }

    return respondSuccess(res, {
      message: 'Pull request review webhook received',
      event,
      delivery
    });

  } catch (error) {
    logger.error({
      category: 'api',
      action: 'github_pr_review_webhook_error',
      message: 'Error processing pull_request_review webhook',
      error
    });
    return respondError(res, 500, 'WEBHOOK_PROCESSING_FAILED', 'Failed to process webhook');
  }
});

/**
 * Health check endpoint for webhooks
 *
 * @route GET /api/github/webhooks/health
 */
router.get('/health', (_req: Request, res: Response) => {
  return respondSuccess(res, {
    status: 'ok',
    message: 'GitHub webhooks endpoint is healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * PR Workflow Metrics endpoint
 * Returns comprehensive metrics about PR workflow quality gates
 *
 * @route GET /api/github/webhooks/pr-workflow/metrics
 */
router.get('/pr-workflow/metrics', (_req: Request, res: Response) => {
  try {
    if (!webhookHandler) {
      return respondError(
        res,
        503,
        'WEBHOOK_HANDLER_NOT_CONFIGURED',
        'Webhook handler not configured'
      );
    }

    const stats = webhookHandler.getStats();

    // Calculate derived metrics
    const autoMergeRate = stats.auto_merge_attempts > 0
      ? (stats.auto_merge_successes / stats.auto_merge_attempts) * 100
      : 0;

    const verificationPassRate = stats.task_verifications_run > 0
      ? (stats.task_verifications_passed / stats.task_verifications_run) * 100
      : 0;

    const commentResolutionRate = stats.review_comments_tracked > 0
      ? (stats.review_comments_resolved / stats.review_comments_tracked) * 100
      : 0;

    return respondSuccess(res, {
      // Raw stats
      stats,

      // Calculated metrics
      metrics: {
        auto_merge_rate: Math.round(autoMergeRate * 100) / 100, // 2 decimal places
        auto_merge_failure_rate: Math.round((100 - autoMergeRate) * 100) / 100,
        verification_pass_rate: Math.round(verificationPassRate * 100) / 100,
        comment_resolution_rate: Math.round(commentResolutionRate * 100) / 100,
        avg_time_to_merge_hours: stats.avg_time_to_merge_ms
          ? Math.round((stats.avg_time_to_merge_ms / (1000 * 60 * 60)) * 100) / 100
          : null,
      },

      // Top blocking reasons
      top_block_reasons: stats.auto_merge_blocks
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(r => ({ ...r, percentage: Math.round((r.count / stats.auto_merge_attempts) * 10000) / 100 }))
    });

  } catch (error) {
    logger.error({
      category: 'api',
      action: 'pr_workflow_metrics_error',
      message: 'Error getting PR workflow metrics',
      error
    });
    return respondError(res, 500, 'METRICS_RETRIEVAL_FAILED', 'Failed to retrieve metrics');
  }
});

export default router;
