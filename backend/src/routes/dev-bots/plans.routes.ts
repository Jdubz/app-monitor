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
import { sendSuccess, sendError } from '../../utils/apiResponse.js';
import { requireApiKey } from '../../middleware/auth.js';
import {
  validateCreatePlanInput,
  validateUpdatePlanInput,
  validatePlanQueryFilters,
} from '../../utils/planValidation.js';
import { PlansService } from '../../services/plans.service.js';
import { PlanProgressCalculator } from '../../services/planProgressCalculator.service.js';
import { initializePlanStatusUpdater } from '../../services/planStatusUpdater.singleton.js';
import type {
  CreatePlanInput,
  UpdatePlanInput,
  PlanQueryFilters,
  PlanResponse,
  PlansListResponse,
  PlanDetailsResponse,
  PlanTasksResponse,
  PlanDeleteResponse,
  PlanCancelResponse,
  ApiError,
} from '@app-monitor/api-contracts';

/**
 * Create plans routes
 */
export function createPlansRoutes(devBotsManager: DevBotsManager): Router {
  const router = Router();

  // Apply authentication to all plan endpoints
  router.use(requireApiKey);

  // Get database instance from task queue
  const db = devBotsManager.getTaskQueue().getDatabase();

  // Initialize singleton plan status updater (if not already initialized)
  initializePlanStatusUpdater(db);

  // Initialize services
  const plansService = new PlansService(db);
  const progressCalculator = new PlanProgressCalculator(db);

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
      // Validate input
      const validation = validateCreatePlanInput(req.body);
      if (!validation.valid) {
        const errorMessage = validation.errors.length > 0
          ? validation.errors.map(e => e.message).join('; ')
          : 'Validation failed';
        const errorResponse: ApiError = {
          success: false,
          error: errorMessage,
          details: validation.errors,
        };
        sendError(res, errorResponse.error, 400, { message: errorResponse.message });
        return;
      }

      const input = req.body as CreatePlanInput;
      const plan = plansService.createPlan(input);

      logger.info({
        category: 'plan',
        action: 'plan_created_via_api',
        message: `Plan created via API: ${plan.title}`,
        details: { planId: plan.id, createdBy: input.created_by },
      });

      const response: PlanResponse = { success: true, data: plan };
      sendSuccess(res, response, 201);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_creating_plan',
        message: `Error creating plan: ${error}`,
        error,
      });
      const errorResponse: ApiError = {
        success: false,
        error: 'Failed to create plan',
        message: error instanceof Error ? error.message : String(error),
      };
      sendError(res, errorResponse.error, 500, { message: errorResponse.message });
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
      // Validate query filters
      const validation = validatePlanQueryFilters(req.query as Record<string, unknown>);
      if (!validation.valid) {
        const errorMessage = validation.errors.length > 0
          ? validation.errors.map(e => e.message).join('; ')
          : 'Validation failed';
        const errorResponse: ApiError = {
          success: false,
          error: errorMessage,
          details: validation.errors,
        };
        sendError(res, errorResponse.error, 400, { message: errorResponse.message });
        return;
      }

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

      const response: PlansListResponse = { success: true, data: plans };
      sendSuccess(res, response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_listing_plans',
        message: `Error listing plans: ${error}`,
        error,
      });
      const errorResponse: ApiError = {
        success: false,
        error: 'Failed to list plans',
        message: error instanceof Error ? error.message : String(error),
      };
      sendError(res, errorResponse.error, 500, { message: errorResponse.message });
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
        const errorResponse: ApiError = {
          success: false,
          error: 'Plan not found',
          message: `Plan ${planId} was not found`,
        };
        sendError(res, errorResponse.error, 404, { message: errorResponse.message });
        return;
      }

      const response: PlanDetailsResponse = { success: true, data: planDetails };
      sendSuccess(res, response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_plan_detail',
        message: `Error getting plan detail: ${error}`,
        error,
      });
      const errorResponse: ApiError = {
        success: false,
        error: 'Failed to get plan detail',
        message: error instanceof Error ? error.message : String(error),
      };
      sendError(res, errorResponse.error, 500, { message: errorResponse.message });
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

      // Validate input
      const validation = validateUpdatePlanInput(req.body);
      if (!validation.valid) {
        const errorMessage = validation.errors.length > 0
          ? validation.errors.map(e => e.message).join('; ')
          : 'Validation failed';
        const errorResponse: ApiError = {
          success: false,
          error: errorMessage,
          details: validation.errors,
        };
        sendError(res, errorResponse.error, 400, { message: errorResponse.message });
        return;
      }

      const input = req.body as UpdatePlanInput;
      const updatedPlan = plansService.updatePlan(planId, input);
      if (!updatedPlan) {
        const errorResponse: ApiError = {
          success: false,
          error: 'Plan not found',
          message: `Plan ${planId} was not found`,
        };
        sendError(res, errorResponse.error, 404, { message: errorResponse.message });
        return;
      }

      const response: PlanResponse = { success: true, data: updatedPlan };
      sendSuccess(res, response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_updating_plan',
        message: `Error updating plan: ${error}`,
        error,
      });
      const errorResponse: ApiError = {
        success: false,
        error: 'Failed to update plan',
        message: error instanceof Error ? error.message : String(error),
      };
      sendError(res, errorResponse.error, 500, { message: errorResponse.message });
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
        const errorResponse: ApiError = {
          success: false,
          error: 'Plan not found',
          message: `Plan ${planId} was not found`,
        };
        sendError(res, errorResponse.error, 404, { message: errorResponse.message });
        return;
      }

      logger.info({
        category: 'plan',
        action: 'plan_cancelled_via_api',
        message: `Plan cancelled via API: ${cancelledPlan.title}`,
        details: { planId },
      });

      const response: PlanCancelResponse = { success: true, data: cancelledPlan };
      sendSuccess(res, response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_cancelling_plan',
        message: `Error cancelling plan: ${error}`,
        error,
      });
      const errorResponse: ApiError = {
        success: false,
        error: 'Failed to cancel plan',
        message: error instanceof Error ? error.message : String(error),
      };
      sendError(res, errorResponse.error, 500, { message: errorResponse.message });
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

      const response: PlanDeleteResponse = {
        success: true,
        data: {
          message: deleted
            ? `Plan ${planId} deleted successfully`
            : `Plan ${planId} was not found`,
          deleted,
        },
      };
      sendSuccess(res, response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_deleting_plan',
        message: `Error deleting plan: ${error}`,
        error,
      });
      const errorResponse: ApiError = {
        success: false,
        error: 'Failed to delete plan',
        message: error instanceof Error ? error.message : String(error),
      };
      sendError(res, errorResponse.error, 500, { message: errorResponse.message });
    }
  });

  /**
   * GET /plans/:planId/tasks
   * Get all tasks linked to a plan
   */
  router.get('/plans/:planId/tasks', (req: Request, res: Response) => {
    try {
      const { planId } = req.params;

      // Check if plan exists
      const plan = plansService.getPlan(planId);
      if (!plan) {
        const errorResponse: ApiError = {
          success: false,
          error: 'Plan not found',
          message: `Plan ${planId} was not found`,
        };
        sendError(res, errorResponse.error, 404, { message: errorResponse.message });
        return;
      }

      const tasks = plansService.getPlanTasks(planId);

      const response: PlanTasksResponse = { success: true, data: tasks };
      sendSuccess(res, response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_plan_tasks',
        message: `Error getting plan tasks: ${error}`,
        error,
      });
      const errorResponse: ApiError = {
        success: false,
        error: 'Failed to get plan tasks',
        message: error instanceof Error ? error.message : String(error),
      };
      sendError(res, errorResponse.error, 500, { message: errorResponse.message });
    }
  });

  /**
   * POST /plans/:planId/update-status
   * Manually trigger status recomputation (typically not needed - status updates automatically)
   */
  router.post('/plans/:planId/update-status', (req: Request, res: Response) => {
    try {
      const { planId } = req.params;

      const plan = plansService.getPlan(planId);
      if (!plan) {
        const errorResponse: ApiError = {
          success: false,
          error: 'Plan not found',
          message: `Plan ${planId} was not found`,
        };
        sendError(res, errorResponse.error, 404, { message: errorResponse.message });
        return;
      }

      // Recompute and update status
      const newStatus = progressCalculator.computeStatus(planId);
      plansService.updatePlanStatus(planId, newStatus);

      const updatedPlan = plansService.getPlan(planId);

      const response: PlanResponse = {
        success: true,
        data: { ...plan, status: newStatus, ...updatedPlan },
      };
      sendSuccess(res, response);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_updating_plan_status',
        message: `Error updating plan status: ${error}`,
        error,
      });
      const errorResponse: ApiError = {
        success: false,
        error: 'Failed to update plan status',
        message: error instanceof Error ? error.message : String(error),
      };
      sendError(res, errorResponse.error, 500, { message: errorResponse.message });
    }
  });

  return router;
}
