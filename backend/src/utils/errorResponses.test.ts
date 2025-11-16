/**
 * Tests for Error Response Helpers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import * as errorResponses from './errorResponses.js';
import { logger } from './logger.js';

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('Error Response Helpers', () => {
  let mockRes: Partial<Response>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;
  let setHeaderMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    setHeaderMock = vi.fn();
    mockRes = {
      status: statusMock as any,
      json: jsonMock as any,
      setHeader: setHeaderMock as any
    };
    vi.clearAllMocks();
  });

  describe('badRequest', () => {
    it('should return 400 with correct structure', () => {
      errorResponses.badRequest(
        mockRes as Response,
        'Invalid input',
        { category: 'api', action: 'test' },
        'email'
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'BAD_REQUEST',
          message: 'Invalid input',
          code: 'VALIDATION_ERROR'
        })
      );
    });

    it('should include field in details when provided', () => {
      errorResponses.badRequest(
        mockRes as Response,
        'Invalid input',
        { category: 'api', action: 'test' },
        'email'
      );

      const response = jsonMock.mock.calls[0][0];
      expect(response.details).toHaveProperty('field', 'email');
    });

    it('should not include field in details when not provided', () => {
      errorResponses.badRequest(
        mockRes as Response,
        'Invalid input',
        { category: 'api', action: 'test' }
      );

      const response = jsonMock.mock.calls[0][0];
      expect(response.details).not.toHaveProperty('field');
    });

    it('should log with warn level', () => {
      errorResponses.badRequest(
        mockRes as Response,
        'Invalid input',
        { category: 'api', action: 'test' }
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'api',
          action: 'test',
          message: expect.stringContaining('Invalid input')
        })
      );
    });
  });

  describe('unauthorized', () => {
    it('should return 401 with correct structure', () => {
      errorResponses.unauthorized(
        mockRes as Response,
        'API key required',
        { category: 'api', action: 'verify' },
        false
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'API key required',
          code: 'AUTH_REQUIRED'
        })
      );
    });

    it('should include hasKey in details', () => {
      errorResponses.unauthorized(
        mockRes as Response,
        'Invalid API key',
        { category: 'api', action: 'verify' },
        true
      );

      const response = jsonMock.mock.calls[0][0];
      expect(response.details).toHaveProperty('hasKey', true);
    });
  });

  describe('notFound', () => {
    it('should return 404 with correct structure', () => {
      errorResponses.notFound(
        mockRes as Response,
        'Task',
        { category: 'api', action: 'get_task' },
        'task-123'
      );

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'NOT_FOUND',
          code: 'RESOURCE_NOT_FOUND'
        })
      );
    });

    it('should include identifier when provided', () => {
      errorResponses.notFound(
        mockRes as Response,
        'Task',
        { category: 'api', action: 'get_task' },
        'task-123'
      );

      const response = jsonMock.mock.calls[0][0];
      expect(response.details.resource).toBe('Task');
      expect(response.details.identifier).toBe('task-123');
    });

    it('should not include identifier when not provided', () => {
      errorResponses.notFound(
        mockRes as Response,
        'Task',
        { category: 'api', action: 'get_task' }
      );

      const response = jsonMock.mock.calls[0][0];
      expect(response.details.resource).toBe('Task');
      expect(response.details).not.toHaveProperty('identifier');
    });

    it('should log with warn level', () => {
      errorResponses.notFound(
        mockRes as Response,
        'Task',
        { category: 'api', action: 'get_task' }
      );

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('conflict', () => {
    it('should return 409 with correct structure', () => {
      errorResponses.conflict(
        mockRes as Response,
        'Task already exists',
        { category: 'api', action: 'create_task' },
        'task-123'
      );

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'CONFLICT',
          code: 'STATE_CONFLICT'
        })
      );
    });
  });

  describe('validationError', () => {
    it('should return 422 with correct structure', () => {
      errorResponses.validationError(
        mockRes as Response,
        'Invalid task data',
        { category: 'api', action: 'create_task' },
        [{ field: 'schema', error: 'Invalid format' }]
      );

      expect(statusMock).toHaveBeenCalledWith(422);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'VALIDATION_FAILED',
          message: 'Invalid task data',
          code: 'INVALID_PAYLOAD'
        })
      );
    });

    it('should include validation errors in details', () => {
      const errors = [
        { field: 'email', error: 'Invalid email format' },
        { field: 'age', error: 'Must be a positive number' }
      ];

      errorResponses.validationError(
        mockRes as Response,
        'Validation failed',
        { category: 'api', action: 'validate' },
        errors
      );

      const response = jsonMock.mock.calls[0][0];
      expect(response.details).toHaveProperty('errors', errors);
    });
  });

  describe('rateLimitExceeded', () => {
    it('should return 429 with correct structure', () => {
      errorResponses.rateLimitExceeded(
        mockRes as Response,
        'Rate limit exceeded',
        { category: 'api', action: 'create_task' },
        60
      );

      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          code: 'TOO_MANY_REQUESTS'
        })
      );
    });

    it('should set Retry-After header when provided', () => {
      errorResponses.rateLimitExceeded(
        mockRes as Response,
        'Rate limit exceeded',
        { category: 'api', action: 'create_task' },
        60
      );

      expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', 60);
    });

    it('should not set Retry-After header when not provided', () => {
      errorResponses.rateLimitExceeded(
        mockRes as Response,
        'Rate limit exceeded',
        { category: 'api', action: 'create_task' }
      );

      expect(setHeaderMock).not.toHaveBeenCalled();
    });
  });

  describe('internalError', () => {
    it('should return 500 with correct structure', () => {
      const error = new Error('Database connection failed');
      
      errorResponses.internalError(
        mockRes as Response,
        'Failed to process request',
        { category: 'api', action: 'process' },
        error
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'Failed to process request',
          code: 'SERVER_ERROR'
        })
      );
    });

    it('should include error message and timestamp in details', () => {
      const error = new Error('Test error');
      
      errorResponses.internalError(
        mockRes as Response,
        'Failed to process request',
        { category: 'api', action: 'process' },
        error
      );

      const response = jsonMock.mock.calls[0][0];
      expect(response.details).toHaveProperty('errorMessage');
      expect(response.details).toHaveProperty('timestamp');
      expect(response.details.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should log error with full details', () => {
      const error = new Error('Database connection failed');
      
      errorResponses.internalError(
        mockRes as Response,
        'Failed to process request',
        { category: 'api', action: 'process' },
        error
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'api',
          action: 'process',
          error: expect.any(Error)
        })
      );
    });

    it('should handle non-Error objects', () => {
      errorResponses.internalError(
        mockRes as Response,
        'Failed to process request',
        { category: 'api', action: 'process' },
        'string error'
      );

      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe('serviceUnavailable', () => {
    it('should return 503 with correct structure', () => {
      errorResponses.serviceUnavailable(
        mockRes as Response,
        'database',
        { category: 'system', action: 'check_health' },
        false
      );

      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          code: 'SERVICE_DOWN'
        })
      );
    });

    it('should include service and healthy status in details', () => {
      errorResponses.serviceUnavailable(
        mockRes as Response,
        'database',
        { category: 'system', action: 'check_health' },
        false
      );

      const response = jsonMock.mock.calls[0][0];
      expect(response.details).toHaveProperty('service', 'database');
      expect(response.details).toHaveProperty('healthy', false);
    });
  });

  describe('ErrorResponses namespace', () => {
    it('should export all functions as named exports', () => {
      expect(typeof errorResponses.badRequest).toBe('function');
      expect(typeof errorResponses.unauthorized).toBe('function');
      expect(typeof errorResponses.notFound).toBe('function');
      expect(typeof errorResponses.conflict).toBe('function');
      expect(typeof errorResponses.validationError).toBe('function');
      expect(typeof errorResponses.rateLimitExceeded).toBe('function');
      expect(typeof errorResponses.internalError).toBe('function');
      expect(typeof errorResponses.serviceUnavailable).toBe('function');
    });
  });

  describe('ApiError contract compliance', () => {
    it('should always include success: false', () => {
      errorResponses.badRequest(
        mockRes as Response,
        'Test',
        { category: 'api', action: 'test' }
      );

      const response = jsonMock.mock.calls[0][0];
      expect(response.success).toBe(false);
    });

    it('should always include error field', () => {
      errorResponses.notFound(
        mockRes as Response,
        'Task',
        { category: 'api', action: 'test' }
      );

      const response = jsonMock.mock.calls[0][0];
      expect(response).toHaveProperty('error');
      expect(typeof response.error).toBe('string');
    });

    it('should include troubleshooting hints in details', () => {
      errorResponses.unauthorized(
        mockRes as Response,
        'API key required',
        { category: 'api', action: 'verify' },
        false
      );

      const response = jsonMock.mock.calls[0][0];
      expect(response.details).toHaveProperty('troubleshooting');
      expect(Array.isArray(response.details.troubleshooting)).toBe(true);
      expect(response.details.troubleshooting.length).toBeGreaterThan(0);
    });
  });
});
