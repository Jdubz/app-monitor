# WebSocket Phase Events - Implementation Effort Analysis

**Date:** 2025-11-17  
**Question:** What's the effort to add real-time WebSocket phase updates to the frontend?

---

## Current State

### ✅ **WebSocket Infrastructure: COMPLETE**

**Frontend:**
- `socketService.ts` - Full Socket.IO client with reconnection logic
- `useEnhancedSocket.ts` - React hook for socket management
- Connection health monitoring, latency tracking
- Event listener management with cleanup

**Backend:**
- Socket.IO server running
- `ConnectionManager` service handling connections
- Event emission infrastructure exists

**Status:** ✅ **Production-ready WebSocket infrastructure**

---

## What's Missing for Phase Events

### Backend: Phase Event Emissions

**Currently:** Backend emits general task events (`task:created`, `task:completed`, etc.)

**Needed:** Emit phase-specific events during task execution:
```typescript
// In taskExecution.service.ts
this.emit('phase:started', { taskId, phaseIndex, phaseName, attempt });
this.emit('phase:validating', { taskId, phaseIndex });
this.emit('phase:validation_failed', { taskId, phaseIndex, errors });
this.emit('phase:recovering', { taskId, phaseIndex });
this.emit('phase:completed', { taskId, phaseIndex, nextPhase });
```

**Files to modify:**
1. `backend/src/services/taskExecution.service.ts` - Add emit calls
2. `backend/src/services/ephemeralWorker.service.ts` - Emit from phase execution
3. `backend/src/services/connectionManager.ts` - Broadcast phase events

---

### Frontend: Phase Event Handlers

**Currently:** Frontend can listen to any event via `socket.on(event, handler)`

**Needed:** React hook to subscribe to phase events and update UI:
```typescript
// New file: frontend/src/hooks/usePhaseUpdates.ts
export function usePhaseUpdates(taskId: string) {
  const { socket } = useEnhancedSocket();
  const [phaseState, setPhaseState] = useState<PhaseState | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handlers = {
      'phase:started': (data) => { /* update state */ },
      'phase:validating': (data) => { /* update state */ },
      'phase:recovering': (data) => { /* update state */ },
      'phase:completed': (data) => { /* update state */ },
    };

    // Subscribe
    Object.entries(handlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    // Cleanup
    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    };
  }, [socket, taskId]);

  return phaseState;
}
```

**Files to create/modify:**
1. `frontend/src/hooks/usePhaseUpdates.ts` (NEW) - Subscribe to phase events
2. `frontend/src/components/dev-bots/tasks/TaskPhaseHistory.tsx` - Use hook to auto-refresh
3. `frontend/src/components/monitor/tabs/TaskQueueTabContent.tsx` - Show live status

---

## Implementation Breakdown

### **Backend Event Emissions**

#### File 1: `taskExecution.service.ts`
**Lines to add:** ~15 lines
**Locations:**
- When phase starts (after task assignment)
- When validation starts
- When validation fails
- When recovery starts
- When phase completes

**Example:**
```typescript
// Before executing phase
this.emit('phase:started', {
  taskId: nextTask.id,
  phaseIndex: nextTask.phase_index,
  phaseName: nextTask.phase_name,
  attempt: nextTask.phase_attempts,
});

// After validation
if (!validation.passed) {
  this.emit('phase:validation_failed', {
    taskId: nextTask.id,
    phaseIndex: nextTask.phase_index,
    errors: validation.errors,
  });
}
```

**Effort:** **15 minutes**

---

#### File 2: `ephemeralWorker.service.ts`
**Lines to add:** ~10 lines
**Locations:**
- When starting artifact extraction
- When starting phase validation
- When starting recovery

**Effort:** **10 minutes**

---

#### File 3: `connectionManager.ts`
**Lines to add:** ~0 lines (already broadcasts all emitted events)
**Effort:** **0 minutes** (no changes needed)

---

### **Frontend Phase Event Handlers**

#### File 1: `usePhaseUpdates.ts` (NEW)
**Lines to add:** ~80 lines
**Complexity:** Medium
**Features:**
- Subscribe to 5 phase events
- Update local state
- Filter by taskId
- Cleanup on unmount

**Example:**
```typescript
export function usePhaseUpdates(taskId: string) {
  const { socket } = useEnhancedSocket();
  const [phaseState, setPhaseState] = useState<PhaseState | null>(null);

  useEffect(() => {
    if (!socket || !taskId) return;

    const handlePhaseStarted = (data: PhaseEvent) => {
      if (data.taskId === taskId) {
        setPhaseState({
          phase: data.phaseIndex,
          status: 'running',
          attempt: data.attempt,
        });
      }
    };

    const handleValidating = (data: PhaseEvent) => {
      if (data.taskId === taskId) {
        setPhaseState(prev => prev ? { ...prev, status: 'validating' } : null);
      }
    };

    // ... more handlers

    socket.on('phase:started', handlePhaseStarted);
    socket.on('phase:validating', handleValidating);
    // ... subscribe to all events

    return () => {
      socket.off('phase:started', handlePhaseStarted);
      socket.off('phase:validating', handleValidating);
      // ... cleanup
    };
  }, [socket, taskId]);

  return phaseState;
}
```

**Effort:** **20 minutes**

---

#### File 2: `TaskPhaseHistory.tsx`
**Lines to modify:** ~10 lines
**Changes:**
- Import `usePhaseUpdates` hook
- Re-fetch stage runs when phase completes
- Show loading indicator during execution

**Example:**
```typescript
export function TaskPhaseHistory({ taskId }: TaskPhaseHistoryProps) {
  const [stageRuns, setStageRuns] = useState<StageRun[]>([]);
  const phaseState = usePhaseUpdates(taskId); // NEW

  // Re-fetch when phase completes
  useEffect(() => {
    if (phaseState?.status === 'complete') {
      fetchStageRuns(); // Refresh data
    }
  }, [phaseState]);

  // ... rest of component
}
```

**Effort:** **10 minutes**

---

#### File 3: `TaskQueueTabContent.tsx`
**Lines to modify:** ~15 lines
**Changes:**
- Import `usePhaseUpdates` hook
- Show live status indicator in detail pane
- Animate status changes

**Example:**
```typescript
const livePhase = usePhaseUpdates(task?.id);

// In render:
{livePhase?.status === 'validating' && (
  <div className="flex items-center gap-2 text-sm text-amber-500">
    <Loader2 className="h-4 w-4 animate-spin" />
    <span>Validating Phase {livePhase.phase}...</span>
  </div>
)}
```

**Effort:** **15 minutes**

---

## Total Effort Estimate

| Task | Effort | Complexity |
|------|--------|------------|
| **Backend event emissions** | 25 min | Low |
| **Frontend phase hook** | 20 min | Medium |
| **TaskPhaseHistory integration** | 10 min | Low |
| **TaskQueueTabContent integration** | 15 min | Low |
| **Testing & debugging** | 20 min | Low |
| **TOTAL** | **90 minutes** | **Low-Medium** |

**Realistic Estimate with Buffer:** **2 hours**

---

## Implementation Steps

### Step 1: Backend Events (25 minutes)
1. Add emit calls to `taskExecution.service.ts`:
   - `phase:started`
   - `phase:validating`
   - `phase:validation_failed`
   - `phase:recovering`
   - `phase:completed`

2. Add emit calls to `ephemeralWorker.service.ts`:
   - Same events at different execution points

3. Test with WebSocket inspector

---

### Step 2: Frontend Hook (20 minutes)
1. Create `usePhaseUpdates.ts` hook
2. Define `PhaseState` and `PhaseEvent` types
3. Subscribe to all 5 phase events
4. Filter by taskId
5. Return live phase state

---

### Step 3: Integrate Hook (25 minutes)
1. Update `TaskPhaseHistory.tsx`:
   - Import hook
   - Auto-refresh on phase completion
   - Show "Executing..." indicator

2. Update `TaskQueueTabContent.tsx`:
   - Import hook
   - Show live status badges
   - Animate transitions

---

### Step 4: Testing (20 minutes)
1. Submit test task
2. Watch phase transitions in real-time
3. Verify auto-refresh works
4. Test with multiple tasks
5. Test reconnection behavior

---

## Event Payload Shapes

### Backend Emits:
```typescript
interface PhaseEvent {
  taskId: string;
  phaseIndex: number;
  phaseName: string;
  attempt?: number;
  errors?: string[];
  nextPhase?: number;
}

// phase:started
{ taskId: '123', phaseIndex: 5, phaseName: 'Test & Validate', attempt: 2 }

// phase:validating
{ taskId: '123', phaseIndex: 5 }

// phase:validation_failed
{ taskId: '123', phaseIndex: 5, errors: ['Coverage decreased', 'Tests failing'] }

// phase:recovering
{ taskId: '123', phaseIndex: 5 }

// phase:completed
{ taskId: '123', phaseIndex: 5, nextPhase: 6 }
```

---

## Benefits vs Effort

### Benefits (High):
- ✅ Eliminates manual refresh during debugging
- ✅ Real-time visibility into task progress
- ✅ Strengthens event-driven architecture compliance
- ✅ Better UX during active debugging sessions
- ✅ Auto-updates phase history without polling

### Effort (Low):
- ⏱️ **2 hours** total implementation
- 🧠 **Low complexity** - using existing infrastructure
- 🛠️ **No new dependencies** - Socket.IO already integrated
- ✅ **Low risk** - additive changes, won't break existing functionality

---

## Risk Assessment

### Risks: **LOW**

1. **Event Flooding** ⚠️
   - **Risk:** Many tasks running simultaneously = many events
   - **Mitigation:** Events already filtered by taskId on frontend
   - **Impact:** Negligible (only selected task receives updates)

2. **Reconnection Race Conditions** ⚠️
   - **Risk:** Phase completes during WebSocket disconnect
   - **Mitigation:** Fetch latest data on reconnect
   - **Impact:** Low (single missed update, corrected on reconnect)

3. **State Synchronization** ⚠️
   - **Risk:** WebSocket state drifts from database state
   - **Mitigation:** Database remains source of truth, WS is just UI update
   - **Impact:** None (fetch endpoint always returns latest)

---

## Recommendation

### ✅ **IMPLEMENT IT** - High value, low effort

**Reasoning:**
1. **2 hours** of work for significant UX improvement
2. Leverages existing WebSocket infrastructure (no new setup)
3. Aligns with Master Design Intent (event-driven architecture)
4. Low complexity, low risk
5. Makes debugging sessions much smoother

**When to implement:**
- **Now:** If you want polished real-time updates
- **Later:** If other priorities are more urgent (not blocking)

**Priority:** **Medium-High** (nice-to-have with great ROI)

---

## Alternative: Polling (NOT RECOMMENDED)

**Could we poll instead?**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchStageRuns(); // Refresh every 5 seconds
  }, 5000);
  return () => clearInterval(interval);
}, [taskId]);
```

**Why NOT recommended:**
- ❌ Violates Master Design Intent (no polling loops in frontend)
- ❌ Wastes API calls (polling when nothing changed)
- ❌ Slower updates (5 sec delay vs instant)
- ❌ More resource-intensive

**WebSocket is the correct architectural choice.**

---

## Conclusion

**Effort:** ⏱️ **2 hours**  
**Complexity:** 🧠 **Low-Medium**  
**Risk:** ⚠️ **Low**  
**Value:** ✅ **High**

**Recommendation:** ✅ **Worth implementing** - great ROI for minimal effort.

The infrastructure is already built. We just need to:
1. Emit events from backend (25 min)
2. Subscribe on frontend (45 min)
3. Test (20 min)

**Result:** Real-time phase updates, auto-refreshing history, live status indicators—making the intervention panel significantly more responsive during active debugging.

---

**Analysis Complete:** 2025-11-17  
**Effort Estimate:** 2 hours  
**Recommendation:** Implement now or next sprint
