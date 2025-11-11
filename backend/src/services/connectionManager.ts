/**
 * Socket.IO Connection Manager
 * 
 * Handles connection lifecycle, health monitoring, and state management
 */

import { Socket, Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';

export interface ConnectionInfo {
  socketId: string;
  connectedAt: number;
  lastPing: number;
  isHealthy: boolean;
  reconnectCount: number;
  subscriptions: Set<string>;
  monitors: Set<string>;
}

export class ConnectionManager {
  private connections = new Map<string, ConnectionInfo>();
  private heartbeatInterval = 30000; // 30 seconds
  private heartbeatTimeout = 45000; // 45 seconds
  private intervalIds = new Map<string, NodeJS.Timeout>();
  private io?: SocketIOServer; // Socket.IO server instance for broadcasting

  /**
   * Register a new connection
   */
  register(socket: Socket): void {
    const info: ConnectionInfo = {
      socketId: socket.id,
      connectedAt: Date.now(),
      lastPing: Date.now(),
      isHealthy: true,
      reconnectCount: 0,
      subscriptions: new Set(),
      monitors: new Set(),
    };

    this.connections.set(socket.id, info);

    logger.info({
      category: 'socket',
      action: 'connection_registered',
      message: `Connection registered: ${socket.id}`,
      details: { socketId: socket.id }
    });

    // Start heartbeat monitoring
    this.startHeartbeat(socket);

    // Setup ping-pong
    socket.on('ping', () => {
      this.updateLastPing(socket.id);
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.unregister(socket.id, reason);
    });
  }

  /**
   * Unregister a connection
   */
  unregister(socketId: string, reason?: string): void {
    const info = this.connections.get(socketId);
    
    if (info) {
      // Stop heartbeat
      const intervalId = this.intervalIds.get(socketId);
      if (intervalId) {
        clearInterval(intervalId);
        this.intervalIds.delete(socketId);
      }

      this.connections.delete(socketId);

      logger.info({
        category: 'socket',
        action: 'connection_unregistered',
        message: `Connection unregistered: ${socketId}`,
        details: { 
          socketId, 
          reason,
          duration: Date.now() - info.connectedAt,
          reconnectCount: info.reconnectCount
        }
      });
    }
  }

  /**
   * Update last ping timestamp
   */
  updateLastPing(socketId: string): void {
    const info = this.connections.get(socketId);
    if (info) {
      info.lastPing = Date.now();
      info.isHealthy = true;
    }
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(socketId: string): boolean {
    const info = this.connections.get(socketId);
    if (!info) return false;

    const timeSinceLastPing = Date.now() - info.lastPing;
    return timeSinceLastPing < this.heartbeatTimeout;
  }

  /**
   * Get connection info
   */
  getConnectionInfo(socketId: string): ConnectionInfo | undefined {
    return this.connections.get(socketId);
  }

  /**
   * Get all active connections
   */
  getAllConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Set Socket.IO instance for broadcasting
   */
  setIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcastToAll(event: string | object, ...args: unknown[]): void {
    if (!this.io) {
      logger.warn({
        category: 'socket',
        action: 'broadcast_failed_no_io',
        message: 'Cannot broadcast: Socket.IO instance not set'
      });
      return;
    }

    // If first argument is an object, use it as the event data
    if (typeof event === 'object') {
      this.io.emit('system_event', event, ...args);
      logger.info({
        category: 'socket',
        action: 'broadcast_to_all',
        message: 'Broadcast system event to all clients',
        details: { connectionCount: this.connections.size, event }
      });
    } else {
      this.io.emit(event, ...args);
      logger.info({
        category: 'socket',
        action: 'broadcast_to_all',
        message: `Broadcast '${event}' to all clients`,
        details: { connectionCount: this.connections.size }
      });
    }
  }

  /**
   * Add subscription to connection
   */
  addSubscription(socketId: string, subscription: string): void {
    const info = this.connections.get(socketId);
    if (info) {
      info.subscriptions.add(subscription);
    }
  }

  /**
   * Remove subscription from connection
   */
  removeSubscription(socketId: string, subscription: string): void {
    const info = this.connections.get(socketId);
    if (info) {
      info.subscriptions.delete(subscription);
    }
  }

  /**
   * Add monitor to connection
   */
  addMonitor(socketId: string, containerId: string): void {
    const info = this.connections.get(socketId);
    if (info) {
      info.monitors.add(containerId);
    }
  }

  /**
   * Remove monitor from connection
   */
  removeMonitor(socketId: string, containerId: string): void {
    const info = this.connections.get(socketId);
    if (info) {
      info.monitors.delete(containerId);
    }
  }

  /**
   * Start heartbeat monitoring for a socket
   */
  private startHeartbeat(socket: Socket): void {
    const intervalId = setInterval(() => {
      const info = this.connections.get(socket.id);
      if (!info) {
        clearInterval(intervalId);
        return;
      }

      // Check if connection is still healthy
      const healthy = this.isHealthy(socket.id);
      
      if (!healthy && info.isHealthy) {
        // Connection became unhealthy
        logger.warn({
          category: 'socket',
          action: 'connection_unhealthy',
          message: `Connection unhealthy: ${socket.id}`,
          details: { 
            socketId: socket.id,
            timeSinceLastPing: Date.now() - info.lastPing
          }
        });
        info.isHealthy = false;
      }

      // Send heartbeat
      socket.emit('heartbeat', {
        timestamp: Date.now(),
        healthy: info.isHealthy
      });
    }, this.heartbeatInterval);

    this.intervalIds.set(socket.id, intervalId);
  }

  /**
   * Get statistics about connections
   */
  getStats(): {
    total: number;
    healthy: number;
    unhealthy: number;
    totalSubscriptions: number;
    totalMonitors: number;
    avgReconnects: number;
  } {
    const connections = this.getAllConnections();
    const healthy = connections.filter(c => c.isHealthy).length;
    const totalSubscriptions = connections.reduce((sum, c) => sum + c.subscriptions.size, 0);
    const totalMonitors = connections.reduce((sum, c) => sum + c.monitors.size, 0);
    const avgReconnects = connections.length > 0
      ? connections.reduce((sum, c) => sum + c.reconnectCount, 0) / connections.length
      : 0;

    return {
      total: connections.length,
      healthy,
      unhealthy: connections.length - healthy,
      totalSubscriptions,
      totalMonitors,
      avgReconnects
    };
  }
}
