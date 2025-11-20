# Frontend Implementation Plan: Task Blocking & Resume Feature

## Investigation Summary

### Current State Analysis

#### ✅ Already Implemented
1. **API Contracts** (`shared/api-contracts/index.ts`):
   - ✅ `DevBotsTaskStatus` includes `'blocked'` (line 196)
   - ✅ `DevBotsQueueBucket` includes `'blocked'` (line 282)
   - ✅ `PhaseStatus` includes `'blocked'` (line 211)
   - ✅ Queue counts include `blocked: number` (line 294)

2. **Frontend Types**:
   - ✅ `QueueFilter` includes `'blocked'` (`frontend/src/contexts/devBotsStore.tsx:30`)
   - ✅ `statusHelpers.tsx` includes `'blocked'` in `labelMap`

3. **Frontend Components**:
   - ✅ `TaskQueuePanel.tsx` includes 'blocked' filter button
   - ✅ Status badge variant function already handles 'blocked' status

#### ❌ Missing Implementation

1. **API Contracts - DevBotsTask Interface**:
   - ❌ Missing `blockedReason?: string`
   - ❌ Missing `blockedAt?: number`
   - ❌ Missing `blockedBy?: string`
   - ❌ Missing `resumedBy?: string`
   - ❌ Missing `resumedAt?: number`

2. **Frontend API Service**:
   - ❌ Missing `resumeTask()` API function
   - ❌ No API call for POST `/api/dev-bots/tasks/:id/resume`

3. **Frontend UI Components**:
   - ❌ No "Resume Task" button in task details view
   - ❌ No modal/dialog for resume confirmation
   - ❌ No display of blocking metadata (reason, time, who blocked it)
   - ❌ No display of resume audit trail (who resumed, when)
   - ❌ No visual indication of blocked status in task cards

4. **Frontend State Management**:
   - ❌ No resume action handler in store
   - ❌ No optimistic UI updates for resume action

---

## Implementation Plan

### Phase 1: Update API Contracts & Types ✅ CRITICAL
**Priority**: P0 (Blocking for all other work)
**Files**: `shared/api-contracts/index.ts`

Add blocking/resume fields to `DevBotsTask` interface:

```typescript
export interface DevBotsTask {
  // ... existing fields ...

  // Blocking metadata (added by system when task blocks)
  blockedReason?: string;    // Why task was blocked
  blockedAt?: number;        // Unix timestamp when blocked
  blockedBy?: string;        // System/worker that blocked it

  // Resume audit trail (added when manually resumed)
  resumedBy?: string;        // User who resumed the task
  resumedAt?: number;        // Unix timestamp when resumed
}
```

**Testing**: Rebuild backend and frontend to verify no TypeScript errors

---

### Phase 2: Update Frontend API Service
**Priority**: P0
**Files**: `frontend/src/services/api.ts`

Add resume task API function:

```typescript
export async function resumeTask(taskId: string, resumedBy: string): Promise<ApiResponse<DevBotsTask>> {
  return api.post(`/dev-bots/tasks/${taskId}/resume`, { resumedBy });
}
```

**Testing**: Verify API call shape matches backend endpoint

---

### Phase 3: Update devBotsStore
**Priority**: P0
**Files**: `frontend/src/contexts/devBotsStore.tsx`

Add resume action to store:

```typescript
interface DevBotsStoreValue {
  // ... existing fields ...
  resumeTask: (taskId: string, resumedBy: string) => Promise<void>;
  isResuming: boolean;
  resumeError?: string;
}
```

Implementation:
1. Add `isResuming` and `resumeError` state
2. Implement `resumeTask` async function
3. Optimistic UI update: immediately update task status to 'pending'
4. On success: refresh task detail and queue
5. On error: rollback optimistic update and show error

**Testing**: Call resume API and verify state updates correctly

---

### Phase 4: UI - Task Detail View Enhancements
**Priority**: P1
**Files**:
- `frontend/src/components/dev-bots/details/TaskDetailPanel.tsx` (if exists)
- OR `frontend/src/components/dev-bots/queue/TaskQueuePanel.tsx`

#### A. Display Blocking Metadata

Add conditional section when `task.status === 'blocked'`:

```tsx
{task.status === 'blocked' && (
  <div className="rounded-lg border border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 p-4">
    <div className="flex items-center gap-2 mb-2">
      <AlertTriangle className="h-5 w-5 text-amber-600" />
      <h3 className="font-semibold text-amber-900 dark:text-amber-100">
        Task Blocked
      </h3>
    </div>

    <div className="space-y-2 text-sm">
      {task.blockedReason && (
        <div>
          <span className="font-medium">Reason:</span>{' '}
          <span className="text-muted-foreground">{task.blockedReason}</span>
        </div>
      )}

      {task.blockedAt && (
        <div>
          <span className="font-medium">Blocked:</span>{' '}
          <span className="text-muted-foreground">
            {formatRelativeTime(task.blockedAt)}
          </span>
        </div>
      )}

      {task.blockedBy && (
        <div>
          <span className="font-medium">Blocked By:</span>{' '}
          <span className="text-muted-foreground font-mono text-xs">
            {task.blockedBy}
          </span>
        </div>
      )}
    </div>
  </div>
)}
```

#### B. Display Resume Audit Trail

Add conditional section when task has been resumed:

```tsx
{task.resumedBy && task.resumedAt && (
  <div className="rounded-lg border border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
    <div className="flex items-center gap-2 text-sm">
      <CheckCircle className="h-4 w-4 text-emerald-600" />
      <span className="font-medium">Resumed by {task.resumedBy}</span>
      <span className="text-muted-foreground">
        {formatRelativeTime(task.resumedAt)}
      </span>
    </div>
  </div>
)}
```

**Testing**: Mock blocked task and verify metadata displays correctly

---

### Phase 5: UI - Resume Task Action Button
**Priority**: P1
**Files**: Same as Phase 4

Add "Resume Task" button in task actions area:

```tsx
{task.status === 'blocked' && (
  <ResumeTaskButton
    taskId={task.id}
    onResumeSuccess={() => {
      // Refresh task detail
      refreshTaskDetail();
      toast.success('Task resumed successfully');
    }}
  />
)}
```

Create `ResumeTaskButton.tsx` component:

```typescript
interface ResumeTaskButtonProps {
  taskId: string;
  onResumeSuccess?: () => void;
}

export function ResumeTaskButton({ taskId, onResumeSuccess }: ResumeTaskButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resumedBy, setResumedBy] = useState('');
  const { resumeTask, isResuming, resumeError } = useDevBotsStore();

  const handleResume = async () => {
    if (!resumedBy.trim()) {
      toast.error('Please enter your name');
      return;
    }

    try {
      await resumeTask(taskId, resumedBy);
      setIsOpen(false);
      onResumeSuccess?.();
    } catch (error) {
      // Error handled by store
    }
  };

  return (
    <>
      <Button
        variant="default"
        onClick={() => setIsOpen(true)}
        className="bg-emerald-600 hover:bg-emerald-700"
      >
        <PlayCircle className="mr-2 h-4 w-4" />
        Resume Task
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume Blocked Task</DialogTitle>
            <DialogDescription>
              This task is currently blocked. Resuming will clear the blocking state and allow the task to be retried.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="resumedBy">Your Name</Label>
              <Input
                id="resumedBy"
                value={resumedBy}
                onChange={(e) => setResumedBy(e.target.value)}
                placeholder="e.g., john.doe"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will be recorded in the audit trail
              </p>
            </div>

            {resumeError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{resumeError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isResuming}>
              Cancel
            </Button>
            <Button onClick={handleResume} disabled={isResuming || !resumedBy.trim()}>
              {isResuming ? 'Resuming...' : 'Resume Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**Testing**:
1. Click "Resume Task" button
2. Enter name and submit
3. Verify API call made
4. Verify task status updates
5. Verify success toast shown

---

### Phase 6: UI - Enhanced Status Badges
**Priority**: P2
**Files**: `frontend/src/components/dev-bots/queue/TaskQueuePanel.tsx`

Update blocked task cards to show visual warning:

```tsx
{task.status === 'blocked' && (
  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
    <AlertTriangle className="h-4 w-4" />
    <span className="text-xs font-medium">Requires Manual Intervention</span>
  </div>
)}
```

**Testing**: Verify blocked tasks have visual indicator in queue list

---

### Phase 7: UI - Queue Filter Updates
**Priority**: P3 (Already mostly implemented)
**Files**: `frontend/src/components/dev-bots/queue/TaskQueuePanel.tsx`

Verify 'Blocked' filter button styling is distinct:

```tsx
<button
  key="blocked"
  onClick={() => setQueueFilter('blocked')}
  className={cn(
    'rounded-full border px-3 py-1 text-xs transition-colors',
    queueFilter === 'blocked'
      ? 'border-amber-500 bg-amber-500 text-white'  // Active state
      : 'border-amber-500/60 bg-amber-50 text-amber-700 hover:bg-amber-100' // Inactive
  )}
>
  Blocked
  <span className="ml-2 font-mono text-[11px]">{counts?.blocked ?? 0}</span>
</button>
```

**Testing**: Click 'Blocked' filter and verify styling

---

## Implementation Order

### Sprint 1: Core Functionality
1. ✅ Phase 1: Update API Contracts (15 min)
2. ✅ Phase 2: Add API Service Function (10 min)
3. ✅ Phase 3: Update Store with Resume Action (30 min)
4. ✅ Phase 4A: Display Blocking Metadata (20 min)

**Checkpoint**: Can display blocked task metadata in UI

### Sprint 2: Interactive Resume
5. ✅ Phase 4B: Display Resume Audit Trail (15 min)
6. ✅ Phase 5: Implement Resume Button & Dialog (45 min)

**Checkpoint**: Can manually resume blocked tasks

### Sprint 3: Polish
7. ✅ Phase 6: Enhanced Visual Indicators (15 min)
8. ✅ Phase 7: Verify Filter Styling (10 min)

**Checkpoint**: Full blocking/resume workflow complete with polish

---

## Testing Checklist

### Unit Tests
- [ ] Resume API function makes correct HTTP request
- [ ] Store `resumeTask` action updates state correctly
- [ ] Optimistic UI update and rollback works
- [ ] Resume button disabled when name field empty

### Integration Tests
- [ ] Resume task API call → store update → UI refresh
- [ ] Error handling: API error → store error state → error toast
- [ ] Success flow: API success → task status change → success toast

### E2E Tests (Already created)
- [x] E2E test suite created in `e2e/tests/task-blocking-resume.spec.ts`
- [ ] Run E2E tests after frontend implementation complete
- [ ] Verify blocking → resume → task continues flow

### Manual Testing
- [ ] Create blocked task (via backend)
- [ ] View blocking metadata in UI
- [ ] Click "Resume Task" button
- [ ] Enter name and submit
- [ ] Verify task transitions to 'pending' status
- [ ] Verify resume audit trail displayed
- [ ] Verify task can be executed after resume

---

## Files Requiring Changes

### Tier 1: Critical (Must Complete First)
1. ✅ `shared/api-contracts/index.ts` - Add blocking fields to DevBotsTask
2. ✅ `frontend/src/services/api.ts` - Add resumeTask() function
3. ✅ `frontend/src/contexts/devBotsStore.tsx` - Add resume action

### Tier 2: Core UI
4. ✅ `frontend/src/components/dev-bots/details/TaskDetailPanel.tsx` or similar - Display metadata
5. ✅ `frontend/src/components/dev-bots/queue/ResumeTaskButton.tsx` - **NEW FILE** - Resume action

### Tier 3: Polish
6. ✅ `frontend/src/components/dev-bots/queue/TaskQueuePanel.tsx` - Visual enhancements
7. ✅ `frontend/src/utils/statusHelpers.tsx` - Already has 'blocked', verify styling

---

## Risk Assessment

### Low Risk
- ✅ API contracts already include 'blocked' in status types
- ✅ Frontend already has 'blocked' filter implemented
- ✅ StatusHelpers already handles 'blocked' status

### Medium Risk
- ⚠️ Need to ensure resume API endpoint exists in backend (already implemented in PR review)
- ⚠️ Need to coordinate backend rebuild with frontend changes

### High Risk
- ❌ None identified

---

## Dependencies

### Backend
- ✅ POST `/api/dev-bots/tasks/:id/resume` endpoint (implemented)
- ✅ Task blocking logic (implemented)
- ✅ Database migration 029 (adds 'blocked' to status CHECK constraint)
- ✅ Database migration 030 (adds resumed_by, resumed_at columns)

### Frontend
- ✅ Existing UI components (Button, Dialog, Input, Alert)
- ✅ Existing utilities (formatRelativeTime)
- ✅ Existing store pattern (devBotsStore)

---

## Success Criteria

### Must Have (P0)
- [x] 'blocked' status included in TypeScript types
- [ ] DevBotsTask interface includes blocking/resume fields
- [ ] Resume API function implemented
- [ ] Resume action in store
- [ ] Display blocking metadata in UI
- [ ] Resume button functional

### Should Have (P1)
- [ ] Resume audit trail displayed
- [ ] Proper error handling and user feedback
- [ ] Visual indicators for blocked tasks

### Nice to Have (P2)
- [ ] Enhanced filter button styling
- [ ] Animations for status transitions
- [ ] Detailed blocking reason formatting

---

## Rollout Strategy

### Phase 1: Silent Deploy
- Deploy backend with blocking/resume logic
- Tasks can block but frontend shows minimal UI
- Resume possible via API only

### Phase 2: Basic UI
- Deploy blocking metadata display
- Deploy resume button
- Full workflow functional

### Phase 3: Enhanced UX
- Deploy visual enhancements
- Deploy improved error messages
- Polish complete

---

## Monitoring & Observability

### Metrics to Track
- Number of tasks entering 'blocked' status
- Time tasks spend in blocked state before resume
- Resume success/failure rate
- Most common blocking reasons

### Alerts
- Alert if >5 tasks blocked simultaneously
- Alert if task blocked for >24 hours without resume
- Alert if resume API error rate >10%

---

## Documentation Updates Needed

1. **User Guide**: How to resume a blocked task
2. **Developer Guide**: When tasks block vs. fail
3. **API Documentation**: Resume endpoint specification
4. **Architecture Docs**: Blocking/resume flow diagram

---

## Next Actions

1. **Implement Phase 1**: Update API contracts with blocking fields
2. **Rebuild Backend**: Ensure migrations 029 and 030 applied
3. **Implement Phase 2**: Add resume API function
4. **Implement Phase 3**: Add resume store action
5. **Test Integration**: Verify end-to-end flow
6. **Implement UI Phases**: Build user-facing components
7. **Run E2E Tests**: Verify complete workflow
