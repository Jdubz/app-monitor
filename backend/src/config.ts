import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from shared .env file
// Production: /opt/app-monitor/shared/.env
// Development: <repo-root>/shared/.env
const sharedEnvPath = path.join(__dirname, '../../shared/.env');
dotenv.config({ path: sharedEnvPath });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5174',
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '../data/app-monitor.db'),
  workerLogStreamsConfig: path.join(__dirname, '../config/worker-log-streams.json'),
  
  // Simple API Key Authentication
  apiKey: process.env.API_KEY || 'dev-key-change-in-production',
  requireAuth: process.env.REQUIRE_AUTH !== 'false' && process.env.NODE_ENV === 'production', // Only require in production

  // GitHub Webhook Secret for HMAC signature verification
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',

  // Dev-bot worker configuration
  devBots: {
    // Maximum concurrent dev-bot workers (implementation chains)
    maxWorkers: parseInt(process.env.MAX_DEV_BOTS || '3', 10),
    // Repository URL for task execution
    repositoryUrl: process.env.REPOSITORY_URL || 'https://github.com/Jdubz/app-monitor.git',
  },

  // Automatic Failure Recovery - ALWAYS ENABLED IN PRODUCTION
  recovery: {
    // Recovery is always enabled by default - can be disabled for debugging
    enabled: process.env.ENABLE_AUTO_RECOVERY !== 'false',  // Default true, can be disabled

    // Dry run mode disabled by default - can be enabled for testing
    dryRun: process.env.RECOVERY_DRY_RUN === 'true',  // Default false, can be enabled for testing

    // Maximum concurrent repair bots (cleanup + followup) to prevent resource exhaustion
    maxConcurrentRepairBots: parseInt(process.env.MAX_CONCURRENT_REPAIR_BOTS || '1', 10),

    // Timeout for cleanup and followup bots (in milliseconds)
    cleanupTimeoutMs: parseInt(process.env.RECOVERY_CLEANUP_TIMEOUT_MS || '600000', 10),  // 10 minutes
    followupTimeoutMs: parseInt(process.env.RECOVERY_FOLLOWUP_TIMEOUT_MS || '900000', 10), // 15 minutes
  },

  // PR Sync - Event-driven sync of PR state to detect stale data
  prSync: {
    // Enable PR sync (event-driven, triggered every N task completions)
    enabled: process.env.PR_SYNC_ENABLED !== 'false', // Default true
    // Number of task completions before triggering sync
    taskThreshold: parseInt(process.env.PR_SYNC_TASK_THRESHOLD || '10', 10), // Default 10
  },
};
