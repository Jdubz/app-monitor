# Frontend Observability System - AI Agent Debugging

## Executive Summary

This document outlines a comprehensive frontend observability system designed specifically for AI agent debugging. The system captures structured logs, performance metrics, state changes, and user interactions, streaming them to the backend for persistent storage and analysis.

## Current State Analysis

### Existing Infrastructure

**Logger (`frontend/src/utils/logger.ts`)**
- Simple wrapper around `console.*` methods
- Scoped logging with `[scope]` prefix
- Environment-aware (suppresses debug/info in production)
- **Limitations:**
  - No persistence
  - No structure
  - No context capture
  - Logs lost on page refresh
  - No batching or streaming

**BoundedLogBuffer (`frontend/src/utils/boundedLogBuffer.ts`)**
- Circular buffer with fixed capacity
- Used by InteractiveSession for terminal logs
- **Limitations:**
  - Generic, not log-specific
  - No serialization
  - No automatic flushing
  - Memory-only

**ApiClient (`frontend/src/services/ApiClient.ts`)**
- Has basic logging for API requests
- No request/response correlation
- No timing information
- No error context

### Current Usage Patterns

1. **Component Logging** - Ad-hoc console.log statements
2. **API Logging** - Basic debug logs in ApiClient
3. **Socket Logging** - createLogger used in socket service
4. **Interactive Terminal** - BoundedLogBuffer for session logs
5. **Error Handling** - useErrorHandler hook with basic console.error

## Design Goals

### Primary Objectives

1. **AI-First Design** - Logs must be structured for LLM consumption
2. **Complete Traceability** - Track user actions through entire system
3. **Automatic Context** - Capture state without manual logging
4. **Performance Aware** - Minimal overhead, non-blocking
5. **Persistent** - Survive page refreshes, available for debugging
6. **Queryable** - Backend can search/filter logs efficiently

### AI Agent Debugging Requirements

**Context Requirements:**
- Component hierarchy and props
- Redux/Context state at time of event
- User action sequence (breadcrumbs)
- Network request/response correlation
- Timing information (performance)
- Environment metadata (browser, screen size, etc.)

**Structured Format:**
```typescript
interface FrontendLogEntry {
  // Core fields
  id: string;                    // Unique log ID
  timestamp: string;             // ISO timestamp
  level: 'debug' | 'info' | 'warn' | 'error' | 'trace';
  message: string;               // Human-readable message
  scope: string;                 // Component/module name

  // Context
  context: {
    // Component context
    component?: string;          // Component name
    props?: Record<string, unknown>;
    state?: Record<string, unknown>;

    // User context
    userId?: string;
    sessionId: string;           // Browser session

    // Navigation context
    route: string;               // Current route
    previousRoute?: string;

    // State context
    storeState?: Record<string, unknown>;  // Redux/Context state snapshot
  };

  // Metadata
  metadata: {
    // Environment
    userAgent: string;
    viewport: { width: number; height: number };
    online: boolean;

    // Performance
    memory?: {
      used: number;
      total: number;
    };

    // Source location
    file?: string;
    line?: number;
    column?: number;
  };

  // Event specific data
  data?: Record<string, unknown>;

  // Error details (if level === 'error')
  error?: {
    name: string;
    message: string;
    stack?: string;
    cause?: unknown;
  };

  // Breadcrumbs (user actions leading to this log)
  breadcrumbs?: Array<{
    timestamp: string;
    category: 'navigation' | 'click' | 'input' | 'api' | 'state';
    message: string;
    data?: Record<string, unknown>;
  }>;

  // Request correlation (for API calls)
  requestId?: string;
  parentRequestId?: string;
}
```

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Logger     │    │  Breadcrumbs │    │  Performance │  │
│  │   Enhanced   │───▶│   Tracker    │───▶│   Monitor    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│          │                    │                    │         │
│          └────────────────────┴────────────────────┘         │
│                             │                                │
│                     ┌───────▼────────┐                       │
│                     │  Log Collector │                       │
│                     │  (Buffer)      │                       │
│                     └───────┬────────┘                       │
│                             │                                │
│                     ┌───────▼────────┐                       │
│                     │  Log Transport │                       │
│                     │  (Batch/Stream)│                       │
│                     └───────┬────────┘                       │
│                             │                                │
└─────────────────────────────┼────────────────────────────────┘
                              │ HTTPS POST
                              │ /api/logs/frontend
                              │
┌─────────────────────────────▼────────────────────────────────┐
│                        Backend                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Logs API   │───▶│ Log Processor│───▶│  File Writer │  │
│  │   Endpoint   │    │  (Validate)  │    │  (JSON Lines)│  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                   │          │
│                                           ┌───────▼────────┐ │
│                                           │ logs/           │ │
│                                           │  frontend-     │ │
│                                           │  YYYY-MM-DD    │ │
│                                           │  .jsonl        │ │
│                                           └────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Log Creation** - Component/service calls logger
2. **Context Enrichment** - Automatic context capture
3. **Breadcrumb Append** - Add to breadcrumb trail
4. **Buffer** - Add to circular buffer (1000 entries)
5. **Batch** - Collect logs until threshold (100 logs or 10s)
6. **Transport** - POST to backend endpoint
7. **Persist** - Backend writes to JSONL file
8. **Rotate** - Daily log rotation

### Batching Strategy

**Triggers for flushing:**
- Buffer reaches 100 entries
- 10 seconds since last flush
- Page unload (beforeunload event)
- Error level log (immediate flush)
- Manual flush call

**Network resilience:**
- Retry failed uploads (3 attempts with exponential backoff)
- Store in localStorage if offline
- Send on reconnect

## Implementation Plan

### Phase 1: Enhanced Logger

**File:** `frontend/src/utils/observability/logger.ts`

```typescript
import { LogLevel, FrontendLogEntry, LoggerOptions } from './types';
import { ContextCollector } from './contextCollector';
import { BreadcrumbTracker } from './breadcrumbTracker';
import { LogTransport } from './logTransport';

export class EnhancedLogger {
  private scope: string;
  private contextCollector: ContextCollector;
  private breadcrumbTracker: BreadcrumbTracker;
  private transport: LogTransport;

  constructor(scope: string, options?: LoggerOptions) {
    this.scope = scope;
    this.contextCollector = ContextCollector.getInstance();
    this.breadcrumbTracker = BreadcrumbTracker.getInstance();
    this.transport = LogTransport.getInstance();
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: FrontendLogEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      level,
      message,
      scope: this.scope,
      context: this.contextCollector.collect(),
      metadata: this.collectMetadata(),
      data: this.serializeData(data),
      breadcrumbs: this.breadcrumbTracker.getRecent(10),
    };

    // Add to transport buffer
    this.transport.add(entry);

    // Also log to console for development
    if (import.meta.env.MODE !== 'production') {
      this.consoleLog(level, message, data);
    }

    // Immediate flush for errors
    if (level === 'error') {
      this.transport.flush();
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error | unknown, data?: unknown): void {
    const entry = {
      ...data,
      error: this.serializeError(error),
    };
    this.log('error', message, entry);
  }
}
```

### Phase 2: Context Collection

**File:** `frontend/src/utils/observability/contextCollector.ts`

Automatically captures:
- Current route
- Store state (Redux/Context)
- Component tree (via React DevTools hook)
- User session info
- Performance metrics

### Phase 3: Breadcrumb Tracking

**File:** `frontend/src/utils/observability/breadcrumbTracker.ts`

Automatically tracks:
- Navigation events
- Click events (with element path)
- Form submissions
- API calls
- State changes

### Phase 4: Log Transport

**File:** `frontend/src/utils/observability/logTransport.ts`

Handles:
- Batching
- Compression (optional)
- Retries
- Offline queue
- Flush strategies

### Phase 5: Backend Endpoint

**File:** `backend/src/routes/logs.routes.ts`

```typescript
router.post('/logs/frontend', async (req, res) => {
  const logs = req.body.logs as FrontendLogEntry[];

  // Validate
  if (!Array.isArray(logs)) {
    return res.status(400).json({
      success: false,
      error: 'invalid_payload'
    });
  }

  // Write to log file
  await logWriter.writeFrontendLogs(logs);

  res.json({ success: true });
});
```

**File:** `backend/src/services/frontendLogWriter.ts`

Writes logs to:
```
backend/logs/frontend/YYYY-MM-DD.jsonl
```

### Phase 6: Integration

Update all existing loggers:
```typescript
// Before
const log = createLogger('ComponentName');

// After
const log = createEnhancedLogger('ComponentName');
```

## Storage Format

**Log Files:** JSON Lines (JSONL) format
- One JSON object per line
- Easy to stream/parse
- Efficient append operations

**Example:**
```jsonl
{"id":"log-123","timestamp":"2025-11-15T10:30:00.000Z","level":"info","message":"User clicked button","scope":"TaskQueue",...}
{"id":"log-124","timestamp":"2025-11-15T10:30:01.234Z","level":"error","message":"API call failed","scope":"ApiClient",...}
```

## Performance Considerations

### Memory
- Circular buffer limits to 1000 entries (~500KB)
- Breadcrumbs limited to 50 entries
- Context snapshots are shallow copies

### Network
- Batch uploads reduce requests
- Compression reduces payload size
- Throttle to max 1 upload per 10s
- Deduplication of identical logs

### CPU
- Async serialization
- Web Worker for compression (optional)
- Debounced flush operations

## Privacy & Security

### Data Sanitization
- Remove API keys from request headers
- Mask sensitive form inputs (password, SSN, etc.)
- Redact PII from error messages
- Filter sensitive cookies

### Data Retention
- Frontend logs retained for 30 days
- Automatic rotation and cleanup
- No sensitive data in production logs

## Query Interface (Future)

Backend endpoint to query logs:
```
GET /api/logs/frontend/search?
  startDate=2025-11-15&
  endDate=2025-11-16&
  level=error&
  scope=ApiClient&
  sessionId=abc123
```

## Metrics & Monitoring

Track logging system itself:
- Logs/second rate
- Buffer overflow rate
- Upload success rate
- Upload latency
- Storage size

## Migration Strategy

### Phase 1 (Week 1)
- Implement enhanced logger
- Add backend endpoint
- Deploy to staging

### Phase 2 (Week 2)
- Migrate critical components (ApiClient, store)
- Test in staging
- Monitor performance

### Phase 3 (Week 3)
- Migrate remaining components
- Deploy to production
- Enable monitoring

### Phase 4 (Week 4)
- Add query interface
- Create debugging dashboard
- AI agent integration

## Success Metrics

- **Coverage:** 90%+ of components using enhanced logger
- **Performance:** <50ms p95 logging overhead
- **Reliability:** 99%+ upload success rate
- **Storage:** <100MB/day log volume
- **Debugging:** Reduce mean time to debug by 50%

## AI Agent Usage

Example AI debugging query:
```
"Show me all errors in the DevBotsTabContent component
in the last hour where the user was on the /monitor/dev-bots
route and the queueRows array was empty"
```

Enhanced logger provides all context needed to answer this.

## Open Questions

1. Should we use WebSockets for real-time streaming?
2. Should we compress logs before upload?
3. Should we support log sampling (only log % of events)?
4. Should we integrate with external services (Sentry, LogRocket)?
5. Should we capture screenshots on errors?

## References

- Sentry Browser SDK architecture
- LogRocket implementation patterns
- OpenTelemetry browser spec
- Web Vitals monitoring
