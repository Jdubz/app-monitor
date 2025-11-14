/**
 * Plans Service
 *
 * Manages AI agent-created implementation plans with automatic status computation.
 * Plans link to tasks and their status is derived from task/PR/chain state.
 *
 * ## Design Philosophy
 *
 * - Plans never get out of date - status is computed from actual task state
 * - Event-driven updates when tasks/PRs/chains change
 * - Database as source of truth
 * - AI agents create plans programmatically via API
 *
 * ## Usage
 *
 * ```typescript
 * // AI agent creates a plan
 * const plan = await plansService.createPlan({
 *   title: "Implement user authentication",
 *   plan_type: "feature",
 *   priority: "p0",
 *   created_by: "ai-agent"
 * });
 *
 * // AI agent creates tasks for the plan
 * await taskQueue.createTask({
 *   title: "Create auth schema",
 *   plan_id: plan.id
 * });
 *
 * // Status updates automatically as tasks complete
 * const progress = await plansService.getPlanProgress(plan.id);
 * ```
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import type {
  Plan,
  PlanDetails,
  PlanListItem,
  CreatePlanInput,
  UpdatePlanInput,
  PlanQueryFilters,
  PlanStatus,
} from '../types/plan.js';

export class PlansService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    logger.info({
      category: 'process',
      action: 'plans_service_initialized',
      message: 'Plans service initialized',
    });
  }

  /**
   * Create a new plan
   */
  createPlan(input: CreatePlanInput): Plan {
    const now = Date.now();
    const plan: Plan = {
      id: `plan-${randomUUID()}`,
      title: input.title,
      description: input.description,
      markdown_ref: input.markdown_ref,
      plan_type: input.plan_type,
      priority: input.priority,
      status: 'planning', // Initial status
      created_at: now,
      created_by: input.created_by,
      assigned_to: input.assigned_to,
      success_criteria: input.success_criteria,
      scope_boundaries: input.scope_boundaries,
      estimated_effort_hours: input.estimated_effort_hours,
      metadata: input.metadata,
    };

    const stmt = this.db.prepare(`
      INSERT INTO plans (
        id, title, description, markdown_ref,
        plan_type, priority, status, created_at,
        created_by, assigned_to, success_criteria,
        scope_boundaries, estimated_effort_hours, metadata
      ) VALUES (
        @id, @title, @description, @markdown_ref,
        @plan_type, @priority, @status, @created_at,
        @created_by, @assigned_to, @success_criteria,
        @scope_boundaries, @estimated_effort_hours, @metadata
      )
    `);

    stmt.run({
      id: plan.id,
      title: plan.title,
      description: plan.description ?? null,
      markdown_ref: plan.markdown_ref ?? null,
      plan_type: plan.plan_type,
      priority: plan.priority,
      status: plan.status,
      created_at: plan.created_at,
      created_by: plan.created_by ?? null,
      assigned_to: plan.assigned_to ?? null,
      success_criteria: plan.success_criteria ? JSON.stringify(plan.success_criteria) : null,
      scope_boundaries: plan.scope_boundaries ? JSON.stringify(plan.scope_boundaries) : null,
      estimated_effort_hours: plan.estimated_effort_hours ?? null,
      metadata: plan.metadata ? JSON.stringify(plan.metadata) : null,
    });

    logger.info({
      category: 'plan',
      action: 'plan_created',
      message: `Plan created: ${plan.title}`,
      details: { planId: plan.id, type: plan.plan_type, priority: plan.priority },
    });

    return plan;
  }

  /**
   * Get a plan by ID
   */
  getPlan(planId: string): Plan | null {
    const stmt = this.db.prepare(`
      SELECT * FROM plans WHERE id = ?
    `);

    const row = stmt.get(planId) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    return this.rowToPlan(row);
  }

  /**
   * Update a plan (metadata only - status is computed)
   */
  updatePlan(planId: string, input: UpdatePlanInput): Plan | null {
    const existing = this.getPlan(planId);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: Record<string, unknown> = { id: planId };

    if (input.title !== undefined) {
      updates.push('title = @title');
      params.title = input.title;
    }
    if (input.description !== undefined) {
      updates.push('description = @description');
      params.description = input.description;
    }
    if (input.markdown_ref !== undefined) {
      updates.push('markdown_ref = @markdown_ref');
      params.markdown_ref = input.markdown_ref;
    }
    if (input.plan_type !== undefined) {
      updates.push('plan_type = @plan_type');
      params.plan_type = input.plan_type;
    }
    if (input.priority !== undefined) {
      updates.push('priority = @priority');
      params.priority = input.priority;
    }
    if (input.assigned_to !== undefined) {
      updates.push('assigned_to = @assigned_to');
      params.assigned_to = input.assigned_to;
    }
    if (input.success_criteria !== undefined) {
      updates.push('success_criteria = @success_criteria');
      params.success_criteria = JSON.stringify(input.success_criteria);
    }
    if (input.scope_boundaries !== undefined) {
      updates.push('scope_boundaries = @scope_boundaries');
      params.scope_boundaries = JSON.stringify(input.scope_boundaries);
    }
    if (input.estimated_effort_hours !== undefined) {
      updates.push('estimated_effort_hours = @estimated_effort_hours');
      params.estimated_effort_hours = input.estimated_effort_hours;
    }
    if (input.metadata !== undefined) {
      updates.push('metadata = @metadata');
      params.metadata = JSON.stringify(input.metadata);
    }

    if (updates.length === 0) {
      return existing; // No changes
    }

    const stmt = this.db.prepare(`
      UPDATE plans SET ${updates.join(', ')} WHERE id = @id
    `);

    stmt.run(params);

    logger.info({
      category: 'plan',
      action: 'plan_updated',
      message: `Plan updated: ${existing.title}`,
      details: { planId, updates: Object.keys(params).filter(k => k !== 'id') },
    });

    return this.getPlan(planId);
  }

  /**
   * Delete a plan (soft delete - tasks remain valid)
   */
  deletePlan(planId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM plans WHERE id = ?
    `);

    const result = stmt.run(planId);

    if (result.changes > 0) {
      logger.info({
        category: 'plan',
        action: 'plan_deleted',
        message: `Plan deleted: ${planId}`,
        details: { planId },
      });
      return true;
    }

    return false;
  }

  /**
   * Cancel a plan
   */
  cancelPlan(planId: string): Plan | null {
    const existing = this.getPlan(planId);
    if (!existing) {
      return null;
    }

    const stmt = this.db.prepare(`
      UPDATE plans
      SET status = 'cancelled', cancelled_at = ?
      WHERE id = ?
    `);

    stmt.run(Date.now(), planId);

    logger.info({
      category: 'plan',
      action: 'plan_cancelled',
      message: `Plan cancelled: ${existing.title}`,
      details: { planId },
    });

    return this.getPlan(planId);
  }

  /**
   * List plans with optional filters
   */
  listPlans(filters?: PlanQueryFilters): Plan[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        const placeholders = filters.status.map((_, i) => `@status${i}`).join(', ');
        conditions.push(`status IN (${placeholders})`);
        filters.status.forEach((s, i) => {
          params[`status${i}`] = s;
        });
      } else {
        conditions.push('status = @status');
        params.status = filters.status;
      }
    }

    if (filters?.priority) {
      if (Array.isArray(filters.priority)) {
        const placeholders = filters.priority.map((_, i) => `@priority${i}`).join(', ');
        conditions.push(`priority IN (${placeholders})`);
        filters.priority.forEach((p, i) => {
          params[`priority${i}`] = p;
        });
      } else {
        conditions.push('priority = @priority');
        params.priority = filters.priority;
      }
    }

    if (filters?.plan_type) {
      if (Array.isArray(filters.plan_type)) {
        const placeholders = filters.plan_type.map((_, i) => `@plan_type${i}`).join(', ');
        conditions.push(`plan_type IN (${placeholders})`);
        filters.plan_type.forEach((t, i) => {
          params[`plan_type${i}`] = t;
        });
      } else {
        conditions.push('plan_type = @plan_type');
        params.plan_type = filters.plan_type;
      }
    }

    if (filters?.created_by) {
      conditions.push('created_by = @created_by');
      params.created_by = filters.created_by;
    }

    if (filters?.assigned_to) {
      conditions.push('assigned_to = @assigned_to');
      params.assigned_to = filters.assigned_to;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = this.db.prepare(`
      SELECT * FROM plans ${whereClause} ORDER BY priority, created_at DESC
    `);

    const rows = stmt.all(params) as Array<Record<string, unknown>>;
    return rows.map(row => this.rowToPlan(row));
  }

  /**
   * Get tasks linked to a plan
   */
  getPlanTasks(planId: string): Array<{
    id: string;
    title: string;
    status: string;
    pr_number?: number;
    chain_id?: string;
    chain_status?: string;
  }> {
    const stmt = this.db.prepare(`
      SELECT
        id, title, status, pr_number, chain_id, chain_status
      FROM tasks
      WHERE plan_id = ?
      ORDER BY created_at ASC
    `);

    return stmt.all(planId) as Array<{
      id: string;
      title: string;
      status: string;
      pr_number?: number;
      chain_id?: string;
      chain_status?: string;
    }>;
  }

  /**
   * Update plan status based on task states
   * This is called by PlanStatusUpdater when tasks change
   */
  updatePlanStatus(planId: string, newStatus: PlanStatus): void {
    const now = Date.now();
    const updates: string[] = ['status = @status'];
    const params: Record<string, unknown> = { id: planId, status: newStatus };

    // Update lifecycle timestamps
    if (newStatus === 'in_progress') {
      // Only set started_at if not already set
      const plan = this.getPlan(planId);
      if (plan && !plan.started_at) {
        updates.push('started_at = @started_at');
        params.started_at = now;
      }
    } else if (newStatus === 'completed') {
      updates.push('completed_at = @completed_at');
      params.completed_at = now;
    }

    const stmt = this.db.prepare(`
      UPDATE plans SET ${updates.join(', ')} WHERE id = @id
    `);

    stmt.run(params);

    logger.info({
      category: 'plan',
      action: 'plan_status_updated',
      message: `Plan status updated to ${newStatus}`,
      details: { planId, newStatus },
    });
  }

  /**
   * Convert database row to Plan object
   */
  private rowToPlan(row: Record<string, unknown>): Plan {
    return {
      id: row.id as string,
      title: row.title as string,
      description: row.description as string | undefined,
      markdown_ref: row.markdown_ref as string | undefined,
      plan_type: row.plan_type as 'feature' | 'refactor' | 'fix' | 'investigation',
      priority: row.priority as 'p0' | 'p1' | 'p2' | 'p3',
      status: row.status as PlanStatus,
      created_at: row.created_at as number,
      started_at: row.started_at as number | undefined,
      completed_at: row.completed_at as number | undefined,
      cancelled_at: row.cancelled_at as number | undefined,
      created_by: row.created_by as string | undefined,
      assigned_to: row.assigned_to as string | undefined,
      success_criteria: row.success_criteria
        ? JSON.parse(row.success_criteria as string)
        : undefined,
      scope_boundaries: row.scope_boundaries
        ? JSON.parse(row.scope_boundaries as string)
        : undefined,
      estimated_effort_hours: row.estimated_effort_hours as number | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }
}
