/**
 * MCP Request Logging Middleware
 *
 * Logs all MCP tool invocations with parameters and results
 */

import { logger } from '../../utils/logger.js';
import type { AuthContext } from './auth.js';
import type { McpResponse } from '../utils/response.js';

/**
 * Wraps a tool handler with request/response logging
 */
export function withLogging<T>(
  toolName: string,
  handler: (params: T, context: AuthContext) => Promise<McpResponse>
): (params: T, context: AuthContext) => Promise<McpResponse> {
  return async (params: T, context: AuthContext): Promise<McpResponse> => {
    const startTime = Date.now();

    logger.info({
      category: 'mcp',
      action: 'tool_invocation',
      message: `Tool ${toolName} invoked`,
      details: {
        tool: toolName,
        role: context.role,
        env: context.env,
        params: sanitizeParams(params),
      },
    });

    try {
      const result = await handler(params, context);
      const duration = Date.now() - startTime;

      logger.info({
        category: 'mcp',
        action: 'tool_completed',
        message: `Tool ${toolName} completed`,
        details: {
          tool: toolName,
          role: context.role,
          duration_ms: duration,
          is_error: result.isError ?? false,
        },
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({
        category: 'mcp',
        action: 'tool_error',
        message: `Tool ${toolName} failed`,
        details: {
          tool: toolName,
          role: context.role,
          duration_ms: duration,
        },
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw error;
    }
  };
}

/**
 * Sanitizes parameters before logging to remove sensitive data
 */
function sanitizeParams(params: unknown): unknown {
  if (typeof params !== 'object' || params === null) {
    return params;
  }

  const sanitized: Record<string, unknown> = {};
  const sensitive = new Set(['password', 'token', 'secret', 'api_key', 'apiKey']);

  for (const [key, value] of Object.entries(params)) {
    if (sensitive.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
