/**
 * Log Transport - Batched Upload to Backend
 *
 * Sends logs every 10 seconds or when buffer reaches 100 entries.
 * Includes session metadata on first batch only.
 */

import type { LogEntry } from './types';
import { logger } from './logger';
import { getApiBaseUrl } from '../apiBaseUrl';

interface SessionMetadata {
  sessionId: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  timestamp: string;
}

interface LogBatch {
  type: 'session_start' | 'log_batch';
  sessionId: string;
  meta?: SessionMetadata;
  logs?: LogEntry[];
}

class LogTransport {
  private static instance: LogTransport;
  private intervalId?: number;
  private sessionMetaSent = false;
  private backendUrl: string;

  private constructor() {
    this.backendUrl = getApiBaseUrl();
    this.start();
  }

  static getInstance(): LogTransport {
    if (!LogTransport.instance) {
      LogTransport.instance = new LogTransport();
    }
    return LogTransport.instance;
  }

  private getSessionMetadata(): SessionMetadata {
    return {
      sessionId: logger.getSessionId(),
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async sendBatch(batch: LogBatch): Promise<void> {
    try {
      const response = await fetch(`${this.backendUrl}/api/logs/frontend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        console.error('[LogTransport] Failed to send logs:', response.statusText);
      }
    } catch (error) {
      console.error('[LogTransport] Error sending logs:', error);
      // Don't throw - we don't want logging failures to break the app
    }
  }

  private async uploadLogs(): Promise<void> {
    const logs = logger.flush();

    if (logs.length === 0) {
      return;
    }

    // Send session metadata on first batch
    if (!this.sessionMetaSent) {
      await this.sendBatch({
        type: 'session_start',
        sessionId: logger.getSessionId(),
        meta: this.getSessionMetadata(),
      });
      this.sessionMetaSent = true;
    }

    // Send log batch
    await this.sendBatch({
      type: 'log_batch',
      sessionId: logger.getSessionId(),
      logs,
    });
  }

  start(): void {
    if (this.intervalId) {
      return;
    }

    // Upload every 10 seconds
    this.intervalId = window.setInterval(() => {
      void this.uploadLogs();
    }, 10000);

    // Upload before page unload
    window.addEventListener('beforeunload', () => {
      const logs = logger.getBuffer();
      if (logs.length > 0) {
        // Use sendBeacon for reliable delivery during unload
        const batch: LogBatch = {
          type: 'log_batch',
          sessionId: logger.getSessionId(),
          logs,
        };
        navigator.sendBeacon(
          `${this.backendUrl}/api/logs/frontend`,
          JSON.stringify(batch)
        );
      }
    });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Force immediate upload (useful for testing or critical errors)
   */
  async forceUpload(): Promise<void> {
    await this.uploadLogs();
  }
}

// Auto-start transport
export const transport = LogTransport.getInstance();
