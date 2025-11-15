/**
 * Type-Safe API Response Helpers
 * 
 * Ensures all API responses conform to ApiSuccess/ApiError contracts.
 * Use these helpers instead of raw res.json() calls to enforce type safety.
 */

import type { Response } from 'express';
import type { ApiSuccess, ApiError } from '@app-monitor/api-contracts';

/**
 * Send a successful API response with proper ApiSuccess wrapper
 * 
 * @example
 * sendSuccess(res, { items: [], counts: {...} });
 * // Returns: { success: true, data: { items: [], counts: {...} } }
 */
export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const response: ApiSuccess<T> = {
    success: true,
    data,
  };
  res.status(status).json(response);
}

/**
 * Send an error API response with proper ApiError wrapper
 * 
 * @example
 * sendError(res, 'Task not found', 404);
 * // Returns: { success: false, error: 'Task not found' }
 */
export function sendError(
  res: Response,
  error: string,
  status = 500,
  options?: {
    message?: string;
    code?: string;
    details?: Record<string, unknown> | unknown[];
  }
): void {
  const response: ApiError = {
    success: false,
    error,
    message: options?.message,
    code: options?.code,
    details: options?.details,
  };
  res.status(status).json(response);
}

/**
 * Send a successful response with just a message
 * 
 * @example
 * sendMessage(res, 'Task deleted successfully');
 * // Returns: { success: true, data: { message: 'Task deleted successfully' } }
 */
export function sendMessage(res: Response, message: string, status = 200): void {
  sendSuccess(res, { message }, status);
}
