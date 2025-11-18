/**
 * Enhanced Socket.IO Service with Reconnection and Health Monitoring
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection health monitoring (ping/pong)
 * - Latency tracking
 * - Connection state management
 * - Event listeners cleanup
 */

import { io, Socket } from 'socket.io-client';
import { createLogger } from '@/utils/logger';

const log = createLogger('socketService');

export interface SocketConfig {
  url: string;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  reconnectionAttempts?: number;
  timeout?: number;
  autoConnect?: boolean;
  transports?: string[];
  auth?: {
    apiKey?: string;
  };
}

export interface ConnectionState {
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  lastConnectedAt?: number;
  lastDisconnectedAt?: number;
  latency?: number;
  error?: string;
}

export interface HealthMetrics {
  latency: number;
  lastPingAt: number;
  lastPongAt: number;
  isHealthy: boolean;
}

type ResolvedSocketConfig = Required<Omit<SocketConfig, 'auth'>> & Pick<SocketConfig, 'auth'>;

export class SocketService {
  private socket: Socket | null = null;
  private config: ResolvedSocketConfig;
  private connectionState: ConnectionState;
  private healthMetrics: HealthMetrics;
  private pingInterval?: NodeJS.Timeout;
  private eventListeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  constructor(config: SocketConfig) {
    this.config = {
      url: config.url,
      reconnection: config.reconnection ?? true,
      reconnectionDelay: config.reconnectionDelay ?? 1000,
      reconnectionDelayMax: config.reconnectionDelayMax ?? 5000,
      reconnectionAttempts: config.reconnectionAttempts ?? Infinity,
      timeout: config.timeout ?? 20000,
      autoConnect: config.autoConnect ?? true,
      transports: config.transports ?? ['websocket', 'polling'],
      auth: config.auth,
    };

    this.connectionState = {
      isConnected: false,
      isReconnecting: false,
      reconnectAttempts: 0,
    };

    this.healthMetrics = {
      latency: 0,
      lastPingAt: 0,
      lastPongAt: 0,
      isHealthy: false,
    };

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  /**
   * Connect to server
   */
  public connect(): void {
    if (this.socket?.connected) {
      log.debug('Already connected');
      return;
    }

    log.info('Connecting', this.config.url);

    this.socket = io(this.config.url, {
      reconnection: this.config.reconnection,
      reconnectionDelay: this.config.reconnectionDelay,
      reconnectionDelayMax: this.config.reconnectionDelayMax,
      reconnectionAttempts: this.config.reconnectionAttempts,
      timeout: this.config.timeout,
      transports: this.config.transports,
      auth: this.config.auth,
    });

    this.setupEventHandlers();
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      log.info('Connected');
      this.connectionState = {
        isConnected: true,
        isReconnecting: false,
        reconnectAttempts: 0,
        lastConnectedAt: Date.now(),
        error: undefined,
      };
      this.startHealthMonitoring();
      this.emit('connection:state', this.connectionState);
    });

    this.socket.on('disconnect', (reason) => {
      log.warn('Disconnected', reason);
      this.connectionState = {
        ...this.connectionState,
        isConnected: false,
        lastDisconnectedAt: Date.now(),
      };
      this.stopHealthMonitoring();
      this.emit('connection:state', this.connectionState);
    });

    this.socket.on('connect_error', (error) => {
      log.error('Connection error', error.message);
      this.connectionState = {
        ...this.connectionState,
        isConnected: false,
        error: error.message,
      };
      this.emit('connection:error', error);
      this.emit('connection:state', this.connectionState);
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      log.info('Reconnection attempt', attemptNumber);
      this.connectionState = {
        ...this.connectionState,
        isReconnecting: true,
        reconnectAttempts: attemptNumber,
      };
      this.emit('connection:state', this.connectionState);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      log.info('Reconnected', attemptNumber, 'attempts');
      this.connectionState = {
        ...this.connectionState,
        isConnected: true,
        isReconnecting: false,
        reconnectAttempts: 0,
        lastConnectedAt: Date.now(),
      };
      this.emit('connection:reconnected', attemptNumber);
      this.emit('connection:state', this.connectionState);
    });

    this.socket.on('reconnect_error', (error) => {
      log.error('Reconnection error', error.message);
      this.emit('connection:error', error);
    });

    this.socket.on('reconnect_failed', () => {
      log.error('Reconnection failed');
      this.connectionState = {
        ...this.connectionState,
        isConnected: false,
        isReconnecting: false,
        error: 'Reconnection failed after maximum attempts',
      };
      this.emit('connection:failed');
      this.emit('connection:state', this.connectionState);
    });

    // Health monitoring
    this.socket.on('pong', () => {
      const latency = Date.now() - this.healthMetrics.lastPingAt;
      this.healthMetrics = {
        ...this.healthMetrics,
        latency,
        lastPongAt: Date.now(),
        isHealthy: latency < 1000, // Healthy if latency < 1s
      };
      this.emit('health:update', this.healthMetrics);
    });

    // Server migration notification (for zero-downtime deployments)
    this.socket.on('system_event', (data: unknown) => {
      if (
        typeof data === 'object' &&
        data !== null &&
        'type' in data &&
        (data as { type: unknown }).type === 'server_migration'
      ) {
        const event = data as { message?: string; reconnectDelay?: number };
        log.info('Server migration detected', event.message);
        log.info(`Will automatically reconnect in ${event.reconnectDelay}ms`);

        // Emit migration event for UI notification
        this.emit('server:migration', data);

        // Socket.IO will automatically reconnect after disconnect
        // No manual action needed - reconnection is handled automatically
      }
    });
  }

  /**
   * Start health monitoring (ping/pong)
   */
  private startHealthMonitoring(): void {
    this.stopHealthMonitoring();

    this.pingInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.healthMetrics.lastPingAt = Date.now();
        this.socket.emit('ping');
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
    this.healthMetrics = {
      latency: 0,
      lastPingAt: 0,
      lastPongAt: 0,
      isHealthy: false,
    };
  }

  /**
   * Disconnect from server
   */
  public disconnect(): void {
    log.debug('Disconnecting');
    this.stopHealthMonitoring();
    this.socket?.disconnect();
    this.connectionState = {
      ...this.connectionState,
      isConnected: false,
      lastDisconnectedAt: Date.now(),
    };
  }

  /**
   * Get Socket.IO instance (for direct access)
   */
  public getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Get connection state
   */
  public getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Get health metrics
   */
  public getHealthMetrics(): HealthMetrics {
    return { ...this.healthMetrics };
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.connectionState.isConnected;
  }

  /**
   * Register event listener
   */
  public on(event: string, callback: (...args: any[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    // Also register on socket if not internal event
    if (!event.startsWith('connection:') && !event.startsWith('health:')) {
      this.socket?.on(event, callback as any);
    }
  }

  /**
   * Unregister event listener
   */
  public off(event: string, callback: (...args: any[]) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    }

    // Also unregister from socket if not internal event
    if (!event.startsWith('connection:') && !event.startsWith('health:')) {
      this.socket?.off(event, callback as any);
    }
  }

  /**
   * Emit event to local listeners
   */
  private emit(event: string, data?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  /**
   * Emit event to server
   */
  public send(event: string, data?: any): void {
    if (!this.socket?.connected) {
      log.warn('Cannot send event, not connected', event);
      return;
    }
    this.socket.emit(event, data);
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    log.debug('Destroying');
    this.stopHealthMonitoring();
    this.eventListeners.clear();
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}

// Create singleton instance
let socketService: SocketService | null = null;

export function createSocketService(config: SocketConfig): SocketService {
  if (socketService) {
    socketService.destroy();
  }
  socketService = new SocketService(config);
  return socketService;
}

export function getSocketService(): SocketService | null {
  return socketService;
}

export function destroySocketService(): void {
  if (socketService) {
    socketService.destroy();
    socketService = null;
  }
}
