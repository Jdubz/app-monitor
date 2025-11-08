/**
 * Metrics Emitter Service
 *
 * Emits periodic metrics for monitoring system health
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import type { TaskQueueService } from './taskQueue.sqlite.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';

export interface SystemMetrics {
  timestamp: number;
  queueDepth: number;
  activeWorkers: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  avgCompletionTimeMs: number;
  successRate: number;
  circuitBreakerStatus?: {
    state: string;
    failureCount: number;
  };
}

export class MetricsEmitter extends EventEmitter {
  private interval?: NodeJS.Timeout;
  private running = false;

  constructor(
    private taskQueue: TaskQueueService,
    private ephemeralWorkerService: EphemeralWorkerService,
    private intervalMs: number = 60000 // 1 minute default
  ) {
    super();
  }

  /**
   * Start emitting metrics periodically
   */
  start(): void {
    if (this.running) {
      logger.warn({
        category: 'metrics',
        action: 'already_running',
        message: 'Metrics emitter is already running'
      });
      return;
    }

    this.running = true;

    logger.info({
      category: 'metrics',
      action: 'started',
      message: `Metrics emitter started (interval: ${this.intervalMs}ms)`,
      details: {
        intervalMs: this.intervalMs
      }
    });

    // Emit metrics immediately, then on interval
    this.emitMetrics();
    this.interval = setInterval(() => {
      this.emitMetrics();
    }, this.intervalMs);
  }

  /**
   * Stop emitting metrics
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    logger.info({
      category: 'metrics',
      action: 'stopped',
      message: 'Metrics emitter stopped'
    });
  }

  /**
   * Emit current system metrics
   */
  private emitMetrics(): void {
    try {
      const queueMetrics = this.taskQueue.getQueueMetrics();
      const activeWorkers = this.ephemeralWorkerService.getActiveWorkers();

      const metrics: SystemMetrics = {
        timestamp: Date.now(),
        queueDepth: queueMetrics.pending,
        activeWorkers: activeWorkers.length,
        completedTasks: queueMetrics.completed,
        failedTasks: queueMetrics.failed,
        pendingTasks: queueMetrics.pending,
        avgCompletionTimeMs: queueMetrics.avg_completion_time_ms || 0,
        successRate: queueMetrics.completed + queueMetrics.failed > 0
          ? queueMetrics.completed / (queueMetrics.completed + queueMetrics.failed)
          : 0
      };

      // Emit metrics event for consumers
      this.emit('metrics', metrics);

      // Log metrics for observability
      logger.info({
        category: 'metrics',
        action: 'system_metrics',
        message: 'System metrics snapshot',
        details: {
          queueDepth: metrics.queueDepth,
          activeWorkers: metrics.activeWorkers,
          completedTasks: metrics.completedTasks,
          failedTasks: metrics.failedTasks,
          successRate: `${(metrics.successRate * 100).toFixed(1)}%`,
          avgCompletionTimeSec: metrics.avgCompletionTimeMs > 0
            ? `${(metrics.avgCompletionTimeMs / 1000).toFixed(1)}s`
            : 'N/A',
          health: this.getHealthStatus(metrics)
        }
      });

    } catch (error) {
      logger.error({
        category: 'metrics',
        action: 'emit_failed',
        message: 'Failed to emit metrics',
        error
      });
    }
  }

  /**
   * Determine overall system health based on metrics
   */
  private getHealthStatus(metrics: SystemMetrics): 'HEALTHY' | 'DEGRADED' | 'CRITICAL' {
    // Critical: High failure rate or very high queue depth with no workers
    if (metrics.successRate < 0.5 || (metrics.queueDepth > 20 && metrics.activeWorkers === 0)) {
      return 'CRITICAL';
    }

    // Degraded: Moderate queue depth or moderate failure rate
    if (metrics.queueDepth > 10 || metrics.successRate < 0.8) {
      return 'DEGRADED';
    }

    return 'HEALTHY';
  }

  /**
   * Get current metrics without waiting for interval
   */
  getCurrentMetrics(): SystemMetrics | null {
    try {
      const queueMetrics = this.taskQueue.getQueueMetrics();
      const activeWorkers = this.ephemeralWorkerService.getActiveWorkers();

      return {
        timestamp: Date.now(),
        queueDepth: queueMetrics.pending,
        activeWorkers: activeWorkers.length,
        completedTasks: queueMetrics.completed,
        failedTasks: queueMetrics.failed,
        pendingTasks: queueMetrics.pending,
        avgCompletionTimeMs: queueMetrics.avg_completion_time_ms || 0,
        successRate: queueMetrics.completed + queueMetrics.failed > 0
          ? queueMetrics.completed / (queueMetrics.completed + queueMetrics.failed)
          : 0
      };
    } catch (error) {
      logger.error({
        category: 'metrics',
        action: 'get_current_metrics_failed',
        message: 'Failed to get current metrics',
        error
      });
      return null;
    }
  }
}
