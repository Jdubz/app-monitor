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
import { ProcessManager } from '../services/processManager.js';
import { CloudLogging } from '../services/cloudLogging.js';
import { DevBotsManager } from '../services/devBotsManager.js';
import type { ConnectionManager } from '../services/connectionManager.js';
import type { LogRotation } from '../services/logRotation.js';
import type { LogStreamer } from '../services/logStreamer.js';
import type { ServiceConfig } from '../config.js';
import type { HealthCheckApiResponse } from '@app-monitor/api-contracts';

import { createServicesRouter } from './services.routes.js';
import { createSocketRoutes } from './socket-task.routes.js';
import { createDockerRouter } from './docker.routes.js';
import { createClaudeWorkersRouter } from './dev-bots.routes.js';
import { createLogsRoutes } from './logs.routes.js';
import { createPortsRoutes } from './ports.routes.js';
import { createEnvironmentsRoutes } from './environments.routes.js';
import tokenTrackingRoutes from './token-tracking.routes.js';
import qualityGatesRoutes from './quality-gates.routes.js';
import verificationRoutes from './verification.routes.js';
import githubWebhooksRoutes from './github-webhooks.routes.js';

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
  processManager: ProcessManager;
  cloudLogging: CloudLogging;
  devBotsManager?: DevBotsManager;
  connectionManager?: ConnectionManager;
  logRotation?: LogRotation;
  logStreamer?: LogStreamer;
  services?: Record<string, ServiceConfig>;
}) {
  const router = Router();

  router.get('/health', (_req, res) => {
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

  router.use('/services', createServicesRouter(deps.processManager));

  if (deps.connectionManager) {
    router.use('/socket', createSocketRoutes(deps.connectionManager));
  }

  router.use('/docker', createDockerRouter());

  if (deps.devBotsManager) {
    router.use('/dev-bots', createClaudeWorkersRouter(deps.devBotsManager));
  }

  if (deps.logRotation && deps.logStreamer) {
    router.use('/logs', createLogsRoutes({
      logRotation: deps.logRotation,
      cloudLogging: deps.cloudLogging,
      logStreamer: deps.logStreamer,
      processManager: deps.processManager,
    }));
  }

  if (deps.services) {
    router.use('/ports', createPortsRoutes({ services: deps.services }));
  }

  router.use('/environments', createEnvironmentsRoutes({ cloudLogging: deps.cloudLogging }));
  router.use('/token-tracking', tokenTrackingRoutes);
  router.use('/quality-gates', qualityGatesRoutes);
  router.use('/verification', verificationRoutes);
  router.use('/github/webhooks', githubWebhooksRoutes);

  return router;
}
