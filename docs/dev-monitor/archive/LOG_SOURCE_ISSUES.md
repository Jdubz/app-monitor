# Dev-Monitor Log Source Issues - Analysis & Fixes

## Issues Identified

### 1. **'all' appears as a log source** ❌
**Location**: `frontend/src/components/MinimalPanelContainer.tsx:60`
```typescript
setAvailableSources(['all', ...uniqueServiceNames]);
```

**Problem**: 'all' is hardcoded into the sources list but isn't an actual log source
**Impact**: Users see 'all' in dropdown, selecting it may cause errors or empty logs
**Fix**: Remove 'all' from the hardcoded array OR implement proper 'all' source handling in backend

---

### 2. **'backend' appears when file doesn't exist** ❌
**Backend API Response**:
```json
{
  "service": "backend",
  "filename": "backend.log",
  "watching": true,
  "format": "unknown"
}
```

**Actual Files on Disk**:
- ✅ `logs/browser-console.log`
- ✅ `logs/dev-monitor-backend.log`
- ✅ `logs/plain/firebase-emulators.log`
- ✅ `logs/plain/frontend.log`
- ✅ `logs/plain/worker.log`
- ❌ `logs/backend.log` - **DOES NOT EXIST**
- ❌ `logs/plain/backend.log` - **DOES NOT EXIST**

**Problem**: `logWatcher.ts:watchFile()` keeps watchers for files that don't exist yet
**Impact**: Ghost sources appear in UI that have no actual log data
**Root Cause**: `getAvailableSources()` returns ALL watched files, including non-existent ones

**Fix**: Only expose sources for files that actually exist:
```typescript
// In logWatcher.ts getAvailableSources()
public getAvailableSources(): LogSource[] {
  const sources: LogSource[] = [];

  for (const [filepath, watched] of this.watchedFiles.entries()) {
    // ONLY include sources for files that exist
    if (fs.existsSync(filepath)) {
      sources.push({...});
    }
  }

  return sources;
}
```

---

### 3. **frontend-dev logs are plain text instead of JSON** ⚠️
**Expected**: JSON structured logs (like dev-monitor-backend)
**Actual**: Plain text logs from Vite dev server

**Problem**: Frontend dev server (Vite) outputs to stderr, which is redirected to `logs/plain/frontend.log`
**Impact**:
- Inconsistent log format across services
- No structured metadata (severity, timestamps, etc.)
- Cannot filter/search effectively

**Root Cause**:
- Makefile redirects stderr: `npm run dev 2>> ../logs/frontend.log`
- Vite doesn't use custom logger, outputs plain text

**Fix Options**:
1. **Keep plain text** - It's actually fine for dev server logs (Vite output is already well-formatted)
2. **Wrap Vite** - Create wrapper script that converts Vite output to JSON (complex)
3. **Accept mixed formats** - Have some services use plain text, others JSON (current state)

**Recommendation**: Keep as plain text - Vite dev server logs are informational only

---

### 4. **LogWatcher doesn't dynamically update sources** ⚠️
**Problem**: Sources are discovered once at startup via `initializeWatchers()`
**Impact**:
- New log files created after startup don't appear in UI
- Need to restart dev-monitor to see new sources

**Current Flow**:
1. `LogWatcher` constructor → `initializeWatchers()`
2. `discoverLogFiles()` scans directories ONCE
3. Sets up file watchers
4. Never rescans for new files

**Fix**: Implement directory watching to detect new .log files
```typescript
// Watch the logs directory itself for new files
fs.watch(this.logDir, (eventType, filename) => {
  if (eventType === 'rename' && filename.endsWith('.log')) {
    // New file created, add watcher
    this.watchFile(path.join(this.logDir, filename), this.inferServiceFromFilename(filename));
  }
});
```

---

### 5. **Empty log sources in UI** ✅ FIXED
**Problem**: Panels show empty logs even when log files have content

**Root Cause Identified**:
1. `LogContext` subscribes to 'all' on mount (LogContext.tsx:93), streaming NEW log lines
2. `subscribeToService()` method (LogContext.tsx:140-148) both subscribes AND requests historical logs
3. **MinimalPanelContainer never calls `subscribeToService()`** when panel sources change
4. Result: Panels only show logs arriving AFTER source selection, not historical logs

**Files Analyzed**:
- All 5 log files have content (verified with wc -l)
- browser-console.log: 5 lines
- dev-monitor-backend.log: 4156 lines
- firebase-emulators.log: 90 lines
- frontend.log: 1028 lines
- worker.log: 316 lines

**Fix Applied** (MinimalPanelContainer.tsx:73-81):
```typescript
// Subscribe to services when panel sources change to fetch historical logs
useEffect(() => {
  panels.forEach(panel => {
    if (panel.source) {
      // Subscribe to service to get historical logs + real-time updates
      subscribeToService(panel.source);
    }
  });
}, [panels, subscribeToService]);
```

---

## Priority Fixes

### HIGH PRIORITY ✅ ALL COMPLETED
1. ✅ Remove 'all' from frontend sources list
2. ✅ Fix logWatcher to only expose existing files
3. ✅ Document frontend-dev plain text is intentional
4. ✅ Fix empty sources issue (subscribe to services on mount)

### MEDIUM PRIORITY
5. Add dynamic source discovery (watch logs directory)

### LOW PRIORITY
6. Consider 'all' source implementation in backend (aggregate all logs)

---

## Implementation Plan

### Phase 1: Quick Fixes (5 min)
```typescript
// 1. Remove 'all' from frontend
// MinimalPanelContainer.tsx:60
setAvailableSources(uniqueServiceNames); // Remove ['all', ...] wrapper

// 2. Filter non-existent files
// logWatcher.ts getAvailableSources()
if (fs.existsSync(filepath)) {
  sources.push({...});
}
```

### Phase 2: Dynamic Discovery (15 min)
- Add directory watcher for logs/ and logs/plain/
- Emit 'source_added' Socket.IO event when new file detected
- Frontend listens and updates available sources list

### Phase 3: Investigation (variable)
- Test each source individually
- Check Socket.IO room subscriptions
- Verify log streaming

---

## Testing Checklist

After fixes:
- [ ] 'all' no longer appears in dropdown
- [ ] Only services with actual log files appear
- [ ] New log file created → appears in UI without restart
- [ ] All non-empty sources display logs correctly
- [ ] Socket.IO rooms working for all sources
- [ ] Format validation warnings make sense

