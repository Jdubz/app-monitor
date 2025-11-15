#!/usr/bin/env node

/**
 * E2E Auth Test - Debug API Key Authentication
 * 
 * ⚠️  DEV-ONLY TEST - NEVER RUNS AGAINST PRODUCTION
 * 
 * This script:
 * 1. Spins up backend with test database on isolated ports
 * 2. Spins up frontend dev server on isolated port
 * 3. Tests each tab for auth errors
 * 4. Cleans up all test services
 * 
 * Explicitly checks environment and refuses to run if pointed at production.
 * NOT run in CI - manual debugging tool only.
 */

import { spawn } from 'child_process';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test ports to avoid conflicts
const TEST_BACKEND_PORT = 5555;
const TEST_FRONTEND_PORT = 5556;
const TEST_DB_PATH = path.join(__dirname, 'test-e2e-auth.db');

class E2EAuthTest {
  constructor() {
    this.processes = [];
    this.browser = null;
    this.backendReady = false;
    this.frontendReady = false;
  }

  async run() {
    console.log('🚀 Starting E2E Auth Test (DEV ONLY)\n');
    
    // Safety check: Ensure we're in development directory
    const cwd = process.cwd();
    if (cwd.includes('/opt/app-monitor')) {
      console.error('❌ SAFETY CHECK FAILED: Cannot run E2E tests from production directory!');
      console.error('   Current directory:', cwd);
      console.error('   This test must be run from /home/jdubz/Development/app-monitor');
      process.exit(1);
    }
    
    // Safety check: Verify we're not running on production ports
    if (TEST_BACKEND_PORT === 5001 || TEST_BACKEND_PORT === 5002 || TEST_FRONTEND_PORT === 80) {
      console.error('❌ SAFETY CHECK FAILED: Test ports conflict with production!');
      console.error('   Backend port:', TEST_BACKEND_PORT);
      console.error('   Frontend port:', TEST_FRONTEND_PORT);
      process.exit(1);
    }
    
    console.log('✓ Safety checks passed');
    console.log('  Working directory:', cwd);
    console.log('  Backend port:', TEST_BACKEND_PORT);
    console.log('  Frontend port:', TEST_FRONTEND_PORT);
    console.log('  Test database:', TEST_DB_PATH);
    console.log('');
    
    try {
      await this.cleanup();
      await this.startBackend();
      await this.startFrontend();
      await this.runTests();
      
      console.log('\n✅ All tests completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      console.error(error);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  async startBackend() {
    console.log('📦 Starting backend on port', TEST_BACKEND_PORT);
    
    return new Promise((resolve, reject) => {
      const backend = spawn('node', ['dist/index.js'], {
        cwd: path.join(__dirname, 'backend'),
        env: {
          ...process.env,
          PORT: TEST_BACKEND_PORT.toString(),
          NODE_ENV: 'test',
          DATABASE_PATH: TEST_DB_PATH,
          API_KEY: 'test-e2e-key-12345',
          REQUIRE_AUTH: 'true',
          CORS_ORIGIN: `http://localhost:${TEST_FRONTEND_PORT}`,
        },
        stdio: 'pipe',
      });

      this.processes.push(backend);

      backend.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[Backend] ${output.trim()}`);
        
        if (output.includes('Dev Monitor Backend running') || output.includes('Socket.IO ready')) {
          this.backendReady = true;
          console.log('✓ Backend ready\n');
          resolve();
        }
      });

      backend.stderr.on('data', (data) => {
        console.error(`[Backend Error] ${data.toString().trim()}`);
      });

      backend.on('exit', (code) => {
        if (!this.backendReady && code !== 0) {
          reject(new Error(`Backend exited with code ${code}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!this.backendReady) {
          reject(new Error('Backend failed to start within 30 seconds'));
        }
      }, 30000);
    });
  }

  async startFrontend() {
    console.log('🎨 Starting frontend on port', TEST_FRONTEND_PORT);
    
    return new Promise((resolve, reject) => {
      const frontend = spawn('npx', ['vite', '--port', TEST_FRONTEND_PORT.toString(), '--strictPort'], {
        cwd: path.join(__dirname, 'frontend'),
        env: {
          ...process.env,
          VITE_BACKEND_URL: `http://localhost:${TEST_BACKEND_PORT}`,
          VITE_API_BASE_URL: `http://localhost:${TEST_BACKEND_PORT}`,
          VITE_API_KEY: 'test-e2e-key-12345',
          VITE_PASSWORD: 'test-password',
        },
        stdio: 'pipe',
      });

      this.processes.push(frontend);

      frontend.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[Frontend] ${output.trim()}`);
        
        if (output.includes('Local:') || output.includes('ready in')) {
          this.frontendReady = true;
          console.log('✓ Frontend ready\n');
          setTimeout(resolve, 2000); // Give it 2 more seconds to fully initialize
        }
      });

      frontend.stderr.on('data', (data) => {
        const output = data.toString();
        // Vite sometimes logs to stderr, filter out warnings
        if (!output.includes('DeprecationWarning')) {
          console.error(`[Frontend Error] ${output.trim()}`);
        }
      });

      frontend.on('exit', (code) => {
        if (!this.frontendReady && code !== 0) {
          reject(new Error(`Frontend exited with code ${code}`));
        }
      });

      // Timeout after 45 seconds
      setTimeout(() => {
        if (!this.frontendReady) {
          reject(new Error('Frontend failed to start within 45 seconds'));
        }
      }, 45000);
    });
  }

  async runTests() {
    console.log('🧪 Running browser tests\n');
    
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext();
    const page = await context.newPage();

    // Collect console errors
    const consoleErrors = [];
    const networkErrors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log(`[Browser Console Error] ${msg.text()}`);
      }
    });

    page.on('requestfailed', request => {
      networkErrors.push({
        url: request.url(),
        failure: request.failure()?.errorText,
      });
      console.log(`[Network Error] ${request.url()} - ${request.failure()?.errorText}`);
    });

    page.on('response', async response => {
      if (response.status() === 401) {
        const url = response.url();
        const headers = await response.allHeaders();
        console.log(`[401 Unauthorized] ${url}`);
        console.log(`  Request headers:`, headers);
      }
    });

    try {
      // Navigate to app
      console.log(`Navigating to http://localhost:${TEST_FRONTEND_PORT}`);
      await page.goto(`http://localhost:${TEST_FRONTEND_PORT}`, { 
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Check for password page
      const passwordInput = await page.$('input[type="password"]');
      if (passwordInput) {
        console.log('Password page detected, logging in...');
        await passwordInput.fill('test-password');
        await page.click('button[type="submit"]');
        await page.waitForTimeout(1000);
      }

      // Test each tab
      const tabs = [
        { name: 'Tasks', selector: 'button:has-text("Tasks")' },
        { name: 'Logs', selector: 'button:has-text("Logs")' },
        { name: 'Metrics', selector: 'button:has-text("Metrics")' },
        { name: 'Workers', selector: 'button:has-text("Workers")' },
      ];

      for (const tab of tabs) {
        console.log(`\n📑 Testing ${tab.name} tab...`);
        
        const tabButton = await page.$(tab.selector);
        if (!tabButton) {
          console.log(`  ⚠️  Tab button not found: ${tab.name}`);
          continue;
        }

        await tabButton.click();
        await page.waitForTimeout(2000); // Wait for API calls

        // Check for auth errors in the page
        const authErrorText = await page.textContent('body');
        if (authErrorText.includes('401') || 
            authErrorText.includes('Unauthorized') || 
            authErrorText.includes('API key required')) {
          console.log(`  ❌ Auth error detected in ${tab.name} tab`);
        } else {
          console.log(`  ✓ ${tab.name} tab loaded without auth errors`);
        }
      }

      // Summary
      console.log('\n📊 Test Summary:');
      console.log(`Console Errors: ${consoleErrors.length}`);
      console.log(`Network Errors: ${networkErrors.length}`);
      console.log(`401 Errors: ${networkErrors.filter(e => e.url.includes('401')).length}`);

      if (consoleErrors.length > 0) {
        console.log('\n🔍 Console Errors:');
        consoleErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
      }

      if (networkErrors.length > 0) {
        console.log('\n🔍 Network Errors:');
        networkErrors.forEach((err, i) => {
          console.log(`  ${i + 1}. ${err.url}`);
          console.log(`     ${err.failure}`);
        });
      }

      // Keep browser open for 5 seconds to inspect
      console.log('\n⏳ Keeping browser open for 5 seconds for inspection...');
      await page.waitForTimeout(5000);

    } finally {
      await context.close();
      await this.browser.close();
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');

    // Close browser
    if (this.browser) {
      await this.browser.close();
    }

    // Kill all processes
    for (const proc of this.processes) {
      if (!proc.killed) {
        proc.kill('SIGTERM');
        
        // Force kill after 2 seconds
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 2000);
      }
    }

    this.processes = [];

    // Remove test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
      console.log('Removed test database');
    }

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Cleanup complete\n');
  }
}

// Run the test
const test = new E2EAuthTest();
test.run().catch(console.error);
