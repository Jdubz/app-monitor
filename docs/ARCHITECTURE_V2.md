# App-Monitor Architecture V2 - Autonomous Development System

**Version:** 2.0.0  
**Last Updated:** October 26, 2025  
**Status:** Evolution In Progress  
**Based On:** `docs/plans/EVOLUTION_PLAN.md`, `docs/plans/app-monitor-updated-plan-summary.md`

---

## 🎯 System Vision

App-Monitor is evolving from a **development monitoring tool** into a **self-building, self-improving autonomous development platform** that:
- Uses multiple AI models optimally (Claude, GPT, Cursor, Copilot)
- Learns from every task execution to improve model selection
- Self-tunes prompts and configurations
- Operates within token budget constraints
- Produces high-quality, tested, documented code
- **Evolves and builds itself incrementally**

---

## 📐 Core Principles

### 1. Quality First
- Task completion is PRIMARY metric
- Code quality is SECONDARY metric
- All code must pass: **tests + linter + documentation requirements**
- No shortcuts - quality gates are mandatory

### 2. Simplicity First
- All commits directly to `staging` branch (no complex branching)
- Tasks must be extremely granular (minimize interpretation)
- Clear, specific acceptance criteria for every task
- Single responsibility per task

### 3. Budget Conscious
- Track token usage across all providers (not dollar amounts)
- Different providers have different billing cycles (monthly/weekly)
- Hard stop when budget thresholds reached
- Optimize for cost without sacrificing quality

### 4. Learning & Experimentation
- Collect ALL data for pattern analysis
- Intelligent A/B testing within tolerances
- Agent analyzes patterns and suggests improvements
- System can tune its own prompts/configs during "learn" tasks

### 5. Controlled Autonomy
- Batch approval system (approve N tasks, system executes all)
- System pauses when approved batch completes
- Human reviews results before approving next batch
- Failed tasks stop execution immediately (V1)

---

## 🏗️ System Architecture

### High-Level Architecture

```
┌────────────────────────────────────────────────────────────┐
│                   Browser Dashboard                         │
│  [Task Queue] [Logs] [Services] [Agents] [Token Monitor]  │
└─────────────────────┬──────────────────────────────────────┘
                      │ HTTP/WebSocket
                      ▼
┌────────────────────────────────────────────────────────────┐
│           App-Monitor Backend (Port 5000)                   │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │                  Core Services                       │   │
│  │  • ProcessManager (service lifecycle)               │   │
│  │  • LogSourceManager (config-driven log streaming)   │   │
│  │  • TaskQueueManager (FIFO, persistence)            │   │
│  │  • ClaudeWorkersManager (agent coordination)       │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │            Autonomous Development Layer (Phase 1)    │   │
│  │  • TokenTrackingService (budget management)         │   │
│  │  • QualityGateValidator (test/lint/docs)           │   │
│  │  • TaskQualityScorer (scoring framework)           │   │
│  │  • BatchApprovalManager (controlled autonomy)       │   │
│  │  • HealingSystem (failure pattern detection)       │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │        Multi-Model Integration (Phase 2)            │   │
│  │  • ModelRouter (optimal model selection)            │   │
│  │  • PromptTemplateManager (model-specific prompts)   │   │
│  │  • LearningEngine (pattern analysis, A/B testing)   │   │
│  │  • SelfTuner (automated optimization)              │   │
│  └────────────────────────────────────────────────────┘   │
└──────┬────────────────┬───────────────┬─────────────────┘
       │                │               │
   ┌───▼────┐      ┌───▼──────┐   ┌───▼─────────────┐
   │ Local  │      │  Docker  │   │  AI Providers   │
   │Services│      │Containers│   │ Claude/GPT/etc  │
   └────────┘      └──────────┘   └─────────────────┘
```

---

## 📂 Directory Structure (Permanent Location)

```
job-finder-app-manager/
├── app-monitor/                    ← Permanent home
│   ├── backend/
│   │   ├── src/
│   │   │   ├── routes/            ← 30+ API endpoints
│   │   │   ├── services/
│   │   │   │   ├── processManager.ts
│   │   │   │   ├── logSourceManager.ts     ← NEW: Config-driven logs
│   │   │   │   ├── taskQueueManager.ts
│   │   │   │   ├── claudeWorkersManager.ts
│   │   │   │   ├── tokenTracking.ts        ← Phase 1
│   │   │   │   ├── qualityGates.ts         ← Phase 1
│   │   │   │   ├── taskScoring.ts          ← Phase 1
│   │   │   │   ├── batchApproval.ts        ← Phase 1
│   │   │   │   ├── healingSystem.ts        ← Phase 1
│   │   │   │   ├── modelRouter.ts          ← Phase 2
│   │   │   │   └── learningEngine.ts       ← Phase 2
│   │   │   ├── utils/
│   │   │   │   └── portCheck.ts            ← NEW: Port validation
│   │   │   └── config.ts                   ← Fixed ports, paths
│   │   ├── config/
│   │   │   └── log-sources.json            ← NEW: Central log config
│   │   ├── logs/                           ← App-monitor backend logs
│   │   └── scripts/
│   │       └── verify-config.js            ← NEW: Pre-flight checks
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── TokenMonitor.tsx        ← Phase 1
│   │   │   │   ├── QualityGates.tsx        ← Phase 1
│   │   │   │   ├── BatchApproval.tsx       ← Phase 1
│   │   │   │   └── LearningDashboard.tsx   ← Phase 2
│   │   │   └── ...
│   │   └── logs/                           ← App-monitor frontend logs
│   └── dev-bots/                           ← Phase B (later)
│       ├── logs/
│       └── ...
├── job-finder-BE/
│   └── logs/                               ← Backend service logs
├── job-finder-FE/
│   └── logs/                               ← Frontend service logs
├── job-finder-worker/
│   └── logs/                               ← Worker service logs
└── docs/
    └── plans/
        ├── EVOLUTION_PLAN.md               ← Master plan
        ├── app-monitor-updated-plan-summary.md
        └── APP-MONITOR-QUICKSTART.md
```

---

## 🔧 Core Components (Current State)

### 1. ProcessManager
**Purpose:** Manage local service lifecycles with port validation

**Enhanced Responsibilities:**
- Spawn/stop child processes (backend, frontend, workers)
- **Port conflict detection** (fail-fast, no dynamic ports)
- Track state transitions
- Handle stdout/stderr streams
- Auto-restart on crash (optional)

**Fixed Port Assignments:**
- **5000** - App Monitor backend
- **5174** - App Monitor frontend
- **5001** - Job Finder backend
- **5173** - Job Finder frontend
- **4000-9199** - Firebase emulators (4000, 4400, 8080, 9099, 9199)

### 2. LogSourceManager (NEW)
**Purpose:** Config-driven log streaming from multiple services

**Responsibilities:**
- Load log sources from `config/log-sources.json`
- Watch multiple log files simultaneously
- Parse different log formats (winston, vite, python)
- Stream to dashboard via Socket.IO
- Support enable/disable per source

**Configuration Example:**
```json
{
  "version": "1.0",
  "logSources": {
    "job-finder-backend": {
      "name": "Job Finder Backend",
      "enabled": true,
      "path": "../../job-finder-BE/logs/backend-dev.log",
      "format": "structured",
      "color": "#F97316",
      "parser": "winston",
      "displayOrder": 3
    }
  }
}
```

### 3. TaskQueueManager
**Purpose:** FIFO task queue with persistence

**Current Features:**
- 9 task types (feature, bugfix, refactoring, testing, documentation, etc.)
- JSON file persistence with automatic backups
- Task lifecycle: pending → assigned → active → completed/failed
- Retry system (exponential backoff)

**Phase 1 Enhancements:**
- Quality gate integration (tests/lint/docs must pass)
- Token usage tracking per task
- Quality scoring after completion
- Batch approval enforcement

### 4. ClaudeWorkersManager
**Purpose:** Coordinate autonomous AI agents

**Current Features:**
- 6 specialized agent personalities
- Docker ephemeral containers (72% smaller, 80% faster)
- Workspace sync (git worktrees: worker-a, worker-b)
- Scope creep detection
- **NO automatic cleanup scheduling** (removed - part of dev process)

**Agent Personalities:**
1. **Backend Specialist** - Node.js, TypeScript, PostgreSQL
2. **Frontend Specialist** - React, TypeScript, CSS
3. **Review Specialist** - Code analysis, security
4. **Testing Specialist** - Test frameworks, automation
5. **DevOps Specialist** - Docker, Kubernetes, CI/CD
6. **Documentation Specialist** - Technical writing

**Phase 1 Enhancements:**
- Quality reviewer agent (automated scoring)
- Token budget enforcement per agent
- Failure pattern detection
- Enhanced prompt templates

---

## 🚀 Evolution Phases

### ✅ Current State (85% Production Ready)
- Task management (FIFO queue, persistence, 9 types)
- 6 agent personalities
- Docker integration (ephemeral, optimized)
- 30+ API endpoints
- Real-time updates (Socket.IO)
- Workspace sync (git integration)
- Scope detection (partial enforcement)
- **Config-driven log streaming** (new)
- **Fixed port management** (new)
- **No automatic cleanup** (removed)

### 🚧 Phase 1: Foundation (2-3 weeks) - IN PROGRESS
**Goal:** Production-ready with quality enforcement and budget controls

1. **Token Tracking Integration** ⚡ HIGHEST PRIORITY
   - Research token APIs (Claude, Cursor, Copilot)
   - Implement TokenTrackingService
   - Dashboard token monitoring
   - Daily budget calculation (weekly/monthly limits)
   - Hard stop when budget reached

2. **Quality Gates Enforcement**
   - Pre-completion checklist (tests/lint/docs)
   - Test writing requirement for new features
   - Documentation update requirement
   - Tasks CANNOT complete without passing gates

3. **Quality Scoring Framework**
   - TaskQualityScorer service
   - Metrics: completion, code quality, test coverage, compliance, efficiency
   - Automated reviewer agent
   - Historical scoring data

4. **Batch Approval System**
   - Task counter (approved vs executed)
   - System pauses when batch complete
   - API endpoints for batch approval
   - Dashboard batch management UI

5. **Basic Healing System**
   - Failure pattern detection
   - Manual healing triggers
   - Common error recovery patterns

### 📋 Phase 2: Multi-Model Intelligence (3-4 weeks) - PLANNED
**Goal:** Optimal model selection and self-improvement

1. **Multi-Model Support**
   - ModelRouter (select best model per task)
   - Provider-specific prompt templates
   - Token usage tracking per provider
   - Cost optimization

2. **Learning Engine**
   - Pattern analysis from task history
   - A/B testing framework
   - Success prediction models
   - Automated insights

3. **Self-Tuning**
   - Prompt optimization based on results
   - Configuration auto-tuning
   - Model selection refinement
   - "Learn" task type for self-improvement

### 🔮 Phase 3: Full Autonomy (4-6 weeks) - FUTURE
**Goal:** Self-building, self-maintaining system

1. **Advanced Healing**
   - Automatic error recovery
   - Context-aware retry strategies
   - Self-diagnosis capabilities

2. **Predictive Optimization**
   - Task complexity prediction
   - Resource allocation optimization
   - Proactive issue detection

3. **Full Autonomy**
   - Self-generated improvement tasks
   - Automated dependency updates
   - Continuous self-optimization

---

## 🔒 What's NOT Automatic

### Development Process Integration (NOT Background Tasks)

**Linting** → Pre-commit git hooks + CI/CD  
**Testing** → CI/CD pipeline on every commit  
**Documentation** → Code review process  
**Deduplication** → Manual refactoring during development  
**Deep Cleanup** → Planned, manual work  

**Rationale:** These are part of the normal development workflow through git hooks, CI/CD pipelines, and code review. They should NOT be automated background tasks running on a schedule.

---

## 📊 Quality Metrics

### Task Quality Score
```typescript
interface TaskQualityScore {
  completion: number;        // 0-100: Acceptance criteria met
  codeQuality: number;       // 0-100: Linter pass, low complexity
  testCoverage: number;      // 0-100: Tests written and passing
  processCompliance: number; // 0-100: Followed workflow
  efficiency: number;        // 0-100: Time/tokens vs complexity
  overallScore: number;      // Weighted average
}
```

**Default Weights:**
- Completion: 40%
- Code Quality: 25%
- Test Coverage: 20%
- Process Compliance: 10%
- Efficiency: 5%

### Token Budget Management
- Track token usage per provider (not dollars)
- Calculate daily budgets from weekly/monthly limits
- Hard stop when daily budget reached
- Real-time dashboard monitoring

---

## 🎯 Success Criteria

### Phase 1 Complete When:
- ✅ Token usage tracked for all AI calls
- ✅ Daily budgets enforced per provider
- ✅ Tasks cannot complete without passing quality gates
- ✅ Every task has a quality score
- ✅ Batch approval system working
- ✅ Basic failure pattern detection
- ✅ Dashboard shows all metrics

### System Fully Autonomous When:
- ✅ Multi-model support operational
- ✅ Learning engine making intelligent decisions
- ✅ Self-tuning prompts and configs
- ✅ Predictive optimization working
- ✅ System successfully builds improvements for itself
- ✅ Cost per task consistently decreasing
- ✅ Quality scores consistently improving

---

## 🔗 Related Documentation

### Current Implementation
- `/app-monitor/docs/dev-monitor/ARCHITECTURE.md` - Original architecture (V1)
- `/app-monitor/docs/dev-bots/README.md` - Dev-bots documentation

### Planning Documents
- `/docs/plans/EVOLUTION_PLAN.md` - **Master evolution plan**
- `/docs/plans/app-monitor-updated-plan-summary.md` - Recovery/setup plan
- `/docs/plans/APP-MONITOR-QUICKSTART.md` - Quick start guide

### Implementation Details
- `/app-monitor/CLEANUP_SCHEDULER_REMOVAL.md` - Why no automatic cleanup
- `/app-monitor/SAFE_TEST_IMPLEMENTATION.md` - Safe test configuration
- `/app-monitor/TEST_CONFIG_AUDIT.md` - Test configuration audit

---

## 🚨 Important Notes

1. **No Automatic Cleanup Tasks** - Linting, testing, documentation are part of the development process, not scheduled background tasks

2. **Config-Driven Logs** - All log sources defined in `backend/config/log-sources.json`, easy to add/remove services

3. **Fixed Ports** - No dynamic port allocation, fail-fast on conflicts with clear error messages

4. **Quality Over Speed** - Tasks must pass all quality gates, no shortcuts

5. **Budget Conscious** - Token tracking across all providers, hard stops when limits reached

6. **Batch Approval** - Human oversight through batch approval system, system pauses for review

7. **Learning First** - Every task execution contributes to learning and optimization

---

**Version History:**
- **V1.0** (Oct 25, 2025): Original monitoring system
- **V2.0** (Oct 26, 2025): Autonomous development architecture
