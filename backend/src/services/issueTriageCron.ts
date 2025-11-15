/**
 * Issue Triage Cron Service
 *
 * Runs autonomous triage every 5 minutes to:
 * - Diagnose pending issues
 * - Create bugfix tasks
 * - Deduplicate issues
 */

import { IssueTriageService } from './issueTriageService.js';
import type { TaskQueue } from './taskQueue.sqlite.js';
import { logger } from '../utils/logger.js';

export class IssueTriageCron {
  private triageService: IssueTriageService;
  private intervalId?: NodeJS.Timeout;
  private intervalMs: number;
  private isRunning = false;

  constructor(taskQueue: TaskQueue, intervalMs: number = 5 * 60 * 1000) {
    this.triageService = new IssueTriageService(undefined, taskQueue);
    this.intervalMs = intervalMs;
  }

  /**
   * Start the cron job
   */
  start(): void {
    if (this.intervalId) {
      logger.warn({
        category: 'issue-triage',
        action: 'cron_already_running',
        message: 'Triage cron already running',
      });
      return;
    }

    logger.info({
      category: 'issue-triage',
      action: 'cron_started',
      message: 'Issue triage cron started',
      details: { intervalMs: this.intervalMs },
    });

    // Run immediately on start
    void this.runTriage();

    // Then run every 5 minutes
    this.intervalId = setInterval(() => {
      void this.runTriage();
    }, this.intervalMs);
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;

      logger.info({
        category: 'issue-triage',
        action: 'cron_stopped',
        message: 'Issue triage cron stopped',
      });
    }
  }

  /**
   * Run triage manually (for testing)
   */
  async runNow(): Promise<void> {
    await this.runTriage();
  }

  /**
   * Execute triage process
   */
  private async runTriage(): Promise<void> {
    if (this.isRunning) {
      logger.warn({
        category: 'issue-triage',
        action: 'triage_skipped',
        message: 'Triage already running, skipping this interval',
      });
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info({
        category: 'issue-triage',
        action: 'triage_started',
        message: 'Starting issue triage',
      });

      const result = await this.triageService.triagePendingIssues();
      const duration = Date.now() - startTime;

      logger.info({
        category: 'issue-triage',
        action: 'triage_completed',
        message: 'Issue triage completed',
        details: {
          processed: result.processed,
          tasksCreated: result.tasksCreated,
          duplicates: result.duplicates,
          wontFix: result.wontFix,
          durationMs: duration,
        },
      });

      // Alert if many issues are pending
      if (result.processed > 10) {
        logger.warn({
          category: 'issue-triage',
          action: 'high_pending_count',
          message: 'High number of pending issues',
          details: { count: result.processed },
        });
      }

    } catch (error) {
      logger.error({
        category: 'issue-triage',
        action: 'triage_failed',
        message: 'Issue triage failed',
        error,
      });
    } finally {
      this.isRunning = false;
    }
  }
}

// Export singleton
let cronInstance: IssueTriageCron | null = null;

export function initializeIssueTriageCron(taskQueue: TaskQueue): IssueTriageCron {
  if (!cronInstance) {
    cronInstance = new IssueTriageCron(taskQueue);
    cronInstance.start();
  }
  return cronInstance;
}

export function getIssueTriageCron(): IssueTriageCron | null {
  return cronInstance;
}
