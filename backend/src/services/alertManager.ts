/**
 * Alert Manager Service
 *
 * Manages system alerts with basic CRUD operations
 * Stores alerts in-memory using a Map
 */

import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import type { Alert } from '../types/alert.js';

export class AlertManager {
  private alerts: Map<string, Alert>;

  constructor() {
    this.alerts = new Map();
    logger.info({
      category: 'system',
      action: 'alert_manager_initialized',
      message: 'AlertManager initialized with in-memory storage',
    });
  }

  /**
   * Create a new alert
   * @param chainId - Chain ID associated with the alert
   * @param reason - Reason or description of the alert
   * @returns A copy of the created alert (immutable)
   */
  createAlert(chainId: string, reason: string): Alert {
    const alert: Alert = {
      id: randomUUID(),
      chainId,
      reason,
      timestamp: Date.now(),
      dismissed: false,
    };

    this.alerts.set(alert.id, alert);

    logger.info({
      category: 'alerts',
      action: 'alert_created',
      message: `Alert created for chain ${chainId}`,
      details: {
        alertId: alert.id,
        chainId,
        reason,
      },
    });

    // Return a copy to preserve immutability
    return { ...alert };
  }

  /**
   * Get all active (non-dismissed) alerts
   * @returns Array of alert copies (immutable)
   */
  getActiveAlerts(): Alert[] {
    const activeAlerts = Array.from(this.alerts.values()).filter(
      (alert) => !alert.dismissed
    );

    logger.debug({
      category: 'alerts',
      action: 'get_active_alerts',
      message: `Retrieved ${activeAlerts.length} active alerts`,
      details: {
        count: activeAlerts.length,
      },
    });

    // Return copies to preserve immutability
    return activeAlerts.map(alert => ({ ...alert }));
  }

  /**
   * Dismiss an alert by ID
   * @param alertId - ID of the alert to dismiss
   * @returns A copy of the dismissed alert, or null if not found (immutable)
   */
  dismissAlert(alertId: string): Alert | null {
    const alert = this.alerts.get(alertId);

    if (!alert) {
      logger.warn({
        category: 'alerts',
        action: 'dismiss_alert_not_found',
        message: `Alert not found: ${alertId}`,
        details: {
          alertId,
        },
      });
      return null;
    }

    if (alert.dismissed) {
      logger.warn({
        category: 'alerts',
        action: 'dismiss_alert_already_dismissed',
        message: `Alert already dismissed: ${alertId}`,
        details: {
          alertId,
        },
      });
      // Return copy even for already dismissed alert
      return { ...alert };
    }

    // Create new object instead of mutating existing one
    const dismissedAlert = { ...alert, dismissed: true };
    this.alerts.set(alertId, dismissedAlert);

    logger.info({
      category: 'alerts',
      action: 'alert_dismissed',
      message: `Alert dismissed: ${alertId}`,
      details: {
        alertId,
        chainId: dismissedAlert.chainId,
      },
    });

    // Return copy to preserve immutability
    return { ...dismissedAlert };
  }

  /**
   * Get alert by ID
   * @param alertId - ID of the alert to retrieve
   * @returns A copy of the alert, or null if not found (immutable)
   */
  getAlertById(alertId: string): Alert | null {
    const alert = this.alerts.get(alertId);
    // Return copy to preserve immutability
    return alert ? { ...alert } : null;
  }

  /**
   * Get all alerts (active and dismissed)
   * @returns Array of alert copies (immutable)
   */
  getAllAlerts(): Alert[] {
    // Return copies to preserve immutability
    return Array.from(this.alerts.values()).map(alert => ({ ...alert }));
  }

  /**
   * Clear all alerts (useful for testing)
   */
  clearAllAlerts(): void {
    const count = this.alerts.size;
    this.alerts.clear();

    logger.info({
      category: 'alerts',
      action: 'alerts_cleared',
      message: `Cleared ${count} alerts`,
      details: {
        count,
      },
    });
  }

  /**
   * Get alerts by chain ID
   * @param chainId - Chain ID to filter by
   * @returns Array of alert copies for the specified chain (immutable)
   */
  getAlertsByChainId(chainId: string): Alert[] {
    // Return copies to preserve immutability
    return Array.from(this.alerts.values())
      .filter((alert) => alert.chainId === chainId)
      .map(alert => ({ ...alert }));
  }
}
