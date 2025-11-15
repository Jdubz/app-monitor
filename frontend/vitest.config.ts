import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Safe Vitest Configuration - app-monitor-frontend
 * 
 * Prevents test explosions through strict file inclusion and process limits.
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
    environment: 'jsdom',
    globals: true,
    
    // Environment variables for tests
    env: {
      NODE_ENV: 'test',
    },
    
    // Test file patterns
    include: ['src/**/*.{test,spec}.{js,ts,tsx}'],
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
