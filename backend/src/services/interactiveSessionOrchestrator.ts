import fs from 'fs';
import path from 'path';
import type Docker from 'dockerode';

import { logger } from '../utils/logger.js';
import { findRepoRoot } from '../utils/repoPaths.js';
import type { InteractiveSessionRecord } from './database.js';
import {
  DevBotContainerPresets,
  DevBotWorkspaceManager,
  DevBotCredentialsManager,
  DevBotContainerLifecycle,
} from './devbot/index.js';
import { getLogPaths } from './workTargetDocumentation.js';

export interface InteractiveSessionOrchestratorConfig {
  dockerImage: string;
  logsDirectory: string;
  envPassthroughKeys: string[];
  productionAppPath?: string;
  productionApiBaseUrl?: string;
}

interface ResolvedInteractiveSessionConfig extends InteractiveSessionOrchestratorConfig {
  productionAppPath: string;
  productionApiBaseUrl: string;
}

/**
 * Interactive Session Orchestrator
 *
 * Manages interactive dev-bot session containers using modular utilities.
 * Handles container creation, workspace setup, and lifecycle management.
 */
export class InteractiveSessionOrchestrator {
  private readonly docker: Docker;
  private readonly config: ResolvedInteractiveSessionConfig;
  private readonly repoRoot: string;

  // Modular utilities
  private readonly workspaceManager: DevBotWorkspaceManager;
  private readonly credentialsManager: DevBotCredentialsManager;
  private readonly lifecycle: DevBotContainerLifecycle;

  constructor(
    docker: Docker,
    config: InteractiveSessionOrchestratorConfig,
    repoRoot: string = findRepoRoot(process.cwd()),
  ) {
    this.docker = docker;

    const productionAppPath =
      config.productionAppPath ?? process.env.INTERACTIVE_PROD_APP_PATH ?? '/opt/app-monitor';
    const productionApiBaseUrl =
      config.productionApiBaseUrl ??
      process.env.INTERACTIVE_PROD_API_BASE_URL ??
      process.env.PRODUCTION_API_BASE_URL ??
      'http://host.docker.internal:5050';

    this.config = {
      ...config,
      productionAppPath,
      productionApiBaseUrl,
    };
    this.repoRoot = repoRoot;

    // Initialize modular utilities
    this.workspaceManager = new DevBotWorkspaceManager(docker);
    this.credentialsManager = new DevBotCredentialsManager();
    this.lifecycle = new DevBotContainerLifecycle(docker);
  }

  /**
   * Start an interactive session container
   *
   * Uses modular utilities to:
   * 1. Build container with preset configuration
   * 2. Mount credentials and production paths
   * 3. Start container and wait for readiness
   * 4. Clone repository into workspace
   */
  async start(session: InteractiveSessionRecord): Promise<string> {
    const hostLogsDir = path.resolve(path.join(this.config.logsDirectory, session.id));
    fs.mkdirSync(hostLogsDir, { recursive: true });

    logger.info({
      category: 'system',
      action: 'starting_interactive_session',
      message: `Starting interactive session for ${session.ownerEmail}`,
      details: {
        sessionId: session.id,
        model: `${session.modelProvider}:${session.modelName}`,
      },
    });

    // Use preset builder for interactive session
    const builder = DevBotContainerPresets.interactiveSession(session.id, session.ownerEmail)
      .label('dev-bot.model.provider', session.modelProvider)
      .label('dev-bot.model.name', session.modelName)
      .workingDirectory('/workspace');

    // Launch the selected agent in interactive mode
    const agentCommand = this.getAgentCommand(session.modelProvider, session.modelName);
    builder.command(agentCommand);

    // Mount work-target specific log directories for troubleshooting
    // Interactive sessions default to 'dev-bots' work target
    const workTarget = 'dev-bots';
    const logPaths = getLogPaths(workTarget);
    builder.mountWorkTargetLogs(logPaths);

    if (logPaths.length > 0) {
      logger.info({
        category: 'system',
        action: 'work_target_logs_configured',
        message: `Configured ${logPaths.length} log mount(s) for interactive session`,
        details: { workTarget, sessionId: session.id },
      });
    }

    // Add logs directory
    builder.volume(hostLogsDir, '/app/logs', 'rw');

    // Mount production app if available (for debugging production)
    if (fs.existsSync(this.config.productionAppPath)) {
      builder.volume(this.config.productionAppPath, '/opt/app-monitor', 'ro');
      logger.info({
        category: 'system',
        action: 'production_mount_added',
        message: `Mounted production app from ${this.config.productionAppPath}`,
      });

      const productionLogsPath = path.join(this.config.productionAppPath, 'logs');
      if (fs.existsSync(productionLogsPath)) {
        builder.volume(productionLogsPath, '/app/prod-logs', 'ro');
      }
    }

    // Discover and mount credentials
    const { volumes: credentialVolumes, warnings } = this.credentialsManager.discoverCredentials();
    credentialVolumes.forEach(vol => {
      builder.volume(vol.hostPath, vol.containerPath, vol.mode);
    });

    if (warnings.length > 0) {
      warnings.forEach(warning => {
        logger.warn({
          category: 'system',
          action: 'credential_warning',
          message: warning,
        });
      });
    }

    // Add environment variables
    builder.envFromObject(this.buildEnv(session));
    builder.passthroughEnv(this.config.envPassthroughKeys);

    // Create and start container
    const container = await builder.create(this.docker);
    await this.lifecycle.start(container.id, 1000);

    // Wait for container to be healthy
    const isHealthy = await this.lifecycle.waitForHealthy(container.id, 10000);
    if (!isHealthy) {
      logger.error({
        category: 'system',
        action: 'container_unhealthy',
        message: `Container ${container.id} did not become healthy`,
      });
      await this.lifecycle.stopAndRemove(container.id);
      throw new Error('Container failed to start properly');
    }

    // Clone repository into workspace (CRITICAL FIX: This was missing!)
    const branch = process.env.INTERACTIVE_REPO_BRANCH || 'staging';
    try {
      await this.workspaceManager.cloneRepository(container.id, branch);

      logger.info({
        category: 'system',
        action: 'interactive_session_ready',
        message: `Interactive session ${session.id} is ready`,
        details: {
          containerId: container.id,
          branch,
        },
      });
    } catch (error) {
      logger.error({
        category: 'system',
        action: 'workspace_clone_failed',
        message: 'Failed to clone repository into container',
        error,
      });
      await this.lifecycle.stopAndRemove(container.id);
      throw new Error('Failed to setup workspace in container');
    }

    return container.id;
  }

  /**
   * Stop an interactive session container
   */
  async stop(containerId: string): Promise<void> {
    await this.lifecycle.stopAndRemove(containerId, 5);
  }

  /**
   * Get the command to launch the selected agent
   */
  private getAgentCommand(provider: string, modelName: string): string[] {
    switch (provider.toLowerCase()) {
      case 'claude':
        return [
          'claude',
          '--dangerously-skip-permissions'
        ];
      
      case 'codex':
        return [
          'codex',
          '--dangerously-skip-permissions'
        ];
      
      case 'gemini':
        return [
          'gemini',
          '--dangerously-skip-permissions'
        ];
      
      default:
        logger.warn({
          category: 'system',
          action: 'unknown_agent_provider',
          message: `Unknown agent provider '${provider}', defaulting to codex`,
          details: { provider, modelName }
        });
        return [
          'codex',
          '--dangerously-skip-permissions'
        ];
    }
  }

  /**
   * Build environment variables for interactive session
   */
  private buildEnv(session: InteractiveSessionRecord): Record<string, string> {
    const env: Record<string, string> = {
      DEV_BOT_SESSION_ID: session.id,
      DEV_BOT_OWNER_EMAIL: session.ownerEmail,
      DEV_BOT_MODEL_PROVIDER: session.modelProvider,
      DEV_BOT_MODEL_NAME: session.modelName,
      DEV_BOT_MODE: 'interactive',
      HOME: '/home/node',
      USER: 'node',
      SHELL: '/bin/bash',
    };

    // Production-specific environment
    if (this.config.productionAppPath) {
      env.PRODUCTION_APP_ROOT = this.config.productionAppPath;
      env.PRODUCTION_LOGS_PATH = '/app/prod-logs';
    }

    if (this.config.productionApiBaseUrl) {
      env.PRODUCTION_API_BASE_URL = this.config.productionApiBaseUrl;
    }

    const productionApiToken =
      process.env.INTERACTIVE_PROD_API_TOKEN ??
      process.env.PRODUCTION_API_TOKEN ??
      process.env.PRODUCTION_API_KEY;
    if (productionApiToken) {
      env.PRODUCTION_API_TOKEN = productionApiToken;
    }

    return env;
  }
}
