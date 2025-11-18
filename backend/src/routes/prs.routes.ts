import express, { Request, Response } from 'express';
import { getPRConditionStateService } from '../services/prConditionState.service.js';
import { getMockPRRegistry } from '../services/mockPRRegistry.service.js';
import { logger } from '../utils/logger.js';
import type { DevBotsManager } from '../services/devBotsManager.js';

export function createPRsRouter(devBotsManager: DevBotsManager) {
  const router = express.Router();
  const taskQueue = devBotsManager.getTaskQueue();
  const prConditionState = getPRConditionStateService(taskQueue);

  /**
   * POST /prs/:prNumber/evaluate-gates
   * Trigger PR gate evaluation
   */
  router.post('/:prNumber/evaluate-gates', async (req: Request, res: Response) => {
    try {
      const prNumber = parseInt(req.params.prNumber, 10);
      
      if (isNaN(prNumber)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid PR number'
        });
      }

      const { force } = req.body;
      const eventType = force ? 'manual_restart' : 'pull_request_opened';

      logger.info({
        category: 'api',
        action: 'pr_gate_evaluation_requested',
        message: `PR gate evaluation requested for PR #${prNumber}`,
        details: { prNumber, eventType, force }
      });

      await prConditionState.evaluateConditions(prNumber, eventType);

      res.json({
        success: true,
        data: {
          message: `Gate evaluation triggered for PR #${prNumber}`,
          prNumber,
          eventType
        }
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'pr_gate_evaluation_failed',
        message: `Failed to evaluate gates for PR #${req.params.prNumber}`,
        error
      });

      res.status(500).json({
        success: false,
        error: 'Failed to evaluate PR gates'
      });
    }
  });

  /**
   * GET /prs/:prNumber/gates
   * Get current gate status for a PR
   */
  router.get('/:prNumber/gates', async (req: Request, res: Response) => {
    try {
      const prNumber = parseInt(req.params.prNumber, 10);
      
      if (isNaN(prNumber)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid PR number'
        });
      }

      // Get PR condition state from service
      const state = await prConditionState.getState(prNumber);

      if (!state) {
        return res.status(404).json({
          success: false,
          error: 'PR not found'
        });
      }

      // Convert conditions object to array format expected by tests
      // Map internal status to test-friendly values
      const statusMap: Record<string, string> = {
        'met': 'pass',
        'unmet': 'fail',
        'not_ready': 'pending'
      };

      interface ConditionData {
        status: string;
        blocking_issues?: string[];
        last_checked?: string;
      }

      const gates = state.conditions ? Object.entries(state.conditions).map(([name, condition]: [string, unknown]) => {
        const cond = condition as ConditionData;
        return {
          name,
          status: statusMap[cond.status] || cond.status,
          blocking: true, // All 8 conditions are blocking
          blocking_issues: cond.blocking_issues || [],
          last_checked: cond.last_checked
        };
      }) : [];

      res.json({
        success: true,
        data: {
          gates,
          merge_eligible: state.merge_eligible || false,
          last_evaluated: state.last_evaluated || 0
        }
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'pr_gates_fetch_failed',
        message: `Failed to fetch gates for PR #${req.params.prNumber}`,
        error
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch PR gates'
      });
    }
  });

  /**
   * POST /prs/mock/register (TEST ONLY)
   * Register a mock PR for E2E testing
   * Used by E2E tests to provide mock GitHub PR data to the backend
   */
  router.post('/mock/register', async (req: Request, res: Response) => {
    // Only allow in test mode
    if (process.env.NODE_ENV !== 'test') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available in test mode'
      });
    }

    try {
      const mockPRData = req.body;

      if (!mockPRData.number) {
        return res.status(400).json({
          success: false,
          error: 'PR number is required'
        });
      }

      logger.info({
        category: 'api',
        action: 'mock_pr_registration',
        message: `Registering mock PR #${mockPRData.number} for E2E testing`,
        details: { prNumber: mockPRData.number }
      });

      const mockRegistry = getMockPRRegistry();
      mockRegistry.registerMockPR(mockPRData);

      res.json({
        success: true,
        data: {
          message: `Mock PR #${mockPRData.number} registered`,
          prNumber: mockPRData.number
        }
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'mock_pr_registration_failed',
        message: 'Failed to register mock PR',
        error
      });

      res.status(500).json({
        success: false,
        error: 'Failed to register mock PR'
      });
    }
  });

  /**
   * POST /prs/:prNumber/complete-validation (TEST ONLY)
   * Complete pr-validation task with verification results
   * Used by E2E tests to simulate validation task completion
   */
  router.post('/:prNumber/complete-validation', async (req: Request, res: Response) => {
    // Only allow in test mode
    if (process.env.NODE_ENV !== 'test') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available in test mode'
      });
    }

    try {
      const prNumber = parseInt(req.params.prNumber, 10);
      
      if (isNaN(prNumber)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid PR number'
        });
      }

      const { score = 85, issues = [] } = req.body;

      logger.info({
        category: 'api',
        action: 'test_complete_validation',
        message: `E2E test completing validation for PR #${prNumber}`,
        details: { prNumber, score }
      });

      // Find pr-validation task for this PR
      const tasks = await taskQueue.findByPRNumber(prNumber);
      const validationTask = tasks.find(t => t.type === 'pr-validation' && t.status === 'pending');

      if (!validationTask) {
        return res.status(404).json({
          success: false,
          error: 'No pending pr-validation task found for this PR'
        });
      }

      // Update task to completed with verification results
      const verificationResults = JSON.stringify({
        score,
        issues,
        timestamp: Date.now()
      });

      await taskQueue.updateTask(validationTask.id, {
        status: 'completed',
        verification_passed: score >= 80,
        verification_results: verificationResults,
        completed_at: Date.now()
      });

      // Trigger condition re-evaluation
      await prConditionState.evaluateConditions(prNumber, 'task_completion');

      res.json({
        success: true,
        data: {
          message: `Validation completed for PR #${prNumber}`,
          taskId: validationTask.id,
          score,
          passed: score >= 80
        }
      });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'test_complete_validation_failed',
        message: `Failed to complete validation for PR #${req.params.prNumber}`,
        error
      });

      res.status(500).json({
        success: false,
        error: 'Failed to complete validation task'
      });
    }
  });

  return router;
}

