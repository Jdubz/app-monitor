import { defineConfig } from 'vitest/config';

/**
 * Safe Vitest Configuration - dev-monitor-backend
 * 
 * Prevents test explosions through strict file inclusion and process limits.
 */

const skipHeavyBots = process.env.SKIP_HEAVY_DEV_BOT_TESTS === '1';

const heavyBotPatterns = [
  'src/routes/dev-bots.routes.test.ts',
  'src/services/devBotsManager*.test.ts',
  'src/services/devBotsManager.test.ts',
  'src/services/devBotsManager.core.test.ts',
  'src/services/devBotsManager.retry.test.ts',
  'src/services/devBotsManager.simple.test.ts',
  'src/services/devBotsManager.workerLimit.test.ts',
  'src/services/devBotsManager.*.test.ts',
  'src/services/devBotsManager.integration.test.ts',
  'src/services/database.test.ts',
  'src/services/processManager.core.test.ts',
  'src/services/processManager.retry.test.ts',
  'src/services/processManager.simple.test.ts',
  'src/services/processManager.workerLimit.test.ts',
  'src/services/tokenTracking.test.ts',
  'src/services/retryButton.test.ts',
  'src/services/taskQueueManager.test.ts',
  'tests/integration/docker-operations.test.ts',
  'tests/integration/socket-events.test.ts',
];

export default defineConfig({
  test: {
    // CRITICAL: Single process execution - NO parallelism
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 1,  // ONLY 1 worker at a time
        minThreads: 1,
      },
    },
    
    // CRITICAL: No file parallelism
    fileParallelism: false,
    
    // CRITICAL: No test parallelism
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Environment setup
    environment: 'node',
    
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
