/**
 * Webhook Event Queue Service
 * 
 * Provides durable webhook processing queue with retry logic.
 * Webhooks are persisted to SQLite immediately, then processed asynchronously.
 * 
 * Features:
 * - Deduplication (by GitHub delivery_id)
 * - Retry with exponential backoff
 * - Idempotent processing
 * - Metrics and observability
 */

import { randomUUID } from 'crypto';
import { getDatabase } from './database.js';
import { logger } from '../utils/logger.js';

export interface WebhookEvent {
  id: string;
  event_type: string;
  delivery_id: string;
  payload: string; // JSON string
  signature?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempt_count: number;
  last_attempt_at?: number;
  last_error?: string;
  received_at: number;
  completed_at?: number;
  repository?: string;
  pr_number?: number;
}

export interface WebhookEventMetrics {
  pending: number;
  processing: number;
  failed: number;
  completed_last_hour: number;
  failed_last_hour: number;
  oldest_pending_seconds: number | null;
}

export class WebhookEventQueue {
  private dbWrapper;
  private get db() {
    return this.dbWrapper.getConnection();
  }

  constructor() {
    this.dbWrapper = getDatabase();
  }

  /**
   * Enqueue webhook for asynchronous processing
   * Returns immediately - webhook will be processed by background worker
   * 
   * @param event - Webhook event data (without id, status, attempt_count, received_at)
   * @returns Event ID if enqueued, null if duplicate
   */
  async enqueue(event: Omit<WebhookEvent, 'id' | 'status' | 'attempt_count' | 'received_at'>): Promise<string | null> {
    const id = randomUUID();
    const now = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO webhook_events (
          id, event_type, delivery_id, payload, signature,
          status, attempt_count, received_at,
          repository, pr_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        event.event_type,
        event.delivery_id,
        event.payload,
        event.signature || null,
        'pending',
        0,
        now,
        event.repository || null,
        event.pr_number || null
      );

      logger.info({
        category: 'webhook-queue',
        action: 'webhook_enqueued',
        message: `Webhook enqueued: ${event.event_type}`,
        details: {
          id,
          event_type: event.event_type,
          delivery_id: event.delivery_id,
          repository: event.repository,
          pr_number: event.pr_number
        }
      });

      return id;

    } catch (error: any) {
      // Check if it's a duplicate delivery_id (UNIQUE constraint violation)
      if (error.message?.includes('UNIQUE constraint failed: webhook_events.delivery_id')) {
        logger.debug({
          category: 'webhook-queue',
          action: 'webhook_duplicate',
          message: `Duplicate webhook delivery_id: ${event.delivery_id}`,
          details: { delivery_id: event.delivery_id }
        });
        return null; // Already queued, silently ignore
      }

      logger.error({
        category: 'webhook-queue',
        action: 'enqueue_failed',
        message: 'Failed to enqueue webhook',
        error,
        details: { event_type: event.event_type, delivery_id: event.delivery_id }
      });

      throw error;
    }
  }

  /**
   * Get next pending webhook to process (FIFO order)
   */
  getNextPending(): WebhookEvent | null {
    const stmt = this.db.prepare(`
      SELECT * FROM webhook_events
      WHERE status = 'pending'
      ORDER BY received_at ASC
      LIMIT 1
    `);

    const row = stmt.get();
    return row ? this.mapRow(row) : null;
  }

  /**
   * Get webhooks ready for retry
   * Uses exponential backoff: 1m, 5m, 15m, 1h, 6h
   * Max 6 attempts before giving up
   */
  getRetryable(): WebhookEvent[] {
    const now = Date.now();
    const delays = [0, 60, 300, 900, 3600, 21600]; // seconds

    const stmt = this.db.prepare(`
      SELECT * FROM webhook_events
      WHERE status = 'failed'
        AND attempt_count < 6
      ORDER BY received_at ASC
      LIMIT 10
    `);

    const rows = stmt.all() as any[];
    const events = rows.map((row: any) => this.mapRow(row));

    // Filter by retry delay
    return events.filter((event: WebhookEvent) => {
      const delaySeconds = delays[Math.min(event.attempt_count, delays.length - 1)];
      const nextRetryTime = (event.last_attempt_at || event.received_at) + (delaySeconds * 1000);
      return now >= nextRetryTime;
    });
  }

  /**
   * Mark webhook as processing
   */
  markProcessing(id: string): void {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'processing',
          last_attempt_at = ?
      WHERE id = ?
    `);

    stmt.run(now, id);

    logger.debug({
      category: 'webhook-queue',
      action: 'webhook_processing',
      message: 'Webhook processing started',
      details: { id }
    });
  }

  /**
   * Mark webhook as successfully completed
   */
  markCompleted(id: string): void {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'completed',
          completed_at = ?,
          attempt_count = attempt_count + 1
      WHERE id = ?
    `);

    stmt.run(now, id);

    logger.info({
      category: 'webhook-queue',
      action: 'webhook_completed',
      message: 'Webhook processed successfully',
      details: { id }
    });
  }

  /**
   * Mark webhook as failed (will be retried with exponential backoff)
   */
  markFailed(id: string, error: string): void {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      UPDATE webhook_events
      SET status = 'failed',
          attempt_count = attempt_count + 1,
          last_attempt_at = ?,
          last_error = ?
      WHERE id = ?
    `);

    stmt.run(now, error, id);

    // Check if this is the last retry
    const event = this.getById(id);
    if (event && event.attempt_count >= 6) {
      logger.error({
        category: 'webhook-queue',
        action: 'webhook_dead_letter',
        message: 'Webhook exceeded max retry attempts (dead letter)',
        details: {
          id,
          event_type: event.event_type,
          delivery_id: event.delivery_id,
          attempts: event.attempt_count,
          last_error: error
        }
      });
    } else {
      logger.warn({
        category: 'webhook-queue',
        action: 'webhook_failed',
        message: 'Webhook processing failed, will retry',
        details: {
          id,
          attempts: event?.attempt_count || 0,
          error
        }
      });
    }
  }

  /**
   * Get webhook by ID
   */
  getById(id: string): WebhookEvent | null {
    const stmt = this.db.prepare('SELECT * FROM webhook_events WHERE id = ?');
    const row = stmt.get(id);
    return row ? this.mapRow(row) : null;
  }

  /**
   * Cleanup old completed webhooks (older than 7 days)
   * Returns number of deleted records
   */
  cleanup(): number {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(`
      DELETE FROM webhook_events
      WHERE status = 'completed'
        AND completed_at < ?
    `);

    const result = stmt.run(sevenDaysAgo);
    const deleted = result.changes || 0;

    if (deleted > 0) {
      logger.info({
        category: 'webhook-queue',
        action: 'cleanup_completed',
        message: `Cleaned up ${deleted} old completed webhooks`,
        details: { deleted, cutoff_date: new Date(sevenDaysAgo).toISOString() }
      });
    }

    return deleted;
  }

  /**
   * Get queue metrics for monitoring
   */
  getMetrics(): WebhookEventMetrics {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // Count by status
    const statusCounts = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM webhook_events
      WHERE status IN ('pending', 'processing', 'failed')
      GROUP BY status
    `).all() as Array<{ status: string; count: number }>;

    const pending = statusCounts.find(s => s.status === 'pending')?.count || 0;
    const processing = statusCounts.find(s => s.status === 'processing')?.count || 0;
    const failed = statusCounts.find(s => s.status === 'failed')?.count || 0;

    // Completed in last hour
    const completedLastHour = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM webhook_events
      WHERE status = 'completed'
        AND completed_at > ?
    `).get(oneHourAgo) as { count: number };

    // Failed in last hour
    const failedLastHour = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM webhook_events
      WHERE status = 'failed'
        AND last_attempt_at > ?
    `).get(oneHourAgo) as { count: number };

    // Oldest pending
    const oldestPending = this.db.prepare(`
      SELECT received_at
      FROM webhook_events
      WHERE status = 'pending'
      ORDER BY received_at ASC
      LIMIT 1
    `).get() as { received_at: number } | undefined;

    const oldestPendingSeconds = oldestPending 
      ? Math.floor((now - oldestPending.received_at) / 1000)
      : null;

    return {
      pending,
      processing,
      failed,
      completed_last_hour: completedLastHour.count,
      failed_last_hour: failedLastHour.count,
      oldest_pending_seconds: oldestPendingSeconds
    };
  }

  /**
   * Map database row to WebhookEvent object
   */
  private mapRow(row: any): WebhookEvent {
    return {
      id: row.id,
      event_type: row.event_type,
      delivery_id: row.delivery_id,
      payload: row.payload,
      signature: row.signature,
      status: row.status,
      attempt_count: row.attempt_count,
      last_attempt_at: row.last_attempt_at,
      last_error: row.last_error,
      received_at: row.received_at,
      completed_at: row.completed_at,
      repository: row.repository,
      pr_number: row.pr_number
    };
  }
}
