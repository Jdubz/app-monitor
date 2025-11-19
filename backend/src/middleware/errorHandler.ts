/**
 * Global Error Handling Middleware
 *
 * Catches errors thrown by route handlers and services, transforming them
 * into appropriate HTTP responses with consistent structure.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { isAPIError } from '../errors/ValidationError.js';

/**
 * Express error handling middleware
 * Must be added after all routes
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error({
    category: 'api',
    action: 'error_handler',
    message: `${req.method} ${req.path} - ${error.message}`,
    error,
    details: {
      method: req.method,
      path: req.path,
      query: req.query,
      errorName: error.name,
      statusCode: isAPIError(error) ? error.statusCode : 500
    }
  });

  // Handle known API errors with custom status codes
  if (isAPIError(error)) {
    res.status(error.statusCode).json(error.toJSON());
    return;
  }

  // Handle unknown errors as 500 Internal Server Error
  res.status(500).json({
    error: 'Internal server error',
    statusCode: 500,
    details: {
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    }
  });
}

/**
 * Async error wrapper for route handlers
 * Catches errors from async functions and passes them to error middleware
 *
 * Usage:
 * router.get('/path', asyncHandler(async (req, res) => {
 *   const data = await someAsyncOperation();
 *   res.json(data);
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 * Should be added before error handling middleware but after all routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn({
    category: 'api',
    action: 'route_not_found',
    message: `Route not found: ${req.method} ${req.path}`,
    details: {
      method: req.method,
      path: req.path,
      query: req.query
    }
  });

  res.status(404).json({
    error: 'Not Found',
    statusCode: 404,
    details: {
      path: req.path,
      message: `Route ${req.method} ${req.path} not found`
    }
  });
}
