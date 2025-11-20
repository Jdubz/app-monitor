/**
 * Modular API Routes Index
 *
 * This file will gradually replace the monolithic api.ts (2828 lines)
 * by importing and mounting modular route modules.
 *
 * Progress: Phase 3.1 - Backend Simplification
 * Status: In Progress
 */

import { Router } from 'express';
import { DevBotsManager } from '../services/devBotsManager.js';
import type { ConnectionManager } from '../services/connectionManager.js';
import type { TerminalService } from '../services/TerminalService.js';
import type { HealthCheckApiResponse } from '@app-monitor/api-contracts';
import { requireApiKey } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

import { createSocketRoutes } from './socket-task.routes.js';
import { createDockerRouter } from './docker.routes.js';
import { createDevBotsRouter } from './dev-bots/index.js';
import { createSSERoutes } from './sse.routes.js';
import { createTerminalRoutes } from './terminal.routes.js';
import tokenTrackingRoutes from './token-tracking.routes.js';
import qualityGatesRoutes from './quality-gates.routes.js';
import verificationRoutes from './verification.routes.js';
import githubWebhooksRoutes from './github-webhooks.routes.js';
import logsRoutes, { initializeLogsRoutes } from './logs.routes.js';
import issuesRoutes, { initializeIssuesRoutes } from './issues.routes.js';
import metricsRoutes from './metrics.routes.js';
import observabilityRoutes from './observability.routes.js';
import { createPRsRouter } from './prs.routes.js';

/**
 * Create the main API router with all sub-routes
 *
 * This factory function takes all dependencies and returns a configured router.
 * Benefits:
 * - Dependency injection (easier testing)
 * - Type-safe
 * - Modular
 * - Clear dependencies
 */
export function createApiRouter(deps: {
  devBotsManager?: DevBotsManager;
  connectionManager?: ConnectionManager;
  terminalService?: TerminalService;
}) {
  const router = Router();

  // Initialize logs and issues routes with database and task queue from devBotsManager
  if (deps.devBotsManager) {
    const taskQueue = deps.devBotsManager.getTaskQueue();
    const db = taskQueue.getDatabase();
    initializeLogsRoutes(db);
    initializeIssuesRoutes(db, taskQueue);
  }

  // Health check - no auth required
  router.get('/health', async (_req, res) => {
    logger.debug({
      category: 'api',
      action: 'health_check',
      message: 'Health endpoint called',
      details: {
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    });

    // Check if server is shutting down
    // Note: This will be false in test environment where index module isn't loaded
    let shuttingDown = false;
    try {
      const indexModule = await import('../index.js');
      shuttingDown = indexModule.isShuttingDown || false;
    } catch {
      // In test environment, index.js may not be available
      shuttingDown = false;
    }
    
    if (shuttingDown) {
      // Return 503 during graceful shutdown so nginx stops routing here
      return res.status(503).json({
        success: false,
        error: {
          message: 'Server is shutting down gracefully',
          code: 'SERVER_DRAINING'
        }
      });
    }
    
    const payload: HealthCheckApiResponse = {
      success: true,
      data: {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    };
    res.json(payload);
  });

  // Apply API key authentication to all routes except health and webhooks
  if (deps.connectionManager) {
    router.use('/socket', requireApiKey, createSocketRoutes(deps.connectionManager));
  }

  router.use('/docker', requireApiKey, createDockerRouter());

  if (deps.devBotsManager) {
    router.use('/dev-bots', requireApiKey, createDevBotsRouter(deps.devBotsManager));
    router.use('/sse', requireApiKey, createSSERoutes(deps.devBotsManager));
  }

  router.use('/token-tracking', requireApiKey, tokenTrackingRoutes);
  router.use('/quality-gates', requireApiKey, qualityGatesRoutes);
  router.use('/verification', requireApiKey, verificationRoutes);
  router.use('/metrics', requireApiKey, metricsRoutes);
  router.use('/observability', requireApiKey, observabilityRoutes);
  
  if (deps.devBotsManager) {
    router.use('/prs', requireApiKey, createPRsRouter(deps.devBotsManager));
  }

  if (deps.terminalService) {
    router.use('/terminal', requireApiKey, createTerminalRoutes(deps.terminalService));
  }

  // Logs and issues endpoints - no auth required (frontend logs and issue reports)
  router.use('/logs', logsRoutes);
  router.use('/issues', issuesRoutes);

  // Webhooks don't require API key (GitHub signature verification instead)
  router.use('/github/webhooks', githubWebhooksRoutes);

  return router;
}
