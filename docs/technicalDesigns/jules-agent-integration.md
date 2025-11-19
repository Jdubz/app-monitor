# Jules Agent Integration Design

**Date:** 2025-11-19  
**Author:** GitHub Copilot CLI  
**Status:** Draft (Proposal)  
**Related Docs:** `agent-selector-gemini-offload.md`, `master-design-intent.md`, `dev-bot-context-management.md`

---

## 1. Executive Summary

Jules is Google's asynchronous AI coding agent that operates independently in secure cloud VMs, creates PRs autonomously, and provides multi-turn reasoning with built-in peer review (Critic Agent). This design proposes integrating Jules as a **fifth agent type** in App Monitor's intelligent agent selection system, leveraging its unique asynchronous PR creation workflow to extend our existing quality-first, multi-review paradigm.

**Key Insight:** Unlike our Docker-based agents (Claude, Codex, Gemini) which run synchronously and require our PR creation logic, Jules operates asynchronously and creates PRs directly to GitHub. This requires a **different integration pattern** - we submit tasks to Jules and monitor the PRs it creates, rather than managing execution directly.

---

## 2. Jules Capabilities & Strengths

### 2.1 Core Capabilities (Researched 2024-2025)

1. **Asynchronous Execution**
   - Clones repo to Google Cloud VM
   - Works independently while developers continue other tasks
   - Submits completed work as GitHub PRs
   - No blocking of local workflow

2. **Advanced Reasoning (Gemini 2.5 Pro)**
   - Multi-turn reasoning for complex tasks
   - Built-in Critic Agent for self-review
   - Dependency analysis and impact assessment
   - Visual feedback (screenshots, environment snapshots)

3. **Quality Assurance Built-in**
   - Internal peer review before PR creation
   - Security and efficiency flagging
   - Bug detection during implementation
   - Automated test suite creation

4. **API & CLI Integration**
   - REST API with session-based workflow
   - CLI for terminal integration (`jules` command)
   - Supports parallel sessions (1-5 concurrent tasks)
   - Repository-scoped execution

5. **GitHub-Native Workflow**
   - Direct PR creation (no manual push required)
   - Integrates with GitHub Actions
   - Respects branch protection rules
   - Memory retention across sessions

### 2.2 Unique Strengths

| Feature | Jules | Claude/Codex/Gemini (Our Docker Agents) |
|---------|-------|----------------------------------------|
| **Execution Model** | Asynchronous (cloud VM) | Synchronous (Docker container) |
| **PR Creation** | Automatic | Manual (via our code) |
| **Multi-turn Review** | Built-in Critic Agent | Requires separate REVIEW phase |
| **Parallel Work** | 1-5 sessions/task | Single container/task |
| **Environment** | Isolated cloud VM | Shared host resources |
| **Iteration** | Can continue same session | New container per attempt |

### 2.3 Operational Characteristics

- **Latency:** Higher initial startup (VM provisioning), but non-blocking
- **Cost:** Free tier (15 tasks/day), paid plans for production
- **Security:** Isolated VMs, no code training, automatic cleanup
- **Quotas:** API rate limits (separate from Gemini quotas)

---

## 3. Integration Strategy: Async Task Delegation Model

### 3.1 Paradigm Shift

**Current Model (Claude/Codex/Gemini):**
```
Task → Agent Selection → Docker Execution → PR Creation → Review → Followup
                        ↑                   ↑
                    We control         We create PR
```

**Jules Model:**
```
Task → Agent Selection → Jules Submission → Monitor PR → Review → Followup
                        ↑                   ↑
                    Jules controls      Jules creates PR
```

### 3.2 Integration Architecture

```typescript
// New agent type in AgentSelector
export type AgentType = 'claude' | 'codex' | 'copilot' | 'gemini' | 'jules';

// Jules-specific workflow service
class JulesWorkflowService {
  async submitTask(task: Task): Promise<JulesSession>
  async monitorSession(sessionId: string): Promise<SessionStatus>
  async adoptPR(sessionId: string, prNumber: number): Promise<Task>
  async requestRevision(sessionId: string, feedback: string): Promise<void>
}
```

### 3.3 Workflow Integration Points

#### Phase 1: Task Submission
1. **Selection:** AgentSelector identifies Jules-eligible task
2. **Submission:** Call Jules API/CLI with task context
3. **Session Tracking:** Store session ID in `task.metadata.jules_session_id`
4. **Status:** Mark task as `executing` with `assigned_worker: 'jules-vm-{id}'`

#### Phase 2: PR Monitoring
1. **Webhook Reception:** GitHub PR webhook fires when Jules creates PR
2. **Session Correlation:** Match PR to Jules session via branch pattern or task ID in PR body
3. **Task Adoption:** Link PR number to original task
4. **Status Update:** Transition task to `reviewing` phase

#### Phase 3: Review & Iteration
1. **Standard Review:** Apply existing PR review logic (Copilot review, checks)
2. **Iteration Support:** Use Jules API to request revisions on **same session**
3. **Multi-attempt Tracking:** Track revision rounds in `task.metadata.jules_revisions`
4. **Quality Gates:** Apply same acceptance criteria verification

#### Phase 4: Completion
1. **Merge Decision:** Use existing auto-merge logic
2. **Session Cleanup:** Close Jules session via API
3. **Metrics Collection:** Track Jules success rates, latency, revision counts

---

## 4. Hybrid Collaboration: Jules Branch Handoff Pattern

### 4.1 The Breakthrough: Shared Branch Collaboration

**Key Realization:** Jules creates a GitHub branch that our Docker-based agents (Claude, Codex, Gemini) can **checkout, analyze, and continue working on**. This enables powerful hybrid workflows:

```
Jules (async) → Creates branch + initial work
                     ↓
Claude (sync) → Checks out Jules' branch → Refines/Fixes → Pushes to same branch
                     ↓
                Updates existing PR (no new PR needed)
```

### 4.2 Hybrid Workflow Patterns

#### Pattern 1: Jules Exploration → Claude Polish
**Use Case:** Complex implementation where exploration benefits from parallel approaches

```typescript
// Phase 1: Jules explores solution space (async, parallel sessions)
await julesWorkflow.submitTask(task, { parallel: 3 }); // 3 parallel attempts
// Wait for Jules to create PR with best approach

// Phase 2: Claude refines the winner
const julesPR = await detectJulesPR(task);
const followupTask = {
  title: `Polish Jules implementation for ${task.title}`,
  description: `
Checkout Jules branch: git fetch origin ${julesPR.branch} && git checkout ${julesPR.branch}

**Review and polish:**
1. Verify all acceptance criteria met
2. Add missing edge case handling
3. Optimize performance
4. Enhance error messages
5. Push to same branch (updates PR #${julesPR.number})

DO NOT create new PR - work updates existing PR.
`,
  agent: 'claude',
  followup_for_pr: julesPR.number
};
```

**Benefits:**
- Jules explores multiple approaches quickly (parallel sessions)
- Claude provides deep refinement and quality control
- Single PR, clean history
- Best of both: Jules' exploration + Claude's precision

#### Pattern 2: Claude Start → Jules Async Completion
**Use Case:** High-risk initial setup needs Claude, but bulk implementation can be async

```typescript
// Phase 1: Claude sets up critical structure
const claudeTask = {
  title: 'Setup database schema and API contracts',
  description: 'Create migration + TypeScript types (HIGH RISK - Claude required)',
  agent: 'claude'
};
await executeTask(claudeTask); // Creates PR with foundation

// Phase 2: Jules builds on Claude's foundation
const claudePR = await getPRForTask(claudeTask.id);
const julesTask = {
  title: 'Implement CRUD operations using schema',
  description: `
[Jules Branch Hint: ${claudePR.branch}]

Checkout existing PR branch and add implementation:
- Start from PR #${claudePR.number} branch
- Implement service layer using schema
- Add comprehensive tests
- Push to same branch

Task ID: ${julesTask.id}
`,
  metadata: {
    jules_session: { /* ... */ },
    continue_from_branch: claudePR.branch,
    continue_from_pr: claudePR.number
  }
};
```

**Benefits:**
- Critical foundation reviewed by Claude (synchronous, controlled)
- Bulk implementation delegated to Jules (async, non-blocking)
- Continuous integration in same PR

#### Pattern 3: Jules First Draft → Codex Review → Claude Fix
**Use Case:** Multi-agent review pipeline

```typescript
// Phase 1: Jules creates implementation
const julesSession = await julesWorkflow.submitTask(implementationTask);
// ... Jules creates PR ...

// Phase 2: Codex analyzes on same branch
const codexReviewTask = {
  title: `Review Jules implementation: ${task.title}`,
  description: `
Checkout Jules branch: git checkout ${julesPR.branch}

**Comprehensive code review:**
1. Security vulnerabilities
2. Performance bottlenecks  
3. Edge cases missed
4. Test coverage gaps

Create review report but DO NOT modify code.
`,
  agent: 'codex',
  type: 'review'
};

// Phase 3: Claude fixes issues (if any) on same branch
const claudeFixTask = {
  title: `Address review findings: ${task.title}`,
  description: `
Checkout branch: git checkout ${julesPR.branch}

**Address Codex findings:**
${codexReviewReport.blockingIssues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

Push fixes to same branch (updates PR #${julesPR.number})
`,
  agent: 'claude',
  followup_for_pr: julesPR.number
};
```

**Benefits:**
- Three-agent quality pipeline: Jules → Codex → Claude
- Each agent operates on same branch
- Single PR with cumulative improvements
- Leverages each agent's strengths

#### Pattern 4: Parallel Competition → Best Branch Selection
**Use Case:** Critical task where confidence is low - hedge with multiple agents

```typescript
// Launch parallel implementations
const [julesSession, claudeTask] = await Promise.all([
  julesWorkflow.submitTask(task, { parallel: 2 }), // Jules tries 2 approaches
  taskQueue.addTask({ ...task, agent: 'claude' })   // Claude tries 1 approach
]);

// Wait for both to create PRs
const [julesPRs, claudePR] = await Promise.all([
  monitorJulesSessions(julesSession),
  monitorClaudeTask(claudeTask.id)
]);

// Run automated evaluation on all branches
const results = await Promise.all([
  ...julesPRs.map(pr => evaluatePR(pr.number)),
  evaluatePR(claudePR.number)
]);

// Pick winner, close others
const winner = results.sort((a, b) => b.score - a.score)[0];
logger.info({
  category: 'hybrid-workflow',
  action: 'competition_winner_selected',
  message: `PR #${winner.pr} selected (agent: ${winner.agent}, score: ${winner.score})`,
  details: { allResults: results }
});

// Close losing PRs
await Promise.all(
  results.filter(r => r.pr !== winner.pr)
    .map(r => closePR(r.pr, `Superseded by #${winner.pr} (higher quality)`))
);
```

**Benefits:**
- Ultimate hedge against agent failures
- Empirical winner selection based on tests/metrics
- Only successful approach survives

### 4.3 Implementation: Branch Handoff Service

```typescript
class BranchHandoffService {
  /**
   * Get branch information for handoff between agents
   */
  async getBranchForHandoff(prNumber: number): Promise<BranchHandoffInfo> {
    const pr = await this.githubPR.getPRStatus(prNumber);
    
    return {
      branch: pr.head_ref,
      baseBranch: pr.base_ref,
      prNumber,
      lastCommitSha: pr.commits?.[0]?.sha,
      checkoutInstructions: this.generateCheckoutInstructions(pr),
      warningFlags: this.detectHandoffRisks(pr)
    };
  }
  
  /**
   * Generate agent-specific checkout instructions
   */
  private generateCheckoutInstructions(pr: PRStatus): string {
    return `
# Checkout existing PR branch
git fetch origin ${pr.head_ref}
git checkout ${pr.head_ref}

# Verify you're on the right branch
git branch --show-current  # Should show: ${pr.head_ref}
git log -1                 # Should show Jules' last commit

# After making changes:
git add .
git commit -m "fix: address review feedback"
git push origin ${pr.head_ref}  # Updates PR #${pr.number}
`.trim();
  }
  
  /**
   * Detect risks when handing off branch
   */
  private detectHandoffRisks(pr: PRStatus): string[] {
    const warnings: string[] = [];
    
    // Check for merge conflicts
    if (pr.mergeable === 'CONFLICTING') {
      warnings.push('⚠️ Branch has merge conflicts - resolve before continuing');
    }
    
    // Check if PR is behind base
    if (pr.mergeable_state === 'behind') {
      warnings.push('ℹ️ Branch is behind base - may need rebase');
    }
    
    // Check for failing checks
    const failedChecks = pr.checks.filter(c => c.status === 'failure');
    if (failedChecks.length > 0) {
      warnings.push(`⚠️ ${failedChecks.length} failing checks - must fix`);
    }
    
    return warnings;
  }
  
  /**
   * Create handoff task for different agent to continue work
   */
  async createHandoffTask(
    originalTask: Task,
    prNumber: number,
    handoffAgent: AgentType,
    handoffReason: string,
    additionalInstructions: string
  ): Promise<Task> {
    const handoffInfo = await this.getBranchForHandoff(prNumber);
    
    const handoffTask: Task = {
      id: `task-handoff-${crypto.randomUUID().slice(0, 8)}`,
      title: `[${handoffAgent.toUpperCase()} Handoff] ${originalTask.title}`,
      description: `
**Handoff Reason:** ${handoffReason}

${handoffInfo.checkoutInstructions}

${handoffInfo.warningFlags.length > 0 ? `
**⚠️ Branch Warnings:**
${handoffInfo.warningFlags.join('\n')}
` : ''}

**Original Task Context:**
${originalTask.description}

**Handoff Instructions:**
${additionalInstructions}

**Important:**
- Work on existing branch \`${handoffInfo.branch}\`
- Push updates to PR #${prNumber} (DO NOT create new PR)
- Maintain existing commit history
- Update PR description if scope changes
`,
      type: 'implementation',
      agent: handoffAgent,
      followup_for_pr: prNumber,
      parent_task_id: originalTask.id,
      metadata: {
        handoff: {
          from_agent: originalTask.agent,
          to_agent: handoffAgent,
          branch: handoffInfo.branch,
          pr_number: prNumber,
          reason: handoffReason,
          handed_off_at: Date.now()
        }
      },
      acceptance_criteria: originalTask.acceptance_criteria,
      validation_steps: originalTask.validation_steps
    };
    
    await this.taskQueue.addTask(handoffTask);
    
    logger.info({
      category: 'hybrid-workflow',
      action: 'branch_handoff',
      message: `Handed off PR #${prNumber} from ${originalTask.agent} to ${handoffAgent}`,
      details: {
        original_task: originalTask.id,
        handoff_task: handoffTask.id,
        branch: handoffInfo.branch,
        reason: handoffReason
      }
    });
    
    return handoffTask;
  }
}
```

### 4.4 Agent Selection Enhancement: Hybrid Mode

```typescript
// In agentSelector.ts

interface HybridWorkflowConfig {
  enabled: boolean;
  exploreThenPolish?: boolean;  // Jules parallel → Claude refine
  reviewPipeline?: boolean;     // Jules → Codex → Claude
  parallelCompetition?: boolean; // Jules + Claude race
}

private async selectWithHybridStrategy(
  criteria: AgentSelectionCriteria,
  task: Task,
  hybridConfig: HybridWorkflowConfig
): Promise<AgentSelection | HybridWorkflowPlan> {
  
  // Pattern: Explore then Polish
  if (hybridConfig.exploreThenPolish && criteria.complexity === 'complex') {
    return {
      type: 'hybrid',
      phases: [
        {
          agent: 'jules',
          role: 'explorer',
          config: { parallel: 3 },
          reasoning: 'Explore solution space with parallel approaches'
        },
        {
          agent: 'claude',
          role: 'polisher',
          waitFor: 'jules-pr-created',
          reasoning: 'Refine winning approach with precision'
        }
      ]
    };
  }
  
  // Pattern: Review Pipeline
  if (hybridConfig.reviewPipeline && criteria.taskCategory === 'implementation') {
    return {
      type: 'hybrid',
      phases: [
        { agent: 'jules', role: 'implementer' },
        { agent: 'codex', role: 'reviewer', checkoutBranch: true },
        { agent: 'claude', role: 'fixer', conditionalOn: 'review-has-blocking-issues' }
      ]
    };
  }
  
  // Pattern: Parallel Competition (high-stakes tasks)
  if (hybridConfig.parallelCompetition && task.priority === 'critical') {
    return {
      type: 'hybrid',
      phases: [
        {
          agents: ['jules', 'claude'],
          role: 'parallel-competitors',
          selectionCriteria: 'highest-test-score'
        }
      ]
    };
  }
  
  // Fallback to single-agent selection
  return await this.selectAgent(criteria, task);
}
```

### 4.5 Benefits of Hybrid Collaboration

| Benefit | How It Works | Example |
|---------|--------------|---------|
| **Best of Both Worlds** | Combine async exploration + sync precision | Jules finds approach → Claude perfects it |
| **Risk Mitigation** | Critical setup sync, bulk work async | Claude schema → Jules CRUD implementation |
| **Quality Pipelines** | Multi-agent review on same branch | Jules code → Codex review → Claude fix |
| **Hedging Uncertainty** | Parallel attempts, empirical winner | Jules (3 approaches) + Claude (1) → best wins |
| **Resource Optimization** | Async work during sync agent busy times | Jules works while Claude handles other task |
| **Continuous Integration** | Single PR, multiple agents contributing | Cleaner git history, easier review |

---

## 5. Agent Selection Rules for Jules

### 4.1 Eligibility Criteria

Jules is **eligible** when ALL conditions met:

| Criterion | Check |
|-----------|-------|
| **Task Category** | `implementation`, `testing`, `refactoring` (NOT `analysis`, `review`, `planning`) |
| **Scope** | Well-defined, < 3 hour estimate |
| **Risk Score** | Low-medium (< 5) |
| **Context Availability** | Task has complete acceptance criteria + validation steps |
| **Iteration Tolerance** | Task allows async feedback (not time-critical) |
| **Jules Quota** | Free tier: < 15 tasks/day used; Paid: within rate limits |

### 4.2 Jules vs Other Agents

**When Jules is PREFERRED:**
- **End-to-end feature implementation** (test writing, code, docs)
- **Refactoring with comprehensive test coverage**
- **Bug fixes requiring multi-file changes**
- **Tasks benefiting from parallel exploration** (use `--parallel` flag)
- **When Claude queue is backed up** AND task is Jules-eligible

**When OTHER agents are PREFERRED:**
- **Quick documentation updates** → Codex (faster, synchronous)
- **High-risk backend services** → Claude (more control, review before PR)
- **Analysis/review tasks** → Codex (designed for review)
- **Frontend polish** → Gemini (faster for simple UI changes)
- **Time-critical fixes** → Claude (synchronous, immediate feedback)

### 4.3 Selection Logic Extension

```typescript
// In agentSelector.ts applySelectionRules()

// After existing rules...
if (provisional.agent === 'claude' && this.canJulesHandle(criteria, task)) {
  // Check queue pressure
  const claudeQueueDepth = await this.getQueueDepth('claude');
  
  if (claudeQueueDepth > JULES_THRESHOLD || criteria.preferAsync) {
    // Check Jules quota
    if (await this.julesEligibility.hasQuota()) {
      return this.createSelection(
        'jules',
        'Async implementation offloaded to Jules (Claude queue relief)',
        0.85,
        'claude'
      );
    }
  }
}

private canJulesHandle(criteria: AgentSelectionCriteria, task?: Task): boolean {
  // Implementation tasks only
  if (criteria.taskCategory !== 'implementation' && 
      criteria.taskCategory !== 'testing' &&
      criteria.taskCategory !== 'refactoring') {
    return false;
  }
  
  // Must have complete context
  if (!task?.acceptance_criteria || task.acceptance_criteria.length === 0) {
    return false;
  }
  
  // Risk score check (reuse existing logic)
  if (task?.risk_score && task.risk_score >= 5) {
    return false;
  }
  
  // Scope check (estimated effort)
  if (criteria.complexity === 'complex') {
    return false;
  }
  
  return true;
}
```

---

## 5. PR Tracking & Correlation

### 5.1 Jules PR Patterns

Jules creates PRs with predictable patterns we can use for correlation:

**Branch Naming:**
- Jules likely uses session-based branches: `jules-session-{id}` or task-derived names
- **Our Pattern:** We submit tasks with branch hints via task description/metadata

**PR Description:**
- Jules includes session metadata in PR body
- **Our Strategy:** Include task ID in submission prompt, look for it in PR description

**PR Author:**
- Always Jules bot account (or authenticated user if using personal token)
- **Detection:** Track Jules-created PRs via author match

### 5.2 Correlation Strategy

```typescript
interface JulesSessionMetadata {
  sessionId: string;
  taskId: string;
  submittedAt: number;
  estimatedCompletionMinutes?: number;
}

// Store in task.metadata
task.metadata.jules_session = {
  sessionId: 'abc123',
  taskId: task.id,
  submittedAt: Date.now()
};

// PR webhook handler enhancement
async handleJulesPR(prWebhook: GitHubPRWebhook): Promise<void> {
  // 1. Detect Jules PR
  if (!this.isJulesPR(prWebhook.pull_request)) {
    return;
  }
  
  // 2. Extract task ID from PR body or branch
  const taskId = this.extractTaskIdFromPR(prWebhook.pull_request);
  
  // 3. Look up task and validate session
  const task = await this.taskQueue.getTask(taskId);
  if (!task?.metadata?.jules_session) {
    // Orphaned Jules PR - create adoption task
    await this.adoptOrphanedJulesPR(prWebhook.pull_request);
    return;
  }
  
  // 4. Link PR to task
  await this.taskQueue.updateTask(taskId, {
    pr_number: prWebhook.pull_request.number,
    status: 'reviewing'
  });
  
  // 5. Trigger standard PR review workflow
  await this.prMonitor.handlePRUpdate(prWebhook.pull_request.number, task);
}

private isJulesPR(pr: PullRequest): boolean {
  return pr.user.login === 'jules-bot' || 
         pr.head.ref.startsWith('jules-') ||
         pr.body?.includes('[Jules Session]');
}

private extractTaskIdFromPR(pr: PullRequest): string | null {
  // Look for task ID in description
  const match = pr.body?.match(/Task ID: (task-[a-z]+-[a-f0-9-]{8,})/i);
  return match ? match[1] : null;
}
```

### 5.3 Task Submission Enhancement

When submitting to Jules, include task context in prompt:

```typescript
async submitToJules(task: Task): Promise<JulesSession> {
  const prompt = this.buildJulesPrompt(task);
  
  // Include task ID for correlation
  const enhancedPrompt = `
[Task ID: ${task.id}]

${prompt}

**Acceptance Criteria:**
${task.acceptance_criteria?.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**Validation Steps:**
${task.validation_steps?.map((v, i) => `${i + 1}. ${v}`).join('\n')}

**Success Metrics:**
${task.success_metrics?.map(m => `- ${m}`).join('\n')}
`;

  const session = await this.julesClient.createSession({
    prompt: enhancedPrompt,
    repo: this.config.repoOwner + '/' + this.config.repoName
  });
  
  return session;
}
```

---

## 6. Iteration & Revision Workflow

### 6.1 Jules Session Continuity

**Key Advantage:** Jules supports **same-session revisions** - can request changes without starting fresh.

```typescript
async handleReviewFeedback(
  task: Task, 
  prNumber: number, 
  feedback: CopilotReviewAnalysis
): Promise<void> {
  const sessionId = task.metadata.jules_session?.sessionId;
  
  if (!sessionId) {
    // Fallback: create new task (current behavior)
    await this.createFollowupTask(task, prNumber, feedback);
    return;
  }
  
  // Check revision count (prevent infinite loops)
  const revisions = task.metadata.jules_revisions || 0;
  if (revisions >= MAX_JULES_REVISIONS) {
    logger.warn({
      category: 'jules-workflow',
      action: 'max_revisions_exceeded',
      message: `Jules session ${sessionId} exceeded ${MAX_JULES_REVISIONS} revisions, escalating to Claude`
    });
    
    // Escalate to Claude
    await this.escalateToAgent(task, 'claude', feedback);
    return;
  }
  
  // Request revision in same session
  const revisionPrompt = this.buildRevisionPrompt(feedback);
  await this.julesClient.continueSession(sessionId, revisionPrompt);
  
  // Track revision
  await this.taskQueue.updateTask(task.id, {
    'metadata.jules_revisions': revisions + 1,
    status: 'executing' // Back to execution, will return to review when PR updated
  });
}

private buildRevisionPrompt(feedback: CopilotReviewAnalysis): string {
  return `
**Review Feedback Received - Please Address:**

**Blocking Issues:**
${feedback.blockingIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

**Suggestions:**
${feedback.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Please update the PR to address all blocking issues and incorporate suggestions where applicable.
Maintain existing tests and ensure all checks pass.
`;
}
```

### 6.2 Revision vs New Task Decision

| Scenario | Strategy | Reason |
|----------|----------|--------|
| **Minor fixes** (typos, formatting, small logic errors) | **Continue session** | Faster, preserves context |
| **Scope change** (new requirements, missed acceptance criteria) | **New task** | Different work, should be separate |
| **3+ revisions failed** | **Escalate to Claude** | Jules struggling, need different approach |
| **Time-critical** | **Parallel Claude task** | Hedge bet with synchronous agent |

---

## 7. Quality Gates & Multi-Review Integration

### 7.1 Existing Quality Paradigm Alignment

App Monitor's **"quality above all, multiple reviews"** paradigm maps perfectly to Jules:

| Our Paradigm | Jules Native Features | Integration Point |
|--------------|----------------------|-------------------|
| **Pre-execution validation** | Critic Agent internal review | Jules does this automatically before PR |
| **PR review phase** | Human/Copilot review after PR | We apply existing PR review logic |
| **Acceptance criteria verification** | Jules checks success metrics | We validate in PR phase |
| **Multi-attempt tolerance** | Session continuity | We use `continueSession()` for revisions |
| **Fallback agents** | - | We escalate to Claude after 3 failed revisions |

### 7.2 Quality Gate Enhancements

```typescript
// In PRMonitorService
async verifyJulesTaskCompletion(task: Task, prNumber: number): Promise<VerificationResult> {
  // Standard verification
  const standardResult = await this.verifyTaskCompletion(task, prNumber);
  
  // Jules-specific checks
  const julesMetadata = task.metadata.jules_session;
  if (julesMetadata) {
    // Check if Jules reported any internal warnings
    const sessionDetails = await this.julesClient.getSessionDetails(julesMetadata.sessionId);
    
    if (sessionDetails.criticWarnings && sessionDetails.criticWarnings.length > 0) {
      standardResult.warnings.push(
        ...sessionDetails.criticWarnings.map(w => `Jules Critic: ${w}`)
      );
    }
    
    // Track internal revision count
    if (sessionDetails.internalRevisionsCount > 0) {
      standardResult.metadata.julesInternalRevisions = sessionDetails.internalRevisionsCount;
    }
  }
  
  return standardResult;
}
```

---

## 8. Operational Considerations

### 8.1 Quota Management

**Free Tier:** 15 tasks/day
- **Strategy:** Reserve for non-urgent, well-scoped work
- **Priority:** Use when Claude queue > 5 tasks
- **Tracking:** Count daily submissions, reset at midnight UTC

**Paid Tier:** Rate-limited by API quotas
- **Strategy:** Monitor rate limits via API responses
- **Circuit Breaker:** Disable Jules if 429 errors > 5 in 10 minutes
- **Fallback:** Queue tasks for Claude when Jules unavailable

### 8.2 Session Lifecycle Management

```typescript
interface JulesSessionLifecycle {
  created: number;
  lastActivity: number;
  prCreated?: number;
  prMerged?: number;
  sessionClosed?: number;
}

// Auto-cleanup stale sessions
async cleanupStaleSessions(): Promise<void> {
  const staleCutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
  
  const staleSessions = await this.db.query(`
    SELECT * FROM tasks 
    WHERE metadata->>'jules_session.sessionId' IS NOT NULL
    AND status IN ('executing', 'pending')
    AND updated_at < ?
  `, [staleCutoff]);
  
  for (const task of staleSessions) {
    const sessionId = task.metadata.jules_session.sessionId;
    
    // Check session status
    const status = await this.julesClient.getSessionStatus(sessionId);
    
    if (status === 'completed' || status === 'failed') {
      // Close session
      await this.julesClient.closeSession(sessionId);
      
      // Update task
      await this.taskQueue.updateTask(task.id, {
        status: status === 'completed' ? 'completed' : 'failed',
        'metadata.jules_session_closed_at': Date.now()
      });
    }
  }
}
```

### 8.3 Monitoring & Telemetry

**New Metrics:**
- `jules_tasks_submitted_total`
- `jules_session_duration_seconds`
- `jules_pr_creation_latency_seconds`
- `jules_revision_count_per_task`
- `jules_success_rate_by_category`
- `jules_quota_remaining_daily`
- **`hybrid_handoff_total` (by pattern: sequential/parallel)**
- **`hybrid_handoff_latency_seconds`**
- **`hybrid_competition_winner_margin` (quality delta between winner and losers)**
- **`branch_handoff_race_conditions_detected`**

**Alerts:**
- Jules quota < 20% remaining
- Jules session stale > 6 hours without PR
- Jules revision count > 3 for single task
- Jules success rate < 70% (escalation threshold)
- **Hybrid handoff latency > 10 minutes (branch sync issues)**
- **Branch handoff race condition detected (concurrent checkout attempts)**

---

## 9. Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Add `jules` to `AgentType` enum
- [ ] Create `JulesClient` service (API wrapper)
- [ ] Implement basic session submission
- [ ] Add Jules session tracking to task metadata schema
- [ ] Unit tests for Jules client

### Phase 2: Integration (Week 2)
- [ ] Extend `AgentSelector` with Jules eligibility checks
- [ ] Implement PR correlation logic in webhook handler
- [ ] Add orphaned Jules PR adoption support
- [ ] **Create `BranchHandoffService` for hybrid workflows**
- [ ] Integration tests for submission → PR flow
- [ ] **Tests for branch checkout and handoff scenarios**

### Phase 3: Iteration Support (Week 3)
- [ ] Implement `continueSession()` for revisions
- [ ] Add revision count tracking
- [ ] Build escalation logic (Jules → Claude after 3 revisions)
- [ ] Test multi-revision workflows

### Phase 4: Productionization (Week 4)
- [ ] Quota management and circuit breaker
- [ ] Session cleanup automation
- [ ] Telemetry and dashboard updates
- [ ] Documentation and runbooks
- [ ] Load testing with parallel sessions

### Phase 5: Optimization (Week 5+)
- [ ] ML-based selection tuning (Jules vs Claude vs Hybrid)
- [ ] Parallel session experiments (`--parallel` flag usage)
- [ ] **Hybrid sequential pattern automation** (auto-trigger Jules→Claude for complex tasks)
- [ ] **Parallel competition evaluation** (winner selection algorithm refinement)
- [ ] Cost optimization (free tier vs paid tier strategy)
- [ ] Success rate analysis by task category and workflow pattern
- [ ] **Branch handoff race condition monitoring and prevention**

---

## 10. Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Jules session hangs** | Task stuck indefinitely | 6-hour timeout, auto-escalate to Claude |
| **PR correlation fails** | Orphaned PRs | Robust extraction logic + adoption workflow |
| **Quota exhaustion** | Jules unavailable mid-day | Circuit breaker, auto-fallback to Claude |
| **Quality regression** | Poor code merged | Same review gates as Claude (no shortcuts) |
| **Cost overrun** | Unexpected paid tier charges | Daily budget alerts, kill switch |
| **Session state mismatch** | Task/PR out of sync | Periodic reconciliation job |

---

## 11. Success Metrics

**Target Metrics (3 months):**

**Single-Agent Mode:**
- **Claude Queue Relief:** 30% reduction in Claude wait times
- **Jules Success Rate:** ≥ 75% tasks complete without escalation
- **Average Time to PR:** < 30 minutes from submission
- **Revision Rate:** < 2.0 revisions per successful task
- **Quality Maintenance:** No decrease in overall code quality scores

**Hybrid Mode:**
- **Sequential Handoff Success:** ≥ 80% Jules→Claude handoffs complete without issues
- **Parallel Competition Value:** Winner PRs score ≥ 20% higher than losers (validates cost)
- **Branch Handoff Latency:** < 5 minutes between Jules PR creation and Claude checkout
- **Multi-Agent Quality Lift:** Hybrid PRs score ≥ 10% higher than single-agent PRs
- **Resource Efficiency:** Hybrid sequential cost < 2× single-agent, parallel < 3× single-agent

**Monitoring:**
- Weekly dashboard review (single-agent + hybrid breakdowns)
- Monthly retrospective on Jules vs Claude vs Hybrid outcomes
- Quarterly cost-benefit analysis (include parallel competition costs)

---

## 12. Open Questions

1. **API Key Management:** Should we use project-level API key or per-developer keys? (Security vs. quota pooling)
2. **Branch Strategy:** ~~Do we need Jules-specific branch naming conventions?~~ **RESOLVED:** Jules branches are compatible with Docker agents - enables hybrid workflows
3. **Parallel Sessions:** Should we auto-enable `--parallel 3` for complex tasks? (Cost vs. speed tradeoff)
4. **Failure Attribution:** How to distinguish Jules failure vs. task ambiguity? (Affects agent selection learning)
5. **Session Memory:** Can we leverage Jules memory across tasks for project-specific patterns? (Context optimization)
6. **Hybrid Workflow Triggers:** When should we automatically invoke hybrid patterns vs. single-agent? (Need heuristics)
7. **Branch Handoff Race Conditions:** How to handle if Claude checks out Jules branch before Jules finishes committing? (Locking strategy)
8. **Parallel Competition Resource Limits:** Should we cap total concurrent agents (Jules + Claude) to prevent resource exhaustion? (Budget vs. speed)

---

## 13. Conclusion

Jules represents a **paradigm shift** from synchronous Docker-based agents to **asynchronous cloud-based delegation** - but even more powerfully, enables **hybrid collaboration patterns** where multiple agents work on the same branch sequentially or competitively.

**Three Integration Modes:**

1. **Pure Async Delegation:** Submit to Jules → Monitor PR → Review (original design)
2. **Hybrid Sequential:** Jules explores → Claude polishes (same branch handoff)
3. **Hybrid Parallel:** Jules + Claude compete → Best PR wins (empirical selection)

**Architectural Requirements:**

1. **Single-Agent Foundation:** New workflow service, PR correlation logic, session lifecycle management
2. **Hybrid Enhancement:** Branch handoff service, multi-agent orchestration, empirical evaluation
3. **Selection Strategy:** Clear eligibility criteria PLUS hybrid pattern triggers
4. **Quality Preservation:** Same review rigor, multi-revision support, escalation to Claude, empirical winner selection
5. **Operational Discipline:** Quota management, monitoring, circuit breakers, race condition handling

**Recommendation:** Proceed with phased rollout:
- **Weeks 1-2:** Pure async delegation (single-agent foundation)
- **Weeks 3-4:** Hybrid sequential handoffs (Jules → Claude polish)
- **Week 5+:** Hybrid parallel competition (experimental, high-value tasks only)

Start with non-critical tasks in free tier, expanding to paid tier based on ROI analysis after 1 month.

**Key Success Factors:**
1. **Complementary, Not Replacement:** Jules as async executor + hybrid collaborator maintains quality-first paradigm
2. **Branch as Integration Point:** GitHub branches enable seamless multi-agent collaboration without custom infrastructure
3. **Empirical Selection:** Let tests/metrics decide winners in competition mode, not heuristics
4. **Graceful Degradation:** If Jules unavailable or hybrid patterns fail, fallback to proven single-agent (Claude) workflows

**Unique Advantage:** Unlike competitors who force single-agent choices, our system can **dynamically compose agent teams** on the same branch, leveraging each agent's strengths while maintaining single PR clarity and review workflow.

---

**Next Steps:**
1. Review this design with team (focus on hybrid patterns - high novelty)
2. Prototype `BranchHandoffService` alongside `JulesClient` (Week 1)
3. Run controlled experiments:
   - 5 pure async tasks (baseline)
   - 3 Jules→Claude sequential handoffs (hybrid validation)
   - 1 parallel competition (Jules vs Claude on same task)
4. Decide on free tier vs. paid tier strategy
5. Update `docs/architecture/master-design-intent.md` with Jules integration + hybrid collaboration patterns
