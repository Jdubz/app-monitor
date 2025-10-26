import { Server as SocketIOServer, Socket } from 'socket.io';
import { ProcessManager } from './processManager.js';
import { CloudLogging, CloudLogsQuery } from './cloudLogging.js';
import { LogWatcher } from './logWatcher.js';
import { logger } from '../utils/logger.js';

// Local types for dev-monitor
type LocalService = 'backend' | 'frontend' | 'worker' | 'dev-monitor';
type DevMonitorLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface DevMonitorLogLine {
  id: string;
  service: LocalService;
  timestamp: number;
  level: DevMonitorLogLevel;
  message: string;
  raw: string;
}

interface LogHistory {
  serviceName: string;
  logs: DevMonitorLogLine[];
}

export class LogStreamer {
  private io: SocketIOServer;
  private processManager: ProcessManager;
  private cloudLogging: CloudLogging;
  private logWatcher: LogWatcher;
  private logIdCounter = 0;

  constructor(io: SocketIOServer, processManager: ProcessManager, cloudLogging: CloudLogging) {
    this.io = io;
    this.processManager = processManager;
    this.cloudLogging = cloudLogging;
    this.logWatcher = new LogWatcher(io);
    
    // Inject LogWatcher into ProcessManager for API access
    (processManager as any).logWatcher = this.logWatcher;

    // ONLY listen to status changes from process manager (not log events)
    this.processManager.on('status_change', (data: { serviceName: string; status: string; error?: string }) => {
      this.broadcastStatusChange(data);
    });

    // Handle Socket.IO connections
    this.io.on('connection', (socket: Socket) => {
      logger.info({
      category: 'process',
      action: 'client_connected_socket_id',
      message: `Client connected: ${socket.id}`
    });
      this.handleConnection(socket);
    });

    logger.info({
      category: 'process',
      action: 'logstreamer_initialized_using_file_based_log_inges',
      message: 'LogStreamer initialized - using file-based log ingestion only'
    });
  }

  /**
   * Handle new Socket.IO connection
   */
  private handleConnection(socket: Socket): void {
    // Send initial service statuses
    const statuses = this.processManager.getAllStatuses();
    socket.emit('initial_statuses', statuses);

    // Subscribe to logs for a service
    socket.on('subscribe_logs', (serviceName: string) => {
      logger.info({
      category: 'process',
      action: 'client_socket_id_subscribed_to_logs_for_servicenam',
      message: `Client ${socket.id} subscribed to logs for ${serviceName}`
    });
      socket.join(`logs:${serviceName}`);

      // Send recent log history from file reads (only for specific services, not 'all')
      if (serviceName !== 'all') {
        const logs = this.logWatcher.getRecentLogs(serviceName, 100);
        const logLines = logs.map((entry, index) => this.convertStructuredLogToDevMonitorLog(entry, index));
        const history: LogHistory = { serviceName, logs: logLines };
        socket.emit('log_history', history);
      }
    });

    // Unsubscribe from logs
    socket.on('unsubscribe_logs', (serviceName: string) => {
      logger.info({
      category: 'process',
      action: 'client_socket_id_unsubscribed_from_logs_for_servic',
      message: `Client ${socket.id} unsubscribed from logs for ${serviceName}`
    });
      socket.leave(`logs:${serviceName}`);
    });

    // Get history for a service
    socket.on('get_history', (data: { serviceName: string; lines?: number }) => {
      const { serviceName, lines = 100 } = data;
      const logs = this.logWatcher.getRecentLogs(serviceName, lines);
      const logLines = logs.map((entry, index) => this.convertStructuredLogToDevMonitorLog(entry, index));
      const history: LogHistory = { serviceName, logs: logLines };
      socket.emit('log_history', history);
    });

    // Get service status
    socket.on('get_service_status', (serviceName: string) => {
      try {
        const status = this.processManager.getServiceStatus(serviceName);
        socket.emit('service_status', status);
      } catch (error) {
        socket.emit('error', { message: `Failed to get status for ${serviceName}` });
      }
    });

    // Get all service statuses
    socket.on('get_all_statuses', () => {
      const statuses = this.processManager.getAllStatuses();
      socket.emit('all_statuses', statuses);
    });

    // Cloud logs events
    socket.on('subscribe_cloud_logs', async (data: { environment: string; service: string; severity?: string }) => {
      try {
        logger.info({
      category: 'process',
      action: 'client_socket_id_subscribed_to_cloud_logs_for_data',
      message: `Client ${socket.id} subscribed to cloud logs for ${data.environment}/${data.service}`
    });
        socket.join(`cloud-logs:${data.environment}:${data.service}`);

        // Fetch initial cloud logs
        const query: CloudLogsQuery = {
          environment: data.environment,
          service: data.service,
          severity: data.severity,
          limit: 100,
        };

        const logs = await this.cloudLogging.getLogs(query);
        socket.emit('cloud_log_history', {
          environment: data.environment,
          service: data.service,
          logs,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        socket.emit('error', { message: `Failed to subscribe to cloud logs: ${errorMessage}` });
      }
    });

    socket.on('unsubscribe_cloud_logs', (data: { environment: string; service: string }) => {
      logger.info({
      category: 'process',
      action: 'client_socket_id_unsubscribed_from_cloud_logs_for_',
      message: `Client ${socket.id} unsubscribed from cloud logs for ${data.environment}/${data.service}`
    });
      socket.leave(`cloud-logs:${data.environment}:${data.service}`);
    });

    socket.on('refresh_cloud_logs', async (data: { environment: string; service: string; severity?: string; limit?: number }) => {
      try {
        logger.info({
      category: 'process',
      action: 'client_socket_id_requesting_cloud_logs_refresh_for',
      message: `Client ${socket.id} requesting cloud logs refresh for ${data.environment}/${data.service}`
    });

        const query: CloudLogsQuery = {
          environment: data.environment,
          service: data.service,
          severity: data.severity,
          limit: data.limit || 100,
        };

        const logs = await this.cloudLogging.getLogs(query);
        socket.emit('cloud_log_history', {
          environment: data.environment,
          service: data.service,
          logs,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        socket.emit('error', { message: `Failed to refresh cloud logs: ${errorMessage}` });
      }
    });

    socket.on('get_environments', () => {
      const environments = this.cloudLogging.getEnvironments();
      socket.emit('environments', environments);
    });

    socket.on('check_cloud_logging_status', () => {
      const available = this.cloudLogging.isAvailable();
      socket.emit('cloud_logging_status', {
        available,
        message: available
          ? 'Cloud Logging is available'
          : 'Cloud Logging is not available. Check credentials configuration.',
      });
    });

    // File-based log events
    socket.on('subscribe_file_logs', (data: { service: string }) => {
      logger.info({
      category: 'process',
      action: 'client_socket_id_subscribed_to_file_logs_for_data_',
      message: `Client ${socket.id} subscribed to file logs for ${data.service}`
    });
      socket.join(`logs:${data.service}`);

      // Send recent log history from file
      const logs = this.logWatcher.getRecentLogs(data.service, 100);
      socket.emit('file_log_history', {
        service: data.service,
        logs,
      });
    });

    socket.on('unsubscribe_file_logs', (data: { service: string }) => {
      logger.info({
      category: 'process',
      action: 'client_socket_id_unsubscribed_from_file_logs_for_d',
      message: `Client ${socket.id} unsubscribed from file logs for ${data.service}`
    });
      socket.leave(`logs:${data.service}`);
    });

    socket.on('get_file_log_history', (data: { service: string; lines?: number }) => {
      const { service, lines = 100 } = data;
      const logs = this.logWatcher.getRecentLogs(service, lines);
      socket.emit('file_log_history', {
        service,
        logs,
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info({
      category: 'process',
      action: 'client_disconnected_socket_id',
      message: `Client disconnected: ${socket.id}`
    });
    });
  }

  /**
   * Convert structured log entry to DevMonitorLogLine format
   */
  private convertStructuredLogToDevMonitorLog(entry: any, _index: number): DevMonitorLogLine {
    return {
      id: `${entry.service}-${this.logIdCounter++}`,
      service: entry.service as LocalService,
      timestamp: new Date(entry.timestamp).getTime(),
      level: this.mapSeverityToLevel(entry.severity),
      message: entry.message || entry.details?.message || 'No message',
      raw: JSON.stringify(entry),
    };
  }

  /**
   * Map structured log severity to DevMonitorLogLevel
   */
  private mapSeverityToLevel(severity: string): DevMonitorLogLevel {
    switch (severity?.toUpperCase()) {
      case 'ERROR': return 'ERROR';
      case 'WARNING': return 'WARN';
      case 'DEBUG': return 'DEBUG';
      case 'INFO':
      default: return 'INFO';
    }
  }

  /**
   * Broadcast a status change to all clients
   */
  private broadcastStatusChange(data: { serviceName: string; status: string; error?: string }): void {
    this.io.emit('status_change', data);
  }

  /**
   * Create a structured log line object
   */
  private createLogLine(serviceName: LocalService, message: string, _index?: number): DevMonitorLogLine {
    // Try to detect log level from message
    const level = this.detectLogLevel(message);

    // Always use logIdCounter for unique IDs across sessions
    // Using file line index would cause duplicate keys when files rotate
    return {
      id: `${serviceName}-${this.logIdCounter++}`,
      service: serviceName,
      timestamp: Date.now(),
      level,
      message: this.stripAnsiCodes(message),
      raw: message,
    };
  }

  /**
   * Detect log level from message content
   */
  private detectLogLevel(message: string): DevMonitorLogLevel {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('error') || lowerMessage.includes('fail') || lowerMessage.includes('exception')) {
      return 'ERROR';
    }

    if (lowerMessage.includes('warn') || lowerMessage.includes('warning')) {
      return 'WARN';
    }

    if (lowerMessage.includes('debug') || lowerMessage.includes('trace')) {
      return 'DEBUG';
    }

    return 'INFO';
  }

  /**
   * Strip ANSI color codes from text
   */
  private stripAnsiCodes(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Get the logWatcher instance (for API endpoints)
   */
  public getLogWatcher(): LogWatcher {
    return this.logWatcher;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.logWatcher.destroy();
    logger.info({
      category: 'process',
      action: 'logstreamer_destroyed',
      message: 'LogStreamer destroyed'
    });
  }
}
