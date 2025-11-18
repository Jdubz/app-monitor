/**
 * Worker Lifecycle Service
 * 
 * Manages worker registration, heartbeats, and stalled worker detection.
 * Extracted from TaskQueueService to follow Single Responsibility Principle.
 * 
 * Part of P1 refactoring plan - Week 2: Extract Worker Management
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export type WorkerStatus = 'starting' | 'running' | 'stopping' | 'stopped';

export interface Worker {
  id: string;
  agent_id: string;
  status: WorkerStatus;
  current_task_id?: string;
  created_at: number;
  last_heartbeat: number;
  heartbeat_timeout_ms: number;
}

export interface WorkerMetrics {
  total: number;
  running: number;
  stopped: number;
  stalled: number;
}

export interface StalledWorker {
  id: string;
  task_id: string;
  last_heartbeat: number;
  time_since_heartbeat_ms: number;
}

/**
 * Service for managing worker lifecycle
 */
export class WorkerLifecycleService {
  private readonly HEARTBEAT_TIMEOUT_MS = 90000; // 90 seconds (4.5x the 20s heartbeat interval)

  constructor(private db: Database.Database) {}

  /**
   * Execute operations within a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Register a new worker
   */
  registerWorker(
    workerId: string,
    agentId: string,
    taskId: string,
    options?: { heartbeatTimeoutMs?: number }
  ): Worker {
    const now = Date.now();
    const heartbeatTimeoutMs = options?.heartbeatTimeoutMs ?? this.HEARTBEAT_TIMEOUT_MS;

    const stmt = this.db.prepare(`
      INSERT INTO workers (id, agent_id, status, current_task_id, created_at, last_heartbeat, heartbeat_timeout_ms)
      VALUES (?, ?, 'running', ?, ?, ?, ?)
    `);

    stmt.run(workerId, agentId, taskId, now, now, heartbeatTimeoutMs);

    logger.info({
      category: 'worker',
      action: 'worker_registered',
      message: `Registered worker ${workerId} for task ${taskId}`,
      details: { workerId, agentId, taskId }
    });

    return {
      id: workerId,
      agent_id: agentId,
      status: 'running',
      current_task_id: taskId,
      created_at: now,
      last_heartbeat: now,
      heartbeat_timeout_ms: heartbeatTimeoutMs
    };
  }

  /**
   * Update worker heartbeat (keepalive signal)
   */
  updateHeartbeat(workerId: string): void {
    const stmt = this.db.prepare('UPDATE workers SET last_heartbeat = ? WHERE id = ?');
    const result = stmt.run(Date.now(), workerId);

    if (result.changes === 0) {
      logger.warn({
        category: 'worker',
        action: 'heartbeat_update_failed',
        message: `Worker ${workerId} not found for heartbeat update`,
        details: { workerId }
      });
    }
  }

  /**
   * Get worker by ID
   */
  getWorker(workerId: string): Worker | null {
    const stmt = this.db.prepare('SELECT * FROM workers WHERE id = ?');
    const row = stmt.get(workerId) as Worker | undefined;
    return row ?? null;
  }

  /**
   * Get all active workers
   */
  getActiveWorkers(): Worker[] {
    const stmt = this.db.prepare(`
      SELECT * FROM workers
      WHERE status = 'running'
      ORDER BY created_at DESC
    `);
    return stmt.all() as Worker[];
  }

  /**
   * Get worker metrics
   */
  getMetrics(): WorkerMetrics {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'stopped' THEN 1 ELSE 0 END) as stopped
      FROM workers
    `);

    const row = stmt.get() as { total: number; running: number; stopped: number };

    // Detect stalled workers without modifying state
    const timeout = Date.now() - this.HEARTBEAT_TIMEOUT_MS;
    const stalledStmt = this.db.prepare(`
      SELECT COUNT(*) as stalled
      FROM workers
      WHERE status = 'running'
      AND last_heartbeat < ?
    `);
    const stalledRow = stalledStmt.get(timeout) as { stalled: number };

    return {
      total: row.total,
      running: row.running,
      stopped: row.stopped,
      stalled: stalledRow.stalled
    };
  }

  /**
   * Detect and return stalled workers (does not modify state)
   * Call handleStalledWorkers() to actually handle them
   */
  detectStalledWorkers(): StalledWorker[] {
    const timeout = Date.now() - this.HEARTBEAT_TIMEOUT_MS;
    const now = Date.now();

    const stmt = this.db.prepare(`
      SELECT id, current_task_id, last_heartbeat
      FROM workers
      WHERE status = 'running'
      AND last_heartbeat < ?
    `);

    const stalledWorkers = stmt.all(timeout) as Array<{
      id: string;
      current_task_id: string;
      last_heartbeat: number;
    }>;

    return stalledWorkers.map(worker => ({
      id: worker.id,
      task_id: worker.current_task_id,
      last_heartbeat: worker.last_heartbeat,
      time_since_heartbeat_ms: now - worker.last_heartbeat
    }));
  }

  /**
   * Mark worker as stopped
   */
  stopWorker(workerId: string): void {
    const stmt = this.db.prepare('UPDATE workers SET status = ? WHERE id = ?');
    stmt.run('stopped', workerId);

    logger.info({
      category: 'worker',
      action: 'worker_stopped',
      message: `Worker ${workerId} stopped`,
      details: { workerId }
    });
  }

  /**
   * Handle stalled workers - mark them as stopped
   * Returns array of stalled worker IDs
   * Note: Does NOT fail tasks - that should be done by TaskQueueService
   */
  handleStalledWorkers(): StalledWorker[] {
    return this.transaction(() => {
      const stalledWorkers = this.detectStalledWorkers();

      for (const worker of stalledWorkers) {
        this.stopWorker(worker.id);

        logger.warn({
          category: 'worker',
          action: 'stalled_worker_detected',
          message: `Worker ${worker.id} stalled (no heartbeat for ${Math.round(worker.time_since_heartbeat_ms / 1000)}s)`,
          details: {
            workerId: worker.id,
            taskId: worker.task_id,
            lastHeartbeat: worker.last_heartbeat,
            timeSinceLastHeartbeat_ms: worker.time_since_heartbeat_ms,
            timeout_ms: this.HEARTBEAT_TIMEOUT_MS
          }
        });
      }

      return stalledWorkers;
    });
  }

  /**
   * Clear all worker records (typically on system shutdown)
   */
  clearAllWorkers(): void {
    const stmt = this.db.prepare('DELETE FROM workers');
    const result = stmt.run();

    logger.info({
      category: 'worker',
      action: 'workers_cleared',
      message: `Cleared ${result.changes} worker records`,
      details: { count: result.changes }
    });
  }

  /**
   * Clean up old stopped workers (older than specified age)
   */
  cleanupOldWorkers(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    
    const stmt = this.db.prepare(`
      DELETE FROM workers
      WHERE status = 'stopped'
      AND created_at < ?
    `);

    const result = stmt.run(cutoff);

    if (result.changes > 0) {
      logger.info({
        category: 'worker',
        action: 'old_workers_cleaned',
        message: `Cleaned up ${result.changes} old stopped workers`,
        details: { count: result.changes, maxAgeMs }
      });
    }

    return result.changes;
  }
}
