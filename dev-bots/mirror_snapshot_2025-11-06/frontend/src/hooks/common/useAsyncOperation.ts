/**
 * Generic Async Operation Hook
 *
 * Replaces repeated async operation patterns with a reusable hook.
 * Provides loading states, error handling, and retry functionality.
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface AsyncOperationState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  success: boolean;
}

export interface AsyncOperationOptions {
  retryCount?: number;
  retryDelay?: number;
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
}

export const useAsyncOperation = <T>(
  operation: () => Promise<T>,
  options: AsyncOperationOptions = {},
) => {
  const [state, setState] = useState<AsyncOperationState<T>>({
    data: null,
    loading: false,
    error: null,
    success: false,
  });

  const retryCountRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const execute = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await operation();
      setState({
        data: result,
        loading: false,
        error: null,
        success: true,
      });

      options.onSuccess?.(result);
      retryCountRef.current = 0;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMessage,
        success: false,
      }));

      options.onError?.(errorMessage);
    }
  }, [operation, options]);

  const retry = useCallback(async () => {
    if (retryCountRef.current >= (options.retryCount || 0)) {
      return;
    }

    retryCountRef.current++;

    if (options.retryDelay) {
      timeoutRef.current = setTimeout(execute, options.retryDelay);
    } else {
      await execute();
    }
  }, [execute, options.retryCount, options.retryDelay]);

  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null,
      success: false,
    });
    retryCountRef.current = 0;
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    ...state,
    execute,
    retry,
    reset,
    canRetry: retryCountRef.current < (options.retryCount || 0),
  };
};
