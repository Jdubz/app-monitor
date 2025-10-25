/**
 * Common Components
 * 
 * Reusable components that follow the design system.
 * These components replace scattered inline styles throughout the application.
 */

// Common styled components
export { StyledButton } from './StyledButton';
export { StyledBadge } from './StyledBadge';
export { StyledCard } from './StyledCard';

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

export type { ButtonVariant, ButtonSize } from './StyledButton';
export type { BadgeVariant, BadgeSize } from './StyledBadge';
export type { CardVariant, CardPadding } from './StyledCard';
