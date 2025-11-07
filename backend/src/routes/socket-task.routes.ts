import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import type { ConnectionManager } from '../services/connectionManager.js';

export function createSocketRoutes(connectionManager: ConnectionManager) {
  const router = Router();

  /**
   * Get Socket.IO connection statistics
   */
  router.get('/stats', (_req: Request, res: Response) => {
    try {
      const stats = connectionManager.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error({
        category: 'socket',
        action: 'get_stats_error',
        message: 'Failed to get connection stats',
        error
      });
      res.status(500).json({
        error: 'Failed to get connection statistics',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Get all active connections
   */
  router.get('/connections', (_req: Request, res: Response) => {
    try {
      const connections = connectionManager.getAllConnections();
      
      res.json({
        success: true,
        connections: connections.map((conn) => ({
          socketId: conn.socketId,
          connectedAt: conn.connectedAt,
          lastPing: conn.lastPing,
          isHealthy: conn.isHealthy,
          reconnectCount: conn.reconnectCount,
          subscriptions: Array.from(conn.subscriptions),
          monitors: Array.from(conn.monitors),
        })),
        count: connections.length
      });
    } catch (error) {
      logger.error({
        category: 'socket',
        action: 'get_connections_error',
        message: 'Failed to get connections',
        error
      });
      res.status(500).json({
        error: 'Failed to get connections',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Get specific connection details
   */
  router.get('/connections/:socketId', (req: Request, res: Response) => {
    try {
      const { socketId } = req.params;
      const connection = connectionManager.getConnectionInfo(socketId);
      
      if (!connection) {
        res.status(404).json({
          error: 'Connection not found',
          socketId
        });
        return;
      }
      
      res.json({
        success: true,
        connection: {
          socketId: connection.socketId,
          connectedAt: connection.connectedAt,
          lastPing: connection.lastPing,
          isHealthy: connection.isHealthy,
          reconnectCount: connection.reconnectCount,
          subscriptions: Array.from(connection.subscriptions),
          monitors: Array.from(connection.monitors),
        }
      });
    } catch (error) {
      logger.error({
        category: 'socket',
        action: 'get_connection_error',
        message: `Failed to get connection ${req.params.socketId}`,
        error
      });
      res.status(500).json({
        error: 'Failed to get connection',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}

