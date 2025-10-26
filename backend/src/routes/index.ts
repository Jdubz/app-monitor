/**
 * Modular API Routes Index
 * 
 * This file will gradually replace the monolithic api.ts (2828 lines)
 * by importing and mounting modular route modules.
 * 
 * Progress: Phase 3.1 - Backend Simplification
 * Status: In Progress
 */

import { Router } from 'express';
import { ProcessManager } from '../services/processManager.js';
import { CloudLogging } from '../services/cloudLogging.js';
import { ScriptManager } from '../services/scriptManager.js';
import { DevBotsManager } from '../services/devBotsManager.js';
import type { ConnectionManager } from '../services/connectionManager.js';
import type { TaskQueueManager } from '../services/taskQueueManager.js';
import type { ScriptExecutionHistory } from '../services/scriptExecutionHistory.js';
import type { TaskBridge } from '../services/taskBridge.js';
import type { LogRotation } from '../services/logRotation.js';
import type { LogStreamer } from '../services/logStreamer.js';
import type { ServiceConfig } from '../config.js';

import { createServicesRouter } from './services.routes.js';
import { createSocketRoutes, createTaskRoutes } from './socket-task.routes.js';
import { createDockerRouter } from './docker.routes.js';
import { createScriptsRouter } from './scripts.routes.js';
import { createScriptHistoryRouter } from './script-history.routes.js';
import { createClaudeWorkersRouter } from './dev-bots.routes.js';
import { createLogsRoutes } from './logs.routes.js';
import { createPortsRoutes } from './ports.routes.js';
import { createEnvironmentsRoutes } from './environments.routes.js';

/**
 * Create the main API router with all sub-routes
 * 
 * This factory function takes all dependencies and returns a configured router.
 * Benefits:
 * - Dependency injection (easier testing)
 * - Type-safe
 * - Modular
 * - Clear dependencies
 */
export function createApiRouter(deps: {
  processManager: ProcessManager;
  cloudLogging: CloudLogging;
  scriptManager: ScriptManager;
  devBotsManager: DevBotsManager;
  connectionManager?: ConnectionManager;
  taskQueueManager?: TaskQueueManager;
  scriptExecutionHistory?: ScriptExecutionHistory;
  taskBridge?: TaskBridge;
  logRotation?: LogRotation;
  logStreamer?: LogStreamer;
  services?: Record<string, ServiceConfig>;
}) {
  const router = Router();

  // Health check (keep in main router)
  router.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Mount modular routes
  router.use('/services', createServicesRouter(deps.processManager));
  
  // Mount socket routes (if available)
  if (deps.connectionManager) {
    router.use('/socket', createSocketRoutes(deps.connectionManager));
  }
  
  // Mount task routes (if available)
  if (deps.taskQueueManager) {
    router.use('/tasks', createTaskRoutes(deps.taskQueueManager));
  }

  // Mount Docker routes
  router.use('/docker', createDockerRouter());

  // Mount script routes
  router.use('/scripts', createScriptsRouter(deps.scriptManager));

  // Mount script history routes (if available)
  if (deps.scriptExecutionHistory) {
    const historyRouter = createScriptHistoryRouter(deps.scriptExecutionHistory);
    // Mount under /scripts to keep related endpoints together
    router.use('/scripts', historyRouter);
  }

  // Mount Dev-Bots routes
  router.use('/dev-bots', createClaudeWorkersRouter(deps.devBotsManager));

  // Mount Logs routes (if available)
  if (deps.logRotation && deps.logStreamer) {
    router.use('/logs', createLogsRoutes({
      logRotation: deps.logRotation,
      cloudLogging: deps.cloudLogging,
      logStreamer: deps.logStreamer,
      processManager: deps.processManager,
    }));
  }

  // Mount Ports routes (if available)
  if (deps.services) {
    router.use('/ports', createPortsRoutes({ services: deps.services }));
  }

  // Mount Environments routes
  router.use('/environments', createEnvironmentsRoutes({ cloudLogging: deps.cloudLogging }));

  return router;
}

/**
 * Export singleton instances for backward compatibility
 * These will be gradually removed as we complete modularization
 */
export const processManager = new ProcessManager();
export const cloudLogging = new CloudLogging();
export const scriptManager = new ScriptManager();
export const devBotsManager = new DevBotsManager(processManager);

/**
 * Default export for backward compatibility
 * This maintains the current API contract while we transition
 */
export default Router();
