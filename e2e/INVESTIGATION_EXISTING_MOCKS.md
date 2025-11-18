# Investigation Report: Existing Mocks & Simulators

**Date:** 2025-11-17  
**Purpose:** Ensure E2E test implementation doesn't duplicate existing work  
**Result:** ✅ No duplication - Distinct use cases

---

## Existing Mock Infrastructure

### 1. Backend Unit Test Mocks (`backend/src/services/devBotsManager.mocks.ts`)

**File Size:** 661 lines  
**Purpose:** Unit testing DevBotsManager and related services  
**Scope:** Vitest unit tests only

**Available Mock Functions (23 total):**
- `createMockDocker()` - Mocks Docker client
- `createMockDockerManager()` - Mocks DockerManager service
- `createMockTaskQueue()` - Mocks TaskQueueService
- `createMockAgentManager()` - Mocks AgentPersonalityManager
- `createMockTemplateManager()` - Mocks TaskPromptTemplateManager
- `createMockGuidelinesManager()` - Mocks TaskCreationGuidelinesManager
- `createMockTaskCreationService()` - Mocks task creation
- `createMockStatusAggregationService()` - Mocks status aggregation
- `createMockRetryCoordinationService()` - Mocks retry coordination
- `createMockSystemLifecycleService()` - Mocks system lifecycle
- `createMockSystemInitializationService()` - Mocks system init
- `createMockInteractiveSessionCoordinator()` - Mocks interactive sessions
- `createMockCleanupCoordinator()` - Mocks cleanup
- `createMockInfoQueryService()` - Mocks info queries
- `createMockWorkspaceSyncManager()` - Mocks workspace sync
- `createMockRetryManager()` - Mocks retry logic
- `createMockTaskPersistence()` - Mocks task persistence
- `createMockWorkspaceOrchestrator()` - Mocks workspace orchestration
- `createMockScopeControl()` - Mocks scope control
- `createMockEphemeralWorkerService()` - Mocks ephemeral workers
- `createMockTaskExecutionService()` - Mocks task execution
- `createMockTaskCompletionService()` - Mocks task completion
- `createMockDevBotsManagerDependencies()` - Complete dependency set

**Key Characteristics:**
- Uses Vitest `vi.fn()` for mocking
- Stateless (no real behavior simulation)
- Returns mock objects with stubbed methods
- For **isolated unit testing** only

---

### 2. Frontend API Mocks (`frontend/src/test/api-mocks.ts`)

**Purpose:** Mock API responses for frontend unit tests  
**Scope:** Frontend component testing

**Available Generators:**
- `mockGenerators.healthCheck()` - Health check responses
- `mockGenerators.portInfo()` - Port status
- `mockGenerators.portStatusMap()` - Port mapping
- `mockGenerators.portKillResponse()` - Port kill results
- `mockGenerators.devBotsWorkerStatus()` - Worker status
- `mockGenerators.devBotsTask()` - Task objects
- Type-safe helpers: `apiSuccess<T>()`, `apiError()`

**Key Characteristics:**
- Generates mock data matching API contracts
- Frontend-focused (React component tests)
- No behavioral simulation
- Static data generators

---

### 3. Test Helper Infrastructure (`backend/tests/helpers/`)

**Files:**
- `fake-socket-server.ts` - WebSocket testing utilities
- `mockServerDependencies.ts` - Server dependency mocks
- `createApiTestServer.ts` - Test server setup

**Purpose:** Integration test support  
**Scope:** Backend integration tests

**Key Characteristics:**
- Provides test server setup
- WebSocket simulation
- For **integration tests**, not E2E

---

## Our E2E Implementation

### Dev-Bot Simulator (`e2e/utils/dev-bot-simulator.ts`)

**File Size:** 450+ lines  
**Purpose:** E2E testing with **behavioral simulation**  
**Scope:** Playwright E2E tests

**Key Differences from Existing Mocks:**

| Feature | Existing Mocks | Our E2E Simulator |
|---------|---------------|------------------|
| **Purpose** | Unit test isolation | End-to-end behavioral testing |
| **Execution** | Vitest | Playwright |
| **State** | Stateless | Stateful with event tracking |
| **Behavior** | Stubbed methods | Real phase progression simulation |
| **API Calls** | Mocked | **Actual HTTP calls** to backend |
| **Events** | None | Full EventEmitter with 8+ events |
| **Phase Tracking** | None | Tracks all 7 phases (0-6) |
| **Failure Injection** | None | Configurable (failAtPhase, hangAtPhase, crashAtPhase) |
| **Container Sim** | Basic mock | Lifecycle simulation |
| **Use Case** | Verify service logic | **Verify system integration** |

**Unique Features (Not in Existing Mocks):**
1. ✅ **Phase Progression Simulation** - Executes through 0→1→2→3→4→5→6
2. ✅ **Event System** - Emits `phase_change`, `phase_attempt`, `crashed`, `phase_failed`
3. ✅ **Configurable Failures** - Inject failures at specific phases
4. ✅ **Timeout Simulation** - Hang at specific phase
5. ✅ **Crash Simulation** - Crash bot at specific phase
6. ✅ **Phase History Tracking** - `getPhaseHistory()`, `getAttemptHistory()`
7. ✅ **Wait Utilities** - `waitForPhase()`, `waitForCompletion()`, `waitForCrash()`
8. ✅ **Real API Integration** - Calls actual backend endpoints
9. ✅ **Task Helpers** - `createTask()`, `getTask()`, `getTaskLogs()`

---

## Analysis: No Duplication

### Why Our Simulator is Necessary

**Existing mocks are for:**
- ✅ Unit tests (isolated service testing)
- ✅ Integration tests (service layer testing)
- ✅ Frontend component tests (UI testing)

**Our simulator is for:**
- ✅ **E2E tests** (full system behavioral testing)
- ✅ **Phase execution validation** (not tested by unit tests)
- ✅ **Integration flows** (task → bot → phases → PR → merge)
- ✅ **Failure scenarios** (phase failures, timeouts, crashes)
- ✅ **Real backend interaction** (not mocked)

### Use Case Comparison

**Unit Test Scenario (uses existing mocks):**
```typescript
// Test: DevBotsManager assigns task to bot
const mockTaskQueue = createMockTaskQueue();
const mockEphemeralWorker = createMockEphemeralWorkerService();
const manager = new DevBotsManager({ taskQueue: mockTaskQueue, ... });

await manager.assignTask('task-1');
expect(mockEphemeralWorker.startTask).toHaveBeenCalledWith('task-1');
```

**E2E Test Scenario (uses our simulator):**
```typescript
// Test: Bot executes all 7 phases and creates PR
const bot = await startDevBotSimulator();
const task = await createTask({ title: "Test", type: "implementation", ... });

await bot.executeTask(task.id);
await bot.waitForCompletion();

const phases = bot.getPhaseHistory();
expect(phases).toEqual([0, 1, 2, 3, 4, 5, 6]); // All phases executed

const finalTask = await getTask(task.id);
expect(finalTask.status).toBe('completed');
expect(finalTask.pr_url).toBeDefined(); // PR was created
```

**Different testing layers!**

---

## Missing Infrastructure (Still Needed)

### 1. GitHub API Mock (Not Found)
- ❌ No existing GitHub/Octokit mocks for E2E tests
- ❌ No webhook simulation
- ❌ No PR state transition mocking
- ✅ **Need to create:** `e2e/mocks/github-api-mock.ts`

### 2. Docker Mock for E2E (Partial)
- ⚠️ Exists for unit tests (`createMockDocker()`)
- ❌ Not suitable for E2E (Vitest-specific, no container lifecycle)
- ✅ **Need to create:** `e2e/mocks/docker-mock.ts` with:
  - Container lifecycle simulation
  - Resource limit enforcement
  - Volume mount validation
  - Network isolation

### 3. Phase Assertions (Not Found)
- ❌ No existing assertion helpers for phase validation
- ✅ **Need to create:** `e2e/assertions/phase-assertions.ts`

---

## Conclusion

### ✅ No Duplication Detected

**Our E2E simulator is:**
- Distinct from unit test mocks (different testing layer)
- More sophisticated (stateful, event-driven, behavioral)
- Integration-focused (real API calls)
- Purpose-built for E2E scenarios

**Existing mocks serve different purposes:**
- Unit test isolation (Vitest mocks)
- Frontend component testing (API contract mocks)
- Integration test helpers (test server utilities)

### ✅ Safe to Proceed

**Next steps:**
1. Continue with phase assertions
2. Create GitHub API mock (no existing equivalent)
3. Create E2E-specific Docker mock
4. Begin writing E2E test specs

**No refactoring needed** - existing mocks and our simulator coexist for different testing layers.

---

**Investigation complete. No duplicated work. Ready to continue implementation.**
