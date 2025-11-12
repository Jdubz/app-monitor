/**
 * System Status & Infrastructure Routes
 *
 * Endpoints for system health, metrics, and infrastructure management:
 * - System status and health checks
 * - Performance metrics and agent comparison
 * - Projects and data import/export
 * - Docker integration and management
 * - Workspace synchronization
 * - Cleanup and maintenance
 * - Emergency recovery
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { logger } from '../../utils/logger.js';
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
        res.json({ data: normalizedStatus });
      } else {
        res.status(503).json({
          error: 'Dev-Bots coordinator is not available',
          healthy: devBotsManager.isHealthy()
        });
      }
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_claude_workers_status_error',
        message: `Error getting Dev-Bots status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get Dev-Bots status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /health
   * Get health check status
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ data: {
      healthy: devBotsManager.isHealthy(),
      status: devBotsManager.isHealthy() ? 'healthy' : 'unhealthy'
    }});
  });

  /**
   * POST /start
   * Start Dev-Bots system (deprecated - system auto-starts)
   */
  router.post('/start', (_req: Request, res: Response) => {
    try {
      devBotsManager.startSystem();
      res.json({ success: true, message: 'Dev-Bots started' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_starting_claude_workers_error',
        message: `Error starting Dev-Bots: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to start Dev-Bots',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /stop
   * Stop Dev-Bots system (deprecated - use with caution)
   */
  router.post('/stop', (_req: Request, res: Response) => {
    try {
      devBotsManager.stopSystem();
      res.json({ success: true, message: 'Dev-Bots stopped' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_stopping_claude_workers_error',
        message: `Error stopping Dev-Bots: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to stop Dev-Bots',
        message: error instanceof Error ? error.message : String(error),
      });
    }
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
      res.json({ data: { metrics, stats }});
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_metrics',
        message: `Error getting metrics: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get metrics',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /agent-comparison
   * Get performance comparison metrics between agents
   */
  router.get('/agent-comparison', (_req: Request, res: Response) => {
    try {
      const comparison = devBotsManager.getAgentComparisonMetrics();
      res.json({ data: { comparison }});
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_agent_comparison',
        message: `Error getting agent comparison metrics: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get agent comparison metrics',
        message: error instanceof Error ? error.message : String(error),
      });
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
      res.json({ data: { projects }});
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_projects_error',
        message: `Error getting projects: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get projects',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Data Import/Export
  // ============================================================================

  /**
   * POST /export
   * DEPRECATED: Export system data to file
   * Task persistence layer removed in favor of SQLite
   */
  router.post('/export', async (_req: Request, res: Response) => {
    res.status(410).json({
      error: 'Export functionality deprecated',
      message: 'Task export/import functionality removed - tasks are now stored in SQLite database'
    });
  });

  /**
   * POST /import
   * DEPRECATED: Import system data from file
   * Task persistence layer removed in favor of SQLite
   */
  router.post('/import', async (_req: Request, res: Response) => {
    res.status(410).json({
      error: 'Import functionality deprecated',
      message: 'Task export/import functionality removed - tasks are now stored in SQLite database'
    });
  });

  // ============================================================================
  // Onboarding
  // ============================================================================

  /**
   * POST /onboarding/complete
   * Mark worker onboarding as complete
   */
  router.post('/onboarding/complete', async (req: Request, res: Response) => {
    try {
      const { workerId } = req.body;
      if (!workerId) {
        return res.status(400).json({ error: 'Worker ID is required' });
      }
      devBotsManager.completeWorkerOnboarding(workerId);
      res.json({ success: true, message: 'Onboarding completed' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_completing_onboarding_error',
        message: `Error completing onboarding: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to complete onboarding',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // Workspace Synchronization
  // ============================================================================

  /**
   * GET /workspace-sync/status
   * Get workspace synchronization status
   */
  router.get('/workspace-sync/status', async (_req: Request, res: Response) => {
    try {
      const status = await devBotsManager.getWorkspaceSyncStatus();
      res.json(status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_workspace_sync_status_error',
        message: `Error getting workspace sync status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get workspace sync status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /workspace-sync/trigger
   * Trigger workspace synchronization
   */
  router.post('/workspace-sync/trigger', async (req: Request, res: Response) => {
    try {
      const { force } = req.body;
      const result = await devBotsManager.triggerWorkspaceSync(force);
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_triggering_workspace_sync_error',
        message: `Error triggering workspace sync: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to trigger workspace sync',
        message: error instanceof Error ? error.message : String(error),
      });
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
      res.json(status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_docker_status_error',
        message: `Error getting Docker status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get Docker status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /docker/revalidate
   * Revalidate Docker environment and containers
   */
  router.post('/docker/revalidate', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.revalidateDockerEnvironment();
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_revalidating_docker_error',
        message: `Error revalidating Docker containers: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to revalidate Docker containers',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /docker/cleanup
   * Clean up orphaned Docker resources
   */
  router.post('/docker/cleanup', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.cleanupOrphanedResources();
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_cleaning_docker_error',
        message: `Error cleaning Docker resources: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to clean Docker resources',
        message: error instanceof Error ? error.message : String(error),
      });
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
      res.json(health);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_container_health_error',
        message: `Error getting container health for ${req.params.containerId}: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get container health',
        message: error instanceof Error ? error.message : String(error),
      });
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
      res.json(status);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_cleanup_status_error',
        message: `Error getting cleanup status: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get cleanup status',
        message: error instanceof Error ? error.message : String(error),
      });
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
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_triggering_cleanup_error',
        message: `Error triggering cleanup: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to trigger cleanup',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /scope-violations
   * Get scope violation reports
   */
  router.get('/scope-violations', async (_req: Request, res: Response) => {
    try {
      const violations = await devBotsManager.getScopeViolations();
      res.json(violations);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_scope_violations_error',
        message: `Error getting scope violations: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get scope violations',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /emergency-recovery
   * Trigger emergency recovery procedures
   */
  router.post('/emergency-recovery', async (_req: Request, res: Response) => {
    try {
      const result = await devBotsManager.triggerEmergencyRecovery();
      res.json(result);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_emergency_recovery_error',
        message: `Error during emergency recovery: ${error}`,
        error
      });
      res.status(500).json({
        error: 'Failed to execute emergency recovery',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
