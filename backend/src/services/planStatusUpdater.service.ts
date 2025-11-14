/**
 * Plan Status Updater Service
 *
 * Automatically updates plan status when tasks, PRs, or chains change.
 * Subscribes to events and recomputes plan status in real-time.
 *
 * ## Event-Driven Updates
 *
 * This service responds to:
 * - Task status changes (completed, failed, cancelled)
 * - PR status changes (merged, closed)
 * - Chain status changes (blocked, unblocked)
 *
 * ## Usage
 *
 * ```typescript
 * const updater = new PlanStatusUpdater(db, plansService, calculator);
 *
 * // Update plan status when a task completes
 * await updater.onTaskStatusChange(taskId);
 *
 * // Update plan status when a chain is blocked
 * await updater.onChainBlocked(chainId);
 * ```
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { PlansService } from './plans.service.js';
import { PlanProgressCalculator } from './planProgressCalculator.service.js';

export class PlanStatusUpdater {
  private db: Database.Database;
  private plansService: PlansService;
  private calculator: PlanProgressCalculator;

  constructor(
    db: Database.Database,
    plansService: PlansService,
    calculator: PlanProgressCalculator
  ) {
    this.db = db;
    this.plansService = plansService;
    this.calculator = calculator;
  }

  /**
   * Update plan status when a task status changes
   */
  async onTaskStatusChange(taskId: string): Promise<void> {
    const task = this.getTask(taskId);
    if (!task?.plan_id) {
      return; // Task not linked to a plan
    }

    await this.updatePlanStatus(task.plan_id);
  }

  /**
   * Update plan status when a task is created
   */
  async onTaskCreated(taskId: string): Promise<void> {
    const task = this.getTask(taskId);
    if (!task?.plan_id) {
      return;
    }

    // If this is the first task for the plan, transition from 'planning' to 'in_progress'
    const planTasks = this.calculator['getPlanTasks'](task.plan_id);
    if (planTasks.length === 1 && task.status === 'pending') {
      await this.updatePlanStatus(task.plan_id);
    }
  }

  /**
   * Update plan status when a PR is merged
   */
  async onPRMerged(prNumber: number): Promise<void> {
    const tasks = this.getTasksByPR(prNumber);
    const planIds = new Set(tasks.map(t => t.plan_id).filter(Boolean) as string[]);

    for (const planId of planIds) {
      await this.updatePlanStatus(planId);
    }
  }

  /**
   * Update plan status when a chain is blocked
   */
  async onChainBlocked(chainId: string): Promise<void> {
    const tasks = this.getTasksByChain(chainId);
    const planIds = new Set(tasks.map(t => t.plan_id).filter(Boolean) as string[]);

    for (const planId of planIds) {
      await this.updatePlanStatus(planId);
    }
  }

  /**
   * Update plan status when a chain is unblocked
   */
  async onChainUnblocked(chainId: string): Promise<void> {
    const tasks = this.getTasksByChain(chainId);
    const planIds = new Set(tasks.map(t => t.plan_id).filter(Boolean) as string[]);

    for (const planId of planIds) {
      await this.updatePlanStatus(planId);
    }
  }

  /**
   * Update plan status for all plans (batch operation)
   */
  async updateAllPlanStatuses(): Promise<void> {
    const plans = this.plansService.listPlans();

    for (const plan of plans) {
      await this.updatePlanStatus(plan.id);
    }

    logger.info({
      category: 'plan',
      action: 'batch_status_update',
      message: `Updated status for ${plans.length} plans`,
      details: { planCount: plans.length },
    });
  }

  /**
   * Core method to recompute and update plan status
   */
  private async updatePlanStatus(planId: string): Promise<void> {
    try {
      const newStatus = this.calculator.computeStatus(planId);
      this.plansService.updatePlanStatus(planId, newStatus);

      logger.debug({
        category: 'plan',
        action: 'status_computed',
        message: `Plan status computed: ${newStatus}`,
        details: { planId, newStatus },
      });
    } catch (error) {
      logger.error({
        category: 'plan',
        action: 'status_update_failed',
        message: `Failed to update plan status for ${planId}`,
        details: { planId, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  /**
   * Get task by ID
   */
  private getTask(taskId: string): { plan_id?: string; status: string } | null {
    const stmt = this.db.prepare('SELECT plan_id, status FROM tasks WHERE id = ?');
    return stmt.get(taskId) as { plan_id?: string; status: string } | null;
  }

  /**
   * Get tasks by PR number
   */
  private getTasksByPR(prNumber: number): Array<{ plan_id?: string }> {
    const stmt = this.db.prepare('SELECT plan_id FROM tasks WHERE pr_number = ?');
    return stmt.all(prNumber) as Array<{ plan_id?: string }>;
  }

  /**
   * Get tasks by chain ID
   */
  private getTasksByChain(chainId: string): Array<{ plan_id?: string }> {
    const stmt = this.db.prepare('SELECT plan_id FROM tasks WHERE chain_id = ?');
    return stmt.all(chainId) as Array<{ plan_id?: string }>;
  }
}
