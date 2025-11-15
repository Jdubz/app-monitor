/**
 * Plan Progress Calculator Service
 *
 * Computes plan progress, status, and metrics from task/PR/chain states.
 * All metrics are derived in real-time - never manually updated.
 *
 * ## Status Computation Rules
 *
 * - `planning`: No tasks created yet
 * - `blocked`: Any task has blocked chain status
 * - `completed`: All tasks completed or cancelled
 * - `in_progress`: At least one task running/pending
 * - `cancelled`: Manually cancelled
 *
 * ## Usage
 *
 * ```typescript
 * const calculator = new PlanProgressCalculator(db);
 *
 * // Compute progress for a plan
 * const progress = calculator.calculateProgress(planId);
 * // => { tasksTotal: 5, tasksCompleted: 2, percentComplete: 40, ... }
 *
 * // Compute status from task states
 * const status = calculator.computeStatus(planId);
 * // => 'in_progress'
 * ```
 */

import Database from 'better-sqlite3';
import type {
  PlanProgress,
  PlanPRStatus,
  PlanChainStatus,
  PlanStatus,
  PlanDetails,
} from '../types/plan.js';
import type { Task } from './taskQueue.sqlite.js';

export class PlanProgressCalculator {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Calculate comprehensive progress metrics for a plan
   */
  calculateProgress(planId: string): PlanProgress {
    const tasks = this.getPlanTasks(planId);

    // Task status breakdown
    const tasksTotal = tasks.length;
    const tasksCancelled = tasks.filter(t => t.status === 'cancelled').length;
    // Count both completed and cancelled tasks as "done" for progress tracking
    const tasksCompleted = tasks.filter(t => t.status === 'completed' || t.status === 'cancelled').length;
    const tasksPending = tasks.filter(t => t.status === 'pending').length;
    const tasksRunning = tasks.filter(t => t.status === 'running').length;
    const tasksFailed = tasks.filter(t => t.status === 'failed').length;

    // PR status breakdown
    // Note: We only track pr_number. PR status must be fetched from GitHub API.
    // For now, count tasks with PRs (full PR integration pending)
    const tasksWithPR = tasks.filter(t => t.pr_number);
    const prsTotal = tasksWithPR.length;
    const prsMerged = 0; // TODO: Fetch from GitHub API
    const prsOpen = 0; // TODO: Fetch from GitHub API
    const prsClosed = 0; // TODO: Fetch from GitHub API
    const prsBlocked = 0; // TODO: Fetch from GitHub API

    // Chain status breakdown
    const chainsActive = tasks.filter(t => t.chain_status === 'active').length;
    const chainsBlocked = tasks.filter(t => t.chain_status === 'blocked').length;
    const chainsClosed = tasks.filter(t => t.chain_status === 'closed').length;

    // Overall progress percentage
    const percentComplete = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

    // Estimated hours remaining
    const estimatedHoursRemaining = this.calculateRemainingEffort(planId, tasks);

    return {
      tasksTotal,
      tasksCompleted,
      tasksPending,
      tasksRunning,
      tasksFailed,
      tasksCancelled,
      prsTotal,
      prsMerged,
      prsOpen,
      prsClosed,
      prsBlocked,
      chainsActive,
      chainsBlocked,
      chainsClosed,
      percentComplete,
      estimatedHoursRemaining,
    };
  }

  /**
   * Compute plan status from task states
   */
  computeStatus(planId: string): PlanStatus {
    const tasks = this.getPlanTasks(planId);

    // No tasks - still in planning
    if (tasks.length === 0) {
      return 'planning';
    }

    // Check for blocked chains
    const hasBlockedChain = tasks.some(t => t.chain_status === 'blocked');
    if (hasBlockedChain) {
      return 'blocked';
    }

    // Check if all tasks are done
    const allTasksDone = tasks.every(t => t.status === 'completed' || t.status === 'cancelled');
    if (allTasksDone) {
      return 'completed';
    }

    // Check if any tasks are active
    const hasActiveTasks = tasks.some(t => t.status === 'running' || t.status === 'pending');
    if (hasActiveTasks) {
      return 'in_progress';
    }

    return 'planning';
  }

  /**
   * Get PR status for a plan
   */
  getPRStatus(planId: string): PlanPRStatus {
    const tasks = this.getPlanTasks(planId);
    const tasksWithPR = tasks.filter(t => t.pr_number);

    // Note: PR details (status, url, branch, etc.) should be fetched from GitHub API
    // For now, we only have pr_number stored in tasks table
    const prs = tasksWithPR.map(t => ({
      number: t.pr_number!,
      taskId: t.id,
      status: 'open' as const, // TODO: Fetch actual status from GitHub API
      url: undefined,
      branch: undefined,
      created_at: undefined,
      merged_at: undefined,
    }));

    // TODO: Fetch PR check status from GitHub API
    const blockingIssues: string[] = [];

    return { prs, blockingIssues };
  }

  /**
   * Get chain status for a plan
   */
  getChainStatus(planId: string): PlanChainStatus {
    const tasks = this.getPlanTasks(planId);
    const tasksWithChain = tasks.filter(t => t.chain_id);

    const chainsActive = tasksWithChain.filter(t => t.chain_status === 'active').length;
    const blockedChains = tasksWithChain
      .filter(t => t.chain_status === 'blocked')
      .map(t => ({
        chainId: t.chain_id!,
        taskId: t.id,
        blockedReason: t.blocked_reason,
        blockedAt: t.blocked_at,
      }));

    // Escalation logic: if any chain has been blocked for >24 hours
    const now = Date.now();
    const escalationThreshold = 24 * 60 * 60 * 1000; // 24 hours
    const needsEscalation = blockedChains.some(chain =>
      chain.blockedAt && (now - chain.blockedAt) > escalationThreshold
    );

    const escalationReason = needsEscalation
      ? `${blockedChains.length} chain(s) blocked for >24 hours`
      : undefined;

    return {
      activeChains: chainsActive,
      blockedChains,
      escalationNeeded: needsEscalation,
      escalationReason,
    };
  }

  /**
   * Get comprehensive plan details with all computed data
   */
  getPlanDetails(planId: string): PlanDetails | null {
    // Get base plan data
    const planRow = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as
      | Record<string, unknown>
      | undefined;

    if (!planRow) {
      return null;
    }

    const plan = this.rowToPlan(planRow);
    const progress = this.calculateProgress(planId);
    const prStatus = this.getPRStatus(planId);
    const chainStatus = this.getChainStatus(planId);
    const tasks = this.getPlanTasks(planId);
    // Compute fresh status based on current task states
    const status = this.computeStatus(planId);

    return {
      ...plan,
      status, // Override stored status with computed status
      progress,
      prStatus,
      chainStatus,
      tasks,
    };
  }

  /**
   * Get tasks for a plan
   * Made public for use by PlanStatusUpdater
   */
  getPlanTasks(planId: string): Task[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks WHERE plan_id = ? ORDER BY created_at ASC
    `);

    return stmt.all(planId) as Task[];
  }

  /**
   * Calculate estimated remaining effort
   */
  private calculateRemainingEffort(planId: string, tasks: Task[]): number | undefined {
    const plan = this.db.prepare('SELECT estimated_effort_hours FROM plans WHERE id = ?')
      .get(planId) as { estimated_effort_hours?: number } | undefined;

    if (!plan?.estimated_effort_hours) {
      return undefined;
    }

    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const totalTasks = tasks.length;

    if (totalTasks === 0) {
      return plan.estimated_effort_hours;
    }

    const percentComplete = completedTasks / totalTasks;
    const hoursSpent = plan.estimated_effort_hours * percentComplete;
    const hoursRemaining = Math.max(0, plan.estimated_effort_hours - hoursSpent);

    return Math.round(hoursRemaining * 10) / 10; // Round to 1 decimal
  }

  /**
   * Convert database row to Plan object
   */
  private rowToPlan(row: Record<string, unknown>) {
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
