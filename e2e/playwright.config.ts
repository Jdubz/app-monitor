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
  fullyParallel: true, // Enable parallel test execution for speed
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4, // Use 4 parallel workers locally, 2 in CI
  timeout: 30000, // 30 second default timeout per test
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
    actionTimeout: 10000, // 10 seconds for individual actions
    navigationTimeout: 15000, // 15 seconds for page navigations
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
