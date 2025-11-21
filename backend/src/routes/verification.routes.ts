/**
 * Task Verification API Routes
 *
 * Provides endpoints for:
 * - Manually triggering task verification
 * - Retrieving verification results
 * - Getting verification statistics
 */

import { Router, Request, Response } from 'express';
import { getTaskVerificationService } from '../services/taskVerification.service.js';
import { logger } from '../utils/logger.js';
import { getTaskQueueService } from '../services/taskQueue.factory.js';
import { defineRoute } from './routeRegistry.js';
import type {
  VerifyTaskRequest,
  VerifyTaskResponse,
  VerificationStatsResponse,
  VerificationRecommendationsResponse,
} from '@app-monitor/api-contracts';

const router = Router();

/**
 * GET /api/verification/task/:taskId
 * Get verification results for a specific task
 */
const getVerificationResultRoute = defineRoute<never, VerifyTaskResponse, never, { taskId: string }>({
  method: 'get',
  path: '/task/:taskId',
  summary: 'Get Task Verification Result',
  description: 'Retrieve verification results for a specific task',
  tags: ['verification'],
  response: {
    body: {} as VerifyTaskResponse,
    status: 200,
    description: 'Verification results retrieved successfully'
  },
  handler: async (req: Request, res: Response) => {
    const { taskId } = req.params;

    try {
      const verificationService = getTaskVerificationService();
      const verificationData = verificationService.getVerificationResult(taskId);

      if (verificationData) {
        res.json({
          status: 'success',
          data: verificationData
        });
      } else {
        res.status(404).json({
          status: 'error',
          message: 'No verification results found for this task'
        });
      }
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'get_verification_failed',
        message: `Failed to get verification for task ${taskId}`,
        error
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve verification results'
      });
    }
  }
});
router[getVerificationResultRoute.method](getVerificationResultRoute.path, getVerificationResultRoute.handler);

/**
 * POST /api/verification/verify/:taskId
 * Manually trigger verification for a task
 */
const verifyTaskRoute = defineRoute<VerifyTaskRequest, VerifyTaskResponse, never, { taskId: string }>({
  method: 'post',
  path: '/verify/:taskId',
  summary: 'Verify Task',
  description: 'Manually trigger verification for a task',
  tags: ['verification'],
  request: {
    body: {} as VerifyTaskRequest
  },
  response: {
    body: {} as VerifyTaskResponse,
    status: 200,
    description: 'Task verification completed'
  },
  handler: async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const { workspacePath } = req.body;

    try {
      const taskQueue = getTaskQueueService();
      const task = taskQueue.getTask(taskId);

      if (!task) {
        return res.status(404).json({
          status: 'error',
          message: 'Task not found'
        });
      }

      const verificationService = getTaskVerificationService();

      // Use provided workspace path or default
      const workspace = workspacePath || process.cwd();

      logger.info({
        category: 'api',
        action: 'manual_verification_started',
        message: `Manually triggering verification for task ${taskId}`,
        details: { taskId, workspace }
      });

      // Run verification
      const result = await verificationService.verifyTask(
        task,
        workspace,
        task.output || ''
      );

      // Store result in database using service
      verificationService.storeVerificationResult(result);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'manual_verification_failed',
        message: `Failed to verify task ${taskId}`,
        error
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to run verification',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
});
router[verifyTaskRoute.method](verifyTaskRoute.path, verifyTaskRoute.handler);

/**
 * GET /api/verification/stats
 * Get verification statistics
 */
const getVerificationStatsRoute = defineRoute<never, VerificationStatsResponse>({
  method: 'get',
  path: '/stats',
  summary: 'Get Verification Statistics',
  description: 'Retrieve verification statistics across all tasks',
  tags: ['verification'],
  response: {
    body: {} as VerificationStatsResponse,
    status: 200,
    description: 'Verification statistics retrieved successfully'
  },
  handler: async (req: Request, res: Response) => {
    try {
      const verificationService = getTaskVerificationService();
      const stats = verificationService.getVerificationStats();

      res.json({
        status: 'success',
        data: stats
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'get_verification_stats_failed',
        message: 'Failed to get verification statistics',
        error
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve verification statistics'
      });
    }
  }
});
router[getVerificationStatsRoute.method](getVerificationStatsRoute.path, getVerificationStatsRoute.handler);

/**
 * GET /api/verification/recommendations/:taskId
 * Get verification recommendations for a task
 */
const getVerificationRecommendationsRoute = defineRoute<never, VerificationRecommendationsResponse, never, { taskId: string }>({
  method: 'get',
  path: '/recommendations/:taskId',
  summary: 'Get Verification Recommendations',
  description: 'Retrieve verification recommendations for a specific task',
  tags: ['verification'],
  response: {
    body: {} as VerificationRecommendationsResponse,
    status: 200,
    description: 'Verification recommendations retrieved successfully'
  },
  handler: async (req: Request, res: Response) => {
    const { taskId } = req.params;

    try {
      const verificationService = getTaskVerificationService();
      const recommendationData = verificationService.getRecommendations(taskId);

      if (!recommendationData) {
        return res.status(404).json({
          status: 'error',
          message: 'No verification results found for this task'
        });
      }

      res.json({
        status: 'success',
        data: recommendationData
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'get_recommendations_failed',
        message: `Failed to get recommendations for task ${taskId}`,
        error
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve recommendations'
      });
    }
  }
});
router[getVerificationRecommendationsRoute.method](getVerificationRecommendationsRoute.path, getVerificationRecommendationsRoute.handler);

export default router;
