import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { getThreadPoolConfig, TEST_TIMEOUTS } from './vitest.shared.config.js';

/**
 * Integration Tests Configuration - app-monitor-frontend
 *
 * Configuration for integration tests that test component interactions
 * and API integrations with more realistic scenarios.
 *
 * OPTIMIZED: Uses thread pool with parallelization for faster execution.
 */

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
    'BUILD_TIMESTAMP_VALUE': JSON.stringify(new Date().toISOString()),
  },
  test: {
    // Parallel execution with thread pool (much faster than forks)
    ...getThreadPoolConfig(4),

    // Integration test timeouts (reduced from 60s since we have explicit waitFor timeouts)
    ...TEST_TIMEOUTS.integration,
    
    // Environment setup
    environment: 'jsdom',
    globals: true,
    
    // Environment variables for tests
    env: {
      NODE_ENV: 'test',
      VITE_API_BASE_URL: 'http://localhost:5000',
    },
    
    // Test file patterns - INTEGRATION TESTS ONLY
    include: [
      // All integration test files
      '**/*.integration.test.{ts,tsx}',
    ],
    exclude: [
      'node_modules',
      'dist',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.{git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
    
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
        '**/__tests__/**',
        '**/coverage/**',
      ],
    },
    
    // Global setup
    setupFiles: ['./src/test/setup.ts'],
  },
});