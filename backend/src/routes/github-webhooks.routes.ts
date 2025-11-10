import { Router, Request, Response } from 'express';
import type { GitHubWebhookHandler } from '../services/githubWebhookHandler.service.js';

const router = Router();

// Simple logger for webhooks
const logger = {
  info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
  error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || '')
};

// Webhook handler will be injected when routes are created
let webhookHandler: GitHubWebhookHandler | null = null;

/**
 * Set the webhook handler (called during app initialization)
 */
export function setWebhookHandler(handler: GitHubWebhookHandler): void {
  webhookHandler = handler;
  logger.info('GitHub webhook handler configured');
}

/**
 * GitHub Webhook endpoint for Pull Request events
 * Handles PR opened, closed, synchronize, etc.
 * 
 * @route POST /api/github/webhooks/pr
 */
router.post('/pr', async (req: Request, res: Response) => {
  try {
    const event = req.headers['x-github-event'] as string;
    const signature = req.headers['x-hub-signature-256'] as string;
    const delivery = req.headers['x-github-delivery'] as string;
    
    logger.info('Received GitHub webhook', {
      event,
      delivery,
      action: req.body?.action,
      pr_number: req.body?.pull_request?.number,
      pr_title: req.body?.pull_request?.title,
      repository: req.body?.repository?.full_name
    });

    // Process with webhook handler if available
    if (event === 'pull_request' && webhookHandler) {
      await webhookHandler.handlePullRequest(req.body);
    } else if (!webhookHandler) {
      logger.info('PR Event (handler not configured)', {
        action: req.body?.action,
        pr: {
          number: req.body?.pull_request?.number,
          title: req.body?.pull_request?.title,
          state: req.body?.pull_request?.state,
          user: req.body?.pull_request?.user?.login,
          base: req.body?.pull_request?.base?.ref,
          head: req.body?.pull_request?.head?.ref
        },
        repo: req.body?.repository?.full_name
      });
    }

    // Acknowledge receipt
    res.status(200).json({
      success: true,
      message: 'Webhook received',
      event,
      delivery
    });

  } catch (error) {
    logger.error('Error processing GitHub webhook', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
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
    
    logger.info('Received GitHub push webhook', {
      event,
      delivery,
      ref: req.body?.ref,
      repository: req.body?.repository?.full_name,
      pusher: req.body?.pusher?.name
    });

    // Process with webhook handler if available
    if (event === 'push' && webhookHandler) {
      await webhookHandler.handlePush(req.body);
    } else if (!webhookHandler) {
      const { ref, commits, repository, pusher } = req.body;
      logger.info('Push Event (handler not configured)', {
        ref,
        commit_count: commits?.length,
        repo: repository?.full_name,
        pusher: pusher?.name,
        head_commit: commits?.[0]?.message
      });
    }

    res.status(200).json({
      success: true,
      message: 'Webhook received',
      event,
      delivery
    });

  } catch (error) {
    logger.error('Error processing push webhook', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});

/**
 * Health check endpoint for webhooks
 * 
 * @route GET /api/github/webhooks/health
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'GitHub webhooks endpoint is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
