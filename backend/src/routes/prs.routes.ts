import express, { Request, Response } from 'express';
import { getPRConditionStateService } from '../services/prConditionState.service.js';
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

      // Query PR condition state directly from database
      const db = taskQueue.getDatabase();
      // eslint-disable-next-line local-rules/no-direct-db-in-routes -- TODO: Move to PRConditionStateService
      const row = db.prepare(
        'SELECT state_json FROM pr_condition_states WHERE pr_number = ?'
      ).get(prNumber) as { state_json: string } | undefined;

      if (!row) {
        return res.status(404).json({
          success: false,
          error: 'PR not found'
        });
      }

      const state = JSON.parse(row.state_json);

      // Convert conditions object to array format expected by tests
      // Map internal status to test-friendly values
      const statusMap: Record<string, string> = {
        'met': 'pass',
        'unmet': 'fail',
        'not_ready': 'pending'
      };

      const gates = state.conditions ? Object.entries(state.conditions).map(([name, condition]: [string, unknown]) => ({
        name,
        status: statusMap[condition.status] || condition.status,
        blocking: true, // All 8 conditions are blocking
        blocking_issues: condition.blocking_issues || [],
        last_checked: condition.last_checked
      })) : [];

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

