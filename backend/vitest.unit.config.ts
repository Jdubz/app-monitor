import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Unit Tests Only Configuration - dev-monitor-backend
 * 
 * Excludes integration tests to allow faster, more reliable pushes.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

export default defineConfig({
  test: {
    // Use single threaded pool with isolation off to keep native handles in one process
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 1,
        minThreads: 1,
        isolate: false,
      },
    },

    // No file parallelism - run tests sequentially
    fileParallelism: false,

    // Standard timeouts
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Environment setup
    environment: 'node',
    env: {
      NODE_ENV: 'test',
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
    
    // Test file patterns - UNIT TESTS ONLY
    include: [
      'src/**/*.{test,spec}.{js,ts}',
    ],
    exclude: [
      'node_modules',
      'dist',
      '**/node_modules/**',
      '**/dist/**',
      'tests/integration/**',  // EXCLUDE integration tests
      '**/*.integration.test.ts', // EXCLUDE integration tests in src
      '**/*.integration.spec.ts', // EXCLUDE integration specs in src
    ],
  },
});
