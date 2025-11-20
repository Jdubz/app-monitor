/**
 * System Status & Infrastructure Routes
 *
 * Endpoints for system health, metrics, and infrastructure management:
 * - System status and health checks
 * - Performance metrics and agent comparison
 * - Projects management
 * - Docker integration and management
 * - Cleanup and maintenance
 * - Emergency recovery
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { logger } from '../../utils/logger.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';
import { mapTasksToContract } from './shared.js';

/**
 * Create system status and infrastructure routes
 */
export function createStatusRoutes(devBotsManager: DevBotsManager): Router {
  const router = Router();

  // ============================================================================
  // System Status & Health
  // ============================================================================

  /**
   * GET /status
   * Get overall system status with active tasks
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getSystemStatus();
      if (status) {
        const normalizedStatus = {
          ...status,
          tasks: {
            pending: mapTasksToContract(status.tasks.pending),
            active: mapTasksToContract(status.tasks.active),
            completed: mapTasksToContract(status.tasks.completed),
          },
        };
        sendSuccess(res, normalizedStatus);
      } else {
        sendError(
          res,
          'Dev-Bots coordinator is not available',
          503,
          { details: { healthy: devBotsManager.isHealthy() } }
        );
      }
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_claude_workers_status_error',
        message: `Error getting Dev-Bots status: ${error}`,
        error
      });
      sendError(
        res,
        'Failed to get Dev-Bots status',
        500,
        { message: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  /**
   * GET /health
   * Get health check status
   */
  router.get('/health', (_req: Request, res: Response) => {
    sendSuccess(res, {
      healthy: devBotsManager.isHealthy(),
      status: devBotsManager.isHealthy() ? 'healthy' : 'unhealthy'
    });
  });

  // ============================================================================
  // Metrics & Performance
  // ============================================================================

  /**
   * GET /metrics
   * Get queue metrics and task duration statistics
   */
  router.get('/metrics', (_req: Request, res: Response) => {
    try {
      const metrics = devBotsManager.getQueueMetrics();
      const stats = devBotsManager.getTaskDurationStats();
      sendSuccess(res, { metrics, stats });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_metrics',
        message: `Error getting metrics: ${error}`,
        error
      });
      sendError(res, 'Failed to get metrics', 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * GET /agent-comparison
   * Get performance comparison metrics between agents
   */
  router.get('/agent-comparison', (_req: Request, res: Response) => {
    try {
      const comparison = devBotsManager.getAgentComparisonMetrics();
      sendSuccess(res, { comparison });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_agent_comparison',
        message: `Error getting agent comparison metrics: ${error}`,
        error
      });
      sendError(res, 'Failed to get agent comparison metrics', 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  // ============================================================================
  // Projects
  // ============================================================================

  /**
   * GET /projects
   * Get list of valid projects
   */
  router.get('/projects', (_req: Request, res: Response) => {
    try {
      const projects = devBotsManager.getValidProjects();
      sendSuccess(res, { projects });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_projects_error',
        message: `Error getting projects: ${error}`,
        error
      });
      sendError(res, 'Failed to get projects', 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  // ============================================================================
  // Docker Integration
  // ============================================================================

  /**
   * GET /docker/status
   * Get Docker integration status
   */
  router.get('/docker/status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getDockerStatus();
      sendSuccess(res, status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_docker_status_error',
        message: `Error getting Docker status: ${error}`,
        error
      });
      sendError(res, 'Failed to get Docker status', 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * POST /docker/revalidate
   * Revalidate Docker environment and containers
   */
  router.post('/docker/revalidate', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.revalidateDockerEnvironment();
      sendSuccess(res, result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_revalidating_docker_error',
        message: `Error revalidating Docker containers: ${error}`,
        error
      });
      sendError(res, 'Failed to revalidate Docker containers', 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * POST /docker/cleanup
   * Clean up orphaned Docker resources
   */
  router.post('/docker/cleanup', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.cleanupOrphanedResources();
      sendSuccess(res, result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_cleaning_docker_error',
        message: `Error cleaning Docker resources: ${error}`,
        error
      });
      sendError(res, 'Failed to clean Docker resources', 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * GET /containers/:containerId/health
   * Get health status of specific container
   */
  router.get('/containers/:containerId/health', async (req: Request, res: Response) => {
    try {
      const { containerId } = req.params;
      const health = await devBotsManager.getContainerHealth(containerId);
      sendSuccess(res, health);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_container_health_error',
        message: `Error getting container health for ${req.params.containerId}: ${error}`,
        error
      });
      sendError(res, 'Failed to get container health', 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  // ============================================================================
  // Cleanup & Maintenance
  // ============================================================================

  /**
   * GET /cleanup-status
   * Get cleanup system status
   */
  router.get('/cleanup-status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getCleanupStatus();
      sendSuccess(res, status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_cleanup_status_error',
        message: `Error getting cleanup status: ${error}`,
        error
      });
      sendError(res, 'Failed to get cleanup status', 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * POST /trigger-cleanup
   * Manually trigger cleanup procedures
   */
  router.post('/trigger-cleanup', async (req: Request, res: Response) => {
    try {
      const { aggressive } = req.body;
      const result = await devBotsManager.triggerCleanup(aggressive);
      sendSuccess(res, result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_triggering_cleanup_error',
        message: `Error triggering cleanup: ${error}`,
        error
      });
      sendError(res, 'Failed to trigger cleanup', 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * GET /scope-violations
   * Get scope violation reports
   */
  router.get('/scope-violations', async (_req: Request, res: Response) => {
    try {
      const violations = await devBotsManager.getScopeViolations();
      sendSuccess(res, violations);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_scope_violations_error',
        message: `Error getting scope violations: ${error}`,
        error
      });
      sendError(res, 'Failed to get scope violations', 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * POST /emergency-recovery
   * Trigger emergency recovery procedures
   */
  router.post('/emergency-recovery', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.triggerEmergencyRecovery();
      sendSuccess(res, result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_emergency_recovery_error',
        message: `Error during emergency recovery: ${error}`,
        error
      });
      sendError(res, 'Failed to execute emergency recovery', 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
