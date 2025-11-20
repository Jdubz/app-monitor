import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';
import { getThreadPoolConfig, TEST_TIMEOUTS } from './vitest.shared.config.js';

/**
 * Safe Vitest Configuration - dev-monitor-backend
 *
 * Prevents test explosions through strict file inclusion and process limits.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const skipHeavyBots = process.env.SKIP_HEAVY_DEV_BOT_TESTS === '1';
const useForkPool = process.env.VITEST_FORCE_FORKS === '1' || process.env.CI === 'true';
const defaultThreadCap = Number(process.env.VITEST_MAX_THREADS ?? 8) || 8;
const forkPoolCap = Math.max(
  1,
  Number(process.env.VITEST_MAX_FORKS ?? process.env.VITEST_MAX_THREADS ?? 4) || 4
);

const poolConfig = useForkPool
  ? {
      pool: 'forks',
      poolOptions: {
        forks: {
          maxForks: forkPoolCap,
          minForks: 1,
        },
      },
      fileParallelism: true,
      maxConcurrency: forkPoolCap,
    }
  : getThreadPoolConfig(defaultThreadCap);

const heavyBotPatterns = [
  'src/routes/dev-bots.routes.test.ts',
  'src/routes/__tests__/api-contracts.integration.test.ts',
  'src/services/devBotsManager*.test.ts',
  'src/services/devBotsManager.test.ts',
  'src/services/devBotsManager.core.test.ts',
  'src/services/devBotsManager.retry.test.ts',
  'src/services/devBotsManager.simple.test.ts',
  'src/services/devBotsManager.workerLimit.test.ts',
  'src/services/devBotsManager.*.test.ts',
  'src/services/devBotsManager.integration.test.ts',
  'src/services/database.test.ts',
  'src/services/processManager.retry.test.ts',
  'src/services/processManager.simple.test.ts',
  'src/services/processManager.workerLimit.test.ts',
  'src/services/tokenTracking.test.ts',
  'src/services/taskQueueManager.test.ts',
  'src/services/githubWebhookHandler.service.test.ts',
  'tests/integration/docker-operations.test.ts',
  'tests/integration/socket-events.test.ts',
  'tests/integration/api/api.routes.test.ts',
  'tests/integration/bug-report-workflow.test.ts',
];

export default defineConfig({
  test: {
    // Shared parallelism configuration
    ...poolConfig,

    // Integration test timeouts
    ...TEST_TIMEOUTS.integration,

    // Environment setup
    environment: 'node',

    // Cache configuration - disable in CI to prevent deserialization errors
    cache: process.env.CI ? false : {
      dir: 'node_modules/.vitest',
    },

    // Set NODE_ENV to test to disable auth
    // Set DATABASE_PATH to :memory: to ensure all tests use in-memory database
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      REPO_ROOT: process.env.REPO_ROOT || repoRoot,
    },
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.config.ts',
        'scripts/**',
      ],
    },
    
    // Global setup
    setupFiles: [],
    
    // Test file patterns
    include: [
      'src/**/*.{test,spec}.{js,ts}',
      'tests/**/*.{test,spec}.{js,ts}',
    ],
    exclude: [
      'node_modules',
      'dist',
      '**/node_modules/**',
      '**/dist/**',
      '**/app-monitor/**',
      ...(skipHeavyBots ? heavyBotPatterns : []),
    ],
  },
});
