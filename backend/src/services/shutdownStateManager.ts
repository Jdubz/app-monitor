/**
 * Shutdown State Manager
 *
 * Persists ephemeral state before graceful shutdown to enable seamless
 * recovery after restart. This prevents data loss during deployments.
 */

import { logger } from '../utils/logger.js';
import { DevBotsDatabase } from './database.js';
import type { RetryAttempt } from './devBotsManager.js';
import { daysAgo, MS_PER_DAY, MS_PER_HOUR } from '../constants/timeouts.js';

export interface ShutdownState {
  timestamp: number;
  retryHistory: Map<string, RetryAttempt[]>;
  logFilePositions: Map<string, number>;
  circuitBreakerStates: Map<string, {
    failureCount: number;
    lastFailureTime: number;
    state: 'closed' | 'open' | 'half-open';
  }>;
}

export class ShutdownStateManager {
  private db: DevBotsDatabase;

  constructor(db?: DevBotsDatabase) {
    this.db = db || new DevBotsDatabase();
    this.ensureTablesExist();
  }

  /**
   * Ensure shutdown state tables exist
   */
  private ensureTablesExist(): void {
    try {
      // Retry history table
      this.db.getConnection().exec(`
        CREATE TABLE IF NOT EXISTS retry_history (
          task_id TEXT NOT NULL,
          attempt_number INTEGER NOT NULL,
          timestamp TEXT NOT NULL,
          reason TEXT,
          error TEXT,
          exit_code INTEGER,
          worker_id TEXT,
          agent_id TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (task_id, attempt_number)
        )
      `);

      // Log file positions table
      this.db.getConnection().exec(`
        CREATE TABLE IF NOT EXISTS log_file_positions (
          file_path TEXT PRIMARY KEY,
          position INTEGER NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Circuit breaker states table
      this.db.getConnection().exec(`
        CREATE TABLE IF NOT EXISTS circuit_breaker_states (
          service_name TEXT PRIMARY KEY,
          failure_count INTEGER NOT NULL DEFAULT 0,
          last_failure_time INTEGER,
          state TEXT NOT NULL CHECK(state IN ('closed', 'open', 'half-open')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `);

      logger.info({
        category: 'system',
        action: 'shutdown_state_tables_initialized',
        message: 'Shutdown state persistence tables initialized'
      });
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'shutdown_state_tables_failed',
        message: 'Failed to initialize shutdown state tables',
        error
      });
    }
  }

  /**
   * Save retry history before shutdown
   */
  public async saveRetryHistory(retryHistory: Map<string, RetryAttempt[]>): Promise<void> {
    const startTime = Date.now();
    let savedCount = 0;

    try {
      const stmt = this.db.getConnection().prepare(`
        INSERT OR REPLACE INTO retry_history
        (task_id, attempt_number, timestamp, reason, error, exit_code, worker_id, agent_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = this.db.getConnection().transaction((entries: Array<[string, RetryAttempt[]]>) => {
        for (const [taskId, attempts] of entries) {
          for (const attempt of attempts) {
            stmt.run(
              taskId,
              attempt.attemptNumber,
              attempt.timestamp,
              attempt.reason || null,
              attempt.error || null,
              attempt.exitCode || null,
              attempt.workerId || null,
              attempt.agentId || null,
              Date.now()
            );
            savedCount++;
          }
        }
      });

      transaction(Array.from(retryHistory.entries()));

      logger.info({
        category: 'system',
        action: 'retry_history_persisted',
        message: 'Retry history persisted to database',
        details: {
          taskCount: retryHistory.size,
          attemptCount: savedCount,
          durationMs: Date.now() - startTime
        }
      });
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'retry_history_persist_failed',
        message: 'Failed to persist retry history',
        error,
        details: { savedCount }
      });
    }
  }

  /**
   * Restore retry history after startup
   */
  public async restoreRetryHistory(): Promise<Map<string, RetryAttempt[]>> {
    const retryHistory = new Map<string, RetryAttempt[]>();

    try {
      const rows = this.db.getConnection().prepare(`
        SELECT task_id, attempt_number, timestamp, reason, error, exit_code, worker_id, agent_id
        FROM retry_history
        WHERE created_at > ? -- Only recent history (last 7 days)
        ORDER BY task_id, attempt_number
      `).all(daysAgo(7).getTime());

      for (const row of rows as Array<{
        task_id: string;
        attempt_number: number;
        timestamp: string;
        reason: string;
        error: string | null;
        exit_code: number | null;
        worker_id: string | null;
        agent_id: string | null;
      }>) {
        if (!retryHistory.has(row.task_id)) {
          retryHistory.set(row.task_id, []);
        }

        retryHistory.get(row.task_id)!.push({
          attemptNumber: row.attempt_number,
          timestamp: row.timestamp,
          reason: row.reason,
          error: row.error ?? undefined,
          exitCode: row.exit_code ?? undefined,
          workerId: row.worker_id ?? undefined,
          agentId: row.agent_id ?? undefined
        });
      }

      logger.info({
        category: 'system',
        action: 'retry_history_restored',
        message: 'Retry history restored from database',
        details: {
          taskCount: retryHistory.size,
          attemptCount: rows.length
        }
      });

      return retryHistory;
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'retry_history_restore_failed',
        message: 'Failed to restore retry history',
        error
      });
      return new Map();
    }
  }

  /**
   * Save log file positions before shutdown
   */
  public async saveLogFilePositions(positions: Map<string, number>): Promise<void> {
    try {
      const stmt = this.db.getConnection().prepare(`
        INSERT OR REPLACE INTO log_file_positions (file_path, position, updated_at)
        VALUES (?, ?, ?)
      `);

      const transaction = this.db.getConnection().transaction((entries: [string, number][]) => {
        for (const [filePath, position] of entries) {
          stmt.run(filePath, position, Date.now());
        }
      });

      transaction(Array.from(positions.entries()));

      logger.info({
        category: 'system',
        action: 'log_positions_persisted',
        message: 'Log file positions persisted',
        details: { fileCount: positions.size }
      });
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'log_positions_persist_failed',
        message: 'Failed to persist log file positions',
        error
      });
    }
  }

  /**
   * Restore log file positions after startup
   */
  public async restoreLogFilePositions(): Promise<Map<string, number>> {
    const positions = new Map<string, number>();

    try {
      const rows = this.db.getConnection().prepare(`
        SELECT file_path, position
        FROM log_file_positions
        WHERE updated_at > ? -- Only recent positions (last 24 hours)
      `).all(Date.now() - (MS_PER_DAY));

      for (const row of rows as Array<{ file_path: string; position: number }>) {
        positions.set(row.file_path, row.position);
      }

      logger.info({
        category: 'system',
        action: 'log_positions_restored',
        message: 'Log file positions restored',
        details: { fileCount: positions.size }
      });

      return positions;
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'log_positions_restore_failed',
        message: 'Failed to restore log file positions',
        error
      });
      return new Map();
    }
  }

  /**
   * Save circuit breaker states before shutdown
   */
  public async saveCircuitBreakerStates(
    states: Map<string, { failureCount: number; lastFailureTime: number; state: 'closed' | 'open' | 'half-open' }>
  ): Promise<void> {
    try {
      const stmt = this.db.getConnection().prepare(`
        INSERT OR REPLACE INTO circuit_breaker_states
        (service_name, failure_count, last_failure_time, state, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      const transaction = this.db.getConnection().transaction((entries: Array<[string, { failureCount: number; lastFailureTime: number; state: 'closed' | 'open' | 'half-open' }]>) => {
        for (const [serviceName, state] of entries) {
          stmt.run(
            serviceName,
            state.failureCount,
            state.lastFailureTime,
            state.state,
            Date.now()
          );
        }
      });

      transaction(Array.from(states.entries()));

      logger.info({
        category: 'system',
        action: 'circuit_breaker_states_persisted',
        message: 'Circuit breaker states persisted',
        details: { serviceCount: states.size }
      });
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'circuit_breaker_persist_failed',
        message: 'Failed to persist circuit breaker states',
        error
      });
    }
  }

  /**
   * Restore circuit breaker states after startup
   */
  public async restoreCircuitBreakerStates(): Promise<Map<string, { failureCount: number; lastFailureTime: number; state: 'closed' | 'open' | 'half-open' }>> {
    const states = new Map();

    try {
      const rows = this.db.getConnection().prepare(`
        SELECT service_name, failure_count, last_failure_time, state
        FROM circuit_breaker_states
        WHERE updated_at > ? -- Only recent states (last hour)
      `).all(Date.now() - (MS_PER_HOUR));

      for (const row of rows as Array<{
        service_name: string;
        failure_count: number;
        last_failure_time: number;
        state: 'closed' | 'open' | 'half-open';
      }>) {
        states.set(row.service_name, {
          failureCount: row.failure_count,
          lastFailureTime: row.last_failure_time,
          state: row.state
        });
      }

      logger.info({
        category: 'system',
        action: 'circuit_breaker_states_restored',
        message: 'Circuit breaker states restored',
        details: { serviceCount: states.size }
      });

      return states;
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'circuit_breaker_restore_failed',
        message: 'Failed to restore circuit breaker states',
        error
      });
      return new Map();
    }
  }

  /**
   * Clean up old shutdown state data
   */
  public async cleanup(): Promise<void> {
    try {
      const cutoffTime = daysAgo(7).getTime();

      const retryDeleted = this.db.getConnection().prepare(`
        DELETE FROM retry_history WHERE created_at < ?
      `).run(cutoffTime);

      const logDeleted = this.db.getConnection().prepare(`
        DELETE FROM log_file_positions WHERE updated_at < ?
      `).run(cutoffTime);

      const circuitDeleted = this.db.getConnection().prepare(`
        DELETE FROM circuit_breaker_states WHERE updated_at < ?
      `).run(cutoffTime);

      logger.info({
        category: 'system',
        action: 'shutdown_state_cleaned',
        message: 'Old shutdown state data cleaned',
        details: {
          retryHistoryDeleted: retryDeleted.changes,
          logPositionsDeleted: logDeleted.changes,
          circuitBreakerDeleted: circuitDeleted.changes
        }
      });
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'shutdown_state_cleanup_failed',
        message: 'Failed to clean up old shutdown state',
        error
      });
    }
  }
}
