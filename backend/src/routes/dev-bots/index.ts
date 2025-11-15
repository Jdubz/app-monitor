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
import { createPlansRoutes } from './plans.routes.js';
import { createSettingsRoutes } from './settings.routes.js';
import { logger } from '../../utils/logger.js';
import * as ErrorResponses from '../../utils/errorResponses.js';

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

  // Plans Management endpoints
  // Includes: /plans, /plans/:planId, /plans/:planId/tasks,
  //           /plans/:planId/cancel, /plans/:planId/update-status
  router.use('/', createPlansRoutes(devBotsManager));

  // Settings endpoints
  // Includes: /settings
  router.use('/', createSettingsRoutes(devBotsManager));

  // ============================================================================
  // PR Sync Endpoint (Manual Trigger for Debugging)
  // ============================================================================

  /**
   * POST /pr-sync
   * Manually trigger PR sync (for debugging)
   * 
   * Normally triggered automatically every N task completions (event-driven).
   * This endpoint allows manual triggering for troubleshooting.
   */
  router.post('/pr-sync', async (_req: Request, res: Response) => {
    try {
      logger.info({
        category: 'pr-sync',
        action: 'manual_sync_triggered',
        message: 'Manual PR sync triggered via API endpoint'
      });

      const { getPRSyncService } = await import('../../services/prSync.service.js');
      
      const prSyncService = getPRSyncService();
      await prSyncService.syncAllTrackedPRs();
      
      const stats = prSyncService.getStats();

      res.json({ 
        success: true,
        data: { 
          message: 'PR sync completed successfully',
          stats: {
            syncs_triggered: stats.syncs_triggered,
            syncs_completed: stats.syncs_completed,
            syncs_failed: stats.syncs_failed,
            total_prs_checked: stats.total_prs_checked,
            total_stale_prs_found: stats.total_stale_prs_found,
            total_deltas_resolved: stats.total_deltas_resolved,
            github_api_calls: stats.github_api_calls,
            last_sync: stats.last_sync_timestamp ? new Date(stats.last_sync_timestamp).toISOString() : null
          }
        }
      });
    } catch (error) {
      return ErrorResponses.internalError(
        res,
        'Failed to execute PR sync',
        {
          category: 'pr-sync',
          action: 'manual_sync_failed'
        },
        error
      );
    }
  });

  return router;
}
