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
import { defineRoute } from './routeRegistry.js';

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

const getPhasesMetricsRoute = defineRoute({
  method: 'get',
  path: '/phases',
  summary: 'Get Phase Metrics',
  description: 'Get aggregate metrics for all phases including success rates and performance',
  tags: ['metrics'],
  handler: async (req: Request, res: Response) => {
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
  }
});
router[getPhasesMetricsRoute.method](getPhasesMetricsRoute.path, getPhasesMetricsRoute.handler);

const getPhaseMetricsRoute = defineRoute({
  method: 'get',
  path: '/phases/:phaseIndex',
  summary: 'Get Phase-Specific Metrics',
  description: 'Get detailed metrics for a specific phase (1-7)',
  tags: ['metrics'],
  handler: async (req: Request, res: Response) => {
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
  }
});
router[getPhaseMetricsRoute.method](getPhaseMetricsRoute.path, getPhaseMetricsRoute.handler);

const getLoopStatsRoute = defineRoute({
  method: 'get',
  path: '/loops',
  summary: 'Get Loop Statistics',
  description: 'Get phase loop statistics (Phase 3↔4 and Phase 5 internal loops)',
  tags: ['metrics'],
  handler: async (req: Request, res: Response) => {
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
  }
});
router[getLoopStatsRoute.method](getLoopStatsRoute.path, getLoopStatsRoute.handler);

const getRecoveryStatsRoute = defineRoute({
  method: 'get',
  path: '/recovery',
  summary: 'Get Recovery Statistics',
  description: 'Get recovery agent statistics and success rates',
  tags: ['metrics'],
  handler: async (req: Request, res: Response) => {
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
  }
});
router[getRecoveryStatsRoute.method](getRecoveryStatsRoute.path, getRecoveryStatsRoute.handler);

const getDistributionRoute = defineRoute({
  method: 'get',
  path: '/distribution',
  summary: 'Get Phase Distribution',
  description: 'Get current phase distribution of active tasks',
  tags: ['metrics'],
  handler: async (req: Request, res: Response) => {
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
  }
});
router[getDistributionRoute.method](getDistributionRoute.path, getDistributionRoute.handler);

const invalidateCacheRoute = defineRoute({
  method: 'post',
  path: '/cache/invalidate',
  summary: 'Invalidate Metrics Cache',
  description: 'Invalidate the metrics cache to force fresh query on next request',
  tags: ['metrics'],
  handler: (req: Request, res: Response) => {
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
  }
});
router[invalidateCacheRoute.method](invalidateCacheRoute.path, invalidateCacheRoute.handler);

export default router;
