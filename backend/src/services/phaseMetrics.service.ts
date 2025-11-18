/**
 * Phase Metrics Service
 * 
 * Provides aggregated metrics and analytics for the 7-phase task processing system.
 * Queries task_stage_runs table for phase timing, success rates, and recovery statistics.
 * 
 * Metrics include:
 * - Phase success/failure rates
 * - Average duration per phase
 * - Loop iteration counts
 * - Recovery invocation/success rates
 * - Phase distribution of active tasks
 * 
 * Implements 5-minute in-memory cache for performance.
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { MS_PER_MINUTE } from '../constants/timeouts.js';

export interface PhaseStats {
  phaseIndex: number;
  phaseName: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  recoveredRuns: number;
  blockedRuns: number;
  successRate: number;
  averageDurationMs: number | null;
  totalDurationMs: number;
  minDurationMs: number | null;
  maxDurationMs: number | null;
}

export interface PhaseLoopStats {
  phaseIndex: number;
  phaseName: string;
  totalLoops: number;
  averageIterations: number;
  maxIterations: number;
  tasksExceedingLimit: number;
}

export interface RecoveryStats {
  totalRecoveryAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  recoverySuccessRate: number;
  categoryCounts: {
    retry: number;
    context_update: number;
    chain_blocked: number;
    system_blocked: number;
  };
}

export interface PhaseDistribution {
  phase1: number;
  phase2: number;
  phase3: number;
  phase4: number;
  phase5: number;
  phase6: number;
  phase7: number;
  total: number;
}

export interface PhaseMetricsSnapshot {
  timestamp: number;
  phaseStats: PhaseStats[];
  loopStats: PhaseLoopStats[];
  recoveryStats: RecoveryStats;
  activeTaskDistribution: PhaseDistribution;
}

const CACHE_TTL_MS = 5 * MS_PER_MINUTE;

export class PhaseMetricsService {
  private db: Database.Database;
  private cache: PhaseMetricsSnapshot | null = null;
  private cacheTimestamp: number = 0;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Get comprehensive phase metrics with 5-minute caching.
   *
   * Returns aggregated statistics for all 7 phases including:
   * - Success/failure rates per phase
   * - Average/min/max execution durations
   * - Loop iteration statistics (Phase 3↔4, Phase 5 internal)
   * - Recovery agent effectiveness metrics
   * - Current active task distribution across phases
   *
   * @returns Complete metrics snapshot with timestamp
   *
   * @example
   * ```typescript
   * const metrics = metricsService.getMetrics();
   * console.log(`Phase 2 success rate: ${metrics.phaseStats[1].successRate}%`);
   * console.log(`Total recovery attempts: ${metrics.recoveryStats.totalRecoveryAttempts}`);
   * ```
   */
  getMetrics(): PhaseMetricsSnapshot {
    const now = Date.now();
    
    // Return cached data if still valid
    if (this.cache && (now - this.cacheTimestamp) < CACHE_TTL_MS) {
      logger.debug({
        category: 'metrics',
        action: 'cache_hit',
        message: 'Returning cached phase metrics',
        details: { age: now - this.cacheTimestamp },
      });
      return this.cache;
    }

    // Generate fresh metrics
    logger.info({
      category: 'metrics',
      action: 'generating_metrics',
      message: 'Generating fresh phase metrics',
    });

    const snapshot: PhaseMetricsSnapshot = {
      timestamp: now,
      phaseStats: this.calculatePhaseStats(),
      loopStats: this.calculateLoopStats(),
      recoveryStats: this.calculateRecoveryStats(),
      activeTaskDistribution: this.getActiveTaskDistribution(),
    };

    // Update cache
    this.cache = snapshot;
    this.cacheTimestamp = now;

    return snapshot;
  }

  /**
   * Get metrics for a specific phase by index.
   *
   * @param phaseIndex - Phase number (1-7):
   *   1: Planning
   *   2: Implementation
   *   3: Review
   *   4: Fixes
   *   5: Test & Validate
   *   6: Cleanup
   *   7: PR Shepherding
   * @returns Phase statistics or null if phase not found
   *
   * @example
   * ```typescript
   * const phase2Stats = metricsService.getPhaseMetrics(2);
   * if (phase2Stats) {
   *   console.log(`Implementation phase: ${phase2Stats.successRate}% success rate`);
   *   console.log(`Average duration: ${phase2Stats.averageDurationMs}ms`);
   * }
   * ```
   */
  getPhaseMetrics(phaseIndex: number): PhaseStats | null {
    const metrics = this.getMetrics();
    return metrics.phaseStats.find(s => s.phaseIndex === phaseIndex) || null;
  }

  /**
   * Clear the metrics cache to force fresh data on next request.
   *
   * Call this after significant system changes that would invalidate cached metrics,
   * such as bulk task updates, phase configuration changes, or database migrations.
   *
   * @example
   * ```typescript
   * // After bulk task deletion
   * await taskQueue.bulkDeleteTasks(taskIds);
   * metricsService.clearCache(); // Force metrics refresh
   * ```
   */
  clearCache(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
    logger.info({
      category: 'metrics',
      action: 'cache_cleared',
      message: 'Phase metrics cache cleared',
    });
  }

  /**
   * Calculate statistics for each phase.
   */
  private calculatePhaseStats(): PhaseStats[] {
    const PHASE_NAMES: Record<number, string> = {
      1: 'Planning',
      2: 'Implementation',
      3: 'Review',
      4: 'Fixes',
      5: 'Test & Validate',
      6: 'Cleanup',
      7: 'PR Shepherding',
    };

    const stats: PhaseStats[] = [];

    for (let phaseIndex = 1; phaseIndex <= 7; phaseIndex++) {
      const rows = this.db.prepare(`
        SELECT 
          status,
          COUNT(*) as count,
          AVG(completed_at - created_at) as avg_duration,
          SUM(completed_at - created_at) as total_duration,
          MIN(completed_at - created_at) as min_duration,
          MAX(completed_at - created_at) as max_duration
        FROM task_stage_runs
        WHERE phase_index = ? AND completed_at IS NOT NULL
        GROUP BY status
      `).all(phaseIndex) as Array<{
        status: string;
        count: number;
        avg_duration: number | null;
        total_duration: number | null;
        min_duration: number | null;
        max_duration: number | null;
      }>;

      const totalRuns = rows.reduce((sum, r) => sum + r.count, 0);
      const successfulRuns = rows.find(r => r.status === 'success')?.count || 0;
      const failedRuns = rows.find(r => r.status === 'failed')?.count || 0;
      const recoveredRuns = rows.find(r => r.status === 'recovered')?.count || 0;
      const blockedRuns = rows.find(r => r.status === 'blocked')?.count || 0;

      // Calculate weighted average duration across all statuses
      const totalDuration = rows.reduce((sum, r) => sum + (r.total_duration || 0), 0);
      const avgDuration = totalRuns > 0 ? totalDuration / totalRuns : null;

      const allDurations = rows.filter(r => r.min_duration !== null);
      const minDuration = allDurations.length > 0 
        ? Math.min(...allDurations.map(r => r.min_duration!)) 
        : null;
      const maxDuration = allDurations.length > 0 
        ? Math.max(...allDurations.map(r => r.max_duration!)) 
        : null;

      stats.push({
        phaseIndex,
        phaseName: PHASE_NAMES[phaseIndex],
        totalRuns,
        successfulRuns,
        failedRuns,
        recoveredRuns,
        blockedRuns,
        successRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
        averageDurationMs: avgDuration,
        totalDurationMs: totalDuration,
        minDurationMs: minDuration,
        maxDurationMs: maxDuration,
      });
    }

    return stats;
  }

  /**
   * Calculate loop iteration statistics (Phase 3↔4, Phase 5 internal).
   */
  private calculateLoopStats(): PhaseLoopStats[] {
    const stats: PhaseLoopStats[] = [];

    // Phase 3↔4 loop: Count consecutive phase_index changes
    const reviewFixLoops = this.db.prepare(`
      SELECT 
        task_id,
        COUNT(*) as iterations,
        MAX(attempt) as max_attempt
      FROM task_stage_runs
      WHERE phase_index IN (3, 4)
      GROUP BY task_id
      HAVING iterations > 1
    `).all() as Array<{ task_id: string; iterations: number; max_attempt: number }>;

    const totalReviewFixLoops = reviewFixLoops.length;
    const avgReviewFixIterations = totalReviewFixLoops > 0
      ? reviewFixLoops.reduce((sum, l) => sum + l.iterations, 0) / totalReviewFixLoops
      : 0;
    const maxReviewFixIterations = totalReviewFixLoops > 0
      ? Math.max(...reviewFixLoops.map(l => l.iterations))
      : 0;
    const reviewFixExceedingLimit = reviewFixLoops.filter(l => l.max_attempt >= 4).length;

    stats.push({
      phaseIndex: 3,
      phaseName: 'Review/Fix Loop',
      totalLoops: totalReviewFixLoops,
      averageIterations: avgReviewFixIterations,
      maxIterations: maxReviewFixIterations,
      tasksExceedingLimit: reviewFixExceedingLimit,
    });

    // Phase 5 internal loop: Count attempts within Phase 5
    const testLoops = this.db.prepare(`
      SELECT 
        task_id,
        MAX(attempt) as max_attempt
      FROM task_stage_runs
      WHERE phase_index = 5
      GROUP BY task_id
      HAVING max_attempt > 1
    `).all() as Array<{ task_id: string; max_attempt: number }>;

    const totalTestLoops = testLoops.length;
    const avgTestIterations = totalTestLoops > 0
      ? testLoops.reduce((sum, l) => sum + l.max_attempt, 0) / totalTestLoops
      : 0;
    const maxTestIterations = totalTestLoops > 0
      ? Math.max(...testLoops.map(l => l.max_attempt))
      : 0;
    const testExceedingLimit = testLoops.filter(l => l.max_attempt >= 4).length;

    stats.push({
      phaseIndex: 5,
      phaseName: 'Test Loop (Internal)',
      totalLoops: totalTestLoops,
      averageIterations: avgTestIterations,
      maxIterations: maxTestIterations,
      tasksExceedingLimit: testExceedingLimit,
    });

    return stats;
  }

  /**
   * Calculate recovery statistics from recovery_diagnosis field.
   */
  private calculateRecoveryStats(): RecoveryStats {
    const recoveryRuns = this.db.prepare(`
      SELECT recovery_diagnosis
      FROM task_stage_runs
      WHERE recovery_diagnosis IS NOT NULL
    `).all() as Array<{ recovery_diagnosis: string }>;

    const totalAttempts = recoveryRuns.length;
    let successfulRecoveries = 0;
    let failedRecoveries = 0;
    const categoryCounts = {
      retry: 0,
      context_update: 0,
      chain_blocked: 0,
      system_blocked: 0,
    };

    for (const run of recoveryRuns) {
      try {
        const diagnosis = JSON.parse(run.recovery_diagnosis);
        
        if (diagnosis.success) {
          successfulRecoveries++;
        } else {
          failedRecoveries++;
        }

        const category = diagnosis.category as keyof typeof categoryCounts;
        if (category && category in categoryCounts) {
          categoryCounts[category]++;
        }
      } catch (error) {
        logger.warn({
          category: 'metrics',
          action: 'recovery_parse_error',
          message: 'Failed to parse recovery_diagnosis',
          error,
        });
      }
    }

    return {
      totalRecoveryAttempts: totalAttempts,
      successfulRecoveries,
      failedRecoveries,
      recoverySuccessRate: totalAttempts > 0 ? successfulRecoveries / totalAttempts : 0,
      categoryCounts,
    };
  }

  /**
   * Get distribution of active tasks across phases.
   */
  private getActiveTaskDistribution(): PhaseDistribution {
    const rows = this.db.prepare(`
      SELECT phase_index, COUNT(*) as count
      FROM tasks
      WHERE status IN ('running', 'pending')
      GROUP BY phase_index
    `).all() as Array<{ phase_index: number; count: number }>;

    const distribution: PhaseDistribution = {
      phase1: 0,
      phase2: 0,
      phase3: 0,
      phase4: 0,
      phase5: 0,
      phase6: 0,
      phase7: 0,
      total: 0,
    };

    for (const row of rows) {
      const key = `phase${row.phase_index}` as keyof Omit<PhaseDistribution, 'total'>;
      if (key in distribution) {
        distribution[key] = row.count;
        distribution.total += row.count;
      }
    }

    return distribution;
  }
}

// Singleton instance (requires DB)
let instance: PhaseMetricsService | null = null;

export function getPhaseMetricsService(db?: Database.Database): PhaseMetricsService {
  if (!instance && !db) {
    throw new Error('PhaseMetricsService must be initialized with a database instance');
  }
  
  if (db && !instance) {
    instance = new PhaseMetricsService(db);
  }
  
  return instance!;
}
