/**
 * Simplified Two-Stage Failure Recovery
 *
 * When a task fails:
 * 1. Create cleanup task (simple: just fix the error)
 * 2. When cleanup completes, create followup task (simple: complete the goal)
 *
 * Key insight: Both are regular tasks with metadata, not special "repair bots"
 * - Use task queue's existing priority, concurrency, completion tracking
 * - Use metadata to link tasks and prevent duplicates
 */

import { logger } from '../utils/logger.js';
import type { Task as DevBotsTask } from './devBotsManager.js';
import { FailurePattern } from './taskFailureGuards.js';
import { DevBotsManager } from './devBotsManager.js';
import type { Task as SQLiteTask } from './taskQueue.sqlite.js';

export interface FailureContext {
  task: DevBotsTask;
  failurePattern: FailurePattern;
  stderr: string;
  stdout: string;
  exitCode: number;
}

export class SimpleFailureRecovery {
  private devBotsManager: DevBotsManager;

  constructor(devBotsManager: DevBotsManager) {
    this.devBotsManager = devBotsManager;
  }

  /**
   * Attempt recovery by creating cleanup task
   * Followup task will be created when cleanup completes
   */
  async attemptRecovery(context: FailureContext): Promise<{ recovered: boolean; cleanupTaskId?: string }> {
    const { task, failurePattern } = context;

    // CIRCULAR RECOVERY PREVENTION: Never attempt recovery on repair bots themselves
    if ((task as any).metadata?.isRepairBot) {
      logger.warn({
        category: 'recovery',
        action: 'circular_recovery_prevented',
        message: `Preventing circular recovery: task ${task.id} is already a repair bot`,
        details: {
          taskId: task.id,
          repairStage: (task as any).metadata.repairStage,
          originalTaskId: (task as any).metadata.originalTaskId
        }
      });
      return { recovered: false };
    }

    // Check if this task already has a repair process running
    if (await this.hasActiveRepair(task.id)) {
      logger.info({
        category: 'recovery',
        action: 'repair_already_running',
        message: `Task ${task.id} already has an active repair`,
        details: { taskId: task.id }
      });
      return { recovered: false };
    }

    // Check if failure is recoverable
    if (!this.isRecoverable(failurePattern)) {
      logger.info({
        category: 'recovery',
        action: 'failure_not_recoverable',
        message: `Failure type ${failurePattern.category} is not auto-recoverable`,
        details: { taskId: task.id, category: failurePattern.category }
      });
      return { recovered: false };
    }

    // Create cleanup task (Stage 1: just fix the error)
    const cleanupTask = await this.createCleanupTask(context);

    logger.info({
      category: 'recovery',
      action: 'cleanup_task_created',
      message: `Created cleanup task for failed task ${task.id}`,
      details: {
        originalTaskId: task.id,
        cleanupTaskId: cleanupTask.task.id,
        failurePattern: failurePattern.name
      }
    });

    return { recovered: true, cleanupTaskId: cleanupTask.task.id };
  }

  /**
   * Create followup task after cleanup completes
   * Called by task completion handler when cleanup task finishes
   */
  async createFollowupTask(cleanupTask: DevBotsTask): Promise<{ task: DevBotsTask } | null> {
    const metadata = (cleanupTask as any).metadata;
    if (!metadata?.isRepairBot || metadata?.repairStage !== 'cleanup') {
      return null;
    }

    const originalTaskId = metadata.originalTaskId as string;
    const originalTask = this.devBotsManager.getTaskQueue().getTask(originalTaskId);

    if (!originalTask) {
      logger.error({
        category: 'recovery',
        action: 'original_task_not_found',
        message: `Cannot create followup: original task ${originalTaskId} not found`
      });
      return null;
    }

    // Only create followup if cleanup succeeded
    if (cleanupTask.status !== 'completed') {
      logger.warn({
        category: 'recovery',
        action: 'cleanup_failed_skipping_followup',
        message: `Cleanup task failed, skipping followup for ${originalTaskId}`,
        details: { cleanupTaskId: cleanupTask.id, cleanupStatus: cleanupTask.status }
      });
      return null;
    }

    const followupTask = await this.devBotsManager.addTask({
      type: originalTask.type,
      title: `[FOLLOWUP] ${originalTask.title}`,
      description: this.buildFollowupPrompt(originalTask, cleanupTask),
      assignedAgent: originalTask.assigned_agent ?? 'backend-specialist',
      priority: 100, // High priority
      metadata: {
        isRepairBot: true,
        repairStage: 'followup',
        originalTaskId: originalTask.id,
        cleanupTaskId: cleanupTask.id,
        countsTowardsConcurrencyLimit: true
      }
    });

    logger.info({
      category: 'recovery',
      action: 'followup_task_created',
      message: `Created followup task for ${originalTaskId}`,
      details: {
        originalTaskId: originalTask.id,
        cleanupTaskId: cleanupTask.id,
        followupTaskId: followupTask.task.id
      }
    });

    return followupTask;
  }

  /**
   * Check if task has active repair (cleanup or followup running)
   */
  private async hasActiveRepair(taskId: string): Promise<boolean> {
    const queue = this.devBotsManager.getTaskQueue();
    const repairBots = queue.getRepairBotsForTask(taskId);

    return repairBots.some(bot => bot.status === 'running' || bot.status === 'pending');
  }

  /**
   * Check if failure is recoverable
   */
  private isRecoverable(failurePattern: FailurePattern): boolean {
    const recoverableCategories = new Set([
      'cli_incompatibility',
      'missing_resource',
      'syntax_error',
      'import_error',
      'config_error'
    ]);

    return recoverableCategories.has(failurePattern.category);
  }

  /**
   * Create cleanup task (Stage 1: fix the error)
   */
  private async createCleanupTask(context: FailureContext) {
    const { task, failurePattern, stderr, exitCode } = context;

    return await this.devBotsManager.addTask({
      type: 'implementation',  // Use implementation type (bugfix is a type of implementation)
      title: `[CLEANUP] Fix ${failurePattern.name} for: ${task.title}`,
      description: this.buildCleanupPrompt(task, failurePattern, stderr, exitCode),
      assignedAgent: task.assigned_agent,
      priority: 100, // Jump to front of queue
      // Add validation fields required by TaskCreationGuidelines
      acceptanceCriteria: [
        `Error "${failurePattern.name}" is resolved`,
        `Task exits with code 0 (success)`,
        `Changes are minimal (< 5 files, < 100 lines)`,
        `Original task goal is NOT attempted (cleanup only)`
      ],
      architectureReferences: [
        'docs/plans/DEV_BOT_SAFETY_AND_PROMPT_IMPROVEMENTS.md',
        'Failure recovery two-stage pattern (cleanup then followup)'
      ],
      estimatedEffort: {
        hours: 0.25,  // Estimated: simple error fix typically takes ~15 minutes
        complexity: 'simple',
        confidence: 'high'
      },
      metadata: {
        isRepairBot: true,
        repairStage: 'cleanup',
        originalTaskId: task.id,
        originalFailurePattern: failurePattern.name,
        countsTowardsConcurrencyLimit: true
      }
    });
  }

  /**
   * Build prompt for cleanup task (simple: just fix the error)
   */
  private buildCleanupPrompt(
    originalTask: DevBotsTask,
    failurePattern: FailurePattern,
    stderr: string,
    exitCode: number
  ): string {
    return `# Cleanup Task: Fix Error Only

## What Went Wrong
Task "${originalTask.title}" failed with:
- **Error:** ${failurePattern.name}
- **Category:** ${failurePattern.category}
- **Exit Code:** ${exitCode}

**Error Output:**
\`\`\`
${stderr.slice(0, 1000)}
\`\`\`

## Your ONLY Job
Fix the error. Nothing else.

${failurePattern.suggestedFix ? `**Suggested Fix:**\n${failurePattern.suggestedFix}` : ''}

## Constraints
- Fix ONLY the error
- Do NOT try to complete the original task goal
- Keep changes minimal (< 5 files, < 100 lines)
- Do NOT modify: package.json, .env, database files
- Commit with: "fix: ${failurePattern.name}"

## Success = Error Fixed
The followup bot will complete the original goal.
`;
  }

  /**
   * Build prompt for followup task (simple: complete the goal)
   */
  private buildFollowupPrompt(originalTask: SQLiteTask, cleanupTask: DevBotsTask): string {
    return `# Followup Task: Complete Original Goal

## Original Task
**Title:** ${originalTask.title}
**Description:** ${originalTask.description}

## What Happened
1. Original task failed
2. Cleanup bot fixed the error (see task ${cleanupTask.id})
3. Now you need to complete the original goal

## Your Job
Complete what the original task was trying to do.

The error is already fixed. Just focus on achieving the goal.

## Constraints
- Stay focused on the original goal
- Do NOT re-fix the error (already done)
- Keep changes minimal and on-scope
- Commit with: "feat: complete ${originalTask.title}"

## Success Criteria
${originalTask.acceptance_criteria?.map((c: string) => `- ${c}`).join('\n') || '- Original task goal achieved'}
`;
  }
}
