# App Monitor Testing Plan

**Goal:** Achieve 50%+ test coverage on both frontend and backend  
**Focus:** Prevent service start script breakages (the #1 source of failures)  
**Created:** 2025-10-21  
**Status:** Planning Phase

## Problem Analysis

### Current State

- **Backend:** 0% test coverage - NO tests exist
- **Frontend:** 0% test coverage - NO tests exist
- **Critical Failures:** Service start scripts consistently break
- **Root Causes:**
  1. Port conflicts not handled correctly
  2. Docker container state management issues
  3. Process lifecycle edge cases not tested
  4. No validation of service configurations
  5. Error recovery paths untested

### What Keeps Breaking

1. **Port Management** - Ports already in use, failed port cleanup
2. **Docker Services** - Container state detection, attachment vs. new start
3. **Process Lifecycle** - Start/stop race conditions, zombie processes
4. **Configuration** - Invalid paths, missing environment variables
5. **Error Recovery** - Failed starts leave system in bad state

## Testing Strategy

### Phase 1: Backend Critical Path (Target: 50% coverage)

#### Priority 1: Process Manager (40% of effort)

**File:** `app-monitor/backend/src/services/processManager.ts`  
**Why Critical:** This is the core of service management and where most failures occur

**Test Coverage:**

1. **Service Lifecycle Tests**

   ```typescript
   describe("ProcessManager - Service Lifecycle", () => {
     test("starts service successfully with clean ports");
     test("fails gracefully when ports are occupied");
     test("stops running service gracefully (SIGTERM)");
     test("kills unresponsive service (SIGKILL)");
     test("restarts service preserving state");
     test("handles rapid start/stop cycles");
     test("prevents duplicate starts of same service");
     test("cleans up zombie processes on failure");
   });
   ```

2. **Port Conflict Resolution**

   ```typescript
   describe("ProcessManager - Port Conflicts", () => {
     test("detects port conflicts before starting");
     test("kills conflicting processes on occupied ports");
     test("retries after port cleanup");
     test("fails when port cannot be freed");
     test("handles multiple port conflicts");
     test("waits for ports to fully free before starting");
   });
   ```

3. **Docker Service Handling**

   ```typescript
   describe("ProcessManager - Docker Services", () => {
     test("detects existing Docker container");
     test("attaches to running container instead of starting new");
     test("starts new container when none exists");
     test("handles container startup failures");
     test("properly stops Docker containers");
     test("cleans up stopped containers");
     test("handles Docker daemon connection errors");
   });
   ```

4. **Error Recovery**

   ```typescript
   describe("ProcessManager - Error Recovery", () => {
     test("recovers from crashed processes");
     test("reports error status correctly");
     test("allows restart after error");
     test("cleans up resources on error");
     test("emits error events for subscribers");
   });
   ```

5. **Process Event Handling**
   ```typescript
   describe("ProcessManager - Events", () => {
     test("emits status:changed on service start");
     test("emits status:changed on service stop");
     test("emits log events from stdout/stderr");
     test("handles process exit events");
     test("handles process error events");
   });
   ```

#### Priority 2: Port Manager (20% of effort)

**File:** `app-monitor/backend/src/utils/portManager.ts`  
**Why Critical:** Port conflicts are a leading cause of start failures

**Test Coverage:**

```typescript
describe("PortManager", () => {
  describe("Port Detection", () => {
    test("detects when port is in use");
    test("returns false when port is free");
    test("handles invalid port numbers");
    test("handles privileged ports");
  });

  describe("Process Termination", () => {
    test("kills process by port successfully");
    test("handles process that no longer exists");
    test("handles permission denied errors");
    test("verifies port is freed after kill");
    test("waits for graceful termination before force kill");
  });

  describe("Docker Container Management", () => {
    test("detects running Docker container");
    test("gets container PID correctly");
    test("stops container gracefully");
    test("handles container that does not exist");
    test("handles Docker daemon errors");
  });

  describe("Batch Operations", () => {
    test("kills multiple ports simultaneously");
    test("reports partial failures");
    test("handles race conditions in multi-port cleanup");
  });
});
```

#### Priority 3: Service Configuration Validation (15% of effort)

**File:** `app-monitor/backend/src/config.ts`  
**Why Critical:** Invalid configs cause cryptic runtime failures

**Test Coverage:**

```typescript
describe("Service Configuration", () => {
  describe("Configuration Validation", () => {
    test("validates all required config fields");
    test("rejects configs with invalid paths");
    test("rejects configs with invalid ports");
    test("validates environment variables exist");
    test("validates command is executable");
  });

  describe("Path Resolution", () => {
    test("resolves relative paths correctly");
    test("handles missing directories");
    test("validates working directory exists");
    test("handles symlinks");
  });

  describe("Service Definitions", () => {
    test("all services have valid configurations");
    test("no duplicate ports across services");
    test("all referenced scripts exist");
    test("environment variables are set");
  });
});
```

#### Priority 4: API Routes (15% of effort)

**File:** `src/routes/api.ts`

**Test Coverage:**

```typescript
describe("API Routes", () => {
  describe("GET /api/services", () => {
    test("returns all service statuses");
    test("includes correct status fields");
    test("handles no running services");
  });

  describe("POST /api/services/:name/start", () => {
    test("starts service successfully");
    test("returns 409 if already running");
    test("returns 500 on start failure");
    test("includes error details in response");
  });

  describe("POST /api/services/:name/stop", () => {
    test("stops running service");
    test("returns 404 if not running");
    test("handles graceful stop timeout");
  });

  describe("GET /api/ports/status", () => {
    test("returns status for all configured ports");
    test("indicates which ports are in use");
    test("identifies process using each port");
  });

  describe("GET /api/scripts", () => {
    test("returns available scripts");
    test("groups scripts by category");
  });

  describe("POST /api/scripts/:id/execute", () => {
    test("executes script and returns execution ID");
    test("rejects invalid script IDs");
    test("handles concurrent executions");
  });
});
```

#### Priority 5: Log Streaming (10% of effort)

**File:** `src/services/logStreamer.ts`

**Test Coverage:**

```typescript
describe("LogStreamer", () => {
  describe("Log Watching", () => {
    test("starts watching log file");
    test("emits new log lines");
    test("handles file rotation");
    test("handles missing log files");
  });

  describe("Socket.IO Integration", () => {
    test("sends logs to connected clients");
    test("filters logs by service");
    test("handles client disconnection");
  });
});
```

### Phase 2: Frontend Critical Path (Target: 50% coverage)

#### Priority 1: Service Management Hooks (30% of effort)

**File:** `src/hooks/useServices.ts`

**Test Coverage:**

```typescript
describe("useServices", () => {
  test("fetches initial service statuses");
  test("updates status on socket events");
  test("handles connection failures gracefully");
  test("retries failed requests");
  test("handles stale data correctly");

  describe("Service Actions", () => {
    test("startService calls API and updates state");
    test("stopService calls API and updates state");
    test("restartService calls API and updates state");
    test("killService calls API and updates state");
    test("handles action failures with error messages");
  });
});
```

#### Priority 2: Service Card Component (20% of effort)

**File:** `src/components/ServiceCard.tsx`

**Test Coverage:**

```typescript
describe("ServiceCard", () => {
  test("renders service info correctly");
  test("shows running status with green indicator");
  test("shows stopped status with gray indicator");
  test("shows error status with red indicator");
  test("displays port information");
  test("displays PID when running");
  test("displays uptime when running");
  test("disables buttons based on status");

  describe("Actions", () => {
    test("calls onStart when Start clicked");
    test("calls onStop when Stop clicked");
    test("calls onRestart when Restart clicked");
    test("calls onKill when Kill clicked");
    test("disables Start when running");
    test("disables Stop when not running");
  });

  describe("Error Display", () => {
    test("shows error message when status is error");
    test("error message is readable");
  });
});
```

#### Priority 3: Log Viewer Component (25% of effort)

**File:** `src/components/LogsViewer.tsx`

**Test Coverage:**

```typescript
describe("LogsViewer", () => {
  test("renders initial empty state");
  test("displays logs when source selected");
  test("auto-scrolls to bottom on new logs");
  test("filters logs by error level");
  test("handles rapid log influx");

  describe("Source Selection", () => {
    test("loads logs for selected source");
    test("clears logs when source changed");
    test("handles invalid source");
  });

  describe("Filtering", () => {
    test("shows only errors when Errors Only enabled");
    test("shows all logs when filter disabled");
    test("preserves filter state on source change");
  });
});
```

#### Priority 4: Panel Management (15% of effort)

**Files:** `src/components/panels/*.tsx`

**Test Coverage:**

```typescript
describe("Panel Management", () => {
  describe("PanelContainer", () => {
    test("renders multiple panels");
    test("adds new panel");
    test("removes panel");
    test("persists panel configuration");
    test("limits max panels to 6");
  });

  describe("PanelWrapper", () => {
    test("renders panel with toolbar");
    test("handles close button");
    test("passes filters to LogsViewer");
  });
});
```

#### Priority 5: API Client (10% of effort)

**File:** `src/services/api.ts`

**Test Coverage:**

```typescript
describe("API Client", () => {
  describe("Service Endpoints", () => {
    test("healthCheck returns status");
    test("getServices returns array");
    test("startService posts correctly");
    test("stopService posts correctly");
  });

  describe("Error Handling", () => {
    test("handles network errors");
    test("handles 404 responses");
    test("handles 500 responses");
    test("retries on timeout");
  });
});
```

## Test Infrastructure Setup

### Backend Setup

**1. Install Testing Dependencies**

```json
{
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2"
  }
}
```

**2. Create Jest Configuration**

```javascript
// jest.config.js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
  ],
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 45,
      functions: 50,
      lines: 50,
    },
  },
};
```

**3. Add Test Scripts**

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

**4. Create Test Helpers**

```typescript
// src/__tests__/helpers/mockProcess.ts
export function createMockChildProcess() {
  // Mock ChildProcess for testing
}

// src/__tests__/helpers/mockConfig.ts
export function createValidServiceConfig() {
  // Mock ServiceConfig for testing
}

// src/__tests__/helpers/portHelpers.ts
export async function findFreePort() {
  // Find an available port for testing
}
```

### Frontend Setup

**1. Install Testing Dependencies**

```json
{
  "devDependencies": {
    "@testing-library/react": "^14.2.1",
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/user-event": "^14.5.2",
    "@vitest/ui": "^1.2.2",
    "vitest": "^1.2.2",
    "jsdom": "^24.0.0"
  }
}
```

**2. Create Vitest Configuration**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/__tests__/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: ["node_modules/", "src/__tests__/", "**/*.d.ts", "dist/"],
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 50,
        lines: 50,
      },
    },
  },
});
```

**3. Add Test Scripts**

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --coverage"
  }
}
```

**4. Create Test Utilities**

```typescript
// src/__tests__/utils/mockApi.ts
export function createMockApiClient() {
  // Mock axios for testing
}

// src/__tests__/utils/renderWithProviders.tsx
export function renderWithProviders(ui: ReactElement) {
  // Render with all necessary providers
}
```

## Implementation Plan

### Week 1: Backend Foundation (Days 1-5)

#### Day 1: Setup & Port Manager Tests

- [ ] Install Jest and dependencies
- [ ] Create jest.config.js
- [ ] Create test helpers and mocks
- [ ] Write portManager.ts tests (100% coverage goal)
- [ ] Target: 10% overall backend coverage

**Files to Create:**

- `src/__tests__/setup.ts`
- `src/__tests__/helpers/mockProcess.ts`
- `src/__tests__/helpers/portHelpers.ts`
- `src/utils/__tests__/portManager.test.ts`

#### Day 2: Process Manager - Basic Lifecycle

- [ ] Write basic start/stop tests
- [ ] Write process status tests
- [ ] Write getServiceStatus tests
- [ ] Target: 25% overall backend coverage

**Files to Create:**

- `src/services/__tests__/processManager.test.ts`
- `src/__tests__/fixtures/sampleConfigs.ts`

#### Day 3: Process Manager - Edge Cases

- [ ] Write port conflict tests
- [ ] Write Docker handling tests
- [ ] Write error recovery tests
- [ ] Target: 40% overall backend coverage

**Files to Update:**

- `src/services/__tests__/processManager.test.ts` (expand)

#### Day 4: Configuration & API Routes

- [ ] Write config validation tests
- [ ] Write API route tests (with supertest)
- [ ] Write integration tests for start/stop flows
- [ ] Target: 50% overall backend coverage

**Files to Create:**

- `src/__tests__/config.test.ts`
- `src/routes/__tests__/api.test.ts`
- `src/__tests__/integration/serviceLifecycle.test.ts`

#### Day 5: Log Streaming & Refinement

- [ ] Write logStreamer tests
- [ ] Write logWatcher tests
- [ ] Fix any failing tests
- [ ] Generate coverage report
- [ ] Target: 50%+ overall backend coverage (ACHIEVED)

**Files to Create:**

- `src/services/__tests__/logStreamer.test.ts`
- `src/services/__tests__/logWatcher.test.ts`

### Week 2: Frontend Foundation (Days 6-10)

#### Day 6: Setup & Service Hook Tests

- [ ] Install Vitest and dependencies
- [ ] Create vitest.config.ts
- [ ] Create test utilities
- [ ] Write useServices hook tests
- [ ] Target: 15% overall frontend coverage

**Files to Create:**

- `src/__tests__/setup.ts`
- `src/__tests__/utils/mockApi.ts`
- `src/__tests__/utils/renderWithProviders.tsx`
- `src/hooks/__tests__/useServices.test.ts`

#### Day 7: Service Components

- [ ] Write ServiceCard tests
- [ ] Write ServiceGrid tests
- [ ] Write StatusBadge tests
- [ ] Write PortBadge tests
- [ ] Target: 30% overall frontend coverage

**Files to Create:**

- `src/components/__tests__/ServiceCard.test.tsx`
- `src/components/__tests__/ServiceGrid.test.tsx`
- `src/components/__tests__/StatusBadge.test.tsx`
- `src/components/__tests__/PortBadge.test.tsx`

#### Day 8: Log Viewer Components

- [ ] Write LogsViewer tests
- [ ] Write LogLine tests
- [ ] Write LogFilters tests
- [ ] Target: 40% overall frontend coverage

**Files to Create:**

- `src/components/__tests__/LogsViewer.test.tsx`
- `src/components/__tests__/LogLine.test.tsx`
- `src/components/__tests__/LogFilters.test.tsx`

#### Day 9: Panel Management & Hooks

- [ ] Write PanelContainer tests
- [ ] Write useLogStream tests
- [ ] Write usePortStatus tests
- [ ] Target: 48% overall frontend coverage

**Files to Create:**

- `src/components/panels/__tests__/PanelContainer.test.tsx`
- `src/hooks/__tests__/useLogStream.test.ts`
- `src/hooks/__tests__/usePortStatus.test.ts`

#### Day 10: Integration & Refinement

- [ ] Write App.tsx integration tests
- [ ] Write API client tests
- [ ] Fix any failing tests
- [ ] Generate coverage report
- [ ] Target: 50%+ overall frontend coverage (ACHIEVED)

**Files to Create:**

- `src/__tests__/App.test.tsx`
- `src/services/__tests__/api.test.ts`
- `src/__tests__/integration/serviceManagement.test.tsx`

## Critical Test Scenarios

### Scenario 1: Port Conflict on Start

**What Breaks:** Service fails to start because port is already in use

**Test:**

```typescript
test("handles port conflict and kills conflicting process", async () => {
  // 1. Start a process on port 5173
  const blocker = startDummyServer(5173);

  // 2. Try to start frontend-dev service
  const result = await processManager.startService("frontend-dev");

  // 3. Verify blocker was killed
  expect(blocker.killed).toBe(true);

  // 4. Verify service started successfully
  expect(result.status).toBe("running");
  expect(result.ports).toContain(5173);
});
```

### Scenario 2: Docker Container Already Running

**What Breaks:** Trying to start a new container when one exists

**Test:**

```typescript
test("attaches to existing Docker container instead of starting new", async () => {
  // 1. Start Docker container outside of processManager
  await execAsync("docker-compose up -d");

  // 2. Try to start python-worker service
  const result = await processManager.startService("python-worker");

  // 3. Verify it attached, not started new
  expect(result.status).toBe("running");
  expect(dockerPs()).toHaveLength(1); // Still only 1 container
});
```

### Scenario 3: Service Crashes After Start

**What Breaks:** Process starts but crashes immediately

**Test:**

```typescript
test("detects service crash and updates status", async () => {
  // 1. Mock a service that crashes
  const config = createCrashingServiceConfig();

  // 2. Start service
  await processManager.startService("test-service");

  // 3. Wait for crash
  await waitFor(() => {
    const status = processManager.getServiceStatus("test-service");
    expect(status.status).toBe("error");
    expect(status.error).toBeDefined();
  });
});
```

### Scenario 4: Graceful Stop Timeout

**What Breaks:** Service doesn't respond to SIGTERM

**Test:**

```typescript
test("force kills service after graceful stop timeout", async () => {
  // 1. Start service that ignores SIGTERM
  const config = createUnresponsiveServiceConfig();
  await processManager.startService("test-service");

  // 2. Try graceful stop
  const stopPromise = processManager.stopService("test-service", true);

  // 3. Verify it eventually force kills
  const result = await stopPromise;
  expect(result.status).toBe("stopped");
});
```

### Scenario 5: Rapid Start/Stop Cycles

**What Breaks:** Race conditions in state management

**Test:**

```typescript
test("handles rapid start/stop/start cycles", async () => {
  // 1. Start service
  await processManager.startService("frontend-dev");

  // 2. Stop immediately
  await processManager.stopService("frontend-dev");

  // 3. Start again immediately
  const result = await processManager.startService("frontend-dev");

  // 4. Verify clean state
  expect(result.status).toBe("running");
  expect(result.pid).toBeDefined();
});
```

## Test Data & Mocks

### Mock Service Configurations

```typescript
// src/__tests__/fixtures/services.ts
export const mockServices = {
  "simple-node": {
    name: "simple-node",
    displayName: "Simple Node Service",
    command: "node",
    args: ["-e", 'setInterval(() => console.log("running"), 1000)'],
    cwd: "/tmp",
    ports: [9999],
    env: {},
  },
  "failing-service": {
    name: "failing-service",
    displayName: "Failing Service",
    command: "node",
    args: ["-e", "process.exit(1)"],
    cwd: "/tmp",
    ports: [9998],
    env: {},
  },
};
```

### Mock Process Manager

```typescript
// src/__tests__/mocks/mockProcessManager.ts
export class MockProcessManager {
  private services = new Map();

  async startService(name: string) {
    // Controlled mock for frontend testing
  }

  async stopService(name: string) {
    // Controlled mock for frontend testing
  }

  getServiceStatus(name: string) {
    // Return mock status
  }
}
```

## Coverage Goals

### Backend (50% minimum)

| Module            | Lines | Coverage Goal | Priority |
| ----------------- | ----- | ------------- | -------- |
| processManager.ts | ~500  | 60%           | P0       |
| portManager.ts    | ~200  | 80%           | P0       |
| config.ts         | ~100  | 70%           | P1       |
| api.ts            | ~300  | 50%           | P1       |
| logStreamer.ts    | ~200  | 40%           | P2       |
| logWatcher.ts     | ~150  | 40%           | P2       |
| scriptManager.ts  | ~200  | 30%           | P3       |
| logger.ts         | ~100  | 20%           | P3       |

**Total Target:** 50-55% overall coverage

### Frontend (50% minimum)

| Module                     | Coverage Goal | Priority |
| -------------------------- | ------------- | -------- |
| hooks/useServices.ts       | 70%           | P0       |
| hooks/usePortStatus.ts     | 60%           | P0       |
| components/ServiceCard.tsx | 60%           | P1       |
| components/ServiceGrid.tsx | 50%           | P1       |
| components/LogsViewer.tsx  | 60%           | P1       |
| components/LogLine.tsx     | 50%           | P2       |
| services/api.ts            | 70%           | P1       |
| hooks/useLogStream.ts      | 50%           | P2       |
| components/panels/\*       | 40%           | P2       |
| Other components           | 30%           | P3       |

**Total Target:** 50-55% overall coverage

## Test Execution

### Local Development

```bash
# Backend
cd app-monitor/backend
npm test                  # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report

# Frontend
cd app-monitor/frontend
npm test                  # Run all tests (vitest watch by default)
npm run test:coverage    # With coverage report
```

### CI Integration

```yaml
# .github/workflows/app-monitor-tests.yml
name: App Monitor Tests

on:
  pull_request:
    paths:
      - "app-monitor/**"
  push:
    branches:
      - staging
      - main

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: cd app-monitor/backend && npm ci
      - run: cd app-monitor/backend && npm run test:ci
      - run: cd app-monitor/backend && npm run build

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: cd app-monitor/frontend && npm ci
      - run: cd app-monitor/frontend && npm run test:ci
      - run: cd app-monitor/frontend && npm run build
```

## Success Metrics

### Coverage Metrics

- ✅ Backend: ≥50% line coverage
- ✅ Frontend: ≥50% line coverage
- ✅ ProcessManager: ≥60% coverage (highest priority)
- ✅ PortManager: ≥80% coverage (highest priority)

### Quality Metrics

- ✅ All critical service start/stop paths tested
- ✅ Port conflict scenarios covered
- ✅ Docker container management tested
- ✅ Error recovery paths validated
- ✅ No regressions in existing functionality

### Stability Metrics

- ✅ Service starts succeed 95%+ of the time
- ✅ Port conflicts resolve automatically
- ✅ Crashed services can be restarted cleanly
- ✅ UI remains responsive during service operations

## Regression Prevention

### Pre-commit Hooks

```bash
# .husky/pre-commit (for app-monitor changes)
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run tests if app-monitor files changed
git diff --cached --name-only | grep -q '^app-monitor/' && {
  echo "Running app-monitor tests..."
  cd app-monitor/backend && npm test
  cd ../frontend && npm test
}
```

### Code Review Checklist

When reviewing app-monitor PRs:

- [ ] Tests added for new functionality
- [ ] Tests updated for modified code
- [ ] Coverage doesn't decrease
- [ ] Service start/stop manually tested
- [ ] Port conflicts manually tested
- [ ] Error scenarios manually tested

## Maintenance

### Test Maintenance Schedule

- **Weekly:** Review failing tests
- **Bi-weekly:** Update mocks to match real behavior
- **Monthly:** Review coverage and add tests for gaps
- **Per Release:** Run full integration test suite

### Living Documentation

- Update this plan as tests are added
- Track coverage progress in each section
- Document new failure scenarios as discovered
- Add new test scenarios based on production issues

## Risk Mitigation

### High-Risk Areas Requiring Extra Testing

1. **Process Manager startService()** - Most complex, most likely to break
2. **Port conflict resolution** - OS-dependent, timing-sensitive
3. **Docker container detection** - External dependency
4. **Service configuration loading** - Many edge cases
5. **Socket.IO event handling** - Asynchronous, race conditions

### Backup Plans

- If 50% coverage can't be achieved in 2 weeks, focus on P0/P1 modules only
- If tests are flaky, add retry logic and better mocks
- If Docker tests are unstable, skip in CI (mark as manual tests)

## Next Steps

1. **Create GitHub Issue** for this testing initiative
2. **Assign to Worker** (likely Worker B - frontend specialist)
3. **Set up backend testing infrastructure** (Day 1)
4. **Write first batch of tests** (PortManager - Day 1)
5. **Iterate through plan** week by week
6. **Track progress** in issue comments

---

**Estimated Effort:** 10 days (2 weeks)  
**Target Completion:** 2025-11-04  
**Owner:** TBD (Recommend Worker B)  
**Priority:** P1 (High - prevents production issues)

This plan focuses heavily on the service start scripts that keep breaking, while also achieving the 50% coverage goal across both frontend and backend.
