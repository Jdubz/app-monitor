import React, { ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createLogger } from "@/utils/logger";

interface ErrorDisplayProps {
  error: Error | string;
  title?: string;
  onRetry?: () => void;
  showDetails?: boolean;
  fullScreen?: boolean;
}

export function ErrorDisplay({
  error,
  title = "Error",
  onRetry,
  showDetails = false,
  fullScreen = false,
}: ErrorDisplayProps) {
  const errorMessage = typeof error === "string" ? error : error.message;
  const errorStack = typeof error === "string" ? undefined : error.stack;

  const content = (
    <div className="flex w-full max-w-xl flex-col gap-4 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm shadow-sm backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-full bg-destructive/20 p-2 text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="flex-1 space-y-2">
          <h3 className="text-base font-semibold text-destructive-foreground">{title}</h3>
          <p className="text-sm text-destructive-foreground/90">{errorMessage}</p>
        </div>
      </div>

      {showDetails && errorStack ? (
        <details className="rounded-lg border border-destructive/20 bg-background/40 p-3 text-xs">
          <summary className="cursor-pointer font-medium text-destructive-foreground">Technical details</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
            {errorStack}
          </pre>
        </details>
      ) : null}

      {onRetry ? (
        <div className="flex justify-end">
          <Button variant="destructive" onClick={onRetry} size="sm">
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6">
        {content}
      </div>
    );
  }

  return content;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private log = createLogger('ErrorBoundary');

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.log.error('Component error caught', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  override render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return (
        <ErrorDisplay
          error={this.state.error}
          title="Something went wrong"
          onRetry={this.reset}
          showDetails
          fullScreen
        />
      );
    }

    return this.props.children;
  }
}

interface InlineErrorProps {
  message: string;
  onDismiss?: () => void;
}

export function InlineError({ message, onDismiss }: InlineErrorProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <span className="flex-1 text-sm">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-destructive/40 bg-destructive/20 text-destructive transition hover:bg-destructive/30"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
