# Frontend Minimalist Redesign

**Status:** Planning  
**Created:** 2025-11-14  
**Priority:** High  
**Effort:** Large (complete redesign)

---

## Overview

Complete frontend redesign aligned with master design intent: **minimalist intervention panel** focused on binary status, high-signal alerts, and critical controls. Remove all log viewing and service monitoring features.

---

## Design Philosophy Alignment

From `master-design-intent.md`:

> **Minimalist UI**
> - ✅ DO: Show binary status (on/off, active/blocked), high-signal alerts, critical controls
> - ❌ NEVER: Analytics dashboards, exploratory metrics, documentation browsers, vanity metrics
> - WHY: Dev-monitor is an intervention panel, not a BI tool. If it doesn't help unblock/triage, it doesn't belong.

**Core Principle:** If it doesn't help unblock or triage autonomous dev-bots, it doesn't belong.

---

## Current State Analysis

### ❌ To Remove (Log Viewing & Service Monitoring)

**Frontend Components:**
- `LocalTab.tsx` - Local services monitoring
- `DeployedServicesTab.tsx` - Cloud services monitoring
- `ServiceCard.tsx`, `ServiceGrid.tsx`, `ServiceInfo.tsx`
- `LogsViewer.tsx`, `EnhancedLogsViewer.tsx`, `MinimalLogsPanel.tsx`
- `CloudLogsViewer.tsx`, `CloudLogsPanel.tsx`, `CloudPanelContainer.tsx`
- `LogFilters.tsx`, `LogsToolbar.tsx`, `LogLine.tsx`, `LogLevelBadge.tsx`
- `StatusBadge.tsx`, `PortBadge.tsx`
- `ControlButtons.tsx` (service start/stop)
- `KeyboardShortcutsHelp.tsx` (for log navigation)

**Backend Routes (to remove):**
- `/api/services/*` - Service management
- `/api/logs/*` - Log source management  
- `/api/environments/*` - Cloud logging environments
- `/api/ports/*` - Port management

**Backend Services (to remove):**
- `ProcessManager` - Local process management
- `LogSourceManager` - Log file monitoring
- `LogStreamer` - Log streaming via WebSocket
- Cloud logging integration services

**Configuration (to remove):**
- `backend/config/log-sources.json`
- Log source configuration schemas
- Service definitions

### ✅ To Keep/Enhance (Intervention Panel)

**Core Focus Areas:**
1. **Chain Status Monitoring** - Active chains, blocked chains, completion status
2. **Task Queue Visibility** - Pending tasks, running tasks, failed tasks
3. **Alert System** - PR merge blockers, stuck tasks, review escalations
4. **Manual Intervention** - Unblock chains, retry tasks, escalate to human
5. **PR Tracking** - PR status, merge gate conditions, review state

**Keep These Components:**
- `DevBotsTab.tsx` → becomes main view
- `DevBotsLayout.tsx` → main layout
- `ChainStatusPanel.tsx` → chain monitoring
- `TaskQueuePanel.tsx` → task queue
- `WorkerConsolePanel.tsx` → active worker status
- `InteractiveTerminal.tsx` → manual bot interaction
- Core layout components (`Header`, `MainLayout`)

**Keep These Backend Routes:**
- `/api/dev-bots/*` - All dev-bots endpoints
- `/api/quality-gates/*` - PR merge gate tracking
- `/api/verification/*` - Task verification status
- `/api/github/webhooks/*` - PR event handling
- `/api/health` - System health

---

## New Frontend Architecture

### Single-View Dashboard

```
┌─────────────────────────────────────────────────────────┐
│ App Monitor - Autonomous Development Intervention Panel │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  🚨 ALERTS (High-Signal Only)                           │
│  ┌────────────────────────────────────────────┐        │
│  │ ⚠️  3 chains blocked on PR merge conflicts  │        │
│  │ ⚠️  1 task stuck for >60 minutes            │        │
│  │ ℹ️  2 chains awaiting review (5th attempt)  │        │
│  └────────────────────────────────────────────┘        │
│                                                          │
│  📊 CHAIN STATUS                                        │
│  ┌──────────────┬──────────────┬──────────────┐        │
│  │ Active: 3/3  │ Queued: 12   │ Blocked: 3   │        │
│  └──────────────┴──────────────┴──────────────┘        │
│                                                          │
│  🔗 ACTIVE CHAINS                                       │
│  ┌────────────────────────────────────────────┐        │
│  │ Chain #42: Migrate user schema              │        │
│  │   Status: REVIEW (attempt 2/4)              │        │
│  │   PR: #123 (merge conflict)                 │        │
│  │   [View PR] [Unblock] [Escalate]            │        │
│  ├────────────────────────────────────────────┤        │
│  │ Chain #43: Add auth middleware              │        │
│  │   Status: FIX (in progress)                 │        │
│  │   Task: Running for 12 minutes              │        │
│  │   [View Logs] [Cancel]                      │        │
│  └────────────────────────────────────────────┘        │
│                                                          │
│  ⏸️  BLOCKED CHAINS (Require Intervention)             │
│  ┌────────────────────────────────────────────┐        │
│  │ Chain #40: Update dependencies              │        │
│  │   Blocker: Base branch not updated          │        │
│  │   PR: #121                                  │        │
│  │   [Update Base] [Skip Gate] [Abandon]       │        │
│  └────────────────────────────────────────────┘        │
│                                                          │
│  📋 TASK QUEUE (Staged)                                │
│  ┌────────────────────────────────────────────┐        │
│  │ Implementation Queue: 12 tasks              │        │
│  │ Followup Queue: 8 tasks (REVIEW/FIX)        │        │
│  │ [Pause Queue] [View All]                    │        │
│  └────────────────────────────────────────────┘        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
App
├── ErrorBoundary
├── ThemeProvider
├── PasswordGate
└── InterventionDashboard (new)
    ├── DashboardHeader (new)
    ├── AlertsPanel (new)
    │   ├── Alert (component for each alert)
    │   └── AlertActions (quick actions)
    ├── ChainStatsCards (new)
    │   ├── ActiveChainsCard
    │   ├── QueuedChainsCard
    │   └── BlockedChainsCard
    ├── ActiveChainsPanel (enhanced)
    │   └── ChainCard (new)
    │       ├── ChainStatus
    │       ├── PRLink
    │       └── InterventionActions (new)
    ├── BlockedChainsPanel (new)
    │   └── BlockedChainCard (new)
    │       ├── BlockerReason
    │       └── UnblockActions (new)
    ├── QueueStatsPanel (simplified)
    │   ├── QueueMetrics
    │   └── QueueControls (new)
    └── WorkerStatusPanel (simplified)
        └── ActiveWorkerCard
```

---

## API Contracts (Keep/Enhance)

### Existing Contracts to Keep
- `DevBotsStatus`
- `DevBotsTask`
- `TaskChain`
- `ChainStats`
- `QualityGateCondition`
- `PRMergeStatus`

### New Contracts Needed

```typescript
// High-signal alerts
export interface SystemAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  type: 'chain_blocked' | 'task_stuck' | 'review_escalated' | 'merge_conflict' | 'ci_failure';
  message: string;
  chainId?: string;
  taskId?: string;
  prNumber?: number;
  timestamp: number;
  actions: AlertAction[];
}

export interface AlertAction {
  id: string;
  label: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  confirmRequired?: boolean;
}

// Chain intervention
export interface ChainInterventionOptions {
  chainId: string;
  action: 'unblock' | 'escalate' | 'abandon' | 'retry' | 'skip_gate';
  reason?: string;
  gateToSkip?: string;
}

// Queue controls
export interface QueueControlAction {
  action: 'pause' | 'resume' | 'clear_implementation' | 'clear_followup';
  confirmation: string;
}
```

---

## Backend Changes

### Routes to Remove

**Complete Removal:**
- `backend/src/routes/services.routes.ts`
- `backend/src/routes/logs.routes.ts`
- `backend/src/routes/environments.routes.ts`
- `backend/src/routes/ports.routes.ts`

### Services to Remove

**Complete Removal:**
- `backend/src/services/processManager.ts`
- `backend/src/services/logSourceManager.ts`
- `backend/src/services/logStreamer.ts`
- Cloud logging services

### Services to Keep/Enhance

**Keep:**
- `TaskQueueService` - Core task queue
- `ChainTracker` - Chain lifecycle
- `DevBotsManager` - Bot orchestration
- `QualityGateService` - PR merge gates
- `PRTracker` - PR status monitoring
- `VerificationService` - Task verification

**Enhance:**
- Add alert aggregation to `ChainTracker`
- Add intervention endpoints to `TaskQueueService`
- Add queue control endpoints

### New Backend Routes

```typescript
// Alert system
GET  /api/alerts                    // Get active alerts
POST /api/alerts/:id/dismiss        // Dismiss alert
POST /api/alerts/:id/action         // Execute alert action

// Chain intervention
POST /api/chains/:id/unblock        // Unblock chain
POST /api/chains/:id/escalate       // Escalate to human
POST /api/chains/:id/abandon        // Abandon chain
POST /api/chains/:id/retry          // Retry failed task

// Queue controls
POST /api/queue/pause               // Pause queue processing
POST /api/queue/resume              // Resume queue
POST /api/queue/clear               // Clear specific queue
GET  /api/queue/stats               // Enhanced queue stats
```

---

## WebSocket Events

### Remove
- `log_update` - Log streaming
- `process_status` - Service status
- `cloud_log` - Cloud logging

### Keep/Enhance
- `chain_status_changed` - Chain lifecycle updates
- `task_status_changed` - Task updates
- `alert_created` - New alert
- `alert_resolved` - Alert cleared
- `queue_stats_updated` - Queue metrics
- `worker_status_changed` - Bot status

---

## Migration Strategy

### Phase 1: Backend Cleanup (Week 1)
1. **Remove unused routes** (services, logs, environments, ports)
2. **Remove unused services** (ProcessManager, LogSourceManager, LogStreamer)
3. **Update tests** - Remove tests for deleted functionality
4. **Add new routes** - Alerts, intervention, queue controls
5. **Update API contracts** - Add new types to `shared/api-contracts`

### Phase 2: Frontend Redesign (Week 2)
1. **Create new components** - AlertsPanel, ChainStatsCards, InterventionActions
2. **Simplify routing** - Single dashboard view (no tabs)
3. **Remove old components** - Delete all log/service components
4. **Update WebSocket handlers** - Remove log subscriptions
5. **Enhance chain/task displays** - Focus on intervention actions

### Phase 3: Testing & Polish (Week 3)
1. **Integration testing** - Alert → action → resolution flows
2. **E2E testing** - Critical intervention paths
3. **Performance testing** - Alert aggregation, real-time updates
4. **Documentation** - Update README, architecture docs
5. **Deployment** - Staged rollout to production

---

## Success Criteria

### Functional Requirements
- ✅ All active chains visible with status
- ✅ Blocked chains show specific blocker and unblock actions
- ✅ High-signal alerts surfaced immediately
- ✅ One-click intervention actions work
- ✅ Queue pause/resume functional
- ✅ Real-time updates via WebSocket

### Performance Requirements
- ✅ Dashboard loads <500ms
- ✅ Alert latency <1s from backend event
- ✅ Intervention action response <2s
- ✅ No polling (100% event-driven)

### UX Requirements
- ✅ Critical info visible without scrolling
- ✅ Intervention actions require max 2 clicks
- ✅ No analytics/vanity metrics
- ✅ Clear binary status indicators
- ✅ Mobile-responsive (alerts accessible on phone)

---

## Files to Delete

### Frontend (Complete Removal)
```
frontend/src/components/
├── CloudLogsPanel.tsx
├── CloudLogsViewer.tsx
├── CloudPanelContainer.tsx
├── ControlButtons.tsx
├── EnhancedLogsViewer.tsx
├── KeyboardShortcutsHelp.tsx
├── LogFilters.tsx
├── LogLevelBadge.tsx
├── LogLine.tsx
├── LogsToolbar.tsx
├── LogsViewer.tsx
├── MinimalLogsPanel.tsx
├── MinimalPanelContainer.tsx
├── PortBadge.tsx
├── ServiceCard.tsx
├── ServiceGrid.tsx
├── ServiceInfo.tsx
└── StatusBadge.tsx

frontend/src/components/tabs/
├── LocalTab.tsx
└── DeployedServicesTab.tsx

frontend/src/hooks/
├── useServices.ts (refactor to remove service mgmt)
└── useCloudLogs.ts
```

### Backend (Complete Removal)
```
backend/src/routes/
├── services.routes.ts
├── logs.routes.ts
├── environments.routes.ts
└── ports.routes.ts

backend/src/services/
├── processManager.ts
├── logSourceManager.ts
└── logStreamer.ts

backend/config/
└── log-sources.json
```

### Tests (Remove)
```
backend/tests/integration/
├── processManager.test.ts
├── logStreamer.test.ts
└── services.routes.test.ts

frontend/src/components/
├── ServiceCard.test.tsx
├── CloudPanelContainer.test.tsx
├── LogLevelBadge.test.tsx
├── StatusBadge.test.tsx
└── PortBadge.test.tsx
```

---

## Risk Assessment

### High Risk
- **Data loss** - Removing services while dev-bots running
  - *Mitigation:* Deploy during maintenance window, pause queue first
- **Missing critical features** - Removing too much
  - *Mitigation:* User testing with stakeholder before deletion

### Medium Risk
- **WebSocket migration** - Changing event structure
  - *Mitigation:* Backward-compatible events during transition
- **Test coverage gap** - Deleting tests before new ones written
  - *Mitigation:* Write new tests before deleting old

### Low Risk
- **Documentation drift** - Docs referencing removed features
  - *Mitigation:* Update docs in same PR as code changes

---

## Open Questions

1. **Terminal access** - Keep `InteractiveTerminal` for manual bot sessions?
   - **Answer:** YES - Required for manual intervention/debugging

2. **Worker logs** - Keep minimal worker output in `WorkerConsolePanel`?
   - **Answer:** YES - But only current task output, no history

3. **Task history** - Show completed chains or only active/blocked?
   - **Answer:** Active + Blocked only. Completed chains in PR tracking.

4. **Alert persistence** - Store alerts in DB or in-memory only?
   - **Answer:** In-memory + 24hr window in DB for audit trail

5. **Queue visibility** - Show all queued tasks or just stats?
   - **Answer:** Stats by default, expandable view for troubleshooting

---

## Next Steps

1. ✅ **This document** - Design approved by stakeholder
2. ⏳ **Create implementation task** - Break down into subtasks
3. ⏳ **Backend cleanup PR** - Remove routes/services
4. ⏳ **Frontend redesign PR** - New minimalist UI
5. ⏳ **Integration testing** - End-to-end intervention flows
6. ⏳ **Documentation update** - README, architecture, API docs
7. ⏳ **Production deployment** - Staged rollout

---

**Last Updated:** 2025-11-14  
**Owner:** Platform Tooling
