/**
 * Base Evaluator
 * 
 * Abstract base class for all condition evaluators.
 * Provides common functionality and enforces consistent interface.
 */

import type { GitHubPRService, PRStatus } from '../../githubPR.service.js';
import type { TaskQueueService, Task } from '../../taskQueue.sqlite.js';
import type { ConditionEvaluation, PRConditionState } from '../types.js';
import { logger } from '../../../utils/logger.js';

export abstract class BaseEvaluator {
  constructor(
    protected readonly github: GitHubPRService,
    protected readonly taskQueue: TaskQueueService
  ) {}

  /**
   * Evaluate the condition for a specific PR
   * 
   * @param prNumber - Pull request number
   * @param prStatus - Optional cached PR status from GitHub
   * @param state - Optional PR condition state for context
   */
  abstract evaluate(
    prNumber: number,
    prStatus?: PRStatus,
    state?: PRConditionState
  ): Promise<ConditionEvaluation>;

  /**
   * Get the condition ID this evaluator handles
   */
  abstract getConditionId(): string;

  /**
   * Helper to get PR tasks from task queue
   */
  protected async getPRTasks(prNumber: number): Promise<Task[]> {
    return this.taskQueue.getTasksByPR(prNumber);
  }

  /**
   * Helper to log evaluation activity
   */
  protected logEvaluation(
    prNumber: number,
    status: string,
    details?: Record<string, unknown>
  ): void {
    logger.info({
      category: 'pr-workflow',
      action: 'condition_evaluated',
      message: `Evaluated ${this.getConditionId()} for PR #${prNumber}`,
      details: {
        pr_number: prNumber,
        condition_id: this.getConditionId(),
        status,
        ...details
      }
    });
  }
}
