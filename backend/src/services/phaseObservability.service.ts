/**
 * Phase Observability Service
 * 
 * Provides deep observability into the phased task execution system for
 * autonomous agent debugging and exploration.
 * 
 * Features:
 * - Task execution timeline across all phases
 * - Phase-specific log aggregation
 * - Automated anomaly detection (stuck loops, excessive recovery, slow phases)
 * - Pre-built diagnostic queries for common patterns
 * 
 * Designed for agent-first consumption via API endpoints.
 */

import Database from 'better-sqlite3';
import { MS_PER_DAY } from '../constants/timeouts.js';
import {
  PhaseExecutionTrace,
  TaskExecutionTimeline,
  PhaseLogEntry,
  PhaseLogsQuery,
  PhaseLogsResponse,
  TaskAnomalyDetection,
  SystemAnomalies,
  DiagnosticQuery,
  DiagnosticQueryResult,
} from '@app-monitor/api-contracts';
import { PHASE_NAMES } from './phaseConstants.js';

export class PhaseObservabilityService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Get complete execution timeline for a specific task.
   * Shows all phase executions, retries, recoveries, and current state.
   */
  getTaskTrace(taskId: string): TaskExecutionTimeline | null {
    // Get task metadata
    const task = this.db.prepare(`
      SELECT id, type, status, created_at, completed_at, phase_index, phase_status, phase_attempts
      FROM tasks
      WHERE id = ?
    `).get(taskId) as {
      id: string;
      type: string;
      status: string;
      created_at: string;
      completed_at: string | null;
      phase_index: number | null;
      phase_status: string | null;
      phase_attempts: number | null;
    } | undefined;

    if (!task) {
      return null;
    }

    // Get all phase executions for this task
    const phaseRuns = this.db.prepare(`
      SELECT 
        task_id,
        phase_index,
        attempt,
        status,
        created_at,
        completed_at,
        validator_results,
        recovery_diagnosis,
        error
      FROM task_stage_runs
      WHERE task_id = ?
      ORDER BY phase_index ASC, attempt ASC
    `).all(taskId) as Array<{
      task_id: string;
      phase_index: number;
      attempt: number;
      status: string;
      created_at: string;
      completed_at: string | null;
      validator_results: string | null;
      recovery_diagnosis: string | null;
      error: string | null;
    }>;

    const phases: PhaseExecutionTrace[] = phaseRuns.map(run => {
      const duration = run.completed_at
        ? new Date(run.completed_at).getTime() - new Date(run.created_at).getTime()
        : null;

      return {
        taskId: run.task_id,
        phaseIndex: run.phase_index,
        phaseName: PHASE_NAMES[run.phase_index] || `Phase ${run.phase_index}`,
        attempt: run.attempt,
        status: run.status as 'success' | 'failed' | 'blocked' | 'recovered',
        createdAt: run.created_at,
        completedAt: run.completed_at,
        durationMs: duration,
        validatorResults: run.validator_results ? this.safeParse(run.validator_results) : null,
        recoveryDiagnosis: run.recovery_diagnosis ? this.safeParse(run.recovery_diagnosis) : null,
        error: run.error,
      };
    });

    // Calculate metrics
    const recoveryCount = phases.filter(p => p.recoveryDiagnosis !== null).length;
    const loopCount = this.detectLoops(phases);
    const isStuck = this.detectStuckTask(task, phases);
    
    const totalDuration = task.completed_at
      ? new Date(task.completed_at).getTime() - new Date(task.created_at).getTime()
      : null;

    const currentPhase = task.phase_index ? {
      index: task.phase_index,
      name: PHASE_NAMES[task.phase_index] || `Phase ${task.phase_index}`,
      status: task.phase_status as 'ready' | 'running' | 'validating' | 'recovering' | 'complete' | 'blocked',
      attempts: task.phase_attempts || 0,
    } : null;

    return {
      taskId: task.id,
      taskTitle: task.type,
      taskStatus: task.status as 'pending' | 'assigned' | 'active' | 'completed' | 'failed',
      totalDurationMs: totalDuration,
      createdAt: task.created_at,
      completedAt: task.completed_at,
      currentPhase,
      phases,
      recoveryCount,
      loopCount,
      isStuck,
    };
  }

  /**
   * Query phase-specific logs with flexible filtering.
   */
  getPhaseLogs(query: PhaseLogsQuery): PhaseLogsResponse {
    let sql = `
      SELECT 
        tsr.task_id,
        tsr.phase_index,
        tsr.attempt,
        l.timestamp,
        l.level,
        l.category,
        l.action,
        l.message,
        l.details
      FROM logs l
      INNER JOIN task_stage_runs tsr ON l.details LIKE '%' || tsr.task_id || '%'
      WHERE 1=1
    `;
    
    const params: unknown[] = [];

    if (query.taskId) {
      sql += ` AND tsr.task_id = ?`;
      params.push(query.taskId);
    }

    if (query.phaseIndex !== undefined) {
      sql += ` AND tsr.phase_index = ?`;
      params.push(query.phaseIndex);
    }

    if (query.level) {
      sql += ` AND l.level = ?`;
      params.push(query.level);
    }

    if (query.category) {
      sql += ` AND l.category = ?`;
      params.push(query.category);
    }

    if (query.startTime) {
      sql += ` AND l.timestamp >= ?`;
      params.push(query.startTime);
    }

    if (query.endTime) {
      sql += ` AND l.timestamp <= ?`;
      params.push(query.endTime);
    }

    sql += ` ORDER BY l.timestamp DESC`;

    if (query.limit) {
      sql += ` LIMIT ?`;
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ` OFFSET ?`;
      params.push(query.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      task_id: string;
      phase_index: number;
      attempt: number;
      timestamp: string;
      level: string;
      category: string;
      action: string;
      message: string;
      details: string;
    }>;

    const logs: PhaseLogEntry[] = rows.map(row => ({
      taskId: row.task_id,
      phaseIndex: row.phase_index,
      phaseName: PHASE_NAMES[row.phase_index] || `Phase ${row.phase_index}`,
      attempt: row.attempt,
      timestamp: row.timestamp,
      level: row.level as 'info' | 'warn' | 'error' | 'debug',
      category: row.category,
      action: row.action,
      message: row.message,
      details: this.safeParse(row.details),
    }));

    return {
      logs,
      total: logs.length,
      query,
    };
  }

  /**
   * Detect anomalies in task execution patterns.
   * Identifies stuck loops, excessive recovery, slow phases, etc.
   */
  detectAnomalies(): SystemAnomalies {
    const tasks = this.getAllActiveTasks();
    const taskAnomalies: TaskAnomalyDetection[] = [];
    const systemPatterns: SystemAnomalies['systemPatterns'] = [];

    for (const task of tasks) {
      const timeline = this.getTaskTrace(task.id);
      if (!timeline) continue;

      const anomalies: TaskAnomalyDetection['anomalies'] = [];
      let score = 0;

      // Detect stuck in loop (Phase 3↔4 or Phase 5 internal)
      if (timeline.loopCount > 3) {
        anomalies.push({
          type: 'stuck_loop',
          severity: timeline.loopCount > 5 ? 'high' : 'medium',
          description: `Task stuck in loop with ${timeline.loopCount} iterations`,
          details: { loopCount: timeline.loopCount },
        });
        score += timeline.loopCount > 5 ? 10 : 5;
      }

      // Detect excessive recovery
      if (timeline.recoveryCount > 2) {
        anomalies.push({
          type: 'excessive_recovery',
          severity: timeline.recoveryCount > 4 ? 'high' : 'medium',
          description: `Task required ${timeline.recoveryCount} recovery attempts`,
          details: { recoveryCount: timeline.recoveryCount },
        });
        score += timeline.recoveryCount > 4 ? 8 : 4;
      }

      // Detect slow phases (>10 min)
      const slowPhases = timeline.phases.filter(p => p.durationMs && p.durationMs > 10 * 60 * 1000);
      if (slowPhases.length > 0) {
        anomalies.push({
          type: 'slow_phase',
          severity: 'low',
          description: `${slowPhases.length} phase(s) exceeded 10 minutes`,
          details: { slowPhases: slowPhases.map(p => ({ phase: p.phaseName, durationMs: p.durationMs })) },
        });
        score += 2;
      }

      // Detect validation failure patterns
      const validationFailures = timeline.phases.filter(p => 
        p.status === 'failed' && p.validatorResults
      );
      if (validationFailures.length > 2) {
        anomalies.push({
          type: 'validation_pattern',
          severity: 'medium',
          description: `Repeated validation failures (${validationFailures.length} times)`,
          details: { failureCount: validationFailures.length },
        });
        score += 3;
      }

      if (anomalies.length > 0) {
        taskAnomalies.push({
          taskId: task.id,
          anomalies,
          score,
          isAnomaly: score >= 5,
        });
      }
    }

    // Detect system-wide patterns
    const stuckTasks = taskAnomalies.filter(t => 
      t.anomalies.some(a => a.type === 'stuck_loop')
    );
    if (stuckTasks.length >= 3) {
      systemPatterns.push({
        type: 'widespread_stuck_loops',
        description: `${stuckTasks.length} tasks are stuck in execution loops`,
        affectedTasks: stuckTasks.map(t => t.taskId),
        severity: 'high',
      });
    }

    const highRecoveryTasks = taskAnomalies.filter(t =>
      t.anomalies.some(a => a.type === 'excessive_recovery')
    );
    if (highRecoveryTasks.length >= 3) {
      systemPatterns.push({
        type: 'recovery_pattern',
        description: `${highRecoveryTasks.length} tasks require excessive recovery - possible systemic issue`,
        affectedTasks: highRecoveryTasks.map(t => t.taskId),
        severity: 'high',
      });
    }

    return {
      timestamp: new Date().toISOString(),
      tasks: taskAnomalies,
      systemPatterns,
    };
  }

  /**
   * Get list of pre-built diagnostic queries.
   */
  getDiagnosticQueries(): DiagnosticQuery[] {
    return [
      {
        id: 'slow_phases',
        name: 'Slow Phase Executions',
        description: 'Find phase runs that took longer than 5 minutes',
        category: 'performance',
      },
      {
        id: 'high_failure_phases',
        name: 'High Failure Rate Phases',
        description: 'Identify phases with >30% failure rate',
        category: 'failures',
      },
      {
        id: 'loop_iterations',
        name: 'Loop Iteration Analysis',
        description: 'Tasks stuck in Phase 3↔4 or Phase 5 loops',
        category: 'loops',
      },
      {
        id: 'recovery_effectiveness',
        name: 'Recovery Agent Effectiveness',
        description: 'Success rate of recovery interventions by category',
        category: 'recovery',
      },
      {
        id: 'validation_patterns',
        name: 'Validation Failure Patterns',
        description: 'Common validation errors across all tasks',
        category: 'validation',
      },
    ];
  }

  /**
   * Execute a specific diagnostic query.
   */
  executeDiagnosticQuery(queryId: string): DiagnosticQueryResult {
    const query = this.getDiagnosticQueries().find(q => q.id === queryId);
    if (!query) {
      throw new Error(`Unknown diagnostic query: ${queryId}`);
    }

    let results: unknown[] = [];
    let summary = '';
    const recommendations: string[] = [];

    switch (queryId) {
      case 'slow_phases':
        results = this.querySlowPhases();
        summary = `Found ${results.length} phase executions exceeding 5 minutes`;
        if (results.length > 10) {
          recommendations.push('Consider optimizing validator timeout configurations');
          recommendations.push('Review phase execution logs for blocking operations');
        }
        break;

      case 'high_failure_phases':
        results = this.queryHighFailurePhases();
        summary = `Found ${results.length} phases with >30% failure rate`;
        if (results.length > 0) {
          recommendations.push('Investigate validator implementations for false negatives');
          recommendations.push('Review phase-specific documentation for task authors');
        }
        break;

      case 'loop_iterations':
        results = this.queryLoopIterations();
        summary = `Found ${results.length} tasks with excessive loop iterations`;
        if (results.length > 5) {
          recommendations.push('Review loop exit conditions in phase orchestrator');
          recommendations.push('Consider stricter validation criteria to prevent endless loops');
        }
        break;

      case 'recovery_effectiveness':
        results = this.queryRecoveryEffectiveness();
        summary = 'Recovery agent performance by category';
        break;

      case 'validation_patterns':
        results = this.queryValidationPatterns();
        summary = `Identified ${results.length} common validation failure patterns`;
        if (results.length > 0) {
          recommendations.push('Update task templates to address common validation errors');
          recommendations.push('Improve recovery agent diagnosis for frequent patterns');
        }
        break;
    }

    return {
      query,
      executedAt: new Date().toISOString(),
      results,
      summary,
      recommendations,
    };
  }

  // ===== Private Helper Methods =====

  private safeParse(json: string): unknown {
    try {
      return JSON.parse(json);
    } catch {
      return json;
    }
  }

  private detectLoops(phases: PhaseExecutionTrace[]): number {
    let loopCount = 0;
    
    // Detect Phase 3↔4 loops - count total phases 3&4 runs
    const phase34Runs = phases.filter(p => p.phaseIndex === 3 || p.phaseIndex === 4);
    if (phase34Runs.length > 2) {
      // Subtract 2 because first pass through phases 3 and 4 is normal
      loopCount += phase34Runs.length - 2;
    }

    // Detect Phase 5 internal loops (multiple attempts)
    const phase5Runs = phases.filter(p => p.phaseIndex === 5);
    if (phase5Runs.length > 1) {
      loopCount += phase5Runs.length - 1;
    }

    return loopCount;
  }

  private detectStuckTask(
    task: { status: string; created_at: string },
    phases: PhaseExecutionTrace[]
  ): boolean {
    // Task is stuck if:
    // 1. Status is 'running' or 'pending'
    // 2. Created more than 30 minutes ago
    // 3. No phase completed in last 10 minutes
    
    if (task.status !== 'running' && task.status !== 'pending') {
      return false;
    }

    const taskAge = Date.now() - new Date(task.created_at).getTime();
    if (taskAge < 30 * 60 * 1000) {
      return false;
    }

    const lastPhase = phases[phases.length - 1];
    if (!lastPhase || !lastPhase.completedAt) {
      return true;
    }

    const lastPhaseAge = Date.now() - new Date(lastPhase.completedAt).getTime();
    return lastPhaseAge > 10 * 60 * 1000;
  }

  private getAllActiveTasks(): Array<{ id: string }> {
    return this.db.prepare(`
      SELECT id FROM tasks
      WHERE status IN ('pending', 'running')
    `).all() as Array<{ id: string }>;
  }

  private querySlowPhases(): unknown[] {
    // Convert Julian day difference to milliseconds (MS_PER_DAY = 86400000)
    return this.db.prepare(`
      SELECT
        task_id,
        phase_index,
        attempt,
        (julianday(completed_at) - julianday(created_at)) * ${MS_PER_DAY} as duration_ms,
        status
      FROM task_stage_runs
      WHERE completed_at IS NOT NULL
        AND (julianday(completed_at) - julianday(created_at)) * ${MS_PER_DAY} > 300000
      ORDER BY duration_ms DESC
      LIMIT 50
    `).all();
  }

  private queryHighFailurePhases(): unknown[] {
    return this.db.prepare(`
      SELECT 
        phase_index,
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_runs,
        CAST(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) as failure_rate
      FROM task_stage_runs
      GROUP BY phase_index
      HAVING failure_rate > 0.3
      ORDER BY failure_rate DESC
    `).all();
  }

  private queryLoopIterations(): unknown[] {
    return this.db.prepare(`
      SELECT 
        task_id,
        phase_index,
        COUNT(*) as iterations,
        MAX(attempt) as max_attempt
      FROM task_stage_runs
      WHERE phase_index IN (3, 4, 5)
      GROUP BY task_id, phase_index
      HAVING iterations > 3
      ORDER BY iterations DESC
    `).all();
  }

  private queryRecoveryEffectiveness(): unknown[] {
    const rows = this.db.prepare(`
      SELECT recovery_diagnosis
      FROM task_stage_runs
      WHERE recovery_diagnosis IS NOT NULL
    `).all() as Array<{ recovery_diagnosis: string }>;

    const stats: Record<string, { total: number; success: number }> = {};

    for (const row of rows) {
      try {
        const diagnosis = JSON.parse(row.recovery_diagnosis);
        const category = diagnosis.category || 'unknown';
        
        if (!stats[category]) {
          stats[category] = { total: 0, success: 0 };
        }
        
        stats[category].total++;
        if (diagnosis.success) {
          stats[category].success++;
        }
      } catch {
        // Skip unparseable entries
      }
    }

    return Object.entries(stats).map(([category, data]) => ({
      category,
      totalAttempts: data.total,
      successfulRecoveries: data.success,
      successRate: data.total > 0 ? data.success / data.total : 0,
    }));
  }

  private queryValidationPatterns(): unknown[] {
    const rows = this.db.prepare(`
      SELECT validator_results
      FROM task_stage_runs
      WHERE status = 'failed'
        AND validator_results IS NOT NULL
    `).all() as Array<{ validator_results: string }>;

    const patterns: Record<string, number> = {};

    for (const row of rows) {
      try {
        const results = JSON.parse(row.validator_results);
        if (Array.isArray(results)) {
          for (const result of results) {
            const key = result.validator || 'unknown';
            patterns[key] = (patterns[key] || 0) + 1;
          }
        }
      } catch {
        // Skip unparseable entries
      }
    }

    return Object.entries(patterns)
      .map(([validator, count]) => ({ validator, failureCount: count }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 20);
  }
}

// Singleton instance
let instance: PhaseObservabilityService | null = null;

export function getPhaseObservabilityService(db?: Database.Database): PhaseObservabilityService {
  if (!instance && !db) {
    throw new Error('PhaseObservabilityService must be initialized with a database instance');
  }
  
  if (db && !instance) {
    instance = new PhaseObservabilityService(db);
  }
  
  return instance!;
}
