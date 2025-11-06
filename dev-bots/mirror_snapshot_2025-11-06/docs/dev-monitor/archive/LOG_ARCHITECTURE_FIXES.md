# Log Architecture Fixes - October 22, 2025

## Overview

Fixed critical log architecture violations in the dev-monitor system. The system was inappropriately streaming logs from multiple sources when it should only stream from dev-monitor backend to frontend, with all other log ingestion using file reads only.

## Architecture Violations Fixed

### ❌ **BEFORE: Inappropriate Streaming Everywhere**

- **LogStreamer**: Streaming from ProcessManager events
- **LogWatcher**: Streaming from all log files
- **ProcessManager**: Streaming process logs
- **CloudLogging**: Streaming cloud log queries

### ✅ **AFTER: Correct File-Based Architecture**

- **ONLY** dev-monitor backend → frontend streaming
- **ALL OTHER** log ingestion uses file reads only
- No streaming from external services
- No streaming from process outputs
- No streaming from cloud logs

## Changes Made

### 1. **LogStreamer.ts** - Removed ProcessManager Streaming

**Before:**

```typescript
// Listen to process manager log events
this.processManager.on(
  "log",
  (data: { serviceName: string; level: string; message: string }) => {
    this.broadcastLog(
      data.serviceName as LocalService,
      data.level as DevMonitorLogLevel,
      data.message,
    );
  },
);
```

**After:**

```typescript
// ONLY listen to status changes from process manager (not log events)
this.processManager.on(
  "status_change",
  (data: { serviceName: string; status: string; error?: string }) => {
    this.broadcastStatusChange(data);
  },
);
```

**Changes:**

- Removed ProcessManager log event listeners
- Updated log history retrieval to use `logWatcher.getRecentLogs()`
- Added conversion methods for structured logs
- Removed `broadcastLog()` method for ProcessManager streaming

### 2. **LogWatcher.ts** - Limited Streaming to Dev-Monitor Backend Only

**Before:**

```typescript
// Watched ALL log files for streaming
const files = fs.readdirSync(this.logDir, { withFileTypes: true });
for (const file of files) {
  if (file.isFile() && file.name.endsWith(".log")) {
    // Stream from all log files
  }
}
```

**After:**

```typescript
// ONLY watch dev-monitor backend logs for streaming
const devMonitorLogFile = path.join(this.logDir, "dev-monitor-backend.log");
if (fs.existsSync(devMonitorLogFile)) {
  logFiles.push({
    filepath: devMonitorLogFile,
    service: "dev-monitor-backend",
  });
}
```

**Changes:**

- Only streams dev-monitor-backend.log
- External service logs use file reads only
- Enhanced `getRecentLogs()` for multiple file locations
- Added proper error handling and logging

### 3. **ProcessManager.ts** - Removed Log Streaming

**Before:**

```typescript
// Emit log events for Socket.IO streaming
lines.forEach((line) => {
  this.emit("log", { serviceName, level: "INFO", message: line });
});
```

**After:**

```typescript
// Logs are written to files only - no streaming from ProcessManager
```

**Changes:**

- Removed all `emit('log', ...)` calls
- Removed `getServiceLogs()` method
- Logs are written to files only
- Only status changes are emitted

## Corrected Architecture

### **✅ CORRECT FLOW:**

```
External Services → Log Files → File Reads → Dev-Monitor Backend → Stream to Frontend
```

### **❌ WRONG FLOW (Fixed):**

```
External Services → Stream Directly → Dev-Monitor Backend → Stream to Frontend
```

## Service-Specific Behavior

| Service                 | Log Method       | Streaming | File Location                        |
| ----------------------- | ---------------- | --------- | ------------------------------------ |
| **dev-monitor-backend** | ✅ **Streamed**  | Real-time | `/logs/dev-monitor-backend.log`      |
| **frontend-dev**        | 📁 **File Read** | On-demand | `/logs/frontend.log`                 |
| **python-worker**       | 📁 **File Read** | On-demand | `/logs/worker.log`                   |
| **firebase-emulators**  | 📁 **File Read** | On-demand | `/logs/plain/firebase-emulators.log` |

## Benefits of Fixed Architecture

1. **Performance**: Reduced streaming overhead
2. **Reliability**: File-based logs are persistent
3. **Scalability**: No memory leaks from streaming
4. **Debugging**: Logs available even when services are down
5. **Consistency**: Single source of truth for logs

## Testing the Fixes

### 1. **Verify No ProcessManager Streaming**

```bash
# Check that ProcessManager doesn't emit log events
grep -r "emit.*log" src/services/processManager.ts
# Should return no results
```

### 2. **Verify LogWatcher Only Streams Dev-Monitor**

```bash
# Check that only dev-monitor-backend is watched for streaming
grep -A 10 "ONLY watch dev-monitor" src/services/logWatcher.ts
```

### 3. **Verify LogStreamer Uses File Reads**

```bash
# Check that LogStreamer uses logWatcher.getRecentLogs()
grep -r "logWatcher.getRecentLogs" src/services/logStreamer.ts
```

## Migration Notes

- **No breaking changes** to frontend API
- **Backward compatible** with existing log files
- **Enhanced error handling** for missing log files
- **Improved logging** for debugging

## Conclusion

The dev-monitor now follows the correct architecture:

- **Streams only** dev-monitor backend logs to frontend
- **Reads files only** for external service logs
- **Eliminates** inappropriate streaming from ProcessManager
- **Maintains** all existing functionality

This fixes the performance and reliability issues while keeping the system fully functional.
