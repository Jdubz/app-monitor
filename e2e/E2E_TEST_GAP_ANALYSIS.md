# E2E Test Coverage Gap Analysis - Phased Execution & PR Tracking

**Date:** 2025-11-17  
**Status:** GAPS IDENTIFIED - Needs Implementation  
**Priority:** P0 - Critical for Production Readiness

---

## Executive Summary

Current E2E tests focus on **UI smoke testing** with **mocked data**. We are missing critical integration tests for:
1. ✅ 7-Phase Task Execution System (phased execution)
2. ✅ PR Merge Gate Tracking (8 gates)
3. ✅ Dev-Bot Simulators (behavior validation)
4. ✅ GitHub API Mocks (realistic responses)
5. ✅ Docker Mocks (container lifecycle)

**Risk:** Production bugs not caught by current tests (failed task bug example)

---

## Current Test Coverage

### Existing Tests (UI-Focused)
- ✅ Navigation and routing
- ✅ Basic layout rendering
- ✅ Keyboard shortcuts
- ✅ Service status display
- ✅ Task queue UI (mocked data)
- ✅ PR tracking UI (mocked data)

### Coverage Percentage
- **UI Coverage:** ~80% (good)
- **Integration Coverage:** ~15% (critical gap)
- **Phased Execution Coverage:** 0% ❌
- **PR Gate System Coverage:** 0% ❌
- **Dev-Bot Simulator Coverage:** 0% ❌

---

## Critical Gaps

### Gap 1: 7-Phase Task Execution System

**What's Missing:**
- No E2E tests for phase progression (0 → 1 → 2 → 3 → 4 → 5 → 6)
- No validation of phase transitions
- No testing of phase-specific validators
- No retry logic testing for failed phases
- No recovery agent behavior validation

**Current Implementation:**
```typescript
// backend/src/services/ephemeralWorker.service.ts
- Phases: 0 (init) → 1 (impl) → 2 (verify) → 3 (review) → 4 (fixes) → 5 (test) → 6 (complete)
- Phase validators registered but not E2E tested
- Recovery agent triggers on phase failure but not tested
```

**Needed Tests:**

#### Test 1: Complete Phase Progression (Happy Path)
```typescript
test('should execute all 7 phases for a successful task', async () => {
  // 1. Create task
  const task = await createTask({
    title: "Test phased execution",
    type: "implementation",
    prompt: "Create simple function"
  });
  
  // 2. Assign to dev-bot simulator
  const bot = await startDevBotSimulator();
  await assignTaskToBot(task.id, bot.id);
  
  // 3. Monitor phase progression
  const phases = [];
  bot.on('phase_change', (phase) => phases.push(phase));
  
  // 4. Wait for completion
  await bot.waitForCompletion({ timeout: 60000 });
  
  // 5. Verify all phases executed
  expect(phases).toEqual([0, 1, 2, 3, 4, 5, 6]);
  
  // 6. Verify task marked as complete
  const finalTask = await getTask(task.id);
  expect(finalTask.status).toBe('completed');
  expect(finalTask.phase_index).toBe(6);
});
```

#### Test 2: Phase Failure and Recovery
```typescript
test('should retry failed phase and recover', async () => {
  // 1. Create task
  const task = await createTask({...});
  
  // 2. Start bot with phase 2 (verify) failure injected
  const bot = await startDevBotSimulator({
    failAtPhase: 2,
    failureType: 'compilation_error'
  });
  
  // 3. Monitor phase attempts
  const attempts = [];
  bot.on('phase_attempt', (attempt) => attempts.push(attempt));
  
  // 4. Wait for recovery
  await bot.waitForPhase(3, { timeout: 120000 }); // Should reach phase 3 after retry
  
  // 5. Verify retry happened
  expect(attempts.filter(a => a.phase === 2).length).toBeGreaterThan(1);
  
  // 6. Verify recovery agent invoked
  const logs = await getTaskLogs(task.id);
  expect(logs).toContain('Recovery agent analyzing phase 2 failure');
});
```

#### Test 3: Phase Validator Enforcement
```typescript
test('should enforce phase-specific validation', async () => {
  const task = await createTask({...});
  const bot = await startDevBotSimulator();
  
  // Simulate phase 1 (implementation) without creating files
  await bot.completePhase(1, { 
    filesCreated: [] // Invalid - implementation must create files
  });
  
  // Phase validation should fail
  const taskStatus = await getTask(task.id);
  expect(taskStatus.phase_index).toBe(1); // Still on phase 1
  expect(taskStatus.phase_attempts).toBeGreaterThan(1);
});
```

#### Test 4: Phase Timeout Handling
```typescript
test('should timeout stuck phase and trigger recovery', async () => {
  const task = await createTask({...});
  const bot = await startDevBotSimulator({
    hangAtPhase: 3, // Hang at review phase
    timeout: 30000
  });
  
  // Wait for timeout
  await waitForMs(35000);
  
  // Verify recovery triggered
  const taskStatus = await getTask(task.id);
  expect(taskStatus.recovery_attempts).toBeGreaterThan(0);
});
```

---

### Gap 2: PR Merge Gate Tracking System

**What's Missing:**
- No E2E tests for 8 merge gates
- No testing of gate evaluation triggers
- No gate dependency validation
- No blocking/non-blocking gate behavior tests

**Current Implementation:**
```typescript
// 8 Merge Gates:
1. base_branch_updated (blocking)
2. no_conflicts (blocking)
3. ci_checks_passing (blocking)
4. required_approvals (blocking)
5. task_verification (blocking)
6. copilot_review (non-blocking)
7. final_validation (blocking)
8. no_wip_commits (blocking)
```

**Needed Tests:**

#### Test 5: All Gates Passing (Happy Path)
```typescript
test('should merge PR when all gates pass', async () => {
  // 1. Create task and complete it
  const task = await createTaskAndComplete({...});
  
  // 2. Bot creates PR
  const pr = await getPRForTask(task.id);
  expect(pr).toBeDefined();
  
  // 3. Trigger gate evaluation
  await triggerPRGateEvaluation(pr.number);
  
  // 4. Wait for evaluation
  await waitForGateEvaluation(pr.number);
  
  // 5. Verify all gates passing
  const gates = await getPRGates(pr.number);
  expect(gates.every(g => g.status === 'passed')).toBe(true);
  
  // 6. Verify PR marked as ready to merge
  const prStatus = await getPR(pr.number);
  expect(prStatus.mergeable).toBe(true);
});
```

#### Test 6: Blocking Gate Prevents Merge
```typescript
test('should block merge when ci_checks_passing fails', async () => {
  // 1. Create PR with failing CI
  const pr = await createPRWithFailingCI();
  
  // 2. Evaluate gates
  await triggerPRGateEvaluation(pr.number);
  
  // 3. Verify gate failed
  const gates = await getPRGates(pr.number);
  const ciGate = gates.find(g => g.name === 'ci_checks_passing');
  expect(ciGate.status).toBe('failed');
  expect(ciGate.blocking).toBe(true);
  
  // 4. Verify PR NOT mergeable
  const prStatus = await getPR(pr.number);
  expect(prStatus.mergeable).toBe(false);
});
```

#### Test 7: Non-Blocking Gate Doesn't Prevent Merge
```typescript
test('should allow merge when only non-blocking gates fail', async () => {
  // 1. Create PR with failing copilot_review (non-blocking)
  const pr = await createPRWithFailingCopilotReview();
  
  // 2. All other gates pass
  await passAllOtherGates(pr.number);
  
  // 3. Verify still mergeable
  const prStatus = await getPR(pr.number);
  expect(prStatus.mergeable).toBe(true);
  expect(prStatus.warnings).toContain('Copilot review failed');
});
```

#### Test 8: Gate Re-Evaluation After Fix
```typescript
test('should re-evaluate gates after fixing issues', async () => {
  // 1. Create PR with conflicts
  const pr = await createPRWithConflicts();
  await triggerPRGateEvaluation(pr.number);
  
  // 2. Verify conflicts gate failed
  let gates = await getPRGates(pr.number);
  expect(gates.find(g => g.name === 'no_conflicts').status).toBe('failed');
  
  // 3. Fix conflicts
  await resolveConflicts(pr.number);
  
  // 4. Re-trigger evaluation
  await triggerPRGateEvaluation(pr.number, { force: true });
  
  // 5. Verify gate now passing
  gates = await getPRGates(pr.number);
  expect(gates.find(g => g.name === 'no_conflicts').status).toBe('passed');
});
```

---

### Gap 3: Dev-Bot Simulator Validation

**What's Missing:**
- No E2E tests validating dev-bot simulator behaves like real bots
- No testing of bot lifecycle (start → execute → stop)
- No validation of bot resource cleanup
- No container isolation testing

**Current Implementation:**
```typescript
// backend/src/services/ephemeralWorker.service.ts
- Creates Docker containers for dev-bots
- Mounts workspace via tar
- Executes tasks in isolation
- Cleans up containers after completion
```

**Needed Tests:**

#### Test 9: Bot Simulator Lifecycle
```typescript
test('should create, execute, and cleanup bot container', async () => {
  // 1. Start bot simulator
  const bot = await startDevBotSimulator({
    image: 'app-monitor-dev-bot:test',
    mountWorkspace: true
  });
  
  // 2. Verify container created
  const container = await docker.getContainer(bot.containerId);
  expect(container.State.Running).toBe(true);
  
  // 3. Execute task
  const task = await createTask({...});
  await bot.executeTask(task.id);
  
  // 4. Wait for completion
  await bot.waitForCompletion();
  
  // 5. Verify container stopped and removed
  await expectContainerRemoved(bot.containerId);
  
  // 6. Verify no orphaned resources
  const orphanedContainers = await docker.listContainers({
    filters: { label: [`task_id=${task.id}`] }
  });
  expect(orphanedContainers).toHaveLength(0);
});
```

#### Test 10: Bot Workspace Isolation
```typescript
test('should isolate bot workspace from host filesystem', async () => {
  const bot1 = await startDevBotSimulator();
  const bot2 = await startDevBotSimulator();
  
  // 1. Bot 1 creates file in workspace
  await bot1.execute('echo "bot1" > /workspace/test.txt');
  
  // 2. Bot 2 should NOT see bot 1's file
  const file2 = await bot2.execute('cat /workspace/test.txt');
  expect(file2.exitCode).toBe(1); // File not found
  
  // 3. Verify isolation
  expect(bot1.workspaceId).not.toBe(bot2.workspaceId);
});
```

#### Test 11: Bot Crash Recovery
```typescript
test('should handle bot crash and requeue task', async () => {
  // 1. Start bot that will crash
  const bot = await startDevBotSimulator({
    crashAtPhase: 2
  });
  
  // 2. Assign task
  const task = await createTask({...});
  await assignTaskToBot(task.id, bot.id);
  
  // 3. Wait for crash
  await bot.waitForCrash();
  
  // 4. Verify task requeued
  const taskStatus = await getTask(task.id);
  expect(taskStatus.status).toBe('pending');
  expect(taskStatus.assigned_bot_id).toBe(null);
  
  // 5. Verify container cleaned up
  await expectContainerRemoved(bot.containerId);
});
```

---

### Gap 4: GitHub API Mock Realism

**What's Missing:**
- No E2E tests with realistic GitHub API responses
- No testing of API rate limiting
- No testing of webhook delivery
- No validation of PR state transitions

**Needed Tests:**

#### Test 12: GitHub API Mock Accuracy
```typescript
test('should mock GitHub API responses accurately', async () => {
  // 1. Mock GitHub PR creation
  const mockGH = await setupGitHubMock();
  mockGH.onCreatePR().reply(201, {
    number: 123,
    state: 'open',
    mergeable: null, // GitHub returns null initially
    mergeable_state: 'unknown'
  });
  
  // 2. Create PR via bot
  const bot = await startDevBotSimulator();
  const task = await createTask({...});
  await bot.completeTask(task.id);
  
  // 3. Verify PR created
  const pr = await getPR(123);
  expect(pr.number).toBe(123);
  expect(pr.mergeable).toBe(null); // Should match GitHub behavior
});
```

#### Test 13: GitHub Webhook Simulation
```typescript
test('should simulate GitHub webhooks accurately', async () => {
  const mockGH = await setupGitHubMock();
  const webhookReceiver = await setupWebhookReceiver();
  
  // 1. Create PR
  const pr = await createPR({...});
  
  // 2. Simulate CI completion webhook
  await mockGH.triggerWebhook('check_suite', {
    action: 'completed',
    check_suite: {
      conclusion: 'success',
      pull_requests: [{ number: pr.number }]
    }
  });
  
  // 3. Verify webhook received and processed
  const events = await webhookReceiver.getEvents();
  expect(events).toContainEqual(expect.objectContaining({
    type: 'check_suite',
    action: 'completed'
  }));
  
  // 4. Verify PR gates re-evaluated
  const gates = await getPRGates(pr.number);
  expect(gates.find(g => g.name === 'ci_checks_passing').status).toBe('passed');
});
```

---

### Gap 5: Docker Mock Behavior

**What's Missing:**
- No E2E tests for Docker container operations
- No testing of volume mounts
- No testing of network isolation
- No resource limit enforcement testing

**Needed Tests:**

#### Test 14: Docker Container Operations
```typescript
test('should create and manage Docker containers correctly', async () => {
  const dockerMock = await setupDockerMock();
  
  // 1. Create container
  const container = await dockerMock.createContainer({
    Image: 'app-monitor-dev-bot:test',
    Cmd: ['node', 'execute-task.js'],
    Env: ['TASK_ID=task-123'],
    HostConfig: {
      Memory: 512 * 1024 * 1024, // 512MB
      AutoRemove: true
    }
  });
  
  // 2. Start container
  await container.start();
  
  // 3. Verify container running
  const inspect = await container.inspect();
  expect(inspect.State.Running).toBe(true);
  expect(inspect.HostConfig.Memory).toBe(512 * 1024 * 1024);
  
  // 4. Stop container
  await container.stop();
  
  // 5. Verify auto-removal
  await expectContainerRemoved(container.id);
});
```

---

## Implementation Plan

### Phase 1: Core Phased Execution Tests (3 days)
- [ ] Test 1: Complete phase progression (happy path)
- [ ] Test 2: Phase failure and recovery
- [ ] Test 3: Phase validator enforcement
- [ ] Test 4: Phase timeout handling

### Phase 2: PR Merge Gate Tests (2 days)
- [ ] Test 5: All gates passing
- [ ] Test 6: Blocking gate prevents merge
- [ ] Test 7: Non-blocking gate allows merge
- [ ] Test 8: Gate re-evaluation after fix

### Phase 3: Dev-Bot Simulator Tests (2 days)
- [ ] Test 9: Bot lifecycle
- [ ] Test 10: Workspace isolation
- [ ] Test 11: Crash recovery

### Phase 4: Mock Realism Tests (2 days)
- [ ] Test 12: GitHub API mock accuracy
- [ ] Test 13: GitHub webhook simulation
- [ ] Test 14: Docker container operations

### Phase 5: Integration & CI (1 day)
- [ ] Integrate all tests into E2E suite
- [ ] Add to CI pipeline
- [ ] Set up nightly runs
- [ ] Configure failure alerts

**Total: 10 days**

---

## Test Infrastructure Needed

### 1. Dev-Bot Test Simulator
```typescript
// e2e/utils/dev-bot-simulator.ts
export class DevBotSimulator {
  async start(config: SimulatorConfig): Promise<BotInstance>
  async executeTask(taskId: string): Promise<TaskResult>
  async injectFailure(phase: number, type: FailureType): void
  async waitForPhase(phase: number, timeout: number): Promise<void>
  async waitForCompletion(timeout: number): Promise<void>
  on(event: string, handler: Function): void
}
```

### 2. GitHub API Mock Server
```typescript
// e2e/mocks/github-api-mock.ts
export class GitHubAPIMock {
  onCreatePR(): MockResponse
  onUpdatePR(): MockResponse
  onGetChecks(): MockResponse
  triggerWebhook(type: string, payload: object): void
  resetMocks(): void
}
```

### 3. Docker Mock Service
```typescript
// e2e/mocks/docker-mock.ts
export class DockerMock {
  createContainer(config: ContainerConfig): Promise<Container>
  listContainers(filters: object): Promise<Container[]>
  inspectContainer(id: string): Promise<ContainerInspect>
  cleanupOrphaned(): Promise<void>
}
```

### 4. Phase Execution Assertions
```typescript
// e2e/assertions/phase-assertions.ts
export async function expectPhaseProgression(taskId: string, phases: number[])
export async function expectPhaseRetry(taskId: string, phase: number, attempts: number)
export async function expectRecoveryTriggered(taskId: string)
export async function expectPhaseValidation(taskId: string, phase: number, passed: boolean)
```

---

## Success Criteria

**Current State:**
- Phased execution coverage: 0%
- PR gate coverage: 0%
- Dev-bot simulator coverage: 0%
- Mock realism: Low

**Target State (After Implementation):**
- ✅ Phased execution coverage: >90%
- ✅ PR gate coverage: >90%
- ✅ Dev-bot simulator coverage: >85%
- ✅ Mock realism: High (matches production behavior)
- ✅ Tests catch 95% of integration bugs before production
- ✅ E2E suite runs in <10 minutes
- ✅ Flaky test rate <2%

---

## Related Documentation

- **E2E Test Inventory:** `/e2e/test-inventory.md`
- **Expanded Test Coverage:** `/e2e/EXPANDED_TEST_COVERAGE.md`
- **Phased Execution Design:** `/docs/architecture/dev-bots-overview.md`
- **PR Merge Gates:** `/docs/guides/pr-merge-gates.md` (needs creation)

---

**Priority:** P0 - Must implement before production deployment
**Owner:** E2E Test Suite
**Estimated Effort:** 10 days
**Dependencies:** Dev-bot simulator, GitHub mock, Docker mock

