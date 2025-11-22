import express, { Request, Response } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { config } from './config.js';
import { createApiRouter } from './routes/index.js';
import { DevBotsManager } from './services/devBotsManager.js';
import { createDevBotsManagerDependencies } from './services/devBotsManager.factory.js';
import type { DevBotsManagerDependencies } from './services/devBotsManager.interfaces.js';
import { GitHubWebhookHandler } from './services/githubWebhookHandler.service.js';
import { setWebhookHandler } from './routes/github-webhooks.routes.js';
import { logger } from './utils/logger.js';
import { startMcpServer } from './mcp/server.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { AdminBotService } from './services/AdminBotService.js';

// CORS allowed headers
const ALLOWED_CORS_HEADERS = ['Content-Type', 'X-API-Key', 'Authorization', 'X-Trace-Id'];

// Export services for API access
export let devBotsManager: DevBotsManager | undefined;
export let adminBotService: AdminBotService;

export interface CreateAppOverrides {
  devBotsManager?: DevBotsManager | null;
  devBotsDependencies?: DevBotsManagerDependencies;
}

export interface CreateAppOptions {
  overrides?: CreateAppOverrides;
}

export async function createApp(options: CreateAppOptions = {}) {
  const overrides = options.overrides ?? {};
  const app = express();
  const httpServer = createServer(app);

  // Initialize AdminBotService
  adminBotService = new AdminBotService();
  logger.info({
    category: 'system',
    action: 'admin_bot_service_initialized',
    message: 'AdminBotService initialized'
  });

  if (overrides.devBotsManager === null) {
    devBotsManager = undefined;
  } else if (overrides.devBotsManager) {
    devBotsManager = overrides.devBotsManager;
  } else {
    // Create dependencies
    const devBotsDeps = overrides.devBotsDependencies ?? await createDevBotsManagerDependencies();
    devBotsManager = new DevBotsManager(devBotsDeps);

    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    if (!isTestEnv) {
      try {
        await startMcpServer({
          db: devBotsDeps.taskQueue.getDb(),
          services: {
            devBotsManager,
          },
        });
      } catch (error) {
        logger.error({
          category: 'system',
          action: 'mcp_startup_error',
          message: 'Failed to start MCP server',
          error,
        });
        process.exit(1);
      }
    }
  }

  // NOTE: DevBotsManager events are now handled by SSE routes (sse.routes.ts)
  // All task/system events use Server-Sent Events for better performance

  // Initialize GitHub Webhook Handler
  if (devBotsManager) {
    const taskQueue = devBotsManager.getTaskQueue();
    const prOrchestrator = devBotsManager.getPRWorkflowOrchestrator();
    
    const webhookHandler = new GitHubWebhookHandler(taskQueue, prOrchestrator);
    setWebhookHandler(webhookHandler);
    
    // Initialize PR sync service and wire it up
    const { initializePRSyncService } = await import('./services/prSync.service.js');
    const prSyncService = initializePRSyncService(taskQueue);
    
    // Reuse PullRequestHandler from webhook handler (avoids duplicate instances)
    prSyncService.setPullRequestHandler(webhookHandler.getPullRequestHandler());
    
    // Inject PR condition state service for accessing pr_condition_states table
    prSyncService.setPRConditionStateService(webhookHandler.getPRConditionStateService());
    
    // Inject PR sync service into task queue (dependency injection, not dynamic import)
    taskQueue.setPRSyncService(prSyncService);

    logger.info({
      category: 'system',
      action: 'webhook_handler_initialized',
      message: 'GitHub webhook handler configured and ready',
      details: {
        has_task_queue: !!taskQueue,
        has_pr_orchestrator: !!prOrchestrator,
        pr_sync_enabled: config.prSync.enabled,
        pr_sync_threshold: config.prSync.taskThreshold,
        issue_triage_enabled: true
      }
    });
  }

  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
    allowedHeaders: ALLOWED_CORS_HEADERS,
  }));
  app.use(express.json());

  const apiRouter = createApiRouter({
    devBotsManager: devBotsManager ?? undefined,
    adminBotService,
  });

  app.use('/api', apiRouter);

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      message: 'Dev Monitor Backend',
      version: '1.0.0',
      status: 'running',
    });
  });

  // Error handling middleware (must be after all routes)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return httpServer;
}
