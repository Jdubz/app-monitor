import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import * as crypto from 'crypto';
import { config } from './config.js';
import { createApiRouter } from './routes/index.js';
import { DevBotsManager } from './services/devBotsManager.js';
import { createDevBotsManagerDependencies } from './services/devBotsManager.factory.js';
import type { DevBotsManagerDependencies } from './services/devBotsManager.interfaces.js';
import { ConnectionManager, setConnectionManagerInstance } from './services/connectionManager.js';
import { GitHubWebhookHandler } from './services/githubWebhookHandler.service.js';
import { setWebhookHandler } from './routes/github-webhooks.routes.js';
import { logger } from './utils/logger.js';

// CORS allowed headers for both HTTP and WebSocket
const ALLOWED_CORS_HEADERS = ['Content-Type', 'X-API-Key', 'Authorization', 'X-Trace-Id'];
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from './types/socketEvents.js';
import { SocketIOTerminalHandler } from './services/socketIOTerminalHandler.js';

// Export services for API access
export let devBotsManager: DevBotsManager | undefined;
export let connectionManager: ConnectionManager;
export let terminalHandler: SocketIOTerminalHandler | undefined;

export interface CreateAppOverrides {
  devBotsManager?: DevBotsManager | null;
  devBotsDependencies?: DevBotsManagerDependencies;
  connectionManager?: ConnectionManager;
}

export interface CreateAppOptions {
  overrides?: CreateAppOverrides;
}

export async function createApp(options: CreateAppOptions = {}) {
  const overrides = options.overrides ?? {};
  const app = express();
  const httpServer = createServer(app);

  // Setup Socket.IO with type-safe events
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: config.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ALLOWED_CORS_HEADERS,
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    allowEIO3: true,
  });

  // Add Socket.IO authentication middleware
  if (config.requireAuth) {
    io.use((socket, next) => {
      const apiKey = socket.handshake.auth?.apiKey as string | undefined;

      if (!apiKey) {
        logger.warn({
          category: 'socket',
          action: 'auth_failed',
          message: 'Socket.IO connection denied - missing API key',
          details: {
            socketId: socket.id,
            ip: socket.handshake.address,
          },
        });
        return next(new Error('Authentication required'));
      }

      const expectedKeyBuffer = Buffer.from(config.apiKey);
      const providedKeyBuffer = Buffer.from(apiKey);

      // Use timing-safe comparison to prevent timing attacks
      const keysMatch =
        expectedKeyBuffer.length === providedKeyBuffer.length &&
        crypto.timingSafeEqual(expectedKeyBuffer, providedKeyBuffer);

      if (!keysMatch) {
        logger.warn({
          category: 'socket',
          action: 'auth_failed',
          message: 'Socket.IO connection denied - invalid API key',
          details: {
            socketId: socket.id,
            ip: socket.handshake.address,
          },
        });
        return next(new Error('Invalid API key'));
      }

      logger.info({
        category: 'socket',
        action: 'auth_success',
        message: 'Socket.IO connection authenticated',
        details: { socketId: socket.id },
      });
      next();
    });
  }

  // Initialize ConnectionManager
  connectionManager = overrides.connectionManager ?? new ConnectionManager();

  // Set Socket.IO instance for broadcasting
  connectionManager.setIO(io);

  // Set global instance for service access
  setConnectionManagerInstance(connectionManager);

  // Initialize Socket.IO Terminal Handler (unified architecture)
  // This will be used instead of the native WebSocket implementation (InteractiveSessionStreaming)
  // Note: Docker instance will be available after DevBotsManager initialization
  // Terminal handler initialization happens after DevBotsManager is created
  // (moved to after DevBotsManager initialization below)

  if (overrides.devBotsManager === null) {
    devBotsManager = undefined;
  } else if (overrides.devBotsManager) {
    devBotsManager = overrides.devBotsManager;
    // Note: InteractiveSessionStreaming is now created inside the factory
    // and automatically handles WebSocket connections via the HTTP server
  } else {
    // Create dependencies with HTTP server for InteractiveSessionStreaming
    const devBotsDeps = overrides.devBotsDependencies ?? await createDevBotsManagerDependencies({
      httpServer
    });
    devBotsManager = new DevBotsManager(devBotsDeps);
    // Note: InteractiveSessionStreaming WebSocket gateway is already initialized
  }

  if (devBotsManager) {
    // Setup Dev-Bots Manager Socket.IO events
    devBotsManager.on('taskAdded', (task) => {
      io.emit('claude:taskAdded', task);
    });

    devBotsManager.on('taskAssigned', (task) => {
      io.emit('claude:taskAssigned', task);
    });

    devBotsManager.on('taskStarted', (task) => {
      io.emit('claude:taskStarted', task);
    });

    devBotsManager.on('taskCompleted', (task) => {
      io.emit('claude:taskCompleted', task);
    });

    devBotsManager.on('taskFailed', (task) => {
      io.emit('claude:taskFailed', task);
    });

    devBotsManager.on('systemStatusChange', (status) => {
      io.emit('claude:systemStatusChange', status);
    });

    devBotsManager.on('coordinatorHealthChange', (isHealthy) => {
      io.emit('claude:coordinatorHealthChange', isHealthy);
    });

    // Docker error and warning events
    devBotsManager.on('dockerError', (error) => {
      io.emit('claude:dockerError', error);
      logger.error({
        category: 'process',
        action: 'docker_error_emitted_to_clients',
        message: 'Docker error emitted to clients',
        error,
      });
    });

    devBotsManager.on('dockerWarning', (warning) => {
      io.emit('claude:dockerWarning', warning);
      logger.warn({
        category: 'process',
        action: 'docker_warning_emitted_to_clients',
        message: 'Docker warning emitted to clients',
        details: { warning },
      });
    });

    // Initialize Socket.IO Terminal Handler with Docker instance
    const dockerManager = devBotsManager.getDockerManager();
    const docker = dockerManager.getDocker();

    terminalHandler = new SocketIOTerminalHandler({
      io,
      docker,
      backlogLimit: 200,
      shellCommand: ['/bin/bash'],
    });

    logger.info({
      category: 'interactive_terminal',
      action: 'handler_initialized',
      message: 'Socket.IO terminal handler initialized (unified architecture)',
      details: {
        backlogLimit: 200,
        shellCommand: ['/bin/bash'],
      },
    });

    // Wire up InteractiveSessionManager events to Socket.IO terminal handler
    const sessionManager = devBotsManager.getInteractiveSessionManager();

    sessionManager.on('sessionStarted', async (session) => {
      if (session.containerId && terminalHandler) {
        try {
          await terminalHandler.startSession(session.id, session.containerId);
          logger.info({
            category: 'interactive_terminal',
            action: 'socketio_streaming_started',
            message: 'Socket.IO terminal streaming started for session',
            details: { sessionId: session.id, containerId: session.containerId },
          });
        } catch (error) {
          logger.error({
            category: 'interactive_terminal',
            action: 'socketio_streaming_start_failed',
            message: 'Failed to start Socket.IO terminal streaming',
            error,
            details: { sessionId: session.id, containerId: session.containerId },
          });
        }
      }
    });

    sessionManager.on('sessionEnded', async (session) => {
      if (terminalHandler) {
        try {
          await terminalHandler.stopSession(session.id);
          logger.info({
            category: 'interactive_terminal',
            action: 'socketio_streaming_stopped',
            message: 'Socket.IO terminal streaming stopped for session',
            details: { sessionId: session.id },
          });
        } catch (error) {
          logger.error({
            category: 'interactive_terminal',
            action: 'socketio_streaming_stop_failed',
            message: 'Failed to stop Socket.IO terminal streaming',
            error,
            details: { sessionId: session.id },
          });
        }
      }
    });

    logger.info({
      category: 'interactive_terminal',
      action: 'event_listeners_wired',
      message: 'Interactive session events wired to Socket.IO terminal handler',
    });
  }

  // Initialize GitHub Webhook Handler
  if (devBotsManager) {
    const taskQueue = devBotsManager.getTaskQueue();
    const prOrchestrator = devBotsManager.getPRWorkflowOrchestrator();
    
    const webhookHandler = new GitHubWebhookHandler(taskQueue, prOrchestrator);
    setWebhookHandler(webhookHandler);
    
    // Initialize PR sync service and wire it up
    const { initializePRSyncService } = await import('./services/prSync.service.js');
    const prSyncService = initializePRSyncService(taskQueue);
    
    // Reuse PullRequestHandler from webhook handler (avoids duplicate instances)
    prSyncService.setPullRequestHandler(webhookHandler.getPullRequestHandler());
    
    // Inject PR condition state service for accessing pr_condition_states table
    prSyncService.setPRConditionStateService(webhookHandler.getPRConditionStateService());
    
    // Inject PR sync service into task queue (dependency injection, not dynamic import)
    taskQueue.setPRSyncService(prSyncService);

    logger.info({
      category: 'system',
      action: 'webhook_handler_initialized',
      message: 'GitHub webhook handler configured and ready',
      details: {
        has_task_queue: !!taskQueue,
        has_pr_orchestrator: !!prOrchestrator,
        pr_sync_enabled: config.prSync.enabled,
        pr_sync_threshold: config.prSync.taskThreshold,
        issue_triage_enabled: true
      }
    });
  }

  // Set up Socket.IO connections
  io.on('connection', (socket) => {
    logger.info({
      category: 'socket',
      action: 'client_connected',
      message: 'Client connected',
      details: { socketId: socket.id },
    });

    connectionManager.register(socket);

    // Disconnect is handled internally by connectionManager.register()

    socket.on('docker:startMonitor', async ({ containerId }) => {
      if (!devBotsManager) {
        socket.emit('docker:monitorError', {
          containerId,
          error: 'Dev-Bots manager unavailable',
        });
        return;
      }
      try {
        const dockerManager = devBotsManager.getDockerManager();

        connectionManager.addMonitor(socket.id, containerId);

        const info = await dockerManager.inspectContainer(containerId);
        if (info) {
          socket.emit('docker:containerStatus', {
            containerId,
            status: info.State,
            timestamp: new Date().toISOString(),
          });
        }

        const intervalId = setInterval(async () => {
          try {
            const updatedInfo = await dockerManager.inspectContainer(containerId);
            if (updatedInfo) {
              socket.emit('docker:containerStatus', {
                containerId,
                status: updatedInfo.State,
                timestamp: new Date().toISOString(),
              });
            }
          } catch (error) {
            logger.error({
              category: 'docker',
              action: 'monitor_error',
              message: 'Failed to get container status',
              error,
            });
          }
        }, 5000);

        socket.data.monitorIntervals = socket.data.monitorIntervals || {};
        socket.data.monitorIntervals[containerId] = intervalId;

        socket.emit('docker:monitorStarted', { containerId });
      } catch (error) {
        logger.error({
          category: 'docker',
          action: 'monitor_error',
          message: 'Failed to start container monitoring',
          error,
        });
        socket.emit('docker:monitorError', {
          containerId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    socket.on('docker:stopMonitor', ({ containerId }) => {
      connectionManager.removeMonitor(socket.id, containerId);

      if (socket.data.monitorIntervals?.[containerId]) {
        clearInterval(socket.data.monitorIntervals[containerId]);
        delete socket.data.monitorIntervals[containerId];
        socket.emit('docker:monitorStopped', { containerId });
      }
    });

    socket.on('disconnect', () => {
      logger.info({
        category: 'socket',
        action: 'client_disconnected',
        message: 'Client disconnected',
        details: { socketId: socket.id },
      });

      if (socket.data.monitorIntervals) {
        Object.values(socket.data.monitorIntervals).forEach((intervalId: NodeJS.Timeout) => {
          clearInterval(intervalId);
        });
      }
    });
  });

  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
    allowedHeaders: ALLOWED_CORS_HEADERS,
  }));
  app.use(express.json());

  const apiRouter = createApiRouter({
    devBotsManager: devBotsManager ?? undefined,
    connectionManager,
  });

  app.use('/api', apiRouter);

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      message: 'Dev Monitor Backend',
      version: '1.0.0',
      status: 'running',
    });
  });

  return httpServer;
}
