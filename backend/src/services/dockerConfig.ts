/**
 * Centralized Docker Configuration
 * Consolidates Docker container configurations that were previously
 * duplicated across ephemeralWorker.service.ts, taskExecution.service.ts,
 * and interactiveSessionOrchestrator.ts
 */

import os from 'os';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Git environment variable keys that should be passed to containers
 */
export const GIT_ENV_KEYS = [
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'GITHUB_TOKEN'
] as const;

/**
 * Build git environment variables array for Docker
 */
export function buildGitEnvVars(): string[] {
  const gitEnvVars: string[] = [];
  const providedKeys: string[] = [];

  for (const key of GIT_ENV_KEYS) {
    const value = process.env[key];
    if (value) {
      gitEnvVars.push('-e', `${key}=${value}`);
      providedKeys.push(key);
    }
  }

  logger.debug({
    category: 'docker',
    action: 'git_env_vars_prepared',
    message: `Prepared ${providedKeys.length} git environment variables`,
    details: { providedKeys }
  });

  return gitEnvVars;
}

/**
 * Get paths for Claude credentials
 */
export function getClaudeCredentialsPaths(): { exists: boolean; path: string } {
  const homeDir = os.homedir();
  const newPath = path.join(homeDir, '.claude', '.credentials.json');
  const oldPath = path.join(homeDir, '.claude', 'credentials.json');

  const fs = require('fs');

  if (fs.existsSync(newPath)) {
    return { exists: true, path: newPath };
  } else if (fs.existsSync(oldPath)) {
    return { exists: true, path: oldPath };
  }

  return { exists: false, path: newPath };
}

/**
 * Get path for Codex credentials
 */
export function getCodexCredentialsPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.codex');
}

/**
 * Common Docker volume mounts for git credentials
 */
export function getGitCredentialMounts(): string[] {
  const homeDir = os.homedir();

  return [
    '-v', `${homeDir}/.gitconfig:/home/node/.gitconfig:ro`,
    '-v', `${homeDir}/.git-credentials:/home/node/.git-credentials:ro`,
    '-v', `${homeDir}/.config/gh:/home/node/.config/gh:ro`
  ];
}

/**
 * Common Docker resource limits
 */
export interface DockerResourceLimits {
  memory?: string;
  cpus?: string;
  pidsLimit?: number;
}

/**
 * Get standard resource limits
 */
export function getStandardResourceLimits(): DockerResourceLimits {
  return {
    memory: '2g',      // 2GB memory limit
    cpus: '2.0',       // 2 CPU cores
    pidsLimit: 1024    // Max processes
  };
}

/**
 * Build resource limit arguments for Docker
 */
export function buildResourceLimitArgs(limits: DockerResourceLimits = {}): string[] {
  const args: string[] = [];
  const standardLimits = getStandardResourceLimits();

  const memory = limits.memory ?? standardLimits.memory;
  const cpus = limits.cpus ?? standardLimits.cpus;
  const pidsLimit = limits.pidsLimit ?? standardLimits.pidsLimit;

  if (memory) {
    args.push('--memory', memory);
  }
  if (cpus) {
    args.push('--cpus', cpus);
  }
  if (pidsLimit) {
    args.push('--pids-limit', pidsLimit.toString());
  }

  return args;
}

/**
 * Repository clone script for container initialization
 */
export function getRepoCloneScript(baseBranch: string, repoUrl: string = 'https://github.com/Jdubz/app-monitor.git'): string {
  return `
    set -e
    mkdir -p /workspace
    cd /workspace
    git clone ${repoUrl} .
    git config --global user.name "DevBot"
    git config --global user.email "devbot@local"
    git fetch --all

    # Checkout the appropriate branch
    if [ "${baseBranch}" != "main" ] && [ "${baseBranch}" != "staging" ]; then
      # For PR branches, checkout from origin
      git checkout -b ${baseBranch} origin/${baseBranch} || git checkout ${baseBranch}
    else
      git checkout ${baseBranch}
    fi

    git pull origin ${baseBranch} || true
    chown -R worker:worker /workspace
    echo "Repository setup complete on branch ${baseBranch}"
  `.trim();
}

/**
 * Standard container labels
 */
export function getStandardLabels(workerId: string, taskId?: string): Record<string, string> {
  const labels: Record<string, string> = {
    'app': 'dev-monitor',
    'component': 'dev-bot',
    'worker-id': workerId,
    'managed-by': 'devBotsManager'
  };

  if (taskId) {
    labels['task-id'] = taskId;
  }

  return labels;
}
