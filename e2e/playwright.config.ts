import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 * Tests run against LOCAL development environment only
 *
 * Backend: http://localhost:3002
 * Frontend: http://localhost:5174
 *
 * NEVER runs against production!
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run tests serially to avoid conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid port conflicts
  reporter: [
    ['html'],
    ['list'],
    ['junit', { outputFile: 'results/junit.xml' }]
  ],

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Test environment setup
  webServer: [
    {
      command: 'PORT=3002 DATABASE_PATH=:memory: API_KEY=test-e2e-api-key-not-for-production REQUIRE_AUTH=true NODE_ENV=test node backend/dist/index.js',
      cwd: '../',
      port: 3002,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run e2e:frontend',
      port: 5174,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_BASE_URL: 'http://localhost:3002',
        VITE_API_KEY: 'test-e2e-api-key-not-for-production',
        VITE_PASSWORD: 'e2e-test-password',
      }
    }
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
