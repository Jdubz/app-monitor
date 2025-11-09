/**
 * Shared Vitest Configuration
 *
 * DRY configuration for test parallelism settings.
 * Used by both backend and frontend test configs.
 */

/**
 * Get thread pool configuration based on environment
 * @param {number} [maxThreads] - Override default max threads
 * @returns {object} Pool configuration for vitest
 */
export function getThreadPoolConfig(maxThreads = 8) {
  return {
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads,
        minThreads: 1,
      },
    },
    fileParallelism: true,
    maxConcurrency: maxThreads,
  };
}

/**
 * Get safe test runner thread count based on environment
 * @returns {string} Number of threads to use
 */
export function getMaxThreads() {
  return process.env.CI ? '8' : '4';
}

/**
 * Standard test timeouts
 */
export const TEST_TIMEOUTS = {
  unit: {
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  integration: {
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  longRunning: {
    testTimeout: 60000,
    hookTimeout: 60000,
  },
};
