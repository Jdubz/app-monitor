/**
 * Server-Sent Events (SSE) Routes
 *
 * Provides real-time event streaming for dev-bots task updates.
 * Replaces WebSocket for unidirectional server-to-client updates.
 *
 * ⚠️ SINGLETON ROUTER - Create only once per application instance
 * Event listeners are registered on devBotsManager and persist for the
 * lifetime of the router. Do not recreate this router during hot reloads
 * or it will cause memory leaks and duplicate event broadcasts.
 *
 * 🔒 SECURITY NOTE - API Key in Query Parameters
 * This endpoint accepts API keys via query parameters (e.g., ?apiKey=...)
 * to support EventSource API limitations (no custom headers support).
 *
 * Security implications:
 * - Query parameters may be logged in server/proxy access logs
 * - API keys may appear in browser history
 * - Query strings are visible in URLs
 *
 * Mitigation:
 * - Always deploy over HTTPS in production
 * - Configure web servers/proxies to avoid logging query parameters
 * - Consider using short-lived tokens if high security is required
 * - Educate users about browser history risks
 */

import { Router, Request, Response } from 'express';
import type { DevBotsManager } from '../services/devBotsManager.js';
import { logger } from '../utils/logger.js';

export function createSSERoutes(devBotsManager: DevBotsManager): Router {
  const router = Router();
  const clients = new Set<Response>();

  /**
   * Broadcast event to all connected SSE clients
   */
  function broadcast(event: string, data: unknown) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    // Create snapshot to avoid iteration issues during concurrent broadcasts
    const clientsSnapshot = Array.from(clients);

    for (const client of clientsSnapshot) {
      try {
        client.write(message);
      } catch (error) {
        logger.warn({
          category: 'sse',
          action: 'broadcast_failed',
          message: 'Failed to send SSE message to client',
          error,
        });
        // Remove failed client
        clients.delete(client);
      }
    }
  }

  // Wire up DevBotsManager events to SSE broadcasts
  const taskAddedHandler = (task: unknown) => broadcast('task:added', task);
  const taskAssignedHandler = (task: unknown) => broadcast('task:assigned', task);
  const taskStartedHandler = (task: unknown) => broadcast('task:started', task);
  const taskCompletedHandler = (task: unknown) => broadcast('task:completed', task);
  const taskFailedHandler = (task: unknown) => broadcast('task:failed', task);
  const systemStatusHandler = (status: unknown) => broadcast('system:status', status);
  const healthChangeHandler = (isHealthy: unknown) => broadcast('system:health', { isHealthy });
  const dockerErrorHandler = (error: unknown) => broadcast('docker:error', error);
  const dockerWarningHandler = (warning: unknown) => broadcast('docker:warning', warning);

  devBotsManager.on('taskAdded', taskAddedHandler);
  devBotsManager.on('taskAssigned', taskAssignedHandler);
  devBotsManager.on('taskStarted', taskStartedHandler);
  devBotsManager.on('taskCompleted', taskCompletedHandler);
  devBotsManager.on('taskFailed', taskFailedHandler);
  devBotsManager.on('systemStatusChange', systemStatusHandler);
  devBotsManager.on('coordinatorHealthChange', healthChangeHandler);
  devBotsManager.on('dockerError', dockerErrorHandler);
  devBotsManager.on('dockerWarning', dockerWarningHandler);

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
      details: { clientCount: clients.size + 1 },
    });

    // Add client to set
    clients.add(res);

    // Remove client on disconnect
    req.on('close', () => {
      clients.delete(res);
      logger.info({
        category: 'sse',
        action: 'client_disconnected',
        message: 'SSE client disconnected',
        details: { clientCount: clients.size },
      });
    });
  });

  return router;
}
