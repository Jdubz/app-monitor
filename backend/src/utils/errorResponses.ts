/**
 * Standardized Error Response Helpers
 * 
 * Provides consistent, informative error responses across all API endpoints.
 * All errors follow the ApiError contract from shared/api-contracts.
 * 
 * Benefits:
 * - Consistent error structure
 * - Helpful troubleshooting hints
 * - Proper HTTP status codes
 * - Structured logging
 */

import type { Response } from 'express';
import type { ApiError } from '@app-monitor/api-contracts';
import { logger, type LogCategory } from './logger.js';

interface ErrorContext {
  category: LogCategory;
  action: string;
  details?: Record<string, unknown>;
}

interface TroubleshootingHint {
  issue: string;
  solution: string;
}

/**
 * Create a standardized ApiError response
 */
function createApiError(
  error: string,
  message: string,
  code?: string,
  details?: Record<string, unknown>,
  hints?: TroubleshootingHint[]
): ApiError {
  return {
    success: false,
    error,
    message,
    code,
    details: {
      ...details,
      ...(hints && hints.length > 0 ? { troubleshooting: hints } : {})
    }
  };
}

/**
 * 400 Bad Request - Invalid client input
 */
export function badRequest(
  res: Response,
  message: string,
  context: ErrorContext,
  field?: string
): Response {
  const hints: TroubleshootingHint[] = [];
  
  if (field) {
    hints.push({
      issue: `Missing or invalid field: ${field}`,
      solution: `Check the API documentation for required fields and valid formats`
    });
  }

  logger.warn({
    ...context,
    message: `Bad request: ${message}`,
  });

  return res.status(400).json(
    createApiError(
      'BAD_REQUEST',
      message,
      'VALIDATION_ERROR',
      field ? { field } : {},
      hints
    )
  );
}

/**
 * 401 Unauthorized - Missing or invalid authentication
 */
export function unauthorized(
  res: Response,
  message: string,
  context: ErrorContext,
  hasKey: boolean = false
): Response {
  const hints: TroubleshootingHint[] = [
    {
      issue: hasKey ? 'Invalid API key provided' : 'Missing API key',
      solution: hasKey
        ? 'Verify your API key is correct. Check environment variables or configuration.'
        : 'Include X-API-Key header with your request. Get API key from environment configuration.'
    }
  ];

  logger.warn({
    ...context,
    message: `Unauthorized: ${message}`,
  });

  return res.status(401).json(
    createApiError(
      'UNAUTHORIZED',
      message,
      'AUTH_REQUIRED',
      { hasKey },
      hints
    )
  );
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export function notFound(
  res: Response,
  resource: string,
  context: ErrorContext,
  identifier?: string
): Response {
  const message = identifier 
    ? `${resource} '${identifier}' not found`
    : `${resource} not found`;

  const hints: TroubleshootingHint[] = [
    {
      issue: `The requested ${resource.toLowerCase()} does not exist`,
      solution: identifier
        ? `Verify the ${resource.toLowerCase()} ID is correct: ${identifier}`
        : `Check if the ${resource.toLowerCase()} exists or has been deleted`
    }
  ];

  logger.warn({
    ...context,
    message: `Not found: ${message}`,
  });

  return res.status(404).json(
    createApiError(
      'NOT_FOUND',
      message,
      'RESOURCE_NOT_FOUND',
      identifier !== undefined ? { resource, identifier } : { resource },
      hints
    )
  );
}

/**
 * 409 Conflict - Resource state conflict
 */
export function conflict(
  res: Response,
  message: string,
  context: ErrorContext,
  currentState?: string
): Response {
  const hints: TroubleshootingHint[] = [
    {
      issue: 'Operation conflicts with current resource state',
      solution: currentState
        ? `Resource is in '${currentState}' state. Wait or change the state first.`
        : 'Check the current resource state and retry after resolving the conflict.'
    }
  ];

  logger.warn({
    ...context,
    message: `Conflict: ${message}`,
  });

  return res.status(409).json(
    createApiError(
      'CONFLICT',
      message,
      'STATE_CONFLICT',
      { currentState },
      hints
    )
  );
}

/**
 * 500 Internal Server Error - Unexpected server error
 */
export function internalError(
  res: Response,
  message: string,
  context: ErrorContext,
  error?: Error | unknown
): Response {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const hints: TroubleshootingHint[] = [
    {
      issue: 'Internal server error occurred',
      solution: 'Check server logs for detailed error information. Contact support if the issue persists.'
    }
  ];

  logger.error({
    ...context,
    message: `Internal error: ${message}`,
    error,
    details: {
      ...context.details,
      errorMessage,
      stack: stack?.split('\n').slice(0, 3).join('\n') // First 3 lines only
    }
  });

  return res.status(500).json(
    createApiError(
      'INTERNAL_ERROR',
      message,
      'SERVER_ERROR',
      {
        errorMessage,
        timestamp: new Date().toISOString()
      },
      hints
    )
  );
}

/**
 * 503 Service Unavailable - Service dependency not available
 */
export function serviceUnavailable(
  res: Response,
  service: string,
  context: ErrorContext,
  healthy: boolean = false
): Response {
  const message = `${service} is currently unavailable`;

  const hints: TroubleshootingHint[] = [
    {
      issue: `${service} is not responding`,
      solution: healthy
        ? `Service reports healthy but is not ready. Wait a moment and retry.`
        : `Check if ${service} is running. Restart the service if needed.`
    },
    {
      issue: 'Service may be starting up',
      solution: 'Wait 10-30 seconds and retry. Check service status endpoint.'
    }
  ];

  logger.warn({
    ...context,
    message: `Service unavailable: ${message}`,
    details: {
      ...context.details,
      service,
      healthy
    }
  });

  return res.status(503).json(
    createApiError(
      'SERVICE_UNAVAILABLE',
      message,
      'SERVICE_DOWN',
      { service, healthy },
      hints
    )
  );
}

/**
 * 422 Unprocessable Entity - Validation failed
 */
export function validationError(
  res: Response,
  message: string,
  context: ErrorContext,
  errors: Array<{ field: string; error: string }>
): Response {
  const hints: TroubleshootingHint[] = [
    {
      issue: 'Request payload failed validation',
      solution: 'Review the validation errors below and correct the indicated fields.'
    }
  ];

  logger.warn({
    ...context,
    message: `Validation failed: ${message}`,
    details: {
      ...context.details,
      validationErrors: errors
    }
  });

  return res.status(422).json(
    createApiError(
      'VALIDATION_FAILED',
      message,
      'INVALID_PAYLOAD',
      { errors },
      hints
    )
  );
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export function rateLimitExceeded(
  res: Response,
  message: string,
  context: ErrorContext,
  retryAfter?: number
): Response {
  const hints: TroubleshootingHint[] = [
    {
      issue: 'Rate limit exceeded',
      solution: retryAfter
        ? `Wait ${retryAfter} seconds before retrying.`
        : 'Reduce request frequency or wait before retrying.'
    }
  ];

  logger.warn({
    ...context,
    message: `Rate limit exceeded: ${message}`,
  });

  if (retryAfter) {
    res.setHeader('Retry-After', retryAfter);
  }

  return res.status(429).json(
    createApiError(
      'RATE_LIMIT_EXCEEDED',
      message,
      'TOO_MANY_REQUESTS',
      { retryAfter },
      hints
    )
  );
}
