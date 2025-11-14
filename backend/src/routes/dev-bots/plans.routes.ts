/**
 * Plans Routes
 *
 * API endpoints for AI agent-managed planning system:
 * - Create plans (AI agents create implementation plans)
 * - List plans with filters (status, priority, type)
 * - Get plan details with computed progress
 * - Update plan metadata
 * - Cancel plans
 *
 * All plan status is computed from task/PR/chain state - never manually updated.
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../../services/devBotsManager.js';
import { logger } from '../../utils/logger.js';
import { PlansService } from '../../services/plans.service.js';
import { PlanProgressCalculator } from '../../services/planProgressCalculator.service.js';
// import { PlanStatusUpdater } from '../../services/planStatusUpdater.service.js'; // TODO: Wire up event-driven updates
import type {
  CreatePlanInput,
  UpdatePlanInput,
  PlanQueryFilters,
} from '../../types/plan.js';

/**
 * Create plans routes
 */
export function createPlansRoutes(devBotsManager: DevBotsManager): Router {
  const router = Router();

  // Get database instance from task queue
  const db = devBotsManager.getTaskQueue()['db']; // Access private db property

  // Initialize services
  const plansService = new PlansService(db);
  const progressCalculator = new PlanProgressCalculator(db);
  // const statusUpdater = new PlanStatusUpdater(db, plansService, progressCalculator); // TODO: Wire up event-driven updates

  // ============================================================================
  // Plan Management Endpoints
  // ============================================================================

  /**
   * POST /plans
   * Create a new plan (typically called by AI agent)
   *
   * Request body:
   * {
   *   title: string,
   *   description?: string,
   *   plan_type: 'feature' | 'refactor' | 'fix' | 'investigation',
   *   priority: 'p0' | 'p1' | 'p2' | 'p3',
   *   created_by?: string,
   *   success_criteria?: string[],
   *   scope_boundaries?: { mustNotChange?: string[], mustNotAffect?: string[] },
   *   estimated_effort_hours?: number
   * }
   */
  router.post('/plans', (req: Request, res: Response) => {
    try {
      const input = req.body as CreatePlanInput;

      // Validate required fields
      if (!input.title) {
        res.status(400).json({
          error: 'Missing required field: title',
        });
        return;
      }

      if (!input.plan_type) {
        res.status(400).json({
          error: 'Missing required field: plan_type',
        });
        return;
      }

      if (!input.priority) {
        res.status(400).json({
          error: 'Missing required field: priority',
        });
        return;
      }

      const plan = plansService.createPlan(input);

      logger.info({
        category: 'plan',
        action: 'plan_created_via_api',
        message: `Plan created via API: ${plan.title}`,
        details: { planId: plan.id, createdBy: input.created_by },
      });

      res.status(201).json({ data: plan });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_creating_plan',
        message: `Error creating plan: ${error}`,
        error,
      });
      res.status(500).json({
        error: 'Failed to create plan',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /plans
   * List all plans with optional filters
   *
   * Query params:
   * - status: 'planning' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'
   * - priority: 'p0' | 'p1' | 'p2' | 'p3'
   * - plan_type: 'feature' | 'refactor' | 'fix' | 'investigation'
   * - created_by: string
   * - assigned_to: string
   */
  router.get('/plans', (req: Request, res: Response) => {
    try {
      const filters: PlanQueryFilters = {};

      if (req.query.status) {
        filters.status = req.query.status as PlanQueryFilters['status'];
      }
      if (req.query.priority) {
        filters.priority = req.query.priority as PlanQueryFilters['priority'];
      }
      if (req.query.plan_type) {
        filters.plan_type = req.query.plan_type as PlanQueryFilters['plan_type'];
      }
      if (req.query.created_by) {
        filters.created_by = req.query.created_by as string;
      }
      if (req.query.assigned_to) {
        filters.assigned_to = req.query.assigned_to as string;
      }

      const plans = plansService.listPlans(filters);

      // Compute lightweight progress for each plan
      const plansWithProgress = plans.map(plan => {
        const progress = progressCalculator.calculateProgress(plan.id);
        return {
          ...plan,
          progress: {
            tasksTotal: progress.tasksTotal,
            tasksCompleted: progress.tasksCompleted,
            percentComplete: progress.percentComplete,
          },
          hasBlockers: progress.chainsBlocked > 0,
        };
      });

      res.json({ data: plansWithProgress });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_listing_plans',
        message: `Error listing plans: ${error}`,
        error,
      });
      res.status(500).json({
        error: 'Failed to list plans',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /plans/:planId
   * Get detailed plan information with full progress metrics
   */
  router.get('/plans/:planId', (req: Request, res: Response) => {
    try {
      const { planId } = req.params;

      const planDetails = progressCalculator.getPlanDetails(planId);
      if (!planDetails) {
        res.status(404).json({
          error: 'Plan not found',
          message: `Plan ${planId} was not found`,
        });
        return;
      }

      res.json({ data: planDetails });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_plan_detail',
        message: `Error getting plan detail: ${error}`,
        error,
      });
      res.status(500).json({
        error: 'Failed to get plan detail',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * PATCH /plans/:planId
   * Update plan metadata (status is computed, cannot be manually updated)
   *
   * Request body: Partial<Plan> (excluding status)
   */
  router.patch('/plans/:planId', (req: Request, res: Response) => {
    try {
      const { planId } = req.params;
      const input = req.body as UpdatePlanInput;

      const updatedPlan = plansService.updatePlan(planId, input);
      if (!updatedPlan) {
        res.status(404).json({
          error: 'Plan not found',
          message: `Plan ${planId} was not found`,
        });
        return;
      }

      res.json({ data: updatedPlan });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_updating_plan',
        message: `Error updating plan: ${error}`,
        error,
      });
      res.status(500).json({
        error: 'Failed to update plan',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /plans/:planId/cancel
   * Cancel a plan
   */
  router.post('/plans/:planId/cancel', (req: Request, res: Response) => {
    try {
      const { planId } = req.params;

      const cancelledPlan = plansService.cancelPlan(planId);
      if (!cancelledPlan) {
        res.status(404).json({
          error: 'Plan not found',
          message: `Plan ${planId} was not found`,
        });
        return;
      }

      logger.info({
        category: 'plan',
        action: 'plan_cancelled_via_api',
        message: `Plan cancelled via API: ${cancelledPlan.title}`,
        details: { planId },
      });

      res.json({ data: cancelledPlan });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_cancelling_plan',
        message: `Error cancelling plan: ${error}`,
        error,
      });
      res.status(500).json({
        error: 'Failed to cancel plan',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /plans/:planId
   * Delete a plan (soft delete - tasks remain valid)
   */
  router.delete('/plans/:planId', (req: Request, res: Response) => {
    try {
      const { planId } = req.params;

      const deleted = plansService.deletePlan(planId);
      if (!deleted) {
        res.status(404).json({
          error: 'Plan not found',
          message: `Plan ${planId} was not found`,
        });
        return;
      }

      res.status(204).send();
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_deleting_plan',
        message: `Error deleting plan: ${error}`,
        error,
      });
      res.status(500).json({
        error: 'Failed to delete plan',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /plans/:planId/tasks
   * Get all tasks linked to a plan
   */
  router.get('/plans/:planId/tasks', (req: Request, res: Response) => {
    try {
      const { planId } = req.params;

      const tasks = plansService.getPlanTasks(planId);

      res.json({ data: tasks });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_plan_tasks',
        message: `Error getting plan tasks: ${error}`,
        error,
      });
      res.status(500).json({
        error: 'Failed to get plan tasks',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /plans/:planId/update-status
   * Manually trigger status recomputation (typically not needed - status updates automatically)
   */
  router.post('/plans/:planId/update-status', async (req: Request, res: Response) => {
    try {
      const { planId } = req.params;

      const plan = plansService.getPlan(planId);
      if (!plan) {
        res.status(404).json({
          error: 'Plan not found',
          message: `Plan ${planId} was not found`,
        });
        return;
      }

      // Recompute and update status
      const newStatus = progressCalculator.computeStatus(planId);
      plansService.updatePlanStatus(planId, newStatus);

      const updatedPlan = plansService.getPlan(planId);

      res.json({ data: updatedPlan });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_updating_plan_status',
        message: `Error updating plan status: ${error}`,
        error,
      });
      res.status(500).json({
        error: 'Failed to update plan status',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
