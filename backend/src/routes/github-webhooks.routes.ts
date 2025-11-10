import { Router, Request, Response } from 'express';
import { ApiError } from '@app-monitor/api-contracts';
import { logger } from '../utils/logger.js';

const router = Router();

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
 * Handles PR opened, closed, synchronize, etc.
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

    // TODO: Add actual webhook processing logic here
    // - Trigger builds/tests
    // - Update PR status
    // - Post comments
    // - etc.

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

    // TODO: Add actual webhook processing logic

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
