import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

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
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    
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
    ],
  },
});
