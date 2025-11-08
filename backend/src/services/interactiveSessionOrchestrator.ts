import fs from 'fs';
import path from 'path';
import os from 'os';
import type Docker from 'dockerode';

import { logger } from '../utils/logger.js';
import { findRepoRoot } from '../utils/repoPaths.js';
import type { InteractiveSessionRecord } from './database.js';
import type { EphemeralWorkerService } from './ephemeralWorker.service.js';

export interface InteractiveSessionOrchestratorConfig {
  dockerImage: string;
  logsDirectory: string;
  envPassthroughKeys: string[];
  productionAppPath?: string;
  productionApiBaseUrl?: string;
}

export class InteractiveSessionOrchestrator {
  private readonly docker: Docker;
  private readonly ephemeralWorkerService: EphemeralWorkerService;
  private readonly config: InteractiveSessionOrchestratorConfig;
  private readonly repoRoot: string;

  constructor(
    docker: Docker,
    ephemeralWorkerService: EphemeralWorkerService,
    config: InteractiveSessionOrchestratorConfig,
    repoRoot: string = findRepoRoot(process.cwd()),
  ) {
    this.docker = docker;
    this.ephemeralWorkerService = ephemeralWorkerService;
    this.config = {
      ...config,
      productionAppPath:
        config.productionAppPath ?? process.env.INTERACTIVE_PROD_APP_PATH ?? /opt/app-monitor,
      productionApiBaseUrl:
        config.productionApiBaseUrl ??
        process.env.INTERACTIVE_PROD_API_BASE_URL ??
        process.env.PRODUCTION_API_BASE_URL ??
        http://host.docker.internal:5050,
    };
    this.repoRoot = repoRoot;
  }

  async start(session: InteractiveSessionRecord): Promise<string> {
    const containerName = `interactive-bot-${session.id}`;
    const hostLogsDir = path.join(this.config.logsDirectory, session.id);
    fs.mkdirSync(hostLogsDir, { recursive: true });

    const binds = this.buildVolumeBinds(hostLogsDir);
    const envVars = this.buildEnv(session);

    const container = await this.docker.createContainer({
      Image: this.config.dockerImage,
      name: containerName,
      Tty: true,
      OpenStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: '/workspace',
      Cmd: ['/bin/bash', '-c', 'tail -f /dev/null'],
      Env: envVars,
      HostConfig: {
        AutoRemove: false,
        Binds: binds,
        ExtraHosts: ["host.docker.internal:host-gateway"],
        Memory: 512 * 1024 * 1024,
        CpuQuota: 50000,
        Tmpfs: {
          '/home/worker/.claude': 'uid=1001,gid=1001',
        },
      },
      Labels: {
        'dev-bot.interactive': 'true',
        'dev-bot.session.id': session.id,
        'dev-bot.owner': session.ownerEmail,
        'dev-bot.model.provider': session.modelProvider,
        'dev-bot.model.name': session.modelName,
      },
    });

    await container.start();
    // Note: Container will clone fresh repo internally - no workspace population needed

    logger.info({
      category: 'system',
      action: 'container_started',
      message: `Started interactive session container ${container.id}`,
      details: {
        sessionId: session.id,
        ownerEmail: session.ownerEmail,
        model: `${session.modelProvider}:${session.modelName}`,
      },
    });

    return container.id;
  }

  private buildVolumeBinds(hostLogsDir: string): string[] {
    const binds = [`${hostLogsDir}:/app/logs:rw`];
    const productionAppPath = this.config.productionAppPath;
    if (productionAppPath) {
      if (fs.existsSync(productionAppPath)) {
        binds.push(`${productionAppPath}:/opt/app-monitor:ro`);
        const productionLogsPath = path.join(productionAppPath, logs);
        if (fs.existsSync(productionLogsPath)) {
          binds.push(`${productionLogsPath}:/app/prod-logs:ro`);
        } else {
          logger.warn({
            category: interactive-session,
            action: production_logs_missing,
            message: `Production logs directory not found at ${productionLogsPath}`,
          });
        }
      } else {
        logger.warn({
          category: interactive-session,
          action: production_mount_missing,
          message: `Production app path ${productionAppPath} not found on host`,
        });
      }
    }
    return binds;
  }

  async stop(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    try {
      await container.stop({ t: 5 });
    } catch (error) {
      if (!(error instanceof Error) || (error as any).statusCode !== 304) {
        logger.warn({
          category: 'system',
          action: 'container_stop_failed',
          message: `Failed to stop container ${containerId}, forcing removal`,
          error,
        });
      }
    }

    try {
      await container.remove({ force: true });
    } catch (error) {
      logger.warn({
        category: 'system',
        action: 'container_remove_failed',
        message: `Failed to remove container ${containerId}`,
        error,
      });
    }
  }

  private buildEnv(session: InteractiveSessionRecord): string[] {
    const envVars: string[] = [];
    for (const key of this.config.envPassthroughKeys) {
      const value = process.env[key];
      if (typeof value === 'string') {
        envVars.push(`${key}=${value}`);
      }
    }

    envVars.push(`DEV_BOT_SESSION_ID=${session.id}`);
    envVars.push(`DEV_BOT_OWNER_EMAIL=${session.ownerEmail}`);
    envVars.push(`DEV_BOT_MODEL_PROVIDER=${session.modelProvider}`);
    envVars.push(`DEV_BOT_MODEL_NAME=${session.modelName}`);
    envVars.push('DEV_BOT_MODE=interactive');
    envVars.push('HOME=/home/worker');
    envVars.push('USER=worker');
    envVars.push('SHELL=/bin/bash');

    if (this.config.productionAppPath) {
      envVars.push(`PRODUCTION_APP_ROOT=${this.config.productionAppPath}`);
      envVars.push(PRODUCTION_LOGS_PATH=/app/prod-logs);
    }

    const productionApiBaseUrl = this.config.productionApiBaseUrl;
    if (productionApiBaseUrl) {
      envVars.push(`PRODUCTION_API_BASE_URL=${productionApiBaseUrl}`);
    }
    const productionApiToken =
      process.env.INTERACTIVE_PROD_API_TOKEN ?? process.env.PRODUCTION_API_TOKEN ?? process.env.PRODUCTION_API_KEY;
    if (productionApiToken) {
      envVars.push(`PRODUCTION_API_TOKEN=${productionApiToken}`);
    }

    const claudeCredentialsNew = path.join(os.homedir(), '.claude', '.credentials.json');
    const claudeCredentialsLegacy = path.join(os.homedir(), '.claude', 'credentials.json');
    if (fs.existsSync(claudeCredentialsNew)) {
      envVars.push(`CLAUDE_CREDENTIALS_PATH=${claudeCredentialsNew}`);
    } else if (fs.existsSync(claudeCredentialsLegacy)) {
      envVars.push(`CLAUDE_CREDENTIALS_PATH=${claudeCredentialsLegacy}`);
    }

    return envVars;
  }
}
