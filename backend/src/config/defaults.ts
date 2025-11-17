/**
 * Default Configuration Values
 *
 * Centralized default configuration for services to improve maintainability
 * and make defaults easily discoverable and modifiable.
 */

import type { EphemeralWorkerServiceConfig } from '../services/ephemeralWorker.service.js';

/**
 * Default configuration for EphemeralWorkerService
 */
export const DEFAULT_EPHEMERAL_WORKER_CONFIG: EphemeralWorkerServiceConfig = {
  maxConcurrentWorkers: 2,
  dockerImage: 'dev-bot:latest',
  logsDirectory: './data/logs',
  envPassthroughKeys: [
    'ANTHROPIC_API_KEY',
    'CLAUDE_API_KEY',
    'OPENAI_API_KEY',
    'GITHUB_TOKEN',
    'GIT_AUTHOR_NAME',
    'GIT_AUTHOR_EMAIL',
    'GIT_COMMITTER_NAME',
    'GIT_COMMITTER_EMAIL'
  ]
};
