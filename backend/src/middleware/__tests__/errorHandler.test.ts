/**
 * Error Handler Middleware Tests
 *
 * Tests global error handling middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler, asyncHandler, notFoundHandler } from '../errorHandler.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  BadRequestError
} from '../../errors/ValidationError.js';

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });

    mockRequest = {
      method: 'POST',
      path: '/api/test',
      query: {}
    };

    mockResponse = {
      status: statusSpy,
      json: jsonSpy
    };

    mockNext = vi.fn();
  });

  describe('errorHandler', () => {
    it('should handle ValidationError with 400 status', () => {
      const error = new ValidationError('Validation failed', {
        errors: ['Field required'],
        warnings: ['Low confidence'],
        suggestions: ['Add more detail']
      });

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Validation failed',
        statusCode: 400,
        details: {
          errors: ['Field required'],
          warnings: ['Low confidence'],
          suggestions: ['Add more detail']
        }
      });
    });

    it('should handle ConflictError with 409 status', () => {
      const error = new ConflictError('Duplicate task', 'duplicate_task', {
        existingTaskId: 'task-123'
      });

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Duplicate task',
        statusCode: 409,
        details: {
          conflictType: 'duplicate_task',
          existingTaskId: 'task-123'
        }
      });
    });

    it('should handle NotFoundError with 404 status', () => {
      const error = new NotFoundError('Task not found', 'Task', 'task-123');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Task not found',
        statusCode: 404,
        details: {
          resourceType: 'Task',
          resourceId: 'task-123'
        }
      });
    });

    it('should handle BadRequestError with 400 status', () => {
      const error = new BadRequestError('Missing required fields', {
        provided: ['title'],
        required: ['title', 'taskType', 'intent']
      });

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Missing required fields',
        statusCode: 400,
        details: {
          provided: ['title'],
          required: ['title', 'taskType', 'intent']
        }
      });
    });

    it('should handle unknown errors with 500 status in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Something went wrong');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Internal server error',
        statusCode: 500,
        details: {
          message: 'An unexpected error occurred'
        }
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should include error message for unknown errors in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Detailed error message');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Internal server error',
        statusCode: 500,
        details: {
          message: 'Detailed error message'
        }
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should not call next function', () => {
      const error = new ValidationError('Test', { errors: [] });

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('asyncHandler', () => {
    it('should call handler and resolve successfully', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const wrappedHandler = asyncHandler(handler);

      wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch async errors and pass to next', async () => {
      const error = new ValidationError('Test error', { errors: [] });
      const handler = vi.fn().mockRejectedValue(error);
      const wrappedHandler = asyncHandler(handler);

      wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle handler that returns Response object', async () => {
      const handler = vi.fn().mockResolvedValue(mockResponse);
      const wrappedHandler = asyncHandler(handler);

      wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with route information', () => {
      mockRequest.method = 'GET';
      mockRequest.path = '/api/nonexistent';
      mockRequest.query = { param: 'value' };

      notFoundHandler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Not Found',
        statusCode: 404,
        details: {
          path: '/api/nonexistent',
          message: 'Route GET /api/nonexistent not found'
        }
      });
    });

    it('should handle POST requests', () => {
      mockRequest.method = 'POST';
      mockRequest.path = '/api/tasks/invalid';

      notFoundHandler(mockRequest as Request, mockResponse as Response);

      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Not Found',
        statusCode: 404,
        details: {
          path: '/api/tasks/invalid',
          message: 'Route POST /api/tasks/invalid not found'
        }
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle validation error from task creation', () => {
      const error = new ValidationError('Task validation failed', {
        errors: ['Title must be at least 10 characters'],
        warnings: ['Auto-detection: No files detected'],
        suggestions: ['Add more descriptive title']
      });

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Task validation failed',
          statusCode: 400,
          details: expect.objectContaining({
            errors: expect.arrayContaining(['Title must be at least 10 characters']),
            warnings: expect.arrayContaining(['Auto-detection: No files detected']),
            suggestions: expect.arrayContaining(['Add more descriptive title'])
          })
        })
      );
    });


    it('should handle duplicate task conflict', () => {
      const error = new ConflictError(
        'Duplicate task detected',
        'duplicate_task',
        {
          existingTaskId: 'abc123',
          existingTaskTitle: 'Fix bug',
          existingTaskStatus: 'pending'
        }
      );

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          details: expect.objectContaining({
            conflictType: 'duplicate_task',
            existingTaskId: 'abc123',
            existingTaskStatus: 'pending'
          })
        })
      );
    });
  });
});
