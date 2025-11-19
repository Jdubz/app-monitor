/**
 * Custom Error Classes Tests
 *
 * Tests custom error classes for API error handling
 */

import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  isAPIError
} from '../ValidationError.js';

describe('Custom Error Classes', () => {
  describe('ValidationError', () => {
    it('should create error with all properties', () => {
      const error = new ValidationError('Validation failed', {
        errors: ['Field is required', 'Invalid format'],
        warnings: ['Consider adding more context'],
        suggestions: ['Use descriptive names'],
        details: { field: 'title' }
      });

      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.errors).toEqual(['Field is required', 'Invalid format']);
      expect(error.warnings).toEqual(['Consider adding more context']);
      expect(error.suggestions).toEqual(['Use descriptive names']);
      expect(error.details).toEqual({ field: 'title' });
    });

    it('should use empty arrays for optional fields', () => {
      const error = new ValidationError('Validation failed', {
        errors: ['Some error']
      });

      expect(error.warnings).toEqual([]);
      expect(error.suggestions).toEqual([]);
      expect(error.details).toBeUndefined();
    });

    it('should serialize to JSON correctly', () => {
      const error = new ValidationError('Validation failed', {
        errors: ['Error 1'],
        warnings: ['Warning 1'],
        suggestions: ['Suggestion 1']
      });

      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Validation failed',
        statusCode: 400,
        details: {
          errors: ['Error 1'],
          warnings: ['Warning 1'],
          suggestions: ['Suggestion 1']
        }
      });
    });

    it('should include additional details in JSON', () => {
      const error = new ValidationError('Validation failed', {
        errors: ['Error 1'],
        details: { customField: 'value' }
      });

      const json = error.toJSON();

      expect(json.details).toEqual({
        errors: ['Error 1'],
        warnings: [],
        suggestions: [],
        customField: 'value'
      });
    });
  });

  describe('NotFoundError', () => {
    it('should create error with resource details', () => {
      const error = new NotFoundError('Task not found', 'Task', 'task-123');

      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe('Task not found');
      expect(error.statusCode).toBe(404);
      expect(error.resourceType).toBe('Task');
      expect(error.resourceId).toBe('task-123');
    });

    it('should work without resource details', () => {
      const error = new NotFoundError('Not found');

      expect(error.resourceType).toBeUndefined();
      expect(error.resourceId).toBeUndefined();
    });

    it('should serialize to JSON correctly', () => {
      const error = new NotFoundError('Task not found', 'Task', 'task-123');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Task not found',
        statusCode: 404,
        details: {
          resourceType: 'Task',
          resourceId: 'task-123'
        }
      });
    });
  });

  describe('ConflictError', () => {
    it('should create error with conflict details', () => {
      const error = new ConflictError(
        'Duplicate task',
        'duplicate_task',
        { existingId: 'task-123', existingStatus: 'pending' }
      );

      expect(error.name).toBe('ConflictError');
      expect(error.message).toBe('Duplicate task');
      expect(error.statusCode).toBe(409);
      expect(error.conflictType).toBe('duplicate_task');
      expect(error.details).toEqual({
        existingId: 'task-123',
        existingStatus: 'pending'
      });
    });

    it('should work without conflict type and details', () => {
      const error = new ConflictError('Conflict occurred');

      expect(error.conflictType).toBeUndefined();
      expect(error.details).toBeUndefined();
    });

    it('should serialize to JSON correctly', () => {
      const error = new ConflictError(
        'Duplicate task',
        'duplicate_task',
        { taskId: 'task-123' }
      );
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Duplicate task',
        statusCode: 409,
        details: {
          conflictType: 'duplicate_task',
          taskId: 'task-123'
        }
      });
    });
  });

  describe('UnauthorizedError', () => {
    it('should create error with default message', () => {
      const error = new UnauthorizedError();

      expect(error.name).toBe('UnauthorizedError');
      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
    });

    it('should accept custom message and realm', () => {
      const error = new UnauthorizedError('Invalid token', 'Bearer');

      expect(error.message).toBe('Invalid token');
      expect(error.realm).toBe('Bearer');
    });

    it('should serialize to JSON correctly', () => {
      const error = new UnauthorizedError('Invalid token', 'Bearer');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Invalid token',
        statusCode: 401,
        details: {
          realm: 'Bearer'
        }
      });
    });
  });

  describe('ForbiddenError', () => {
    it('should create error with default message', () => {
      const error = new ForbiddenError();

      expect(error.name).toBe('ForbiddenError');
      expect(error.message).toBe('Access forbidden');
      expect(error.statusCode).toBe(403);
    });

    it('should accept custom message and required permission', () => {
      const error = new ForbiddenError('Admin access required', 'admin');

      expect(error.message).toBe('Admin access required');
      expect(error.requiredPermission).toBe('admin');
    });

    it('should serialize to JSON correctly', () => {
      const error = new ForbiddenError('Admin access required', 'admin');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Admin access required',
        statusCode: 403,
        details: {
          requiredPermission: 'admin'
        }
      });
    });
  });

  describe('BadRequestError', () => {
    it('should create error with message', () => {
      const error = new BadRequestError('Invalid request');

      expect(error.name).toBe('BadRequestError');
      expect(error.message).toBe('Invalid request');
      expect(error.statusCode).toBe(400);
    });

    it('should include details', () => {
      const error = new BadRequestError('Missing fields', {
        provided: ['title'],
        required: ['title', 'taskType', 'intent']
      });

      expect(error.details).toEqual({
        provided: ['title'],
        required: ['title', 'taskType', 'intent']
      });
    });

    it('should serialize to JSON correctly', () => {
      const error = new BadRequestError('Missing fields', {
        required: ['title', 'taskType']
      });
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Missing fields',
        statusCode: 400,
        details: {
          required: ['title', 'taskType']
        }
      });
    });
  });

  describe('isAPIError type guard', () => {
    it('should return true for ValidationError', () => {
      const error = new ValidationError('Test', { errors: [] });
      expect(isAPIError(error)).toBe(true);
    });

    it('should return true for NotFoundError', () => {
      const error = new NotFoundError('Test');
      expect(isAPIError(error)).toBe(true);
    });

    it('should return true for ConflictError', () => {
      const error = new ConflictError('Test');
      expect(isAPIError(error)).toBe(true);
    });

    it('should return true for UnauthorizedError', () => {
      const error = new UnauthorizedError();
      expect(isAPIError(error)).toBe(true);
    });

    it('should return true for ForbiddenError', () => {
      const error = new ForbiddenError();
      expect(isAPIError(error)).toBe(true);
    });

    it('should return true for BadRequestError', () => {
      const error = new BadRequestError('Test');
      expect(isAPIError(error)).toBe(true);
    });

    it('should return false for generic Error', () => {
      const error = new Error('Generic error');
      expect(isAPIError(error)).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(isAPIError(null)).toBe(false);
      expect(isAPIError(undefined)).toBe(false);
      expect(isAPIError('string')).toBe(false);
      expect(isAPIError(123)).toBe(false);
      expect(isAPIError({})).toBe(false);
    });

    it('should return false for objects with statusCode but not Error', () => {
      const obj = { statusCode: 400, message: 'test' };
      expect(isAPIError(obj)).toBe(false);
    });
  });

  describe('Error stack traces', () => {
    it('should capture stack trace for ValidationError', () => {
      const error = new ValidationError('Test', { errors: [] });
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });

    it('should capture stack trace for ConflictError', () => {
      const error = new ConflictError('Test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ConflictError');
    });

    it('should capture stack trace for NotFoundError', () => {
      const error = new NotFoundError('Test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('NotFoundError');
    });
  });
});
