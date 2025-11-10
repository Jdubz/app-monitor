import { Router, Request, Response } from 'express';
import { ApiError } from '@app-monitor/api-contracts';
import { logger } from '../utils/logger.js';
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
 * GitHub Webhook endpoint for Pull Request events
 * Handles PR lifecycle: opened, closed, merged, synchronize, ready_for_review
 * 
 * @route POST /api/github/webhooks/pr
 */
router.post('/pr', async (req: Request, res: Response) => {
  try {
    const event = req.headers['x-github-event'] as string;
    // TODO: Implement HMAC signature verification for GitHub webhooks
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
 * Health check endpoint for webhooks
 * 
 * @route GET /api/github/webhooks/health
 */
router.get('/health', (_req: Request, res: Response) => {
  return respondSuccess(res, {
    message: 'GitHub webhooks endpoint is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
