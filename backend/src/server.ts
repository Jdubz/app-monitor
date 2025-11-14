import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { config } from './config.js';
import { createApiRouter } from './routes/index.js';
import { DevBotsManager } from './services/devBotsManager.js';
import { createDevBotsManagerDependencies } from './services/devBotsManager.factory.js';
import type { DevBotsManagerDependencies } from './services/devBotsManager.interfaces.js';
import { ConnectionManager } from './services/connectionManager.js';
import { InteractiveSessionGateway } from './services/interactiveSessionGateway.js';
import { GitHubWebhookHandler } from './services/githubWebhookHandler.service.js';
import { setWebhookHandler } from './routes/github-webhooks.routes.js';
import { logger } from './utils/logger.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from './types/socketEvents.js';

// Export services for API access
export let devBotsManager: DevBotsManager | undefined;
export let connectionManager: ConnectionManager;

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
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    allowEIO3: true,
  });

  // Initialize ConnectionManager
  connectionManager = overrides.connectionManager ?? new ConnectionManager();

  // Set Socket.IO instance for broadcasting
  connectionManager.setIO(io);

  if (overrides.devBotsManager === null) {
    devBotsManager = undefined;
  } else if (overrides.devBotsManager) {
    devBotsManager = overrides.devBotsManager;
    const depsForGateway = overrides.devBotsDependencies;
    if (depsForGateway?.interactiveSessionStreamManager) {
      new InteractiveSessionGateway({
        server: httpServer,
        devBotsManager,
        streamManager: depsForGateway.interactiveSessionStreamManager,
      });
    }
  } else {
    const devBotsDeps = overrides.devBotsDependencies ?? await createDevBotsManagerDependencies();
    devBotsManager = new DevBotsManager(devBotsDeps);
    new InteractiveSessionGateway({
      server: httpServer,
      devBotsManager,
      streamManager: devBotsDeps.interactiveSessionStreamManager,
    });
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
  }

  // Initialize GitHub Webhook Handler
  if (devBotsManager) {
    const taskQueue = devBotsManager.getTaskQueue();
    const prOrchestrator = devBotsManager.getPRWorkflowOrchestrator();
    
    const webhookHandler = new GitHubWebhookHandler(taskQueue, prOrchestrator);
    setWebhookHandler(webhookHandler);
    
    logger.info({
      category: 'system',
      action: 'webhook_handler_initialized',
      message: 'GitHub webhook handler configured and ready',
      details: {
        has_task_queue: !!taskQueue,
        has_pr_orchestrator: !!prOrchestrator
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
