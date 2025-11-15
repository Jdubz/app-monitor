/**
 * Frontend Observability Types
 *
 * Comprehensive type definitions for the frontend logging and observability system.
 * Designed for AI agent debugging with rich context and structured data.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type BreadcrumbCategory = 'navigation' | 'click' | 'input' | 'api' | 'state' | 'user' | 'console';

export interface Breadcrumb {
  timestamp: string;
  category: BreadcrumbCategory;
  message: string;
  level?: LogLevel;
  data?: Record<string, unknown>;
}

export interface LogContext {
  // Component context
  component?: string;
  componentStack?: string[];
  props?: Record<string, unknown>;
  state?: Record<string, unknown>;

  // User context
  userId?: string;
  userEmail?: string;
  sessionId: string;
  tabId: string;

  // Navigation context
  route: string;
  previousRoute?: string;
  queryParams?: Record<string, string>;
  hash?: string;

  // Store/State context
  storeState?: Record<string, unknown>;
  storeStateDiff?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };

  // Request correlation
  requestId?: string;
  parentRequestId?: string;
  traceId?: string;
}

export interface LogMetadata {
  // Environment
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  online: boolean;
  language: string;
  platform: string;

  // Performance
  memory?: {
    used: number;
    total: number;
    limit: number;
  };
  performance?: {
    navigationStart?: number;
    loadComplete?: number;
    domContentLoaded?: number;
  };

  // Source location (from Error stack)
  file?: string;
  line?: number;
  column?: number;
  function?: string;

  // Build info
  buildTimestamp?: string;
  commitHash?: string;
  version?: string;

  // Feature flags
  features?: Record<string, boolean>;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  code?: string | number;

  // HTTP error details
  status?: number;
  statusText?: string;
  url?: string;
  method?: string;

  // Additional context
  context?: Record<string, unknown>;
}

export interface FrontendLogEntry {
  // Core fields
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  scope: string;

  // Rich context
  context: LogContext;
  metadata: LogMetadata;

  // Event data
  data?: Record<string, unknown>;

  // Error details
  error?: SerializedError;

  // Breadcrumbs (user action trail)
  breadcrumbs?: Breadcrumb[];

  // Tags for filtering
  tags?: string[];

  // Performance timing
  duration?: number;
  startTime?: number;
  endTime?: number;
}

export interface LogBatch {
  logs: FrontendLogEntry[];
  sessionId: string;
  batchId: string;
  timestamp: string;
  count: number;
}

export interface LoggerOptions {
  // Buffering
  bufferSize?: number;
  flushInterval?: number;
  flushThreshold?: number;

  // Context
  captureContext?: boolean;
  captureBreadcrumbs?: boolean;
  maxBreadcrumbs?: number;

  // Performance
  enablePerformanceTracking?: boolean;
  sampleRate?: number;  // 0-1, percentage of logs to capture

  // Privacy
  sanitizeData?: boolean;
  excludeFields?: string[];

  // Transport
  endpoint?: string;
  retryAttempts?: number;
  retryDelay?: number;
  useCompression?: boolean;
}

export interface TransportStats {
  totalLogs: number;
  successfulUploads: number;
  failedUploads: number;
  retriesAttempted: number;
  lastUploadTime?: string;
  lastUploadDuration?: number;
  queuedLogs: number;
  droppedLogs: number;
}

export interface ContextSnapshot {
  timestamp: string;
  route: string;
  storeState: Record<string, unknown>;
  activeTasks?: string[];
  networkState: {
    online: boolean;
    pendingRequests: number;
  };
}

/**
 * Hook for React component logging
 */
export interface UseLoggerReturn {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, error?: Error | unknown, data?: unknown) => void;
  trace: (message: string, data?: unknown) => void;
  addBreadcrumb: (breadcrumb: Omit<Breadcrumb, 'timestamp'>) => void;
  setContext: (key: string, value: unknown) => void;
  flush: () => Promise<void>;
}

/**
 * Log filter for querying
 */
export interface LogFilter {
  startDate?: string;
  endDate?: string;
  levels?: LogLevel[];
  scopes?: string[];
  sessionId?: string;
  search?: string;
  tags?: string[];
  hasError?: boolean;
  minDuration?: number;
  limit?: number;
  offset?: number;
}

/**
 * Backend response for log submission
 */
export interface LogSubmissionResponse {
  success: boolean;
  received: number;
  processed: number;
  errors?: Array<{
    index: number;
    error: string;
  }>;
  batchId?: string;
}
