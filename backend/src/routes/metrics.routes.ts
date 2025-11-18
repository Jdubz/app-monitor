/**
 * Metrics API Routes
 * 
 * Exposes phase system metrics and analytics for monitoring and debugging.
 * Provides insights into phase execution performance, success rates, and recovery statistics.
 */

import express, { Request, Response } from 'express';
import { ApiError } from '@app-monitor/api-contracts';
import { PhaseMetricsService } from '../services/phaseMetrics.service.js';
import { getDatabase } from '../services/database.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Initialize PhaseMetricsService
const metricsService = new PhaseMetricsService(getDatabase().getDb());

/**
 * Helper to respond with success
 */
const respondSuccess = <T>(res: Response, data: T, status = 200) => {
  return res.status(status).json({
    success: true,
    data,
  });
};

/**
 * Helper to respond with error
 */
const respondError = (res: Response, status: number, error: string, message?: string) => {
  const payload: ApiError = {
    success: false,
    error,
    ...(message ? { message } : {}),
  };
  return res.status(status).json(payload);
};

/**
 * GET /api/metrics/phases
 * Get aggregate metrics for all phases
 */
router.get('/phases', async (req: Request, res: Response) => {
  try {
    const metrics = metricsService.getMetrics();
    respondSuccess(res, metrics);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'metrics_phases_error',
      message: 'Failed to fetch phase metrics',
      error: error instanceof Error ? error : new Error(String(error)),
    });
    respondError(res, 500, 'FAILED_TO_GET_PHASE_METRICS', 'Failed to retrieve phase metrics');
  }
});

/**
 * GET /api/metrics/phases/:phaseIndex
 * Get detailed metrics for a specific phase
 */
router.get('/phases/:phaseIndex', async (req: Request, res: Response) => {
  try {
    const phaseIndex = parseInt(req.params.phaseIndex, 10);

    if (isNaN(phaseIndex) || phaseIndex < 1 || phaseIndex > 7) {
      return respondError(res, 400, 'INVALID_PHASE_INDEX', 'Phase index must be between 1 and 7');
    }

    const metrics = metricsService.getPhaseMetrics(phaseIndex);
    
    if (!metrics) {
      return respondError(res, 404, 'PHASE_METRICS_NOT_FOUND', `No metrics found for phase ${phaseIndex}`);
    }
    
    respondSuccess(res, metrics);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'metrics_phase_error',
      message: `Failed to fetch metrics for phase ${req.params.phaseIndex}`,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    respondError(res, 500, 'FAILED_TO_GET_PHASE_METRICS', `Failed to retrieve metrics for phase ${req.params.phaseIndex}`);
  }
});

/**
 * GET /api/metrics/loops
 * Get phase loop statistics (Phase 3↔4 and Phase 5 internal loops)
 */
router.get('/loops', async (req: Request, res: Response) => {
  try {
    const metrics = metricsService.getMetrics();
    respondSuccess(res, metrics.loopStats);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'metrics_loops_error',
      message: 'Failed to fetch loop statistics',
      error: error instanceof Error ? error : new Error(String(error)),
    });
    respondError(res, 500, 'FAILED_TO_GET_LOOP_STATS', 'Failed to retrieve loop statistics');
  }
});

/**
 * GET /api/metrics/recovery
 * Get recovery agent statistics
 */
router.get('/recovery', async (req: Request, res: Response) => {
  try {
    const metrics = metricsService.getMetrics();
    respondSuccess(res, metrics.recoveryStats);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'metrics_recovery_error',
      message: 'Failed to fetch recovery statistics',
      error: error instanceof Error ? error : new Error(String(error)),
    });
    respondError(res, 500, 'FAILED_TO_GET_RECOVERY_STATS', 'Failed to retrieve recovery statistics');
  }
});

/**
 * GET /api/metrics/distribution
 * Get current phase distribution of active tasks
 */
router.get('/distribution', async (req: Request, res: Response) => {
  try {
    const metrics = metricsService.getMetrics();
    respondSuccess(res, metrics.activeTaskDistribution);
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'metrics_distribution_error',
      message: 'Failed to fetch phase distribution',
      error: error instanceof Error ? error : new Error(String(error)),
    });
    respondError(res, 500, 'FAILED_TO_GET_PHASE_DISTRIBUTION', 'Failed to retrieve phase distribution');
  }
});

/**
 * POST /api/metrics/cache/invalidate
 * Invalidate the metrics cache (force fresh query on next request)
 */
router.post('/cache/invalidate', (req: Request, res: Response) => {
  try {
    metricsService.clearCache();
    respondSuccess(res, { message: 'Metrics cache invalidated' });
  } catch (error) {
    logger.error({
      category: 'api',
      action: 'metrics_cache_invalidate_error',
      message: 'Failed to invalidate metrics cache',
      error: error instanceof Error ? error : new Error(String(error)),
    });
    respondError(res, 500, 'FAILED_TO_INVALIDATE_CACHE', 'Failed to invalidate metrics cache');
  }
});

export default router;
