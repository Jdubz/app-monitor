/**
 * Alert Manager Service Tests
 *
 * Tests the AlertManager service for creating, retrieving, and dismissing alerts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AlertManager } from './alertManager.js';
import { logger } from '../utils/logger.js';

// Mock dependencies
vi.mock('../utils/logger.js');

describe('AlertManager', () => {
  let alertManager: AlertManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock logger
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.debug).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});

    alertManager = new AlertManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with empty alert storage', () => {
      // Given: New AlertManager instance
      const manager = new AlertManager();

      // When: Getting all alerts
      const alerts = manager.getAllAlerts();

      // Then: No alerts exist
      expect(alerts).toHaveLength(0);
    });

    it('should log initialization', () => {
      // Given: Creating new AlertManager
      // When: Instance is created
      new AlertManager();

      // Then: Initialization is logged
      expect(logger.info).toHaveBeenCalledWith({
        category: 'system',
        action: 'alert_manager_initialized',
        message: 'AlertManager initialized with in-memory storage',
      });
    });
  });

  describe('createAlert', () => {
    it('should create new alert with valid parameters', () => {
      // Given: Valid chainId and reason
      const chainId = 'chain-123';
      const reason = 'Test alert reason';

      // When: Creating alert
      const alert = alertManager.createAlert(chainId, reason);

      // Then: Alert is created with correct properties
      expect(alert).toBeDefined();
      expect(alert.id).toBeDefined();
      expect(typeof alert.id).toBe('string');
      expect(alert.chainId).toBe(chainId);
      expect(alert.reason).toBe(reason);
      expect(alert.timestamp).toBeGreaterThan(0);
      expect(alert.dismissed).toBe(false);
    });

    it('should generate unique IDs for each alert', () => {
      // Given: Multiple alerts
      // When: Creating multiple alerts
      const alert1 = alertManager.createAlert('chain-1', 'reason-1');
      const alert2 = alertManager.createAlert('chain-2', 'reason-2');
      const alert3 = alertManager.createAlert('chain-3', 'reason-3');

      // Then: Each alert has unique ID
      expect(alert1.id).not.toBe(alert2.id);
      expect(alert2.id).not.toBe(alert3.id);
      expect(alert1.id).not.toBe(alert3.id);
    });

    it('should store created alert', () => {
      // Given: Creating alert
      const alert = alertManager.createAlert('chain-123', 'Test reason');

      // When: Retrieving alert by ID
      const retrieved = alertManager.getAlertById(alert.id);

      // Then: Alert is stored and retrievable
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(alert.id);
    });

    it('should log alert creation', () => {
      // Given: Valid chainId and reason
      const chainId = 'chain-123';
      const reason = 'Test alert';

      // When: Creating alert
      const alert = alertManager.createAlert(chainId, reason);

      // Then: Creation is logged
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'alerts',
          action: 'alert_created',
          message: `Alert created for chain ${chainId}`,
          details: {
            alertId: alert.id,
            chainId,
            reason,
          },
        })
      );
    });

    it('should set timestamp to current time', () => {
      // Given: Current time before creation
      const beforeTime = Date.now();

      // When: Creating alert
      const alert = alertManager.createAlert('chain-123', 'Test reason');

      // Then: Timestamp is approximately current time
      const afterTime = Date.now();
      expect(alert.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(alert.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('getActiveAlerts', () => {
    it('should return empty array when no alerts exist', () => {
      // Given: No alerts
      // When: Getting active alerts
      const alerts = alertManager.getActiveAlerts();

      // Then: Empty array is returned
      expect(alerts).toEqual([]);
      expect(alerts).toHaveLength(0);
    });

    it('should return all non-dismissed alerts', () => {
      // Given: Multiple active alerts
      const alert1 = alertManager.createAlert('chain-1', 'reason-1');
      const alert2 = alertManager.createAlert('chain-2', 'reason-2');
      const alert3 = alertManager.createAlert('chain-3', 'reason-3');

      // When: Getting active alerts
      const activeAlerts = alertManager.getActiveAlerts();

      // Then: All active alerts are returned
      expect(activeAlerts).toHaveLength(3);
      expect(activeAlerts.map(a => a.id)).toContain(alert1.id);
      expect(activeAlerts.map(a => a.id)).toContain(alert2.id);
      expect(activeAlerts.map(a => a.id)).toContain(alert3.id);
    });

    it('should exclude dismissed alerts', () => {
      // Given: Mix of active and dismissed alerts
      const alert1 = alertManager.createAlert('chain-1', 'reason-1');
      const alert2 = alertManager.createAlert('chain-2', 'reason-2');
      const alert3 = alertManager.createAlert('chain-3', 'reason-3');

      // Dismiss one alert
      alertManager.dismissAlert(alert2.id);

      // When: Getting active alerts
      const activeAlerts = alertManager.getActiveAlerts();

      // Then: Only non-dismissed alerts are returned
      expect(activeAlerts).toHaveLength(2);
      expect(activeAlerts.map(a => a.id)).toContain(alert1.id);
      expect(activeAlerts.map(a => a.id)).toContain(alert3.id);
      expect(activeAlerts.map(a => a.id)).not.toContain(alert2.id);
    });

    it('should log retrieval of active alerts', () => {
      // Given: Some active alerts
      alertManager.createAlert('chain-1', 'reason-1');
      alertManager.createAlert('chain-2', 'reason-2');

      // When: Getting active alerts
      alertManager.getActiveAlerts();

      // Then: Retrieval is logged
      expect(logger.debug).toHaveBeenCalledWith({
        category: 'alerts',
        action: 'get_active_alerts',
        message: 'Retrieved 2 active alerts',
        details: {
          count: 2,
        },
      });
    });
  });

  describe('dismissAlert', () => {
    it('should dismiss existing alert', () => {
      // Given: Active alert
      const alert = alertManager.createAlert('chain-123', 'Test reason');
      expect(alert.dismissed).toBe(false);

      // When: Dismissing alert
      const dismissed = alertManager.dismissAlert(alert.id);

      // Then: Alert is dismissed
      expect(dismissed).toBeDefined();
      expect(dismissed?.dismissed).toBe(true);
      expect(dismissed?.id).toBe(alert.id);
    });

    it('should remove dismissed alert from active alerts', () => {
      // Given: Active alert
      const alert = alertManager.createAlert('chain-123', 'Test reason');

      // When: Dismissing alert
      alertManager.dismissAlert(alert.id);

      // Then: Alert is not in active alerts
      const activeAlerts = alertManager.getActiveAlerts();
      expect(activeAlerts.map(a => a.id)).not.toContain(alert.id);
    });

    it('should return null for non-existent alert', () => {
      // Given: No alerts
      // When: Dismissing non-existent alert
      const result = alertManager.dismissAlert('non-existent-id');

      // Then: Null is returned
      expect(result).toBeNull();
    });

    it('should log warning when dismissing non-existent alert', () => {
      // Given: No alerts
      const alertId = 'non-existent-id';

      // When: Dismissing non-existent alert
      alertManager.dismissAlert(alertId);

      // Then: Warning is logged
      expect(logger.warn).toHaveBeenCalledWith({
        category: 'alerts',
        action: 'dismiss_alert_not_found',
        message: `Alert not found: ${alertId}`,
        details: {
          alertId,
        },
      });
    });

    it('should handle dismissing already dismissed alert', () => {
      // Given: Already dismissed alert
      const alert = alertManager.createAlert('chain-123', 'Test reason');
      alertManager.dismissAlert(alert.id);

      // When: Dismissing again
      const result = alertManager.dismissAlert(alert.id);

      // Then: Alert is returned but still dismissed
      expect(result).toBeDefined();
      expect(result?.dismissed).toBe(true);
    });

    it('should log warning when dismissing already dismissed alert', () => {
      // Given: Already dismissed alert
      const alert = alertManager.createAlert('chain-123', 'Test reason');
      alertManager.dismissAlert(alert.id);
      vi.clearAllMocks();

      // When: Dismissing again
      alertManager.dismissAlert(alert.id);

      // Then: Warning is logged
      expect(logger.warn).toHaveBeenCalledWith({
        category: 'alerts',
        action: 'dismiss_alert_already_dismissed',
        message: `Alert already dismissed: ${alert.id}`,
        details: {
          alertId: alert.id,
        },
      });
    });

    it('should log successful dismissal', () => {
      // Given: Active alert
      const alert = alertManager.createAlert('chain-123', 'Test reason');
      vi.clearAllMocks();

      // When: Dismissing alert
      alertManager.dismissAlert(alert.id);

      // Then: Dismissal is logged
      expect(logger.info).toHaveBeenCalledWith({
        category: 'alerts',
        action: 'alert_dismissed',
        message: `Alert dismissed: ${alert.id}`,
        details: {
          alertId: alert.id,
          chainId: alert.chainId,
        },
      });
    });
  });

  describe('getAlertById', () => {
    it('should retrieve alert by ID', () => {
      // Given: Created alert
      const alert = alertManager.createAlert('chain-123', 'Test reason');

      // When: Getting alert by ID
      const retrieved = alertManager.getAlertById(alert.id);

      // Then: Correct alert is returned
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(alert.id);
      expect(retrieved?.chainId).toBe(alert.chainId);
      expect(retrieved?.reason).toBe(alert.reason);
    });

    it('should return null for non-existent ID', () => {
      // Given: No alerts
      // When: Getting non-existent alert
      const result = alertManager.getAlertById('non-existent-id');

      // Then: Null is returned
      expect(result).toBeNull();
    });

    it('should retrieve dismissed alerts', () => {
      // Given: Dismissed alert
      const alert = alertManager.createAlert('chain-123', 'Test reason');
      alertManager.dismissAlert(alert.id);

      // When: Getting alert by ID
      const retrieved = alertManager.getAlertById(alert.id);

      // Then: Alert is retrieved with dismissed status
      expect(retrieved).toBeDefined();
      expect(retrieved?.dismissed).toBe(true);
    });
  });

  describe('getAllAlerts', () => {
    it('should return empty array when no alerts exist', () => {
      // Given: No alerts
      // When: Getting all alerts
      const alerts = alertManager.getAllAlerts();

      // Then: Empty array is returned
      expect(alerts).toEqual([]);
    });

    it('should return all alerts including dismissed', () => {
      // Given: Mix of active and dismissed alerts
      const alert1 = alertManager.createAlert('chain-1', 'reason-1');
      const alert2 = alertManager.createAlert('chain-2', 'reason-2');
      const alert3 = alertManager.createAlert('chain-3', 'reason-3');
      alertManager.dismissAlert(alert2.id);

      // When: Getting all alerts
      const allAlerts = alertManager.getAllAlerts();

      // Then: All alerts are returned
      expect(allAlerts).toHaveLength(3);
      expect(allAlerts.map(a => a.id)).toContain(alert1.id);
      expect(allAlerts.map(a => a.id)).toContain(alert2.id);
      expect(allAlerts.map(a => a.id)).toContain(alert3.id);
    });
  });

  describe('clearAllAlerts', () => {
    it('should clear all alerts', () => {
      // Given: Multiple alerts
      alertManager.createAlert('chain-1', 'reason-1');
      alertManager.createAlert('chain-2', 'reason-2');
      alertManager.createAlert('chain-3', 'reason-3');

      // When: Clearing all alerts
      alertManager.clearAllAlerts();

      // Then: No alerts remain
      const alerts = alertManager.getAllAlerts();
      expect(alerts).toHaveLength(0);
    });

    it('should log number of cleared alerts', () => {
      // Given: Multiple alerts
      alertManager.createAlert('chain-1', 'reason-1');
      alertManager.createAlert('chain-2', 'reason-2');
      alertManager.createAlert('chain-3', 'reason-3');
      vi.clearAllMocks();

      // When: Clearing all alerts
      alertManager.clearAllAlerts();

      // Then: Clearing is logged
      expect(logger.info).toHaveBeenCalledWith({
        category: 'alerts',
        action: 'alerts_cleared',
        message: 'Cleared 3 alerts',
        details: {
          count: 3,
        },
      });
    });

    it('should handle clearing when no alerts exist', () => {
      // Given: No alerts
      // When: Clearing alerts
      alertManager.clearAllAlerts();

      // Then: No error is thrown
      const alerts = alertManager.getAllAlerts();
      expect(alerts).toHaveLength(0);
    });
  });

  describe('getAlertsByChainId', () => {
    it('should return alerts for specific chain', () => {
      // Given: Multiple alerts for different chains
      const alert1 = alertManager.createAlert('chain-1', 'reason-1');
      const alert2 = alertManager.createAlert('chain-1', 'reason-2');
      const alert3 = alertManager.createAlert('chain-2', 'reason-3');

      // When: Getting alerts for chain-1
      const chainAlerts = alertManager.getAlertsByChainId('chain-1');

      // Then: Only chain-1 alerts are returned
      expect(chainAlerts).toHaveLength(2);
      expect(chainAlerts.map(a => a.id)).toContain(alert1.id);
      expect(chainAlerts.map(a => a.id)).toContain(alert2.id);
      expect(chainAlerts.map(a => a.id)).not.toContain(alert3.id);
    });

    it('should return empty array for chain with no alerts', () => {
      // Given: Alerts for other chains
      alertManager.createAlert('chain-1', 'reason-1');
      alertManager.createAlert('chain-2', 'reason-2');

      // When: Getting alerts for chain-3
      const chainAlerts = alertManager.getAlertsByChainId('chain-3');

      // Then: Empty array is returned
      expect(chainAlerts).toEqual([]);
    });

    it('should include dismissed alerts for chain', () => {
      // Given: Mix of active and dismissed alerts for same chain
      const alert1 = alertManager.createAlert('chain-1', 'reason-1');
      const alert2 = alertManager.createAlert('chain-1', 'reason-2');
      alertManager.dismissAlert(alert2.id);

      // When: Getting alerts for chain-1
      const chainAlerts = alertManager.getAlertsByChainId('chain-1');

      // Then: Both alerts are returned
      expect(chainAlerts).toHaveLength(2);
      expect(chainAlerts.map(a => a.id)).toContain(alert1.id);
      expect(chainAlerts.map(a => a.id)).toContain(alert2.id);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string chainId', () => {
      // Given: Empty string chainId
      // When: Creating alert
      const alert = alertManager.createAlert('', 'Test reason');

      // Then: Alert is created
      expect(alert).toBeDefined();
      expect(alert.chainId).toBe('');
    });

    it('should handle empty string reason', () => {
      // Given: Empty string reason
      // When: Creating alert
      const alert = alertManager.createAlert('chain-123', '');

      // Then: Alert is created
      expect(alert).toBeDefined();
      expect(alert.reason).toBe('');
    });

    it('should handle very long reason strings', () => {
      // Given: Very long reason
      const longReason = 'x'.repeat(10000);

      // When: Creating alert
      const alert = alertManager.createAlert('chain-123', longReason);

      // Then: Alert is created with full reason
      expect(alert).toBeDefined();
      expect(alert.reason).toBe(longReason);
      expect(alert.reason.length).toBe(10000);
    });

    it('should handle special characters in chainId and reason', () => {
      // Given: Special characters
      const chainId = 'chain-<>@#$%^&*()';
      const reason = 'Alert with 💥 emojis and \n newlines \t tabs';

      // When: Creating alert
      const alert = alertManager.createAlert(chainId, reason);

      // Then: Alert is created with special characters
      expect(alert.chainId).toBe(chainId);
      expect(alert.reason).toBe(reason);
    });
  });

  describe('Performance', () => {
    it('should handle large number of alerts', () => {
      // Given: Large number of alerts
      const alertCount = 1000;

      // When: Creating many alerts
      for (let i = 0; i < alertCount; i++) {
        alertManager.createAlert(`chain-${i}`, `reason-${i}`);
      }

      // Then: All alerts are stored
      const allAlerts = alertManager.getAllAlerts();
      expect(allAlerts).toHaveLength(alertCount);
    });

    it('should efficiently filter active alerts from large set', () => {
      // Given: Large number of alerts with some dismissed
      for (let i = 0; i < 500; i++) {
        const alert = alertManager.createAlert(`chain-${i}`, `reason-${i}`);
        if (i % 2 === 0) {
          alertManager.dismissAlert(alert.id);
        }
      }

      // When: Getting active alerts
      const activeAlerts = alertManager.getActiveAlerts();

      // Then: Only active alerts are returned
      expect(activeAlerts).toHaveLength(250);
      expect(activeAlerts.every(a => !a.dismissed)).toBe(true);
    });
  });

  describe('Alert Integrity', () => {
    it('should maintain alert immutability through retrieval', () => {
      // Given: Created alert
      const originalAlert = alertManager.createAlert('chain-123', 'Original reason');
      const originalId = originalAlert.id;
      const originalTimestamp = originalAlert.timestamp;

      // When: Retrieving alert
      const retrieved = alertManager.getAlertById(originalId);

      // Then: Retrieved alert matches original
      expect(retrieved?.id).toBe(originalId);
      expect(retrieved?.timestamp).toBe(originalTimestamp);
      expect(retrieved?.chainId).toBe('chain-123');
      expect(retrieved?.reason).toBe('Original reason');
    });

    it('should maintain alert state after dismissal', () => {
      // Given: Active alert
      const alert = alertManager.createAlert('chain-123', 'Test reason');
      const originalId = alert.id;
      const originalTimestamp = alert.timestamp;

      // When: Dismissing alert
      alertManager.dismissAlert(originalId);

      // Then: Other properties remain unchanged
      const retrieved = alertManager.getAlertById(originalId);
      expect(retrieved?.id).toBe(originalId);
      expect(retrieved?.chainId).toBe('chain-123');
      expect(retrieved?.reason).toBe('Test reason');
      expect(retrieved?.timestamp).toBe(originalTimestamp);
      expect(retrieved?.dismissed).toBe(true);
    });
  });
});
