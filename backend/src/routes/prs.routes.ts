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
      const gates = state.conditions ? Object.entries(state.conditions).map(([name, condition]: [string, any]) => ({
        name,
        status: condition.status,
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

  return router;
}

