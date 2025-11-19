/**
 * Test Utilities
 *
 * Helper functions for context system tests that work in CI environments
 * without requiring external dependencies.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { vi } from 'vitest';

/**
 * Create a temporary directory for testing
 * Returns the path to the temp directory
 */
export async function createTempDir(prefix = 'context-test-'): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return tempDir;
}

/**
 * Create a temporary file with content
 * Returns the file path
 */
export async function createTempFile(content: string, filename = 'test.txt', dir?: string): Promise<string> {
  const tempDir = dir || await createTempDir();
  const filePath = path.join(tempDir, filename);

  // Ensure parent directory exists
  const parentDir = path.dirname(filePath);
  await fs.mkdir(parentDir, { recursive: true });

  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Recursively remove a directory and all its contents
 */
export async function removeDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (_error) {
    // Ignore errors (directory might not exist)
  }
}

/**
 * Create a mock file system structure in a temp directory
 * Returns the root path
 */
export async function createMockFileSystem(structure: Record<string, string>): Promise<string> {
  const root = await createTempDir('mock-fs-');

  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(root, filePath);
    const dir = path.dirname(fullPath);

    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  return root;
}

/**
 * Mock git command for testing
 * Returns a function to restore original behavior
 */
export function mockGitCommand(commitHash: string = 'abc123def456'): () => void {
  const originalExecSync = execSync;

  const mockExecSync = vi.fn((command: string) => {
    if (command === 'git rev-parse HEAD') {
      return commitHash;
    }
    return originalExecSync(command);
  });

  // Note: This modifies the module's exported function for testing
  (global as unknown as { execSync: typeof mockExecSync }).execSync = mockExecSync;

  return () => {
    (global as unknown as { execSync: typeof originalExecSync }).execSync = originalExecSync;
  };
}

/**
 * Wait for a condition to be true
 * Useful for testing async operations
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a spy on console methods that can be restored
 */
export function spyOnConsole() {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];

  console.log = vi.fn((...args) => logs.push(args.join(' ')));
  console.warn = vi.fn((...args) => warns.push(args.join(' ')));
  console.error = vi.fn((...args) => errors.push(args.join(' ')));

  return {
    logs,
    warns,
    errors,
    restore: () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
  };
}

/**
 * Assert that a function throws an error with a specific message
 */
export async function assertThrows(
  fn: () => void | Promise<void>,
  expectedMessage?: string | RegExp
): Promise<void> {
  let error: Error | undefined;

  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }

  if (!error) {
    throw new Error('Expected function to throw an error, but it did not');
  }

  if (expectedMessage) {
    if (typeof expectedMessage === 'string') {
      if (!error.message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to include "${expectedMessage}", but got: "${error.message}"`
        );
      }
    } else {
      if (!expectedMessage.test(error.message)) {
        throw new Error(
          `Expected error message to match ${expectedMessage}, but got: "${error.message}"`
        );
      }
    }
  }
}

/**
 * Generate a random string
 */
export function randomString(length = 10): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * Generate a mock git commit hash
 */
export function mockGitHash(): string {
  return Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}
