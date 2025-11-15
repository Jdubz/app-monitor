/**
 * API Contract Validation Test Utilities
 * 
 * Provides assertion functions to validate API responses match contracts.
 * Use these in integration tests to ensure endpoints return proper shapes.
 */

import { expect } from 'vitest';
import type { ApiSuccess, ApiError } from '@app-monitor/api-contracts';

/**
 * Assert that a response matches the ApiSuccess<T> contract
 * 
 * @example
 * const response = await api.get('/queue');
 * assertApiSuccess(response.body);
 * expect(response.body.data).toHaveProperty('items');
 */
export function assertApiSuccess<T>(response: unknown): asserts response is ApiSuccess<T> {
  expect(response).toBeDefined();
  expect(response).toBeTypeOf('object');
  expect(response).toHaveProperty('success', true);
  expect(response).toHaveProperty('data');
  
  const apiResponse = response as ApiSuccess<T>;
  expect(apiResponse.success).toBe(true);
  expect(apiResponse.data).toBeDefined();
}

/**
 * Assert that a response matches the ApiError contract
 * 
 * @example
 * const response = await api.get('/invalid');
 * assertApiError(response.body);
 * expect(response.body.error).toContain('not found');
 */
export function assertApiError(response: unknown): asserts response is ApiError {
  expect(response).toBeDefined();
  expect(response).toBeTypeOf('object');
  expect(response).toHaveProperty('success', false);
  expect(response).toHaveProperty('error');
  
  const apiError = response as ApiError;
  expect(apiError.success).toBe(false);
  expect(apiError.error).toBeDefined();
  expect(typeof apiError.error).toBe('string');
}

/**
 * Assert that a successful response contains expected data properties
 * 
 * @example
 * const response = await api.get('/queue');
 * assertApiSuccessWithProperties(response.body, ['items', 'counts', 'lastUpdated']);
 */
export function assertApiSuccessWithProperties<T>(
  response: unknown,
  properties: string[]
): asserts response is ApiSuccess<T> {
  assertApiSuccess(response);
  
  const data = (response as ApiSuccess<T>).data;
  properties.forEach(prop => {
    expect(data).toHaveProperty(prop);
  });
}

/**
 * Assert that an error response has expected error details
 * 
 * @example
 * const response = await api.post('/invalid');
 * assertApiErrorWithDetails(response.body, 'code', 'VALIDATION_ERROR');
 */
export function assertApiErrorWithDetails(
  response: unknown,
  detailKey: string,
  expectedValue?: unknown
): asserts response is ApiError {
  assertApiError(response);
  
  const apiError = response as ApiError;
  if (expectedValue !== undefined) {
    expect((apiError as Record<string, unknown>)[detailKey]).toBe(expectedValue);
  } else {
    expect(apiError).toHaveProperty(detailKey);
  }
}
