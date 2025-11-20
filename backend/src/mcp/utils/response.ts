/**
 * MCP Response Utilities
 *
 * Standardized response helpers for MCP tool handlers
 */

export interface McpResponse {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Creates a successful text response
 */
export function createSuccessResponse(text: string): McpResponse {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Creates a successful JSON response
 */
export function createJsonResponse(data: unknown): McpResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Creates an error response
 */
export function createErrorResponse(message: string): McpResponse {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

/**
 * Creates an error response from an Error object
 */
export function createErrorFromException(error: unknown): McpResponse {
  const message = error instanceof Error ? error.message : String(error);
  return createErrorResponse(message);
}

/**
 * Wraps a tool handler with try-catch and standardized error handling
 */
export function withErrorHandling<T>(
  handler: (params: T, ...args: unknown[]) => Promise<McpResponse>
): (params: T, ...args: unknown[]) => Promise<McpResponse> {
  return async (params: T, ...args: unknown[]): Promise<McpResponse> => {
    try {
      return await handler(params, ...args);
    } catch (error) {
      return createErrorFromException(error);
    }
  };
}
