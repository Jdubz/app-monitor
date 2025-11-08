/**
 * Centralized Error Handling
 *
 * Provides consistent error handling across the application.
 * Replaces scattered try-catch blocks with standardized patterns.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

export interface ApiError {
  status: number;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, status: number = 500, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string, details?: Record<string, unknown>) {
    super(`${service} is currently unavailable`, 503, 'SERVICE_UNAVAILABLE', details);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Centralized error handler for API routes
 */
export const handleApiError = (error: unknown, req: Request, res: Response): void => {
  let status = 500;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';
  let details: Record<string, unknown> | undefined;

  if (error instanceof AppError) {
    status = error.status;
    message = error.message;
    code = error.code || 'APP_ERROR';
    details = error.details;
  } else if (error instanceof Error) {
    message = error.message;
    code = 'UNKNOWN_ERROR';
  } else {
    message = String(error);
    code = 'UNKNOWN_ERROR';
  }

  // Log the error
  logger.error({
    category: 'api',
    action: 'error',
    message: `API Error: ${message}`,
    details: {
      method: req.method,
      url: req.url,
      status,
      code,
      ...details,
    },
    error,
  });

  // Send response
  res.status(status).json({
    error: message,
    code,
    ...(details && { details }),
    ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined }),
  });
};

/**
 * Wrapper for async route handlers with automatic error handling
 */
export const asyncHandler = (fn: (req: Request, res: Response, next?: NextFunction) => Promise<unknown>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      handleApiError(error, req, res);
    });
  };
};

/**
 * Wrapper for service methods with error handling
 */
export const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  context: string,
  fallback?: T
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    logger.error({
      category: 'system',
      action: 'operation_failed',
      message: `Operation failed in ${context}`,
      details: { context },
      error,
    });

    if (fallback !== undefined) {
      return fallback;
    }

    throw error;
  }
};

/**
 * Validate required fields in request body
 */
export const validateRequired = (body: Record<string, unknown>, fields: string[]): void => {
  const missing = fields.filter(field => !body[field]);
  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`, {
      missing,
      provided: Object.keys(body),
    });
  }
};

/**
 * Validate field types
 */
export const validateTypes = (body: Record<string, unknown>, schema: Record<string, string>): void => {
  const errors: string[] = [];
  
  for (const [field, expectedType] of Object.entries(schema)) {
    if (body[field] !== undefined) {
      const actualType = typeof body[field];
      if (actualType !== expectedType) {
        errors.push(`${field} must be ${expectedType}, got ${actualType}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Type validation failed', { errors });
  }
};
