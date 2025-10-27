import { defineConfig } from 'vitest/config';

/**
 * Unit Tests Only Configuration - dev-monitor-backend
 * 
 * Excludes integration tests to allow faster, more reliable pushes.
 */

export default defineConfig({
  test: {
    // CRITICAL: Single process execution - NO parallelism
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,  // ONLY 1 process at a time
        minForks: 1,
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