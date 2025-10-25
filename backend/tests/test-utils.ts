/**
 * Test Utilities for Integration Tests
 * 
 * Common helpers and utilities for integration testing
 */

import { EventEmitter } from 'events';

/**
 * Wait for a condition to become true with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    message?: string;
  } = {}
): Promise<void> {
  const {
    timeout = 5000,
    interval = 100,
    message = 'Condition not met within timeout',
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await Promise.resolve(condition());
    if (result) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(message);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    backoff?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    retries = 3,
    delay = 1000,
    backoff = 2,
    onRetry,
  } = options;

  let lastError: Error;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < retries) {
        if (onRetry) {
          onRetry(lastError, attempt);
        }
        await sleep(currentDelay);
        currentDelay *= backoff;
      }
    }
  }

  throw lastError!;
}

/**
 * Create a mock event emitter for testing
 */
export function createMockEmitter(): EventEmitter & {
  getEvents: () => Array<{ event: string; args: any[] }>;
  clearEvents: () => void;
} {
  const emitter = new EventEmitter();
  const events: Array<{ event: string; args: any[] }> = [];

  const originalEmit = emitter.emit.bind(emitter);
  emitter.emit = (event: string | symbol, ...args: any[]) => {
    events.push({ event: event.toString(), args });
    return originalEmit(event, ...args);
  };

  return Object.assign(emitter, {
    getEvents: () => events,
    clearEvents: () => {
      events.length = 0;
    },
  });
}

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  const net = await import('net');
  
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', () => {
      resolve(false);
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port);
  });
}

/**
 * Find an available port in a range
 */
export async function findAvailablePort(
  startPort: number = 3000,
  endPort: number = 4000
): Promise<number> {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  
  throw new Error(`No available ports found between ${startPort} and ${endPort}`);
}

/**
 * Create a temporary test directory
 */
export async function createTempDir(prefix: string = 'test-'): Promise<string> {
  const { mkdtemp } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Clean up temporary directory
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  const { rm } = await import('fs/promises');
  
  try {
    await rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Capture console output
 */
export function captureConsole(): {
  logs: string[];
  warnings: string[];
  errors: string[];
  restore: () => void;
} {
  const logs: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: any[]) => {
    logs.push(args.map(String).join(' '));
  };

  console.warn = (...args: any[]) => {
    warnings.push(args.map(String).join(' '));
  };

  console.error = (...args: any[]) => {
    errors.push(args.map(String).join(' '));
  };

  return {
    logs,
    warnings,
    errors,
    restore: () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    },
  };
}

/**
 * Mock fetch for HTTP testing
 */
export function mockFetch(responses: Map<string, any>) {
  const originalFetch = global.fetch;
  
  global.fetch = async (url: string | Request, init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url.url;
    const response = responses.get(urlString);
    
    if (!response) {
      throw new Error(`No mock response for ${urlString}`);
    }
    
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      statusText: response.statusText ?? 'OK',
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
      headers: new Headers(response.headers ?? {}),
    } as Response;
  };
  
  return {
    restore: () => {
      global.fetch = originalFetch;
    },
  };
}

/**
 * Generate unique test ID
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Assert that a promise rejects with specific error
 */
export async function expectToReject(
  fn: () => Promise<any>,
  errorMatcher?: string | RegExp | ((error: Error) => boolean)
): Promise<void> {
  try {
    await fn();
    throw new Error('Expected promise to reject but it resolved');
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected promise to reject but it resolved') {
      throw error;
    }
    
    if (errorMatcher) {
      if (typeof errorMatcher === 'string') {
        if (!(error as Error).message.includes(errorMatcher)) {
          throw new Error(
            `Expected error message to include "${errorMatcher}" but got "${(error as Error).message}"`
          );
        }
      } else if (errorMatcher instanceof RegExp) {
        if (!errorMatcher.test((error as Error).message)) {
          throw new Error(
            `Expected error message to match ${errorMatcher} but got "${(error as Error).message}"`
          );
        }
      } else if (typeof errorMatcher === 'function') {
        if (!errorMatcher(error as Error)) {
          throw new Error('Error did not match custom matcher');
        }
      }
    }
  }
}

/**
 * Time an async operation
 */
export async function timeOperation<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  
  return { result, duration };
}

/**
 * Create a deferred promise that can be resolved/rejected externally
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  
  return { promise, resolve, reject };
}

/**
 * Run multiple promises with a concurrency limit
 */
export async function pLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];
  
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task()).then(
      result => {
        results.push(result);
      }
    );
    
    executing.push(p);
    
    if (executing.length >= limit) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === p), 1);
    }
  }
  
  await Promise.all(executing);
  
  return results;
}
