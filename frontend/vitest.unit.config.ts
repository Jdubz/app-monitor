import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { getThreadPoolConfig, TEST_TIMEOUTS } from './vitest.shared.config.js';

/**
 * Unit Tests Only Configuration - app-monitor-frontend
 *
 * Excludes problematic integration tests to allow faster, more reliable pushes.
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
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,

    // Shared parallelism and timeout configuration
    ...getThreadPoolConfig(8),
    ...TEST_TIMEOUTS.unit,

    // Test file patterns - UNIT TESTS ONLY (exclude problematic ones)
    include: [
      'src/utils/**/*.{test,spec}.{js,ts,tsx}',
      'src/hooks/**/*.{test,spec}.{js,ts,tsx}',
      'src/components/**/*.test.{js,ts,tsx}',
      'src/services/**/*.test.{js,ts,tsx}',
    ],
    exclude: [
      'node_modules',
      'dist',
      '**/node_modules/**',
      '**/dist/**',
      'src/**/*.integration.test.{js,ts,tsx}',
    ],
  },
});
