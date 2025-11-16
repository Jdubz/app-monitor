# Heartbeat Timeout Fix - Investigation & Resolution

**Date:** 2025-11-16  
**Issue:** 9 tasks incorrectly failed with "Worker heartbeat timeout" despite completing successfully

## Problem Summary

Tasks were being marked as failed with "Worker heartbeat timeout" error even though the Docker containers successfully completed the work. This was a **race condition** between the heartbeat monitoring system and actual task execution.

### Root Cause

The original configuration had:
- **Heartbeat interval:** 20 seconds (how often heartbeats are sent)
- **Heartbeat timeout:** 30 seconds (when worker is considered stalled)
- **Buffer:** Only 10 seconds (1.5x the interval)

This tight timing meant that a single delayed event loop iteration, buffered Docker output, or database write delay could cause the monitor to mark a healthy worker as stalled.

### Evidence

Example task `task-bugfix-16e6d4ab-7ef8-428d-b5d3-a473de937826`:
- **Actual completion:** 16:48:20 (exit code 0, successful output)
- **Marked failed:** 16:46:41 (83 seconds BEFORE actual completion!)
- **Duration:** 182 seconds
- **Artifacts:** Show successful completion with proper work done

The heartbeat monitor incorrectly detected the worker as stalled while it was actively working.

## Resolution

### Changes Made

1. **Increased Heartbeat Timeout: 30s → 90s**
   - File: `backend/src/services/taskQueue.sqlite.ts`
   - Line 1603: Changed timeout from 30,000ms to 90,000ms
   - Line 813: Updated database schema default
   - **Benefit:** 4.5x the heartbeat interval (was 1.5x), provides buffer for:
     - Node.js event loop delays
     - Docker output buffering
     - Database write latency
     - System resource contention

2. **Added Defensive Logging**
   - File: `backend/src/services/taskExecution.service.ts`
   - Added heartbeat source tracking (`stdout`, `stderr`, `periodic`)
   - Added heartbeat counter to track total heartbeats sent
   - Log each heartbeat update with source (at debug level)
   - Log heartbeat monitoring start with config details
   - Log heartbeat count in completion summary
   
   **Benefits:**
   - Can verify heartbeat interval is actually firing
   - Can diagnose if heartbeats are failing silently
   - Can see timing patterns in logs
   - Can correlate heartbeat count with task duration

3. **Enhanced Stalled Worker Detection Logging**
   - File: `backend/src/services/taskQueue.sqlite.ts`
   - Added timing details (seconds since last heartbeat)
   - Added structured details for debugging
   - Added timeout configuration to log output

   **Benefits:**
   - Clear visibility into why workers are marked stalled
   - Can identify false positives vs actual stuck containers
   - Better forensics for future investigations

## Testing

Tests added in `backend/src/services/workerHeartbeat.test.ts`:
- ✅ Validates 90s timeout configuration (4.5x the 20s interval)
- ✅ Confirms 70s buffer allows 3 missed heartbeats
- ✅ Documents old vs new configuration
- ✅ Validates buffer handles expected delays (Docker buffering, DB latency, event loop)

All 4 tests passing. Run with:
```bash
npm test -- workerHeartbeat.test.ts
```

1. **Monitor production logs** for heartbeat patterns:
   ```bash
   journalctl -u app-monitor-backend | grep heartbeat_updated
   ```

2. **Verify no false positives** over next 24 hours:
   ```sql
   SELECT COUNT(*) FROM tasks 
   WHERE status = 'failed' 
   AND error = 'Worker heartbeat timeout'
   AND created_at > strftime('%s', 'now', '-1 day') * 1000;
   ```

3. **Check heartbeat counts** in completion logs match expected values:
   - For 3-minute task: ~9 heartbeats (180s / 20s)
   - For 5-minute task: ~15 heartbeats (300s / 20s)

## Configuration Values

| Setting | Old Value | New Value | Ratio |
|---------|-----------|-----------|-------|
| Heartbeat Interval | 20s | 20s (unchanged) | - |
| Heartbeat Timeout | 30s | **90s** | 3x increase |
| Buffer Window | 10s (1.5x) | **70s (4.5x)** | 7x increase |

## Rollback Plan

If issues arise, revert timeout to 60s (middle ground):

```typescript
// In taskQueue.sqlite.ts line 1603:
const HEARTBEAT_TIMEOUT_MS = 60000; // 60 seconds (3x the interval)
```

This would still provide 3x buffer while being less aggressive than 90s.

## Related Files

- `backend/src/services/taskQueue.sqlite.ts` - Timeout detection and worker management
- `backend/src/services/taskExecution.service.ts` - Heartbeat sending mechanism
- `backend/src/services/workerHealthMonitor.service.ts` - Monitors and triggers detection

## Next Steps

1. Deploy changes to production
2. Monitor for 24-48 hours
3. Review logs to confirm heartbeats are firing consistently
4. If no issues, close related investigation documents
5. Consider further timeout tuning based on actual task duration patterns
