/**
 * Error Serialization Utility
 *
 * Converts Error objects to JSON-serializable format for logging.
 */

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  componentStack?: string;
}

/**
 * Serialize an Error object to JSON-compatible format
 */
export function serializeError(error: Error, componentStack?: string): SerializedError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: (error as { cause?: unknown }).cause,
    componentStack,
  };
}

/**
 * Check if error is critical (should trigger auto-report)
 */
export function isCriticalError(error: Error): boolean {
  // Critical errors that should auto-report
  const criticalPatterns = [
    /network.*failed/i,
    /failed.*fetch/i,
    /syntax.*error/i,
    /reference.*error/i,
    /type.*error/i,
    /chunk.*failed/i,
    /loading.*failed/i,
  ];

  const errorMessage = error.message.toLowerCase();

  return criticalPatterns.some(pattern => pattern.test(errorMessage));
}

/**
 * Extract component name from error stack
 */
export function extractComponentFromError(error: Error): string | undefined {
  if (!error.stack) {
    return undefined;
  }

  // Look for React component names in stack trace
  const componentMatch = error.stack.match(/at (\w+) \(/);
  if (componentMatch) {
    return componentMatch[1];
  }

  // Look for file names
  const fileMatch = error.stack.match(/\/([^/]+)\.(tsx?|jsx?):/);
  if (fileMatch) {
    return fileMatch[1];
  }

  return undefined;
}
