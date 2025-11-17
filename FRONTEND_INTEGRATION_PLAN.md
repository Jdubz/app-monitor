# Frontend Phase System Integration Plan

**Status:** Backend Ready ✅ | Frontend Not Updated ❌  
**Effort:** 3-4 hours  
**Priority:** Medium (UX improvement, not blocking)

---

## What's Already Done (Backend)

✅ **API Contract Updated**
- Phase fields already exposed in `DevBotsTask` interface
- Backend routes return: `phaseIndex`, `phaseName`, `phaseStatus`, `phaseAttempts`
- File: `backend/src/routes/dev-bots/shared.ts:206-210`

✅ **Metrics API Created**
- 6 REST endpoints for phase analytics
- Real-time metrics with 5-minute cache
- See: `backend/src/routes/metrics.routes.ts`

✅ **WebSocket Events**
- Backend emits phase lifecycle events
- Events: `phase:started`, `phase:completed`, `phase:failed`, etc.
- Frontend just needs to subscribe

---

## Feature 1: Task List - Phase Progress Indicator

### Current State
Tasks in the queue show basic info (title, status, priority)

### New Features

#### 1.1 Phase Badge
Display current phase in task list item:

```tsx
// frontend/src/components/dev-bots/queue/TaskQueuePanel.tsx

<div className="task-phase-badge">
  <span className="phase-number">Phase {task.phaseIndex}/7</span>
  <span className="phase-name">{task.phaseName}</span>
  <span className={`phase-status phase-status-${task.phaseStatus}`}>
    {task.phaseStatus}
  </span>
</div>
```

**Visual Example:**
```
┌─────────────────────────────────────────┐
│ Fix authentication bug                  │
│ Phase 5/7 • Test & Validate • running   │
│ Attempt 2 of 4                          │
└─────────────────────────────────────────┘
```

#### 1.2 Progress Bar
Linear progress visualization (1-7 phases):

```tsx
<div className="phase-progress-bar">
  <div 
    className="phase-progress-fill"
    style={{ width: `${(task.phaseIndex / 7) * 100}%` }}
  />
  <div className="phase-markers">
    {[1,2,3,4,5,6,7].map(phase => (
      <div 
        key={phase}
        className={cn(
          "phase-marker",
          phase < task.phaseIndex && "completed",
          phase === task.phaseIndex && "active"
        )}
      />
    ))}
  </div>
</div>
```

**Visual Example:**
```
●━━━●━━━●━━━●━━━○────○────○
1   2   3   4   5    6    7
         ↑ currently here
```

#### 1.3 Attempt Counter
Show retry attempts with visual warning:

```tsx
{task.phaseAttempts > 1 && (
  <div className={cn(
    "attempt-counter",
    task.phaseAttempts >= 3 && "warning"
  )}>
    <AlertCircle className="h-3 w-3" />
    Attempt {task.phaseAttempts}/4
  </div>
)}
```

---

## Feature 2: Task Detail View - Phase History

### Current State
Task detail shows basic execution info

### New Features

#### 2.1 Phase Timeline
Show all completed phase runs from `task_stage_runs` table:

```tsx
// frontend/src/components/dev-bots/tasks/TaskPhaseHistory.tsx

interface TaskPhaseHistoryProps {
  taskId: string;
}

export function TaskPhaseHistory({ taskId }: TaskPhaseHistoryProps) {
  const [stageRuns, setStageRuns] = useState<StageRun[]>([]);

  useEffect(() => {
    // Fetch from new API endpoint
    fetch(`/api/dev-bots/tasks/${taskId}/stage-runs`)
      .then(res => res.json())
      .then(data => setStageRuns(data.stageRuns));
  }, [taskId]);

  return (
    <div className="phase-timeline">
      {stageRuns.map(run => (
        <div key={run.id} className={`phase-run phase-run-${run.status}`}>
          <div className="phase-run-header">
            <span className="phase-name">{run.phase_name}</span>
            <span className="attempt">Attempt {run.attempt}</span>
            <span className={`status status-${run.status}`}>
              {run.status}
            </span>
          </div>
          
          <div className="phase-run-meta">
            <Clock /> {formatDuration(run.duration)}
            <Calendar /> {formatDate(run.created_at)}
          </div>

          {run.recovery_diagnosis && (
            <div className="recovery-info">
              <AlertTriangle className="text-yellow-500" />
              <span>Recovery attempted</span>
              <details>
                <summary>Diagnosis</summary>
                <pre>{JSON.stringify(JSON.parse(run.recovery_diagnosis), null, 2)}</pre>
              </details>
            </div>
          )}

          {run.artifacts_blob && (
            <Accordion>
              <AccordionItem value="artifacts">
                <AccordionTrigger>View Artifacts</AccordionTrigger>
                <AccordionContent>
                  <ArtifactViewer artifacts={JSON.parse(run.artifacts_blob)} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      ))}
    </div>
  );
}
```

**Visual Example:**
```
Phase History
─────────────

✅ Phase 1: Planning (Attempt 1)
   ⏱ 3m 24s  📅 Nov 17, 2025 12:30 PM
   
✅ Phase 2: Implementation (Attempt 1)  
   ⏱ 18m 15s  📅 Nov 17, 2025 12:33 PM
   📎 Artifacts: PR #123 created
   
✅ Phase 3: Review (Attempt 1)
   ⏱ 5m 08s  📅 Nov 17, 2025 12:51 PM
   📎 Artifacts: 3 issues found
   
✅ Phase 4: Fixes (Attempt 1)
   ⏱ 12m 42s  📅 Nov 17, 2025 12:56 PM
   
❌ Phase 3: Review (Attempt 2) - failed
   ⏱ 4m 55s  📅 Nov 17, 2025 1:09 PM
   ⚠️ Recovery attempted: context_update
   📎 Artifacts: 1 issue remaining
   
▶️ Phase 4: Fixes (Attempt 2) - running
   Started: Nov 17, 2025 1:14 PM
```

#### 2.2 Artifact Viewer Component
Display phase-specific artifacts:

```tsx
// frontend/src/components/dev-bots/tasks/ArtifactViewer.tsx

interface ArtifactViewerProps {
  artifacts: PhaseArtifacts;
}

export function ArtifactViewer({ artifacts }: ArtifactViewerProps) {
  // Phase 1: Planning artifacts
  if (artifacts.planning) {
    return (
      <div className="planning-artifacts">
        <div className="artifact-item">
          <Label>Obsolete:</Label>
          <Badge>{artifacts.planning.obsolete ? 'Yes' : 'No'}</Badge>
        </div>
        {artifacts.planning.dependencies?.length > 0 && (
          <div className="artifact-item">
            <Label>Dependencies:</Label>
            <ul>
              {artifacts.planning.dependencies.map(dep => (
                <li key={dep}>{dep}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Phase 3: Review artifacts (issues)
  if (artifacts.review) {
    return (
      <div className="review-artifacts">
        <div className="issues-summary">
          <span>Total Issues: {artifacts.review.total_issues}</span>
          <span className="text-red-500">
            Blocking: {artifacts.review.blocking_issues}
          </span>
        </div>
        <div className="issues-list">
          {artifacts.review.issues.map(issue => (
            <div key={issue.fingerprint} className="issue-card">
              <Badge variant={issue.severity}>{issue.severity}</Badge>
              <span className="issue-file">{issue.file}:{issue.line}</span>
              <p className="issue-description">{issue.description}</p>
              {issue.blocking && (
                <span className="text-red-500">⚠️ Blocking</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Phase 5: Test results
  if (artifacts.tests) {
    return (
      <div className="test-artifacts">
        <div className="test-summary">
          <div className={artifacts.tests.all_tests_passing ? "success" : "error"}>
            Tests: {artifacts.tests.all_tests_passing ? '✅ Passing' : '❌ Failing'}
          </div>
          <div>Coverage Delta: {artifacts.tests.coverage_delta}%</div>
        </div>
        {artifacts.tests.failures?.length > 0 && (
          <div className="test-failures">
            <h4>Failed Tests</h4>
            {artifacts.tests.failures.map(failure => (
              <div key={`${failure.suite}-${failure.test}`} className="failure">
                <span className="suite">{failure.suite}</span>
                <span className="test">{failure.test}</span>
                <pre className="error">{failure.error}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Generic JSON fallback
  return <pre>{JSON.stringify(artifacts, null, 2)}</pre>;
}
```

---

## Feature 3: Real-Time Updates via WebSocket

### Current State
WebSocket connected but not subscribed to phase events

### New Features

#### 3.1 Subscribe to Phase Events
Update WebSocket handler to listen for phase lifecycle:

```tsx
// frontend/src/services/websocket.ts

export function usePhaseUpdates(taskId: string) {
  const [phaseState, setPhaseState] = useState<PhaseState | null>(null);

  useEffect(() => {
    const socket = getWebSocket();

    const handlers = {
      'phase:started': (data: PhaseEvent) => {
        if (data.taskId === taskId) {
          setPhaseState({
            phase: data.phaseIndex,
            status: 'running',
            attempt: data.attempt,
          });
        }
      },

      'phase:validating': (data: PhaseEvent) => {
        if (data.taskId === taskId) {
          setPhaseState(prev => prev && { ...prev, status: 'validating' });
        }
      },

      'phase:validation_failed': (data: PhaseEvent) => {
        if (data.taskId === taskId) {
          setPhaseState(prev => prev && { ...prev, status: 'failed' });
        }
      },

      'phase:recovering': (data: PhaseEvent) => {
        if (data.taskId === taskId) {
          setPhaseState(prev => prev && { ...prev, status: 'recovering' });
        }
      },

      'phase:completed': (data: PhaseEvent) => {
        if (data.taskId === taskId) {
          setPhaseState({
            phase: data.nextPhase,
            status: 'ready',
            attempt: 1,
          });
        }
      },
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    };
  }, [taskId]);

  return phaseState;
}
```

#### 3.2 Live Status Indicators
Show real-time phase status:

```tsx
export function TaskDetailView({ taskId }: TaskDetailViewProps) {
  const task = useTask(taskId);
  const livePhase = usePhaseUpdates(taskId);

  return (
    <div className="task-detail">
      <div className="current-phase">
        <h3>Current Phase</h3>
        <div className={`phase-status-live phase-${livePhase?.status}`}>
          {livePhase?.status === 'validating' && (
            <>
              <Loader2 className="animate-spin" />
              <span>Validating phase {livePhase.phase}...</span>
            </>
          )}
          {livePhase?.status === 'recovering' && (
            <>
              <AlertTriangle className="animate-pulse text-yellow-500" />
              <span>Recovery agent diagnosing...</span>
            </>
          )}
          {livePhase?.status === 'running' && (
            <>
              <PlayCircle className="text-blue-500" />
              <span>Executing phase {livePhase.phase}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Visual Example:**
```
Current Phase
─────────────
🔵 Executing Phase 5: Test & Validate
   Attempt 2 of 4

[Live status updates appear here]
⟳ Validating test results...
⚠️ Recovery agent diagnosing failures...
✅ Phase 5 complete, advancing to Phase 6
```

---

## Feature 4: Phase Metrics Dashboard

### New Component
Create dashboard using the new Metrics API:

```tsx
// frontend/src/components/metrics/PhaseMetricsDashboard.tsx

export function PhaseMetricsDashboard() {
  const [metrics, setMetrics] = useState<PhaseMetricsSnapshot | null>(null);

  useEffect(() => {
    fetch('/api/metrics/phases')
      .then(res => res.json())
      .then(data => setMetrics(data.data));
  }, []);

  if (!metrics) return <Loader />;

  return (
    <div className="metrics-dashboard">
      {/* Phase Success Rates */}
      <Card>
        <CardHeader>
          <CardTitle>Phase Success Rates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="phase-success-grid">
            {metrics.phaseStats.map(phase => (
              <div key={phase.phaseIndex} className="phase-stat">
                <div className="phase-name">
                  Phase {phase.phaseIndex}: {phase.phaseName}
                </div>
                <div className="success-rate">
                  <Progress value={phase.successRate * 100} />
                  <span>{(phase.successRate * 100).toFixed(1)}%</span>
                </div>
                <div className="phase-details">
                  <span>{phase.successfulRuns} / {phase.totalRuns} runs</span>
                  <span>Avg: {formatDuration(phase.averageDurationMs)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Task Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Current Task Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart data={[
            { phase: 'Phase 1', count: metrics.activeTaskDistribution.phase1 },
            { phase: 'Phase 2', count: metrics.activeTaskDistribution.phase2 },
            { phase: 'Phase 3', count: metrics.activeTaskDistribution.phase3 },
            { phase: 'Phase 4', count: metrics.activeTaskDistribution.phase4 },
            { phase: 'Phase 5', count: metrics.activeTaskDistribution.phase5 },
            { phase: 'Phase 6', count: metrics.activeTaskDistribution.phase6 },
            { phase: 'Phase 7', count: metrics.activeTaskDistribution.phase7 },
          ]} />
        </CardContent>
      </Card>

      {/* Loop Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Phase Loop Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.loopStats.map(loop => (
            <div key={loop.phaseIndex} className="loop-stat">
              <h4>Phase {loop.phaseIndex} ({loop.phaseName})</h4>
              <div className="loop-metrics">
                <span>Avg Iterations: {loop.averageIterations.toFixed(1)}</span>
                <span>Max: {loop.maxIterations}</span>
                <span className="text-red-500">
                  Exceeded Limit: {loop.tasksExceedingLimit}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recovery Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Recovery Agent Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="recovery-stats">
            <div className="stat">
              <span>Success Rate</span>
              <strong>{(metrics.recoveryStats.recoverySuccessRate * 100).toFixed(1)}%</strong>
            </div>
            <div className="stat">
              <span>Total Attempts</span>
              <strong>{metrics.recoveryStats.totalRecoveryAttempts}</strong>
            </div>
            <div className="recovery-categories">
              <h5>Recovery Categories</h5>
              {Object.entries(metrics.recoveryStats.categoryCounts).map(([cat, count]) => (
                <div key={cat} className="category">
                  <Badge>{cat}</Badge>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Visual Example:**
```
┌─────────────────────────────────────┐
│ Phase Success Rates                 │
├─────────────────────────────────────┤
│ Phase 1: Planning                   │
│ ████████████████████ 95.2%          │
│ 40/42 runs • Avg: 3m 24s            │
│                                     │
│ Phase 5: Test & Validate            │
│ ████████████░░░░░░░░ 76.8%          │
│ 23/30 runs • Avg: 12m 15s           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Current Task Distribution           │
├─────────────────────────────────────┤
│ Phase 1  ██ 2                       │
│ Phase 2  ████ 4                     │
│ Phase 3  ██ 2                       │
│ Phase 4  █ 1                        │
│ Phase 5  ████████ 8 ⚠️              │
│ Phase 6  █ 1                        │
│ Phase 7   0                         │
└─────────────────────────────────────┘
```

---

## Implementation Checklist

### Phase 1: Task List Updates (1-1.5 hours)
- [ ] Add phase badge to TaskQueuePanel
- [ ] Add progress bar component
- [ ] Add attempt counter
- [ ] Style phase status indicators
- [ ] Test with different phase states

### Phase 2: Task Detail View (1-1.5 hours)
- [ ] Create TaskPhaseHistory component
- [ ] Add API endpoint: `GET /api/dev-bots/tasks/:id/stage-runs`
- [ ] Create ArtifactViewer component
- [ ] Handle all 7 phase artifact types
- [ ] Test with real task data

### Phase 3: Real-Time Updates (30-45 minutes)
- [ ] Update WebSocket service
- [ ] Create usePhaseUpdates hook
- [ ] Add live status indicators
- [ ] Test event subscriptions

### Phase 4: Metrics Dashboard (1 hour)
- [ ] Create PhaseMetricsDashboard component
- [ ] Integrate with Metrics API endpoints
- [ ] Add charts/visualizations
- [ ] Add navigation link to dashboard

---

## Required Backend Endpoint (Missing)

You'll need to add ONE new endpoint:

```typescript
// backend/src/routes/dev-bots/tasks.routes.ts

/**
 * GET /dev-bots/tasks/:taskId/stage-runs
 * Get historical phase execution records for a task
 */
router.get('/:taskId/stage-runs', async (req, res) => {
  try {
    const { taskId } = req.params;
    const db = getDatabase().getDb();
    
    const stageRuns = db.prepare(`
      SELECT * FROM task_stage_runs
      WHERE task_id = ?
      ORDER BY created_at DESC
    `).all(taskId);

    respondSuccess(res, { stageRuns });
  } catch (error) {
    respondError(res, 500, 'FAILED_TO_GET_STAGE_RUNS');
  }
});
```

---

## Summary: Frontend Features

1. ✅ **Phase Progress in Task List**
   - Badge showing "Phase 5/7 • Test & Validate"
   - Progress bar visualization
   - Attempt counter with warnings

2. ✅ **Phase History Timeline**
   - All completed phase runs
   - Duration and timestamp per run
   - Recovery diagnosis display
   - Expandable artifacts

3. ✅ **Live Status Updates**
   - WebSocket subscriptions
   - Real-time phase transitions
   - Validation/recovery status
   - Animated indicators

4. ✅ **Metrics Dashboard**
   - Success rates per phase
   - Active task distribution
   - Loop iteration statistics
   - Recovery performance

**Total Effort:** 3-4 hours  
**Dependencies:** 1 new backend endpoint (5 minutes)  
**Impact:** Significant UX improvement, full visibility into phase system
