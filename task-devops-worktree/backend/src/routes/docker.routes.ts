/**
 * Docker Management Routes
 * 
 * Handles Docker container operations:
 * - Container info retrieval
 * - Start/Stop/Restart operations
 * - Docker Compose integration
 */

import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import {
  ApiError,
  DockerActionResponse,
  DockerInfoResponse,
} from '@app-monitor/api-contracts';
import { getDockerContainerInfo, stopDockerContainer } from '../utils/portManager.js';
import { logger } from '../utils/logger.js';

// Service configuration for docker compose
const DOCKER_CONFIG = {
  cwd: process.cwd(),
  env: { ...process.env },
  composeFile: 'docker-compose.dev.yml',
  containerName: 'job-finder-local-build',
};

/**
 * Create Docker management router
 * 
 * @returns Express router with Docker endpoints
 */
export function createDockerRouter(): Router {
  const router = Router();

  const respondSuccess = <T>(res: Response, data: T, status = 200) =>
    res.status(status).json({
      success: true,
      data,
    });

  const respondError = (res: Response, status: number, error: string, message?: string) => {
    const payload: ApiError = {
      success: false,
      error,
      ...(message ? { message } : {}),
    };
    return res.status(status).json(payload);
  };

  /**
   * GET /docker/container-info
   * Get Docker container information
   */
  router.get('/container-info', async (_req: Request, res: Response) => {
    try {
      const containerInfo = await getDockerContainerInfo(DOCKER_CONFIG.containerName);
      respondSuccess<DockerInfoResponse['data']>(res, containerInfo);
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_getting_container_info_error',
        message: `Error getting container info: ${error}`,
        error
      });
      respondError(
        res,
        500,
        'FAILED_TO_GET_CONTAINER_INFO',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  /**
   * POST /docker/start
   * Start Docker container using docker compose
   */
  router.post('/start', async (_req: Request, res: Response) => {
    try {
      logger.info({
        category: 'api',
        action: 'docker_start',
        message: 'Starting Docker container...'
      });
      
      // Start the container using docker compose
      const childProcess = spawn(
        'docker',
        ['compose', '-f', DOCKER_CONFIG.composeFile, 'up', '-d'],
        {
          cwd: DOCKER_CONFIG.cwd,
          env: DOCKER_CONFIG.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      childProcess.on('close', (code) => {
        if (code === 0) {
          logger.info({
            category: 'api',
            action: 'docker_started',
            message: 'Docker container started successfully'
          });
        } else {
          logger.error({
            category: 'api',
            action: 'docker_container_start_failed',
            message: `Docker container start failed with code ${code}`,
            details: { code }
          });
        }
      });

      childProcess.on('error', (error) => {
        logger.error({
          category: 'api',
          action: 'failed_to_start_docker_container_error',
          message: `Failed to start Docker container: ${error}`,
          error
        });
      });

      respondSuccess<DockerActionResponse['data']>(res, { message: 'Starting Docker container...' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_starting_container_error',
        message: `Error starting container: ${error}`,
        error
      });
      respondError(
        res,
        500,
        'FAILED_TO_START_CONTAINER',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  /**
   * POST /docker/stop
   * Stop Docker container
   */
  router.post('/stop', async (_req: Request, res: Response) => {
    try {
      logger.info({
        category: 'api',
        action: 'docker_stop',
        message: 'Stopping Docker container...'
      });
      
      const success = await stopDockerContainer(DOCKER_CONFIG.containerName);
      
      if (success) {
        respondSuccess<DockerActionResponse['data']>(res, { message: 'Docker container stopped' });
      } else {
        respondError(res, 500, 'FAILED_TO_STOP_CONTAINER', 'Failed to stop container');
      }
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_stopping_container_error',
        message: `Error stopping container: ${error}`,
        error
      });
      respondError(
        res,
        500,
        'FAILED_TO_STOP_CONTAINER',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  /**
   * POST /docker/restart
   * Restart Docker container (stop then start)
   */
  router.post('/restart', async (_req: Request, res: Response) => {
    try {
      logger.info({
        category: 'api',
        action: 'docker_restart',
        message: 'Restarting Docker container...'
      });
      
      // First stop the container
      const stopSuccess = await stopDockerContainer(DOCKER_CONFIG.containerName);
      if (!stopSuccess) {
        respondError(res, 500, 'FAILED_TO_STOP_CONTAINER', 'Failed to stop container');
        return;
      }

      // Wait a moment for the container to fully stop
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Then start it again
      const childProcess = spawn(
        'docker',
        ['compose', '-f', DOCKER_CONFIG.composeFile, 'up', '-d'],
        {
          cwd: DOCKER_CONFIG.cwd,
          env: DOCKER_CONFIG.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      childProcess.on('close', (code) => {
        if (code === 0) {
          logger.info({
            category: 'api',
            action: 'docker_restarted',
            message: 'Docker container restarted successfully'
          });
        } else {
          logger.error({
            category: 'api',
            action: 'docker_container_restart_failed',
            message: `Docker container restart failed with code ${code}`,
            details: { code }
          });
        }
      });

      childProcess.on('error', (error) => {
        logger.error({
          category: 'api',
          action: 'failed_to_restart_docker_container_error',
          message: `Failed to restart Docker container: ${error}`,
          error
        });
      });

      respondSuccess<DockerActionResponse['data']>(res, { message: 'Restarting Docker container...' });
    } catch (error) {
      logger.error({
        category: 'api',
        action: 'error_restarting_container_error',
        message: `Error restarting container: ${error}`,
        error
      });
      respondError(
        res,
        500,
        'FAILED_TO_RESTART_CONTAINER',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  return router;
}
