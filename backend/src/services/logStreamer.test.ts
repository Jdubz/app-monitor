/**
 * Log Streamer Service Tests
 * 
 * Tests the LogStreamer service for real-time log broadcasting, 
 * event handling, Socket.IO integration, and log management
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LogStreamer } from './logStreamer.js';
import { logger } from '../utils/logger.js';

// Mock dependencies
vi.mock('../utils/logger.js');
vi.mock('./processManager.js');
vi.mock('./cloudLogging.js');
vi.mock('./logWatcher.js');

describe('LogStreamer', () => {
  let logStreamer: LogStreamer;
  let mockIO: any;
  let mockProcessManager: any;
  let mockCloudLogging: any;
  let mockLogWatcher: any;
  let mockSocket: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Socket.IO Server
    mockIO = {
      on: vi.fn(),
      emit: vi.fn(),
      to: vi.fn().mockReturnThis()
    };

    // Mock ProcessManager
    mockProcessManager = {
      on: vi.fn(),
      getAllStatuses: vi.fn().mockReturnValue({}),
      getServiceStatus: vi.fn().mockReturnValue({ status: 'running' })
    };

    // Mock CloudLogging
    mockCloudLogging = {
      getLogs: vi.fn().mockResolvedValue([]),
      getEnvironments: vi.fn().mockReturnValue({}),
      isAvailable: vi.fn().mockReturnValue(true)
    };

    // Mock LogWatcher
    mockLogWatcher = {
      getRecentLogs: vi.fn().mockReturnValue([])
    };

    // Mock LogWatcher constructor
    vi.mocked(LogWatcher).mockImplementation(() => mockLogWatcher);

    // Mock Socket
    mockSocket = {
      id: 'test-socket-123',
      on: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      disconnect: vi.fn()
    };

    // Mock logger
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});

    // Create LogStreamer instance
    logStreamer = new LogStreamer(mockIO, mockProcessManager, mockCloudLogging);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with dependencies', () => {
      // Given: Dependencies are provided
      // When: LogStreamer is created
      // Then: Dependencies are stored
      expect(logStreamer).toBeDefined();
    });

    it('should set up process manager event listener', () => {
      // Given: LogStreamer is created
      // When: Initialization completes
      // Then: Process manager event listener is set up
      expect(mockProcessManager.on).toHaveBeenCalledWith(
        'status_change',
        expect.any(Function)
      );
    });

    it('should set up Socket.IO connection handler', () => {
      // Given: LogStreamer is created
      // When: Initialization completes
      // Then: Socket.IO connection handler is set up
      expect(mockIO.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should log initialization', () => {
      // Given: LogStreamer is created
      // When: Initialization completes
      // Then: Initialization is logged
      expect(logger.info).toHaveBeenCalledWith({
        category: 'process',
        action: 'logstreamer_initialized_using_file_based_log_inges',
        message: 'LogStreamer initialized - using file-based log ingestion only'
      });
    });
  });

  describe('Socket Connection Handling', () => {
    beforeEach(() => {
      // Simulate connection event
      const connectionHandler = mockIO.on.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockSocket);
    });

    it('should handle new connection', () => {
      // Given: New socket connection
      // When: Connection is established
      // Then: Initial statuses are sent
      expect(mockSocket.emit).toHaveBeenCalledWith('initial_statuses', {});
      expect(logger.info).toHaveBeenCalledWith({
        category: 'process',
        action: 'client_connected_socket_id',
        message: 'Client connected: test-socket-123'
      });
    });

    it('should set up socket event handlers', () => {
      // Given: New socket connection
      // When: Connection is established
      // Then: Event handlers are set up
      expect(mockSocket.on).toHaveBeenCalledWith('subscribe_logs', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('unsubscribe_logs', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('get_history', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('get_service_status', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('get_all_statuses', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  describe('Log Subscription Management', () => {
    beforeEach(() => {
      const connectionHandler = mockIO.on.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockSocket);
    });

    it('should handle log subscription', () => {
      // Given: Socket connection and subscription request
      const subscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe_logs')[1];
      
      // When: Subscribing to logs
      subscribeHandler('backend');

      // Then: Socket joins log room and receives history
      expect(mockSocket.join).toHaveBeenCalledWith('logs:backend');
      expect(mockSocket.emit).toHaveBeenCalledWith('log_history', expect.any(Object));
      expect(logger.info).toHaveBeenCalledWith({
        category: 'process',
        action: 'client_socket_id_subscribed_to_logs_for_servicenam',
        message: 'Client test-socket-123 subscribed to logs for backend'
      });
    });

    it('should handle log unsubscription', () => {
      // Given: Socket connection and unsubscription request
      const unsubscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'unsubscribe_logs')[1];
      
      // When: Unsubscribing from logs
      unsubscribeHandler('backend');

      // Then: Socket leaves log room
      expect(mockSocket.leave).toHaveBeenCalledWith('logs:backend');
      expect(logger.info).toHaveBeenCalledWith({
        category: 'process',
        action: 'client_socket_id_unsubscribed_from_logs_for_servic',
        message: 'Client test-socket-123 unsubscribed from logs for backend'
      });
    });

    it('should handle history request', () => {
      // Given: Socket connection and history request
      const historyHandler = mockSocket.on.mock.calls.find(call => call[0] === 'get_history')[1];
      
      // When: Requesting history
      historyHandler({ serviceName: 'backend', lines: 50 });

      // Then: History is sent
      expect(mockSocket.emit).toHaveBeenCalledWith('log_history', expect.any(Object));
    });

    it('should handle subscription to all services', () => {
      // Given: Socket connection and subscription to 'all'
      const subscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe_logs')[1];
      
      // When: Subscribing to all logs
      subscribeHandler('all');

      // Then: Socket joins room but no history is sent
      expect(mockSocket.join).toHaveBeenCalledWith('logs:all');
      expect(mockSocket.emit).not.toHaveBeenCalledWith('log_history', expect.any(Object));
    });
  });

  describe('Service Status Management', () => {
    beforeEach(() => {
      const connectionHandler = mockIO.on.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockSocket);
    });

    it('should handle service status request', () => {
      // Given: Socket connection and status request
      const statusHandler = mockSocket.on.mock.calls.find(call => call[0] === 'get_service_status')[1];
      
      // When: Requesting service status
      statusHandler('backend');

      // Then: Status is sent
      expect(mockProcessManager.getServiceStatus).toHaveBeenCalledWith('backend');
      expect(mockSocket.emit).toHaveBeenCalledWith('service_status', { status: 'running' });
    });

    it('should handle service status error', () => {
      // Given: Socket connection and status request that will fail
      mockProcessManager.getServiceStatus.mockImplementation(() => {
        throw new Error('Service not found');
      });
      
      const statusHandler = mockSocket.on.mock.calls.find(call => call[0] === 'get_service_status')[1];
      
      // When: Requesting status for non-existent service
      statusHandler('nonexistent');

      // Then: Error is sent
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to get status for nonexistent'
      });
    });

    it('should handle all statuses request', () => {
      // Given: Socket connection and all statuses request
      const allStatusHandler = mockSocket.on.mock.calls.find(call => call[0] === 'get_all_statuses')[1];
      
      // When: Requesting all statuses
      allStatusHandler();

      // Then: All statuses are sent
      expect(mockProcessManager.getAllStatuses).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('all_statuses', {});
    });
  });

  describe('Cloud Logs Management', () => {
    beforeEach(() => {
      const connectionHandler = mockIO.on.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockSocket);
    });

    it('should handle cloud logs subscription', async () => {
      // Given: Socket connection and cloud logs subscription
      const cloudSubscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe_cloud_logs')[1];
      
      // When: Subscribing to cloud logs
      await cloudSubscribeHandler({ environment: 'staging', service: 'backend', severity: 'ERROR' });

      // Then: Socket joins room and receives logs
      expect(mockSocket.join).toHaveBeenCalledWith('cloud-logs:staging:backend');
      expect(mockCloudLogging.getLogs).toHaveBeenCalledWith({
        environment: 'staging',
        service: 'backend',
        severity: 'ERROR',
        limit: 100
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('cloud_log_history', expect.any(Object));
    });

    it('should handle cloud logs subscription error', async () => {
      // Given: Socket connection and cloud logs subscription that will fail
      mockCloudLogging.getLogs.mockRejectedValue(new Error('Cloud logging unavailable'));
      
      const cloudSubscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe_cloud_logs')[1];
      
      // When: Subscribing to cloud logs
      await cloudSubscribeHandler({ environment: 'staging', service: 'backend' });

      // Then: Error is sent
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to subscribe to cloud logs: Cloud logging unavailable'
      });
    });

    it('should handle cloud logs unsubscription', () => {
      // Given: Socket connection and cloud logs unsubscription
      const cloudUnsubscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'unsubscribe_cloud_logs')[1];
      
      // When: Unsubscribing from cloud logs
      cloudUnsubscribeHandler({ environment: 'staging', service: 'backend' });

      // Then: Socket leaves room
      expect(mockSocket.leave).toHaveBeenCalledWith('cloud-logs:staging:backend');
    });

    it('should handle cloud logs refresh', async () => {
      // Given: Socket connection and cloud logs refresh
      const refreshHandler = mockSocket.on.mock.calls.find(call => call[0] === 'refresh_cloud_logs')[1];
      
      // When: Refreshing cloud logs
      await refreshHandler({ environment: 'staging', service: 'backend', limit: 50 });

      // Then: New logs are fetched and sent
      expect(mockCloudLogging.getLogs).toHaveBeenCalledWith({
        environment: 'staging',
        service: 'backend',
        limit: 50
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('cloud_log_history', expect.any(Object));
    });

    it('should handle environments request', () => {
      // Given: Socket connection and environments request
      const environmentsHandler = mockSocket.on.mock.calls.find(call => call[0] === 'get_environments')[1];
      
      // When: Requesting environments
      environmentsHandler();

      // Then: Environments are sent
      expect(mockCloudLogging.getEnvironments).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('environments', {});
    });

    it('should handle cloud logging status check', () => {
      // Given: Socket connection and status check
      const statusHandler = mockSocket.on.mock.calls.find(call => call[0] === 'check_cloud_logging_status')[1];
      
      // When: Checking cloud logging status
      statusHandler();

      // Then: Status is sent
      expect(mockCloudLogging.isAvailable).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('cloud_logging_status', {
        available: true,
        message: 'Cloud Logging is available'
      });
    });
  });

  describe('File Logs Management', () => {
    beforeEach(() => {
      const connectionHandler = mockIO.on.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockSocket);
    });

    it('should handle file logs subscription', () => {
      // Given: Socket connection and file logs subscription
      const fileSubscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe_file_logs')[1];
      
      // When: Subscribing to file logs
      fileSubscribeHandler({ service: 'backend' });

      // Then: Socket joins room and receives history
      expect(mockSocket.join).toHaveBeenCalledWith('logs:backend');
      expect(mockSocket.emit).toHaveBeenCalledWith('file_log_history', expect.any(Object));
    });

    it('should handle file logs unsubscription', () => {
      // Given: Socket connection and file logs unsubscription
      const fileUnsubscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'unsubscribe_file_logs')[1];
      
      // When: Unsubscribing from file logs
      fileUnsubscribeHandler({ service: 'backend' });

      // Then: Socket leaves room
      expect(mockSocket.leave).toHaveBeenCalledWith('logs:backend');
    });

    it('should handle file log history request', () => {
      // Given: Socket connection and file log history request
      const historyHandler = mockSocket.on.mock.calls.find(call => call[0] === 'get_file_log_history')[1];
      
      // When: Requesting file log history
      historyHandler({ service: 'backend', lines: 50 });

      // Then: History is sent
      expect(mockSocket.emit).toHaveBeenCalledWith('file_log_history', expect.any(Object));
    });
  });

  describe('Connection Lifecycle', () => {
    it('should handle socket disconnection', () => {
      // Given: Socket connection
      const connectionHandler = mockIO.on.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockSocket);
      
      const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];
      
      // When: Socket disconnects
      disconnectHandler();

      // Then: Disconnection is logged
      expect(logger.info).toHaveBeenCalledWith({
        category: 'process',
        action: 'client_disconnected_socket_id',
        message: 'Client disconnected: test-socket-123'
      });
    });
  });

  describe('Log Conversion', () => {
    it('should handle log conversion through subscription flow', () => {
      // Given: Socket connection and log subscription
      const connectionHandler = mockIO.on.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockSocket);
      
      const subscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe_logs')[1];
      
      // When: Subscribing to logs (which triggers conversion)
      subscribeHandler('backend');

      // Then: Conversion happens through the flow
      expect(mockSocket.emit).toHaveBeenCalledWith('log_history', expect.any(Object));
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      const connectionHandler = mockIO.on.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockSocket);
    });

    it('should handle cloud logs errors gracefully', async () => {
      // Given: Cloud logs subscription that will fail
      mockCloudLogging.getLogs.mockRejectedValue(new Error('Network error'));
      
      const cloudSubscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe_cloud_logs')[1];
      
      // When: Subscribing to cloud logs
      await cloudSubscribeHandler({ environment: 'staging', service: 'backend' });

      // Then: Error is handled gracefully
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to subscribe to cloud logs: Network error'
      });
    });

    it('should handle refresh errors gracefully', async () => {
      // Given: Cloud logs refresh that will fail
      mockCloudLogging.getLogs.mockRejectedValue(new Error('Rate limit exceeded'));
      
      const refreshHandler = mockSocket.on.mock.calls.find(call => call[0] === 'refresh_cloud_logs')[1];
      
      // When: Refreshing cloud logs
      await refreshHandler({ environment: 'staging', service: 'backend' });

      // Then: Error is handled gracefully
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to refresh cloud logs: Rate limit exceeded'
      });
    });
  });

  describe('Integration', () => {
    it('should handle multiple concurrent connections', () => {
      // Given: Multiple socket connections
      const socket1 = { ...mockSocket, id: 'socket-1' };
      const socket2 = { ...mockSocket, id: 'socket-2' };
      
      const connectionHandler = mockIO.on.mock.calls.find(call => call[0] === 'connection')[1];
      
      // When: Multiple connections are established
      connectionHandler(socket1);
      connectionHandler(socket2);

      // Then: Both connections are handled
      expect(socket1.emit).toHaveBeenCalledWith('initial_statuses', {});
      expect(socket2.emit).toHaveBeenCalledWith('initial_statuses', {});
    });

    it('should handle mixed subscription types', () => {
      // Given: Socket connection
      const connectionHandler = mockIO.on.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockSocket);
      
      const subscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe_logs')[1];
      const fileSubscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe_file_logs')[1];
      
      // When: Subscribing to both log types
      subscribeHandler('backend');
      fileSubscribeHandler({ service: 'frontend' });

      // Then: Both subscriptions are handled
      expect(mockSocket.join).toHaveBeenCalledWith('logs:backend');
      expect(mockSocket.join).toHaveBeenCalledWith('logs:frontend');
    });
  });
});