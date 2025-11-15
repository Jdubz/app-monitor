/**
 * Common Hooks
 *
 * Reusable hooks that eliminate duplication across components.
 * These hooks provide consistent patterns for common operations.
 */

export { useAsyncOperation } from './useAsyncOperation';
export { useErrorHandler } from './useErrorHandler';
export { useListSelection } from './useListSelection';

export type { AsyncOperationState, AsyncOperationOptions } from './useAsyncOperation';
export type { ErrorState } from './useErrorHandler';
export type { UseListSelectionOptions } from './useListSelection';
