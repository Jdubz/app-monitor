/**
 * Task Queue Metrics Service
 *
 * Provides analytics and performance metrics for the task queue:
 * - Task duration statistics by type/complexity
 * - Queue health metrics (pending, running, completion times)
 * - Agent performance comparison (Claude vs Codex)
 *
 * This service is read-only and performs analytics queries on the task queue database.
 * It does not modify task state - all mutations happen in TaskQueueService.
 */

import type Database from 'better-sqlite3';
import type { TaskStatus, QueueMetrics } from './taskQueue.sqlite.js';

// ============================================================================
// Agent Comparison Types
// ============================================================================

type AgentStatsRow = {
  agent_type: 'claude' | 'codex';
  total: number;
  completed: number;
  failed: number;
  avg_duration_ms: number | null;
};

type AgentTaskTypeStatsRow = AgentStatsRow & {
  task_type: string;
};

const TRACKED_TASK_TYPES = ['implementation', 'testing', 'documentation'] as const;
type TaskTypeKey = typeof TRACKED_TASK_TYPES[number];

export type AgentTaskTypeBreakdown = Record<TaskTypeKey, AgentMetrics>;

export type AgentMetrics = {
  total: number;
  completed: number;
  failed: number;
  avg_duration_ms?: number;
  success_rate: number;
};

export type AgentComparisonMetrics = {
  claude: AgentMetrics;
  codex: AgentMetrics;
  task_type_breakdown: {
    claude: AgentTaskTypeBreakdown;
    codex: AgentTaskTypeBreakdown;
  };
};

// ============================================================================
// Utility Functions
// ============================================================================

const isTrackedTaskType = (value: string | null | undefined): value is TaskTypeKey => {
  return Boolean(value) && TRACKED_TASK_TYPES.includes(value as TaskTypeKey);
};

/**
 * Summarize agent comparison metrics from raw database stats
 * Pure function - no side effects
 */
export function summarizeAgentComparisonMetrics(
  agentStats: AgentStatsRow[],
  taskTypeStats: AgentTaskTypeStatsRow[] = [],
): AgentComparisonMetrics {
  const buildMetrics = (stats?: AgentStatsRow): AgentMetrics => {
    const completed = stats?.completed ?? 0;
    const failed = stats?.failed ?? 0;
    const total = stats?.total ?? 0;
    const avgDuration = stats?.avg_duration_ms ?? undefined;
    const attempts = completed + failed;
    const successRate = attempts > 0 ? (completed / attempts) * 100 : 0;

    return {
      total,
      completed,
      failed,
      avg_duration_ms: avgDuration,
      success_rate: successRate,
    };
  };

  const claudeStats = agentStats.find((s) => s.agent_type === 'claude');
  const codexStats = agentStats.find((s) => s.agent_type === 'codex');

  const createEmptyBreakdown = (): AgentTaskTypeBreakdown => {
    return TRACKED_TASK_TYPES.reduce((acc, taskType) => {
      acc[taskType] = buildMetrics();
      return acc;
    }, {} as AgentTaskTypeBreakdown);
  };

  const breakdown = {
    claude: createEmptyBreakdown(),
    codex: createEmptyBreakdown(),
  };

  for (const stats of taskTypeStats) {
    if (!isTrackedTaskType(stats.task_type)) {
      continue;
    }

    const agentBucket = stats.agent_type === 'claude' ? breakdown.claude : breakdown.codex;
    agentBucket[stats.task_type] = buildMetrics(stats);
  }

  return {
    claude: buildMetrics(claudeStats),
    codex: buildMetrics(codexStats),
    task_type_breakdown: breakdown,
  };
}

// ============================================================================
// Metrics Service
// ============================================================================

export class TaskQueueMetricsService {
  constructor(private db: Database.Database) {}

  /**
   * Get task duration statistics grouped by type and complexity
   *
   * Helps understand baseline task durations to inform timeout policies.
   * After collecting sufficient data (50+ tasks per type/complexity),
   * can use this to set appropriate timeout thresholds.
   *
   * @param daysBack Number of days to look back (default: 30)
   * @returns Array of duration stats by type/complexity
   */
  getTaskDurationStats(daysBack: number = 30): Array<{
    type: string;
    complexity: string;
    completed_count: number;
    avg_minutes: number;
    max_minutes: number;
    min_minutes: number;
  }> {
    const since = Date.now() - (daysBack * 86400000);

    const stmt = this.db.prepare(`
      SELECT
        t.type,
        COALESCE(t.complexity, 'unknown') as complexity,
        COUNT(*) as completed_count,
        AVG(te.duration_ms) / 60000.0 as avg_minutes,
        MAX(te.duration_ms) / 60000.0 as max_minutes,
        MIN(te.duration_ms) / 60000.0 as min_minutes
      FROM task_executions te
      JOIN tasks t ON te.task_id = t.id
      WHERE te.exit_code = 0
      AND te.ended_at > ?
      GROUP BY t.type, t.complexity
      ORDER BY t.type, t.complexity
    `);

    return stmt.all(since) as Array<{
      type: string;
      complexity: string;
      completed_count: number;
      avg_minutes: number;
      max_minutes: number;
      min_minutes: number;
    }>;
  }

  /**
   * Get comprehensive queue metrics
   *
   * Returns counts by status, average completion time, and oldest pending age.
   * Used for monitoring queue health and detecting bottlenecks.
   *
   * @returns Queue metrics including counts by status and timing info
   */
  getQueueMetrics(): QueueMetrics {
    const countStmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM tasks
      GROUP BY status
    `);

    const counts = countStmt.all() as { status: TaskStatus; count: number }[];
    const metrics: QueueMetrics = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      timeout: 0,
      total: 0
    };

    for (const { status, count } of counts) {
      metrics[status] = count;
      metrics.total += count;
    }

    // Average completion time (last 24 hours)
    const avgStmt = this.db.prepare(`
      SELECT AVG(duration_ms) as avg_duration
      FROM task_executions
      WHERE exit_code = 0
      AND ended_at > ?
    `);

    const oneDayAgo = Date.now() - 86400000;
    const avgResult = avgStmt.get(oneDayAgo) as { avg_duration: number } | undefined;
    metrics.avg_completion_time_ms = avgResult?.avg_duration;

    // Oldest pending task age
    const oldestStmt = this.db.prepare(`
      SELECT MIN(created_at) as oldest
      FROM tasks
      WHERE status = 'pending'
    `);

    const oldestResult = oldestStmt.get() as { oldest: number } | undefined;
    if (oldestResult?.oldest) {
      metrics.oldest_pending_age_ms = Date.now() - oldestResult.oldest;
    }

    return metrics;
  }

  /**
   * Get agent performance comparison metrics
   *
   * Compares Claude vs Codex performance across all tasks and by task type.
   * Includes success rates, completion counts, and average durations.
   *
   * @returns Comparison metrics for Claude and Codex agents
   */
  getAgentComparisonMetrics(): AgentComparisonMetrics {
    const agentStats = this.db.prepare(`
      SELECT
        agent_type,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(CASE
          WHEN status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL
          THEN completed_at - started_at
          ELSE NULL
        END) as avg_duration_ms
      FROM tasks
      WHERE agent_type IS NOT NULL AND agent_type IN ('claude', 'codex')
      GROUP BY agent_type
    `).all() as AgentStatsRow[];

    const taskTypeStats = this.db.prepare(`
      SELECT
        agent_type,
        LOWER(type) as task_type,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(CASE
          WHEN status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL
          THEN completed_at - started_at
          ELSE NULL
        END) as avg_duration_ms
      FROM tasks
      WHERE agent_type IS NOT NULL
        AND agent_type IN ('claude', 'codex')
        AND type IS NOT NULL
        AND LOWER(type) IN ('implementation', 'testing', 'documentation')
      GROUP BY agent_type, LOWER(type)
    `).all() as AgentTaskTypeStatsRow[];

    return summarizeAgentComparisonMetrics(agentStats, taskTypeStats);
  }
}
