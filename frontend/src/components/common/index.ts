/**
 * Common Components
 * 
 * Reusable components that follow the design system.
 * These components replace scattered inline styles throughout the application.
 */

// Loading components
export { LoadingSpinner, LoadingSkeleton, LoadingCard } from './LoadingSpinner';

// Error components
export { ErrorDisplay, ErrorBoundary, InlineError } from './ErrorDisplay';

// Status components
export { StatusIndicator, ConnectionStatus, ProcessStatus } from './StatusIndicator';
export type { StatusType } from './StatusIndicator';

// Quick actions
export { QuickActions, commonActions } from './QuickActions';
export type { QuickAction, QuickActionsProps } from './QuickActions';
