/**
 * Task Failure Guards
 *
 * Automatic detection and cleanup of stuck/failed bot tasks based on common failure patterns.
 * Prevents resource leaks and ensures containers don't run indefinitely.
 */

import { logger } from '../utils/logger.js';

export interface FailurePattern {
  name: string;
  description: string;
  // Regex patterns to match against stderr/stdout
  patterns: RegExp[];
  // Exit codes that trigger this pattern (optional)
  exitCodes?: number[];
  // Whether this should immediately fail without retry
  immediateFailure: boolean;
  // Category of failure for metrics
  category: 'cli_incompatibility' | 'resource_not_found' | 'permission_denied' | 'timeout' | 'oom' | 'configuration_error' | 'system_error';
  // Suggested fix for this failure pattern
  suggestedFix?: string;
}

/**
 * Common failure patterns that indicate a task should be immediately failed and cleaned up
 */
export const FAILURE_GUARDS: FailurePattern[] = [
  // CLI Incompatibility Issues
  {
    name: 'Invalid CLI Argument',
    description: 'CLI was invoked with unsupported arguments',
    patterns: [
      /error: unexpected argument ['"]--[\w-]+['"] found/i,
      /unknown option: --[\w-]+/i,
      /invalid option: --[\w-]+/i,
      /unrecognized option ['"]--[\w-]+['"]/i
    ],
    exitCodes: [2, 1],
    immediateFailure: true,
    category: 'cli_incompatibility',
    suggestedFix: 'Check CLI documentation and update command arguments'
  },

  // Command Not Found
  {
    name: 'CLI Not Found',
    description: 'Required CLI tool is not installed in container',
    patterns: [
      /sh: \d+: (claude|codex): not found/i,
      /bash: (claude|codex): command not found/i,
      /command not found: (claude|codex)/i
    ],
    exitCodes: [127],
    immediateFailure: true,
    category: 'resource_not_found',
    suggestedFix: 'Rebuild Docker image with required CLI tools'
  },

  // Permission Denied
  {
    name: 'Permission Denied',
    description: 'Insufficient permissions to access required resources',
    patterns: [
      /permission denied/i,
      /EACCES: permission denied/i,
      /cannot access ['"].*['"]: Permission denied/i
    ],
    exitCodes: [126, 1],
    immediateFailure: true,
    category: 'permission_denied',
    suggestedFix: 'Check file/directory permissions and container user settings'
  },

  // Out of Memory
  {
    name: 'Out of Memory',
    description: 'Container or process ran out of memory',
    patterns: [
      /out of memory/i,
      /OOM killed/i,
      /Cannot allocate memory/i,
      /fatal: out of memory/i,
      /ENOMEM/i
    ],
    exitCodes: [137], // SIGKILL from OOM killer
    immediateFailure: true,
    category: 'oom',
    suggestedFix: 'Increase container memory limit or optimize task complexity'
  },

  // Timeout Issues
  {
    name: 'Operation Timeout',
    description: 'Operation timed out waiting for response',
    patterns: [
      /timeout/i,
      /timed out/i,
      /ETIMEDOUT/i,
      /operation timed out/i
    ],
    immediateFailure: false, // Allow retry for timeouts
    category: 'timeout',
    suggestedFix: 'Increase timeout threshold or check network connectivity'
  },

  // Authentication/Credentials Issues
  {
    name: 'Authentication Failed',
    description: 'Missing or invalid authentication credentials',
    patterns: [
      /authentication failed/i,
      /invalid credentials/i,
      /not authenticated/i,
      /API key.*invalid/i,
      /credentials.*not found/i,
      /please run.*login/i
    ],
    exitCodes: [1],
    immediateFailure: true,
    category: 'configuration_error',
    suggestedFix: 'Run CLI login command and ensure credentials are mounted correctly'
  },

  // File Not Found
  {
    name: 'Required File Not Found',
    description: 'Required file or directory does not exist',
    patterns: [
      /ENOENT: no such file or directory/i,
      /cannot find.*file/i,
      /No such file or directory/i
    ],
    exitCodes: [1, 2],
    immediateFailure: false, // May be transient
    category: 'resource_not_found',
    suggestedFix: 'Verify file paths and ensure workspace is mounted correctly'
  },

  // Disk Space Issues
  {
    name: 'No Space Left',
    description: 'Disk space exhausted',
    patterns: [
      /no space left on device/i,
      /ENOSPC/i,
      /disk.*full/i
    ],
    exitCodes: [1],
    immediateFailure: true,
    category: 'system_error',
    suggestedFix: 'Free up disk space or increase volume size'
  },

  // Container/Docker Issues
  {
    name: 'Container Configuration Error',
    description: 'Docker container configuration or runtime error',
    patterns: [
      /docker: Error response from daemon/i,
      /failed to create container/i,
      /container.*already in use/i,
      /network.*not found/i,
      /mount.*failed/i
    ],
    immediateFailure: true,
    category: 'system_error',
    suggestedFix: 'Check Docker daemon status and container configuration'
  },

  // Process Killed
  {
    name: 'Process Killed',
    description: 'Process was killed by signal',
    patterns: [
      /killed/i,
      /signal: killed/i
    ],
    exitCodes: [137, 143], // SIGKILL, SIGTERM
    immediateFailure: true,
    category: 'system_error',
    suggestedFix: 'Check system logs for OOM or manual termination'
  }
];

/**
 * Check if error output matches any failure guard patterns
 */
export function detectFailurePattern(
  stderr: string,
  stdout: string,
  exitCode: number
): FailurePattern | null {
  const combinedOutput = `${stderr}\n${stdout}`;

  for (const guard of FAILURE_GUARDS) {
    // Check exit code match
    const exitCodeMatches = guard.exitCodes ? guard.exitCodes.includes(exitCode) : true;

    // Check pattern match
    const patternMatches = guard.patterns.some(pattern => pattern.test(combinedOutput));

    if (exitCodeMatches && patternMatches) {
      logger.info({
        category: 'process',
        action: 'failure_guard_triggered',
        message: `Failure guard triggered: ${guard.name}`,
        details: {
          guard: guard.name,
          category: guard.category,
          exitCode,
          immediateFailure: guard.immediateFailure,
          suggestedFix: guard.suggestedFix
        }
      });
      return guard;
    }
  }

  return null;
}

/**
 * Check if task has been running too long (hung/stuck)
 */
export function isTaskStuck(startTime: Date, maxDurationMs: number = 30 * 60 * 1000): boolean {
  const elapsed = Date.now() - startTime.getTime();
  return elapsed > maxDurationMs;
}

/**
 * Get failure metrics for monitoring
 */
export function getFailureCategories(): string[] {
  return [...new Set(FAILURE_GUARDS.map(g => g.category))];
}

/**
 * Generate actionable insights from failure pattern
 */
export function generateFailureInsights(pattern: FailurePattern, taskId: string): {
  should_retry: boolean;
  recommended_action: string;
  investigation_hints: string[];
  category: string;
} {
  return {
    should_retry: !pattern.immediateFailure,
    recommended_action: pattern.suggestedFix || 'Manual investigation required',
    investigation_hints: [
      `Check task logs: dev-bots/artifacts/${taskId}-stderr-*.log`,
      `Review ${pattern.category} related configuration`,
      pattern.suggestedFix || 'Consult documentation for this error type'
    ],
    category: pattern.category
  };
}

/**
 * Container cleanup strategies based on failure type
 */
export function getCleanupStrategy(pattern: FailurePattern): {
  force_kill: boolean;
  cleanup_volumes: boolean;
  save_artifacts: boolean;
} {
  switch (pattern.category) {
    case 'oom':
      return {
        force_kill: true,      // OOM may leave container unresponsive
        cleanup_volumes: false, // Preserve for debugging
        save_artifacts: true    // Important for memory analysis
      };

    case 'timeout':
      return {
        force_kill: true,       // May be hung
        cleanup_volumes: false,
        save_artifacts: true
      };

    case 'cli_incompatibility':
    case 'configuration_error':
      return {
        force_kill: false,      // Clean exit expected
        cleanup_volumes: true,  // No need to preserve
        save_artifacts: true    // For debugging CLI issues
      };

    case 'permission_denied':
      return {
        force_kill: false,
        cleanup_volumes: false, // May need to check permissions
        save_artifacts: true
      };

    default:
      return {
        force_kill: false,
        cleanup_volumes: false,
        save_artifacts: true
      };
  }
}

/**
 * Time-based failure guards
 */
export const TIME_BASED_GUARDS = {
  // Hard timeout - force kill after this
  ABSOLUTE_MAX_DURATION_MS: 60 * 60 * 1000, // 1 hour

  // Soft timeout - warning after this
  SOFT_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes

  // Stuck detection - no output for this long
  NO_OUTPUT_TIMEOUT_MS: 10 * 60 * 1000, // 10 minutes

  // Container startup timeout
  STARTUP_TIMEOUT_MS: 2 * 60 * 1000 // 2 minutes
};
