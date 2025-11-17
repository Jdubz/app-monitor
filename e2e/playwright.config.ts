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
  timeout: 60000, // 60 second default timeout per test (increased for parallel execution)
  expect: {
    timeout: 15000, // 15 seconds for expect assertions (increased for UI visibility checks)
  },
  reporter: [
    ['html', { open: 'never' }], // Generate HTML report but never auto-open
    ['list'],
    ['junit', { outputFile: 'results/junit.xml' }]
  ],

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000, // 15 seconds for individual actions (increased for parallel load)
    navigationTimeout: 20000, // 20 seconds for page navigations (increased for parallel load)
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
      use: { 
        ...devices['Desktop Chrome'],
        headless: true, // Explicitly enforce headless mode - ALWAYS run headless
        channel: 'chrome', // Use Chrome specifically
        launchOptions: {
          // Force headless mode at launch level - cannot be overridden by CLI
          headless: true,
        },
      },
    },
  ],
});
