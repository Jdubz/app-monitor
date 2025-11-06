# APP-MONITOR-TEST-3: ProcessManager Comprehensive Tests

**Priority:** P0 (Critical)  
**Type:** Testing  
**Effort:** 2 days  
**Parent:** APP-MONITOR-TEST-1  
**Depends On:** APP-MONITOR-TEST-2  
**Repository:** job-finder-app-manager (app-monitor/backend)

## Problem Statement

ProcessManager is the core service management component and the **#1 source of failures** in app-monitor. Port conflicts, Docker issues, and process lifecycle bugs cause frequent breakages. Without comprehensive tests, these issues repeat.

## Goal

Achieve **60% coverage** on ProcessManager by testing all critical paths including service lifecycle, port conflicts, Docker handling, and error recovery.

## Scope

### Service Lifecycle Tests

- ✅ Start service with clean ports
- ✅ Stop service gracefully (SIGTERM)
- ✅ Kill service forcefully (SIGKILL)
- ✅ Restart service
- ✅ Prevent duplicate starts
- ✅ Handle rapid start/stop cycles
- ✅ Clean up zombie processes

### Port Conflict Resolution

- ✅ Detect port conflicts before starting
- ✅ Kill conflicting processes automatically
- ✅ Retry after port cleanup
- ✅ Fail when port cannot be freed
- ✅ Handle multiple port conflicts
- ✅ Wait for ports to fully free

### Docker Service Handling

- ✅ Detect existing Docker container
- ✅ Attach to running container (don't start new)
- ✅ Start new container when none exists
- ✅ Handle container startup failures
- ✅ Stop Docker containers properly
- ✅ Handle Docker daemon errors

### Error Recovery

- ✅ Recover from crashed processes
- ✅ Report error status correctly
- ✅ Allow restart after error
- ✅ Clean up resources on error
- ✅ Emit error events

### Event System

- ✅ Emit status:changed events
- ✅ Emit log events
- ✅ Handle process exit events
- ✅ Handle process error events

## Acceptance Criteria

### Must Have

- [ ] ProcessManager test suite created
- [ ] All service lifecycle scenarios tested
- [ ] Port conflict scenarios fully covered
- [ ] Docker handling tested (or mocked if no Docker in CI)
- [ ] Error recovery paths validated
- [ ] ProcessManager coverage ≥60%
- [ ] Backend overall coverage ≥40%
- [ ] All tests passing

### Should Have

- [ ] Integration tests for full service lifecycle
- [ ] Performance tests for rapid operations
- [ ] Concurrent operation tests
- [ ] Memory leak detection

## Implementation Details

### Test File: `src/services/__tests__/processManager.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { ProcessManager } from "../processManager.js";
import {
  findFreePort,
  startDummyServer,
} from "../../__tests__/helpers/portHelpers.js";

describe("ProcessManager", () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager();
  });

  afterEach(async () => {
    await manager.cleanupAll();
  });

  describe("Service Lifecycle", () => {
    it("starts service successfully with clean ports", async () => {
      // Test implementation
    });

    it("fails gracefully when ports are occupied", async () => {
      const port = await findFreePort();
      const blocker = await startDummyServer(port);

      try {
        // Configure service to use blocked port
        // Attempt to start
        // Verify error is thrown with clear message
      } finally {
        await blocker.close();
      }
    });

    it("stops running service gracefully", async () => {
      // Start service
      // Stop service
      // Verify process terminated
      // Verify status updated to 'stopped'
    });

    it("kills unresponsive service with SIGKILL", async () => {
      // Start service that ignores SIGTERM
      // Call stopService with force=true
      // Verify process killed
    });

    it("prevents duplicate starts of same service", async () => {
      await manager.startService("test-service");

      // Try to start again
      const result = await manager.startService("test-service");

      expect(result.status).toBe("running");
      // Should not create second process
    });

    it("handles rapid start/stop cycles", async () => {
      await manager.startService("test-service");
      await manager.stopService("test-service");
      const result = await manager.startService("test-service");

      expect(result.status).toBe("running");
      expect(result.pid).toBeDefined();
    });
  });

  describe("Port Conflict Resolution", () => {
    it("detects and resolves port conflicts", async () => {
      // Implementation in test file
    });

    it("handles multiple port conflicts", async () => {
      // Implementation in test file
    });

    it("fails when port cannot be freed", async () => {
      // Implementation in test file
    });
  });

  describe("Docker Services", () => {
    // Note: These may need to be skipped in CI if Docker not available
    it("attaches to existing Docker container", async () => {
      // Implementation in test file
    });

    it("starts new container when none exists", async () => {
      // Implementation in test file
    });
  });

  describe("Error Recovery", () => {
    it("recovers from crashed processes", async () => {
      // Implementation in test file
    });

    it("reports error status correctly", async () => {
      // Implementation in test file
    });
  });

  describe("Events", () => {
    it("emits status:changed on service start", async () => {
      // Implementation in test file
    });

    it("emits status:changed on service stop", async () => {
      // Implementation in test file
    });
  });
});
```

## Test Scenarios (Critical - MUST Test)

### Scenario 1: Port Conflict on Start

```typescript
test("kills blocking process and starts successfully", async () => {
  const port = 5173;
  const blocker = await startDummyServer(port);

  const result = await manager.startService("frontend-dev");

  expect(result.status).toBe("running");
  expect(result.ports).toContain(port);
  expect(blocker.listening).toBe(false); // Killed
});
```

### Scenario 2: Docker Already Running

```typescript
test("attaches to existing container instead of starting new", async () => {
  // Start container externally
  await execAsync("docker-compose -f docker-compose.local-dev.yml up -d");

  const result = await manager.startService("python-worker");

  expect(result.status).toBe("running");
  // Verify only 1 container exists (didn't start a second)
});
```

### Scenario 3: Service Crashes Immediately

```typescript
test("detects crash and updates status to error", async () => {
  // Mock service config that crashes
  const config = createCrashingServiceConfig();

  await manager.startService("crash-test");

  // Wait for crash
  await waitFor(() => {
    const status = manager.getServiceStatus("crash-test");
    expect(status.status).toBe("error");
    expect(status.error).toContain("exit code");
  });
});
```

## Success Metrics

- ✅ ProcessManager coverage ≥60% (target: 65%)
- ✅ Backend overall coverage ≥40%
- ✅ All critical scenarios tested
- ✅ Zero test failures
- ✅ Tests run in <30 seconds

## Risks & Mitigations

**Risk 1:** Docker tests fail in CI

- _Mitigation:_ Make Docker tests conditional, use mocks in CI

**Risk 2:** Port-based tests are flaky

- _Mitigation:_ Use random ports, proper cleanup, retries

**Risk 3:** Process tests timeout

- _Mitigation:_ Set appropriate timeouts (10s), mock slow operations

## Follow-up

- APP-MONITOR-TEST-4 (Config & API tests)
- APP-MONITOR-TEST-5 (Log streaming tests)

---

**Labels:** `app-monitor`, `testing`, `priority-p0`, `backend`, `processmanager`  
**Estimated Points:** 5 (2 days)  
**Assignee:** TBD
