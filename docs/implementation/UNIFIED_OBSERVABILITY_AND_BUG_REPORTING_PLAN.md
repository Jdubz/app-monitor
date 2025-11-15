# Unified Observability & Bug Reporting System - Implementation Plan

**Status:** Planning
**Created:** 2025-11-15
**Owner:** Full Stack Platform
**Priority:** HIGH - Foundation for AI-first debugging

---

## Executive Summary

This plan unifies two complementary systems into a cohesive, DRY, and modular architecture:

1. **Frontend Observability** (In Progress) - Continuous logging, context capture, breadcrumb tracking
2. **Bug Reporting** (Imagineer Reference) - User-triggered snapshots with screenshots and annotations

**Key Insight:** Both systems capture similar data (logs, network events, environment, state) but serve different use cases:
- **Observability**: Continuous streaming for AI agent debugging and production monitoring
- **Bug Reports**: Point-in-time snapshots triggered by users or errors for human review

**Solution:** Build a **shared collection layer** that both systems leverage, eliminating duplication while maintaining separation of concerns.

---

## Analysis: System Comparison

### Imagineer Bug Report System (Reference Implementation)

**Key Features:**
1. **Screenshot Capture** - `html2canvas` with annotation support
2. **Network Event Tracking** - Fetch/XHR interception with request/response capture
3. **Log Collection** - Ring buffer of last 200 log entries
4. **Environment Snapshot** - App version, git SHA, build time, mode
5. **Client Metadata** - URL, user agent, platform, viewport, timezone
6. **App State Collection** - Pluggable collectors via `registerCollector()`
7. **Quality Enhancement Fields** - Expected behavior, actual behavior, steps to reproduce
8. **Backend Storage** - JSON submission to `/api/bug-reports`

**Architecture:**
```
BugReportContext
├── Log Buffer (max 200 entries)
├── Network Events Buffer (max 50 events)
├── Fetch Interceptor
├── Screenshot Capture (html2canvas)
├── State Collectors (pluggable)
└── Modal UI with annotation canvas
```

**Strengths:**
- ✅ Screenshot annotation UI
- ✅ Pluggable state collectors
- ✅ Quality enhancement fields for better bug reports
- ✅ Request/response body capture
- ✅ Comprehensive serialization with circular reference detection

**Limitations:**
- ❌ No breadcrumb tracking (user action trail)
- ❌ No performance metrics
- ❌ No source location tracking
- ❌ No automatic error boundary integration
- ❌ Fixed buffer sizes (not configurable)
- ❌ No log streaming (store-only)

### App Monitor Observability System (In Progress)

**Key Features:**
1. **Enhanced Logger** - Structured logging with automatic context
2. **Context Collector** - Session, navigation, environment, state snapshots
3. **Breadcrumb Tracker** - Automatic user action trail
4. **Log Transport** - Batched streaming to backend
5. **Type-Safe** - Comprehensive TypeScript interfaces
6. **Performance Tracking** - Memory, timing, metrics

**Architecture:**
```
Observability
├── EnhancedLogger (planned)
├── ContextCollector (✅ done)
├── BreadcrumbTracker (✅ done)
├── LogTransport (planned)
└── Types (✅ done)
```

**Strengths:**
- ✅ Breadcrumb trail for AI debugging
- ✅ Automatic context capture
- ✅ Performance metrics
- ✅ Designed for continuous operation
- ✅ Source location from error stacks
- ✅ Configurable buffers and sampling

**Limitations:**
- ❌ No screenshot capture
- ❌ No annotation UI
- ❌ No user-triggered snapshots
- ❌ No quality enhancement fields
- ❌ Transport layer not implemented yet

---

## Unified Architecture

### Design Principles

1. **DRY** - Single source of truth for log collection, network tracking, serialization
2. **Modular** - Independent modules with clear boundaries
3. **Testable** - Each component unit testable in isolation
4. **Extensible** - Plugin architecture for custom collectors
5. **Performance** - Non-blocking, batched, configurable
6. **Type-Safe** - Full TypeScript coverage

### Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                  SHARED COLLECTION LAYER                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                │
│  │ ContextCollector   │  │ BreadcrumbTracker  │                │
│  │ (singleton)        │  │ (singleton)        │                │
│  └────────────────────┘  └────────────────────┘                │
│            │                       │                             │
│            └───────────┬───────────┘                             │
│                        │                                         │
│  ┌────────────────────▼────────────────────┐                    │
│  │   DataCollectionService (NEW)           │                    │
│  │   - Centralized log buffer              │                    │
│  │   - Network event tracking              │                    │
│  │   - Serialization utilities             │                    │
│  │   - Pluggable collectors                │                    │
│  └─────────────────────────────────────────┘                    │
│                        │                                         │
└────────────────────────┼─────────────────────────────────────────┘
                         │
           ┌─────────────┴──────────────┐
           │                            │
┌──────────▼─────────┐      ┌──────────▼──────────┐
│ OBSERVABILITY      │      │ BUG REPORTING       │
│ SYSTEM             │      │ SYSTEM              │
├────────────────────┤      ├─────────────────────┤
│                    │      │                     │
│ EnhancedLogger     │      │ BugReportProvider   │
│ LogTransport       │      │ Screenshot Capture  │
│ Continuous Logs    │      │ Annotation UI       │
│ Stream to Backend  │      │ Quality Fields      │
│ AI Agent Focused   │      │ Human Review Focus  │
│                    │      │                     │
└────────────────────┘      └─────────────────────┘
           │                            │
           │                            │
           ▼                            ▼
┌─────────────────────────────────────────────────┐
│              BACKEND LAYER                       │
├─────────────────────────────────────────────────┤
│                                                  │
│  POST /api/logs/frontend    ← Observability     │
│  POST /api/bug-reports      ← Bug Reports       │
│                                                  │
│  ┌──────────────────┐  ┌───────────────────┐   │
│  │ FrontendLogWriter│  │ BugReportHandler  │   │
│  │ (JSONL files)    │  │ (JSON + PNG)      │   │
│  └──────────────────┘  └───────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## Shared Collection Layer

### DataCollectionService (NEW)

Centralized service that both systems use for data collection.

**File:** `frontend/src/utils/observability/dataCollectionService.ts`

**Responsibilities:**
- Maintain log buffer (circular, configurable size)
- Track network events (fetch/XHR interception)
- Provide serialization utilities
- Manage pluggable collectors
- Handle buffer limits and cleanup

**API:**
```typescript
class DataCollectionService {
  // Singleton
  static getInstance(): DataCollectionService

  // Log management
  addLog(entry: LogEntry): void
  getLogs(count?: number): LogSnapshot[]
  clearLogs(): void

  // Network tracking
  addNetworkEvent(event: NetworkEventSnapshot): void
  getNetworkEvents(count?: number): NetworkEventSnapshot[]
  clearNetworkEvents(): void

  // State collectors (shared with Imagineer pattern)
  registerCollector(name: string, collector: CollectorFn): () => void
  collectState(): Promise<Record<string, unknown>>

  // Serialization (shared utilities)
  serialize(value: unknown, options?: SerializeOptions): unknown
  serializeError(error: unknown): SerializedError

  // Configuration
  setLogBufferSize(size: number): void
  setNetworkBufferSize(size: number): void
}
```

**Benefits:**
- ✅ Single source of truth for all collected data
- ✅ Eliminates duplication between systems
- ✅ Testable in isolation
- ✅ Configurable buffer sizes
- ✅ Consistent serialization logic

---

## Implementation Phases

### Phase 1: Shared Collection Layer (Week 1)

**Priority:** P0 - Foundation for both systems

**Tasks:**
1. Create `DataCollectionService` class
   - File: `frontend/src/utils/observability/dataCollectionService.ts`
   - Circular log buffer (default: 1000 entries)
   - Network event buffer (default: 50 events)
   - Serialization utilities (from Imagineer)
   - Pluggable collectors

2. Refactor existing components to use `DataCollectionService`
   - Update `BreadcrumbTracker` to use shared service
   - Update `ContextCollector` to register with service

3. Add comprehensive tests
   - File: `frontend/src/utils/observability/__tests__/dataCollectionService.test.ts`
   - Test buffer limits
   - Test circular behavior
   - Test serialization edge cases
   - Test collector registration

**Estimated Effort:** 8-12 hours

**Acceptance Criteria:**
- ✅ DataCollectionService passes all tests
- ✅ Log buffer works correctly with configurable size
- ✅ Network tracking intercepts fetch/XHR
- ✅ Serialization handles circular references
- ✅ Collectors can be registered/unregistered

### Phase 2: Enhanced Logger + Transport (Week 1-2)

**Priority:** P0 - Core observability

**Tasks:**
1. Implement `EnhancedLogger`
   - File: `frontend/src/utils/observability/enhancedLogger.ts`
   - Use `DataCollectionService` for log storage
   - Automatic context from `ContextCollector`
   - Automatic breadcrumbs from `BreadcrumbTracker`
   - Error serialization
   - Source location extraction

2. Implement `LogTransport`
   - File: `frontend/src/utils/observability/logTransport.ts`
   - Batched uploads (100 logs or 10s)
   - Retry with exponential backoff
   - Offline queue in localStorage
   - beforeunload flush

3. Backend endpoint
   - File: `backend/src/routes/logs.routes.ts`
   - POST `/api/logs/frontend`
   - Validation
   - Rate limiting

4. Log file writer
   - File: `backend/src/services/frontendLogWriter.ts`
   - JSONL format
   - Daily rotation
   - 30-day retention

**Estimated Effort:** 12-16 hours

**Acceptance Criteria:**
- ✅ Logger creates structured log entries
- ✅ Transport batches and uploads logs
- ✅ Backend writes to JSONL files
- ✅ Offline queue works correctly
- ✅ Rate limiting prevents abuse

### Phase 3: Bug Report System (Week 2)

**Priority:** P1 - User-triggered snapshots

**Tasks:**
1. Implement `BugReportProvider` (adapted from Imagineer)
   - File: `frontend/src/contexts/BugReportContext.tsx`
   - Use `DataCollectionService` for logs/network
   - Screenshot capture with `html2canvas`
   - Annotation canvas UI
   - Quality enhancement fields
   - Modal dialog

2. Screenshot service
   - File: `frontend/src/utils/observability/screenshotService.ts`
   - Capture with options (scale, quality)
   - Annotation support
   - Error handling

3. Bug report modal
   - File: `frontend/src/components/BugReportModal.tsx`
   - Description field (required)
   - Expected behavior (optional)
   - Actual behavior (optional)
   - Steps to reproduce (optional)
   - Screenshot with annotation
   - Checkbox to include/exclude screenshot

4. Backend endpoint
   - File: `backend/src/routes/bugReports.routes.ts`
   - POST `/api/bug-reports`
   - Save JSON + PNG
   - File: `backend/src/services/bugReportWriter.ts`

**Estimated Effort:** 10-14 hours

**Acceptance Criteria:**
- ✅ Bug report modal opens on demand
- ✅ Screenshot captures and annotates
- ✅ Quality fields are optional but encouraged
- ✅ Backend stores JSON + screenshot
- ✅ ErrorBoundary integration works

### Phase 4: Integration & Polish (Week 3)

**Priority:** P1 - User experience

**Tasks:**
1. `ErrorBoundaryWithReporting` component
   - File: `frontend/src/components/ErrorBoundaryWithReporting.tsx`
   - Auto-open bug report on error
   - Pre-fill with error details
   - Show "Report Bug" button

2. React hooks
   - File: `frontend/src/hooks/useLogger.ts`
   - Component-scoped logging
   - File: `frontend/src/hooks/useBugReporter.ts`
   - Open bug report from components

3. Settings integration
   - Add bug report button to Settings menu
   - Keyboard shortcut (e.g., Ctrl+Shift+B)

4. Migration
   - Migrate critical components to use new logger
   - Add error boundaries with reporting
   - Update `ApiClient` to use enhanced logger

**Estimated Effort:** 8-10 hours

**Acceptance Criteria:**
- ✅ Error boundaries show bug report option
- ✅ useLogger hook works in components
- ✅ Settings menu has bug report button
- ✅ Keyboard shortcut works
- ✅ Migration complete for core components

### Phase 5: Backend Query Interface (Week 4)

**Priority:** P2 - Nice to have

**Tasks:**
1. Log query endpoint
   - File: `backend/src/routes/logs.routes.ts`
   - GET `/api/logs/frontend/search`
   - Query by date, level, scope, session
   - Pagination

2. Bug report listing
   - File: `backend/src/routes/bugReports.routes.ts`
   - GET `/api/bug-reports`
   - GET `/api/bug-reports/:id`
   - Pagination

3. Admin UI (future)
   - View bug reports
   - Search logs
   - Download attachments

**Estimated Effort:** 12-16 hours

**Acceptance Criteria:**
- ✅ Can query frontend logs
- ✅ Can list bug reports
- ✅ Can view individual bug report details
- ✅ Can download screenshots

---

## File Structure

### Frontend

```
frontend/src/
├── utils/observability/
│   ├── types.ts                          ✅ Done
│   ├── contextCollector.ts               ✅ Done
│   ├── breadcrumbTracker.ts              ✅ Done
│   ├── dataCollectionService.ts          ⏳ Phase 1
│   ├── enhancedLogger.ts                 ⏳ Phase 2
│   ├── logTransport.ts                   ⏳ Phase 2
│   ├── screenshotService.ts              ⏳ Phase 3
│   ├── serializationUtils.ts             ⏳ Phase 1
│   ├── index.ts                          ⏳ Barrel export
│   └── __tests__/
│       ├── contextCollector.test.ts      ⏳ TODO
│       ├── breadcrumbTracker.test.ts     ⏳ TODO
│       ├── dataCollectionService.test.ts ⏳ Phase 1
│       ├── enhancedLogger.test.ts        ⏳ Phase 2
│       ├── logTransport.test.ts          ⏳ Phase 2
│       └── screenshotService.test.ts     ⏳ Phase 3
│
├── contexts/
│   └── BugReportContext.tsx              ⏳ Phase 3
│
├── components/
│   ├── BugReportModal.tsx                ⏳ Phase 3
│   └── ErrorBoundaryWithReporting.tsx    ⏳ Phase 4
│
└── hooks/
    ├── useLogger.ts                      ⏳ Phase 4
    └── useBugReporter.ts                 ⏳ Phase 4
```

### Backend

```
backend/src/
├── routes/
│   ├── logs.routes.ts                    ⏳ Phase 2
│   └── bugReports.routes.ts              ⏳ Phase 3
│
├── services/
│   ├── frontendLogWriter.ts              ⏳ Phase 2
│   └── bugReportWriter.ts                ⏳ Phase 3
│
└── logs/
    ├── frontend/
    │   └── YYYY-MM-DD.jsonl              (runtime)
    └── bug-reports/
        ├── YYYY-MM-DD/
        │   ├── {report-id}.json          (runtime)
        │   └── {report-id}.png           (runtime)
        └── index.json                     (runtime)
```

### Shared Types

```
shared/api-contracts/
└── index.ts
    ├── FrontendLogBatch                  ⏳ Phase 2
    ├── BugReportSubmission               ⏳ Phase 3
    └── LogQueryRequest                   ⏳ Phase 5
```

---

## API Contracts

### POST /api/logs/frontend

**Request:**
```typescript
interface FrontendLogBatch {
  logs: FrontendLogEntry[]
  sessionId: string
  batchId: string
  timestamp: string
  count: number
}
```

**Response:**
```typescript
interface LogSubmissionResponse {
  success: boolean
  received: number
  processed: number
  errors?: Array<{ index: number; error: string }>
  batchId: string
}
```

### POST /api/bug-reports

**Request:**
```typescript
interface BugReportSubmission {
  description: string
  expectedBehavior?: string
  actualBehavior?: string
  stepsToReproduce?: string[]
  environment: EnvironmentSnapshot
  clientMeta: ClientMetadataSnapshot
  appState: Record<string, unknown>
  recentLogs: LogSnapshot[]
  networkEvents: NetworkEventSnapshot[]
  screenshot?: string  // base64 data URL
  screenshotError?: string
}
```

**Response:**
```typescript
interface BugReportSubmissionResponse {
  success: boolean
  report_id: string
  trace_id: string
  stored_at: string
}
```

---

## Shared Utilities

### SerializationUtils

**File:** `frontend/src/utils/observability/serializationUtils.ts`

Functions shared by both systems:

```typescript
// From Imagineer, enhanced for observability
export function serialize(
  value: unknown,
  options?: {
    maxDepth?: number
    maxProps?: number
    maxArrayLength?: number
  }
): unknown

export function serializeError(error: unknown): SerializedError

export function sanitize(
  data: Record<string, unknown>,
  sensitiveKeys: string[]
): Record<string, unknown>

export function truncateString(str: string, maxLength: number): string

export function detectCircular(value: unknown): boolean
```

---

## Migration Strategy

### Week 1: Foundation
1. Implement `DataCollectionService`
2. Implement `EnhancedLogger`
3. Implement `LogTransport`
4. Add backend log endpoint
5. Test in development

### Week 2: Bug Reporting
1. Implement `BugReportProvider`
2. Implement screenshot service
3. Add backend bug report endpoint
4. Test bug report flow
5. Deploy to staging

### Week 3: Integration
1. Add `ErrorBoundaryWithReporting`
2. Create React hooks
3. Migrate critical components
4. Add settings UI
5. Test end-to-end

### Week 4: Polish
1. Add query endpoints
2. Performance optimization
3. Documentation
4. Deploy to production
5. Monitor metrics

---

## Testing Strategy

### Unit Tests
- All utilities in isolation
- Serialization edge cases
- Buffer behavior
- Circular reference detection

### Integration Tests
- Logger → Transport → Backend flow
- Bug report submission flow
- Error boundary integration
- State collector registration

### E2E Tests
- User submits bug report
- Screenshot annotation works
- Error triggers bug report
- Logs are streamed to backend
- Offline queue recovery

### Performance Tests
- Log overhead <50ms p95
- Screenshot capture <500ms
- Serialization <100ms
- Buffer memory usage <10MB

---

## Success Metrics

### Observability System
- **Coverage:** 90%+ components using enhanced logger
- **Performance:** <50ms p95 logging overhead
- **Reliability:** 99%+ log upload success
- **Storage:** <100MB/day frontend logs
- **Debugging:** 50% reduction in MTTR

### Bug Reporting
- **Usage:** 10+ bug reports per week
- **Quality:** 80%+ include screenshot
- **Quality:** 60%+ include reproduction steps
- **Response:** <24h average triage time
- **Resolution:** 80%+ resolved within 7 days

---

## Configuration

### Frontend Environment Variables

```env
# Observability
VITE_LOG_LEVEL=debug|info|warn|error
VITE_LOG_BUFFER_SIZE=1000
VITE_LOG_FLUSH_INTERVAL=10000
VITE_LOG_BATCH_SIZE=100
VITE_ENABLE_LOG_STREAMING=true

# Bug Reports
VITE_ENABLE_BUG_REPORTS=true
VITE_BUG_REPORT_HOTKEY=ctrl+shift+b
VITE_SCREENSHOT_SCALE=0.5
VITE_SCREENSHOT_QUALITY=0.8

# Build Info (auto-populated)
VITE_APP_VERSION=1.0.0
VITE_GIT_SHA=abc123
VITE_BUILD_TIME=2025-11-15T10:30:00Z
```

### Backend Configuration

```typescript
// backend/src/config/observability.ts
export const observabilityConfig = {
  logs: {
    directory: 'backend/logs/frontend',
    retentionDays: 30,
    maxFileSizeMB: 100,
    rotationInterval: '1d',
  },
  bugReports: {
    directory: 'backend/logs/bug-reports',
    maxScreenshotSizeMB: 5,
    retentionDays: 90,
  },
  rateLimit: {
    logsPerMinute: 100,
    bugReportsPerHour: 10,
  },
}
```

---

## Dependencies

### New Dependencies

**Frontend:**
```json
{
  "dependencies": {
    "html2canvas": "^1.4.1"  // Screenshot capture
  }
}
```

**Backend:**
```json
{
  "dependencies": {
    "rotating-file-stream": "^3.1.0",  // Log rotation
    "express-rate-limit": "^6.7.0"     // Rate limiting
  }
}
```

---

## Open Questions

1. **Should we use WebSockets for real-time log streaming?**
   - **Recommendation:** Start with HTTP POST, add WebSocket in Phase 5 if needed

2. **Should we compress logs before upload?**
   - **Recommendation:** Yes, use gzip for batches >10KB

3. **Should we capture video replays?**
   - **Recommendation:** Future enhancement, start with screenshots

4. **Should we integrate with Sentry/LogRocket?**
   - **Recommendation:** Keep independent, add integration hooks later

5. **Should we sample logs in production?**
   - **Recommendation:** Yes, 10% sampling for debug logs, 100% for errors

6. **Should admins be able to enable enhanced logging for specific users?**
   - **Recommendation:** Yes, add `/api/admin/debug-mode/:userId` endpoint

---

## Comparison with Imagineer

### What We're Taking

✅ Screenshot capture with html2canvas
✅ Annotation canvas UI
✅ Pluggable collector pattern
✅ Quality enhancement fields
✅ Serialization utilities
✅ Network event tracking
✅ Request/response body capture

### What We're Improving

🔧 Add breadcrumb tracking
🔧 Add performance metrics
🔧 Add source location tracking
🔧 Add configurable buffer sizes
🔧 Add log streaming (not just snapshots)
🔧 Add TypeScript strict mode
🔧 Add comprehensive testing

### What We're Adding

➕ Continuous observability system
➕ AI-first structured logging
➕ Batched log streaming
➕ Query interface
➕ JSONL storage format
➕ Daily log rotation
➕ React hooks for logging
➕ Error boundary integration

---

## Next Steps

1. **Review this plan** with team
2. **Start Phase 1** - Implement `DataCollectionService`
3. **Set up testing infrastructure** for observability
4. **Create Jira tickets** for each phase
5. **Schedule demos** after each phase completion

---

## References

- Imagineer bug report implementation
- Frontend observability design doc
- Sentry SDK patterns
- OpenTelemetry browser spec
- React Error Boundary docs
