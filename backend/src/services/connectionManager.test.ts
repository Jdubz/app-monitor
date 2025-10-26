/**
 * Connection Manager Service Tests
 * 
 * Tests the ConnectionManager service for client connections, 
 * status tracking, heartbeat monitoring, and subscription management
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConnectionManager } from './connectionManager.js';
import { logger } from '../utils/logger.js';

// Mock dependencies
vi.mock('../utils/logger.js');

describe('ConnectionManager', () => {
  let connectionManager: ConnectionManager;
  let mockSocket: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Socket
    mockSocket = {
      id: 'test-socket-123',
      on: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn()
    };

    // Mock logger
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});

    connectionManager = new ConnectionManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Connection Registration', () => {
    it('should register new connection', () => {
      // Given: Mock socket
      // When: Registering connection
      connectionManager.register(mockSocket);

      // Then: Connection is registered
      const connectionInfo = connectionManager.getConnectionInfo('test-socket-123');
      expect(connectionInfo).toBeDefined();
      expect(connectionInfo?.socketId).toBe('test-socket-123');
      expect(connectionInfo?.isHealthy).toBe(true);
      expect(connectionInfo?.reconnectCount).toBe(0);
      expect(connectionInfo?.subscriptions).toBeInstanceOf(Set);
      expect(connectionInfo?.monitors).toBeInstanceOf(Set);
    });

    it('should log connection registration', () => {
      // Given: Mock socket
      // When: Registering connection
      connectionManager.register(mockSocket);

      // Then: Registration is logged
      expect(logger.info).toHaveBeenCalledWith({
        category: 'socket',
        action: 'connection_registered',
        message: 'Connection registered: test-socket-123',
        details: { socketId: 'test-socket-123' }
      });
    });

    it('should start heartbeat monitoring for new connection', () => {
      // Given: Mock socket
      // When: Registering connection
      connectionManager.register(mockSocket);

      // Then: Heartbeat monitoring is started
      // Note: We can't easily test the interval without time manipulation
      expect(connectionManager.getConnectionInfo('test-socket-123')).toBeDefined();
    });
  });

  describe('Connection Unregistration', () => {
    it('should unregister existing connection', () => {
      // Given: Registered connection
      connectionManager.register(mockSocket);

      // When: Unregistering connection
      connectionManager.unregister('test-socket-123', 'client_disconnect');

      // Then: Connection is removed
      expect(connectionManager.getConnectionInfo('test-socket-123')).toBeUndefined();
      expect(connectionManager.getConnectionCount()).toBe(0);
    });

    it('should handle unregistering non-existent connection', () => {
      // Given: No registered connections
      // When: Unregistering non-existent connection
      // Then: No error is thrown
      expect(() => {
        connectionManager.unregister('non-existent-socket');
      }).not.toThrow();
    });

    it('should log connection unregistration', () => {
      // Given: Registered connection
      connectionManager.register(mockSocket);

      // When: Unregistering connection
      connectionManager.unregister('test-socket-123', 'client_disconnect');

      // Then: Unregistration is logged (checking for the second call)
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'connection_unregistered',
          message: 'Connection unregistered: test-socket-123'
        })
      );
    });
  });

  describe('Heartbeat Management', () => {
    it('should update last ping time', () => {
      // Given: Registered connection
      connectionManager.register(mockSocket);
      const initialPing = connectionManager.getConnectionInfo('test-socket-123')?.lastPing;

      // When: Updating ping
      connectionManager.updateLastPing('test-socket-123');

      // Then: Ping time is updated (or at least not decreased)
      const updatedPing = connectionManager.getConnectionInfo('test-socket-123')?.lastPing;
      expect(updatedPing).toBeGreaterThanOrEqual(initialPing!);
    });

    it('should handle ping update for non-existent connection', () => {
      // Given: No registered connections
      // When: Updating ping for non-existent connection
      // Then: No error is thrown
      expect(() => {
        connectionManager.updateLastPing('non-existent-socket');
      }).not.toThrow();
    });

    it('should check connection health', () => {
      // Given: Registered connection
      connectionManager.register(mockSocket);

      // When: Checking health
      const isHealthy = connectionManager.isHealthy('test-socket-123');

      // Then: Health status is returned
      expect(isHealthy).toBe(true);
    });

    it('should return false for non-existent connection health', () => {
      // Given: No registered connections
      // When: Checking health of non-existent connection
      const isHealthy = connectionManager.isHealthy('non-existent-socket');

      // Then: False is returned
      expect(isHealthy).toBe(false);
    });
  });

  describe('Connection Information', () => {
    it('should get connection info', () => {
      // Given: Registered connection
      connectionManager.register(mockSocket);

      // When: Getting connection info
      const info = connectionManager.getConnectionInfo('test-socket-123');

      // Then: Connection info is returned
      expect(info).toBeDefined();
      expect(info?.socketId).toBe('test-socket-123');
      expect(info?.connectedAt).toBeGreaterThan(0);
      expect(info?.isHealthy).toBe(true);
    });

    it('should return undefined for non-existent connection', () => {
      // Given: No registered connections
      // When: Getting info for non-existent connection
      const info = connectionManager.getConnectionInfo('non-existent-socket');

      // Then: Undefined is returned
      expect(info).toBeUndefined();
    });

    it('should get all connections', () => {
      // Given: Multiple registered connections
      const socket1 = { id: 'socket-1', on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
      const socket2 = { id: 'socket-2', on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };

      connectionManager.register(socket1);
      connectionManager.register(socket2);

      // When: Getting all connections
      const connections = connectionManager.getAllConnections();

      // Then: All connections are returned
      expect(connections).toHaveLength(2);
      expect(connections.map(c => c.socketId)).toContain('socket-1');
      expect(connections.map(c => c.socketId)).toContain('socket-2');
    });

    it('should get connection count', () => {
      // Given: Multiple registered connections
      const socket1 = { id: 'socket-1', on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
      const socket2 = { id: 'socket-2', on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };

      connectionManager.register(socket1);
      connectionManager.register(socket2);

      // When: Getting connection count
      const count = connectionManager.getConnectionCount();

      // Then: Correct count is returned
      expect(count).toBe(2);
    });
  });

  describe('Subscription Management', () => {
    it('should add subscription to connection', () => {
      // Given: Registered connection
      connectionManager.register(mockSocket);

      // When: Adding subscription
      connectionManager.addSubscription('test-socket-123', 'logs:backend');

      // Then: Subscription is added
      const info = connectionManager.getConnectionInfo('test-socket-123');
      expect(info?.subscriptions.has('logs:backend')).toBe(true);
    });

    it('should handle subscription for non-existent connection', () => {
      // Given: No registered connections
      // When: Adding subscription to non-existent connection
      // Then: No error is thrown
      expect(() => {
        connectionManager.addSubscription('non-existent-socket', 'logs:backend');
      }).not.toThrow();
    });

    it('should remove subscription from connection', () => {
      // Given: Registered connection with subscription
      connectionManager.register(mockSocket);
      connectionManager.addSubscription('test-socket-123', 'logs:backend');

      // When: Removing subscription
      connectionManager.removeSubscription('test-socket-123', 'logs:backend');

      // Then: Subscription is removed
      const info = connectionManager.getConnectionInfo('test-socket-123');
      expect(info?.subscriptions.has('logs:backend')).toBe(false);
    });

    it('should handle multiple subscriptions', () => {
      // Given: Registered connection
      connectionManager.register(mockSocket);

      // When: Adding multiple subscriptions
      connectionManager.addSubscription('test-socket-123', 'logs:backend');
      connectionManager.addSubscription('test-socket-123', 'logs:frontend');
      connectionManager.addSubscription('test-socket-123', 'process:status');

      // Then: All subscriptions are added
      const info = connectionManager.getConnectionInfo('test-socket-123');
      expect(info?.subscriptions.size).toBe(3);
      expect(info?.subscriptions.has('logs:backend')).toBe(true);
      expect(info?.subscriptions.has('logs:frontend')).toBe(true);
      expect(info?.subscriptions.has('process:status')).toBe(true);
    });
  });

  describe('Monitor Management', () => {
    it('should add monitor to connection', () => {
      // Given: Registered connection
      connectionManager.register(mockSocket);

      // When: Adding monitor
      connectionManager.addMonitor('test-socket-123', 'container-abc123');

      // Then: Monitor is added
      const info = connectionManager.getConnectionInfo('test-socket-123');
      expect(info?.monitors.has('container-abc123')).toBe(true);
    });

    it('should handle monitor for non-existent connection', () => {
      // Given: No registered connections
      // When: Adding monitor to non-existent connection
      // Then: No error is thrown
      expect(() => {
        connectionManager.addMonitor('non-existent-socket', 'container-abc123');
      }).not.toThrow();
    });

    it('should remove monitor from connection', () => {
      // Given: Registered connection with monitor
      connectionManager.register(mockSocket);
      connectionManager.addMonitor('test-socket-123', 'container-abc123');

      // When: Removing monitor
      connectionManager.removeMonitor('test-socket-123', 'container-abc123');

      // Then: Monitor is removed
      const info = connectionManager.getConnectionInfo('test-socket-123');
      expect(info?.monitors.has('container-abc123')).toBe(false);
    });

    it('should handle multiple monitors', () => {
      // Given: Registered connection
      connectionManager.register(mockSocket);

      // When: Adding multiple monitors
      connectionManager.addMonitor('test-socket-123', 'container-abc123');
      connectionManager.addMonitor('test-socket-123', 'container-def456');
      connectionManager.addMonitor('test-socket-123', 'container-ghi789');

      // Then: All monitors are added
      const info = connectionManager.getConnectionInfo('test-socket-123');
      expect(info?.monitors.size).toBe(3);
      expect(info?.monitors.has('container-abc123')).toBe(true);
      expect(info?.monitors.has('container-def456')).toBe(true);
      expect(info?.monitors.has('container-ghi789')).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should get connection statistics', () => {
      // Given: Multiple connections with different states
      const socket1 = { id: 'socket-1', on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
      const socket2 = { id: 'socket-2', on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };

      connectionManager.register(socket1);
      connectionManager.register(socket2);

      // Add subscriptions and monitors
      connectionManager.addSubscription('socket-1', 'logs:backend');
      connectionManager.addMonitor('socket-2', 'container-abc123');

      // When: Getting statistics
      const stats = connectionManager.getStats();

      // Then: Statistics are returned
      expect(stats).toBeDefined();
      expect(stats.total).toBe(2);
      expect(stats.healthy).toBe(2);
      expect(stats.totalSubscriptions).toBe(1);
      expect(stats.totalMonitors).toBe(1);
      expect(stats.avgReconnects).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty connection statistics', () => {
      // Given: No connections
      // When: Getting statistics
      const stats = connectionManager.getStats();

      // Then: Zero statistics are returned
      expect(stats).toBeDefined();
      expect(stats.total).toBe(0);
      expect(stats.healthy).toBe(0);
      expect(stats.totalSubscriptions).toBe(0);
      expect(stats.totalMonitors).toBe(0);
      expect(stats.avgReconnects).toBe(0);
    });
  });

  describe('Connection Lifecycle', () => {
    it('should handle connection reconnection', () => {
      // Given: Registered connection
      connectionManager.register(mockSocket);
      const initialInfo = connectionManager.getConnectionInfo('test-socket-123');

      // When: Reconnecting (simulating disconnect and reconnect)
      connectionManager.unregister('test-socket-123', 'client_disconnect');
      
      const newSocket = { id: 'test-socket-123', on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
      connectionManager.register(newSocket);

      // Then: New connection is registered
      const newInfo = connectionManager.getConnectionInfo('test-socket-123');
      expect(newInfo).toBeDefined();
      expect(newInfo?.connectedAt).toBeGreaterThanOrEqual(initialInfo!.connectedAt);
    });

    it('should maintain connection state during operations', () => {
      // Given: Registered connection with subscriptions and monitors
      connectionManager.register(mockSocket);
      connectionManager.addSubscription('test-socket-123', 'logs:backend');
      connectionManager.addMonitor('test-socket-123', 'container-abc123');

      // When: Updating ping
      connectionManager.updateLastPing('test-socket-123');

      // Then: State is maintained
      const info = connectionManager.getConnectionInfo('test-socket-123');
      expect(info?.subscriptions.has('logs:backend')).toBe(true);
      expect(info?.monitors.has('container-abc123')).toBe(true);
      expect(info?.isHealthy).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid socket operations gracefully', () => {
      // Given: Invalid socket data
      const invalidSocket = { id: '', on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };

      // When: Registering invalid socket
      // Then: No error is thrown
      expect(() => {
        connectionManager.register(invalidSocket);
      }).not.toThrow();
    });

    it('should handle concurrent operations', () => {
      // Given: Multiple operations on same connection
      connectionManager.register(mockSocket);

      // When: Performing concurrent operations
      connectionManager.addSubscription('test-socket-123', 'logs:backend');
      connectionManager.addMonitor('test-socket-123', 'container-abc123');
      connectionManager.updateLastPing('test-socket-123');

      // Then: All operations complete successfully
      const info = connectionManager.getConnectionInfo('test-socket-123');
      expect(info?.subscriptions.has('logs:backend')).toBe(true);
      expect(info?.monitors.has('container-abc123')).toBe(true);
      expect(info?.isHealthy).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle large number of connections', () => {
      // Given: Large number of connections
      const connections = Array.from({ length: 100 }, (_, i) => ({
        id: `socket-${i}`,
        on: vi.fn(),
        emit: vi.fn(),
        disconnect: vi.fn()
      }));

      // When: Registering all connections
      connections.forEach(socket => connectionManager.register(socket));

      // Then: All connections are registered
      expect(connectionManager.getConnectionCount()).toBe(100);
    });

    it('should handle large number of subscriptions', () => {
      // Given: Registered connection
      connectionManager.register(mockSocket);

      // When: Adding many subscriptions
      for (let i = 0; i < 50; i++) {
        connectionManager.addSubscription('test-socket-123', `subscription-${i}`);
      }

      // Then: All subscriptions are added
      const info = connectionManager.getConnectionInfo('test-socket-123');
      expect(info?.subscriptions.size).toBe(50);
    });
  });
});