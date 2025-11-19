/**
 * Custom Error Classes for API Error Handling
 *
 * Provides structured error types that can be caught by error handling
 * middleware to return appropriate HTTP status codes and error responses.
 */

export interface ValidationErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ValidationErrorOptions {
  errors: string[];
  warnings?: string[];
  suggestions?: string[];
  details?: Record<string, unknown>;
}

/**
 * ValidationError - Thrown when user input fails validation
 * Should result in 400 Bad Request
 */
export class ValidationError extends Error {
  public readonly statusCode = 400;
  public readonly errors: string[];
  public readonly warnings: string[];
  public readonly suggestions: string[];
  public readonly details?: Record<string, unknown>;

  constructor(message: string, options: ValidationErrorOptions) {
    super(message);
    this.name = 'ValidationError';
    this.errors = options.errors;
    this.warnings = options.warnings || [];
    this.suggestions = options.suggestions || [];
    this.details = options.details;

    // Maintain proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      statusCode: this.statusCode,
      details: {
        errors: this.errors,
        warnings: this.warnings,
        suggestions: this.suggestions,
        ...this.details
      }
    };
  }
}

/**
 * NotFoundError - Thrown when a requested resource doesn't exist
 * Should result in 404 Not Found
 */
export class NotFoundError extends Error {
  public readonly statusCode = 404;
  public readonly resourceType?: string;
  public readonly resourceId?: string;

  constructor(message: string, resourceType?: string, resourceId?: string) {
    super(message);
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      statusCode: this.statusCode,
      details: {
        resourceType: this.resourceType,
        resourceId: this.resourceId
      }
    };
  }
}

/**
 * ConflictError - Thrown when a request conflicts with current state
 * Should result in 409 Conflict
 */
export class ConflictError extends Error {
  public readonly statusCode = 409;
  public readonly conflictType?: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, conflictType?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ConflictError';
    this.conflictType = conflictType;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      statusCode: this.statusCode,
      details: {
        conflictType: this.conflictType,
        ...this.details
      }
    };
  }
}

/**
 * UnauthorizedError - Thrown when authentication is required or failed
 * Should result in 401 Unauthorized
 */
export class UnauthorizedError extends Error {
  public readonly statusCode = 401;
  public readonly realm?: string;

  constructor(message: string = 'Authentication required', realm?: string) {
    super(message);
    this.name = 'UnauthorizedError';
    this.realm = realm;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      statusCode: this.statusCode,
      details: {
        realm: this.realm
      }
    };
  }
}

/**
 * ForbiddenError - Thrown when user lacks permission for an action
 * Should result in 403 Forbidden
 */
export class ForbiddenError extends Error {
  public readonly statusCode = 403;
  public readonly requiredPermission?: string;

  constructor(message: string = 'Access forbidden', requiredPermission?: string) {
    super(message);
    this.name = 'ForbiddenError';
    this.requiredPermission = requiredPermission;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      statusCode: this.statusCode,
      details: {
        requiredPermission: this.requiredPermission
      }
    };
  }
}

/**
 * BadRequestError - Generic bad request error
 * Should result in 400 Bad Request
 */
export class BadRequestError extends Error {
  public readonly statusCode = 400;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BadRequestError';
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      statusCode: this.statusCode,
      details: this.details
    };
  }
}

/**
 * Type guard to check if an error is an API error with statusCode
 */
export function isAPIError(error: unknown): error is ValidationError | NotFoundError | ConflictError | UnauthorizedError | ForbiddenError | BadRequestError {
  return error instanceof Error && 'statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number';
}
