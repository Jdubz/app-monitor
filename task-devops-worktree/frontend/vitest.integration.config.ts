import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Integration Tests Configuration - app-monitor-frontend
 * 
 * Configuration for integration tests that test component interactions
 * and API integrations with more realistic scenarios.
 */

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
  },
  test: {
    // Single process execution for integration tests
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,
        minForks: 1,
      },
    },
    
    // No file parallelism for integration tests
    fileParallelism: false,
    
    // Longer timeouts for integration tests
    testTimeout: 60000,
    hookTimeout: 60000,
    
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
      'src/services/api.integration.test.ts',
      'src/components/ServiceCard.integration.test.tsx',
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