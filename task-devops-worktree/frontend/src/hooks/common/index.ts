/**
 * Common Hooks
 * 
 * Reusable hooks that eliminate duplication across components.
 * These hooks provide consistent patterns for common operations.
 */

export { useAsyncOperation } from './useAsyncOperation';
export { useErrorHandler } from './useErrorHandler';

export type { AsyncOperationState, AsyncOperationOptions } from './useAsyncOperation';
export type { ErrorState } from './useErrorHandler';
