# Quick Reference: Architecture Comparison

## TL;DR

**Goal:** Build both continuous observability AND user-triggered bug reports without duplicating code.

**Solution:** Shared `DataCollectionService` that both systems use.

---

## Side-by-Side Comparison

| Feature | Imagineer Bug Report | App Monitor Observability | Unified Solution |
|---------|---------------------|--------------------------|------------------|
| **Purpose** | User-triggered snapshots | Continuous AI debugging | Both via shared layer |
| **Logs** | 200 entry buffer | 1000 entry buffer + streaming | Configurable via shared service |
| **Network** | 50 events, fetch/XHR | Planned | Single interceptor, shared buffer |
| **Screenshots** | ✅ With annotations | ❌ None | ✅ Via BugReportProvider |
| **Breadcrumbs** | ❌ None | ✅ User action trail | ✅ Via BreadcrumbTracker |
| **Context** | Basic (URL, UA) | ✅ Rich (session, state, perf) | ✅ Via ContextCollector |
| **Storage** | Backend JSON | Backend JSONL | Both formats, shared serialization |
| **Triggers** | Manual + Error boundary | Automatic continuous | Both |
| **UI** | Modal with annotation | None | Modal for bug reports only |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│     SHARED COLLECTION LAYER                  │
│  ┌────────────────────────────────────────┐ │
│  │  DataCollectionService (NEW)           │ │
│  │  - Log buffer (configurable)           │ │
│  │  - Network events (fetch/XHR)          │ │
│  │  - Serialization (circular-safe)       │ │
│  │  - Pluggable collectors                │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
              │              │
    ┌─────────┴──────┐      └──────────────┐
    │                │                      │
    ▼                ▼                      ▼
┌────────┐  ┌──────────────┐  ┌──────────────────┐
│Context │  │ Breadcrumb   │  │ Screenshot       │
│Collec  │  │ Tracker      │  │ Service          │
│tor     │  │              │  │ (html2canvas)    │
└────────┘  └──────────────┘  └──────────────────┘
    │                │                      │
    └────────┬───────┴──────────────────────┘
             │
    ┌────────┴─────────┐
    │                  │
    ▼                  ▼
┌──────────────┐  ┌──────────────────┐
│ Enhanced     │  │ BugReport        │
│ Logger       │  │ Provider         │
│              │  │                  │
│ - Continuous │  │ - On demand      │
│ - Streaming  │  │ - Screenshots    │
│ - AI-first   │  │ - Annotations    │
└──────────────┘  └──────────────────┘
```

---

## What's Shared vs. Separate

### Shared Components (DRY)

✅ **DataCollectionService** - Single source for all collected data
✅ **ContextCollector** - Session, environment, state snapshots
✅ **BreadcrumbTracker** - User action trail
✅ **SerializationUtils** - Circular-safe serialization
✅ **Network Interceptor** - Single fetch/XHR wrapper
✅ **Log Buffer** - Circular buffer for recent logs

### Observability-Specific

🔵 **EnhancedLogger** - Structured logging with auto-context
🔵 **LogTransport** - Batched streaming to backend
🔵 **JSONL Writer** - Backend continuous log storage

### Bug Report-Specific

🟢 **BugReportProvider** - React context for bug reports
🟢 **ScreenshotService** - html2canvas capture + annotation
🟢 **BugReportModal** - UI for manual bug submission
🟢 **Quality Fields** - Expected/actual behavior, steps to reproduce

---

## Data Flow

### Observability Flow (Continuous)

```
Component → EnhancedLogger
              ↓
        DataCollectionService (buffer)
              ↓
        LogTransport (batch every 10s)
              ↓
        POST /api/logs/frontend
              ↓
        JSONL file (logs/frontend/YYYY-MM-DD.jsonl)
```

### Bug Report Flow (On-Demand)

```
User clicks "Report Bug" → BugReportProvider
                              ↓
                    Capture screenshot (html2canvas)
                              ↓
                    Open modal with annotation
                              ↓
                    Collect from DataCollectionService:
                    - Last 200 logs
                    - Last 50 network events
                    - Current breadcrumbs
                    - Environment snapshot
                    - App state
                              ↓
                    POST /api/bug-reports
                              ↓
                    Save JSON + PNG
                    (logs/bug-reports/YYYY-MM-DD/{id}.{json,png})
```

---

## Key Design Decisions

### 1. Why a Shared Collection Layer?

❌ **Bad:** Duplicate log buffers, network tracking, serialization
✅ **Good:** Single source of truth, testable, DRY

### 2. Why Separate Storage Endpoints?

**Observability:** `/api/logs/frontend`
- High frequency (batches every 10s)
- JSONL format (streaming-friendly)
- 30-day retention

**Bug Reports:** `/api/bug-reports`
- Low frequency (user-triggered)
- JSON + PNG (human-readable)
- 90-day retention
- Include screenshots

### 3. Why Two Buffer Sizes?

**Observability:** 1000 entries (need more context for AI debugging)
**Bug Reports:** 200 entries (users report recent issues)

Both use the SAME buffer via `DataCollectionService.getLogs(count)`

---

## Migration Path

### From Existing Logger
```typescript
// OLD
const log = createLogger('MyComponent')
log.info('Something happened')

// NEW
const log = createEnhancedLogger('MyComponent')
log.info('Something happened', { extraData })
// Automatically includes context, breadcrumbs, metadata
```

### Adding Bug Reports
```typescript
import { useBugReporter } from '@/contexts/BugReportContext'

function MyComponent() {
  const { openBugReport } = useBugReporter()

  return (
    <Button onClick={() => openBugReport()}>
      Report Bug
    </Button>
  )
}
```

### Error Boundaries
```typescript
import ErrorBoundaryWithReporting from '@/components/ErrorBoundaryWithReporting'

<ErrorBoundaryWithReporting boundaryName="My Feature">
  <MyFeatureComponent />
</ErrorBoundaryWithReporting>
// Automatically shows "Report Bug" button on errors
```

---

## File Organization

```
frontend/src/utils/observability/
├── SHARED (used by both)
│   ├── dataCollectionService.ts    ← Central service
│   ├── contextCollector.ts         ← Environment/state
│   ├── breadcrumbTracker.ts        ← User actions
│   ├── serializationUtils.ts       ← Safe serialization
│   └── types.ts                    ← TypeScript defs
│
├── OBSERVABILITY-SPECIFIC
│   ├── enhancedLogger.ts           ← Structured logging
│   └── logTransport.ts             ← Streaming
│
└── BUG-REPORT-SPECIFIC
    ├── screenshotService.ts        ← Capture + annotate
    └── (BugReportProvider in contexts/)
```

---

## Testing Strategy

### Unit Tests (Each Component)
- DataCollectionService buffer behavior
- Serialization edge cases
- Network interception
- Screenshot capture

### Integration Tests (Flows)
- Logger → Transport → Backend
- Bug report submission
- Error boundary integration

### E2E Tests (User Flows)
- User submits bug report with screenshot
- Error triggers automatic report
- Logs stream to backend
- Offline queue recovery

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Log overhead | <50ms p95 | Per log entry |
| Screenshot capture | <500ms | Including wait |
| Serialization | <100ms | Per object |
| Buffer memory | <10MB | Both buffers |
| Network batch | 10s or 100 logs | Whichever first |
| Bug report modal | <200ms | Open time |

---

## Next Actions

1. ✅ Review this plan
2. ⏳ Implement Phase 1: `DataCollectionService`
3. ⏳ Write unit tests for shared layer
4. ⏳ Implement Phase 2: `EnhancedLogger` + `LogTransport`
5. ⏳ Implement Phase 3: `BugReportProvider`

See `UNIFIED_OBSERVABILITY_AND_BUG_REPORTING_PLAN.md` for detailed implementation plan.
