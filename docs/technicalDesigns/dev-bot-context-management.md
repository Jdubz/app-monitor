# Dev-Bot Context Management Design

## Document Metadata

| Field | Value |
|-------|-------|
| **Author** | Codex Agent (per architecture owner direction) |
| **Date** | November 12, 2025 |
| **Status** | 🟢 Ready for Implementation |
| **Priority** | P2 |
| **Dependencies** | Staged Task Queue (P0), Dev-Bot Foundational Upgrades (P1) |
| **Last Updated** | November 13, 2025 |

## Quick Reference

**What**: Simplify task submission to 3 required fields (title, type, intent) while providing dev-bots with accurate, up-to-date context bundles (documentation, operations guides, PR workflows) dynamically generated from repo state and injected into containers at task launch.

**Why**:
- **Developer Experience**: Reduce task submission from 15+ fields to just 3 via intelligent auto-detection
- **Context Accuracy**: Eliminate stale context and manual sync work
- **Bot Effectiveness**: Improve dev-bot accuracy by ensuring agents always have current system knowledge
- **Prompt Simplification**: Auto-generate v3-compliant prompts from context bundles

**Key Features**:
- Ultra-minimal task submission (title, type, intent only) - **NO ALTERNATIVE MODES**
- Auto-detection of files, risk level, and context profiles
- Dynamic context bundle generation with caching
- Read-only context mounting in containers
- Chain-aware context inheritance for REVIEW/FIX tasks
- Size budget enforcement per task type
- **Complete migration**: Removes all legacy task creation codepaths

**Implementation Status**: Ready for Implementation (detailed 6-phase plan with migration + cleanup included)

## Table of Contents

1. [Vision](#vision)
2. [Requirements](#requirements)
3. [Task-Type Context Bill of Materials](#task-type-context-bill-of-materials)
4. [Context-Aware Task Submission & Prompt Simplification](#context-aware-task-submission--prompt-simplification)
5. [Context-Aware Execution Flow Integration](#context-aware-execution-flow-integration)
6. [Context Domains](#context-domains)
7. [Alignment with Existing Plans](#alignment-with-existing-plans)
8. [Architecture](#architecture)
9. [Task Flow](#task-flow)
10. [Follow-Up & Chain Context](#follow-up--chain-context)
11. [Automation Opportunities](#automation-opportunities)
12. [Open Questions](#open-questions)
13. [Success Criteria](#success-criteria)
14. [Testing Strategy](#testing-strategy)
15. [Related Files](#related-files)
16. [Implementation Plan](#implementation-plan)
    - [Phase 1: Context Infrastructure](#phase-1-context-infrastructure-2-3-weeks)
    - [Phase 2: Task Submission Simplification](#phase-2-task-submission-simplification-2-weeks)
    - [Phase 3: Execution Integration](#phase-3-execution-integration-2-3-weeks)
    - [Phase 4: Chain Context Integration](#phase-4-chain-context-integration-1-2-weeks)
    - [Phase 5: UI & CLI Updates](#phase-5-ui--cli-updates-3-5-days)
    - [Phase 6: Optimization & Hardening](#phase-6-optimization--hardening-1-2-weeks)
    - [Phase 7: Migration & Legacy Cleanup](#phase-7-migration--legacy-cleanup-1-week)
    - [Rollout Strategy](#rollout-strategy)
    - [Success Metrics](#success-metrics)
    - [Risk Mitigation](#risk-mitigation)
    - [Testing Strategy](#testing-strategy)
    - [Rollback Procedures](#rollback-procedures)
    - [Dependencies & Blockers](#dependencies--blockers)
17. [Version History](#version-history)

## Vision
Provide every dev-bot task with accurate, up-to-date context (documentation, operational guides, deployment details, PR workflows, failure recovery, self-healing patterns, learning data, dev-monitor UI behavior, etc.) inside the container at task launch—without relying on stale, manually curated snippets.

## Requirements
1. **Per-Container Context Bundles:** On task launch, copy a curated context bundle into the dev-bot container so the agent can reference system knowledge locally.
2. **Programmatic Generation (Preferred):** Whenever possible, generate context on demand from the current repo state (e.g., render markdown summaries, extract code snippets, compile API references). This keeps context evergreen and avoids manual sync work.
3. **Fallback Capture:** When dynamic generation isn’t feasible, capture context snapshots (markdown/JSON) that update automatically when source files change.
4. **Task-Type Awareness:** Context bundles must reflect task intent (documentation, deployment, PR tracker, failure recovery, dev-monitor frontend, etc.). Work-target awareness is a future requirement but not needed for v1.
5. **Chain Integration:** REVIEW/FIX tasks should inherit or augment context with outputs from previous attempts (diffs, verification results, review notes) to avoid repeating work.
6. **Schema Alignment:** Implement the storage plan from `DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md`/`PRIORITIZED_FEATURE_ROADMAP.md` by adding a `task_context` JSON column plus supporting tables (`task_artifacts`, `task_logs`, `task_network_events`, `task_automation_runs`) so context bundles and artifacts can be persisted and audited.
7. **API Support:** Extend task creation/update APIs to accept optional context payloads, matching the task-context submission schema defined in `APP_MONITOR_STABILIZATION_PLAN.md` (environment snapshots, logs, network events, artifact references).
8. **Context-Aware Prompt Simplification:** Once bundles are available, the task submission APIs must also accept a minimal payload (task type, intent summary, target files, risk level, desired outputs) and auto-expand it to the full v3 prompt (investigation, constraints, checklists) by referencing the mounted context instead of forcing humans to author exhaustive templates.
9. **Task-Type Coverage Matrix:** Define and enforce which context modules are mandatory, optional, or forbidden per task type (implementation, review, fix, PR follow-up, analysis) so dev-bots always receive the right information without flooding the prompt/token budget.

## Task-Type Context Bill of Materials
| Task Type | Always Include | Conditional Attachments | Prompt Guidance & Size Guardrail |
|-----------|----------------|-------------------------|----------------------------------|
| **Implementation** | Architecture summary, file tree snippets, active acceptance criteria, relevant runbooks/tests | Linked PR/work-target data, existing component screenshots | Reference `/context/implementation/*.md`. Cap combined snippets at 12KB and point the agent to richer docs instead of pasting them inline. |
| **Review** | Previous attempt summary, diff metadata, verification log digest, acceptance criteria | Autogenerated blame map, Copilot comments, reviewer checklist | Provide checklist links + `/context/review/<taskId>.json`. Hard limit 8KB inline plus file references. |
| **Fix** | Failure classification, reproduction steps, captured logs, environment snapshot | Salvaged patches, token-friendly stack traces, prior fix attempts | Store bulky logs under `/context/fix/logs/` and reference them via prompt bullets to avoid copying >2KB. |
| **PR Follow-Up** | PR metadata (branch, status, gate states), Copilot delegation state, open follow-up tasks | Merge blockers, reviewer assignments, release windows | Keep inline summary under 6KB; rely on `/context/pr-workflow.json` for gate explanations. |
| **Analysis / Planning** | Metrics, historic incident timeline, linked docs list, task queue stats | Experiment results, A/B dashboards, model outputs | Encourage table-format context under `/context/analysis/*.json`; inline prompt should stay under 5KB and primarily link out. |

The matrix ensures every agent receives the minimum viable information regardless of task type while guarding against runaway prompts. Each bundle entry lists: (a) what to mount, (b) whether it must be mentioned inline, and (c) its retention/TTL so chain tasks can rely on persisted context.

## Context-Aware Task Submission & Prompt Simplification

### Current Pain (v3 Templates)
`docs/plans/BOT_PROMPT_ENGINEERING_V3.md` and `dev-bots/docs/analysis/quick-reference.md` require authors to supply 15+ prompt sections (investigation, constraints, doNotCreate, etc.). This keeps bots safe but makes routine task submission slow and error-prone, especially when most of that information already exists in docs or prior attempts.

### Minimal Task Submission Schema (ONLY Schema)
This replaces ALL existing task creation schemas. There is no alternative mode.

**Required Fields (3 only):**
```jsonc
{
  "title": "Add auto-scroll toggle to EnhancedLogsViewer",
  "taskType": "implementation",  // implementation | review | fix | pr-follow-up | analysis
  "intent": "Expose play/pause control for log auto-scroll."
}
```

**Optional Overrides (auto-detected if omitted):**
```jsonc
{
  "title": "Add auto-scroll toggle to EnhancedLogsViewer",
  "taskType": "implementation",
  "intent": "Expose play/pause control for log auto-scroll.",

  // Only provide these to override auto-detection
  "targetFiles": ["frontend/src/components/EnhancedLogsViewer.tsx"],
  "riskLevel": "low",
  "contextProfiles": ["frontend-ui", "logs-ui"],
  "outputs": ["unit-tests", "storybook"],
  "followUpOf": null  // Chain tracking - set by system for REVIEW/FIX tasks
}
```

**Auto-Detection Logic:**
- `targetFiles`: Detect from git diff (modified/staged files) or prompt user with file picker
- `riskLevel`: Infer from file paths (docker/*→high, backend/services/*→medium, frontend/*→low, docs/*→minimal)
- `contextProfiles`: Map from targetFiles (frontend/*→["frontend-ui"], backend/services/pr*→["pr-workflow"], etc.)
- `outputs`: Use taskType defaults (implementation→["tests","docs"], review→["review-report"], fix→["patch","verification"])

**Processing Pipeline:**
`TaskCreationService` (1) runs auto-detection for omitted fields, (2) maps `contextProfiles` to the Bill of Materials, (3) auto-generates investigation steps and checklists from mounted context files, and (4) injects default constraints ("MUST read `/context/frontend-ui.md` before touching JSX") to produce v3-compliant prompts without manual authoring.

### Prompt Assembly Pipeline
1. **Submission Intake:** Minimal payloads (3 required fields + optional overrides) land in the task creation endpoint. All submissions reference `task_type` and auto-detected/provided `contextProfiles`.
2. **Context Selection:** Resolve context modules from the bill of materials; reject task if required modules are missing or if context would exceed the size budget.
3. **Auto-Generated Sections:** Use `taskPromptTemplates.ts` to merge canonical text (investigation steps, constraints, checklists) with file paths extracted from the context bundle metadata. All sections are system-generated.
4. **Inline Prompt Slimming:** Insert short bullets plus absolute references (`See /workspace/context/dev-monitor/overview.md`). Enforce inline payload limits per section (implementation≤12KB, review≤8KB, fix≤10KB, PR follow-up≤6KB, analysis≤5KB).
5. **Chain Awareness:** REVIEW/FIX tasks automatically pull the latest `task_context` row for the chain and embed a short delta summary while linking to the full JSON artifact.

### Guardrails & Budget Control
- **Context Quotas:** Enforce per-task-type byte ceilings before the prompt is assembled; reject task submission if context selection exceeds the quota.
- **Auto-Generation Only:** All prompt sections are auto-generated from context bundles. No manual v3 template authoring.
- **API Contracts:** Remove legacy v3 validators. New validator accepts only the minimal schema.

### UI & CLI Updates
- **Task Creation Form:** Simplified form with only 3 required fields (title, type, intent). Displays auto-detected values. Optional overrides available if auto-detection fails.
- **CLI (`submit-and-monitor-tasks.js`):** Updated to accept minimal schema. Scripted submissions no longer need JSON templates.
- **Automated Tasks:** Review tasks triggered by automation (PR gates, hung-task recovery) use context-aware generation automatically.

## Context-Aware Execution Flow Integration

### Overview
This section details how context management integrates into the existing dev-bot execution pipeline, from task submission through completion and chain follow-ups.

### Execution Flow Diagram
```
Task Submission (Simplified Schema)
         ↓
[TaskCreationService] Auto-Detection & Normalization
         ↓
Context Profile Selection (from Bill of Materials)
         ↓
[ContextBuilder] Generate/Cache Context Bundles
         ↓
SQLite: Persist task + context metadata
         ↓
[TaskQueueWorker] Picks task from queue
         ↓
[TaskExecutionService] Provision Container
         ↓
Mount Context Bundles (read-only /workspace/context/*)
         ↓
Assemble Final Prompt (inline refs + context pointers)
         ↓
Execute Agent (with context-aware instructions)
         ↓
Capture Results + Context Metadata
         ↓
[TaskCompletionService] Verify + Register Artifacts
         ↓
Persist execution context for chain follow-ups
         ↓
REVIEW/FIX tasks inherit context + execution history
```

### Step-by-Step Integration

#### 1. Task Submission & Normalization
**Location:** `backend/src/services/taskCreation.service.ts`

```typescript
// Accept ONLY minimal payloads (3 required + optional overrides)
async createTask(payload: MinimalTaskPayload) {
  // Step 1: Auto-detect missing fields
  const normalized = await this.normalizePayload(payload);
  // - targetFiles: git diff | file picker
  // - riskLevel: infer from paths
  // - contextProfiles: map from targetFiles + taskType
  // - outputs: defaults per taskType

  // Step 2: Validate required context modules available
  const requiredModules = this.getRequiredModules(normalized.taskType);
  await this.validateContextAvailability(requiredModules);

  // Step 3: Select context profiles from Bill of Materials
  const contextConfig = this.selectContextProfiles(normalized);

  // Step 4: Create task record with context metadata
  const task = await taskQueueService.createTask({
    ...normalized,
    context_profiles: contextConfig.profiles,
    context_budget: contextConfig.sizeLimit,
    prompt_sections_auto_generated: true
  });

  return task;
}
```

#### 2. Context Bundle Generation
**Location:** `backend/src/services/contextBuilder.ts` (new)

```typescript
async generateContextBundle(task: Task): Promise<ContextBundle> {
  const cacheKey = this.getCacheKey(task.context_profiles, await this.getGitCommitHash());

  // Check cache first
  const cached = await this.contextCache.get(cacheKey);
  if (cached) return cached;

  // Generate fresh bundle
  const bundle = {
    profiles: {},
    metadata: {
      generatedAt: new Date(),
      commitHash: await this.getGitCommitHash(),
      taskType: task.type,
      sizeBytes: 0
    }
  };

  for (const profile of task.context_profiles) {
    const recipe = await this.loadRecipe(profile);
    const content = await this.buildContent(recipe);

    // Enforce size limits from Bill of Materials
    if (bundle.metadata.sizeBytes + content.size > task.context_budget) {
      throw new ContextBudgetExceededError(profile);
    }

    bundle.profiles[profile] = content;
    bundle.metadata.sizeBytes += content.size;
  }

  // Cache and persist
  await this.contextCache.set(cacheKey, bundle);
  await this.persistBundleMetadata(task.id, bundle);

  return bundle;
}
```

#### 3. Container Provisioning with Context
**Location:** `backend/src/services/taskExecution.service.ts`

```typescript
async executeTask(task: Task) {
  // Generate context bundle
  const contextBundle = await this.contextBuilder.generateContextBundle(task);

  // Prepare container volumes with context mount
  const volumes = {
    '/workspace': {
      bind: task.workspaceDir,
      mode: 'rw'
    },
    '/workspace/context': {
      bind: contextBundle.mountPath,  // Read-only context directory
      mode: 'ro'  // CRITICAL: Read-only to prevent contamination
    }
  };

  // Create container with context
  const container = await this.dockerManager.createContainer({
    image: this.selectAgentImage(task),
    volumes,
    env: {
      TASK_ID: task.id,
      TASK_TYPE: task.type,
      CONTEXT_PROFILES: JSON.stringify(task.context_profiles)
    }
  });

  // ... rest of execution
}
```

#### 4. Prompt Assembly with Context References
**Location:** `backend/src/services/taskPromptTemplates.ts` (enhanced)

```typescript
async assemblePrompt(task: Task, contextBundle: ContextBundle): Promise<string> {
  const sections = [];

  // Auto-generate investigation steps from context
  sections.push(this.generateInvestigationSteps(task, contextBundle));

  // Inline constraints with context pointers (not full content)
  sections.push(`
## Constraints
- MUST read relevant context files before making changes:
  ${contextBundle.profiles.map(p => `  - /workspace/context/${p}.md`).join('\n')}
- MUST stay within scope defined in /workspace/context/scope-control.md
- MUST follow PR workflow from /workspace/context/pr-workflow.md
`);

  // Auto-generate checklists from context headings
  sections.push(this.generateChecklistFromContext(task.type, contextBundle));

  // Add chain context for REVIEW/FIX tasks
  if (task.followUpOf) {
    const chainContext = await this.getChainContext(task.followUpOf);
    sections.push(`
## Previous Attempts
${chainContext.summary}
Full history: /workspace/context/chain/${task.followUpOf}/history.json
`);
  }

  return sections.join('\n\n');
}

private generateInvestigationSteps(task: Task, bundle: ContextBundle): string {
  const steps = [];

  // Extract steps from context bundle metadata
  for (const [profile, content] of Object.entries(bundle.profiles)) {
    if (content.investigationSteps) {
      steps.push(...content.investigationSteps);
    }
  }

  return `
## Investigation Steps
${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}
`;
}
```

#### 5. Execution with Context-Aware Instructions
**Agent receives:**
- Assembled prompt with context file references (not full content inlined)
- Read-only `/workspace/context/` directory containing:
  - Domain-specific guides (pr-workflow.md, scope-control.md, etc.)
  - Task-type specific checklists and templates
  - Chain history (for REVIEW/FIX tasks)
  - Auto-generated investigation steps

**Agent instructions include:**
```
You have access to system context files in /workspace/context/:
- Read these files BEFORE making changes
- Follow the workflows and constraints described
- Reference chain history if this is a follow-up task

Context files available:
${contextBundle.profiles.map(p => `- /workspace/context/${p}.md: ${p.description}`).join('\n')}
```

#### 6. Result Capture & Context Persistence
**Location:** `backend/src/services/taskCompletion.service.ts`

```typescript
async completeTask(taskId: string, result: TaskResult) {
  // Capture which context was used
  const contextUsage = {
    profiles: result.contextProfilesAccessed,
    filesRead: result.contextFilesRead,
    effectivenessScore: result.contextEffectiveness  // Agent self-report
  };

  // Store for chain follow-ups and analytics
  await this.persistExecutionContext(taskId, {
    contextUsage,
    artifacts: result.artifacts,
    verificationResults: result.verification,
    patchDiffs: result.patchDiffs
  });

  // If this spawns a REVIEW task, prepare chain context
  if (result.needsReview || result.failed) {
    await this.prepareChainContext(taskId, result);
  }

  // Update task record
  await taskQueueService.completeTask(taskId, {
    ...result,
    context_metadata: contextUsage
  });
}

private async prepareChainContext(parentTaskId: string, result: TaskResult) {
  const chainContext = {
    parentTask: parentTaskId,
    attempts: [result],
    summary: this.generateAttemptSummary(result),
    artifacts: result.artifacts,
    verificationLog: result.verification,
    contextUsed: result.contextProfilesAccessed
  };

  // Store in location accessible to next task
  await this.storeChainContext(parentTaskId, chainContext);
}
```

#### 7. Chain Context Inheritance (REVIEW/FIX Tasks)
**When a REVIEW or FIX task is created:**

```typescript
async createReviewTask(originalTaskId: string) {
  const originalTask = await taskQueueService.getTask(originalTaskId);
  const chainContext = await this.getChainContext(originalTaskId);

  // Inherit context profiles + add review-specific ones
  const contextProfiles = [
    ...originalTask.context_profiles,
    'review-checklist',
    'fix-patterns'
  ];

  // Add chain history to context bundle
  const reviewTask = await this.createTask({
    title: `REVIEW: ${originalTask.title}`,
    taskType: 'review',
    intent: `Analyze previous attempt and determine next action`,
    contextProfiles,
    followUpOf: originalTaskId,
    chainContext: chainContext.id  // Links to persisted chain data
  });

  return reviewTask;
}
```

### Context Invalidation & Updates
**When source files change:**
```typescript
// Git hook or file watcher
async onSourceFileChange(filePath: string) {
  // Identify affected recipes
  const affectedRecipes = await this.findRecipesForFile(filePath);

  // Invalidate cached bundles
  for (const recipe of affectedRecipes) {
    await this.contextCache.invalidate(recipe.profile);
  }

  // Emit event for monitoring
  this.emit('context:invalidated', {
    file: filePath,
    affectedProfiles: affectedRecipes.map(r => r.profile)
  });
}
```

### Size Budget Enforcement
**Before task execution:**
```typescript
async validateContextBudget(task: Task, bundle: ContextBundle) {
  const limits = TASK_TYPE_BUDGETS[task.type];  // From Bill of Materials

  if (bundle.metadata.sizeBytes > limits.maxBytes) {
    throw new Error(`Context bundle (${bundle.metadata.sizeBytes} bytes) exceeds ${task.type} limit (${limits.maxBytes} bytes)`);
  }

  const inlineSize = this.estimateInlinePromptSize(task, bundle);
  if (inlineSize > limits.maxInlineBytes) {
    // Reduce inline references, keep more in files
    return this.optimizeForSizeLimit(bundle, limits);
  }
}
```

## Context Domains
| Domain | Source Examples | Notes |
|--------|-----------------|-------|
| Documentation & Architecture | `docs/architecture/*`, `docs/technicalDesigns/*` | Convert key sections to structured snippets (e.g., JSON or markdown segments).|
| Deployment & Operations | `docs/plans/APP_MONITOR_PRODUCTION_SUPPORT_PLAN.md`, scripts under `scripts/` | Include commands, environment variables, runbooks.|
| PR Tracking & Workflow | `docs/plans/PR_*`, `backend/src/services/pr*` | Summaries of condition gates, Copilot delegation rules, chain tracking.|
| Failure Recovery & Self-Healing | `docs/architecture/automatic-failure-recovery.md`, `failure-guards.md`, healing plans | Provide cleanup/follow-up rules, forbidden ops, chain depth limits.|
| Learning & Process Improvements | `docs/plans/DEV_BOT_PIPELINE_*`, `ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md` | Outline review/fix chain, REVIEW payload requirements.|
| Dev-Monitor Frontend | `docs/architecture/dev-monitor-architecture.md`, `frontend/src` docs | Describe UI expectations, Socket.IO events, admin workflows.|
| Deployment Targets & Work Targets | `docs/plans/DEV_BOT_WORK_TARGET_PRODUCTION_PLAN.md` | Future versions must tailor context per work-target.|

## Alignment with Existing Plans
- **DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md:** Defines persistence requirements (`task_context`, `task_artifacts`, `task_automation_runs`) and artifact summaries—this design adopts those schema changes and extends them to dynamic generation.
- **PRIORITIZED_FEATURE_ROADMAP.md:** Calls for task-context capture APIs, validation, and dashboard display; the context builder + SQLite persistence fulfills those acceptance criteria.
- **APP_MONITOR_STABILIZATION_PLAN.md:** Introduces task-context submission schemas (environment snapshot, logs, artifacts); API support and recipes must honor that schema.
- **ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md:** Needs REVIEW chain history; chain-context persistence ensures each follow-up task sees prior attempts.
- **DEV_BOT_WORK_TARGET_PRODUCTION_PLAN.md:** Specifies work-target metadata; v2 of this system will plug context recipes into those abstractions to scope content per target.

## Architecture
1. **Context Recipes:** YAML/JSON definitions describing how to compile context for each domain (source paths, transforms, filters).
2. **Context Builder CLI:** Node/TS script (`scripts/build-context.ts`) that reads recipes, pulls content from the repo, transforms it (e.g., markdown → plain text, code snippets, structured JSON), and outputs bundles (e.g., `artifacts/context/<taskType>.json`).
3. **Container Injection:** `TaskExecutionService` copies the relevant context bundle(s) into the container (e.g., `/workspace/context/<domain>.json`) before running the agent.
4. **Dynamic Regeneration:** Context builder runs automatically when tasks start or via preflight step so bundles represent the latest code/documentation.
5. **Snapshot Cache (optional):** If generation is expensive, cache results keyed by git commit hash and invalidate when source files change.
6. **SQLite Persistence:** When bundles are generated, persist metadata into `task_context`, `task_artifacts`, and `task_network_events` so the REVIEW chain and dev-monitor can retrieve historical context.

## Task Flow
1. Task submitted (Standard or Context-Aware mode) → `TaskCreationService` normalizes payload, selects `contextProfiles`, and auto-fills v3 sections when needed.
2. Determine `task_type`, severity, and chain metadata, then validate that all required context modules from the bill of materials are available.
3. Load recipe(s) matching `task_type`, task kind, and generic domains; skip optional recipes if they would exceed the per-type budget.
4. Build context bundle(s) programmatically and cache/track them by git commit hash + recipe fingerprint.
5. Copy context into the container (read-only volume) and embed short references inside the assembled prompt (e.g., “Relevant context files: `/workspace/context/pr-workflow.md`).
6. Persist context metadata and artifact paths into SQLite per the schema additions so follow-up tasks and UI surfaces can pull the same context set, including which prompt sections were auto-generated.

## Follow-Up & Chain Context
- Store outputs from each REVIEW/FIX/COMPLETE attempt (diff summaries, verification results, review notes) as part of the chain context.
- When a new follow-up task starts, merge static context (docs, code references) with dynamic chain context (attempt history).
- Provide APIs for dev-monitor to display chain context for debugging.

## Automation Opportunities
- Integrate with existing plans (e.g., `DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md`, `APP_MONITOR_STABILIZATION_PLAN.md`) by referencing their sections inside recipes.
- Use markdown parsing + heading anchors to extract only the relevant sections for each domain, reducing noise.
- Optionally run code analyzers (e.g., `tsdoc`/`typedoc`) to generate API summaries for inclusion in context bundles.
- Reuse the artifact registration + cleanup pipeline from the completion plan so every generated context file is tracked (size, hash, retention).
- Emit analytics events (bundle generated, consumed, invalidated) to populate the metrics envisioned in `PRIORITIZED_FEATURE_ROADMAP.md`.

## Open Questions
1. How granular should recipes be (per task type vs per domain)?
2. What retention policy should govern persisted bundles (reuse artifact cleanup job vs context-specific TTL)?
3. How to handle context size limits (agent token budgets) while ensuring necessary depth?
4. How will work-target awareness integrate in v2 (different repos, envs)?
5. Should dev-monitor expose raw stored context via the task detail view or only summarized snippets?

## Success Criteria

### Phase 1: Foundation (MVP)
- ✅ Context builder CLI implemented and runnable
- ✅ At least 3 domain recipes defined (deployment, PR workflow, failure recovery)
- ✅ Context bundles generated and cached per git commit hash
- ✅ TaskExecutionService mounts context bundles into containers
- ✅ SQLite schema updated with `task_context` and `task_artifacts` tables

### Phase 2: Integration
- ✅ REVIEW tasks inherit context from previous attempts
- ✅ Dev-monitor displays context sources per task
- ✅ API endpoints accept context payloads per APP_MONITOR_STABILIZATION_PLAN schema
- ✅ Context invalidation works correctly when source files change

### Phase 3: Optimization
- ✅ Context bundle size stays under 100KB per domain
- ✅ Generation time < 5 seconds for full rebuild
- ✅ Cache hit rate > 80% for repeated task types
- ✅ Work-target awareness implemented for multi-repo support

### Acceptance Criteria
1. Dev-bots can reference context files at `/workspace/context/<domain>.json`
2. Context accuracy measured: 0 stale reference reports in first month
3. Manual context sync work eliminated (measured by git commits to docs)
4. Agent prompt effectiveness improves (measured by task success rate)

## Testing Strategy

### Unit Tests
- Context builder CLI
  - Recipe parsing and validation
  - Content extraction from markdown/code
  - Transform functions (markdown → JSON, code snippet extraction)
  - Cache invalidation logic

- Context Bundle Validation
  - Schema validation for generated bundles
  - Size limit enforcement
  - Required field presence checks

### Integration Tests
- End-to-end context flow
  - Task creation → context generation → container mount
  - Context persistence to SQLite
  - Context retrieval in REVIEW chains

- Cache Behavior
  - Cache hit/miss scenarios
  - Git commit hash-based invalidation
  - Concurrent access handling

### System Tests
- Performance benchmarks
  - Generation time for all domains
  - Bundle size measurements
  - Cache performance metrics

- Dev-monitor integration
  - Context display in task detail view
  - Chain context visualization
  - Context source debugging tools

### Test Coverage Targets
- Context builder: 90%+ coverage
- TaskExecutionService context injection: 85%+ coverage
- API context acceptance: 80%+ coverage

## Related Files

### Implementation Files
- `scripts/build-context.ts` - Context builder CLI (to be created)
- `backend/src/services/taskExecution.service.ts` - Container context injection
- `backend/src/services/contextBuilder.ts` - Core context generation logic (to be created)
- `backend/src/services/database.ts` - SQLite schema for task_context

### Configuration Files
- `config/context-recipes/*.yaml` - Domain recipe definitions (to be created)
- `backend/tsconfig.json` - TypeScript configuration

### Test Files
- `backend/src/services/__tests__/contextBuilder.test.ts` (to be created)
- `backend/src/services/__tests__/taskExecution.context.test.ts` (to be created)

### Documentation Dependencies
- `docs/plans/DEV_BOT_PIPELINE_COMPLETION_PLAN_REVISED.md` - Storage schema requirements
- `docs/plans/PRIORITIZED_FEATURE_ROADMAP.md` - API requirements
- `docs/plans/APP_MONITOR_STABILIZATION_PLAN.md` - Context submission schema
- `docs/plans/ERROR_DETECTION_AND_RECOVERY_ENHANCEMENT.md` - REVIEW chain requirements
- `docs/plans/DEV_BOT_WORK_TARGET_PRODUCTION_PLAN.md` - Work-target requirements
- `docs/architecture/dev-bots-overview.md` - Agent architecture overview

### Related Designs
- `docs/technicalDesigns/dev-bot-foundational-upgrades.md` - Storage infrastructure
- `docs/technicalDesigns/error-detection-and-recovery-design.md` - REVIEW chain integration
- `docs/technicalDesigns/staged-task-queue.md` - Task metadata requirements

## Implementation Plan

### Overview
This implementation plan **completely replaces** the existing v3 task creation system. There is NO fallback to "Standard mode" - the minimal 3-field schema becomes the ONLY way to create tasks. The plan follows a phased approach, building the context-aware infrastructure first, then cutting over entirely and deleting all legacy code.

**Key Principle:** This is a **full migration**, not a feature toggle. All v3 codepaths will be deleted by Week 12.

### Prerequisites
- **P0: Staged Task Queue** - SQLite task queue with transaction support (COMPLETED)
- **P1: Dev-Bot Foundational Upgrades** - Storage schema for task_context, task_artifacts (PARTIALLY COMPLETE)
- **Dependencies:**
  - Docker volume management (existing)
  - Task execution service (existing)
  - TaskQueueService singleton (existing)
  - Git integration (existing)

---

### Phase 1: Context Infrastructure (2-3 weeks)
**Goal:** Build core context generation and caching infrastructure without affecting existing task execution.

#### Milestones

##### M1.1: Context Recipe System (Week 1)
**Deliverables:**
- [ ] Recipe schema definition (`config/context-recipes/schema.json`)
- [ ] Recipe validator
- [ ] Initial recipes for 5 critical domains:
  - `deployment.yaml` - Deployment guides, scripts, env vars
  - `pr-workflow.yaml` - PR tracking, gates, Copilot delegation
  - `failure-recovery.yaml` - Recovery patterns, cleanup rules
  - `dev-monitor.yaml` - UI behavior, Socket.IO events
  - `scope-control.yaml` - Boundaries, forbidden operations

**Files:**
```
config/
  context-recipes/
    schema.json
    deployment.yaml
    pr-workflow.yaml
    failure-recovery.yaml
    dev-monitor.yaml
    scope-control.yaml
    README.md
```

**Acceptance Criteria:**
- [ ] Recipe validator catches invalid YAML/schema violations
- [ ] Each recipe includes: sources, transforms, size limits, description
- [ ] Documentation explains recipe structure and authoring

##### M1.2: Context Builder Service (Week 1-2)
**Deliverables:**
- [ ] `ContextBuilder` service (`backend/src/services/contextBuilder.ts`)
- [ ] Recipe loader and parser
- [ ] Content extraction from markdown/code
- [ ] Transform functions (markdown→JSON, code snippets, heading extraction)
- [ ] Git commit hash detection for cache keys
- [ ] Unit tests (90%+ coverage)

**Files:**
```
backend/src/services/
  contextBuilder.ts
  contextRecipeLoader.ts
  contextTransforms.ts
  __tests__/
    contextBuilder.test.ts
    contextRecipeLoader.test.ts
```

**Acceptance Criteria:**
- [ ] Can load and parse all 5 recipes
- [ ] Generates valid JSON/markdown output
- [ ] Extracts content from source files correctly
- [ ] Handles missing source files gracefully
- [ ] Unit tests cover happy path + error cases

##### M1.3: Context Caching & Persistence (Week 2)
**Deliverables:**
- [ ] In-memory cache with LRU eviction
- [ ] Git commit hash-based cache keys
- [ ] File watcher for cache invalidation
- [ ] SQLite schema additions for context metadata
- [ ] Persistence of bundle metadata

**Schema Additions:**
```sql
-- Add to existing task_context table
ALTER TABLE task_context ADD COLUMN bundle_metadata JSON;
ALTER TABLE task_context ADD COLUMN cache_key TEXT;
ALTER TABLE task_context ADD COLUMN git_commit_hash TEXT;

-- New table for tracking context bundle files
CREATE TABLE context_bundles (
  id TEXT PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  git_commit_hash TEXT NOT NULL,
  profiles JSON NOT NULL,
  size_bytes INTEGER NOT NULL,
  generated_at DATETIME NOT NULL,
  last_accessed DATETIME,
  access_count INTEGER DEFAULT 0,
  mount_path TEXT NOT NULL
);
```

**Acceptance Criteria:**
- [ ] Cache hit rate >80% for repeated requests with same commit hash
- [ ] Cache invalidates correctly when source files change
- [ ] Bundle metadata persisted to SQLite
- [ ] LRU eviction works when cache size limit reached

##### M1.4: Context Builder CLI (Week 2-3)
**Deliverables:**
- [ ] CLI tool (`scripts/build-context.ts`)
- [ ] Commands: `build`, `validate`, `invalidate`, `stats`
- [ ] Integration with npm scripts

**CLI Commands:**
```bash
# Generate all context bundles
npm run context:build

# Validate recipes
npm run context:validate

# Invalidate cache for specific profile
npm run context:invalidate -- --profile deployment

# Show cache statistics
npm run context:stats
```

**Acceptance Criteria:**
- [ ] Can generate bundles for all profiles
- [ ] Validates recipes before building
- [ ] Reports generation time and bundle sizes
- [ ] Returns proper exit codes for CI/CD

---

### Phase 2: Task Submission Simplification (2 weeks)
**Goal:** Enable simplified task submission with auto-detection and context-aware prompt generation.

#### Milestones

##### M2.1: Auto-Detection Logic (Week 3)
**Deliverables:**
- [ ] `TaskNormalizer` service (`backend/src/services/taskNormalizer.ts`)
- [ ] Auto-detect target files from git diff
- [ ] Auto-infer risk level from file paths
- [ ] Auto-select context profiles from target files + task type
- [ ] Auto-populate default outputs per task type

**Auto-Detection Rules:**
```typescript
// Risk level inference
const RISK_RULES = {
  'docker/**': 'high',
  'backend/src/services/**': 'medium',
  'frontend/src/**': 'low',
  'docs/**': 'minimal'
};

// Context profile mapping
const PROFILE_RULES = {
  'frontend/src/**': ['frontend-ui', 'dev-monitor'],
  'backend/src/services/pr*': ['pr-workflow'],
  'backend/src/services/docker*': ['deployment'],
  'scripts/**': ['deployment']
};

// Default outputs per task type
const OUTPUT_DEFAULTS = {
  implementation: ['unit-tests', 'integration-tests'],
  review: ['review-report', 'action-recommendation'],
  fix: ['patch', 'verification-log'],
  'pr-follow-up': ['merge-status', 'gate-evaluation']
};
```

**Acceptance Criteria:**
- [ ] Auto-detection works for common scenarios (staged files, modified files)
- [ ] Fallback to user prompt when git diff is empty
- [ ] Risk inference matches 90%+ of manual classifications
- [ ] Context profile selection includes all required modules

##### M2.2: New Task Creation API (Week 3-4)
**Deliverables:**
- [ ] New `TaskCreationService` accepting ONLY minimal schema
- [ ] Schema validator for `MinimalTaskPayload`
- [ ] Normalization pipeline (minimal → fully expanded internal format)
- [ ] API endpoint replacement (`POST /api/tasks`)

**API Support:**
```typescript
// POST /api/tasks accepts ONLY:
interface MinimalTaskPayload {
  title: string;
  taskType: TaskType;  // Required
  intent: string;      // Required

  // Optional overrides (auto-detected if omitted)
  targetFiles?: string[];
  riskLevel?: 'minimal' | 'low' | 'medium' | 'high';
  contextProfiles?: string[];
  outputs?: string[];
  followUpOf?: string;  // Chain tracking
}
```

**Acceptance Criteria:**
- [ ] Minimal payload accepted and normalized correctly
- [ ] Auto-detection runs for all omitted optional fields
- [ ] **Old v3 API endpoints throw deprecation errors**
- [ ] Validation errors are clear and actionable

##### M2.3: Prompt Assembly Enhancement (Week 4)
**Deliverables:**
- [ ] Enhanced `taskPromptTemplates.ts` with auto-generation
- [ ] Investigation steps generator from context
- [ ] Checklist generator from context
- [ ] Constraint injector with context file references
- [ ] Section provenance tracking (auto vs manual)

**Acceptance Criteria:**
- [ ] Auto-generated prompts are v3-compliant
- [ ] Investigation steps extracted from context bundle metadata
- [ ] Checklists include relevant items for task type
- [ ] Constraints reference context files (not inline full content)
- [ ] Provenance tags distinguish auto vs manual sections

---

### Phase 3: Execution Integration (2-3 weeks)
**Goal:** Integrate context bundles into task execution pipeline with container mounting.

#### Milestones

##### M3.1: Container Context Mounting (Week 5)
**Deliverables:**
- [ ] Update `TaskExecutionService` to generate context bundles
- [ ] Mount context as read-only volume in containers
- [ ] Environment variables for context metadata
- [ ] Container startup validation (context files accessible)

**Container Configuration:**
```typescript
volumes: {
  '/workspace': { bind: taskWorkspace, mode: 'rw' },
  '/workspace/context': { bind: bundleMountPath, mode: 'ro' }
},
env: {
  TASK_ID: task.id,
  TASK_TYPE: task.type,
  CONTEXT_PROFILES: JSON.stringify(task.context_profiles),
  CONTEXT_MOUNT: '/workspace/context'
}
```

**Acceptance Criteria:**
- [ ] Context bundles generated before container start
- [ ] Bundles mounted correctly at `/workspace/context/`
- [ ] Files are read-only (agents cannot modify)
- [ ] Container fails fast if required context missing

##### M3.2: Prompt Assembly with Context References (Week 5-6)
**Deliverables:**
- [ ] Assemble prompts with context file references
- [ ] Inline size limit enforcement
- [ ] Context pointer formatting (relative paths)
- [ ] Agent instruction templates for context usage

**Prompt Format:**
```
## Investigation Steps
1. Read /workspace/context/pr-workflow.md for PR creation process
2. Check /workspace/context/scope-control.md for boundaries
...

## Constraints
- MUST read relevant context files before making changes:
  - /workspace/context/pr-workflow.md
  - /workspace/context/dev-monitor.md
- MUST NOT exceed scope defined in /workspace/context/scope-control.md
...

## Context Files Available
- pr-workflow.md: PR tracking, gates, Copilot delegation (8.2 KB)
- dev-monitor.md: UI behavior, Socket.IO events (6.4 KB)
- scope-control.md: Boundaries, forbidden operations (3.1 KB)
```

**Acceptance Criteria:**
- [ ] Inline prompt stays under task-type limits
- [ ] Context references use correct paths
- [ ] Agent instructions explain how to use context
- [ ] Missing context files cause validation errors

##### M3.3: Result Capture & Context Metadata (Week 6)
**Deliverables:**
- [ ] Capture context usage metrics in task results
- [ ] Persist context metadata to SQLite
- [ ] Track which context files were accessed
- [ ] Agent self-reporting of context effectiveness

**Context Usage Metrics:**
```typescript
interface ContextUsageMetrics {
  profilesProvided: string[];
  filesAccessed: string[];  // Agent reports which files it read
  effectivenessScore: number;  // 1-5 self-rating
  issuesEncountered: string[];  // Missing info, stale content, etc.
}
```

**Acceptance Criteria:**
- [ ] Context metadata captured for every task
- [ ] Metrics persisted to task_context table
- [ ] Usage stats available via API
- [ ] Analytics dashboard shows context effectiveness

---

### Phase 4: Chain Context Integration (1-2 weeks)
**Goal:** Enable REVIEW/FIX tasks to inherit context from previous attempts.

#### Milestones

##### M4.1: Chain Context Persistence (Week 7)
**Deliverables:**
- [ ] Chain context storage in SQLite
- [ ] Attempt history aggregation
- [ ] Summary generation for follow-up tasks
- [ ] Artifact linking (patches, diffs, logs)

**Chain Context Schema:**
```sql
CREATE TABLE chain_context (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL,
  parent_task_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  full_context JSON NOT NULL,
  artifacts JSON,  -- Links to patches, diffs, logs
  created_at DATETIME NOT NULL,
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
);
```

**Acceptance Criteria:**
- [ ] Chain context stored for failed/completed tasks
- [ ] Summaries are concise (<500 words)
- [ ] Artifact references are valid and accessible
- [ ] Queries for chain history are fast (<100ms)

##### M4.2: REVIEW/FIX Context Inheritance (Week 7-8)
**Deliverables:**
- [ ] Auto-creation of REVIEW tasks with inherited context
- [ ] Context profile augmentation (add review-specific modules)
- [ ] Chain history mounting in containers
- [ ] Prompt enhancement with previous attempt summaries

**Review Task Context:**
```typescript
// Original task had: ['frontend-ui', 'dev-monitor']
// Review task gets: ['frontend-ui', 'dev-monitor', 'review-checklist', 'fix-patterns']
// Plus chain history at: /workspace/context/chain/history.json
```

**Acceptance Criteria:**
- [ ] REVIEW tasks inherit all parent context profiles
- [ ] Additional review-specific context added
- [ ] Chain history accessible in container
- [ ] Prompts reference previous attempts correctly

---

### Phase 5: UI & CLI Updates (3-5 days)
**Goal:** Replace task creation UI/CLI with minimal schema. Remove legacy codepaths.

#### Milestones

##### M5.1: Minimal Task Creation Form (Week 8, Days 1-2)
**Deliverables:**
- [ ] Replace existing task creation form with minimal 3-field form
- [ ] Display auto-detected values (files, risk, context profiles)
- [ ] Optional override inputs for failed auto-detection
- [ ] Validation feedback for critical errors only

**UI (Intervention Focus):**
```
┌─ Create Task ─────────────────────┐
│ Title*: [                        ]│
│ Type*:  [Implementation ▼]       │
│ Intent*: [                       ]│
│          [                       ]│
│                                   │
│ Auto-detected:                    │
│ • Files: EnhancedLogsViewer.tsx   │
│ • Risk: Low                       │
│ • Context: frontend-ui, logs-ui   │
│                                   │
│ [Override if wrong] [Submit]      │
└───────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Form has ONLY 3 required fields
- [ ] Auto-detection results displayed (read-only)
- [ ] Override button shows advanced fields only if needed
- [ ] Submits minimal payload to new API

##### M5.2: CLI Tooling Updates (Week 8, Day 3)
**Deliverables:**
- [ ] `submit-and-monitor-tasks.js` updated to minimal schema
- [ ] Auto-detection for scripted submissions
- [ ] Context profile override flags (for manual intervention)

**CLI Usage:**
```bash
# Minimal submission (3 args)
node scripts/submit-and-monitor-tasks.js \
  --title "Fix login bug" \
  --type fix \
  --intent "Resolve null pointer in auth service"

# Override auto-detection (intervention)
node scripts/submit-and-monitor-tasks.js \
  --title "Update docs" \
  --type implementation \
  --intent "Add API documentation" \
  --files "docs/api.md" \
  --context deployment,dev-monitor
```

**Acceptance Criteria:**
- [ ] Minimal payloads work from CLI
- [ ] Auto-detection runs unless explicitly overridden
- [ ] Override flags available for intervention

##### M5.3: Critical Context Display for Intervention (Week 8, Days 4-5)
**Deliverables:**
- [ ] Task detail view shows context profiles used (for debugging failed tasks)
- [ ] Display auto-detection choices if task failed (for manual override decision)

**UI (Minimal - Intervention Only):**
- Show context profiles used in task detail (single line)
- Show auto-detected vs manual fields if task failed
- **NO metrics, NO analytics, NO dashboards**

**Acceptance Criteria:**
- [ ] Context info visible in task detail for debugging
- [ ] Failed tasks show what was auto-detected vs provided
- [ ] No analytics/metrics UI added

---

### Phase 6: Optimization & Hardening (1-2 weeks)
**Goal:** Optimize performance, enforce budgets, add telemetry, and handle edge cases.

#### Milestones

##### M6.1: Performance Optimization (Week 10)
**Deliverables:**
- [ ] Bundle generation time <5s for full rebuild
- [ ] Cache hit rate >80% sustained
- [ ] Parallel recipe processing
- [ ] Incremental bundle updates (only changed profiles)

**Optimization Targets:**
| Metric | Current | Target |
|--------|---------|--------|
| Bundle generation time | TBD | <5s |
| Cache hit rate | TBD | >80% |
| Bundle size (implementation) | TBD | <12 KB inline |
| Bundle size (review) | TBD | <8 KB inline |

**Acceptance Criteria:**
- [ ] Generation time meets target under load
- [ ] Cache performance sustained over 1000+ tasks
- [ ] Memory usage stays under 100 MB for cache
- [ ] No performance regression in task execution

##### M6.2: Size Budget Enforcement (Week 10)
**Deliverables:**
- [ ] Pre-flight validation for context budgets
- [ ] Automatic size optimization (trim inline content)
- [ ] Warning system for approaching limits
- [ ] Rejection of oversized bundles

**Budget Enforcement:**
```typescript
const BUDGETS = {
  implementation: { maxBundle: 50_000, maxInline: 12_000 },
  review: { maxBundle: 40_000, maxInline: 8_000 },
  fix: { maxBundle: 45_000, maxInline: 10_000 },
  'pr-follow-up': { maxBundle: 30_000, maxInline: 6_000 },
  analysis: { maxBundle: 35_000, maxInline: 5_000 }
};
```

**Acceptance Criteria:**
- [ ] Tasks rejected if bundle exceeds limits
- [ ] Auto-optimization reduces inline content when needed
- [ ] Budget violations logged for debugging

##### M6.3: Essential Telemetry (Week 11)
**Deliverables:**
- [ ] Context generation error logging
- [ ] Cache invalidation events
- [ ] Critical budget violations logged

**Telemetry (Errors Only):**
```typescript
events: [
  'context:generation_failed',
  'context:budget_exceeded',
  'context:required_module_missing'
]
```

**Acceptance Criteria:**
- [ ] Critical context errors logged for debugging
- [ ] Budget violations prevent task submission
- [ ] No metrics dashboard/analytics added

---

### Phase 7: Migration & Legacy Cleanup (1 week)
**Goal:** Complete migration to minimal schema and delete all legacy task creation code.

#### Milestones

##### M7.1: Legacy API Deprecation (Week 12, Days 1-2)
**Deliverables:**
- [ ] Add deprecation warnings to old `POST /api/tasks` endpoint (if v3 template submitted)
- [ ] Update all existing automated task creators (REVIEW, FIX, hung-task recovery) to use minimal schema
- [ ] Migrate any remaining scripts/tools to minimal schema

**Acceptance Criteria:**
- [ ] All internal task creation uses minimal schema
- [ ] Old endpoint logs deprecation warnings
- [ ] No new tasks created with v3 templates

##### M7.2: Delete Legacy Codepaths (Week 12, Days 3-4)
**Deliverables:**
- [ ] Delete v3 template validators and parsers
- [ ] Delete v3 prompt template files
- [ ] Delete manual prompt authoring utilities
- [ ] Remove v3 schema types from codebase

**Files to Delete:**
```
docs/plans/BOT_PROMPT_ENGINEERING_V3.md → Archive
dev-bots/docs/analysis/quick-reference.md → Archive (if v3-specific)
backend/src/validators/v3TaskValidator.ts → DELETE
backend/src/services/v3PromptBuilder.ts → DELETE
frontend/src/components/TaskCreationForm.v3.tsx → DELETE
```

**Acceptance Criteria:**
- [ ] No v3 code remains in active codebase
- [ ] All tests passing with minimal schema only
- [ ] Build succeeds without v3 dependencies

##### M7.3: Documentation Update (Week 12, Day 5)
**Deliverables:**
- [ ] Update all task creation documentation to show only minimal schema
- [ ] Archive v3 documentation to `docs/archive/`
- [ ] Update README/guides with new 3-field submission examples

**Acceptance Criteria:**
- [ ] No documentation references v3 templates
- [ ] Examples show minimal schema only
- [ ] Legacy docs archived, not deleted

---

### Rollout Strategy

#### Stage 1: Validation (Week 11)
- [ ] Test minimal schema with 20+ manual tasks
- [ ] Verify auto-detection accuracy >90%
- [ ] Fix critical bugs in context generation
- [ ] Ensure no regressions in task execution

#### Stage 2: Full Cutover (Week 12)
- [ ] Deploy new minimal schema API (M7.1)
- [ ] Deprecate old endpoints with warnings (M7.1)
- [ ] Monitor for errors during transition
- [ ] Fix issues within 24 hours

#### Stage 3: Cleanup (Week 12)
- [ ] Delete all legacy code (M7.2)
- [ ] Update all documentation (M7.3)
- [ ] Archive v3 materials (M7.3)
- [ ] Announce completion to team

---

### Success Metrics

#### Critical Success Criteria
- [ ] Context generation time: <5s for full rebuild
- [ ] Bundle sizes within budgets: 100% compliance (hard requirement)
- [ ] Task execution time: No regression (±5%)
- [ ] Stale context incidents: 0 in first month
- [ ] All legacy v3 code deleted by Week 12

#### Quality Indicators
- [ ] Task success rate: No regression from current baseline
- [ ] Auto-detection accuracy: >90% on first attempt
- [ ] Manual context sync commits: Eliminated (automated via context builder)

#### Migration Success
- [ ] 100% of tasks use minimal schema by Week 12
- [ ] Zero v3 template submissions after cutover
- [ ] All internal automation migrated to minimal schema

---

### Risk Mitigation

#### Risk 1: Context Generation Performance
**Mitigation:**
- Implement aggressive caching
- Parallel recipe processing
- Incremental bundle updates
- Pre-generate common bundles

#### Risk 2: Bundle Size Explosion
**Mitigation:**
- Strict size budgets per task type
- Pre-flight validation
- Auto-optimization of inline content
- Monitoring and alerts

#### Risk 3: Stale Context
**Mitigation:**
- File watcher for cache invalidation
- Git commit hash-based keys
- TTL-based expiration
- Manual invalidation via CLI

#### Risk 4: Container Mounting Failures
**Mitigation:**
- Startup validation checks
- Graceful degradation (warn but continue)
- Detailed error messages
- Fallback to inline context if mount fails

#### Risk 5: Schema Migration Issues
**Mitigation:**
- Backwards compatibility for all APIs
- Incremental schema changes
- Data migration scripts tested on copies
- Rollback procedures documented

---

### Testing Strategy

#### Unit Tests (90%+ coverage)
- [ ] ContextBuilder: recipe loading, content extraction, transforms
- [ ] TaskNormalizer: auto-detection logic
- [ ] TaskPromptTemplates: prompt assembly, section generation
- [ ] Cache: hit/miss, invalidation, LRU eviction

#### Integration Tests (85%+ coverage)
- [ ] End-to-end: submission → context generation → execution
- [ ] Context persistence and retrieval
- [ ] Chain context inheritance
- [ ] Cache invalidation on source file changes

#### System Tests
- [ ] Performance: generation time, cache hit rates
- [ ] Load: 100+ concurrent tasks with context
- [ ] Stress: Maximum bundle sizes, cache eviction
- [ ] Chaos: Missing files, invalid recipes, network issues

#### Manual QA
- [ ] UI: Task creation form, context preview, validation
- [ ] CLI: Simplified submissions, batch mode
- [ ] Dev-monitor: Context metadata display, chain visualization
- [ ] E2E: Complete task lifecycle with REVIEW/FIX chain

---

### Rollback Procedures

#### If Critical Bug Found (Before Week 12 Cleanup)
1. Temporarily re-enable v3 endpoint (if not yet deleted)
2. Fix critical issue in minimal schema
3. Test fix in staging
4. Redeploy and continue migration

#### After Week 12 Cleanup (No Rollback Available)
**There is no rollback path after v3 code deletion.** If critical bugs are found:
1. Fix forward in minimal schema
2. Deploy hotfix immediately
3. All rollback procedures assume legacy code still exists

#### If Performance Degradation
1. Increase cache size limits
2. Pre-generate bundles offline during low-traffic periods
3. Optimize slow recipes
4. Parallelize bundle generation

#### If Schema Migration Fails
1. Stop all task submissions
2. Restore database from backup
3. Re-run migration with fixes
4. Validate data integrity
5. Resume submissions

---

### Dependencies & Blockers

#### External Dependencies
- [ ] Git CLI (for commit hash detection) - ✅ Available
- [ ] Docker volume mounting - ✅ Available
- [ ] File system watchers - ✅ Available (chokidar)
- [ ] SQLite with JSON support - ✅ Available

#### Internal Dependencies
- [x] P0: Staged Task Queue - COMPLETED
- [ ] P1: Dev-Bot Foundational Upgrades - IN PROGRESS (need task_context schema)
- [ ] TaskQueueService singleton - ✅ Available
- [ ] TaskExecutionService - ✅ Available
- [ ] Docker volume management - ✅ Available

#### Blockers
- None identified (all prerequisites met or in progress)

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.1 | 2025-11-13 | Claude Code | **Breaking Change**: Made minimal schema the ONLY task creation method. Removed all "Standard mode" fallbacks. Added Phase 7 (Migration & Legacy Cleanup) to completely delete v3 codepaths. Drastically simplified UI updates to focus ONLY on critical human intervention (no analytics/metrics/dashboards). Updated rollout strategy for full cutover. |
| 2.0 | 2025-11-13 | Claude Code | **Major Update**: Added ultra-simplified task submission (3-field schema), detailed context-aware execution flow integration, comprehensive 6-phase implementation plan with milestones, rollout strategy, risk mitigation, and success metrics. Status updated to Ready for Implementation. |
| 1.1 | 2025-11-12 | Claude Code | Added metadata, success criteria, testing strategy, related files |
| 1.0 | 2025-11-12 | Codex Agent | Initial design document |
