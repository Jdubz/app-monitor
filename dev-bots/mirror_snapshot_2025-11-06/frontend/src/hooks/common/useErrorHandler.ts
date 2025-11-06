/**
 * Generic Error Handler Hook
 *
 * Centralizes error handling patterns across components.
 * Provides consistent error display and logging.
 */

import { useState, useCallback } from "react";

export interface ErrorState {
  error: string | null;
  hasError: boolean;
}

export const useErrorHandler = () => {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    hasError: false,
  });

  const handleError = useCallback((error: unknown, context?: string) => {
    let errorMessage: string;

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "string") {
      errorMessage = error;
    } else {
      errorMessage = "An unexpected error occurred";
    }

    const fullMessage = context ? `${context}: ${errorMessage}` : errorMessage;

    setErrorState({
      error: fullMessage,
      hasError: true,
    });

    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("Error handled:", { error, context, message: fullMessage });
    }
  }, []);

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      hasError: false,
    });
  }, []);

  const withErrorHandling = useCallback(
    async <T>(
      operation: () => Promise<T>,
      context?: string,
    ): Promise<T | null> => {
      try {
        return await operation();
      } catch (error) {
        handleError(error, context);
        return null;
      }
    },
    [handleError],
  );

  return {
    ...errorState,
    handleError,
    clearError,
    withErrorHandling,
  };
};
