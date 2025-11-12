/**
 * Dev-Bots Routes Aggregator
 *
 * This module combines all Dev-Bots route modules into a single router:
 * - Status & Infrastructure (status.routes.ts)
 * - Task Management (tasks.routes.ts)
 * - Agent Management (agents.routes.ts)
 * - Interactive Sessions (interactive.routes.ts)
 * - Templates & Guidelines (templates.routes.ts)
 *
 * All routes maintain flat URL structure (no nested prefixes) for backward compatibility.
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { createStatusRoutes } from './status.routes.js';
import { createTasksRoutes } from './tasks.routes.js';
import { createAgentsRoutes } from './agents.routes.js';
import { createInteractiveRoutes } from './interactive.routes.js';
import { createTemplatesRoutes } from './templates.routes.js';

/**
 * Create main Dev-Bots router with all sub-routers mounted
 *
 * @param devBotsManager - The Dev-Bots manager instance
 * @returns Express router with all Dev-Bots endpoints
 */
export function createDevBotsRouter(devBotsManager: DevBotsManager): Router {
  const router = Router();

  // Add request validation middleware
  router.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Powered-By', 'Dev-Bots');
    next();
  });

  // ============================================================================
  // Mount Route Modules (Flat Structure)
  // ============================================================================

  // Status & Infrastructure endpoints
  // Includes: /status, /health, /start, /stop, /metrics, /agent-comparison,
  //           /projects, /export, /import, /onboarding/complete,
  //           /workspace-sync/*, /docker/*, /cleanup-status, /trigger-cleanup,
  //           /scope-violations, /emergency-recovery, /containers/:id/health
  router.use('/', createStatusRoutes(devBotsManager));

  // Task Management endpoints
  // Includes: /tasks, /tasks/completed, /tasks/:id/detail, /tasks/:id/timeout,
  //           /tasks/:id/logs, /tasks/:id/logs/:stream, /tasks/:id/context,
  //           /tasks/:id/runs, /tasks/:id/runs/:runId,
  //           /queue, /queue/stats, /validate, /assign, /pr/track,
  //           /chains/blocked, /chains/:chainId/unblock
  router.use('/', createTasksRoutes(devBotsManager));

  // Agent Management endpoints
  // Includes: /agents, /agents/valid
  router.use('/', createAgentsRoutes(devBotsManager));

  // Interactive Session endpoints
  // Includes: /interactive/session, /interactive/session/:id/input,
  //           /interactive/heartbeat, /interactive/interrupt
  router.use('/', createInteractiveRoutes(devBotsManager));

  // Templates & Guidelines endpoints
  // Includes: /templates, /guidelines, /guidelines/:taskType,
  //           /examples/:taskType, /checklist/:taskType
  router.use('/', createTemplatesRoutes(devBotsManager));

  return router;
}
