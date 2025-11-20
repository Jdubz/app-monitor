/**
 * Server-Sent Events (SSE) Routes
 *
 * Provides real-time event streaming for dev-bots task updates.
 * Replaces WebSocket for unidirectional server-to-client updates.
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../services/devBotsManager.js';
import { logger } from '../utils/logger.js';

export function createSSERoutes(devBotsManager: DevBotsManager): Router {
  const router = Router();
  const clients: Response[] = [];

  /**
   * SSE endpoint: /api/sse/events
   * Streams real-time task and system events to connected clients
   */
  router.get('/events', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection message
    res.write('data: {"type":"connected"}\n\n');

    logger.info({
      category: 'sse',
      action: 'client_connected',
      message: 'SSE client connected',
      details: { clientCount: clients.length + 1 },
    });

    // Add client to list
    clients.push(res);

    // Remove client on disconnect
    req.on('close', () => {
      const index = clients.indexOf(res);
      if (index !== -1) {
        clients.splice(index, 1);
        logger.info({
          category: 'sse',
          action: 'client_disconnected',
          message: 'SSE client disconnected',
          details: { clientCount: clients.length },
        });
      }
    });
  });

  /**
   * Broadcast event to all connected SSE clients
   */
  function broadcast(event: string, data: unknown) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    // Remove failed clients
    const failedClients: Response[] = [];

    clients.forEach(client => {
      try {
        client.write(message);
      } catch (error) {
        logger.warn({
          category: 'sse',
          action: 'broadcast_failed',
          message: 'Failed to send SSE message to client',
          error,
        });
        failedClients.push(client);
      }
    });

    // Clean up failed clients
    failedClients.forEach(failedClient => {
      const index = clients.indexOf(failedClient);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    });
  }

  // Wire up DevBotsManager events to SSE broadcasts
  devBotsManager.on('taskAdded', (task) => {
    broadcast('task:added', task);
  });

  devBotsManager.on('taskAssigned', (task) => {
    broadcast('task:assigned', task);
  });

  devBotsManager.on('taskStarted', (task) => {
    broadcast('task:started', task);
  });

  devBotsManager.on('taskCompleted', (task) => {
    broadcast('task:completed', task);
  });

  devBotsManager.on('taskFailed', (task) => {
    broadcast('task:failed', task);
  });

  devBotsManager.on('systemStatusChange', (status) => {
    broadcast('system:status', status);
  });

  devBotsManager.on('coordinatorHealthChange', (isHealthy) => {
    broadcast('system:health', { isHealthy });
  });

  devBotsManager.on('dockerError', (error) => {
    broadcast('docker:error', error);
  });

  devBotsManager.on('dockerWarning', (warning) => {
    broadcast('docker:warning', warning);
  });

  return router;
}
