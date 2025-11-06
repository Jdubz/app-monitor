import React, { ReactNode } from 'react';
import styles from './ErrorDisplay.module.css';

interface ErrorDisplayProps {
  error: Error | string;
  title?: string;
  onRetry?: () => void;
  showDetails?: boolean;
  fullScreen?: boolean;
}

export function ErrorDisplay({ 
  error, 
  title = 'Error',
  onRetry,
  showDetails = false,
  fullScreen = false
}: ErrorDisplayProps) {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'string' ? undefined : error.stack;

  const content = (
    <div className={styles.error}>
      <div className={styles.iconContainer}>
        <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" strokeWidth="2"/>
          <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" strokeLinecap="round"/>
          <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.message}>{errorMessage}</p>
      
      {showDetails && errorStack && (
        <details className={styles.details}>
          <summary>Technical Details</summary>
          <pre className={styles.stack}>{errorStack}</pre>
        </details>
      )}
      
      {onRetry && (
        <button 
          className={styles.retryButton}
          onClick={onRetry}
        >
          Try Again
        </button>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className={styles.fullScreen}>
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
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
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
          showDetails={true}
          fullScreen={true}
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
    <div className={styles.inlineError}>
      <svg className={styles.inlineIcon} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
      <span className={styles.inlineMessage}>{message}</span>
      {onDismiss && (
        <button 
          className={styles.dismissButton}
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          ×
        </button>
      )}
    </div>
  );
}
