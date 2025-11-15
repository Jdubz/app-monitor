# Frontend Observability Implementation - Summary & Next Steps

## What Has Been Completed

### 1. Design Document ✅
**File:** `docs/architecture/frontend-observability-design.md`

Comprehensive design for AI-first frontend observability including:
- System architecture and data flow
- Structured log format optimized for LLM consumption
- Batching and transport strategy
- Performance considerations
- Privacy and security guidelines
- Migration strategy and success metrics

**Key Design Decisions:**
- JSON Lines (JSONL) format for efficient streaming and parsing
- Batch uploads every 100 logs or 10 seconds
- Circular buffer with 1000 entry capacity
- Automatic context capture (route, state, performance)
- Breadcrumb trail of user actions (last 50 events)
- Source location from error stacks
- Sensitive data sanitization

### 2. Type Definitions ✅
**File:** `frontend/src/utils/observability/types.ts`

Complete TypeScript interfaces for:
- `FrontendLogEntry` - Core log structure with rich context
- `LogContext` - Component, navigation, state context
- `LogMetadata` - Environment, performance, build info
- `Breadcrumb` - User action trail
- `SerializedError` - Comprehensive error details
- `LogBatch` - Batch upload structure
- `LoggerOptions` - Configuration options
- `TransportStats` - Monitoring metrics

**Benefits:**
- Type-safe logging throughout frontend
- Self-documenting API
- IDE autocomplete support
- Compile-time validation

### 3. Context Collector ✅
**File:** `frontend/src/utils/observability/contextCollector.ts`

Singleton service that automatically captures:

**Session Tracking:**
- Persistent session ID (survives page reloads)
- Unique tab ID (per browser tab)
- User identification (when authenticated)

**Navigation Context:**
- Current route and previous route
- Query parameters
- Hash fragments
- Automatic route change tracking

**Environment Metadata:**
- User agent, platform, language
- Viewport dimensions
- Online/offline status
- Memory usage (Chrome only)
- Performance timing metrics
- Build info (timestamp, commit hash, version)

**State Management:**
- Store state snapshots
- Sanitization of sensitive data
- Custom context fields

**API:**
```typescript
const collector = ContextCollector.getInstance();
collector.setUser(userId, userEmail);
collector.setStoreState(reduxState);
collector.setContext('activeTask', taskId);
const context = collector.collect(); // Get current context
```

### 4. Breadcrumb Tracker ✅
**File:** `frontend/src/utils/observability/breadcrumbTracker.ts`

Singleton service that automatically tracks:

**Navigation Events:**
- Page loads
- Route changes (popstate)
- Hash changes

**User Interactions:**
- Click events with element path and text
- Form submissions (future)
- Keyboard events (future)

**Network Requests:**
- Fetch API calls (method, URL, status, duration)
- XMLHttpRequest calls
- Request/response correlation
- Error tracking

**Console Output:**
- console.log, console.warn, console.error
- Preserves original console behavior
- Formats and truncates output

**Errors:**
- Unhandled exceptions
- Unhandled promise rejections
- Error details and stack traces

**Configuration:**
- Rolling buffer (default: 100 breadcrumbs)
- Configurable capacity
- Get recent N breadcrumbs
- Clear all breadcrumbs

**API:**
```typescript
const tracker = BreadcrumbTracker.getInstance();
tracker.add({
  category: 'user',
  message: 'User clicked submit button',
  data: { formId: 'login-form' }
});
const recent = tracker.getRecent(10); // Last 10 breadcrumbs
```

## What Needs to Be Implemented

### Phase 1: Core Logger (Priority: HIGH)
**File:** `frontend/src/utils/observability/enhancedLogger.ts`

Need to create the main logger class that:
- Uses ContextCollector and BreadcrumbTracker
- Generates unique log IDs
- Serializes errors with stack traces
- Adds logs to transport buffer
- Supports all log levels (trace, debug, info, warn, error, fatal)
- Immediate flush for errors
- Optional console passthrough

**Estimated effort:** 4-6 hours

### Phase 2: Log Transport (Priority: HIGH)
**File:** `frontend/src/utils/observability/logTransport.ts`

Need to implement:
- Circular buffer for log entries
- Batching logic (100 logs or 10s interval)
- HTTP POST to backend endpoint
- Retry logic with exponential backoff
- Offline queue in localStorage
- Compression (optional, using pako or similar)
- beforeunload handler for final flush
- Transport stats tracking

**Estimated effort:** 6-8 hours

### Phase 3: Backend Endpoint (Priority: HIGH)
**File:** `backend/src/routes/logs.routes.ts`

Need to create:
- POST `/api/logs/frontend` endpoint
- Request validation
- Rate limiting (prevent abuse)
- Authentication check
- Log file writer service

**File:** `backend/src/services/frontendLogWriter.ts`

Need to implement:
- Write logs to JSONL files
- Daily rotation (logs/frontend/YYYY-MM-DD.jsonl)
- Async/non-blocking writes
- Error handling
- File size limits
- Cleanup old logs (30-day retention)

**Estimated effort:** 4-6 hours

### Phase 4: React Hook (Priority: MEDIUM)
**File:** `frontend/src/hooks/useLogger.ts`

Create React hook for component logging:
```typescript
function MyComponent() {
  const log = useLogger('MyComponent');

  useEffect(() => {
    log.info('Component mounted', { props });
  }, []);

  const handleClick = () => {
    log.debug('Button clicked', { userId });
  };
}
```

Features:
- Automatic component name in scope
- Automatic props capture
- Breadcrumb integration
- Context management

**Estimated effort:** 2-3 hours

### Phase 5: Migration (Priority: MEDIUM)
Replace existing logger usage:

1. Update `frontend/src/utils/logger.ts` to export enhanced logger
2. Migrate critical components:
   - ApiClient
   - DevBotsStore
   - Socket service
   - Error handlers
3. Add logger to new components via hook

**Estimated effort:** 4-6 hours

### Phase 6: Monitoring Dashboard (Priority: LOW)
**File:** `backend/src/routes/logs.routes.ts` (query endpoint)

Create UI for viewing logs:
- Search by date, level, scope, session
- View breadcrumb trails
- Error grouping
- Performance metrics
- Download logs

**Estimated effort:** 12-16 hours

## File Structure

```
frontend/src/utils/observability/
├── types.ts                    ✅ Complete
├── contextCollector.ts         ✅ Complete
├── breadcrumbTracker.ts        ✅ Complete
├── enhancedLogger.ts           ⏳ TODO
├── logTransport.ts             ⏳ TODO
├── index.ts                    ⏳ TODO (barrel export)
└── __tests__/
    ├── contextCollector.test.ts   ⏳ TODO
    ├── breadcrumbTracker.test.ts  ⏳ TODO
    ├── enhancedLogger.test.ts     ⏳ TODO
    └── logTransport.test.ts       ⏳ TODO

frontend/src/hooks/
└── useLogger.ts                ⏳ TODO

backend/src/routes/
└── logs.routes.ts              ⏳ TODO

backend/src/services/
└── frontendLogWriter.ts        ⏳ TODO

backend/logs/frontend/
└── YYYY-MM-DD.jsonl           (created at runtime)
```

## Example Usage (After Full Implementation)

### Basic Logging
```typescript
import { createEnhancedLogger } from '@/utils/observability';

const log = createEnhancedLogger('TaskQueue');

// Automatic context, breadcrumbs, metadata
log.info('Task started', { taskId: '123' });
log.error('Task failed', new Error('Connection timeout'), { taskId: '123' });
```

### React Component
```typescript
import { useLogger } from '@/hooks/useLogger';

function TaskList() {
  const log = useLogger('TaskList');
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    log.debug('Fetching tasks');
    fetchTasks()
      .then(tasks => {
        log.info('Tasks loaded', { count: tasks.length });
        setTasks(tasks);
      })
      .catch(error => {
        log.error('Failed to load tasks', error);
      });
  }, []);
}
```

### Manual Breadcrumbs
```typescript
import { BreadcrumbTracker } from '@/utils/observability';

const tracker = BreadcrumbTracker.getInstance();
tracker.add({
  category: 'state',
  message: 'User enabled dark mode',
  data: { theme: 'dark' }
});
```

### Context Management
```typescript
import { ContextCollector } from '@/utils/observability';

const context = ContextCollector.getInstance();

// Set user after login
context.setUser(user.id, user.email);

// Track active feature
context.setContext('activeFeature', 'dev-bots');

// Store state (from Redux middleware)
context.setStoreState(store.getState());
```

## Backend Log Format Example

**File:** `backend/logs/frontend/2025-11-15.jsonl`

```jsonl
{"id":"log-1731679200000-abc123","timestamp":"2025-11-15T10:30:00.000Z","level":"error","message":"API call failed","scope":"ApiClient","context":{"sessionId":"session-xyz","tabId":"tab-abc","route":"/monitor/dev-bots","storeState":{"devBots":{"queueSize":3}}},"metadata":{"userAgent":"Mozilla/5.0...","viewport":{"width":1920,"height":1080},"online":true},"error":{"name":"NetworkError","message":"Failed to fetch","stack":"Error: Failed to fetch\n  at ApiClient.get..."},"breadcrumbs":[{"timestamp":"2025-11-15T10:29:55.000Z","category":"click","message":"Clicked: button#refresh-btn"},{"timestamp":"2025-11-15T10:29:56.000Z","category":"api","message":"GET /api/dev-bots/status → 200"}]}
```

## Testing Strategy

1. **Unit Tests** - Test each component in isolation
2. **Integration Tests** - Test logger → transport → backend flow
3. **Performance Tests** - Ensure <50ms p95 overhead
4. **Load Tests** - Test with 1000s of logs
5. **Offline Tests** - Verify localStorage queue works
6. **Error Tests** - Test error serialization and stack traces

## Deployment Strategy

1. **Week 1:** Implement core logger and transport
2. **Week 2:** Add backend endpoint and test in dev
3. **Week 3:** Deploy to staging, migrate critical components
4. **Week 4:** Deploy to production with monitoring
5. **Week 5:** Migrate remaining components
6. **Week 6:** Add query UI and AI integration

## Success Metrics

- **Coverage:** 90%+ of components using enhanced logger
- **Performance:** <50ms p95 logging overhead
- **Reliability:** 99%+ upload success rate
- **Storage:** <100MB/day log volume
- **Debugging:** 50% reduction in mean time to debug

## AI Agent Benefits

With this system, an AI agent can:

1. **Trace user actions** - See breadcrumb trail leading to error
2. **Understand state** - Know exact Redux/Context state at time of event
3. **Correlate requests** - Match API calls to UI actions
4. **Identify patterns** - Group similar errors, find edge cases
5. **Suggest fixes** - Analyze logs to recommend code changes

Example query:
```
"Show me all errors in DevBotsTabContent where queueRows was empty
and the user navigated from /monitor/prs route in the last 24 hours"
```

The structured logs make this trivial to answer.

## Open Questions

1. Should we use WebSockets for real-time log streaming?
   - **Recommendation:** Start with HTTP POST, add WebSocket later if needed

2. Should we compress logs before upload?
   - **Recommendation:** Yes, use gzip for batches >10KB

3. Should we support log sampling?
   - **Recommendation:** Yes, add 10% sampling for debug logs in production

4. Should we integrate with Sentry/LogRocket?
   - **Recommendation:** Keep independent, but allow integration hooks

5. Should we capture screenshots on errors?
   - **Recommendation:** Future enhancement, privacy concerns

## Next Steps

**Immediate (This Week):**
1. Implement EnhancedLogger class
2. Implement LogTransport with batching
3. Add backend endpoint for log ingestion
4. Write tests for core components

**Short-term (Next Week):**
1. Create useLogger React hook
2. Migrate ApiClient and DevBotsStore
3. Deploy to staging environment
4. Monitor performance and reliability

**Long-term (Next Month):**
1. Migrate all components to enhanced logger
2. Build query UI for log exploration
3. Add AI agent integration
4. Performance optimization based on metrics

## Resources Needed

- **Development Time:** ~40-50 hours total
- **Storage:** ~3GB/month for logs (estimated)
- **Backend CPU:** Minimal impact (<1% increase)
- **Network:** ~1MB/day upload per user (compressed)

## Questions?

Contact the development team for clarification on any aspect of this implementation.
